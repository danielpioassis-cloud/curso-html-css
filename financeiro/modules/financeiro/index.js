/**
 * modules/financeiro/index.js
 *
 * Módulo financeiro completo.
 * Exporta: init(), renderDashboard(), renderVisaoGeral(),
 *          renderTransacoes(), renderOrcamento(), renderRelatorios(), seedDemo()
 */

import { db }                            from '../../core/db.js';
import { router }                        from '../../core/router.js';
import { store, EVENTS }                 from '../../core/store.js';
import {
  fmt, fmtDate, today, toDate, sumBy,
  deltaLabel, inMonth, CHART_COLORS,
  chartDefaults, toast, uiConfirm,
} from '../../core/ui.js';

/* ════════════════════════════════════════
   CACHE EM MEMÓRIA
   Evita queries repetidas ao IndexedDB
   num mesmo ciclo de render.
   Invalidado após qualquer escrita.
   ════════════════════════════════════════ */
let _txns = null;
let _orcs = null;

async function getTxns() {
  if (!_txns) {
    const all = await db.getAll('transactions');
    // Exclui lançamentos de negócios — apenas Pró Labore atravessa para o pessoal
    _txns = all.filter(t =>
      !t.business_id ||
      (t.cat === 'Salário' && t.desc?.startsWith('Pró Labore'))
    );
  }
  return _txns;
}
async function getOrcs() { return (_orcs ??= await db.getAll('orcamentos')); }

function invalidate() {
  _txns = null;
  _orcs = null;
}

/* ── Helpers de filtragem ── */
async function txnsThisMonth() {
  const n = new Date();
  return (await getTxns()).filter(t => inMonth(t.data, n.getMonth(), n.getFullYear()));
}

async function txnsLastMonth() {
  const n = new Date();
  const p = new Date(n.getFullYear(), n.getMonth() - 1, 1);
  return (await getTxns()).filter(t => inMonth(t.data, p.getMonth(), p.getFullYear()));
}

async function txnsInRange(from, to) {
  const f = new Date(from), t2 = new Date(to);
  return (await getTxns()).filter(t => {
    const d = toDate(t.data);
    return d >= f && d <= t2;
  });
}

async function monthlyData(months = 6) {
  const now = new Date();
  const labels = [], recs = [], des = [];
  for (let i = months - 1; i >= 0; i--) {
    const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const arr = (await getTxns()).filter(t => inMonth(t.data, d.getMonth(), d.getFullYear()));
    labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }));
    recs.push(sumBy(arr.filter(t => t.tipo === 'receita'), 'valor'));
    des.push( sumBy(arr.filter(t => t.tipo === 'despesa'), 'valor'));
  }
  return { labels, recs, des };
}

/* ════════════════════════════════════════
   SEED — popula o banco com dados demo
   ════════════════════════════════════════ */
export async function seedDemo() {
  const existing = await db.getAll('transactions');
  if (existing.length) return;

  const now = new Date(), m = now.getMonth(), a = now.getFullYear();
  const d   = (day, mo = m, yr = a) => new Date(yr, mo, day).toISOString().split('T')[0];

  const txns = [
    { desc:'Salário',              valor:7500,  tipo:'receita', cat:'Salário',      data:d(5),     obs:'' },
    { desc:'Freelance Landing Page',valor:1800, tipo:'receita', cat:'Freelance',    data:d(12),    obs:'' },
    { desc:'Aluguel',              valor:1500,  tipo:'despesa', cat:'Moradia',      data:d(1),     obs:'' },
    { desc:'Supermercado',         valor:620,   tipo:'despesa', cat:'Alimentação',  data:d(8),     obs:'' },
    { desc:'iFood',                valor:95,    tipo:'despesa', cat:'Alimentação',  data:d(10),    obs:'' },
    { desc:'Plano de saúde',       valor:380,   tipo:'despesa', cat:'Saúde',        data:d(5),     obs:'' },
    { desc:'Gasolina',             valor:250,   tipo:'despesa', cat:'Transporte',   data:d(14),    obs:'' },
    { desc:'Netflix',              valor:45,    tipo:'despesa', cat:'Assinaturas',  data:d(7),     obs:'' },
    { desc:'Curso de JavaScript',  valor:149,   tipo:'despesa', cat:'Educação',     data:d(3),     obs:'' },
    { desc:'Dividendos',           valor:320,   tipo:'receita', cat:'Investimentos',data:d(15),    obs:'' },
    { desc:'Academia',             valor:99,    tipo:'despesa', cat:'Saúde',        data:d(2),     obs:'' },
    { desc:'Salário',              valor:7500,  tipo:'receita', cat:'Salário',      data:d(5,m-1), obs:'' },
    { desc:'Supermercado',         valor:580,   tipo:'despesa', cat:'Alimentação',  data:d(9,m-1), obs:'' },
    { desc:'Aluguel',              valor:1500,  tipo:'despesa', cat:'Moradia',      data:d(1,m-1), obs:'' },
    { desc:'Freelance',            valor:900,   tipo:'receita', cat:'Freelance',    data:d(20,m-1),obs:'' },
    { desc:'Gasolina',             valor:200,   tipo:'despesa', cat:'Transporte',   data:d(11,m-1),obs:'' },
    { desc:'Farmácia',             valor:75,    tipo:'despesa', cat:'Saúde',        data:d(15,m-1),obs:'' },
  ];

  for (const t of txns) await db.insert('transactions', t);

  const orcs = [
    { cat:'Alimentação', limite:800  },
    { cat:'Moradia',     limite:1600 },
    { cat:'Transporte',  limite:300  },
    { cat:'Saúde',       limite:450  },
    { cat:'Lazer',       limite:200  },
    { cat:'Educação',    limite:200  },
  ];
  for (const o of orcs) await db.insert('orcamentos', o);

  invalidate();
}

