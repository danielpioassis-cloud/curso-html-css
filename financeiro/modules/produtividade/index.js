/**
 * modules/produtividade/index.js  —  Phase 3
 *
 * Stores: projects, tasks, habits, habit_logs
 *
 * Schema:
 *  projects  : { id, nome, cor, descricao, status:'ativo'|'concluido'|'pausado', criadaEm }
 *  tasks     : { id, titulo, project_id?, status:'todo'|'doing'|'done', prioridade:'baixa'|'media'|'alta', prazo?, criadaEm }
 *  habits    : { id, nome, icone, frequencia:'diario'|'semanal', cor, meta_dias, status:'ativo'|'pausado', criadaEm }
 *  habit_logs: { id, habit_id, data }  — um por check-in
 */

import { db }            from '../../core/db.js';
import { store, EVENTS } from '../../core/store.js';
import { today, fmtDate, toast } from '../../core/ui.js';

/* ── Cache ── */
let _projects = null, _tasks = null, _habits = null, _logs = null;
const getProjects = async () => (_projects ??= await db.getAll('projects'));
const getTasks    = async () => (_tasks    ??= await db.getAll('tasks'));
const getHabits   = async () => (_habits   ??= await db.getAll('habits'));
const getLogs     = async () => (_logs     ??= await db.getAll('habit_logs'));
const invalidate  = ()  => { _projects = _tasks = _habits = _logs = null; };

const PRIO_ORDER = { alta: 0, media: 1, baixa: 2 };
const PRIO_CLS   = { alta:'badge--red', media:'badge--amber', baixa:'badge--blue-dim' };
const PRIO_EMOJI = { alta:'🔴', media:'🟡', baixa:'🟢' };
const PROJ_COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#f43f5e','#06b6d4'];
const HABIT_ICONS = ['💪','📚','🧘','🏃','💧','🥗','💤','✍️','🎯','🛠️'];

/* ════════════════════════════════════════
   SEED
   ════════════════════════════════════════ */
export async function seedProdutividadeDemo() {
  if ((await db.getAll('projects')).length) return;

  const p1 = await db.insert('projects', { nome:'Painel de Vida', cor:'#3b82f6', descricao:'Sistema de controle pessoal integrado', status:'ativo', criadaEm: today() });
  const p2 = await db.insert('projects', { nome:'Curso TypeScript', cor:'#8b5cf6', descricao:'Trilha completa na Udemy', status:'ativo', criadaEm: today() });

  const tasks = [
    { titulo:'Implementar módulo de negócios',    project_id: p1.id, status:'done',  prioridade:'alta',  prazo: offset(-2) },
    { titulo:'Criar módulo de produtividade',     project_id: p1.id, status:'done',  prioridade:'alta',  prazo: offset(0)  },
    { titulo:'Dashboard unificado (Fase 5)',      project_id: p1.id, status:'doing', prioridade:'alta',  prazo: offset(14) },
    { titulo:'Exportar relatório PDF',            project_id: p1.id, status:'todo',  prioridade:'media', prazo: offset(21) },
    { titulo:'Notificações de vencimento',        project_id: p1.id, status:'todo',  prioridade:'baixa', prazo: offset(30) },
    { titulo:'Assistir seção: Generics',          project_id: p2.id, status:'done',  prioridade:'media', prazo: offset(-5) },
    { titulo:'Exercícios de Decorators',          project_id: p2.id, status:'doing', prioridade:'media', prazo: offset(3)  },
    { titulo:'Projeto final do curso',            project_id: p2.id, status:'todo',  prioridade:'alta',  prazo: offset(20) },
    { titulo:'Revisar notas de estudo',           project_id: null,  status:'todo',  prioridade:'baixa', prazo: offset(7)  },
  ];
  for (const t of tasks) await db.insert('tasks', { ...t, criadaEm: today() });

  const habits = [
    { nome:'Beber 2L de água',  icone:'💧', frequencia:'diario',  cor:'#06b6d4', meta_dias:30, status:'ativo', criadaEm: today() },
    { nome:'Ler 20 minutos',    icone:'📚', frequencia:'diario',  cor:'#8b5cf6', meta_dias:30, status:'ativo', criadaEm: today() },
    { nome:'Treinar',           icone:'💪', frequencia:'diario',  cor:'#10b981', meta_dias:30, status:'ativo', criadaEm: today() },
    { nome:'Meditação',         icone:'🧘', frequencia:'diario',  cor:'#f59e0b', meta_dias:30, status:'ativo', criadaEm: today() },
    { nome:'Revisar finanças',  icone:'💰', frequencia:'semanal', cor:'#3b82f6', meta_dias:12, status:'ativo', criadaEm: today() },
  ];
  for (const h of habits) await db.insert('habits', h);

  // Logs de exemplo — últimos 10 dias aleatórios
  const allHabits = await db.getAll('habits');
  const allH = allHabits.slice(-5);
  for (let i = 0; i < 10; i++) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const iso = d.toISOString().split('T')[0];
    for (const h of allH) {
      if (Math.random() > 0.35) await db.insert('habit_logs', { habit_id: h.id, data: iso });
    }
  }

  invalidate();
}

