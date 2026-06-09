/**
 * core/store.js — Event bus reativo
 *
 * API:
 *   store.on(event, fn)    → escuta; retorna função de unsub
 *   store.emit(event, data)→ dispara para todos os ouvintes
 *   store.once(event, fn)  → escuta uma única vez
 *   store.on('*', fn)      → wildcard — recebe todos os eventos
 */

class EventBus {
  constructor() { this._subs = new Map(); }

  on(event, fn) {
    if (!this._subs.has(event)) this._subs.set(event, new Set());
    this._subs.get(event).add(fn);
    return () => this._subs.get(event)?.delete(fn); // retorna unsub
  }

  emit(event, data) {
    this._subs.get(event)?.forEach(fn => fn(data));
    this._subs.get('*')?.forEach(fn => fn(event, data));
  }

  once(event, fn) {
    const off = this.on(event, d => { fn(d); off(); });
    return off;
  }
}

export const store = new EventBus();

/* ── Eventos padrão da aplicação ── */
export const EVENTS = {
  /* Dados */
  TRANSACTION_CHANGED : 'txn:changed',
  ORCAMENTO_CHANGED   : 'orc:changed',
  GOAL_CHANGED        : 'goal:changed',

  /* Ciclo de vida */
  DB_READY       : 'db:ready',
  DATA_MIGRATED  : 'data:migrated',
  MODULE_LOADED  : 'module:loaded',
};