/* ════════════════════════════════════════
   DASHBOARD
   ════════════════════════════════════════ */
let _chartFluxo, _chartCat;

export async function renderDashboard() {
  const cur  = await txnsThisMonth();
  const prv  = await txnsLastMonth();
  const rec  = sumBy(cur.filter(t => t.tipo==='receita'), 'valor');
  const des  = sumBy(cur.filter(t => t.tipo==='despesa'), 'valor');
  const sal  = rec - des;
  const eco  = Math.max(0, sal * 0.3);
  const recP = sumBy(prv.filter(t => t.tipo==='receita'), 'valor');
  const desP = sumBy(prv.filter(t => t.tipo==='despesa'), 'valor');
  const salP = recP - desP;

  el('kpi-receitas').textContent = fmt(rec);
  el('kpi-despesas').textContent = fmt(des);
  el('kpi-saldo').textContent    = fmt(sal);
  el('kpi-economia').textContent = fmt(eco);
  el('delta-receitas').textContent  = deltaLabel(rec, recP);
  el('delta-despesas').textContent  = deltaLabel(des, desP);
  el('delta-saldo').textContent     = deltaLabel(sal, salP);
  el('delta-economia').textContent  = '';

  await _buildFluxoChart();
  await _buildCatChart();
  await _buildDashTable();
  await _buildMetas();
}

async function _buildFluxoChart() {
  const months = parseInt(el('chartPeriod')?.value || '6');
  const { labels, recs, des } = await monthlyData(months);
  const ctx = el('chartFluxo').getContext('2d');
  _chartFluxo?.destroy();
  _chartFluxo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Receitas', data:recs, backgroundColor:'rgba(16,185,129,.7)', borderRadius:5, borderSkipped:false },
        { label:'Despesas', data:des,  backgroundColor:'rgba(244,63,94,.7)',  borderRadius:5, borderSkipped:false },
      ],
    },
    options: chartDefaults,
  });
}

async function _buildCatChart() {
  const cats = {};
  (await txnsThisMonth()).filter(t => t.tipo==='despesa')
    .forEach(t => { cats[t.cat] = (cats[t.cat] ?? 0) + t.valor; });
  const ctx = el('chartCategoria').getContext('2d');
  _chartCat?.destroy();
  _chartCat = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: CHART_COLORS, borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true, cutout: '70%',
      plugins: {
        legend  : { position:'bottom', labels:{ color:'#64748b', font:{ family:'Inter', size:11 }, padding:10 } },
        tooltip : { ...chartDefaults.plugins.tooltip, callbacks:{ label: c => ` ${fmt(c.raw)}` } },
      },
    },
  });
}

async function _buildDashTable() {
  const sorted = (await getTxns()).sort((a,b) => toDate(b.data)-toDate(a.data)).slice(0,5);
  el('dashTableBody').innerHTML = sorted.map(t => `
    <tr>
      <td>${fmtDate(t.data)}</td>
      <td style="color:var(--text)">${t.desc}</td>
      <td>${t.cat}</td>
      <td class="${t.tipo==='receita'?'val-green':'val-red'}">${t.tipo==='receita'?'+':'-'}${fmt(t.valor)}</td>
    </tr>`).join('');
}