function offset(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

/* ════════════════════════════════════════
   RENDER PRINCIPAL
   ════════════════════════════════════════ */
let _activeTab = 'tarefas';

export async function renderProdutividade() {
  _renderSubTabs();
  await _renderTab(_activeTab);
}

function _renderSubTabs() {
  document.querySelectorAll('.prod-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === _activeTab));
  ['tarefas','projetos','habitos'].forEach(t => {
    const p = el(`prod-panel-${t}`);
    if (p) p.style.display = t === _activeTab ? '' : 'none';
  });
}

async function _renderTab(tab) {
  if (tab === 'tarefas')  await _renderTarefas();
  if (tab === 'projetos') await _renderProjetos();
  if (tab === 'habitos')  await _renderHabitos();
}

/* ─────────────────────────
   TAREFAS — kanban 3 cols
   ───────────────────────── */
async function _renderTarefas() {
  const projects  = await getProjects();
  const filterPrj = el('taskFilterProj').value;
  const filterPri = el('taskFilterPrio').value;

  // Popula filtro de projeto
  const sel = el('taskFilterProj');
  const prevVal = sel.value;
  sel.innerHTML = '<option value="">Todos os projetos</option><option value="none">Sem projeto</option>' +
    projects.map(p => `<option value="${p.id}" ${String(p.id)===prevVal?'selected':''}>${p.nome}</option>`).join('');

  let tasks = await getTasks();
  if (filterPrj === 'none') tasks = tasks.filter(t => !t.project_id);
  else if (filterPrj)       tasks = tasks.filter(t => String(t.project_id) === filterPrj);
  if (filterPri)             tasks = tasks.filter(t => t.prioridade === filterPri);

  // KPIs
  const all = await getTasks();
  el('task-kpi-total').textContent = all.length;
  el('task-kpi-doing').textContent = all.filter(t=>t.status==='doing').length;
  el('task-kpi-done').textContent  = all.filter(t=>t.status==='done').length;
  const today_due = all.filter(t => t.status !== 'done' && t.prazo && t.prazo <= today()).length;
  el('task-kpi-atrasadas').textContent = today_due;
  el('task-kpi-atrasadas').closest('.kpi-card').className = `kpi-card kpi-card--${today_due > 0 ? 'red' : 'green'}`;

  const cols = { todo: [], doing: [], done: [] };
  tasks.sort((a,b) => PRIO_ORDER[a.prioridade] - PRIO_ORDER[b.prioridade]).forEach(t => cols[t.status]?.push(t));

  const colData = [
    { key:'todo',  label:'📋 A Fazer',      count: cols.todo.length  },
    { key:'doing', label:'⚙️ Em Andamento', count: cols.doing.length },
    { key:'done',  label:'✅ Concluído',    count: cols.done.length  },
  ];

  el('kanbanBoard').innerHTML = colData.map(({ key, label, count }) => `
    <div class="kanban-col">
      <div class="kanban-col__header">
        <span>${label}</span>
        <span class="kanban-col__count">${count}</span>
      </div>
      <div class="kanban-col__body kanban-drop-zone" id="kanban-${key}" data-status="${key}">
        ${cols[key].map(t => _taskCardHTML(t, projects)).join('') || `<div class="kanban-empty">Nenhuma tarefa</div>`}
      </div>
    </div>`).join('');

  // Ativa drag-and-drop após render
  _setupDnD();
}

/* Drag-and-drop entre colunas (HTML5 DnD API) */
function _setupDnD() {
  let draggingId = null;

  document.querySelectorAll('.task-card[data-id]').forEach(card => {
    card.draggable = true;
    card.addEventListener('dragstart', e => {
      draggingId = parseInt(card.dataset.id);
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(draggingId));
      requestAnimationFrame(() => card.classList.add('dragging'));
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      document.querySelectorAll('.kanban-drop-zone').forEach(z => z.classList.remove('drag-over'));
    });
  });

  document.querySelectorAll('.kanban-drop-zone').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', e => {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const id = parseInt(e.dataTransfer.getData('text/plain'));
      const newStatus = zone.dataset.status;
      if (id && newStatus) await moveTask(id, newStatus);
    });
  });
}

