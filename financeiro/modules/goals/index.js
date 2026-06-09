/**
 * modules/goals/index.js
 *
 * Módulo universal de Metas — Phase 1.
 * Exporta: init(), renderMetas(), seedGoalsDemo()
 *
 * Schema de uma meta (store 'goals'):
 * {
 *   id       : number   (auto via db.insert)
 *   titulo   : string
 *   descricao: string
 *   modulo   : 'financeiro'|'estudos'|'treino'|'saude'|'produtividade'|'negocios'
 *   tipo     : 'valor'|'percentual'|'contagem'|'habito'
 *   meta     : number   (valor alvo)
 *   atual    : number   (progresso atual)
 *   unidade  : string   ('R$','%','kg','livros','h','km','x', …)
 *   prazo    : string   (ISO date, opcional)
 *   status   : 'ativa'|'concluida'|'pausada'
 *   cor      : string   (hex ou var CSS)
 *   criadaEm : string   (ISO date)
 * }
 */

import { db }                from '../../core/db.js';
import { router }            from '../../core/router.js';
import { store, EVENTS }     from '../../core/store.js';
import { fmt, fmtDate, today, toast, uiConfirm, sumBy } from '../../core/ui.js';

/* ── Cache ── */
let _goals = null;
const getGoals = async () => (_goals ??= await db.getAll('goals'));
const invalidate = () => { _goals = null; };

/* ═══════════════════════════════════════════
   CONSTANTES DE UI
   ═══════════════════════════════════════════ */
export const MODULOS = [
  { key: 'financeiro',    label: 'Financeiro',    emoji: '💰' },
  { key: 'estudos',       label: 'Estudos',       emoji: '📚' },
  { key: 'treino',        label: 'Treino',         emoji: '🏋️' },
  { key: 'saude',         label: 'Saúde',          emoji: '🩺' },
  { key: 'produtividade', label: 'Produtividade',  emoji: '⚡' },
  { key: 'negocios',      label: 'Negócios',       emoji: '💼' },
];

const TIPOS = [
  { key: 'valor',      label: 'Valor monetário', placeholder: '10000', unidade: 'R$'    },
  { key: 'percentual', label: 'Percentual',       placeholder: '100',   unidade: '%'     },
  { key: 'contagem',   label: 'Contagem',         placeholder: '10',    unidade: 'unid.' },
  { key: 'habito',     label: 'Hábito (dias)',    placeholder: '30',    unidade: 'dias'  },
];

const STATUS_LABEL = { ativa: 'Ativa', concluida: 'Concluída', pausada: 'Pausada' };
const STATUS_CLS   = { ativa: 'badge--receita', concluida: 'badge--green', pausada: 'badge--amber' };

const MOD_COLORS = {
  financeiro   : '#3b82f6',
  estudos      : '#8b5cf6',
  treino       : '#10b981',
  saude        : '#f43f5e',
  produtividade: '#f59e0b',
  negocios     : '#06b6d4',
};

/* ── Fontes automáticas: conectam a meta a dados reais de outras áreas ── */
const FONTES = [
  { key: 'manual',             label: '✍️ Manual (eu atualizo)',          unidade: null,       hint: 'Você atualiza o progresso à mão pelo botão "Atualizar".' },
  { key: 'saldo_banco',        label: '🏦 Saldo do banco',                unidade: 'R$',       hint: 'O progresso acompanha o saldo da sua conta automaticamente.' },
  { key: 'negocios_receita',   label: '💼 Receita de negócios (total)',   unidade: 'R$',       hint: 'Soma de todas as receitas lançadas nas empresas.' },
  { key: 'negocios_lucro',     label: '💼 Lucro de negócios (total)',     unidade: 'R$',       hint: 'Receitas menos despesas das empresas.' },
  { key: 'tarefas_concluidas', label: '✅ Tarefas concluídas',            unidade: 'tarefas',  hint: 'Conta as tarefas marcadas como concluídas na Produtividade.' },
  { key: 'habito',             label: '🔥 Check-ins de um hábito',        unidade: 'dias',     hint: 'Conta os check-ins de um hábito específico.' },
];
const isAuto = fonte => fonte && fonte !== 'manual';

