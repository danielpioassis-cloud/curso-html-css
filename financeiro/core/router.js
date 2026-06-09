/**
 * core/router.js — Hash router
 *
 * Uso:
 *   router.register('dashboard', { title: 'Dashboard', render: async () => {} })
 *   router.navigate('transacoes')   → muda o hash
 *   router.init()                   → começa a escutar hashchange + ativa rota inicial
 *   router.current                  → rota ativa no momento
 */

class Router {
  constructor() {
    this._routes  = new Map();
    this._current = null;
  }

  register(path, config) {
    // config: { title, render }
    this._routes.set(path, config);
    return this; // chainável: router.register(...).register(...)
  }

  navigate(path) {
    location.hash = `/${path}`;
    // o hashchange dispara _activate automaticamente
  }

  async _activate(path) {
    const route = this._routes.get(path);
    if (!route) { console.warn(`[Router] rota desconhecida: "${path}"`); return; }

    /* Atualiza DOM */
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    document.getElementById(`page-${path}`)?.classList.add('active');
    const activeLink = document.querySelector(`[data-page="${path}"]`);
    activeLink?.classList.add('active');
    /* Abrir o nav-group que contém o link ativo */
    activeLink?.closest('.nav-group')?.classList.add('open');

    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = route.title ?? path;

    this._current = path;

    if (route.render) {
      try { await route.render(); }
      catch (e) { console.error(`[Router] erro ao renderizar "${path}":`, e); }
    }
  }

  _parsePath() {
    return location.hash.replace(/^#\/?/, '') || 'dashboard';
  }

  init() {
    window.addEventListener('hashchange', () => this._activate(this._parsePath()));
    this._activate(this._parsePath());
  }

  get current() { return this._current; }
}

export const router = new Router();
