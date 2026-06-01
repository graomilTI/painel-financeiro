/* assets/js/modules/metas-register.js
 * Use somente se o seu adm.js já lê window.ADM_MODULES.
 * Se o adm.js chama direto window.METAS.openHome, este arquivo é opcional.
 */

(function () {
  'use strict';

  window.ADM_MODULES = window.ADM_MODULES || {};

  window.ADM_MODULES.metas = {
    mount: function (container, opts) {
      if (!window.METAS || typeof window.METAS.openHome !== 'function') {
        container.innerHTML = '<div style="color:#fecaca">Módulo METAS não carregado. Verifique se assets/js/modules/metas.js foi importado antes.</div>';
        return;
      }

      return window.METAS.openHome(container, opts || {});
    }
  };
})();