/* Lê dados de outras áreas para calcular metas automáticas (sem acoplar módulos) */
async function _buildAutoCtx() {
  const txns       = await db.getAll('transactions');
  const bizR       = sumBy(txns.filter(t => t.business_id != null && t.tipo === 'receita'), 'valor');
  const bizD       = sumBy(txns.filter(t => t.business_id != null && t.tipo === 'despesa'), 'valor');
  const personal   = txns.filter(t => !t.business_id || (t.cat === 'Salário' && t.desc?.startsWith('Pró Labore')));
  const net        = sumBy(personal.filter(t => t.tipo === 'receita'), 'valor')
                   - sumBy(personal.filter(t => t.tipo === 'despesa'), 'valor');
  const baseMeta   = await db.get('_meta', 'saldo_banco_base');
  const saldoBanco = (baseMeta?.value ?? 0) + net;
  const tasks      = await db.getAll('tasks');
  const tarefasDone= tasks.filter(t => t.status === 'done').length;
  const logs       = await db.getAll('habit_logs');
  const habitCheck = {};
  logs.forEach(l => { habitCheck[l.habit_id] = (habitCheck[l.habit_id] ?? 0) + 1; });
  return { saldoBanco, bizReceita: bizR, bizLucro: bizR - bizD, tarefasDone, habitCheck };
}

function _autoAtual(g, ctx) {
  switch (g.fonte) {
    case 'saldo_banco':        return Math.max(0, ctx.saldoBanco);
    case 'negocios_receita':   return ctx.bizReceita;
    case 'negocios_lucro':     return Math.max(0, ctx.bizLucro);
    case 'tarefas_concluidas': return ctx.tarefasDone;
    case 'habito':             return ctx.habitCheck[g.habit_id] ?? 0;
    default:                   return g.atual;
  }
}

/* Resolve uma meta para os valores efetivos (atual/status ao vivo se for automática) */
function _resolve(g, ctx) {
  if (!isAuto(g.fonte)) return { ...g, _auto: false };
  const atual  = _autoAtual(g, ctx);
  const status = (g.meta > 0 && atual >= g.meta) ? 'concluida'
               : (g.status === 'concluida' ? 'ativa' : g.status);
  return { ...g, atual, status, _auto: true };
}

/* ═══════════════════════════════════════════
   SEED
   ═══════════════════════════════════════════ */
export async function seedGoalsDemo() {
  const seeded = await db.get('_meta', 'goals_seeded');
  if (seeded?.value) return;
  await db.put('_meta', { key: 'goals_seeded', value: true });

  const existing = await db.getAll('goals');
  if (existing.length) return;

  const demos = [
    { titulo:'Reserva de emergência', descricao:'6 meses de despesas guardados', modulo:'financeiro',    tipo:'valor',      meta:30000, atual:12500, unidade:'R$',   prazo: offsetDate(180), status:'ativa',    cor: MOD_COLORS.financeiro    },
    { titulo:'Quitar cartão',         descricao:'Zerar dívida do cartão Nubank', modulo:'financeiro',    tipo:'valor',      meta:3200,  atual:1800,  unidade:'R$',   prazo: offsetDate(60),  status:'ativa',    cor: MOD_COLORS.financeiro    },
    { titulo:'Ler 12 livros',         descricao:'Um livro por mês',              modulo:'estudos',       tipo:'contagem',   meta:12,    atual:4,     unidade:'livros',prazo: offsetDate(240), status:'ativa',    cor: MOD_COLORS.estudos       },
    { titulo:'Curso de TypeScript',   descricao:'Completar trilha na Udemy',     modulo:'estudos',       tipo:'percentual', meta:100,   atual:65,    unidade:'%',    prazo: offsetDate(45),  status:'ativa',    cor: MOD_COLORS.estudos       },
    { titulo:'Correr 5km sem parar',  descricao:'Meta de condicionamento',       modulo:'treino',        tipo:'contagem',   meta:5,     atual:3.2,   unidade:'km',   prazo: offsetDate(90),  status:'ativa',    cor: MOD_COLORS.treino        },
    { titulo:'30 dias de meditação',  descricao:'Hábito diário de 10 minutos',   modulo:'saude',         tipo:'habito',     meta:30,    atual:12,    unidade:'dias', prazo: offsetDate(30),  status:'ativa',    cor: MOD_COLORS.saude         },
    { titulo:'Primeira venda online', descricao:'Produto digital lançado',       modulo:'negocios',      tipo:'contagem',   meta:1,     atual:1,     unidade:'venda',prazo: offsetDate(-5),  status:'concluida',cor: MOD_COLORS.negocios      },
    { titulo:'10.000 passos/dia',     descricao:'Hábito de caminhada diária',    modulo:'saude',         tipo:'habito',     meta:30,    atual:8,     unidade:'dias', prazo: offsetDate(22),  status:'ativa',    cor: MOD_COLORS.saude         },
  ];

  for (const g of demos) {
    await db.insert('goals', { ...g, criadaEm: today() });
  }
  invalidate();
}

function offsetDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/* ═══════════════════════════════════════════
   RENDER PRINCIPAL
   ═══════════════════════════════════════════ */
export async function renderMetas() {
  const filterMod    = el('goalFilterMod').value;
  const filterStatus = el('goalFilterStatus').value;

  const ctx      = await _buildAutoCtx();
  const resolved = (await getGoals()).map(g => _resolve(g, ctx));

  let goals = resolved;
  if (filterMod)    goals = goals.filter(g => g.modulo  === filterMod);
  if (filterStatus) goals = goals.filter(g => g.status  === filterStatus);

  // Ordena: ativas primeiro, depois por prazo
  goals = goals.sort((a, b) => {
    const statusOrd = { ativa: 0, pausada: 1, concluida: 2 };
    if (statusOrd[a.status] !== statusOrd[b.status]) return statusOrd[a.status] - statusOrd[b.status];
    if (a.prazo && b.prazo) return a.prazo.localeCompare(b.prazo);
    return 0;
  });

  _renderKpis(resolved);
  _renderCards(goals);
}

function _renderKpis(all) {
  const ativas   = all.filter(g => g.status === 'ativa').length;
  const concl    = all.filter(g => g.status === 'concluida').length;
  const total    = all.length;
  const avgPct   = total
    ? Math.round(all.reduce((s, g) => s + Math.min(100, g.meta > 0 ? (g.atual / g.meta) * 100 : 0), 0) / total)
    : 0;
  const vencendo = all.filter(g => {
    if (g.status !== 'ativa' || !g.prazo) return false;
    const dias = Math.ceil((new Date(g.prazo) - new Date()) / 86400000);
    const pct  = g.meta > 0 ? (g.atual / g.meta) * 100 : 0;
    return dias <= 14 && pct < 80;
  }).length;

  el('goal-kpi-ativas').textContent  = ativas;
  el('goal-kpi-concl').textContent   = concl;
  el('goal-kpi-avg').textContent     = `${avgPct}%`;
  el('goal-kpi-alert').textContent   = vencendo;
  el('goal-kpi-alert').closest('.kpi-card').className =
    `kpi-card kpi-card--${vencendo > 0 ? 'red' : 'green'}`;
}

function _renderCards(goals) {
  const grid = el('goalsGrid');

  if (!goals.length) {
    grid.innerHTML = `
      <div class="goals-empty">
        <div class="goals-empty__icon">🎯</div>
        <p class="goals-empty__title">Nenhuma meta encontrada</p>
        <p class="goals-empty__sub">Crie sua primeira meta e comece a acompanhar seu progresso.</p>
        <button class="btn btn--primary" onclick="window._goals.openGoalModal()">+ Nova Meta</button>
      </div>`;
    return;
  }

  grid.innerHTML = goals.map(g => _goalCardHTML(g)).join('');
}

