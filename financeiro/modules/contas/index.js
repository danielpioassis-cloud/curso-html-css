/**
 * modules/contas/index.js — Contas a pagar (Finanças Pessoais)
 *
 * Store: contas
 * {
 *   id, nome, credor, categoria, valor, valor_pago,
 *   vencimento (ISO date), recorrente (bool), status ('pendente'|'paga'),
 *   obs, criadaEm
 * }
 *
 * Também gerencia a "Previsibilidade" no Dashboard:
 *   renda prevista (em _meta) − gastos fixos (soma das contas) = sobra prevista
 */

import { db }            from '../../core/db.js';
import { store, EVENTS } from '../../core/store.js';
import { fmt, fmtDate, today, toDate, sumBy, inMonth, toast, uiConfirm } from '../../core/ui.js';

const el = id => document.getElementById(id);

/* ── cache ── */
let _contas = null;
const getContas  = async () => (_contas ??= await db.getAll('contas'));
const invalidate = () => { _contas = null; };

/* ── constantes ── */
const CATS = ['Moradia','Energia','Água','Internet','Telefone','Streaming','Cartão de Crédito',
              'Empréstimo','Financiamento','Educação','Saúde','Seguro','Transporte','Assinaturas','Outros'];
const META_RENDA = 'renda_prevista';

/* ── helpers de status ── */
function statusReal(c) {
  const falta = (c.valor ?? 0) - (c.valor_pago ?? 0);
  if (falta <= 0.001) return 'paga';
  if (c.vencimento && toDate(c.vencimento) < new Date(today())) return 'atrasada';
  return 'pendente';
}
const STATUS_INFO = {
  paga:     { label: 'Paga',     cls: 'conta-badge--paga',     icon: '✅' },
  pendente: { label: 'Pendente', cls: 'conta-badge--pendente', icon: '🕒' },
  atrasada: { label: 'Atrasada', cls: 'conta-badge--atrasada', icon: '⚠️' },
};

/* ════════════════════════════════════════
   SEED
   ════════════════════════════════════════ */
export async function seedContasDemo() {
  if ((await db.getAll('contas')).length) return;
  const now = new Date(), y = now.getFullYear(), m = now.getMonth();
  const dia = d => new Date(y, m, d).toISOString().split('T')[0];

  const demos = [
    { nome:'Aluguel',            credor:'Imobiliária Vista',   categoria:'Moradia',           valor:1500, valor_pago:1500, vencimento:dia(5),  recorrente:true, obs:'' },
    { nome:'Energia Elétrica',   credor:'CPFL',                categoria:'Energia',           valor:230,  valor_pago:0,    vencimento:dia(12), recorrente:true, obs:'' },
    { nome:'Internet Fibra',     credor:'Vivo',                categoria:'Internet',          valor:120,  valor_pago:0,    vencimento:dia(15), recorrente:true, obs:'500MB' },
    { nome:'Fatura Nubank',      credor:'Nubank',              categoria:'Cartão de Crédito', valor:1840, valor_pago:0,    vencimento:dia(10), recorrente:true, obs:'' },
    { nome:'Plano de Saúde',     credor:'Unimed',              categoria:'Saúde',             valor:380,  valor_pago:380,  vencimento:dia(5),  recorrente:true, obs:'' },
    { nome:'Financiamento Carro',credor:'Banco Santander',     categoria:'Financiamento',     valor:890,  valor_pago:0,    vencimento:dia(20), recorrente:true, obs:'36/60' },
  ];
  for (const d of demos) await db.insert('contas', { ...d, status:'pendente', criadaEm: today() });
  invalidate();
}

/* ════════════════════════════════════════
   PÁGINA CONTAS
   ════════════════════════════════════════ */
let _filterStatus = '';