function _taskCardHTML(t, projects) {
  const proj  = projects.find(p => p.id === t.project_id);
  const past  = t.prazo && t.prazo < today() && t.status !== 'done';
  const soon  = t.prazo && t.prazo === today() && t.status !== 'done';
  const prazoStr = t.prazo
    ? `<span class="task-prazo ${past?'task-prazo--past':soon?'task-prazo--soon':''}">${past?'⚠️ ':soon?'⏰ ':'📅 '}${fmtDate(t.prazo)}</span>`
    : '';

  const nextStatus = t.status === 'todo' ? 'doing' : t.status === 'doing' ? 'done' : 'todo';
  const moveLabel  = t.status === 'todo' ? '▶ Iniciar' : t.status === 'doing' ? '✓ Concluir' : '↩ Reabrir';

  return `
    <div class="task-card ${t.status === 'done' ? 'task-card--done' : ''}" data-id="${t.id}">
      <div class="task-card__header">
        <span class="badge ${PRIO_CLS[t.prioridade] ?? ''}">${PRIO_EMOJI[t.prioridade]} ${t.prioridade}</span>
        ${proj ? `<span class="task-proj" style="color:${proj.cor}">${proj.nome}</span>` : ''}
      </div>
      <p class="task-card__title">${t.titulo}</p>
      ${prazoStr}
      <div class="task-card__footer">
        <button class="btn btn--ghost btn--xs" onclick="window._prod.moveTask(${t.id},'${nextStatus}')">${moveLabel}</button>
        <div>
          <button class="btn-icon" onclick="window._prod.editTask(${t.id})">✏️</button>
          <button class="btn-icon del" onclick="window._prod.deleteTask(${t.id})">🗑️</button>
        </div>
      </div>
    </div>`;
}

/* ─────────────────────────
   PROJETOS
   ───────────────────────── */
