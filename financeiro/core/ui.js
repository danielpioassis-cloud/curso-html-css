/**
 * core/ui.js — Utilitários compartilhados entre módulos
 *
 * Exporta: formatadores, helpers de data, defaults de gráficos, toast
 */

/* ── Formatadores ── */
export const fmt     = v   => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const fmtDate = iso => new Date(iso + 'T00:00:00').toLocaleDateString('pt-BR');
export const today   = ()  => new Date().toISOString().split('T')[0];
export const toDate  = iso => new Date(iso + 'T00:00:00');

/* ── Array helpers ── */
export const sumBy  = (arr, field) => arr.reduce((s, r) => s + (r[field] ?? 0), 0);
export const groupBy = (arr, keyFn) =>
  arr.reduce((acc, item) => {
    const k = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
    (acc[k] = acc[k] ?? []).push(item);
    return acc;
  }, {});

/* ── Variação percentual ── */
export const deltaLabel = (cur, prev) => {
  if (!prev) return '';
  const pct = ((cur - prev) / prev * 100).toFixed(1);
  return Number(pct) >= 0
    ? `▲ ${pct}% vs anterior`
    : `▼ ${Math.abs(pct)}% vs anterior`;
};

/* ── Datas ── */
export function inMonth(iso, m, a) {
  const d = toDate(iso);
  return d.getMonth() === m && d.getFullYear() === a;
}

export function monthRangeISO(offset = 0) {
  const now  = new Date();
  const base = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const from = base.toISOString().split('T')[0];
  const to   = new Date(base.getFullYear(), base.getMonth() + 1, 0).toISOString().split('T')[0];
  return { from, to };
}

/* ── Gráficos ── */
export const CHART_COLORS = [
  '#3b82f6', '#8b5cf6', '#10b981', '#f59e0b', '#f43f5e',
  '#06b6d4', '#ec4899', '#84cc16', '#f97316', '#a78bfa',
];

export const chartDefaults = {
  responsive: true,
  plugins: {
    legend: {
      labels: { color: '#64748b', font: { family: 'Inter', size: 11 }, padding: 12 },
    },
    tooltip: {
      backgroundColor: '#1a2235',
      borderColor    : 'rgba(255,255,255,.1)',
      borderWidth    : 1,
      titleColor     : '#f0f4ff',
      bodyColor      : '#94a3b8',
      padding        : 10,
      cornerRadius   : 8,
      titleFont      : { family: 'Inter', weight: '600' },
      bodyFont       : { family: 'Inter' },
    },
  },
  scales: {
    x: {
      ticks: { color: '#64748b', font: { family: 'Inter' } },
      grid : { color: 'rgba(255,255,255,.05)' },
    },
    y: {
      ticks: { color: '#64748b', font: { family: 'Inter' }, callback: v => fmt(v) },
      grid : { color: 'rgba(255,255,255,.05)' },
    },
  },
};

/* ── Confirm modal (substitui window.confirm para evitar dialogo do browser) ── */
export function uiConfirm(msg, { title = 'Confirmar', okLabel = 'Confirmar', danger = true } = {}) {
  return new Promise(resolve => {
    const overlay = document.getElementById('modalConfirm');
    document.getElementById('confirmTitle').textContent  = title;
    document.getElementById('confirmMsg').textContent    = msg;
    const okBtn = document.getElementById('confirmOk');
    okBtn.textContent = okLabel;
    okBtn.className   = danger ? 'btn btn--danger' : 'btn btn--primary';
    overlay.classList.add('open');

    const done = val => {
      overlay.classList.remove('open');
      okBtn.removeEventListener('click', onOk);
      document.getElementById('confirmCancel').removeEventListener('click', onCancel);
      overlay.removeEventListener('click', onBg);
      resolve(val);
    };
    const onOk     = () => done(true);
    const onCancel = () => done(false);
    const onBg     = e  => { if (e.target === overlay) done(false); };

    okBtn.addEventListener('click', onOk);
    document.getElementById('confirmCancel').addEventListener('click', onCancel);
    overlay.addEventListener('click', onBg);
  });
}

/* ── Toast ── */
let _toastWrap = null;

export function toast(msg, type = 'success', ms = 3500) {
  if (!_toastWrap) {
    _toastWrap = Object.assign(document.createElement('div'), {
      style: [
        'position:fixed', 'bottom:1.75rem', 'left:50%',
        'transform:translateX(-50%)', 'z-index:9999',
        'display:flex', 'flex-direction:column-reverse', 'gap:.5rem',
        'pointer-events:none',
      ].join(';'),
    });
    document.body.appendChild(_toastWrap);
  }

  const palette = { success: '#10b981', error: '#f43f5e', info: '#3b82f6', warning: '#f59e0b' };
  const el = Object.assign(document.createElement('div'), {
    textContent: msg,
    style: [
      `background:${palette[type] ?? palette.info}`,
      'color:#fff',
      'padding:.55rem 1.1rem',
      'border-radius:8px',
      'font-size:.82rem',
      'font-weight:500',
      "font-family:'Inter',sans-serif",
      'box-shadow:0 4px 20px rgba(0,0,0,.45)',
      'opacity:0',
      'transform:translateY(8px)',
      'transition:opacity .2s,transform .2s',
      'white-space:nowrap',
    ].join(';'),
  });

  _toastWrap.appendChild(el);
  requestAnimationFrame(() => {
    el.style.opacity   = '1';
    el.style.transform = 'translateY(0)';
  });
  setTimeout(() => {
    el.style.opacity   = '0';
    el.style.transform = 'translateY(8px)';
    setTimeout(() => el.remove(), 220);
  }, ms);
}
