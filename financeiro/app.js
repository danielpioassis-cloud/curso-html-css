/* ════════════════════════════════════════
   FINCONTROL — app.js
════════════════════════════════════════ */

/* ─── STATE ─── */
let state = { transactions: [], orcamentos: [], nextId: 1, nextOrcId: 1 };
const KEY = 'fincontrol_v2';

const save  = () => localStorage.setItem(KEY, JSON.stringify(state));
const load  = () => { const r = localStorage.getItem(KEY); if (r) state = JSON.parse(r); else seedDemo(); };
const fmt   = v => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const today = () => new Date().toISOString().split('T')[0];

/* ─── SEED DATA ─── */
function seedDemo() {
  const now = new Date();
  const m = now.getMonth(), a = now.getFullYear();
  const d = (day, mo = m, yr = a) => new Date(yr, mo, day).toISOString().split('T')[0];

  [
    { desc:'Salário', valor:7500, tipo:'receita', cat:'Salário', data:d(5) },
    { desc:'Freelance — Landing Page', valor:1800, tipo:'receita', cat:'Freelance', data:d(12) },
    { desc:'Aluguel', valor:1500, tipo:'despesa', cat:'Moradia', data:d(1) },
    { desc:'Supermercado', valor:620, tipo:'despesa', cat:'Alimentação', data:d(8) },
    { desc:'iFood', valor:95, tipo:'despesa', cat:'Alimentação', data:d(10) },
    { desc:'Plano de saúde', valor:380, tipo:'despesa', cat:'Saúde', data:d(5) },
    { desc:'Gasolina', valor:250, tipo:'despesa', cat:'Transporte', data:d(14) },
    { desc:'Netflix', valor:45, tipo:'despesa', cat:'Assinaturas', data:d(7) },
    { desc:'Curso de JavaScript', valor:149, tipo:'despesa', cat:'Educação', data:d(3) },
    { desc:'Dividendos', valor:320, tipo:'receita', cat:'Investimentos', data:d(15) },
    { desc:'Restaurante', valor:130, tipo:'despesa', cat:'Alimentação', data:d(18) },
    { desc:'Academia', valor:99, tipo:'despesa', cat:'Saúde', data:d(2) },
    { desc:'Salário', valor:7500, tipo:'receita', cat:'Salário', data:d(5, m-1) },
    { desc:'Supermercado', valor:580, tipo:'despesa', cat:'Alimentação', data:d(9, m-1) },
    { desc:'Aluguel', valor:1500, tipo:'despesa', cat:'Moradia', data:d(1, m-1) },
    { desc:'Freelance', valor:900, tipo:'receita', cat:'Freelance', data:d(20, m-1) },
    { desc:'Gasolina', valor:200, tipo:'despesa', cat:'Transporte', data:d(11, m-1) },
    { desc:'Farmácia', valor:75, tipo:'despesa', cat:'Saúde', data:d(15, m-1) },
  ].forEach(t => state.transactions.push({ id: state.nextId++, obs: '', ...t }));

  state.orcamentos = [
    { id: state.nextOrcId++, cat: 'Alimentação', limite: 800 },
    { id: state.nextOrcId++, cat: 'Moradia', limite: 1600 },
    { id: state.nextOrcId++, cat: 'Transporte', limite: 300 },
    { id: state.nextOrcId++, cat: 'Saúde', limite: 450 },
    { id: state.nextOrcId++, cat: 'Lazer', limite: 200 },
    { id: state.nextOrcId++, cat: 'Educação', limite: 200 },
  ];
  save();
}

/* ─── HELPERS ─── */
const sumBy    = (arr, tipo) => arr.filter(t => t.tipo === tipo).reduce((s,t) => s + t.valor, 0);
const toDate   = iso => new Date(iso + 'T00:00:00');
const fmtDate  = iso => toDate(iso).toLocaleDateString('pt-BR');

function inMonth(txn, m, a) {
  const d = toDate(txn.data);
  return d.getMonth() === m && d.getFullYear() === a;
}

function txnThisMonth()  { const n = new Date(); return state.transactions.filter(t => inMonth(t, n.getMonth(), n.getFullYear())); }
function txnLastMonth()  { const n = new Date(); const p = new Date(n.getFullYear(), n.getMonth()-1,1); return state.transactions.filter(t => inMonth(t, p.getMonth(), p.getFullYear())); }
function txnInRange(from, to) {
  const f = new Date(from), t2 = new Date(to);
  return state.transactions.filter(t => { const d = toDate(t.data); return d >= f && d <= t2; });
}

function deltaLabel(cur, prev) {
  if (!prev) return '';
  const pct = ((cur - prev) / prev * 100).toFixed(1);
  return pct >= 0 ? `▲ ${pct}% vs anterior` : `▼ ${Math.abs(pct)}% vs anterior`;
}

function monthlyData(months = 6) {
  const now = new Date();
  const labels = [], recs = [], des = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    labels.push(d.toLocaleDateString('pt-BR', { month: 'short', year:'2-digit' }));
    const arr = state.transactions.filter(t => inMonth(t, d.getMonth(), d.getFullYear()));
    recs.push(sumBy(arr, 'receita'));
    des.push(sumBy(arr, 'despesa'));
  }
  return { labels, recs, des };
}