function _goalCardHTML(g) {
  const pct      = g.meta > 0 ? Math.min(100, (g.atual / g.meta) * 100) : 0;
  const pctFmt   = pct.toFixed(0);
  const barCls   = pct >= 100 ? 'safe' : pct >= 70 ? 'warn' : pct >= 40 ? '' : 'danger';
  const modInfo  = MODULOS.find(m => m.key === g.modulo) ?? { emoji: '🎯', label: g.modulo };
  const fmtVal   = (v) => g.tipo === 'valor' ? fmt(v) : `${v.toLocaleString('pt-BR')} ${g.unidade}`;

  /* Prazo */
  let prazoHTML = '';
  if (g.prazo) {
    const dias  = Math.ceil((new Date(g.prazo) - new Date()) / 86400000);
    const past  = dias < 0;
    const soon  = dias >= 0 && dias <= 7;
    prazoHTML = `<span class="goal-prazo ${past ? 'goal-prazo--past' : soon ? 'goal-prazo--soon' : ''}">
      ${past ? `⚠️ Venceu há ${Math.abs(dias)}d` : dias === 0 ? '⚠️ Vence hoje' : `📅 ${dias}d restantes`}
    </span>`;
  }

  return `
    <div class="goal-card ${g.status === 'concluida' ? 'goal-card--done' : ''}" data-id="${g.id}">
      <div class="goal-card__top" style="background:${g.cor ?? MOD_COLORS[g.modulo] ?? '#3b82f6'}22;border-left:3px solid ${g.cor ?? MOD_COLORS[g.modulo] ?? '#3b82f6'}">
        <div class="goal-card__meta">
          <span class="goal-mod-badge">${modInfo.emoji} ${modInfo.label}</span>
          ${g._auto ? '<span class="goal-auto-badge" title="Atualiza sozinha com dados do sistema">🔗 Auto</span>' : ''}
          <span class="badge ${STATUS_CLS[g.status] ?? ''}">${STATUS_LABEL[g.status] ?? g.status}</span>
        </div>
        <h4 class="goal-card__title">${g.titulo}</h4>
        ${g.descricao ? `<p class="goal-card__desc">${g.descricao}</p>` : ''}
      </div>

      <div class="goal-card__body">
        <div class="goal-progress-header">
          <span class="goal-vals">${fmtVal(g.atual)} <span class="goal-sep">/</span> ${fmtVal(g.meta)}</span>
          <span class="goal-pct" style="color:${g.cor ?? MOD_COLORS[g.modulo] ?? '#3b82f6'}">${pctFmt}%</span>
        </div>
        <div class="progress progress--thin">
          <div class="progress__fill ${barCls}"
               style="width:${pct.toFixed(2)}%;background:${g.cor ?? MOD_COLORS[g.modulo] ?? '#3b82f6'}">
          </div>
        </div>
        ${prazoHTML}
      </div>

      <div class="goal-card__footer">
        ${g._auto
          ? '<span class="goal-auto-note">🔗 Atualização automática</span>'
          : `<button class="btn btn--ghost btn--xs" onclick="window._goals.openProgressModal(${g.id})">📈 Atualizar</button>`}
        <div>
          <button class="btn-icon" onclick="window._goals.openGoalModal(${g.id})" title="Editar">✏️</button>
          <button class="btn-icon del" onclick="window._goals.deleteGoal(${g.id})" title="Excluir">🗑️</button>
        </div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════
   MODAL — CRIAR / EDITAR META
   ═══════════════════════════════════════════ */
export async function openGoalModal(id = null) {
  el('goalModalTitle').textContent = id ? 'Editar Meta' : 'Nova Meta';
  el('goalEditId').value           = id ?? '';

  // Preenche select de módulos
  el('goalModulo').innerHTML = MODULOS.map(m =>
    `<option value="${m.key}">${m.emoji} ${m.label}</option>`).join('');

  // Preenche select de tipos
  el('goalTipo').innerHTML = TIPOS.map(t =>
    `<option value="${t.key}">${t.label}</option>`).join('');

  // Preenche select de fontes
  el('goalFonte').innerHTML = FONTES.map(f =>
    `<option value="${f.key}">${f.label}</option>`).join('');

  // Preenche select de hábitos (para fonte=habito)
  const habits = (await db.getAll('habits')).filter(h => h.status === 'ativo');
  el('goalHabit').innerHTML = habits.length
    ? habits.map(h => `<option value="${h.id}">${h.icone} ${h.nome}</option>`).join('')
    : '<option value="">Nenhum hábito ativo — crie um na Produtividade</option>';

  if (id) {
    const g = (await getGoals()).find(x => x.id === id);
    if (!g) return;
    el('goalTitulo').value    = g.titulo;
    el('goalDescricao').value = g.descricao ?? '';
    el('goalModulo').value    = g.modulo;
    el('goalTipo').value      = g.tipo;
    el('goalFonte').value     = g.fonte ?? 'manual';
    if (g.habit_id) el('goalHabit').value = g.habit_id;
    el('goalMeta').value      = g.meta;
    el('goalAtual').value     = g.atual;
    el('goalUnidade').value   = g.unidade;
    el('goalPrazo').value     = g.prazo ?? '';
    el('goalStatus').value    = g.status;
  } else {
    el('goalForm').reset();
    el('goalFonte').value  = 'manual';
    el('goalStatus').value = 'ativa';
    el('goalPrazo').value  = offsetDate(90);
    _syncUnidade();
  }

  _syncFonte();
  el('modalGoal').classList.add('open');
}

/* Ajusta a UI do modal conforme a fonte escolhida */
function _syncFonte() {
  const fonte = el('goalFonte').value;
  const info  = FONTES.find(f => f.key === fonte);
  const auto  = isAuto(fonte);

  el('goalFonteHint').textContent = info?.hint ?? '';
  el('goalHabitRow').style.display = fonte === 'habito' ? '' : 'none';

  // Metas automáticas calculam o "atual" sozinhas → esconde o campo manual
  el('goalAtualWrap').style.display = auto ? 'none' : '';

  // Sugere a unidade da fonte
  if (auto && info?.unidade) el('goalUnidade').value = info.unidade;
}

function closeGoalModal() { el('modalGoal').classList.remove('open'); }

function _syncUnidade() {
  const tipo = TIPOS.find(t => t.key === el('goalTipo').value);
  if (tipo) {
    el('goalUnidade').value       = tipo.unidade;
    el('goalMeta').placeholder    = tipo.placeholder;
  }
}

async function saveGoal() {
  const titulo   = el('goalTitulo').value.trim();
  const modulo   = el('goalModulo').value;
  const tipo     = el('goalTipo').value;
  const fonte    = el('goalFonte').value || 'manual';
  const habit_id = fonte === 'habito' ? (parseInt(el('goalHabit').value) || null) : null;
  const meta     = parseFloat(el('goalMeta').value);
  const atual    = isAuto(fonte) ? 0 : (parseFloat(el('goalAtual').value) || 0);
  const unidade  = el('goalUnidade').value.trim() || 'unid.';
  const prazo    = el('goalPrazo').value || null;
  const status   = el('goalStatus').value;
  const descricao= el('goalDescricao').value.trim();
  const editId   = el('goalEditId').value;

  if (!titulo || !modulo || !tipo || isNaN(meta)) {
    toast('Preencha título, módulo, tipo e meta.', 'error');
    return;
  }
  if (fonte === 'habito' && !habit_id) {
    toast('Selecione o hábito a vincular (ou crie um na Produtividade).', 'error');
    return;
  }

  const cor = MOD_COLORS[modulo] ?? '#3b82f6';

  if (editId) {
    const old = (await getGoals()).find(x => x.id === parseInt(editId)) ?? {};
    await db.put('goals', { ...old, id: parseInt(editId), titulo, descricao, modulo, tipo, fonte, habit_id, meta, atual, unidade, prazo, status, cor });
    toast('Meta atualizada!', 'success');
  } else {
    await db.insert('goals', { titulo, descricao, modulo, tipo, fonte, habit_id, meta, atual, unidade, prazo, status, cor, criadaEm: today() });
    toast('Meta criada! 🎯', 'success');
  }

  invalidate();
  store.emit(EVENTS.GOAL_CHANGED);
  closeGoalModal();
  await renderMetas();
}

/* ═══════════════════════════════════════════
   MODAL — ATUALIZAR PROGRESSO
   ═══════════════════════════════════════════ */
export async function openProgressModal(id) {
  const g = (await getGoals()).find(x => x.id === id);
  if (!g) return;

  el('progEditId').value     = id;
  el('progTitulo').textContent = g.titulo;
  el('progAtual').value      = g.atual;
  el('progMeta').textContent = `/ ${g.meta.toLocaleString('pt-BR')} ${g.unidade}`;
  el('progUnidade').textContent = g.unidade;

  /* Mini barra de preview */
  const pct = Math.min(100, g.meta > 0 ? (g.atual / g.meta) * 100 : 0);
  el('progBar').style.width      = `${pct.toFixed(2)}%`;
  el('progBar').style.background = g.cor ?? MOD_COLORS[g.modulo] ?? '#3b82f6';
  el('progPct').textContent      = `${pct.toFixed(0)}%`;

  el('modalProgress').classList.add('open');
  setTimeout(() => el('progAtual').select(), 80);
}

function closeProgressModal() { el('modalProgress').classList.remove('open'); }

async function saveProgress() {
  const id    = parseInt(el('progEditId').value);
  const atual = parseFloat(el('progAtual').value);
  if (isNaN(atual) || atual < 0) { toast('Valor inválido.', 'error'); return; }

  const g = (await getGoals()).find(x => x.id === id);
  if (!g) return;

  const status = atual >= g.meta ? 'concluida' : g.status === 'concluida' ? 'ativa' : g.status;
  await db.put('goals', { ...g, atual, status });

  if (status === 'concluida' && g.status !== 'concluida') {
    toast(`🎉 Meta "${g.titulo}" concluída!`, 'success', 5000);
  } else {
    toast('Progresso atualizado!', 'success');
  }

  invalidate();
  store.emit(EVENTS.GOAL_CHANGED);
  closeProgressModal();
  await renderMetas();
}

/* ═══════════════════════════════════════════
   DELETE
   ═══════════════════════════════════════════ */
export async function deleteGoal(id) {
  const g = (await getGoals()).find(x => x.id === id);
  if (!await uiConfirm(`Excluir a meta "${g?.titulo}"?`, { title: 'Excluir meta' })) return;
  await db.delete('goals', id);
  invalidate();
  store.emit(EVENTS.GOAL_CHANGED);
  toast('Meta removida.', 'info');
  await renderMetas();
}

/* ═══════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════ */
export function init() {
  window._goals = { openGoalModal, openProgressModal, deleteGoal };

  /* Botão nova meta */
  el('btnAddGoal').addEventListener('click', () => openGoalModal());

  /* Modal goal */
  el('goalModalClose').addEventListener('click', closeGoalModal);
  el('goalCancel').addEventListener('click', closeGoalModal);
  el('goalSave').addEventListener('click', saveGoal);
  el('modalGoal').addEventListener('click', e => { if (e.target === e.currentTarget) closeGoalModal(); });

  /* Sync unidade ao trocar tipo */
  el('goalTipo').addEventListener('change', _syncUnidade);

  /* Sync UI ao trocar a fonte de progresso */
  el('goalFonte').addEventListener('change', _syncFonte);

  /* Metas automáticas se atualizam quando dados de outras áreas mudam */
  store.on(EVENTS.TRANSACTION_CHANGED, () => {
    if (router.current === 'metas') renderMetas();
  });

  /* Modal progresso */
  el('progClose').addEventListener('click', closeProgressModal);
  el('progCancel').addEventListener('click', closeProgressModal);
  el('progSave').addEventListener('click', saveProgress);
  el('modalProgress').addEventListener('click', e => { if (e.target === e.currentTarget) closeProgressModal(); });

  /* Preview barra de progresso ao digitar */
  el('progAtual').addEventListener('input', async () => {
    const id  = parseInt(el('progEditId').value);
    const g   = (await getGoals()).find(x => x.id === id);
    if (!g) return;
    const pct = Math.min(100, g.meta > 0 ? (parseFloat(el('progAtual').value) / g.meta) * 100 : 0) || 0;
    el('progBar').style.width = `${pct.toFixed(2)}%`;
    el('progPct').textContent = `${pct.toFixed(0)}%`;
  });

  /* Filtros */
  el('goalFilterMod').addEventListener('change', renderMetas);
  el('goalFilterStatus').addEventListener('change', renderMetas);
}

/* ── Atalho interno ── */
const el = id => document.getElementById(id);