async function _buildMetas() {
  const cur   = await txnsThisMonth();
  const orcs  = (await getOrcs()).slice(0, 5);
  const cont  = el('metasContainer');

  if (!orcs.length) {
    cont.innerHTML = '<p style="color:var(--text3);font-size:.8rem">Nenhuma meta definida.</p>';
    return;
  }

  cont.innerHTML = orcs.map(o => {
    const gasto = sumBy(cur.filter(t => t.cat===o.cat && t.tipo==='despesa'), 'valor');
    const pct   = Math.min(100, (gasto / o.limite) * 100);
    const cls   = pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'safe';
    return `
      <div class="meta-item">
        <div class="meta-item__header">
          <span class="meta-item__cat">${o.cat}</span>
          <span class="meta-item__vals">${fmt(gasto)} / ${fmt(o.limite)}</span>
        </div>
        <div class="progress"><div class="progress__fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════
   VISÃO GERAL (período livre)
   ════════════════════════════════════════ */
let _vgFrom = null, _vgTo = null;
let _chartVgBar, _chartVgPie;

function _getVgRange() {
  const now  = new Date();
  const pill = document.querySelector('.pill.active')?.dataset.period || 'mes';
  if (pill === 'mes')       return { from: new Date(now.getFullYear(), now.getMonth(),   1), to: new Date(now.getFullYear(), now.getMonth()+1, 0) };
  if (pill === 'trimestre') return { from: new Date(now.getFullYear(), now.getMonth()-2, 1), to: new Date(now.getFullYear(), now.getMonth()+1, 0) };
  if (pill === 'semestre')  return { from: new Date(now.getFullYear(), now.getMonth()-5, 1), to: new Date(now.getFullYear(), now.getMonth()+1, 0) };
  if (pill === 'ano')       return { from: new Date(now.getFullYear(), 0, 1),                to: new Date(now.getFullYear(), 11, 31) };
  if (pill === 'custom' && _vgFrom && _vgTo) return { from: new Date(_vgFrom), to: new Date(_vgTo) };
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

export async function renderVisaoGeral() {
  const { from, to }  = _getVgRange();
  const fromISO = from.toISOString().split('T')[0];
  const toISO   = to.toISOString().split('T')[0];
  const arr     = await txnsInRange(fromISO, toISO);

  const rec = sumBy(arr.filter(t=>t.tipo==='receita'), 'valor');
  const des = sumBy(arr.filter(t=>t.tipo==='despesa'), 'valor');

  el('vg-receitas').textContent  = fmt(rec);
  el('vg-despesas').textContent  = fmt(des);
  el('vg-saldo').textContent     = fmt(rec - des);
  el('vg-count').textContent     = arr.length;
  el('vgPeriodLabel').textContent =
    `${from.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})} — ${to.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}`;

  /* Gráfico de barras mensal */
  const monthMap = new Map();
  arr.forEach(t => {
    const d   = toDate(t.data);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!monthMap.has(key)) monthMap.set(key, { rec:0, des:0 });
    monthMap.get(key)[t.tipo==='receita'?'rec':'des'] += t.valor;
  });
  const sorted    = [...monthMap.entries()].sort(([a],[b]) => a.localeCompare(b));
  const mLabels   = sorted.map(([k]) => { const [y,mo]=k.split('-'); return new Date(y,mo-1,1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}); });

  _chartVgBar?.destroy();
  _chartVgBar = new Chart(el('chartVgBar').getContext('2d'), {
    type: 'bar',
    data: {
      labels: mLabels.length ? mLabels : ['—'],
      datasets: [
        { label:'Receitas', data: sorted.map(([,v])=>v.rec), backgroundColor:'rgba(16,185,129,.7)', borderRadius:5, borderSkipped:false },
        { label:'Despesas', data: sorted.map(([,v])=>v.des), backgroundColor:'rgba(244,63,94,.7)',  borderRadius:5, borderSkipped:false },
      ],
    },
    options: chartDefaults,
  });

  /* Rosca por categoria */
  const catMap = {};
  arr.filter(t=>t.tipo==='despesa').forEach(t => { catMap[t.cat] = (catMap[t.cat]??0)+t.valor; });

  _chartVgPie?.destroy();
  _chartVgPie = new Chart(el('chartVgPie').getContext('2d'), {
    type: 'doughnut',
    data: { labels: Object.keys(catMap), datasets:[{ data:Object.values(catMap), backgroundColor:CHART_COLORS, borderWidth:0, hoverOffset:8 }] },
    options: {
      responsive:true, cutout:'68%',
      plugins: {
        legend: { position:'bottom', labels:{ color:'#64748b', font:{ family:'Inter', size:11 }, padding:10 } },
        tooltip: { ...chartDefaults.plugins.tooltip, callbacks:{ label: c=>` ${fmt(c.raw)}` } },
      },
    },
  });

  /* Top despesas */
  const topDes = [...arr].filter(t=>t.tipo==='despesa').sort((a,b)=>b.valor-a.valor).slice(0,10);
  el('vgTopTable').innerHTML = topDes.map(t=>`
    <tr>
      <td>${fmtDate(t.data)}</td>
      <td style="color:var(--text)">${t.desc}</td>
      <td>${t.cat}</td>
      <td class="val-red">-${fmt(t.valor)}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:1rem">Nenhuma despesa</td></tr>';

  /* Resumo por categoria */
  const totalDes  = des || 1;
  const catRows   = Object.entries(catMap).sort(([,a],[,b])=>b-a);
  el('vgCatTable').innerHTML = catRows.map(([cat,v])=>`
    <tr>
      <td style="color:var(--text)">${cat}</td>
      <td class="val-red">-${fmt(v)}</td>
      <td style="color:var(--text3)">${((v/totalDes)*100).toFixed(1)}%</td>
    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text3);padding:1rem">—</td></tr>';
}

/* ════════════════════════════════════════
   TRANSAÇÕES
   ════════════════════════════════════════ */
export async function renderTransacoes() {
  const search = el('searchInput').value.toLowerCase();
  const tipo   = el('filterTipo').value;
  const cat    = el('filterCategoria').value;

  let data = (await getTxns()).sort((a,b) => toDate(b.data)-toDate(a.data));
  if (search) data = data.filter(t => t.desc.toLowerCase().includes(search) || t.cat.toLowerCase().includes(search));
  if (tipo)   data = data.filter(t => t.tipo === tipo);
  if (cat)    data = data.filter(t => t.cat  === cat);

  const tbody = el('transTableBody');
  const empty = el('transEmpty');

  if (!data.length) { tbody.innerHTML=''; empty.style.display='flex'; }
  else {
    empty.style.display = 'none';
    tbody.innerHTML = data.map(t => `
      <tr>
        <td>${fmtDate(t.data)}</td>
        <td style="color:var(--text)">${t.desc}${t.obs?`<div style="font-size:.7rem;color:var(--text3);margin-top:.1rem">${t.obs}</div>`:''}</td>
        <td>${t.cat}</td>
        <td><span class="badge badge--${t.tipo}">${t.tipo}</span></td>
        <td class="${t.tipo==='receita'?'val-green':'val-red'}">${t.tipo==='receita'?'+':'-'}${fmt(t.valor)}</td>
        <td>
          <button class="btn-icon" onclick="window._fc.editTransaction(${t.id})" title="Editar">✏️</button>
          <button class="btn-icon del" onclick="window._fc.deleteTransaction(${t.id})" title="Excluir">🗑️</button>
        </td>
      </tr>`).join('');
  }

  /* Atualiza filtro de categorias */
  const cats   = [...new Set((await getTxns()).map(t=>t.cat))].sort();
  const selEl  = el('filterCategoria');
  const curCat = selEl.value;
  selEl.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c => `<option value="${c}" ${c===curCat?'selected':''}>${c}</option>`).join('');
}

/* ════════════════════════════════════════
   ORÇAMENTO
   ════════════════════════════════════════ */
export async function renderOrcamento() {
  const cur  = await txnsThisMonth();
  const orcs = await getOrcs();
  const grid = el('orcamentoGrid');

  if (!orcs.length) {
    grid.innerHTML = '<p style="color:var(--text3)">Nenhuma meta cadastrada. Clique em "+ Nova Meta".</p>';
    return;
  }

  grid.innerHTML = orcs.map(o => {
    const gasto = sumBy(cur.filter(t=>t.cat===o.cat&&t.tipo==='despesa'), 'valor');
    const pct   = Math.min(100, (gasto/o.limite)*100);
    const cls   = pct>=90?'danger':pct>=70?'warn':'safe';
    const rest  = Math.max(0, o.limite-gasto);
    return `
      <div class="orc-card">
        <div class="orc-card__header">
          <span class="orc-card__title">${o.cat}</span>
          <div>
            <button class="btn-icon" onclick="window._fc.editOrcamento(${o.id})">✏️</button>
            <button class="btn-icon del" onclick="window._fc.deleteOrcamento(${o.id})">🗑️</button>
          </div>
        </div>
        <div class="progress"><div class="progress__fill ${cls}" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="orc-pct">${pct.toFixed(0)}% utilizado</div>
        <div class="orc-card__stats" style="margin-top:.5rem">
          <div class="orc-stat"><span class="orc-stat__label">Gasto</span><span class="orc-stat__value val-red">${fmt(gasto)}</span></div>
          <div class="orc-stat"><span class="orc-stat__label">Limite</span><span class="orc-stat__value">${fmt(o.limite)}</span></div>
          <div class="orc-stat"><span class="orc-stat__label">Restante</span><span class="orc-stat__value val-green">${fmt(rest)}</span></div>
        </div>
      </div>`;
  }).join('');
}

/* ════════════════════════════════════════
   RELATÓRIOS
   ════════════════════════════════════════ */
let _chartRel, _chartRelPie;

export async function renderRelatorios() {
  const { labels, recs, des } = await monthlyData(6);

  _chartRel?.destroy();
  _chartRel = new Chart(el('chartRelatorio').getContext('2d'), {
    type: 'line',
    data: { labels, datasets: [
      { label:'Receitas', data:recs, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.1)', fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#10b981' },
      { label:'Despesas', data:des,  borderColor:'#f43f5e', backgroundColor:'rgba(244,63,94,.1)',  fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#f43f5e' },
    ]},
    options: chartDefaults,
  });

  const catMap = {};
  (await txnsThisMonth()).filter(t=>t.tipo==='despesa').forEach(t=>{ catMap[t.cat]=(catMap[t.cat]??0)+t.valor; });

  _chartRelPie?.destroy();
  _chartRelPie = new Chart(el('chartRelPie').getContext('2d'), {
    type: 'pie',
    data: { labels:Object.keys(catMap), datasets:[{ data:Object.values(catMap), backgroundColor:CHART_COLORS, borderWidth:0 }] },
    options: { responsive:true, plugins:{ legend:{ position:'bottom', labels:{ color:'#64748b', font:{ family:'Inter', size:11 }, padding:10 } }, tooltip:{ ...chartDefaults.plugins.tooltip, callbacks:{ label:c=>` ${fmt(c.raw)}` } } } },
  });

  const cats = [...new Set((await getTxns()).map(t=>t.cat))].sort();
  el('relTableBody').innerHTML = (await Promise.all(cats.map(async cat => {
    const all = await getTxns();
    const r   = sumBy(all.filter(t=>t.cat===cat&&t.tipo==='receita'), 'valor');
    const d   = sumBy(all.filter(t=>t.cat===cat&&t.tipo==='despesa'), 'valor');
    const s   = r - d;
    return `<tr>
      <td style="color:var(--text);font-weight:500">${cat}</td>
      <td class="val-green">${r?fmt(r):'—'}</td>
      <td class="val-red">${d?fmt(d):'—'}</td>
      <td class="${s>=0?'val-green':'val-red'}">${fmt(s)}</td>
    </tr>`;
  }))).join('');
}

/* ════════════════════════════════════════
   MODAL — TRANSAÇÃO
   ════════════════════════════════════════ */
async function openTransactionModal(id = null) {
  el('modalTitle').textContent  = id ? 'Editar Transação' : 'Nova Transação';
  el('editId').value            = id ?? '';

  if (id) {
    const t = (await getTxns()).find(x => x.id === id);
    if (!t) return;
    el('fDescricao').value = t.desc;
    el('fValor').value     = t.valor;
    el('fTipo').value      = t.tipo;
    el('fCategoria').value = t.cat;
    el('fData').value      = t.data;
    el('fObs').value       = t.obs ?? '';
  } else {
    el('formTransaction').reset();
    el('fData').value = today();
  }
  el('modalOverlay').classList.add('open');
}

function closeTransactionModal() { el('modalOverlay').classList.remove('open'); }

async function saveTransaction() {
  const desc   = el('fDescricao').value.trim();
  const valor  = parseFloat(el('fValor').value);
  const tipo   = el('fTipo').value;
  const cat    = el('fCategoria').value;
  const data   = el('fData').value;
  const obs    = el('fObs').value.trim();
  const editId = el('editId').value;

  if (!desc || !valor || !tipo || !cat || !data) {
    toast('Preencha todos os campos obrigatórios.', 'error');
    return;
  }

  if (editId) {
    await db.put('transactions', { id:parseInt(editId), desc, valor, tipo, cat, data, obs });
    toast('Transação atualizada!', 'success');
  } else {
    await db.insert('transactions', { desc, valor, tipo, cat, data, obs });
    toast('Transação adicionada!', 'success');
  }

  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  closeTransactionModal();
  await router.navigate(router.current);
}

export async function editTransaction(id) {
  await openTransactionModal(id);
}

export async function deleteTransaction(id) {
  await db.delete('transactions', id);
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  toast('Transação excluída.', 'info');
  await router.navigate(router.current);
}

async function deleteAllPersonalTxns() {
  const ok = await uiConfirm(
    'Isso irá excluir TODAS as transações pessoais (sem empresa vinculada). Esta ação não pode ser desfeita.',
    { title: '⚠️ Excluir todas as transações?', okLabel: 'Sim, excluir tudo', danger: true }
  );
  if (!ok) return;
  const all = await db.getAll('transactions');
  const personal = all.filter(t => !t.business_id ||
    (t.cat === 'Salário' && t.desc?.startsWith('Pró Labore')));
  for (const t of personal) await db.delete('transactions', t.id);
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  toast(`🗑️ ${personal.length} transações excluídas.`, 'info', 4000);
  await renderTransacoes();
}

/* ════════════════════════════════════════
   MODAL — ORÇAMENTO
   ════════════════════════════════════════ */
async function openOrcModal(id = null) {
  el('orcEditId').value = id ?? '';
  if (id) {
    const o = (await getOrcs()).find(x => x.id === id);
    if (!o) return;
    el('orcCategoria').value = o.cat;
    el('orcLimite').value    = o.limite;
  } else {
    el('formOrcamento').reset();
  }
  el('modalOrcamento').classList.add('open');
}

function closeOrcModal() { el('modalOrcamento').classList.remove('open'); }

async function saveOrcamento() {
  const cat    = el('orcCategoria').value;
  const limite = parseFloat(el('orcLimite').value);
  const editId = el('orcEditId').value;

  if (!cat || !limite) { toast('Preencha todos os campos.', 'error'); return; }

  if (editId) {
    await db.put('orcamentos', { id:parseInt(editId), cat, limite });
    toast('Meta atualizada!', 'success');
  } else {
    const orcs = await getOrcs();
    if (orcs.find(o => o.cat === cat)) {
      toast('Já existe uma meta para esta categoria.', 'warning');
      return;
    }
    await db.insert('orcamentos', { cat, limite });
    toast('Meta criada!', 'success');
  }

  invalidate();
  store.emit(EVENTS.ORCAMENTO_CHANGED);
  closeOrcModal();
  await renderOrcamento();
}

export function editOrcamento(id) { openOrcModal(id); }

export async function deleteOrcamento(id) {
  await db.delete('orcamentos', id);
  invalidate();
  store.emit(EVENTS.ORCAMENTO_CHANGED);
  toast('Meta removida.', 'info');
  await renderOrcamento();
}

/* ════════════════════════════════════════
   IMPORTAR CSV — Nubank
   ════════════════════════════════════════ */
const CATS_OPTIONS = [
  'Alimentação','Moradia','Transporte','Saúde','Educação',
  'Lazer','Salário','Freelance','Investimentos','Assinaturas','Beleza','Outros',
];

function autoCategoria(desc) {
  const d = desc.toLowerCase();
  if (d.includes('rdb')||d.includes('aplicação')||d.includes('dinheiro guardado')) return 'Investimentos';
  if (d.includes('barbearia')||d.includes('cabeleir')||d.includes('estetica'))       return 'Beleza';
  if (d.includes('academia')||d.includes('farmácia')||d.includes('farmacia')||d.includes('vr fit')||d.includes('hospital')) return 'Saúde';
  if (d.includes('restaurante')||d.includes('lanchonete')||d.includes('cantina')||d.includes('padaria')||
      d.includes('lanches')||d.includes('bistro')||d.includes('pizza')||d.includes('mcdonald')||
      d.includes('paladar')||d.includes('tempero')||d.includes('cozinha')||d.includes('ifd*')||
      d.includes('royal')||d.includes('pastelandia')||d.includes('cafe'))             return 'Alimentação';
  if (d.includes('uber')||d.includes('gasolina')||d.includes('combustiv'))            return 'Transporte';
  if (d.includes('canva')||d.includes('hostinger')||d.includes('kiwify')||d.includes('udemy')) return 'Educação';
  if (d.includes('amazon prime')||d.includes('netflix')||d.includes('spotify')||
      d.includes('disney')||d.includes('hbo'))                                        return 'Assinaturas';
  if (d.includes('aluguel')||d.includes('condomin')||d.includes('tmb serv'))          return 'Moradia';
  return 'Outros';
}

function parseNubankCSV(text) {
  return text.trim().split('\n').slice(1).map(line => {
    const cols = line.split(',');
    if (cols.length < 4) return null;
    const [d, m, a] = cols[0].trim().split('/');
    const valor = parseFloat(cols[1]);
    const _id   = cols[2].trim();
    const desc  = cols.slice(3).join(',').trim();
    if (isNaN(valor) || !d) return null;
    return { _id, data:`${a}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`, valor:Math.abs(valor), tipo:valor>=0?'receita':'despesa', cat:autoCategoria(desc), desc, obs:'' };
  }).filter(Boolean);
}

let _importRows = [];

function openImportModal() {
  _importRows = [];
  el('importStep1').style.display  = '';
  el('importStep2').style.display  = 'none';
  el('importNext').textContent     = 'Avançar →';
  el('importBack').style.display   = 'none';
  el('fileList').innerHTML         = '';
  el('csvFileInput').value         = '';
  el('modalImport').classList.add('open');
}
function closeImportModal() { el('modalImport').classList.remove('open'); }

async function renderImportPreview() {
  const existingNuIds = new Set((await getTxns()).map(t => t._nuId).filter(Boolean));
  const newRows       = _importRows.filter(r => !existingNuIds.has(r._id));

  el('importStep1').style.display  = 'none';
  el('importStep2').style.display  = '';
  el('importNext').textContent     = 'Importar';
  el('importBack').style.display   = '';

  const rec = sumBy(newRows.filter(r=>r.tipo==='receita'), 'valor');
  const des = sumBy(newRows.filter(r=>r.tipo==='despesa'), 'valor');
  const dup = _importRows.length - newRows.length;

  el('importSummary').innerHTML = `
    <div class="import-stat"><strong>${newRows.length}</strong> novas transações</div>
    <div class="import-stat"><strong style="color:var(--green)">${fmt(rec)}</strong> receitas</div>
    <div class="import-stat"><strong style="color:var(--red)">${fmt(des)}</strong> despesas</div>
    ${dup ? `<div class="import-stat"><strong style="color:var(--amber)">${dup}</strong> já importadas</div>` : ''}`;

  el('importTableBody').innerHTML = newRows.map((r,i) => `
    <tr>
      <td><input type="checkbox" class="imp-chk" data-i="${i}" checked /></td>
      <td>${fmtDate(r.data)}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.desc}">${r.desc}</td>
      <td><select class="select imp-tipo" data-i="${i}"><option value="receita" ${r.tipo==='receita'?'selected':''}>Receita</option><option value="despesa" ${r.tipo==='despesa'?'selected':''}>Despesa</option></select></td>
      <td><select class="select imp-cat" data-i="${i}">${CATS_OPTIONS.map(c=>`<option ${c===r.cat?'selected':''}>${c}</option>`).join('')}</select></td>
      <td class="${r.tipo==='receita'?'val-green':'val-red'}">${fmt(r.valor)}</td>
    </tr>`).join('');

  el('importTableBody')._rows = newRows;
  el('checkAll').onchange = e => document.querySelectorAll('.imp-chk').forEach(c => c.checked = e.target.checked);
}

async function confirmImport() {
  const rows = el('importTableBody')._rows ?? [];
  let count = 0;
  for (const chk of document.querySelectorAll('.imp-chk')) {
    if (!chk.checked) continue;
    const i   = parseInt(chk.dataset.i);
    const r   = rows[i];
    const tipo = document.querySelector(`.imp-tipo[data-i="${i}"]`).value;
    const cat  = document.querySelector(`.imp-cat[data-i="${i}"]`).value;
    await db.insert('transactions', { _nuId:r._id, desc:r.desc, valor:r.valor, tipo, cat, data:r.data, obs:'' });
    count++;
  }
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  closeImportModal();
  toast(`✓ ${count} transações importadas!`, 'success', 4000);
  await router.navigate(router.current);
}

function handleFiles(files) {
  const csvs = files.filter(f => f.name.endsWith('.csv'));
  if (!csvs.length) return;
  _importRows = [];
  const fl = el('fileList');
  fl.innerHTML = '';
  let pending = csvs.length;

  csvs.forEach(file => {
    const item = document.createElement('div');
    item.className = 'file-item';
    item.innerHTML = `<span>📄</span><span class="file-item__name">${file.name}</span><span class="file-item__status">lendo...</span>`;
    fl.appendChild(item);
    const reader = new FileReader();
    reader.onload = ev => {
      const rows = parseNubankCSV(ev.target.result);
      _importRows.push(...rows);
      item.querySelector('.file-item__status').textContent = `✓ ${rows.length} linhas`;
      if (!--pending) el('importNext').disabled = false;
    };
    reader.readAsText(file, 'UTF-8');
  });

  el('importNext').disabled = true;
}

/* ════════════════════════════════════════
   CHAT IA — Claude
   ════════════════════════════════════════ */
const API_KEY_STORE = 'fc_apikey';
let _chatHistory = [];
let _chatOpen    = false;

const getApiKey  = () => localStorage.getItem(API_KEY_STORE) ?? '';
const saveApiKey = k  => localStorage.setItem(API_KEY_STORE, k);

function toggleChat() {
  _chatOpen = !_chatOpen;
  el('chatPanel').classList.toggle('open', _chatOpen);
  el('chatFab').style.display = _chatOpen ? 'none' : 'flex';
  if (_chatOpen) getApiKey() ? showChatInterface() : showChatSetup();
}

function showChatSetup() {
  el('chatSetup').style.display     = 'flex';
  el('chatMessages').style.display  = 'none';
  el('chatPrompts').style.display   = 'none';
  el('chatInputArea').style.display = 'none';
}

function showChatInterface() {
  el('chatSetup').style.display     = 'none';
  el('chatMessages').style.display  = 'flex';
  el('chatPrompts').style.display   = 'flex';
  el('chatInputArea').style.display = 'block';
  el('chatStatus').textContent = '● Online · Claude';
  setTimeout(() => el('chatInput').focus(), 100);
}

async function buildFinancialContext() {
  const cur  = await txnsThisMonth();
  const prv  = await txnsLastMonth();
  const all  = await getTxns();
  const rec  = sumBy(cur.filter(t=>t.tipo==='receita'),'valor');
  const des  = sumBy(cur.filter(t=>t.tipo==='despesa'),'valor');
  const recP = sumBy(prv.filter(t=>t.tipo==='receita'),'valor');
  const desP = sumBy(prv.filter(t=>t.tipo==='despesa'),'valor');

  const catDes = {};
  cur.filter(t=>t.tipo==='despesa').forEach(t=>{ catDes[t.cat]=(catDes[t.cat]??0)+t.valor; });
  const catTop = Object.entries(catDes).sort(([,a],[,b])=>b-a).slice(0,5)
    .map(([c,v])=>`${c}: ${fmt(v)}`).join(', ');

  const recent = [...all].sort((a,b)=>toDate(b.data)-toDate(a.data)).slice(0,8)
    .map(t=>`${fmtDate(t.data)} | ${t.desc} | ${t.tipo==='receita'?'+':'-'}${fmt(t.valor)} | ${t.cat}`).join('\n');

  return `Dados financeiros (${new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}):
- Receitas: ${fmt(rec)} (anterior: ${fmt(recP)})
- Despesas: ${fmt(des)} (anterior: ${fmt(desP)})
- Saldo: ${fmt(rec-des)}
- Maiores gastos: ${catTop||'nenhum'}
- Total registros: ${all.length}
Últimas transações:
${recent}`;
}

function appendChatMsg(role, text) {
  const msgs = el('chatMessages');
  const time = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const div  = document.createElement('div');
  div.className = `chat-msg chat-msg--${role==='user'?'user':'ai'}`;
  div.innerHTML = `<div class="chat-msg__bubble">${text.replace(/\n/g,'<br>')}</div><span class="chat-msg__time">${time}</span>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTypingIndicator() {
  const msgs = el('chatMessages');
  const div  = document.createElement('div');
  div.className = 'chat-msg chat-msg--ai';
  div.id = 'chat-typing';
  div.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

async function sendChatMessage(userMsg) {
  if (!userMsg.trim()) return;
  const apiKey = getApiKey();
  if (!apiKey) { showChatSetup(); return; }

  appendChatMsg('user', userMsg);
  _chatHistory.push({ role:'user', content:userMsg });

  const typing = showTypingIndicator();
  el('chatSend').disabled = true;
  el('chatInput').value   = '';

  try {
    const system = `Você é um assistente financeiro pessoal. Responda em português, seja conciso e prático. Use emojis com moderação. Não invente dados.\n\n${await buildFinancialContext()}`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method : 'POST',
      headers: {
        'x-api-key'                            : apiKey,
        'anthropic-version'                    : '2023-06-01',
        'content-type'                         : 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model      : 'claude-haiku-4-5-20251001',
        max_tokens : 1024,
        system,
        messages   : _chatHistory.slice(-10),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(()=>({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data  = await resp.json();
    const reply = data.content?.[0]?.text ?? '(sem resposta)';
    _chatHistory.push({ role:'assistant', content:reply });
    typing.remove();
    appendChatMsg('ai', reply);
  } catch (e) {
    typing.remove();
    appendChatMsg('ai', e.message.includes('401') ? 'API Key inválida. Verifique nas configurações.' : `Erro: ${e.message}`);
  } finally {
    el('chatSend').disabled = false;
  }
}

/* ════════════════════════════════════════
   INIT — registra todos os event listeners
   ════════════════════════════════════════ */
export function init() {
  /* Expõe funções chamadas por onclick inline */
  window._fc = {
    editTransaction,
    deleteTransaction,
    editOrcamento,
    deleteOrcamento,
  };

  /* Sidebar toggle */
  el('sidebarToggle').addEventListener('click', () => {
    const sb = el('sidebar');
    const mw = el('mainWrapper');
    if (window.innerWidth <= 768) sb.classList.toggle('open');
    else { sb.classList.toggle('collapsed'); mw.classList.toggle('expanded'); }
  });

  /* Topbar: nova transação */
  el('btnAddTransaction').addEventListener('click', () => openTransactionModal());

  /* Modal transação */
  el('modalClose').addEventListener('click', closeTransactionModal);
  el('btnCancelModal').addEventListener('click', closeTransactionModal);
  el('btnSaveTransaction').addEventListener('click', saveTransaction);
  el('modalOverlay').addEventListener('click', e => { if (e.target===e.currentTarget) closeTransactionModal(); });

  /* Modal orçamento */
  el('btnAddOrcamento').addEventListener('click', () => openOrcModal());
  el('orcClose').addEventListener('click', closeOrcModal);
  el('orcCancel').addEventListener('click', closeOrcModal);
  el('orcSave').addEventListener('click', saveOrcamento);
  el('modalOrcamento').addEventListener('click', e => { if (e.target===e.currentTarget) closeOrcModal(); });

  /* Filtros de transações */
  el('searchInput').addEventListener('input', renderTransacoes);
  el('filterTipo').addEventListener('change', renderTransacoes);
  el('filterCategoria').addEventListener('change', renderTransacoes);

  /* Chart period */
  el('chartPeriod').addEventListener('change', _buildFluxoChart);

  /* Pills — Visão Geral */
  document.querySelectorAll('.pill').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const isCustom = btn.dataset.period === 'custom';
    el('periodCustom').style.display = isCustom ? 'flex' : 'none';
    if (router.current === 'visao-geral' && !isCustom) renderVisaoGeral();
  }));

  el('btnApplyCustom').addEventListener('click', () => {
    _vgFrom = el('customFrom').value;
    _vgTo   = el('customTo').value;
    if (!_vgFrom || !_vgTo) { toast('Selecione datas de início e fim.', 'error'); return; }
    if (router.current === 'visao-geral') renderVisaoGeral();
  });

  /* Importar CSV */
  el('btnDeleteAllTxns')?.addEventListener('click', deleteAllPersonalTxns);
  el('btnImport').addEventListener('click', openImportModal);
  el('importClose').addEventListener('click', closeImportModal);
  el('importCancel').addEventListener('click', closeImportModal);
  el('modalImport').addEventListener('click', e => { if (e.target===e.currentTarget) closeImportModal(); });
  el('btnChooseFile').addEventListener('click', () => el('csvFileInput').click());

  const zone = el('uploadZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); handleFiles([...e.dataTransfer.files]); });
  el('csvFileInput').addEventListener('change', e => handleFiles([...e.target.files]));

  el('importNext').addEventListener('click', () => {
    if (el('importStep2').style.display !== 'none') confirmImport();
    else { if (!_importRows.length) { toast('Selecione ao menos um CSV.', 'error'); return; } renderImportPreview(); }
  });
  el('importBack').addEventListener('click', () => {
    el('importStep1').style.display  = '';
    el('importStep2').style.display  = 'none';
    el('importNext').textContent     = 'Avançar →';
    el('importBack').style.display   = 'none';
  });

  /* Chat IA */
  el('chatFab').addEventListener('click', toggleChat);
  el('chatClose').addEventListener('click', () => {
    _chatOpen = false;
    el('chatPanel').classList.remove('open');
    el('chatFab').style.display = 'flex';
  });
  el('btnSaveKey').addEventListener('click', () => {
    const k = el('apiKeyInput').value.trim();
    if (!k.startsWith('sk-ant-')) { toast('Chave inválida. Deve começar com "sk-ant-".', 'error'); return; }
    saveApiKey(k);
    showChatInterface();
    appendChatMsg('ai', 'Conectado! Olá, sou seu assistente financeiro. Como posso ajudar? 💰');
  });
  el('chatSettings').addEventListener('click', () => { el('apiKeyInput').value = getApiKey(); showChatSetup(); });
  el('chatSend').addEventListener('click', () => sendChatMessage(el('chatInput').value));
  el('chatInput').addEventListener('keydown', e => { if (e.key==='Enter'&&!e.shiftKey) { e.preventDefault(); sendChatMessage(e.target.value); } });
  el('chatInput').addEventListener('input', function() { this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,100)+'px'; });
  document.querySelectorAll('.prompt-chip').forEach(chip =>
    chip.addEventListener('click', () => sendChatMessage(chip.dataset.prompt)));

  /* Links internos (ex: "Ver todas →" no dashboard) */
  document.querySelectorAll('.link[data-page]').forEach(a =>
    a.addEventListener('click', e => { e.preventDefault(); router.navigate(a.dataset.page); }));
}

/* ── Atalho interno ── */
const el = id => document.getElementById(id);
