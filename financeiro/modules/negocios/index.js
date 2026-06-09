/**
 * modules/negocios/index.js  —  Phase 2  (reescrito)
 *
 * Sub-tabs da página: overview · empresas · clientes · produtos · prolabore
 * Modal de dashboard completo por empresa:
 *   geral (KPIs + chart) · transações · clientes · produtos · prolabore
 */

import { db }            from '../../core/db.js';
import { store, EVENTS } from '../../core/store.js';
import { fmt, fmtDate, today, toDate, sumBy, inMonth, toast, uiConfirm, chartDefaults } from '../../core/ui.js';

/* ── cache ── */
let _biz = null, _clients = null, _products = null, _txns = null;
const getBiz      = async () => (_biz      ??= await db.getAll('businesses'));
const getClients  = async () => (_clients  ??= await db.getAll('clients'));
const getProducts = async () => (_products ??= await db.getAll('products'));
const getTxns     = async () => (_txns     ??= await db.getAll('transactions'));
const invalidate  = ()  => { _biz = _clients = _products = _txns = null; };

const BIZ_TYPES  = ['MEI','ME','LTDA','SA','Autônomo','Freelance','Outro'];
const BIZ_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#f43f5e','#06b6d4','#ec4899'];
const el = id => document.getElementById(id);

const CATS_RECEITA = ['Venda de Produto','Prestação de Serviço','Consultoria','Mensalidade/Assinatura','Comissão','Licença/Royalties','Adiantamento','Outros'];
const CATS_DESPESA = ['Fornecedor','Salários/CLT','Pró Labore','Aluguel','Marketing/Publicidade','Software/SaaS','Equipamentos','Impostos/Taxas','Contabilidade','Logística','Outros'];
const ALL_CATS = [...new Set([...CATS_RECEITA, ...CATS_DESPESA])].sort();

/* ════════════════════════════════════════
   SEED
   ════════════════════════════════════════ */
export async function seedNegociosDemo() {
  if ((await db.getAll('businesses')).length) return;
  const b1 = await db.insert('businesses', { nome:'Kalashii Dev', tipo:'MEI', descricao:'Desenvolvimento web e apps', cor:'#3b82f6', pro_labore:4500, criadaEm: today() });
  const b2 = await db.insert('businesses', { nome:'Consultoria Digital', tipo:'Autônomo', descricao:'Mentoria e consultoria tech', cor:'#8b5cf6', pro_labore:3000, criadaEm: today() });
  await db.insert('clients', { business_id:b1.id, nome:'Ana Lima',    email:'ana@empresa.com',         tel:'(11) 99999-1111', obs:'' });
  await db.insert('clients', { business_id:b1.id, nome:'Carlos Melo', email:'c.melo@startup.io',       tel:'(11) 99999-2222', obs:'Projeto e-commerce' });
  await db.insert('clients', { business_id:b2.id, nome:'Tech Corp',   email:'contato@techcorp.com.br', tel:'(21) 3000-0001', obs:'' });
  await db.insert('products', { business_id:b1.id, nome:'Site Institucional', tipo:'servico', preco:2500, unidade:'projeto', obs:'' });
  await db.insert('products', { business_id:b1.id, nome:'Landing Page',       tipo:'servico', preco:900,  unidade:'página',  obs:'' });
  await db.insert('products', { business_id:b1.id, nome:'Manutenção Mensal',  tipo:'servico', preco:350,  unidade:'mês',     obs:'' });
  await db.insert('products', { business_id:b2.id, nome:'Mentoria 1:1',       tipo:'servico', preco:450,  unidade:'hora',    obs:'' });
  invalidate();
}

/* ════════════════════════════════════════
   PÁGINA PRINCIPAL
   ════════════════════════════════════════ */
let _tab = 'overview';

export async function renderNegocios() {
  _syncTabs();
  if (_tab === 'overview')    await _renderOverview();
  if (_tab === 'empresas')    await _renderEmpresas();
  if (_tab === 'clientes')    await _renderClientes();
  if (_tab === 'produtos')    await _renderProdutos();
  if (_tab === 'prolabore')   await _renderProLabore();
  if (_tab === 'financeiro')  await _renderFinanceiro();
}

