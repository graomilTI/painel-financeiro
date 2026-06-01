import { initProtectedPage } from './pageInit.js';
import { flattenAllowedMenu, buildAllowedMenu } from './menuBuilder.js';
import { toPanelUrl } from './paths.js';

const ICON_MODULES = `<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`;
const ICON_USER    = `<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>`;
const ICON_SECTOR  = `<svg viewBox="0 0 24 24"><path d="M3 21V7l9-5 9 5v14"/><path d="M9 21V12h6v9"/></svg>`;
const ICON_STATUS  = `<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;

function buildPanelHref(path = '') {
  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
    return path ? `/painel/${path}`.replace(/([^:]\/)\/+/, '$1') : '/painel';
  }
  return toPanelUrl(path);
}

function renderStatCards(user, dept, totalLiberados) {
  const role   = user.role || 'Usuário';
  const sector = dept?.name || '—';
  const active = user.active !== false;

  return `
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-icon green">${ICON_MODULES}</div>
        <div class="stat-body">
          <div class="stat-label">Módulos liberados</div>
          <div class="stat-value">${totalLiberados}</div>
          <span class="trend-badge up">↑ disponíveis</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon blue">${ICON_USER}</div>
        <div class="stat-body">
          <div class="stat-label">Perfil de acesso</div>
          <div class="stat-value" style="font-size:20px;letter-spacing:-.01em">${role}</div>
          <span class="trend-badge neutral">Autenticado</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon amber">${ICON_SECTOR}</div>
        <div class="stat-body">
          <div class="stat-label">Setor</div>
          <div class="stat-value" style="font-size:18px;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${sector}</div>
          <span class="trend-badge neutral">Vínculo ativo</span>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-icon ${active ? 'green' : 'red'}">${ICON_STATUS}</div>
        <div class="stat-body">
          <div class="stat-label">Status</div>
          <div class="stat-value" style="font-size:20px">${active ? 'Ativo' : 'Inativo'}</div>
          <span class="trend-badge ${active ? 'up' : 'down'}">${active ? '● Online' : '● Offline'}</span>
        </div>
      </div>
    </div>
  `;
}

function renderQuickAccess(menuSections) {
  const items = menuSections.flatMap(s =>
    (s.items || []).map(item => ({ label: item.label, path: item.path, section: s.section }))
  ).slice(0, 12);

  if (!items.length) return '';

  return `
    <article class="card mt-16">
      <h3 style="margin:0 0 14px;font-size:16px">Acesso rápido</h3>
      <div class="quick-access-grid">
        ${items.map(i => `
          <a class="quick-access-item" href="${buildPanelHref(i.path)}">
            <span class="quick-access-dot"></span>
            <span>${i.label}</span>
          </a>
        `).join('')}
      </div>
    </article>
  `;
}

initProtectedPage('Dashboard', (content, userContext) => {
  const menuSections  = buildAllowedMenu(userContext);
  const menuItems     = flattenAllowedMenu(userContext);
  const totalLiberados = menuItems.length;

  content.innerHTML = `
    ${renderStatCards(userContext.user, userContext.department, totalLiberados)}

    <section class="hero-card mt-16">
      <div>
        <div class="eyebrow">Painel corporativo</div>
        <h2>Bem-vindo, ${userContext.user.name}</h2>
        <p class="muted" style="margin:0;line-height:1.6;max-width:560px">
          Painel com autenticação real, sessão persistida, proteção de páginas,
          menu dinâmico por perfil e acesso seguro via Supabase Auth.
        </p>
      </div>
      <div class="hero-badge-wrap">
        <span class="hero-badge">
          ${userContext.user.is_master ? 'MASTER' : (userContext.user.role || 'USUÁRIO')}
        </span>
      </div>
    </section>

    ${renderQuickAccess(menuSections)}
  `;
});