export async function renderContas() {
  const contas = await getContas();

  /* KPIs */
  const totalMes   = sumBy(contas, 'valor');
  const totalPago  = sumBy(contas, 'valor_pago');
  const totalFalta = totalMes - totalPago;
  const atrasadas  = contas.filter(c => statusReal(c) === 'atrasada');

  el('conta-kpi-total').textContent    = fmt(totalMes);
  el('conta-kpi-pago').textContent     = fmt(totalPago);
  el('conta-kpi-falta').textContent    = fmt(totalFalta);
  el('conta-kpi-atrasadas').textContent= atrasadas.length;

  /* Barra de progresso geral */
  const pct = totalMes > 0 ? (totalPago / totalMes) * 100 : 0;
  if (el('conta-progress-bar')) {
    el('conta-progress-bar').style.width = pct.toFixed(1) + '%';
    el('conta-progress-label').textContent = `${pct.toFixed(0)}% quitado`;
  }

  /* Filtro */
  let rows = [...contas];
  if (_filterStatus) rows = rows.filter(c => statusReal(c) === _filterStatus);
  rows.sort((a, b) => {
    // atrasadas primeiro, depois por vencimento
    const sa = statusReal(a), sb = statusReal(b);
    const ord = { atrasada: 0, pendente: 1, paga: 2 };
    if (ord[sa] !== ord[sb]) return ord[sa] - ord[sb];
    return (a.vencimento || '').localeCompare(b.vencimento || '');
  });

  /* Tabela */
  el('contasTableBody').innerHTML = rows.map(c => {
    const st    = statusReal(c);
    const info  = STATUS_INFO[st];
    const falta = (c.valor ?? 0) - (c.valor_pago ?? 0);
    const venc  = c.vencimento ? fmtDate(c.vencimento) : '—';
    const vencCls = st === 'atrasada' ? 'style="color:var(--red);font-weight:600"' : 'style="color:var(--text2)"';
    return `<tr>
      <td>
        <div style="font-weight:600;color:var(--text)">${c.nome}</div>
        ${c.recorrente ? '<span class="conta-recorrente">↻ mensal</span>' : ''}
      </td>
      <td style="color:var(--text2)">${c.credor || '—'}</td>
      <td><span class="badge badge--cat">${c.categoria}</span></td>
      <td ${vencCls}>${venc}</td>
      <td class="val-red" style="font-weight:600">${fmt(c.valor)}</td>
      <td class="val-green">${fmt(c.valor_pago ?? 0)}</td>
      <td class="${falta > 0 ? 'val-red' : 'val-green'}" style="font-weight:600">${falta > 0 ? fmt(falta) : '—'}</td>
      <td><span class="conta-badge ${info.cls}">${info.icon} ${info.label}</span></td>
      <td style="white-space:nowrap">
        ${st !== 'paga' ? `<button class="btn-icon" onclick="window._contas.marcarPaga(${c.id})" title="Marcar como paga">💰</button>` : ''}
        <button class="btn-icon" onclick="window._contas.editConta(${c.id})" title="Editar">✏️</button>
        <button class="btn-icon del" onclick="window._contas.deleteConta(${c.id})" title="Excluir">🗑️</button>
      </td>
    </tr>`;
  }).join('') || `<tr><td colspan="9" style="text-align:center;color:var(--text3);padding:2.5rem">
    Nenhuma conta cadastrada.
    <button class="btn btn--primary btn--sm" style="margin-left:.75rem" onclick="window._contas.openContaModal()">+ Adicionar conta</button>
  </td></tr>`;
}

/* ════════════════════════════════════════
   MODAL — CONTA
   ════════════════════════════════════════ */
async function openContaModal(id = null) {
  el('contaModalTitle').textContent = id ? 'Editar Conta' : 'Nova Conta';
  el('contaEditId').value           = id ?? '';
  el('contaCategoria').innerHTML    = CATS.map(c => `<option>${c}</option>`).join('');

  if (id) {
    const c = (await getContas()).find(x => x.id === id);
    if (!c) return;
    el('contaNome').value       = c.nome;
    el('contaCredor').value     = c.credor ?? '';
    el('contaCategoria').value  = c.categoria;
    el('contaValor').value      = c.valor;
    el('contaValorPago').value  = c.valor_pago ?? 0;
    el('contaVencimento').value = c.vencimento ?? '';
    el('contaRecorrente').checked = !!c.recorrente;
    el('contaObs').value        = c.obs ?? '';
  } else {
    el('contaForm').reset();
    const now = new Date();
    el('contaVencimento').value = new Date(now.getFullYear(), now.getMonth(), 10).toISOString().split('T')[0];
    el('contaValorPago').value  = 0;
    el('contaRecorrente').checked = true;
  }
  el('modalConta').classList.add('open');
}
const closeContaModal = () => el('modalConta').classList.remove('open');

async function saveConta() {
  const nome       = el('contaNome').value.trim();
  const credor     = el('contaCredor').value.trim();
  const categoria  = el('contaCategoria').value;
  const valor      = parseFloat(el('contaValor').value);
  const valor_pago = parseFloat(el('contaValorPago').value) || 0;
  const vencimento = el('contaVencimento').value;
  const recorrente = el('contaRecorrente').checked;
  const obs        = el('contaObs').value.trim();
  const editId     = el('contaEditId').value;

  if (!nome || isNaN(valor)) { toast('Preencha nome e valor.', 'error'); return; }
  if (valor_pago > valor)    { toast('Valor pago não pode exceder o valor total.', 'error'); return; }

  const rec = { nome, credor, categoria, valor, valor_pago, vencimento, recorrente, obs, status:'pendente' };

  if (editId) {
    const old = (await getContas()).find(x => x.id === parseInt(editId));
    await db.put('contas', { ...old, ...rec });
    toast('Conta atualizada!', 'success');
  } else {
    await db.insert('contas', { ...rec, criadaEm: today() });
    toast('Conta adicionada! 📋', 'success');
  }
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  closeContaModal();
  await renderContas();
}

export async function editConta(id) { await openContaModal(id); }

