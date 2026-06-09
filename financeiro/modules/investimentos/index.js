/**
 * modules/investimentos/index.js — Phase 2.5
 *
 * Store: investments
 * { id, ativo, categoria, valor_investido, valor_atual,
 *   data_inicio, corretora, obs, criadaEm }
 *
 * Duas abas:
 *   Carteira   — listagem + doughnut por categoria
 *   Calculadora— juros compostos com gráfico e tabela anual
 */

import { db }            from '../../core/db.js';
import { fmt, fmtDate, today, toast, CHART_COLORS, chartDefaults } from '../../core/ui.js';

/* ── cache ── */
let _inv = null;
const getInv  = async () => (_inv ??= await db.getAll('investments'));
const invalidate = () => { _inv = null; };
const el = id => document.getElementById(id);

/* ── constantes ── */
const CATS = ['Renda Fixa','Tesouro Direto','CDB/LCI/LCA','Ações','FII','Crypto','Previdência','Outro'];
const CAT_COLOR = {
  'Renda Fixa'   : '#10b981', 'Tesouro Direto': '#3b82f6',
  'CDB/LCI/LCA'  : '#06b6d4', 'Ações'         : '#f59e0b',
  'FII'          : '#8b5cf6', 'Crypto'        : '#f43f5e',
  'Previdência'  : '#ec4899', 'Outro'         : '#64748b',
};

let _tab = 'carteira';
let _chartPortfolio = null;
let _chartCalc      = null;

/* ════════════════════════════════════════
   SEED
   ════════════════════════════════════════ */
export async function seedInvestimentosDemo() {
  if ((await db.getAll('investments')).length) return;
  const demos = [
    { ativo:'Tesouro Selic 2027',   categoria:'Tesouro Direto', valor_investido:10000, valor_atual:10850, data_inicio:'2025-01-10', corretora:'Nubank',  obs:'' },
    { ativo:'PETR4',                categoria:'Ações',          valor_investido:3500,  valor_atual:3920,  data_inicio:'2025-03-15', corretora:'Clear',   obs:'Petrobras' },
    { ativo:'HGLG11',               categoria:'FII',            valor_investido:2800,  valor_atual:2950,  data_inicio:'2025-02-01', corretora:'Clear',   obs:'Logística' },
    { ativo:'CDB Nubank 130% CDI',  categoria:'CDB/LCI/LCA',   valor_investido:5000,  valor_atual:5380,  data_inicio:'2024-06-01', corretora:'Nubank',  obs:'Venc. 2026' },
    { ativo:'Bitcoin',              categoria:'Crypto',         valor_investido:1500,  valor_atual:2100,  data_inicio:'2025-01-01', corretora:'Binance', obs:'' },
  ];
  for (const d of demos) await db.insert('investments', { ...d, criadaEm: today() });
  invalidate();
}

/* ════════════════════════════════════════
   RENDER PRINCIPAL
   ════════════════════════════════════════ */
export async function renderInvestimentos() {
  _syncTabs();
  if (_tab === 'carteira')    await _renderCarteira();
  else                              _renderCalculadora();
}

