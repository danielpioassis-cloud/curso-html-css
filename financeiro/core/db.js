/**
 * core/db.js — IndexedDB abstraction com sistema de migrations
 *
 * API pública:
 *   db.open()                        → abre o banco e roda migrations pendentes
 *   db.getAll(store, index?, query?) → array de registros
 *   db.get(store, id)                → registro ou null
 *   db.insert(store, record)         → insere com id automático, retorna registro
 *   db.put(store, record)            → atualiza (record deve ter id)
 *   db.delete(store, id)             → remove por id
 *   db.bulkInsert(store, records[])  → insere muitos de uma vez (preserva ids existentes)
 *   db.migrateFromLocalStorage()     → migra dados do fincontrol_v2 (roda 1× apenas)
 */

const DB_NAME    = 'vidadb';
const DB_VERSION = 5;

/* ═══════════════════════════════════
   SCHEMA — adicionar novas stores aqui
   nas próximas fases, incrementando DB_VERSION
   ═══════════════════════════════════ */
function migration_v1(idb) {
  /* ── Financeiro ── */
  const tx = idb.createObjectStore('transactions', { keyPath: 'id' });
  tx.createIndex('by_data',     'data',        { unique: false });
  tx.createIndex('by_tipo',     'tipo',        { unique: false });
  tx.createIndex('by_cat',      'cat',         { unique: false });
  tx.createIndex('by_business', 'business_id', { unique: false });

  idb.createObjectStore('orcamentos', { keyPath: 'id' });

  /* ── Metas universais (fase 1) ── */
  const goals = idb.createObjectStore('goals', { keyPath: 'id' });
  goals.createIndex('by_modulo', 'modulo', { unique: false });
  goals.createIndex('by_status', 'status', { unique: false });

  /* ── Chave/valor: sequências de IDs e flags ── */
  idb.createObjectStore('_meta', { keyPath: 'key' });
}

/* ── v2: Negócios ── */
function migration_v2(idb) {
  idb.createObjectStore('businesses', { keyPath: 'id' });

  const clients = idb.createObjectStore('clients', { keyPath: 'id' });
  clients.createIndex('by_business', 'business_id', { unique: false });

  const products = idb.createObjectStore('products', { keyPath: 'id' });
  products.createIndex('by_business', 'business_id', { unique: false });
}

/* ── v3: Produtividade ── */
function migration_v3(idb) {
  const projects = idb.createObjectStore('projects', { keyPath: 'id' });
  projects.createIndex('by_status', 'status', { unique: false });

  const tasks = idb.createObjectStore('tasks', { keyPath: 'id' });
  tasks.createIndex('by_project',  'project_id', { unique: false });
  tasks.createIndex('by_status',   'status',     { unique: false });
  tasks.createIndex('by_prioridade','prioridade', { unique: false });

  const habits = idb.createObjectStore('habits', { keyPath: 'id' });
  habits.createIndex('by_status', 'status', { unique: false });

  const logs = idb.createObjectStore('habit_logs', { keyPath: 'id' });
  logs.createIndex('by_habit', 'habit_id', { unique: false });
  logs.createIndex('by_data',  'data',     { unique: false });
}

/* ── v4: Investimentos ── */
function migration_v4(idb) {
  const inv = idb.createObjectStore('investments', { keyPath: 'id' });
  inv.createIndex('by_cat', 'categoria', { unique: false });
}

/* ── v5: Contas a pagar ── */
function migration_v5(idb) {
  const contas = idb.createObjectStore('contas', { keyPath: 'id' });
  contas.createIndex('by_status',     'status',     { unique: false });
  contas.createIndex('by_vencimento', 'vencimento', { unique: false });
  contas.createIndex('by_cat',        'categoria',  { unique: false });
}

const MIGRATIONS = { 1: migration_v1, 2: migration_v2, 3: migration_v3, 4: migration_v4, 5: migration_v5 };

/* ═══════════════════════════════════
   Classe principal
   ═══════════════════════════════════ */
class Database {
  constructor() { this._idb = null; }

  /* ── Abertura e upgrade ── */
  open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onupgradeneeded = e => {
        const db = e.target.result;
        for (let v = e.oldVersion + 1; v <= DB_VERSION; v++) {
          MIGRATIONS[v]?.(db, e.target.transaction);
        }
      };