export async function deleteConta(id) {
  const c = (await getContas()).find(x => x.id === id);
  if (!await uiConfirm(`Excluir a conta "${c?.nome}"?`, { title: 'Excluir conta' })) return;
  await db.delete('contas', id);
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  toast('Conta removida.', 'info');
  await renderContas();
}

export async function marcarPaga(id) {
  const c = (await getContas()).find(x => x.id === id);
  if (!c) return;
  await db.put('contas', { ...c, valor_pago: c.valor, status: 'paga' });
  invalidate();
  store.emit(EVENTS.TRANSACTION_CHANGED);
  toast(`✅ "${c.nome}" marcada como paga!`, 'success');
  await renderContas();
}

/* ════════════════════════════════════════
   PREVISIBILIDADE (Dashboard)
   ════════════════════════════════════════ */
export async function renderPrevisibilidade() {
  if (!el('prevRendaInput')) return;

  const meta   = await db.get('_meta', META_RENDA);
  const renda  = meta?.value ?? 0;
  if (document.activeElement !== el('prevRendaInput')) el('prevRendaInput').value = renda || '';

  const contas      = await getContas();
  const gastosFixos = sumBy(contas, 'valor');
  const jaPago      = sumBy(contas, 'valor_pago');
  const aPagar      = gastosFixos - jaPago;

  /* Gastos variáveis reais do mês (transações pessoais de despesa) */
  const now  = new Date();
  const txns = (await db.getAll('transactions')).filter(t =>
    (!t.business_id || (t.cat === 'Salário' && t.desc?.startsWith('Pró Labore'))) &&
    t.tipo === 'despesa' &&
    inMonth(t.data, now.getMonth(), now.getFullYear())
  );
  const gastosVar = sumBy(txns, 'valor');

  const sobra = renda - gastosFixos;

  el('prev-fixos').textContent    = fmt(gastosFixos);
  el('prev-apagar').textContent   = fmt(aPagar);
  el('prev-variaveis').textContent= fmt(gastosVar);
  el('prev-sobra').textContent    = fmt(sobra);
  el('prev-sobra').className      = 'prev-result__value ' + (sobra >= 0 ? 'val-green' : 'val-red');

  /* Barra: proporção fixos vs renda */
  const pctFixos = renda > 0 ? Math.min(100, (gastosFixos / renda) * 100) : 0;
  if (el('prev-bar-fixos')) {
    el('prev-bar-fixos').style.width = pctFixos.toFixed(1) + '%';
    el('prev-bar-fixos').className = 'prev-bar__fill ' +
      (pctFixos >= 90 ? 'prev-bar__fill--danger' : pctFixos >= 70 ? 'prev-bar__fill--warn' : '');
  }
  if (el('prev-pct-label')) {
    el('prev-pct-label').textContent = renda > 0
      ? `Suas contas fixas consomem ${pctFixos.toFixed(0)}% da renda prevista`
      : 'Informe sua renda prevista para calcular';
  }

  /* Mensagem contextual */
  const msgEl = el('prev-msg');
  if (msgEl) {
    if (renda <= 0) {
      msgEl.textContent = '';
    } else if (sobra < 0) {
      msgEl.textContent = '🔴 Atenção: suas contas fixas superam a renda prevista.';
      msgEl.style.color = 'var(--red)';
    } else if (pctFixos >= 70) {
      msgEl.textContent = '🟡 Suas contas fixas estão altas. Sobra apertada para gastos variáveis.';
      msgEl.style.color = 'var(--amber, #f59e0b)';
    } else {
      msgEl.textContent = `🟢 Boa! Você terá ${fmt(sobra)} previstos para gastos variáveis e poupança.`;
      msgEl.style.color = 'var(--green)';
    }
  }
}

async function saveRenda() {
  const val = parseFloat(el('prevRendaInput').value) || 0;
  await db.put('_meta', { key: META_RENDA, value: val });
  await renderPrevisibilidade();
}

/* ════════════════════════════════════════
   INIT
   ════════════════════════════════════════ */
export function init() {
  window._contas = { openContaModal, editConta, deleteConta, marcarPaga };

  /* Página contas */
  el('btnAddConta')?.addEventListener('click', () => openContaModal());
  el('contaModalClose')?.addEventListener('click', closeContaModal);
  el('contaCancel')?.addEventListener('click', closeContaModal);
  el('contaSave')?.addEventListener('click', saveConta);
  el('modalConta')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeContaModal(); });

  document.querySelectorAll('.conta-filter').forEach(btn =>
    btn.addEventListener('click', () => {
      _filterStatus = btn.dataset.status;
      document.querySelectorAll('.conta-filter').forEach(b => b.classList.toggle('active', b === btn));
      renderContas();
    }));

  /* Previsibilidade — salva renda ao digitar (debounce simples) */
  let _t = null;
  el('prevRendaInput')?.addEventListener('input', () => {
    clearTimeout(_t);
    _t = setTimeout(saveRenda, 400);
  });
}