async function _renderProjetos() {
  const projects = await getProjects();
  const tasks    = await getTasks();
  const grid     = el('projetosGrid');

  if (!projects.length) {
    grid.innerHTML = `<div class="goals-empty" style="grid-column:1/-1"><div class="goals-empty__icon">📁</div><p class="goals-empty__title">Nenhum projeto criado</p><button class="btn btn--primary" onclick="window._prod.openProjectModal()">+ Novo Projeto</button></div>`;
    return;
  }

  grid.innerHTML = projects.map(p => {
    const pt    = tasks.filter(t => t.project_id === p.id);
    const done  = pt.filter(t => t.status === 'done').length;
    const total = pt.length;
    const pct   = total ? Math.round((done/total)*100) : 0;
    const stCls = p.status === 'ativo' ? 'badge--receita' : p.status === 'concluido' ? 'badge--green' : 'badge--amber';
    return `
      <div class="goal-card">
        <div class="goal-card__top" style="background:${p.cor}22;border-left:3px solid ${p.cor}">
          <div class="goal-card__meta">
            <span class="goal-mod-badge">📁 Projeto</span>
            <span class="badge ${stCls}">${p.status}</span>
          </div>
          <h4 class="goal-card__title">${p.nome}</h4>
          ${p.descricao ? `<p class="goal-card__desc">${p.descricao}</p>` : ''}
        </div>
        <div class="goal-card__body">
          <div class="goal-progress-header">
            <span class="goal-vals">${done} <span class="goal-sep">/</span> ${total} tarefas</span>
            <span class="goal-pct" style="color:${p.cor}">${pct}%</span>
          </div>
          <div class="progress progress--thin">
            <div class="progress__fill" style="width:${pct}%;background:${p.cor}"></div>
          </div>
        </div>
        <div class="goal-card__footer">
          <button class="btn btn--ghost btn--xs" onclick="window._prod.filterByProject(${p.id})">📋 Ver tarefas</button>
          <div>
            <button class="btn-icon" onclick="window._prod.editProject(${p.id})">✏️</button>
            <button class="btn-icon del" onclick="window._prod.deleteProject(${p.id})">🗑️</button>
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ─────────────────────────
   HÁBITOS
   ───────────────────────── */
async function _renderHabitos() {
  const habits = (await getHabits()).filter(h => h.status === 'ativo');
  const logs   = await getLogs();
  const t = today();

  // KPIs
  const allH = await getHabits();
  el('habit-kpi-total').textContent   = allH.filter(h=>h.status==='ativo').length;
  const checkedToday = habits.filter(h => logs.some(l => l.habit_id===h.id && l.data===t)).length;
  el('habit-kpi-hoje').textContent    = `${checkedToday}/${habits.length}`;
  const avgStreak = habits.length
    ? Math.round(habits.reduce((s,h) => s + _streak(h.id, logs), 0) / habits.length)
    : 0;
  el('habit-kpi-streak').textContent  = avgStreak;

  const grid = el('habitosGrid');
  if (!habits.length) {
    grid.innerHTML = `<div class="goals-empty" style="grid-column:1/-1"><div class="goals-empty__icon">🔥</div><p class="goals-empty__title">Nenhum hábito ativo</p><button class="btn btn--primary" onclick="window._prod.openHabitModal()">+ Criar hábito</button></div>`;
    return;
  }

  grid.innerHTML = habits.map(h => {
    const todayDone  = logs.some(l => l.habit_id===h.id && l.data===t);
    const streak     = _streak(h.id, logs);
    const last7      = _last7(h.id, logs);
    const pct        = h.meta_dias > 0
      ? Math.min(100, Math.round((logs.filter(l=>l.habit_id===h.id).length / h.meta_dias)*100))
      : 0;
    const dots = last7.map(day => `<div class="habit-dot ${day.done?'habit-dot--on':''}" title="${day.date}"></div>`).join('');
    return `
      <div class="habit-card ${todayDone ? 'habit-card--done' : ''}">
        <div class="habit-card__top">
          <span class="habit-icon">${h.icone}</span>
          <div class="habit-card__info">
            <span class="habit-card__name">${h.nome}</span>
            <span class="habit-card__freq">${h.frequencia}</span>
          </div>
          <div>
            <button class="btn-icon" onclick="window._prod.editHabit(${h.id})">✏️</button>
            <button class="btn-icon del" onclick="window._prod.deleteHabit(${h.id})">🗑️</button>
          </div>
        </div>
        <div class="habit-dots">${dots}</div>
        <div class="habit-card__stats">
          <span>🔥 ${streak} dias seguidos</span>
          <span style="color:var(--text2)">${pct}% da meta</span>
        </div>
        <div class="progress" style="height:4px;margin:.5rem 0">
          <div class="progress__fill safe" style="width:${pct}%;background:${h.cor}"></div>
        </div>
        <button class="btn ${todayDone ? 'btn--ghost' : 'btn--primary'} btn--sm" style="width:100%"
          onclick="window._prod.toggleHabitToday(${h.id})">
          ${todayDone ? '✅ Feito hoje' : '⬜ Marcar hoje'}
        </button>
      </div>`;
  }).join('');
}

function _streak(habitId, logs) {
  let count = 0;
  const d = new Date();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const iso = d.toISOString().split('T')[0];
    if (!logs.some(l => l.habit_id === habitId && l.data === iso)) break;
    count++;
    d.setDate(d.getDate() - 1);
    if (count > 365) break;
  }
  return count;
}

function _last7(habitId, logs) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - (6 - i));
    const date = d.toISOString().split('T')[0];
    return { date, done: logs.some(l => l.habit_id === habitId && l.data === date) };
  });
}

/* ════════════════════════════════════════
   ACTIONS — TAREFAS
   ════════════════════════════════════════ */
export async function moveTask(id, newStatus) {
  const t = (await getTasks()).find(x => x.id === id);
  if (!t) return;
  await db.put('tasks', { ...t, status: newStatus });
  if (newStatus === 'done') toast('Tarefa concluída! ✅', 'success');
  invalidate();
  await _renderTarefas();
}

async function openTaskModal(id = null) {
  el('taskModalTitle').textContent = id ? 'Editar Tarefa' : 'Nova Tarefa';
  el('taskEditId').value = id ?? '';

  const projects = await getProjects();
  el('taskProject').innerHTML = '<option value="">Sem projeto</option>' +
    projects.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

  if (id) {
    const t = (await getTasks()).find(x => x.id === id);
    if (!t) return;
    el('taskTitulo').value       = t.titulo;
    el('taskProject').value      = t.project_id ?? '';
    el('taskPrioridade').value   = t.prioridade;
    el('taskStatus').value       = t.status;
    el('taskPrazo').value        = t.prazo ?? '';
  } else {
    el('taskForm').reset();
    el('taskPrioridade').value = 'media';
    el('taskStatus').value     = 'todo';
  }
  el('modalTask').classList.add('open');
}
const closeTaskModal = () => el('modalTask').classList.remove('open');

async function saveTask() {
  const titulo     = el('taskTitulo').value.trim();
  const project_id = parseInt(el('taskProject').value) || null;
  const prioridade = el('taskPrioridade').value;
  const status     = el('taskStatus').value;
  const prazo      = el('taskPrazo').value || null;
  const editId     = el('taskEditId').value;

  if (!titulo) { toast('Informe o título da tarefa.', 'error'); return; }

  if (editId) {
    const t = (await getTasks()).find(x => x.id === parseInt(editId));
    await db.put('tasks', { ...t, titulo, project_id, prioridade, status, prazo });
    toast('Tarefa atualizada!', 'success');
  } else {
    await db.insert('tasks', { titulo, project_id, prioridade, status, prazo, criadaEm: today() });
    toast('Tarefa criada!', 'success');
  }
  invalidate();
  closeTaskModal();
  await _renderTarefas();
}

export async function editTask(id)   { await openTaskModal(id); }
export async function deleteTask(id) {
  
  await db.delete('tasks', id);
  invalidate();
  toast('Tarefa removida.', 'info');
  await _renderTarefas();
}

/* ════════════════════════════════════════
   ACTIONS — PROJETOS
   ════════════════════════════════════════ */
async function openProjectModal(id = null) {
  el('projModalTitle').textContent = id ? 'Editar Projeto' : 'Novo Projeto';
  el('projEditId').value = id ?? '';
  if (id) {
    const p = (await getProjects()).find(x => x.id === id);
    if (!p) return;
    el('projNome').value    = p.nome;
    el('projDesc').value    = p.descricao ?? '';
    el('projCor').value     = p.cor;
    el('projStatus').value  = p.status;
  } else {
    el('projForm').reset();
    el('projCor').value    = PROJ_COLORS[Math.floor(Math.random()*PROJ_COLORS.length)];
    el('projStatus').value = 'ativo';
  }
  el('modalProject').classList.add('open');
}
const closeProjectModal = () => el('modalProject').classList.remove('open');

async function saveProject() {
  const nome    = el('projNome').value.trim();
  const descricao = el('projDesc').value.trim();
  const cor     = el('projCor').value;
  const status  = el('projStatus').value;
  const editId  = el('projEditId').value;

  if (!nome) { toast('Informe o nome do projeto.', 'error'); return; }

  if (editId) {
    const p = (await getProjects()).find(x => x.id === parseInt(editId));
    await db.put('projects', { ...p, nome, descricao, cor, status });
    toast('Projeto atualizado!', 'success');
  } else {
    await db.insert('projects', { nome, descricao, cor, status, criadaEm: today() });
    toast('Projeto criado! 📁', 'success');
  }
  invalidate();
  closeProjectModal();
  await _renderProjetos();
}

export async function editProject(id)   { await openProjectModal(id); }
export async function deleteProject(id) {
  
  // Desvincula tarefas
  for (const t of (await getTasks()).filter(t => t.project_id === id)) {
    await db.put('tasks', { ...t, project_id: null });
  }
  await db.delete('projects', id);
  invalidate();
  toast('Projeto removido.', 'info');
  await _renderProjetos();
}

export async function filterByProject(id) {
  _activeTab = 'tarefas';
  await renderProdutividade();
  el('taskFilterProj').value = String(id);
  await _renderTarefas();
}

/* ════════════════════════════════════════
   ACTIONS — HÁBITOS
   ════════════════════════════════════════ */
export async function toggleHabitToday(id) {
  const logs = await getLogs();
  const t    = today();
  const existing = logs.find(l => l.habit_id === id && l.data === t);
  if (existing) {
    await db.delete('habit_logs', existing.id);
    toast('Check-in removido.', 'info');
  } else {
    await db.insert('habit_logs', { habit_id: id, data: t });
    const h = (await getHabits()).find(x => x.id === id);
    const streak = _streak(id, await db.getAll('habit_logs'));
    if (streak > 1) toast(`🔥 ${streak} dias seguidos! "${h?.nome}"`, 'success');
    else toast('Hábito marcado! ✅', 'success');
  }
  invalidate();
  await _renderHabitos();
}

async function openHabitModal(id = null) {
  el('habitModalTitle').textContent = id ? 'Editar Hábito' : 'Novo Hábito';
  el('habitEditId').value = id ?? '';
  el('habitIcone').innerHTML = HABIT_ICONS.map(i => `<option>${i}</option>`).join('');
  if (id) {
    const h = (await getHabits()).find(x => x.id === id);
    if (!h) return;
    el('habitNome').value      = h.nome;
    el('habitIcone').value     = h.icone;
    el('habitFreq').value      = h.frequencia;
    el('habitMeta').value      = h.meta_dias;
    el('habitCor').value       = h.cor;
    el('habitStatus').value    = h.status;
  } else {
    el('habitForm').reset();
    el('habitFreq').value   = 'diario';
    el('habitMeta').value   = '30';
    el('habitCor').value    = PROJ_COLORS[Math.floor(Math.random()*PROJ_COLORS.length)];
    el('habitStatus').value = 'ativo';
  }
  el('modalHabit').classList.add('open');
}
const closeHabitModal = () => el('modalHabit').classList.remove('open');

async function saveHabit() {
  const nome      = el('habitNome').value.trim();
  const icone     = el('habitIcone').value;
  const frequencia= el('habitFreq').value;
  const meta_dias = parseInt(el('habitMeta').value) || 30;
  const cor       = el('habitCor').value;
  const status    = el('habitStatus').value;
  const editId    = el('habitEditId').value;

  if (!nome) { toast('Informe o nome do hábito.', 'error'); return; }

  if (editId) {
    const h = (await getHabits()).find(x => x.id === parseInt(editId));
    await db.put('habits', { ...h, nome, icone, frequencia, meta_dias, cor, status });
    toast('Hábito atualizado!', 'success');
  } else {
    await db.insert('habits', { nome, icone, frequencia, meta_dias, cor, status, criadaEm: today() });
    toast('Hábito criado! 🔥', 'success');
  }
  invalidate();
  closeHabitModal();
  await _renderHabitos();
}

export async function editHabit(id)   { await openHabitModal(id); }
export async function deleteHabit(id) {
  
  for (const l of (await getLogs()).filter(l => l.habit_id === id)) await db.delete('habit_logs', l.id);
  await db.delete('habits', id);
  invalidate();
  toast('Hábito removido.', 'info');
  await _renderHabitos();
}

/* ════════════════════════════════════════
   INIT
   ════════════════════════════════════════ */
export function init() {
  window._prod = { moveTask, editTask, deleteTask, editProject, deleteProject, filterByProject, editHabit, deleteHabit, toggleHabitToday, openHabitModal, openProjectModal };

  // Sub-tabs
  document.querySelectorAll('.prod-tab').forEach(btn =>
    btn.addEventListener('click', () => { _activeTab = btn.dataset.tab; renderProdutividade(); }));

  // Filtros
  el('taskFilterProj').addEventListener('change', _renderTarefas);
  el('taskFilterPrio').addEventListener('change', _renderTarefas);

  // Botões adicionar
  el('btnAddTask').addEventListener('click',    () => openTaskModal());
  el('btnAddProject').addEventListener('click', () => openProjectModal());
  el('btnAddHabit').addEventListener('click',   () => openHabitModal());

  // Modal tarefa
  el('taskModalClose').addEventListener('click', closeTaskModal);
  el('taskCancel').addEventListener('click', closeTaskModal);
  el('taskSave').addEventListener('click', saveTask);
  el('modalTask').addEventListener('click', e => { if (e.target===e.currentTarget) closeTaskModal(); });

  // Modal projeto
  el('projModalClose').addEventListener('click', closeProjectModal);
  el('projCancel').addEventListener('click', closeProjectModal);
  el('projSave').addEventListener('click', saveProject);
  el('modalProject').addEventListener('click', e => { if (e.target===e.currentTarget) closeProjectModal(); });

  // Modal hábito
  el('habitModalClose').addEventListener('click', closeHabitModal);
  el('habitCancel').addEventListener('click', closeHabitModal);
  el('habitSave').addEventListener('click', saveHabit);
  el('modalHabit').addEventListener('click', e => { if (e.target===e.currentTarget) closeHabitModal(); });
}

const el = id => document.getElementById(id);