/* ─── CHART OPTIONS ─── */
const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#f43f5e','#06b6d4','#ec4899','#84cc16','#f97316','#a78bfa'];

const chartDefaults = {
  responsive: true,
  plugins: {
    legend: { labels: { color: '#64748b', font: { family: 'Inter', size: 11 }, padding: 12 } },
    tooltip: { backgroundColor: '#1a2235', borderColor: 'rgba(255,255,255,.1)', borderWidth: 1,
      titleColor: '#f0f4ff', bodyColor: '#94a3b8', padding: 10, cornerRadius: 8,
      titleFont: { family: 'Inter', weight: '600' }, bodyFont: { family: 'Inter' },
    },
  },
  scales: {
    x: { ticks: { color: '#64748b', font: { family: 'Inter' } }, grid: { color: 'rgba(255,255,255,.05)' } },
    y: { ticks: { color: '#64748b', font: { family: 'Inter' }, callback: v => fmt(v) }, grid: { color: 'rgba(255,255,255,.05)' } },
  },
};

/* ─── NAVIGATION ─── */
let _currentPage = 'dashboard';
const pageTitles = { dashboard: 'Dashboard', 'visao-geral': 'Visão Geral', transacoes: 'Transações', orcamento: 'Orçamento', relatorios: 'Relatórios' };

function navigate(page) {
  _currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById(`page-${page}`)?.classList.add('active');
  document.querySelector(`[data-page="${page}"]`)?.classList.add('active');
  document.getElementById('pageTitle').textContent = pageTitles[page] || page;
  renderPage(page);
}

function renderPage(page) {
  if (page === 'dashboard')   renderDashboard();
  if (page === 'visao-geral') renderVisaoGeral();
  if (page === 'transacoes')  renderTransacoes();
  if (page === 'orcamento')   renderOrcamento();
  if (page === 'relatorios')  renderRelatorios();
}

/* ════ DASHBOARD ════ */
let chartFluxo, chartCat;

function renderDashboard() {
  const cur = txnThisMonth(), prv = txnLastMonth();
  const rec = sumBy(cur,'receita'), des = sumBy(cur,'despesa');
  const sal = rec - des, eco = Math.max(0, sal * 0.3);
  const recP = sumBy(prv,'receita'), desP = sumBy(prv,'despesa'), salP = recP - desP;

  document.getElementById('kpi-receitas').textContent = fmt(rec);
  document.getElementById('kpi-despesas').textContent = fmt(des);
  document.getElementById('kpi-saldo').textContent    = fmt(sal);
  document.getElementById('kpi-economia').textContent = fmt(eco);
  document.getElementById('delta-receitas').textContent = deltaLabel(rec, recP);
  document.getElementById('delta-despesas').textContent = deltaLabel(des, desP);
  document.getElementById('delta-saldo').textContent    = deltaLabel(sal, salP);

  buildFluxoChart(); buildCatChart(); buildDashTable(); buildMetas();
}

function buildFluxoChart() {
  const months = parseInt(document.getElementById('chartPeriod')?.value || 6);
  const { labels, recs, des } = monthlyData(months);
  const ctx = document.getElementById('chartFluxo').getContext('2d');
  if (chartFluxo) chartFluxo.destroy();
  chartFluxo = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label:'Receitas', data:recs, backgroundColor:'rgba(16,185,129,.7)', borderRadius:5, borderSkipped:false },
        { label:'Despesas', data:des,  backgroundColor:'rgba(244,63,94,.7)',  borderRadius:5, borderSkipped:false },
      ],
    },
    options: { ...chartDefaults, plugins: { ...chartDefaults.plugins } },
  });
}

function buildCatChart() {
  const cats = {};
  txnThisMonth().filter(t => t.tipo==='despesa').forEach(t => { cats[t.cat] = (cats[t.cat]||0) + t.valor; });
  const ctx = document.getElementById('chartCategoria').getContext('2d');
  if (chartCat) chartCat.destroy();
  chartCat = new Chart(ctx, {
    type: 'doughnut',
    data: { labels: Object.keys(cats), datasets: [{ data: Object.values(cats), backgroundColor: COLORS, borderWidth: 0, hoverOffset: 8 }] },
    options: {
      responsive: true, cutout: '70%',
      plugins: {
        legend: { position:'bottom', labels: { color:'#64748b', font:{ family:'Inter', size:11 }, padding:10 } },
        tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: c => ` ${fmt(c.raw)}` } },
      },
    },
  });
}

function buildDashTable() {
  const sorted = [...state.transactions].sort((a,b) => toDate(b.data)-toDate(a.data)).slice(0,5);
  document.getElementById('dashTableBody').innerHTML = sorted.map(t => `
    <tr>
      <td>${fmtDate(t.data)}</td>
      <td style="color:var(--text)">${t.desc}</td>
      <td>${t.cat}</td>
      <td class="${t.tipo==='receita'?'val-green':'val-red'}">${t.tipo==='receita'?'+':'-'}${fmt(t.valor)}</td>
    </tr>`).join('');
}

