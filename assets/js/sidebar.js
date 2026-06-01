
(function () {
  function renderSidebar(container) {
    if (!window.MENU_CONFIG || !window.MENU_CONFIG.adm) {
      console.error("MENU_CONFIG não carregado");
      return;
    }

    const menu = window.MENU_CONFIG.adm;

    container.innerHTML = `
      <div class="sidebar">
        ${menu.map(setor => `
          <div class="menu-setor">
            <div class="menu-title">${setor.nome}</div>
            <div class="submenu">
              ${(setor.modulos || []).map(m => {
                const item = typeof m === 'string' ? { nome: m } : (m || {});
                const label = item.nome || item.label || item.modulo || '';
                const rota = item.rota || item.path || '';
                return `<div class="submenu-item" data-modulo="${label}" ${rota ? `data-rota="${rota}"` : ''}>${label}</div>`;
              }).join("")}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  window.SIDEBAR = { renderSidebar };
})();