function _syncTabs() {
  document.querySelectorAll('.inv-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _tab));
  el('inv-panel-carteira').style.display    = _tab === 'carteira'    ? '' : 'none';
  el('inv-panel-calculadora').style.display = _tab === 'calculadora' ? '' : 'none';
}

/* ── Carteira ── */
async function _renderCarteira() {
  const invs        = await getInv();
  const totalInv    = invs.reduce((s,i) => s + i.valor_investido, 0);
  const totalAtual  = invs.reduce((s,i) => s + i.valor_atual, 0);
  const rend        = totalAtual - totalInv;
  const rentab      = totalInv > 0 ? (rend / totalInv) * 100 : 0;

  el('inv-kpi-invested').textContent  = fmt(totalInv);
  el('inv-kpi-atual').textContent     = fmt(totalAtual);
  el('inv-kpi-rend').textContent      = (rend >= 0 ? '+' : '') + fmt(rend);
  el('inv-kpi-pct').textContent       = (rentab >= 0 ? '+' : '') + rentab.toFixed(2) + '%';
  el('inv-kpi-rend').className        = rend   >= 0 ? 'kpi-card__value val-green' : 'kpi-card__value val-red';
  el('inv-kpi-pct').className         = rentab >= 0 ? 'kpi-card__value val-green' : 'kpi-card__value val-red';

  /* Doughnut por categoria */
  const catMap = {};
  invs.forEach(i => { catMap[i.categoria] = (catMap[i.categoria] ?? 0) + i.valor_atual; });
  _chartPortfolio?.destroy();
  if (invs.length) {
    _chartPortfolio = new Chart(el('chartInvDoughnut').getContext('2d'), {
      type: 'doughnut',
      data: {
        labels: Object.keys(catMap),
        datasets: [{ data: Object.values(catMap), backgroundColor: Object.keys(catMap).map(k => CAT_COLOR[k] ?? '#64748b'), borderWidth: 0, hoverOffset: 8 }],
      },
      options: { responsive: true, cutout: '68%',
        plugins: { legend: { position: 'bottom', labels: { color: '#64748b', font: { family: 'Inter', size: 11 }, padding: 10 } },
          tooltip: { ...chartDefaults.plugins.tooltip, callbacks: { label: c => ` ${fmt(c.raw)}` } } } },
    });
  }

  /* Tabela */
  const sorted = [...invs].sort((a, b) => b.valor_atual - a.valor_atual);
  el('invTableBody').innerHTML = sorted.map(inv => {
    const r   = inv.valor_atual - inv.valor_investido;
    const rp  = inv.valor_investido > 0 ? ((r / inv.valor_investido) * 100).toFixed(2) : '0.00';
    const cls = r >= 0 ? 'val-green' : 'val-red';
    const sig = r >= 0 ? '+' : '';
    return `<tr>
      <td style="color:var(--text);font-weight:600">${inv.ativo}</td>
      <td><span class="badge" style="background:${CAT_COLOR[inv.categoria] ?? '#64748b'}22;color:${CAT_COLOR[inv.categoria] ?? '#64748b'}">${inv.categoria}</span></td>
      <td class="val-green">${fmt(inv.valor_atual)}</td>
      <td style="color:var(--text3)">${fmt(inv.valor_investido)}</td>
      <td class="${cls}">${sig}${fmt(r)}</td>
      <td class="${cls}">${sig}${rp}%</td>
      <td style="color:var(--text3)">${inv.corretora || '—'}</td>
      <td style="color:var(--text3);font-size:.75rem">${inv.data_inicio ? fmtDate(inv.data_inicio) : '—'}</td>
      <td>
        <button class="btn-icon" onclick="window._inv.editInv(${inv.id})" title="Editar">✏️</button>
        <button class="btn-icon del" onclick="window._inv.deleteInv(${inv.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:2rem">Nenhum ativo cadastrado. Clique em "+ Novo Ativo" para começar.</td></tr>';
}

/* ── Calculadora de Juros Compostos ── */
function _renderCalculadora() { /* HTML estático, cálculo por evento */ }

function _calcular() {
  const pv    = parseFloat(el('calcPV').value)     || 0;
  const pmt   = parseFloat(el('calcPMT').value)    || 0;
  const rYear = parseFloat(el('calcRate').value)   || 0;
  const anos  = parseInt(el('calcPeriod').value)   || 0;
  if (!anos) return;

  const n      = anos * 12;
  const rMonth = Math.pow(1 + rYear / 100, 1 / 12) - 1;

  let balance  = pv;
  let aportado = pv;
  const points = [];

  for (let i = 1; i <= n; i++) {
    balance  = balance * (1 + rMonth) + pmt;
    aportado += pmt;
    if (i % 12 === 0) points.push({ year: i / 12, balance, aportado });
  }

  const fv   = balance;
  const rend = fv - aportado;
  const rPct = aportado > 0 ? ((rend / aportado) * 100) : 0;

  el('calcResult-fv').textContent   = fmt(fv);
  el('calcResult-inv').textContent  = fmt(aportado);
  el('calcResult-rend').textContent = '+' + fmt(rend);
  el('calcResult-pct').textContent  = '+' + rPct.toFixed(2) + '%';

  /* Gráfico */
  _chartCalc?.destroy();
  el('calcResultBox').style.display = '';
  _chartCalc = new Chart(el('chartCalc').getContext('2d'), {
    type: 'line',
    data: {
      labels: points.map(p => `${p.year}a`),
      datasets: [
        { label: 'Patrimônio Total', data: points.map(p => +p.balance.toFixed(2)), borderColor: '#10b981', backgroundColor: 'rgba(16,185,129,.12)', fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#10b981' },
        { label: 'Total Aportado',   data: points.map(p => +p.aportado.toFixed(2)), borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,.08)',  fill: true, tension: .35, pointRadius: 3, pointBackgroundColor: '#3b82f6' },
      ],
    },
    options: { ...chartDefaults, plugins: { ...chartDefaults.plugins, legend: { ...chartDefaults.plugins.legend, display: true } } },
  });

  /* Tabela anual */
  el('calcAnnualBody').innerHTML = points.map(p => {
    const r = p.balance - p.aportado;
    return `<tr>
      <td style="color:var(--text2)">${p.year} ${p.year === 1 ? 'ano' : 'anos'}</td>
      <td style="color:var(--text3)">${fmt(p.aportado)}</td>
      <td class="val-green">${fmt(p.balance)}</td>
      <td class="val-green">+${fmt(r)}</td>
      <td class="val-green">+${p.aportado > 0 ? ((r/p.aportado)*100).toFixed(1) : 0}%</td>
    </tr>`;
  }).join('');
}

/* ════════════════════════════════════════
   MODAL — ATIVO
   ════════════════════════════════════════ */
async function openInvModal(id = null) {
  el('invModalTitle').textContent = id ? 'Editar Ativo' : 'Novo Ativo';
  el('invEditId').value           = id ?? '';
  el('invCategoria').innerHTML    = CATS.map(c => `<option>${c}</option>`).join('');

  if (id) {
    const inv = (await getInv()).find(x => x.id === id);
    if (!inv) return;
    el('invAtivo').value       = inv.ativo;
    el('invCategoria').value   = inv.categoria;
    el('invVlrInvest').value   = inv.valor_investido;
    el('invVlrAtual').value    = inv.valor_atual;
    el('invDataInicio').value  = inv.data_inicio;
    el('invCorretora').value   = inv.corretora ?? '';
    el('invObs').value         = inv.obs ?? '';
  } else {
    el('invForm').reset();
    el('invDataInicio').value = today();
  }
  el('modalInv').classList.add('open');
}
const closeInvModal = () => el('modalInv').classList.remove('open');

async function saveInv() {
  const ativo           = el('invAtivo').value.trim();
  const categoria       = el('invCategoria').value;
  const valor_investido = parseFloat(el('invVlrInvest').value);
  const valor_atual     = parseFloat(el('invVlrAtual').value);
  const data_inicio     = el('invDataInicio').value;
  const corretora       = el('invCorretora').value.trim();
  const obs             = el('invObs').value.trim();
  const editId          = el('invEditId').value;

  if (!ativo || isNaN(valor_investido) || isNaN(valor_atual)) {
    toast('Preencha ativo, valor investido e valor atual.', 'error'); return;
  }
  const rec = { ativo, categoria, valor_investido, valor_atual, data_inicio, corretora, obs, criadaEm: today() };
  if (editId) { await db.put('investments', { ...rec, id: parseInt(editId) }); toast('Ativo atualizado!', 'success'); }
  else        { await db.insert('investments', rec);                           toast('Ativo adicionado! 📈', 'success'); }

  invalidate();
  closeInvModal();
  await renderInvestimentos();
}

export async function editInv(id)   { await openInvModal(id); }
export async function deleteInv(id) {
  
  await db.delete('investments', id);
  invalidate();
  toast('Ativo removido.', 'info');
  await renderInvestimentos();
}

/* ════════════════════════════════════════
   INIT
   ════════════════════════════════════════ */
export function init() {
  window._inv = { editInv, deleteInv, openInvModal, _calcular };

  document.querySelectorAll('.inv-tab').forEach(btn =>
    btn.addEventListener('click', () => { _tab = btn.dataset.tab; renderInvestimentos(); }));

  el('invModalClose').addEventListener('click', closeInvModal);
  el('invCancel').addEventListener('click', closeInvModal);
  el('invSave').addEventListener('click', saveInv);
  el('modalInv').addEventListener('click', e => { if (e.target === e.currentTarget) closeInvModal(); });
}