function buildMetas() {
  const cur = txnThisMonth();
  const container = document.getElementById('metasContainer');
  const metas = state.orcamentos.slice(0,5);
  if (!metas.length) { container.innerHTML = '<p style="color:var(--text3);font-size:.8rem">Nenhuma meta definida.</p>'; return; }
  container.innerHTML = metas.map(o => {
    const gasto = sumBy(cur.filter(t => t.cat===o.cat && t.tipo==='despesa'), 'despesa');
    const pct = Math.min(100, (gasto/o.limite)*100);
    const cls = pct>=90?'danger':pct>=70?'warn':'safe';
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

/* ════ VISÃO GERAL ════ */
let vgFrom = null, vgTo = null;
let chartVgBar, chartVgPie;

function getVgRange() {
  const now = new Date();
  const pill = document.querySelector('.pill.active')?.dataset.period || 'mes';
  if (pill === 'mes') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: new Date(now.getFullYear(), now.getMonth()+1, 0) };
  }
  if (pill === 'trimestre') {
    return { from: new Date(now.getFullYear(), now.getMonth()-2, 1), to: new Date(now.getFullYear(), now.getMonth()+1, 0) };
  }
  if (pill === 'semestre') {
    return { from: new Date(now.getFullYear(), now.getMonth()-5, 1), to: new Date(now.getFullYear(), now.getMonth()+1, 0) };
  }
  if (pill === 'ano') {
    return { from: new Date(now.getFullYear(), 0, 1), to: new Date(now.getFullYear(), 11, 31) };
  }
  if (pill === 'custom' && vgFrom && vgTo) {
    return { from: new Date(vgFrom), to: new Date(vgTo) };
  }
  return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now };
}

function renderVisaoGeral() {
  const { from, to } = getVgRange();
  const fromISO = from.toISOString().split('T')[0];
  const toISO   = to.toISOString().split('T')[0];

  const arr = txnInRange(fromISO, toISO);
  const rec = sumBy(arr,'receita'), des = sumBy(arr,'despesa'), sal = rec-des;

  document.getElementById('vg-receitas').textContent = fmt(rec);
  document.getElementById('vg-despesas').textContent = fmt(des);
  document.getElementById('vg-saldo').textContent    = fmt(sal);
  document.getElementById('vg-count').textContent    = arr.length;

  const label = `${from.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})} — ${to.toLocaleDateString('pt-BR',{month:'short',year:'numeric'})}`;
  document.getElementById('vgPeriodLabel').textContent = label;

  // bar chart: group by month
  const months = new Map();
  arr.forEach(t => {
    const d = toDate(t.data);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    if (!months.has(key)) months.set(key, {rec:0,des:0});
    if (t.tipo==='receita') months.get(key).rec += t.valor;
    else months.get(key).des += t.valor;
  });
  const sortedMonths = [...months.entries()].sort(([a],[b]) => a.localeCompare(b));
  const mLabels = sortedMonths.map(([k]) => { const [y,mo] = k.split('-'); return new Date(y,mo-1,1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}); });
  const mRec = sortedMonths.map(([,v]) => v.rec);
  const mDes = sortedMonths.map(([,v]) => v.des);

  const ctx1 = document.getElementById('chartVgBar').getContext('2d');
  if (chartVgBar) chartVgBar.destroy();
  chartVgBar = new Chart(ctx1, {
    type: 'bar',
    data: {
      labels: mLabels.length ? mLabels : ['—'],
      datasets: [
        { label:'Receitas', data:mRec, backgroundColor:'rgba(16,185,129,.7)', borderRadius:5, borderSkipped:false },
        { label:'Despesas', data:mDes, backgroundColor:'rgba(244,63,94,.7)',  borderRadius:5, borderSkipped:false },
      ],
    },
    options: { ...chartDefaults },
  });

  // pie: category breakdown
  const catMap = {};
  arr.filter(t => t.tipo==='despesa').forEach(t => { catMap[t.cat] = (catMap[t.cat]||0)+t.valor; });
  const ctx2 = document.getElementById('chartVgPie').getContext('2d');
  if (chartVgPie) chartVgPie.destroy();
  chartVgPie = new Chart(ctx2, {
    type: 'doughnut',
    data: { labels: Object.keys(catMap), datasets: [{ data: Object.values(catMap), backgroundColor: COLORS, borderWidth:0, hoverOffset:8 }] },
    options: {
      responsive:true, cutout:'68%',
      plugins: {
        legend: { position:'bottom', labels:{ color:'#64748b', font:{ family:'Inter', size:11 }, padding:10 } },
        tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: c => ` ${fmt(c.raw)}` } },
      },
    },
  });

  // top despesas
  const topDes = [...arr].filter(t=>t.tipo==='despesa').sort((a,b)=>b.valor-a.valor).slice(0,10);
  document.getElementById('vgTopTable').innerHTML = topDes.map(t=>`
    <tr>
      <td>${fmtDate(t.data)}</td>
      <td style="color:var(--text)">${t.desc}</td>
      <td>${t.cat}</td>
      <td class="val-red">-${fmt(t.valor)}</td>
    </tr>`).join('') || '<tr><td colspan="4" style="text-align:center;color:var(--text3)">Nenhuma despesa</td></tr>';

  // cat table
  const totalDes = des || 1;
  const catRows = Object.entries(catMap).sort(([,a],[,b])=>b-a);
  document.getElementById('vgCatTable').innerHTML = catRows.map(([cat, v])=>`
    <tr>
      <td style="color:var(--text)">${cat}</td>
      <td class="val-red">-${fmt(v)}</td>
      <td style="color:var(--text3)">${((v/totalDes)*100).toFixed(1)}%</td>
    </tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text3)">—</td></tr>';
}

/* ════ TRANSAÇÕES ════ */
function renderTransacoes() {
  const search = document.getElementById('searchInput').value.toLowerCase();
  const tipo   = document.getElementById('filterTipo').value;
  const cat    = document.getElementById('filterCategoria').value;

  let data = [...state.transactions].sort((a,b) => toDate(b.data)-toDate(a.data));
  if (search) data = data.filter(t => t.desc.toLowerCase().includes(search) || t.cat.toLowerCase().includes(search));
  if (tipo)   data = data.filter(t => t.tipo === tipo);
  if (cat)    data = data.filter(t => t.cat === cat);

  const tbody = document.getElementById('transTableBody');
  const empty = document.getElementById('transEmpty');

  if (!data.length) { tbody.innerHTML=''; empty.style.display='flex'; return; }
  empty.style.display='none';
  tbody.innerHTML = data.map(t => `
    <tr>
      <td>${fmtDate(t.data)}</td>
      <td style="color:var(--text)">${t.desc}${t.obs?`<div style="font-size:.7rem;color:var(--text3);margin-top:.1rem">${t.obs}</div>`:''}</td>
      <td>${t.cat}</td>
      <td><span class="badge badge--${t.tipo}">${t.tipo}</span></td>
      <td class="${t.tipo==='receita'?'val-green':'val-red'}">${t.tipo==='receita'?'+':'-'}${fmt(t.valor)}</td>
      <td>
        <button class="btn-icon" onclick="editTransaction(${t.id})" title="Editar">✏️</button>
        <button class="btn-icon del" onclick="deleteTransaction(${t.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`).join('');

  const cats = [...new Set(state.transactions.map(t=>t.cat))].sort();
  const sel  = document.getElementById('filterCategoria'), curCat = sel.value;
  sel.innerHTML = '<option value="">Todas as categorias</option>' +
    cats.map(c => `<option value="${c}" ${c===curCat?'selected':''}>${c}</option>`).join('');
}