function _syncTabs() {
  document.querySelectorAll('.biz-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _tab));
  ['overview','empresas','clientes','produtos','prolabore','financeiro'].forEach(t => {
    const p = el(`biz-panel-${t}`);
    if (p) p.style.display = t === _tab ? '' : 'none';
  });
}

/* ── Visão Geral ── */
async function _renderOverview() {
  const biz  = await getBiz();
  const txns = await getTxns();
  const bizRec = sumBy(txns.filter(t => t.business_id && t.tipo==='receita'), 'valor');
  const bizDes = sumBy(txns.filter(t => t.business_id && t.tipo==='despesa'), 'valor');

  el('biz-kpi-empresas').textContent = biz.length;
  el('biz-kpi-receita').textContent  = fmt(bizRec);
  el('biz-kpi-despesa').textContent  = fmt(bizDes);
  el('biz-kpi-lucro').textContent    = fmt(bizRec - bizDes);

  const grid = el('bizDreGrid');
  if (!biz.length) {
    grid.innerHTML = `<div class="goals-empty" style="grid-column:1/-1"><div class="goals-empty__icon">💼</div><p class="goals-empty__title">Nenhuma empresa cadastrada</p><button class="btn btn--primary" onclick="window._biz.switchTab('empresas')">+ Cadastrar empresa</button></div>`;
    return;
  }

  grid.innerHTML = biz.map(b => {
    const bt  = txns.filter(t => t.business_id === b.id);
    const rec = sumBy(bt.filter(t=>t.tipo==='receita'), 'valor');
    const des = sumBy(bt.filter(t=>t.tipo==='despesa'), 'valor');
    const luc = rec - des;
    const mar = rec > 0 ? ((luc/rec)*100).toFixed(1)+'%' : '—';
    return `
      <div class="biz-card biz-card--clickable" onclick="window._biz.openDashboard(${b.id})">
        <div class="biz-card__header" style="border-left:3px solid ${b.cor}">
          <div>
            <h4 class="biz-card__name">${b.nome}</h4>
            <span class="biz-type-badge">${b.tipo}</span>
          </div>
          <div onclick="event.stopPropagation()">
            <button class="btn-icon" onclick="window._biz.editBiz(${b.id})">✏️</button>
            <button class="btn-icon del" onclick="window._biz.deleteBiz(${b.id})">🗑️</button>
          </div>
        </div>
        <div class="biz-dre">
          <div class="biz-dre__row"><span>Receitas</span><span class="val-green">${fmt(rec)}</span></div>
          <div class="biz-dre__row"><span>Despesas</span><span class="val-red">-${fmt(des)}</span></div>
          ${luc > 0 ? `<div class="biz-dre__row biz-dre__row--prolabore">
            <span>Pró Labore <small>(20% lucro)</small></span>
            <span class="val-blue">${fmt(luc * 0.2)}</span>
          </div>` : ''}
          <div class="biz-dre__row biz-dre__row--luc"><span>Lucro líquido</span><span class="${luc>=0?'val-green':'val-red'}">${fmt(luc)}</span></div>
          <div class="biz-dre__row"><span>Margem</span><span style="color:var(--text2)">${mar}</span></div>
          <div class="biz-dre__row"><span>Transações</span><span style="color:var(--text2)">${bt.length}</span></div>
        </div>
        ${b.descricao ? `<p class="biz-card__desc">${b.descricao}</p>` : ''}
        <div class="biz-card__open-hint">Clique para abrir o dashboard →</div>
      </div>`;
  }).join('');
}

/* ── Empresas ── */
async function _renderEmpresas() {
  const biz = await getBiz();
  el('bizEmpresasList').innerHTML = biz.map(b => `
    <tr>
      <td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${b.cor};margin-right:.4rem;vertical-align:middle"></span><strong style="color:var(--text)">${b.nome}</strong></td>
      <td>${b.tipo}</td>
      <td style="color:var(--text3)">${b.descricao||'—'}</td>
      <td class="val-green">${b.pro_labore ? fmt(b.pro_labore)+'/mês' : '—'}</td>
      <td>
        <button class="btn-icon" onclick="window._biz.editBiz(${b.id})">✏️</button>
        <button class="btn-icon del" onclick="window._biz.deleteBiz(${b.id})">🗑️</button>
      </td>
    </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:2rem">Nenhuma empresa</td></tr>';
}

/* ── Clientes — SQL view ── */
let _clientSort = 'nome';
let _clientSortDir = 'asc';

async function _renderClientes() {
  const biz     = await getBiz();
  const clients = await getClients();
  const sel     = el('bizClientFilter').value;
  const q       = (el('sqlClientQuery')?.value ?? '').toLowerCase().trim();

  /* Atualiza filtro empresa */
  const selEl = el('bizClientFilter');
  const curVal = selEl.value;
  selEl.innerHTML = '<option value="">ANY</option>' +
    biz.map(b => `<option value="${b.id}">${b.nome}</option>`).join('');
  selEl.value = curVal;

  /* Filtra */
  let rows = sel ? clients.filter(c => String(c.business_id) === sel) : [...clients];
  if (q) rows = rows.filter(c =>
    (c.nome?.toLowerCase().includes(q)) ||
    (c.email?.toLowerCase().includes(q)) ||
    (c.tel?.includes(q))
  );

  /* Sort */
  rows.sort((a, b) => {
    let va = _clientSort === 'empresa'
      ? (biz.find(x=>x.id===a.business_id)?.nome ?? '')
      : (a[_clientSort] ?? '');
    let vb = _clientSort === 'empresa'
      ? (biz.find(x=>x.id===b.business_id)?.nome ?? '')
      : (b[_clientSort] ?? '');
    return _clientSortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
  });

  /* Conta */
  el('sqlClientCount').textContent = `${rows.length} row${rows.length !== 1 ? 's' : ''} returned`;

  /* Sort header arrows */
  document.querySelectorAll('.sql-th.sortable').forEach(th => {
    th.classList.remove('sort-asc','sort-desc');
    if (th.dataset.col === _clientSort) th.classList.add(`sort-${_clientSortDir}`);
    th.querySelector('.sort-arrow').textContent = th.dataset.col === _clientSort
      ? (_clientSortDir === 'asc' ? '↑' : '↓') : '↕';
  });

  /* Renderiza */
  el('bizClientesList').innerHTML = rows.map(c => {
    const bn  = biz.find(b=>b.id===c.business_id);
    const dot = bn ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:${bn.cor};margin-right:.35rem"></span>` : '';
    return `<tr>
      <td style="font-weight:500;color:var(--text)">${c.nome}</td>
      <td style="color:var(--text3)">${c.email||'<span style="color:#334155">NULL</span>'}</td>
      <td style="color:var(--text3)">${c.tel||'<span style="color:#334155">NULL</span>'}</td>
      <td>${dot}<span style="font-size:.82rem">${bn?.nome??'—'}</span></td>
      <td style="color:var(--text3);font-size:.8rem">${c.obs||'<span style="color:#334155">NULL</span>'}</td>
      <td>
        <button class="btn-icon" onclick="window._biz.editClient(${c.id})">✏️</button>
        <button class="btn-icon del" onclick="window._biz.deleteClient(${c.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="6" style="text-align:center;color:#334155;padding:2rem;font-family:'Courier New',monospace;font-size:.8rem">Empty set (0 rows)</td></tr>`;

  /* Guarda para export */
  el('bizClientesList')._exportData = { rows, biz };
}

function _exportClientCSV() {
  const data = el('bizClientesList')._exportData;
  if (!data) return;
  const { rows, biz } = data;
  const header = ['id','nome','email','telefone','empresa','obs'];
  const lines  = rows.map(c => [
    c.id,
    `"${c.nome}"`,
    c.email || '',
    c.tel || '',
    `"${biz.find(b=>b.id===c.business_id)?.nome??''}"`,
    `"${c.obs||''}"`,
  ].join(','));
  const blob = new Blob([[header.join(','), ...lines].join('\n')], { type:'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href:url, download:`clientes_${today()}.csv` });
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
  toast('✅ CSV exportado!', 'success');
}

/* ── Produtos ── */
async function _renderProdutos() {
  const biz      = await getBiz();
  const products = await getProducts();
  const sel      = el('bizProdFilter').value;

  el('bizProdFilter').innerHTML = '<option value="">Todas as empresas</option>' +
    biz.map(b => `<option value="${b.id}" ${String(b.id)===sel?'selected':''}>${b.nome}</option>`).join('');

  const filtered = sel ? products.filter(p => String(p.business_id) === sel) : products;
  el('bizProdutosList').innerHTML = filtered.map(p => {
    const bn = biz.find(b=>b.id===p.business_id)?.nome ?? '—';
    return `<tr>
      <td style="color:var(--text);font-weight:500">${p.nome}</td>
      <td><span class="badge badge--${p.tipo==='servico'?'receita':'despesa'}">${p.tipo}</span></td>
      <td class="val-green">${fmt(p.preco)} / ${p.unidade}</td>
      <td>${bn}</td>
      <td>
        <button class="btn-icon" onclick="window._biz.editProduct(${p.id})">✏️</button>
        <button class="btn-icon del" onclick="window._biz.deleteProduct(${p.id})">🗑️</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:2rem">Nenhum produto</td></tr>';
}

/* ── Pró Labore ── */
async function _renderProLabore() {
  const biz  = await getBiz();
  const txns = await getTxns();
  const grid = el('bizProLaboreGrid');

  if (!biz.length) {
    grid.innerHTML = `<div class="goals-empty" style="grid-column:1/-1"><div class="goals-empty__icon">🏢</div><p class="goals-empty__title">Nenhuma empresa cadastrada</p></div>`;
    return;
  }

  const now      = new Date();
  const mesAtual = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  grid.innerHTML = biz.map(b => {
    const hist         = txns.filter(t => t.desc?.startsWith('Pró Labore - ' + b.nome)).sort((a,x)=>x.data.localeCompare(a.data));
    const jaRegistrado = hist.some(t => t.data.startsWith(mesAtual));
    const proLabore    = b.pro_labore ?? 0;
    return `
      <div class="biz-card">
        <div class="biz-card__header" style="border-left:3px solid ${b.cor}">
          <div><h4 class="biz-card__name">${b.nome}</h4><span class="biz-type-badge">${b.tipo}</span></div>
        </div>
        <div style="padding:1rem">
          <div class="form-group" style="margin-bottom:.75rem">
            <label class="form-label" style="font-size:.75rem">Pró Labore Mensal (R$)</label>
            <div style="display:flex;gap:.5rem;align-items:center">
              <input type="number" class="input" id="pl-${b.id}" value="${proLabore}" step="0.01" min="0" style="max-width:160px" />
              <button class="btn btn--ghost btn--sm" onclick="window._biz.saveProLabore(${b.id})">Salvar</button>
            </div>
          </div>
          <button class="btn ${jaRegistrado?'btn--ghost':'btn--primary'} btn--sm" onclick="window._biz.registrarProLabore(${b.id})" ${jaRegistrado?'disabled':''}>
            ${jaRegistrado ? '✅ Registrado este mês' : '💰 Registrar no Financeiro'}
          </button>
          ${hist.length ? `<div style="margin-top:.75rem;display:flex;flex-direction:column;gap:.25rem">
            <p style="font-size:.7rem;color:var(--text3);margin:0">Últimos registros:</p>
            ${hist.slice(0,3).map(t=>`<div style="display:flex;justify-content:space-between;font-size:.75rem"><span style="color:var(--text3)">${fmtDate(t.data)}</span><span class="val-green">${fmt(t.valor)}</span></div>`).join('')}
          </div>` : ''}
        </div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════
   LANÇAMENTOS (financeiro do negócio)
   ════════════════════════════════════════ */
let _finFilter = { bizId: '', tipo: '', cat: '', q: '', mes: '' };

async function _renderFinanceiro() {
  const biz   = await getBiz();
  const txns  = await getTxns();

  /* Preenche filtros */
  _syncFinFilters(biz);

  /* Aplica filtros */
  let items = txns.filter(t => t.business_id != null);
  if (_finFilter.bizId) items = items.filter(t => String(t.business_id) === _finFilter.bizId);
  if (_finFilter.tipo)  items = items.filter(t => t.tipo === _finFilter.tipo);
  if (_finFilter.cat)   items = items.filter(t => t.cat  === _finFilter.cat);
  if (_finFilter.mes)   items = items.filter(t => t.data?.startsWith(_finFilter.mes));
  if (_finFilter.q)     items = items.filter(t => t.desc?.toLowerCase().includes(_finFilter.q.toLowerCase()));
  items = items.sort((a,b) => b.data.localeCompare(a.data));

  /* KPIs */
  const rec  = sumBy(items.filter(t=>t.tipo==='receita'), 'valor');
  const des  = sumBy(items.filter(t=>t.tipo==='despesa'), 'valor');
  const saldo = rec - des;
  el('fin-kpi-rec').textContent   = fmt(rec);
  el('fin-kpi-des').textContent   = fmt(des);
  el('fin-kpi-saldo').textContent = fmt(saldo);
  el('fin-kpi-qtd').textContent   = items.length;
  el('fin-kpi-saldo').className   = 'kpi-card__value ' + (saldo >= 0 ? 'val-green' : 'val-red');

  /* Mini chart — receitas vs despesas por mês (últimos 6m) */
  _renderFinChart(txns.filter(t => t.business_id != null && (!_finFilter.bizId || String(t.business_id)===_finFilter.bizId)));

  /* Tabela */
  const tbody = el('finTxnBody');
  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:var(--text3);padding:2.5rem">
      Nenhum lançamento encontrado.
      <button class="btn btn--primary btn--sm" style="margin-left:.75rem" onclick="window._biz.openFinModal()">+ Adicionar agora</button>
    </td></tr>`;
    return;
  }
  tbody.innerHTML = items.map(t => {
    const b   = biz.find(x=>x.id===t.business_id);
    const dot = b ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${b.cor};margin-right:.35rem;flex-shrink:0"></span>` : '';
    return `<tr>
      <td style="white-space:nowrap">${fmtDate(t.data)}</td>
      <td>
        <div style="display:flex;align-items:center;gap:.25rem">${dot}
          <span style="color:var(--text);font-weight:500">${t.desc}</span>
        </div>
        ${t.obs ? `<div style="font-size:.72rem;color:var(--text3);margin-top:.15rem">${t.obs}</div>` : ''}
      </td>
      <td><span class="badge badge--cat">${t.cat}</span></td>
      <td>${b ? `<span style="font-size:.8rem;color:var(--text2)">${b.nome}</span>` : '—'}</td>
      <td><span class="badge badge--${t.tipo}">${t.tipo==='receita'?'Receita':'Despesa'}</span></td>
      <td class="${t.tipo==='receita'?'val-green':'val-red'}" style="font-weight:600;white-space:nowrap">
        ${t.tipo==='receita'?'+':'-'}${fmt(t.valor)}
      </td>
      <td>
        <button class="btn-icon" onclick="window._biz.editFinTxn(${t.id})" title="Editar">✏️</button>
        <button class="btn-icon del" onclick="window._biz.deleteFinTxn(${t.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function _syncFinFilters(biz) {
  const selBiz = el('finFilterBiz');
  if (!selBiz) return;
  const cur = selBiz.value;
  selBiz.innerHTML = '<option value="">Todas as empresas</option>' +
    biz.map(b=>`<option value="${b.id}" ${String(b.id)===cur?'selected':''}>${b.nome}</option>`).join('');
  selBiz.value = _finFilter.bizId;

  const catSel = el('finFilterCat');
  if (catSel && !catSel.dataset.seeded) {
    catSel.innerHTML = '<option value="">Todas as categorias</option>' +
      ALL_CATS.map(c=>`<option>${c}</option>`).join('');
    catSel.dataset.seeded = '1';
  }
}

let _finChart = null;
function _renderFinChart(txns) {
  const canvas = el('chartFinNeg');
  if (!canvas) return;
  const now    = new Date();
  const labels = [], recs = [], dess = [];
  for (let i = 5; i >= 0; i--) {
    const d  = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mt = txns.filter(t => inMonth(t.data, d.getMonth(), d.getFullYear()));
    labels.push(d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}));
    recs.push(sumBy(mt.filter(t=>t.tipo==='receita'),'valor'));
    dess.push(sumBy(mt.filter(t=>t.tipo==='despesa'),'valor'));
  }
  _finChart?.destroy();
  _finChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: { labels, datasets: [
      { label:'Receitas', data:recs, backgroundColor:'rgba(16,185,129,.75)', borderRadius:5, borderSkipped:false },
      { label:'Despesas', data:dess, backgroundColor:'rgba(244,63,94,.75)',  borderRadius:5, borderSkipped:false },
    ]},
    options: { ...chartDefaults,
      plugins: { ...chartDefaults.plugins,
        legend: { display:true, labels:{ color:'#64748b', font:{family:'Inter',size:11} } } },
    },
  });
}

/* ── Modal lançamento ── */
async function openFinModal(id = null, tipoPreset = null) {
  const biz = await getBiz();
  el('finTxnModalTitle').textContent = id ? 'Editar Lançamento' : 'Novo Lançamento';
  el('finTxnEditId').value = id ?? '';

  /* Empresa select */
  el('finTxnBiz').innerHTML = '<option value="">Selecione a empresa</option>' +
    biz.map(b=>`<option value="${b.id}">${b.nome}</option>`).join('');

  const _setTipo = async t => {
    el('finTxnTipo').value = t;
    const r = el(t === 'receita' ? 'finTxnTipoReceita' : 'finTxnTipoDespesa');
    if (r) r.checked = true;
    _updateFinCats(t);
    await _updateProdutoSelector(el('finTxnBiz').value, t);
  };

  if (id) {
    const t = (await getTxns()).find(x=>x.id===id);
    if (!t) return;
    el('finTxnDesc').value  = t.desc;
    el('finTxnValor').value = t.valor;
    el('finTxnData').value  = t.data;
    el('finTxnBiz').value   = t.business_id ?? '';
    el('finTxnObs').value   = t.obs ?? '';
    await _setTipo(t.tipo);
    el('finTxnCat').value   = t.cat;
  } else {
    el('finTxnForm').reset();
    el('finTxnData').value  = today();
    const bizId = _finFilter.bizId || '';
    el('finTxnBiz').value   = bizId;
    await _setTipo(tipoPreset || 'receita');
  }
  el('modalBizTxn').classList.add('open');
}

function _updateFinCats(tipo) {
  const cats = tipo === 'receita' ? CATS_RECEITA : CATS_DESPESA;
  const cur  = el('finTxnCat').value;
  el('finTxnCat').innerHTML = cats.map(c=>`<option ${c===cur?'selected':''}>${c}</option>`).join('');
}

async function _updateProdutoSelector(bizId, tipo) {
  const wrap = el('finTxnProdutoWrap');
  if (!wrap) return;

  if (tipo !== 'receita' || !bizId) {
    wrap.style.display = 'none';
    return;
  }

  const products = (await getProducts()).filter(p => String(p.business_id) === String(bizId));
  const hint     = el('finTxnProdutoHint');

  if (!products.length) {
    wrap.style.display = '';
    el('finTxnProduto').innerHTML = '<option value="">⚠️ Nenhum produto cadastrado para esta empresa</option>';
    if (hint) hint.innerHTML = `<a href="#" onclick="window._biz.switchTab('produtos');document.getElementById('modalBizTxn').classList.remove('open');" style="color:var(--accent)">→ Cadastre produtos primeiro</a>`;
    el('finTxnSave').disabled = true;
    return;
  }

  el('finTxnSave').disabled = false;
  el('finTxnProduto').innerHTML =
    '<option value="">Selecione um produto…</option>' +
    products.map(p => `<option value="${p.id}" data-preco="${p.preco}" data-nome="${p.nome}" data-tipo="${p.tipo}">${p.nome} — ${fmt(p.preco)}/${p.unidade||'un'}</option>`).join('');
  if (hint) hint.textContent = '';
  wrap.style.display = '';
}

const closeFinModal = () => el('modalBizTxn').classList.remove('open');

async function saveFinTxn() {
  const tipo       = el('finTxnTipo').value;
  const business_id= parseInt(el('finTxnBiz').value) || null;
  const editId     = el('finTxnEditId').value;

  if (!business_id) { toast('Selecione a empresa.', 'error'); return; }

  /* Receita: deve ter produto selecionado */
  let desc, valor;
  if (tipo === 'receita' && !editId) {
    const prodSel = el('finTxnProduto');
    const prodId  = prodSel?.value;
    if (!prodId) { toast('Selecione um produto/serviço para registrar a venda.', 'error'); return; }
    const opt    = prodSel.options[prodSel.selectedIndex];
    const qtd    = parseFloat(el('finTxnQtd')?.value) || 1;
    const preco  = parseFloat(opt.dataset.preco);
    desc  = el('finTxnDesc').value.trim() || `${qtd > 1 ? qtd+'x ' : ''}${opt.dataset.nome}`;
    valor = preco * qtd;
    el('finTxnDesc').value  = desc;
    el('finTxnValor').value = valor;
  } else {
    desc  = el('finTxnDesc').value.trim();
    valor = parseFloat(el('finTxnValor').value);
  }

  const cat  = el('finTxnCat').value;
  const data = el('finTxnData').value;
  const obs  = el('finTxnObs').value.trim();

  if (!desc || isNaN(valor) || !data) {
    toast('Preencha descrição, valor e data.', 'error'); return;
  }
  const rec = { desc, valor, tipo, cat, data, business_id, obs };

  if (editId) {
    await db.put('transactions', { ...rec, id: parseInt(editId) });
    toast('Lançamento atualizado!', 'success');
  } else {
    await db.insert('transactions', rec);
    toast(`${tipo==='receita'?'✅ Venda':'💸 Despesa'} registrada!`, 'success');
  }
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  closeFinModal();
  await renderNegocios();
}

export async function editFinTxn(id)   { await openFinModal(id); }
export async function deleteFinTxn(id) {
  await db.delete('transactions', id);
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  toast('Lançamento removido.', 'info');
  await renderNegocios();
}

async function deleteAllBizTxns() {
  const bizId = _finFilter.bizId;
  const biz   = await getBiz();
  const label = bizId
    ? `"${biz.find(b=>String(b.id)===bizId)?.nome ?? 'empresa'}" (filtro atual)`
    : 'TODAS as empresas';

  const ok = await uiConfirm(
    `Isso irá excluir todos os lançamentos de ${label}. Esta ação não pode ser desfeita.`,
    { title: '⚠️ Excluir lançamentos?', okLabel: 'Sim, excluir tudo', danger: true }
  );
  if (!ok) return;

  let items = await getTxns();
  items = items.filter(t => t.business_id != null);
  if (bizId) items = items.filter(t => String(t.business_id) === bizId);
  for (const t of items) await db.delete('transactions', t.id);
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  toast(`🗑️ ${items.length} lançamentos excluídos.`, 'info', 4000);
  await renderNegocios();
}

/* ════════════════════════════════════════
   DASHBOARD POR EMPRESA (modal)
   ════════════════════════════════════════ */
let _dashBizId  = null;
let _dashTab    = 'geral';
let _dashChart  = null;

export async function openDashboard(bizId) {
  _dashBizId = bizId;
  _dashTab   = 'geral';
  const b    = (await getBiz()).find(x => x.id === bizId);
  if (!b) return;

  el('dashDot').style.background   = b.cor;
  el('dashCompanyTitle').textContent = b.nome;
  el('dashCompanyType').textContent  = b.tipo;
  if (b.descricao) el('dashCompanyDesc').textContent = b.descricao;

  el('modalCompanyDash').classList.add('open');
  await _renderDashTab('geral');
}

const closeDashboard = () => {
  el('modalCompanyDash').classList.remove('open');
  _dashChart?.destroy(); _dashChart = null;
};

async function _renderDashTab(tab) {
  _dashTab = tab;
  document.querySelectorAll('.dash-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  ['geral','txns','clients','products','prolabore'].forEach(t => {
    const p = el(`dash-panel-${t}`);
    if (p) p.style.display = t === tab ? '' : 'none';
  });
  const b = (await getBiz()).find(x => x.id === _dashBizId);
  if (!b) return;
  if (tab === 'geral')     await _dashGeral(b);
  if (tab === 'txns')      await _dashTxns(b);
  if (tab === 'clients')   await _dashClients(b);
  if (tab === 'products')  await _dashProducts(b);
  if (tab === 'prolabore') await _dashProLabore(b);
}

async function _dashGeral(b) {
  const txns = (await getTxns()).filter(t => t.business_id === b.id);
  const rec  = sumBy(txns.filter(t=>t.tipo==='receita'), 'valor');
  const des  = sumBy(txns.filter(t=>t.tipo==='despesa'), 'valor');
  const luc  = rec - des;
  const mar  = rec > 0 ? ((luc/rec)*100).toFixed(1)+'%' : '—';

  el('dashRec').textContent = fmt(rec);
  el('dashDes').textContent = fmt(des);
  el('dashLuc').textContent = fmt(luc);
  el('dashMar').textContent = mar;
  el('dashLuc').className   = 'kpi-card__value ' + (luc >= 0 ? 'val-green' : 'val-red');

  /* Gráfico ultimos 6 meses */
  const now = new Date();
  const labels=[], recs=[], dess=[];
  for (let i=5;i>=0;i--) {
    const d  = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const mt = txns.filter(t => inMonth(t.data, d.getMonth(), d.getFullYear()));
    labels.push(d.toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}));
    recs.push(sumBy(mt.filter(t=>t.tipo==='receita'),'valor'));
    dess.push(sumBy(mt.filter(t=>t.tipo==='despesa'),'valor'));
  }
  _dashChart?.destroy();
  _dashChart = new Chart(el('chartCompanyDash').getContext('2d'), {
    type:'bar',
    data:{ labels, datasets:[
      { label:'Receitas', data:recs, backgroundColor:'rgba(16,185,129,.7)', borderRadius:5, borderSkipped:false },
      { label:'Despesas', data:dess, backgroundColor:'rgba(244,63,94,.7)',  borderRadius:5, borderSkipped:false },
    ]},
    options: chartDefaults,
  });
}

async function _dashTxns(b) {
  const txns = (await getTxns()).filter(t=>t.business_id===b.id).sort((a,x)=>toDate(x.data)-toDate(a.data));
  el('dashTxnsBody').innerHTML = txns.map(t => `<tr>
    <td>${fmtDate(t.data)}</td>
    <td style="color:var(--text)">${t.desc}</td>
    <td>${t.cat}</td>
    <td><span class="badge badge--${t.tipo}">${t.tipo}</span></td>
    <td class="${t.tipo==='receita'?'val-green':'val-red'}">${t.tipo==='receita'?'+':'-'}${fmt(t.valor)}</td>
  </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:1.5rem">Nenhuma transação vinculada</td></tr>';
}

async function _dashClients(b) {
  const clients = (await getClients()).filter(c=>c.business_id===b.id);
  el('dashClientsBody').innerHTML = clients.map(c=>`<tr>
    <td style="color:var(--text)">${c.nome}</td>
    <td style="color:var(--text3)">${c.email||'—'}</td>
    <td style="color:var(--text3)">${c.tel||'—'}</td>
    <td style="color:var(--text3)">${c.obs||'—'}</td>
  </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:1.5rem">Nenhum cliente</td></tr>';
}

async function _dashProducts(b) {
  const products = (await getProducts()).filter(p=>p.business_id===b.id);
  el('dashProductsBody').innerHTML = products.map(p=>`<tr>
    <td style="color:var(--text);font-weight:500">${p.nome}</td>
    <td><span class="badge badge--${p.tipo==='servico'?'receita':'despesa'}">${p.tipo}</span></td>
    <td class="val-green">${fmt(p.preco)}</td>
    <td style="color:var(--text3)">${p.unidade}</td>
    <td style="color:var(--text3)">${p.obs||'—'}</td>
  </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text3);padding:1.5rem">Nenhum produto</td></tr>';
}

async function _dashProLabore(b) {
  el('dashProLaboreVal').value = b.pro_labore ?? 0;
  const txns     = (await getTxns()).filter(t=>t.desc?.startsWith('Pró Labore - '+b.nome)).sort((a,x)=>x.data.localeCompare(a.data));
  const mesAtual = new Date().toISOString().slice(0,7);
  const jaReg    = txns.some(t=>t.data.startsWith(mesAtual));

  el('dashPLBtnWrap').innerHTML = `
    <button class="btn ${jaReg?'btn--ghost':'btn--primary'}" id="btnDashRegPL" ${jaReg?'disabled':''}>
      ${jaReg ? '✅ Já registrado este mês' : '💰 Registrar Pró Labore do Mês'}
    </button>`;
  if (!jaReg) el('btnDashRegPL').addEventListener('click', () => registrarProLabore(b.id, true));

  const rows = txns.slice(0,8).map(t=>`<tr>
    <td>${fmtDate(t.data)}</td>
    <td class="val-green">${fmt(t.valor)}</td>
    <td style="color:var(--text3)">${t.desc}</td>
  </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:1rem">Nenhum registro</td></tr>';
  el('dashPLHistory').innerHTML = `<table class="table"><thead><tr><th>Data</th><th>Valor</th><th>Descrição</th></tr></thead><tbody>${rows}</tbody></table>`;
}

async function saveProLaboreDash() {
  const val = parseFloat(el('dashProLaboreVal').value) || 0;
  const b   = (await getBiz()).find(x=>x.id===_dashBizId);
  if (!b) return;
  await db.put('businesses', { ...b, pro_labore: val });
  invalidate();
  toast('Pró Labore atualizado!', 'success');
}

export async function registrarProLabore(bizId, fromDash = false) {
  const b = (await getBiz()).find(x=>x.id===bizId);
  if (!b) return;
  const val = fromDash ? (parseFloat(el('dashProLaboreVal').value)||0) : (b.pro_labore||0);
  if (!val || val <= 0) { toast('Defina o valor do Pró Labore antes de registrar.', 'error'); return; }

  await db.insert('transactions', {
    desc: `Pró Labore - ${b.nome}`,
    valor: val,
    tipo: 'receita',
    cat: 'Salário',
    data: today(),
    obs: 'Pró labore registrado via módulo Negócios',
  });
  // Salva valor caso tenha sido editado
  if (fromDash) {
    await db.put('businesses', { ...b, pro_labore: val });
  }
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  toast(`💰 ${fmt(val)} de Pró Labore lançados no Financeiro!`, 'success', 5000);

  if (fromDash) await _dashProLabore({ ...b, pro_labore: val });
  else await renderNegocios();
}

export async function saveProLabore(bizId) {
  const val = parseFloat(el(`pl-${bizId}`)?.value) || 0;
  const b   = (await getBiz()).find(x=>x.id===bizId);
  if (!b) return;
  await db.put('businesses', { ...b, pro_labore: val });
  invalidate();
  toast('Pró Labore salvo!', 'success');
  await _renderProLabore();
}

/* ════════════════════════════════════════
   MODAL — EMPRESA
   ════════════════════════════════════════ */
async function openBizModal(id = null) {
  el('bizModalTitle').textContent = id ? 'Editar Empresa' : 'Nova Empresa';
  el('bizEditId').value           = id ?? '';
  el('bizTipo').innerHTML         = BIZ_TYPES.map(t=>`<option>${t}</option>`).join('');
  if (id) {
    const b = (await getBiz()).find(x=>x.id===id);
    if (!b) return;
    el('bizNome').value   = b.nome;
    el('bizTipo').value   = b.tipo;
    el('bizDesc').value   = b.descricao ?? '';
    el('bizCor').value    = b.cor ?? '#3b82f6';
    el('bizProLabore').value = b.pro_labore ?? 0;
  } else {
    el('bizForm').reset();
    el('bizCor').value = BIZ_COLORS[Math.floor(Math.random()*BIZ_COLORS.length)];
  }
  el('modalBiz').classList.add('open');
}
const closeBizModal = () => el('modalBiz').classList.remove('open');

async function saveBiz() {
  const nome      = el('bizNome').value.trim();
  const tipo      = el('bizTipo').value;
  const descricao = el('bizDesc').value.trim();
  const cor       = el('bizCor').value;
  const pro_labore= parseFloat(el('bizProLabore').value) || 0;
  const editId    = el('bizEditId').value;
  if (!nome) { toast('Informe o nome.', 'error'); return; }

  if (editId) {
    const old = (await getBiz()).find(x=>x.id===parseInt(editId));
    await db.put('businesses', { ...old, nome, tipo, descricao, cor, pro_labore });
    toast('Empresa atualizada!', 'success');
  } else {
    await db.insert('businesses', { nome, tipo, descricao, cor, pro_labore, criadaEm: today() });
    toast('Empresa criada! 💼', 'success');
  }
  invalidate(); closeBizModal(); await renderNegocios();
}

export async function editBiz(id)   { await openBizModal(id); }
export async function deleteBiz(id) {
  const b = (await getBiz()).find(x=>x.id===id);
  if (!await uiConfirm(`Excluir "${b?.nome}" e todos seus clientes e produtos?`, { title: 'Excluir empresa' })) return;
  for (const c of (await getClients()).filter(c=>c.business_id===id))  await db.delete('clients',  c.id);
  for (const p of (await getProducts()).filter(p=>p.business_id===id)) await db.delete('products', p.id);
  await db.delete('businesses', id);
  invalidate(); toast('Empresa removida.','info'); await renderNegocios();
}

/* ════════════════════════════════════════
   MODAL — CLIENTE
   ════════════════════════════════════════ */
async function openClientModal(id=null) {
  el('clientModalTitle').textContent = id ? 'Editar Cliente' : 'Novo Cliente';
  el('clientEditId').value           = id ?? '';
  const biz = await getBiz();
  el('clientBiz').innerHTML = '<option value="">Selecione</option>'+biz.map(b=>`<option value="${b.id}">${b.nome}</option>`).join('');
  if (id) {
    const c = (await getClients()).find(x=>x.id===id);
    if (!c) return;
    el('clientNome').value  = c.nome;
    el('clientEmail').value = c.email??'';
    el('clientTel').value   = c.tel??'';
    el('clientBiz').value   = c.business_id;
    el('clientObs').value   = c.obs??'';
  } else { el('clientForm').reset(); }
  el('modalClient').classList.add('open');
}
const closeClientModal = () => el('modalClient').classList.remove('open');

async function saveClient() {
  const nome        = el('clientNome').value.trim();
  const business_id = parseInt(el('clientBiz').value)||null;
  if (!nome||!business_id) { toast('Informe nome e empresa.','error'); return; }
  const rec = { nome, email:el('clientEmail').value.trim(), tel:el('clientTel').value.trim(), business_id, obs:el('clientObs').value.trim() };
  const editId = el('clientEditId').value;
  if (editId) { await db.put('clients',{ ...rec, id:parseInt(editId) }); toast('Cliente atualizado!','success'); }
  else        { await db.insert('clients', rec);                          toast('Cliente adicionado!','success'); }
  invalidate(); closeClientModal(); await renderNegocios();
}

export async function editClient(id)   { await openClientModal(id); }
export async function deleteClient(id) {
  await db.delete('clients',id); invalidate(); toast('Removido.','info'); await renderNegocios();
}

/* ════════════════════════════════════════
   MODAL — PRODUTO
   ════════════════════════════════════════ */
async function openProductModal(id=null) {
  el('prodModalTitle').textContent = id ? 'Editar Produto' : 'Novo Produto/Serviço';
  el('prodEditId').value           = id ?? '';
  const biz = await getBiz();
  el('prodBiz').innerHTML = '<option value="">Selecione</option>'+biz.map(b=>`<option value="${b.id}">${b.nome}</option>`).join('');
  if (id) {
    const p = (await getProducts()).find(x=>x.id===id);
    if (!p) return;
    el('prodNome').value    = p.nome;
    el('prodTipo').value    = p.tipo;
    el('prodPreco').value   = p.preco;
    el('prodUnidade').value = p.unidade;
    el('prodBiz').value     = p.business_id;
    el('prodObs').value     = p.obs??'';
  } else { el('prodForm').reset(); el('prodTipo').value='servico'; el('prodUnidade').value='hora'; }
  el('modalProduct').classList.add('open');
}
const closeProductModal = () => el('modalProduct').classList.remove('open');

async function saveProduct() {
  const nome        = el('prodNome').value.trim();
  const preco       = parseFloat(el('prodPreco').value);
  const business_id = parseInt(el('prodBiz').value)||null;
  if (!nome||isNaN(preco)||!business_id) { toast('Preencha nome, empresa e preço.','error'); return; }
  const rec = { nome, tipo:el('prodTipo').value, preco, unidade:el('prodUnidade').value.trim()||'unid.', business_id, obs:el('prodObs').value.trim() };
  const editId = el('prodEditId').value;
  if (editId) { await db.put('products',{ ...rec, id:parseInt(editId) }); toast('Produto atualizado!','success'); }
  else        { await db.insert('products', rec);                          toast('Produto criado!','success'); }
  invalidate(); closeProductModal(); await renderNegocios();
}

export async function editProduct(id)   { await openProductModal(id); }
export async function deleteProduct(id) {
  await db.delete('products',id); invalidate(); toast('Removido.','info'); await renderNegocios();
}

export async function switchTab(tab) { _tab = tab; await renderNegocios(); }

/* ════════════════════════════════════════
   TOPBAR CONTEXTUAL
   ════════════════════════════════════════ */
export function activateBizTopbar() {
  el('topbar-fin-actions').style.display = 'none';
  el('topbar-biz-actions').style.display = 'flex';
}
export function deactivateBizTopbar() {
  el('topbar-fin-actions').style.display = 'flex';
  el('topbar-biz-actions').style.display = 'none';
}

/* ════════════════════════════════════════
   IMPORTAR CSV — NEGÓCIOS
   ════════════════════════════════════════ */
const BIZ_CATS_RECEITA = ['Venda de Produto','Prestação de Serviço','Consultoria','Mensalidade/Assinatura','Comissão','Licença/Royalties','Adiantamento','Outros'];
const BIZ_CATS_DESPESA = ['Fornecedor','Salários/CLT','Pró Labore','Aluguel','Marketing/Publicidade','Software/SaaS','Equipamentos','Impostos/Taxas','Contabilidade','Logística','Outros'];
const BIZ_CATS_ALL     = [...new Set([...BIZ_CATS_RECEITA, ...BIZ_CATS_DESPESA])].sort();

let _bizImportRows = [];

function _autoCatBiz(desc) {
  const d = desc.toLowerCase();
  if (d.includes('salário')||d.includes('salario')||d.includes('folha')) return 'Salários/CLT';
  if (d.includes('aluguel')||d.includes('locação')||d.includes('locacao')) return 'Aluguel';
  if (d.includes('imposto')||d.includes('das ')||d.includes('simples')||d.includes('inss')||d.includes('irpf')) return 'Impostos/Taxas';
  if (d.includes('fornecedor')||d.includes('compra')) return 'Fornecedor';
  if (d.includes('marketing')||d.includes('publicidade')||d.includes('trafego')||d.includes('ads')) return 'Marketing/Publicidade';
  if (d.includes('aws')||d.includes('azure')||d.includes('google cloud')||d.includes('hostinger')||d.includes('assinatura')||d.includes('saas')) return 'Software/SaaS';
  if (d.includes('equipament')||d.includes('notebook')||d.includes('computador')||d.includes('hardware')) return 'Equipamentos';
  if (d.includes('contabilidade')||d.includes('contador')) return 'Contabilidade';
  if (d.includes('frete')||d.includes('logística')||d.includes('entrega')||d.includes('correios')) return 'Logística';
  return 'Outros';
}

function _parseBizCSV(text) {
  return text.trim().split('\n').slice(1).map(line => {
    const cols = line.split(',');
    if (cols.length < 4) return null;
    const [d, m, a] = cols[0].trim().split('/');
    const valor = parseFloat(cols[1]);
    const _id   = cols[2].trim();
    const desc  = cols.slice(3).join(',').trim();
    if (isNaN(valor) || !d) return null;
    const tipo = valor >= 0 ? 'receita' : 'despesa';
    return { _id, data:`${a}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`,
             valor: Math.abs(valor), tipo, cat: tipo==='receita' ? 'Prestação de Serviço' : _autoCatBiz(desc), desc, obs:'' };
  }).filter(Boolean);
}

async function openBizImportModal() {
  _bizImportRows = [];
  const biz = await getBiz();
  if (!biz.length) { toast('Cadastre ao menos uma empresa antes de importar.', 'error'); return; }

  el('bizImportEmpresa').innerHTML = '<option value="">Escolha a empresa do extrato…</option>' +
    biz.map(b => `<option value="${b.id}">${b.nome} (${b.tipo})</option>`).join('');
  el('bizImportEmpresa').value = '';

  el('bizImportStep1').style.display  = '';
  el('bizImportStep2').style.display  = 'none';
  el('bizImportNext').textContent     = 'Avançar →';
  el('bizImportNext').disabled        = true;
  el('bizImportBack').style.display   = 'none';
  el('bizFileList').innerHTML         = '';
  el('bizCsvFileInput').value         = '';
  el('modalBizImport').classList.add('open');
}
const closeBizImportModal = () => el('modalBizImport').classList.remove('open');

function _handleBizFiles(files) {
  const csvs = files.filter(f => f.name.endsWith('.csv'));
  if (!csvs.length) return;
  _bizImportRows = [];
  const fl = el('bizFileList');
  fl.innerHTML = '';
  let pending = csvs.length;
  csvs.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `<span>📄</span><span class="file-item__name">${file.name}</span><span class="file-item__status">lendo…</span>`;
    fl.appendChild(item);
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = _parseBizCSV(ev.target.result);
      _bizImportRows.push(...rows);
      item.querySelector('.file-item__status').textContent = `✓ ${rows.length} linhas`;
      if (!--pending) _checkBizImportReady();
    };
    reader.readAsText(file, 'UTF-8');
  });
}

function _checkBizImportReady() {
  const hasEmpresa = !!el('bizImportEmpresa').value;
  const hasRows    = _bizImportRows.length > 0;
  el('bizImportNext').disabled = !(hasEmpresa && hasRows);
}

async function _renderBizImportPreview() {
  const existingIds = new Set((await getTxns()).map(t => t._nuId).filter(Boolean));
  const newRows     = _bizImportRows.filter(r => !existingIds.has(r._id));

  el('bizImportStep1').style.display  = 'none';
  el('bizImportStep2').style.display  = '';
  el('bizImportNext').textContent     = 'Importar';
  el('bizImportNext').disabled        = false;
  el('bizImportBack').style.display   = '';

  const rec = newRows.filter(r=>r.tipo==='receita').reduce((s,r)=>s+r.valor,0);
  const des = newRows.filter(r=>r.tipo==='despesa').reduce((s,r)=>s+r.valor,0);
  const dup = _bizImportRows.length - newRows.length;
  const biz = (await getBiz()).find(b=>String(b.id)===el('bizImportEmpresa').value);

  el('bizImportSummary').innerHTML = `
    <div class="import-stat"><strong>${newRows.length}</strong> novas transações</div>
    <div class="import-stat"><strong style="color:var(--green)">${fmt(rec)}</strong> receitas</div>
    <div class="import-stat"><strong style="color:var(--red)">${fmt(des)}</strong> despesas</div>
    ${dup ? `<div class="import-stat"><strong style="color:var(--amber)">${dup}</strong> já importadas</div>` : ''}
    <div class="import-stat" style="border-left:2px solid ${biz?.cor??'#3b82f6'};padding-left:.5rem">
      Empresa: <strong>${biz?.nome ?? '—'}</strong>
    </div>`;

  const CATS_OPT = BIZ_CATS_ALL.map(c=>`<option>${c}</option>`).join('');
  el('bizImportTableBody').innerHTML = newRows.map((r,i) => `
    <tr>
      <td><input type="checkbox" class="biz-imp-chk" data-i="${i}" checked /></td>
      <td>${fmtDate(r.data)}</td>
      <td style="max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.desc}">${r.desc}</td>
      <td><select class="select biz-imp-tipo" data-i="${i}">
        <option value="receita" ${r.tipo==='receita'?'selected':''}>Receita</option>
        <option value="despesa" ${r.tipo==='despesa'?'selected':''}>Despesa</option>
      </select></td>
      <td><select class="select biz-imp-cat" data-i="${i}">${CATS_OPT}</select></td>
      <td class="${r.tipo==='receita'?'val-green':'val-red'}">${fmt(r.valor)}</td>
    </tr>`).join('');

  el('bizImportTableBody')._rows = newRows;
  el('bizCheckAll').onchange = e =>
    document.querySelectorAll('.biz-imp-chk').forEach(c => c.checked = e.target.checked);

  // Pré-selecionar categoria correta
  newRows.forEach((r,i) => {
    const catSel = document.querySelector(`.biz-imp-cat[data-i="${i}"]`);
    if (catSel) catSel.value = r.cat;
  });
}

async function _confirmBizImport() {
  const rows      = el('bizImportTableBody')._rows ?? [];
  const bizId     = parseInt(el('bizImportEmpresa').value);
  const biz       = (await getBiz()).find(b=>b.id===bizId);
  if (!bizId || !biz) { toast('Empresa não encontrada.','error'); return; }

  let count = 0;
  for (const chk of document.querySelectorAll('.biz-imp-chk')) {
    if (!chk.checked) continue;
    const i    = parseInt(chk.dataset.i);
    const r    = rows[i];
    const tipo = document.querySelector(`.biz-imp-tipo[data-i="${i}"]`).value;
    const cat  = document.querySelector(`.biz-imp-cat[data-i="${i}"]`).value;
    await db.insert('transactions', {
      _nuId: r._id, desc: r.desc, valor: r.valor,
      tipo, cat, data: r.data, obs: '', business_id: bizId,
    });
    count++;
  }
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  closeBizImportModal();
  toast(`✓ ${count} lançamentos importados para "${biz.nome}"!`, 'success', 5000);
  _tab = 'financeiro';
  await renderNegocios();
}

/* ════════════════════════════════════════
   INIT
   ════════════════════════════════════════ */
export function init() {
  window._biz = { openDashboard, editBiz, deleteBiz, editClient, deleteClient,
                  editProduct, deleteProduct, switchTab, saveProLabore, registrarProLabore,
                  openFinModal, editFinTxn, deleteFinTxn };

  document.querySelectorAll('.biz-tab').forEach(btn =>
    btn.addEventListener('click', () => { _tab = btn.dataset.tab; renderNegocios(); }));

  el('bizClientFilter').addEventListener('change',  () => _renderClientes());
  el('bizProdFilter').addEventListener('change',    () => _renderProdutos());

  /* SQL clients */
  el('sqlClientQuery')?.addEventListener('input',   () => _renderClientes());
  el('sqlClientSort')?.addEventListener('change',   e  => { _clientSort = e.target.value; _clientSortDir = 'asc'; _renderClientes(); });
  el('btnExportClientCSV')?.addEventListener('click', _exportClientCSV);
  document.querySelectorAll('.sql-th.sortable').forEach(th =>
    th.addEventListener('click', () => {
      if (_clientSort === th.dataset.col) _clientSortDir = _clientSortDir === 'asc' ? 'desc' : 'asc';
      else { _clientSort = th.dataset.col; _clientSortDir = 'asc'; }
      _renderClientes();
    })
  );

  /* Delete all biz txns */
  el('btnDeleteAllBizTxns')?.addEventListener('click', deleteAllBizTxns);

  /* Filtros de lançamentos */
  el('finFilterBiz')?.addEventListener('change', e  => { _finFilter.bizId = e.target.value; _renderFinanceiro(); });
  el('finFilterTipo')?.addEventListener('change', e => { _finFilter.tipo  = e.target.value; _renderFinanceiro(); });
  el('finFilterCat')?.addEventListener('change', e  => { _finFilter.cat   = e.target.value; _renderFinanceiro(); });
  el('finFilterMes')?.addEventListener('change', e  => { _finFilter.mes   = e.target.value; _renderFinanceiro(); });
  el('finSearch')?.addEventListener('input', e      => { _finFilter.q     = e.target.value; _renderFinanceiro(); });
  el('finFilterBiz')?.addEventListener('change', e  => { _finFilter.bizId = e.target.value; _renderFinanceiro(); });

  /* Modal lançamento — sync radio → hidden select */
  ['finTxnTipoReceita','finTxnTipoDespesa'].forEach(rid => {
    el(rid)?.addEventListener('change', async e => {
      el('finTxnTipo').value = e.target.value;
      _updateFinCats(e.target.value);
      await _updateProdutoSelector(el('finTxnBiz').value, e.target.value);
    });
  });
  el('finTxnTipo')?.addEventListener('change', e => _updateFinCats(e.target.value));

  /* Empresa muda → recarrega produtos */
  el('finTxnBiz')?.addEventListener('change', async e => {
    await _updateProdutoSelector(e.target.value, el('finTxnTipo').value);
  });

  /* Produto selecionado → preenche valor e descrição */
  el('finTxnProduto')?.addEventListener('change', () => {
    const sel = el('finTxnProduto');
    const opt = sel.options[sel.selectedIndex];
    if (!opt?.value) return;
    const qtd   = parseFloat(el('finTxnQtd')?.value) || 1;
    const preco = parseFloat(opt.dataset.preco);
    el('finTxnValor').value = (preco * qtd).toFixed(2);
    el('finTxnDesc').value  = `${qtd > 1 ? qtd+'x ' : ''}${opt.dataset.nome}`;
    el('finTxnCat').value   = opt.dataset.tipo === 'produto' ? 'Venda de Produto' : 'Prestação de Serviço';
  });

  /* Qtd muda → recalcula valor */
  el('finTxnQtd')?.addEventListener('input', () => {
    const sel = el('finTxnProduto');
    const opt = sel?.options[sel.selectedIndex];
    if (!opt?.value) return;
    const qtd   = parseFloat(el('finTxnQtd').value) || 1;
    const preco = parseFloat(opt.dataset.preco);
    el('finTxnValor').value = (preco * qtd).toFixed(2);
    el('finTxnDesc').value  = `${qtd > 1 ? qtd+'x ' : ''}${opt.dataset.nome}`;
  });
  el('finTxnModalClose')?.addEventListener('click', closeFinModal);
  el('finTxnCancel')?.addEventListener('click', closeFinModal);
  el('finTxnSave')?.addEventListener('click', saveFinTxn);
  el('modalBizTxn')?.addEventListener('click', e => { if (e.target===e.currentTarget) closeFinModal(); });

  el('btnAddBiz').addEventListener('click',     () => openBizModal());
  el('btnAddClient').addEventListener('click',  () => openClientModal());
  el('btnAddProduct').addEventListener('click', () => openProductModal());

  el('bizModalClose').addEventListener('click', closeBizModal);
  el('bizCancel').addEventListener('click', closeBizModal);
  el('bizSave').addEventListener('click', saveBiz);
  el('modalBiz').addEventListener('click', e => { if (e.target===e.currentTarget) closeBizModal(); });

  el('clientModalClose').addEventListener('click', closeClientModal);
  el('clientCancel').addEventListener('click', closeClientModal);
  el('clientSave').addEventListener('click', saveClient);
  el('modalClient').addEventListener('click', e => { if (e.target===e.currentTarget) closeClientModal(); });

  el('prodModalClose').addEventListener('click', closeProductModal);
  el('prodCancel').addEventListener('click', closeProductModal);
  el('prodSave').addEventListener('click', saveProduct);
  el('modalProduct').addEventListener('click', e => { if (e.target===e.currentTarget) closeProductModal(); });

  /* Topbar biz buttons */
  el('btnBizImport')?.addEventListener('click', openBizImportModal);
  el('btnBizAddTxn')?.addEventListener('click', () => openFinModal());

  /* Import CSV modal */
  el('bizImportClose').addEventListener('click', closeBizImportModal);
  el('bizImportCancel').addEventListener('click', closeBizImportModal);
  el('modalBizImport').addEventListener('click', e => { if (e.target===e.currentTarget) closeBizImportModal(); });
  el('btnBizChooseFile').addEventListener('click', () => el('bizCsvFileInput').click());
  el('bizCsvFileInput').addEventListener('change', e => _handleBizFiles([...e.target.files]));
  el('bizImportEmpresa').addEventListener('change', _checkBizImportReady);

  const buz = el('bizUploadZone');
  buz.addEventListener('dragover', e => { e.preventDefault(); buz.classList.add('drag-over'); });
  buz.addEventListener('dragleave', () => buz.classList.remove('drag-over'));
  buz.addEventListener('drop', e => { e.preventDefault(); buz.classList.remove('drag-over'); _handleBizFiles([...e.dataTransfer.files]); });

  el('bizImportNext').addEventListener('click', () => {
    if (el('bizImportStep2').style.display !== 'none') _confirmBizImport();
    else {
      if (!el('bizImportEmpresa').value) { toast('Selecione a empresa.', 'error'); return; }
      if (!_bizImportRows.length)        { toast('Selecione ao menos um CSV.', 'error'); return; }
      _renderBizImportPreview();
    }
  });
  el('bizImportBack').addEventListener('click', () => {
    el('bizImportStep1').style.display = '';
    el('bizImportStep2').style.display = 'none';
    el('bizImportNext').textContent    = 'Avançar →';
    el('bizImportBack').style.display  = 'none';
  });

  // Dashboard modal
  el('dashCompanyClose').addEventListener('click', closeDashboard);
  el('modalCompanyDash').addEventListener('click', e => { if (e.target===e.currentTarget) closeDashboard(); });
  document.querySelectorAll('.dash-tab').forEach(btn =>
    btn.addEventListener('click', () => _renderDashTab(btn.dataset.tab)));
  window._biz.saveProLaboreDash = saveProLaboreDash;
}