      req.onsuccess  = e => { this._idb = e.target.result; resolve(this); };
      req.onerror    = e => reject(e.target.error);
      req.onblocked  = ()  => console.warn('[DB] bloqueado — feche outras abas');
    });
  }

  /* ── Leitura ── */
  getAll(storeName, indexName = null, query = null) {
    return new Promise((resolve, reject) => {
      const tx     = this._idb.transaction(storeName, 'readonly');
      const store  = tx.objectStore(storeName);
      const source = indexName ? store.index(indexName) : store;
      const req    = query != null ? source.getAll(query) : source.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror   = () => reject(req.error);
    });
  }

  get(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx  = this._idb.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(id);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  }

  /* ── Escrita interna ── */
  _put(storeName, record) {
    return new Promise((resolve, reject) => {
      const tx  = this._idb.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(record);
      req.onsuccess = () => resolve(record);
      req.onerror   = () => reject(req.error);
    });
  }

  /* ── Gestão de sequências ── */
  async _nextId(storeName) {
    const key  = `seq_${storeName}`;
    const meta = await this.get('_meta', key);
    const next = (meta?.value ?? 0) + 1;
    await this._put('_meta', { key, value: next });
    return next;
  }

  async _syncSeq(storeName, records) {
    if (!records.length) return;
    const maxId = Math.max(...records.map(r => r.id ?? 0));
    const key   = `seq_${storeName}`;
    const meta  = await this.get('_meta', key);
    if (!meta || meta.value < maxId) {
      await this._put('_meta', { key, value: maxId });
    }
  }

  /* ── API pública de escrita ── */
  async insert(storeName, record) {
    const id  = await this._nextId(storeName);
    const rec = { ...record, id };
    await this._put(storeName, rec);
    return rec;
  }

  async put(storeName, record) {
    await this._put(storeName, record);
    return record;
  }

  delete(storeName, id) {
    return new Promise((resolve, reject) => {
      const tx  = this._idb.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(id);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  /* ── Inserção em lote (preserva IDs existentes) ── */
  bulkInsert(storeName, records) {
    if (!records.length) return Promise.resolve(0);

    return new Promise((resolve, reject) => {
      const tx     = this._idb.transaction([storeName, '_meta'], 'readwrite');
      const oStore = tx.objectStore(storeName);
      const mStore = tx.objectStore('_meta');
      const seqKey = `seq_${storeName}`;
      let   maxId  = 0;

      records.forEach(r => {
        oStore.put(r);
        if ((r.id ?? 0) > maxId) maxId = r.id;
      });

      const seqReq = mStore.get(seqKey);
      seqReq.onsuccess = () => {
        const cur = seqReq.result?.value ?? 0;
        mStore.put({ key: seqKey, value: Math.max(cur, maxId) });
      };

      tx.oncomplete = () => resolve(records.length);
      tx.onerror    = () => reject(tx.error);
    });
  }

  /* ══════════════════════════════════════════════════
     BACKUP — exportar / importar tudo
     ══════════════════════════════════════════════════ */
  clear(storeName) {
    return new Promise((resolve, reject) => {
      const tx  = this._idb.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).clear();
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  }

  _putAll(storeName, records) {
    return new Promise((resolve, reject) => {
      const tx    = this._idb.transaction(storeName, 'readwrite');
      const store = tx.objectStore(storeName);
      records.forEach(r => store.put(r));
      tx.oncomplete = () => resolve(records.length);
      tx.onerror    = () => reject(tx.error);
    });
  }

  /* Lê todas as stores e devolve um objeto serializável */
  async exportAll() {
    const names  = [...this._idb.objectStoreNames];
    const stores = {};
    for (const n of names) stores[n] = await this.getAll(n);
    return {
      _app:        'LifeControl',
      _dbVersion:  DB_VERSION,
      _exportedAt: new Date().toISOString(),
      stores,
    };
  }

  /* Restaura um backup. Substitui TODOS os dados existentes. */
  async importAll(payload) {
    const stores = payload?.stores ?? payload;
    if (!stores || typeof stores !== 'object') throw new Error('Backup inválido.');
    const names = [...this._idb.objectStoreNames];
    let total = 0;
    for (const n of names) {
      if (!Array.isArray(stores[n])) continue;
      await this.clear(n);
      total += await this._putAll(n, stores[n]);
    }
    return total;
  }

  /* ══════════════════════════════════════════════════
     MIGRAÇÃO DO LOCALSTORAGE → INDEXEDDB
     Executa apenas uma vez (flag ls_migrated em _meta)
     ══════════════════════════════════════════════════ */
  async migrateFromLocalStorage() {
    const flag = await this.get('_meta', 'ls_migrated');
    if (flag?.value) return { migrated: false };

    // Marca como migrado independente do resultado
    await this._put('_meta', { key: 'ls_migrated', value: true });

    const raw = localStorage.getItem('fincontrol_v2');
    if (!raw) return { migrated: false, reason: 'no_data' };

    try {
      const old  = JSON.parse(raw);
      const txns = old.transactions ?? [];
      const orcs = old.orcamentos   ?? [];

      await this.bulkInsert('transactions', txns);
      await this.bulkInsert('orcamentos',   orcs);

      console.log(`[DB] Migrados ${txns.length} lançamentos, ${orcs.length} orçamentos`);
      return { migrated: true, transactions: txns.length, orcamentos: orcs.length };
    } catch (e) {
      console.error('[DB] Falha na migração:', e);
      return { migrated: false, error: e.message };
    }
  }
}

export const db = new Database();