/* ════ ORÇAMENTO ════ */
function renderOrcamento() {
  const cur  = txnThisMonth();
  const grid = document.getElementById('orcamentoGrid');
  if (!state.orcamentos.length) {
    grid.innerHTML='<p style="color:var(--text3)">Nenhuma meta cadastrada.</p>'; return;
  }
  grid.innerHTML = state.orcamentos.map(o => {
    const gasto = sumBy(cur.filter(t=>t.cat===o.cat&&t.tipo==='despesa'),'despesa');
    const pct   = Math.min(100,(gasto/o.limite)*100);
    const cls   = pct>=90?'danger':pct>=70?'warn':'safe';
    const rest  = Math.max(0,o.limite-gasto);
    return `
      <div class="orc-card">
        <div class="orc-card__header">
          <span class="orc-card__title">${o.cat}</span>
          <div>
            <button class="btn-icon" onclick="editOrcamento(${o.id})">✏️</button>
            <button class="btn-icon del" onclick="deleteOrcamento(${o.id})">🗑️</button>
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

/* ════ RELATÓRIOS ════ */
let chartRel, chartRelPie;

function renderRelatorios() {
  const { labels, recs, des } = monthlyData(6);
  const ctx1 = document.getElementById('chartRelatorio').getContext('2d');
  if (chartRel) chartRel.destroy();
  chartRel = new Chart(ctx1, {
    type:'line',
    data:{ labels, datasets:[
      { label:'Receitas', data:recs, borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.1)', fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#10b981' },
      { label:'Despesas', data:des,  borderColor:'#f43f5e', backgroundColor:'rgba(244,63,94,.1)',  fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#f43f5e' },
    ]},
    options:{ ...chartDefaults },
  });

  const catMap = {};
  txnThisMonth().filter(t=>t.tipo==='despesa').forEach(t=>{ catMap[t.cat]=(catMap[t.cat]||0)+t.valor; });
  const ctx2 = document.getElementById('chartRelPie').getContext('2d');
  if (chartRelPie) chartRelPie.destroy();
  chartRelPie = new Chart(ctx2, {
    type:'pie',
    data:{ labels:Object.keys(catMap), datasets:[{ data:Object.values(catMap), backgroundColor:COLORS, borderWidth:0 }] },
    options:{ responsive:true, plugins:{ legend:{ position:'bottom', labels:{ color:'#64748b', font:{ family:'Inter', size:11 }, padding:10 } }, tooltip:{ ...chartDefaults.plugins.tooltip, callbacks:{ label:c=>` ${fmt(c.raw)}` } } } },
  });

  const cats = [...new Set(state.transactions.map(t=>t.cat))].sort();
  document.getElementById('relTableBody').innerHTML = cats.map(cat => {
    const r = sumBy(state.transactions.filter(t=>t.cat===cat),'receita');
    const d = sumBy(state.transactions.filter(t=>t.cat===cat),'despesa');
    const s = r-d;
    return `<tr>
      <td style="color:var(--text);font-weight:500">${cat}</td>
      <td class="val-green">${r?fmt(r):'—'}</td>
      <td class="val-red">${d?fmt(d):'—'}</td>
      <td class="${s>=0?'val-green':'val-red'}">${fmt(s)}</td>
    </tr>`;
  }).join('');
}

/* ════ MODAL TRANSAÇÃO ════ */
function openModal(id=null) {
  document.getElementById('modalTitle').textContent = id ? 'Editar Transação' : 'Nova Transação';
  document.getElementById('editId').value = id||'';
  if (id) {
    const t = state.transactions.find(x=>x.id===id);
    document.getElementById('fDescricao').value = t.desc;
    document.getElementById('fValor').value = t.valor;
    document.getElementById('fTipo').value = t.tipo;
    document.getElementById('fCategoria').value = t.cat;
    document.getElementById('fData').value = t.data;
    document.getElementById('fObs').value = t.obs||'';
  } else {
    document.getElementById('formTransaction').reset();
    document.getElementById('fData').value = today();
  }
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

function saveTransaction() {
  const desc  = document.getElementById('fDescricao').value.trim();
  const valor = parseFloat(document.getElementById('fValor').value);
  const tipo  = document.getElementById('fTipo').value;
  const cat   = document.getElementById('fCategoria').value;
  const data  = document.getElementById('fData').value;
  const obs   = document.getElementById('fObs').value.trim();
  const editId= document.getElementById('editId').value;
  if (!desc||!valor||!tipo||!cat||!data) { alert('Preencha todos os campos obrigatórios.'); return; }
  if (editId) {
    const idx = state.transactions.findIndex(t=>t.id===parseInt(editId));
    state.transactions[idx] = { id:parseInt(editId), desc, valor, tipo, cat, data, obs };
  } else {
    state.transactions.push({ id:state.nextId++, desc, valor, tipo, cat, data, obs });
  }
  save(); closeModal(); renderPage(_currentPage);
}

function editTransaction(id) { openModal(id); }
function deleteTransaction(id) {
  if (!confirm('Excluir esta transação?')) return;
  state.transactions = state.transactions.filter(t=>t.id!==id);
  save(); renderPage(_currentPage);
}

/* ════ MODAL ORÇAMENTO ════ */
function openOrcModal(id=null) {
  document.getElementById('orcEditId').value = id||'';
  if (id) {
    const o = state.orcamentos.find(x=>x.id===id);
    document.getElementById('orcCategoria').value = o.cat;
    document.getElementById('orcLimite').value = o.limite;
  } else { document.getElementById('formOrcamento').reset(); }
  document.getElementById('modalOrcamento').classList.add('open');
}

function closeOrcModal() { document.getElementById('modalOrcamento').classList.remove('open'); }

function saveOrcamento() {
  const cat    = document.getElementById('orcCategoria').value;
  const limite = parseFloat(document.getElementById('orcLimite').value);
  const editId = document.getElementById('orcEditId').value;
  if (!cat||!limite) { alert('Preencha todos os campos.'); return; }
  if (editId) {
    const idx = state.orcamentos.findIndex(o=>o.id===parseInt(editId));
    state.orcamentos[idx] = { id:parseInt(editId), cat, limite };
  } else {
    if (state.orcamentos.find(o=>o.cat===cat)) { alert('Já existe uma meta para esta categoria.'); return; }
    state.orcamentos.push({ id:state.nextOrcId++, cat, limite });
  }
  save(); closeOrcModal(); renderOrcamento();
}

function editOrcamento(id) { openOrcModal(id); }
function deleteOrcamento(id) {
  if (!confirm('Excluir esta meta?')) return;
  state.orcamentos = state.orcamentos.filter(o=>o.id!==id);
  save(); renderOrcamento();
}

/* ════ IMPORTAR CSV ════ */
const CATS_OPTIONS = ['Alimentação','Moradia','Transporte','Saúde','Educação','Lazer','Salário','Freelance','Investimentos','Assinaturas','Beleza','Outros'];

function autoCategoria(desc) {
  const d = desc.toLowerCase();
  if (d.includes('rdb')||d.includes('aplicação')||d.includes('dinheiro guardado')) return 'Investimentos';
  if (d.includes('barbearia')||d.includes('cabeleir')||d.includes('estetica')) return 'Beleza';
  if (d.includes('academia')||d.includes('farmácia')||d.includes('farmacia')||d.includes('vr fit')||d.includes('saúde')||d.includes('hospital')) return 'Saúde';
  if (d.includes('restaurante')||d.includes('lanchonete')||d.includes('cantina')||d.includes('padaria')||d.includes('lanches')||d.includes('bistro')||d.includes('pizza')||d.includes('mcdonald')||d.includes('paladar')||d.includes('tempero')||d.includes('cozinha')||d.includes('ifd*')||d.includes('royal')||d.includes('pastelandia')||d.includes('pastelaria')||d.includes('cafe')) return 'Alimentação';
  if (d.includes('uber')||d.includes('gasolina')||d.includes('combustiv')) return 'Transporte';
  if (d.includes('canva')||d.includes('hostinger')||d.includes('kiwify')||d.includes('udemy')) return 'Educação';
  if (d.includes('amazon prime')||d.includes('netflix')||d.includes('spotify')||d.includes('disney')||d.includes('hbo')) return 'Assinaturas';
  if (d.includes('aluguel')||d.includes('condomin')||d.includes('tmb serv')) return 'Moradia';
  return 'Outros';
}

function parseNubankCSV(text) {
  const lines = text.trim().split('\n').filter(l=>l.trim());
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    if (cols.length < 4) return null;
    const [d,m,a] = cols[0].trim().split('/');
    const valor = parseFloat(cols[1]);
    const _id = cols[2].trim();
    const desc = cols.slice(3).join(',').trim();
    if (isNaN(valor)||!d) return null;
    return { _id, data:`${a}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`, valor:Math.abs(valor), tipo:valor>=0?'receita':'despesa', cat:autoCategoria(desc), desc, obs:'' };
  }).filter(Boolean);
}

let importRows = [];

function openImportModal() {
  importRows=[];
  document.getElementById('importStep1').style.display='';
  document.getElementById('importStep2').style.display='none';
  document.getElementById('importNext').textContent='Avançar →';
  document.getElementById('importBack').style.display='none';
  document.getElementById('fileList').innerHTML='';
  document.getElementById('csvFileInput').value='';
  document.getElementById('modalImport').classList.add('open');
}
function closeImportModal() { document.getElementById('modalImport').classList.remove('open'); }

function renderImportPreview() {
  const existingIds = new Set(state.transactions.map(t=>t._nuId).filter(Boolean));
  const newRows = importRows.filter(r=>!existingIds.has(r._id));

  document.getElementById('importStep1').style.display='none';
  document.getElementById('importStep2').style.display='';
  document.getElementById('importNext').textContent='Importar';
  document.getElementById('importBack').style.display='';

  const rec = sumBy(newRows.filter(r=>r.tipo==='receita'),'valor'), des = sumBy(newRows.filter(r=>r.tipo==='despesa'),'valor');
  const dup = importRows.length - newRows.length;
  document.getElementById('importSummary').innerHTML = `
    <div class="import-stat"><strong>${newRows.length}</strong> novas transações</div>
    <div class="import-stat"><strong style="color:var(--green)">${fmt(rec)}</strong> receitas</div>
    <div class="import-stat"><strong style="color:var(--red)">${fmt(des)}</strong> despesas</div>
    ${dup?`<div class="import-stat"><strong style="color:var(--amber)">${dup}</strong> já importadas</div>`:''}`;

  document.getElementById('importTableBody').innerHTML = newRows.map((r,i)=>`
    <tr>
      <td><input type="checkbox" class="imp-chk" data-i="${i}" checked /></td>
      <td>${fmtDate(r.data)}</td>
      <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${r.desc}">${r.desc}</td>
      <td><select class="select imp-tipo" data-i="${i}"><option value="receita" ${r.tipo==='receita'?'selected':''}>Receita</option><option value="despesa" ${r.tipo==='despesa'?'selected':''}>Despesa</option></select></td>
      <td><select class="select imp-cat" data-i="${i}">${CATS_OPTIONS.map(c=>`<option ${c===r.cat?'selected':''}>${c}</option>`).join('')}</select></td>
      <td class="${r.tipo==='receita'?'val-green':'val-red'}">${fmt(r.valor)}</td>
    </tr>`).join('');

  document.getElementById('importTableBody')._rows = newRows;
  document.getElementById('checkAll').onchange = e => document.querySelectorAll('.imp-chk').forEach(c=>c.checked=e.target.checked);
}

function confirmImport() {
  const rows = document.getElementById('importTableBody')._rows||[];
  let count = 0;
  document.querySelectorAll('.imp-chk').forEach(chk => {
    if (!chk.checked) return;
    const i = parseInt(chk.dataset.i), r = rows[i];
    state.transactions.push({ id:state.nextId++, _nuId:r._id, desc:r.desc, valor:r.valor,
      tipo:document.querySelector(`.imp-tipo[data-i="${i}"]`).value,
      cat:document.querySelector(`.imp-cat[data-i="${i}"]`).value,
      data:r.data, obs:'' });
    count++;
  });
  save(); closeImportModal(); renderPage(_currentPage);
  alert(`✓ ${count} transações importadas!`);
}

/* ════ CHAT IA ════ */
const API_KEY_STORE = 'fc_apikey';
let chatHistory = [];
let chatOpen    = false;

function getApiKey()         { return localStorage.getItem(API_KEY_STORE)||''; }
function saveApiKey(k)       { localStorage.setItem(API_KEY_STORE, k); }
function hasSavedKey()       { return !!getApiKey(); }

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chatPanel').classList.toggle('open', chatOpen);
  document.getElementById('chatFab').style.display = chatOpen ? 'none' : 'flex';
  if (chatOpen) {
    if (hasSavedKey()) showChatInterface();
    else showChatSetup();
  }
}

function showChatSetup() {
  document.getElementById('chatSetup').style.display     = 'flex';
  document.getElementById('chatMessages').style.display  = 'none';
  document.getElementById('chatPrompts').style.display   = 'none';
  document.getElementById('chatInputArea').style.display = 'none';
}

function showChatInterface() {
  document.getElementById('chatSetup').style.display     = 'none';
  document.getElementById('chatMessages').style.display  = 'flex';
  document.getElementById('chatPrompts').style.display   = 'flex';
  document.getElementById('chatInputArea').style.display = 'block';
  document.getElementById('chatStatus').textContent = '● Online · Claude';
  setTimeout(() => document.getElementById('chatInput').focus(), 100);
}

function buildFinancialContext() {
  const now = new Date();
  const cur = txnThisMonth(), prv = txnLastMonth();
  const rec = sumBy(cur,'receita'), des = sumBy(cur,'despesa');
  const recP = sumBy(prv,'receita'), desP = sumBy(prv,'despesa');

  const catDes = {};
  cur.filter(t=>t.tipo==='despesa').forEach(t=>{ catDes[t.cat]=(catDes[t.cat]||0)+t.valor; });
  const catTop = Object.entries(catDes).sort(([,a],[,b])=>b-a).slice(0,5).map(([c,v])=>`${c}: ${fmt(v)}`).join(', ');

  const recent = [...state.transactions].sort((a,b)=>toDate(b.data)-toDate(a.data)).slice(0,8)
    .map(t=>`${fmtDate(t.data)} | ${t.desc} | ${t.tipo==='receita'?'+':'-'}${fmt(t.valor)} | ${t.cat}`).join('\n');

  return `Dados financeiros do usuário (${now.toLocaleDateString('pt-BR',{month:'long',year:'numeric'})}):
- Receitas do mês: ${fmt(rec)} (mês anterior: ${fmt(recP)})
- Despesas do mês: ${fmt(des)} (mês anterior: ${fmt(desP)})
- Saldo do mês: ${fmt(rec-des)}
- Maiores categorias de gasto: ${catTop || 'nenhuma'}
- Total de transações registradas: ${state.transactions.length}
Últimas transações:
${recent}`;
}

function appendMessage(role, text) {
  const msgs = document.getElementById('chatMessages');
  const time = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const div = document.createElement('div');
  div.className = `chat-msg chat-msg--${role==='user'?'user':'ai'}`;
  div.innerHTML = `<div class="chat-msg__bubble">${text.replace(/\n/g,'<br>')}</div><span class="chat-msg__time">${time}</span>`;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function showTyping() {
  const msgs = document.getElementById('chatMessages');
  const div = document.createElement('div');
  div.className = 'chat-msg chat-msg--ai'; div.id='chat-typing';
  div.innerHTML = '<div class="chat-typing"><span></span><span></span><span></span></div>';
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
  return div;
}

async function sendChatMessage(userMsg) {
  if (!userMsg.trim()) return;
  const apiKey = getApiKey();
  if (!apiKey) { showChatSetup(); return; }

  appendMessage('user', userMsg);
  chatHistory.push({ role:'user', content: userMsg });

  const typing = showTyping();
  document.getElementById('chatSend').disabled = true;
  document.getElementById('chatInput').value = '';

  try {
    const systemPrompt = `Você é um assistente financeiro pessoal inteligente e amigável. Responda sempre em português brasileiro. Seja conciso, prático e use emojis com moderação. Formate respostas longas com listas quando apropriado. Não invente dados — use apenas as informações fornecidas.\n\n${buildFinancialContext()}`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1024,
        system: systemPrompt,
        messages: chatHistory.slice(-10),
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(()=>({}));
      throw new Error(err.error?.message || `HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const reply = data.content?.[0]?.text || '(sem resposta)';
    chatHistory.push({ role:'assistant', content:reply });

    typing.remove();
    appendMessage('ai', reply);
  } catch(e) {
    typing.remove();
    const msg = e.message.includes('401') ? 'API Key inválida. Verifique nas configurações.' : `Erro: ${e.message}`;
    appendMessage('ai', msg);
  } finally {
    document.getElementById('chatSend').disabled = false;
  }
}

/* ════ INIT ════ */
document.addEventListener('DOMContentLoaded', () => {
  load();
  document.getElementById('currentDate').textContent =
    new Date().toLocaleDateString('pt-BR', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });

  renderDashboard();

  /* nav */
  document.querySelectorAll('.nav-item').forEach(el =>
    el.addEventListener('click', e => { e.preventDefault(); navigate(el.dataset.page); }));
  document.querySelectorAll('[data-page]').forEach(el =>
    el.addEventListener('click', e => { if (el.tagName==='A') { e.preventDefault(); navigate(el.dataset.page); } }));

  /* sidebar */
  document.getElementById('sidebarToggle').addEventListener('click', () => {
    const sb = document.getElementById('sidebar');
    const mw = document.getElementById('mainWrapper');
    if (window.innerWidth <= 768) { sb.classList.toggle('open'); }
    else { sb.classList.toggle('collapsed'); mw.classList.toggle('expanded'); }
  });

  /* transaction modal */
  document.getElementById('btnAddTransaction').addEventListener('click', () => openModal());
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.getElementById('btnCancelModal').addEventListener('click', closeModal);
  document.getElementById('btnSaveTransaction').addEventListener('click', saveTransaction);
  document.getElementById('modalOverlay').addEventListener('click', e => { if(e.target===e.currentTarget) closeModal(); });

  /* orc modal */
  document.getElementById('btnAddOrcamento').addEventListener('click', () => openOrcModal());
  document.getElementById('orcClose').addEventListener('click', closeOrcModal);
  document.getElementById('orcCancel').addEventListener('click', closeOrcModal);
  document.getElementById('orcSave').addEventListener('click', saveOrcamento);
  document.getElementById('modalOrcamento').addEventListener('click', e => { if(e.target===e.currentTarget) closeOrcModal(); });

  /* filters */
  document.getElementById('searchInput').addEventListener('input', renderTransacoes);
  document.getElementById('filterTipo').addEventListener('change', renderTransacoes);
  document.getElementById('filterCategoria').addEventListener('change', renderTransacoes);

  /* chart period */
  document.getElementById('chartPeriod').addEventListener('change', buildFluxoChart);

  /* import */
  document.getElementById('btnImport').addEventListener('click', openImportModal);
  document.getElementById('importClose').addEventListener('click', closeImportModal);
  document.getElementById('importCancel').addEventListener('click', closeImportModal);
  document.getElementById('modalImport').addEventListener('click', e => { if(e.target===e.currentTarget) closeImportModal(); });
  document.getElementById('btnChooseFile').addEventListener('click', () => document.getElementById('csvFileInput').click());

  const zone = document.getElementById('uploadZone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); handleFiles([...e.dataTransfer.files]); });
  document.getElementById('csvFileInput').addEventListener('change', e => handleFiles([...e.target.files]));

  function handleFiles(files) {
    const csvs = files.filter(f=>f.name.endsWith('.csv'));
    if (!csvs.length) return;
    importRows=[];
    const fl = document.getElementById('fileList'); fl.innerHTML='';
    let pending=csvs.length;
    csvs.forEach(file => {
      const item=document.createElement('div'); item.className='file-item';
      item.innerHTML=`<span>📄</span><span class="file-item__name">${file.name}</span><span class="file-item__status">lendo...</span>`;
      fl.appendChild(item);
      const reader=new FileReader();
      reader.onload=ev => { const rows=parseNubankCSV(ev.target.result); importRows.push(...rows); item.querySelector('.file-item__status').textContent=`✓ ${rows.length} linhas`; if(!--pending) document.getElementById('importNext').disabled=false; };
      reader.readAsText(file,'UTF-8');
    });
    document.getElementById('importNext').disabled=true;
  }

  document.getElementById('importNext').addEventListener('click', () => {
    if (document.getElementById('importStep2').style.display!=='none') { confirmImport(); }
    else { if(!importRows.length){alert('Selecione ao menos um CSV.');return;} renderImportPreview(); }
  });
  document.getElementById('importBack').addEventListener('click', () => {
    document.getElementById('importStep1').style.display='';
    document.getElementById('importStep2').style.display='none';
    document.getElementById('importNext').textContent='Avançar →';
    document.getElementById('importBack').style.display='none';
  });

  /* visão geral pills */
  document.querySelectorAll('.pill').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('.pill').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active');
    const isCustom = btn.dataset.period === 'custom';
    document.getElementById('periodCustom').style.display = isCustom ? 'flex' : 'none';
    if (_currentPage==='visao-geral' && !isCustom) renderVisaoGeral();
  }));

  document.getElementById('btnApplyCustom').addEventListener('click', () => {
    vgFrom = document.getElementById('customFrom').value;
    vgTo   = document.getElementById('customTo').value;
    if (!vgFrom||!vgTo) { alert('Selecione datas de início e fim.'); return; }
    if (_currentPage==='visao-geral') renderVisaoGeral();
  });

  /* chat */
  document.getElementById('chatFab').addEventListener('click', toggleChat);
  document.getElementById('chatClose').addEventListener('click', () => {
    chatOpen=false;
    document.getElementById('chatPanel').classList.remove('open');
    document.getElementById('chatFab').style.display='flex';
  });

  document.getElementById('btnSaveKey').addEventListener('click', () => {
    const k = document.getElementById('apiKeyInput').value.trim();
    if (!k.startsWith('sk-ant-')) { alert('Chave inválida. Deve começar com "sk-ant-"'); return; }
    saveApiKey(k); showChatInterface();
    appendMessage('ai', 'Conectado! Olá, sou seu assistente financeiro. Como posso ajudar? 💰');
  });

  document.getElementById('chatSettings').addEventListener('click', () => {
    document.getElementById('apiKeyInput').value = getApiKey();
    showChatSetup();
  });

  document.getElementById('chatSend').addEventListener('click', () => {
    sendChatMessage(document.getElementById('chatInput').value);
  });

  document.getElementById('chatInput').addEventListener('keydown', e => {
    if (e.key==='Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(e.target.value); }
  });

  document.getElementById('chatInput').addEventListener('input', function() {
    this.style.height='auto'; this.style.height=Math.min(this.scrollHeight,100)+'px';
  });

  document.querySelectorAll('.prompt-chip').forEach(chip =>
    chip.addEventListener('click', () => sendChatMessage(chip.dataset.prompt)));
});
