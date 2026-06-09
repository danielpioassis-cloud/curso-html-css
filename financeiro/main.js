/**
 * main.js — Entry point do Painel de Vida
 *
 * Sequência de boot:
 *  1. db.open()                → abre IndexedDB (cria schema se necessário)
 *  2. migrateFromLocalStorage() → move dados do fincontrol_v2 uma única vez
 *  3. seedDemo()               → popula com exemplos se o banco estiver vazio
 *  4. registra rotas           → cada rota aponta para o render do módulo financeiro
 *  5. financeiro.init()        → registra todos os event listeners
 *  6. router.init()            → dispara hashchange inicial
 *  7. Atualiza data no topbar
 */

import { db }        from './core/db.js';
import { router }    from './core/router.js';
import { store, EVENTS } from './core/store.js';
import { toast }     from './core/ui.js';
import * as financeiro from './modules/financeiro/index.js';
import * as goals         from './modules/goals/index.js';
import * as negocios      from './modules/negocios/index.js';
import * as produtividade  from './modules/produtividade/index.js';
import * as investimentos  from './modules/investimentos/index.js';
import * as contas         from './modules/contas/index.js';

async function boot() {
  /* ── 1. Banco de dados ── */
  await db.open();
  store.emit(EVENTS.DB_READY);

  /* ── 2. Migração única do localStorage ── */
  const migration = await db.migrateFromLocalStorage();
  if (migration.migrated) {
    store.emit(EVENTS.DATA_MIGRATED, migration);
    // Toast aparece após o primeiro render (o router ainda não rodou)
    store.once(EVENTS.MODULE_LOADED, () => {
      toast(
        `✓ ${migration.transactions} transações migradas para o novo banco!`,
        'success',
        5000,
      );
    });
  }

  /* ── 3. Seed demo se vazio ── */
  await financeiro.seedDemo();
  await goals.seedGoalsDemo();
  await negocios.seedNegociosDemo();
  await produtividade.seedProdutividadeDemo();
  await investimentos.seedInvestimentosDemo();
  await contas.seedContasDemo();

  /* ── 4. Rotas ── */
  router
    .register('dashboard',   { title: 'Dashboard',   render: async () => {
        await financeiro.renderDashboard();
        await contas.renderPrevisibilidade();
      } })
    .register('visao-geral', { title: 'Visão Geral',  render: financeiro.renderVisaoGeral  })
    .register('transacoes',  { title: 'Transações',   render: financeiro.renderTransacoes  })
    .register('orcamento',   { title: 'Orçamento',    render: financeiro.renderOrcamento   })
    .register('relatorios',  { title: 'Relatórios',   render: financeiro.renderRelatorios  })
    .register('contas',      { title: 'Contas',       render: contas.renderContas          })
    .register('metas',         { title: 'Metas',          render: goals.renderMetas              })
    .register('negocios',      { title: 'Negócios',       render: negocios.renderNegocios        })
    .register('produtividade', { title: 'Produtividade',  render: produtividade.renderProdutividade })
    .register('investimentos', { title: 'Investimentos',  render: investimentos.renderInvestimentos });

  /* ── 5. Init módulos ── */
  financeiro.init();
  goals.init();
  negocios.init();
  produtividade.init();
  investimentos.init();
  contas.init();

  /* Nav groups toggle */
  window._toggleNavGroup = id => {
    document.getElementById(`navg-${id}`)?.classList.toggle('open');
  };

  /* Topbar contextual — troca ações ao mudar de rota */
  window.addEventListener('hashchange', () => {
    const page = location.hash.replace(/^#\/?/, '') || 'dashboard';
    if (page === 'negocios') negocios.activateBizTopbar();
    else                     negocios.deactivateBizTopbar();
  });

  /* ── 6. Inicia roteamento ── */
  router.init();

  /* Aplica topbar correto na rota inicial */
  {
    const page = location.hash.replace(/^#\/?/, '') || 'dashboard';
    if (page === 'negocios') negocios.activateBizTopbar();
  }

  /* ── 7. Data no topbar ── */
  const dateEl = document.getElementById('currentDate');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('pt-BR', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });
  }

  store.emit(EVENTS.MODULE_LOADED, 'financeiro');
}

boot().catch(err => {
  console.error('[boot] falha na inicialização:', err);
  document.body.innerHTML = `
    <div style="display:flex;height:100vh;align-items:center;justify-content:center;background:#0f172a;color:#f43f5e;font-family:Inter,sans-serif;flex-direction:column;gap:1rem">
      <h2>Erro ao iniciar o sistema</h2>
      <pre style="font-size:.8rem;color:#94a3b8;background:#1e293b;padding:1rem;border-radius:8px;max-width:600px;overflow:auto">${err.stack || err.message}</pre>
      <button onclick="location.reload()" style="padding:.5rem 1.5rem;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer;font-family:inherit">Tentar novamente</button>
    </div>`;
});
