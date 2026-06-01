import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/dre.js';

initProtectedPage('DRE', (content, ctx) => {
  if (!window.DRE || typeof window.DRE.openHome !== 'function') {
    content.innerHTML = '<div class="card"><strong>Erro ao carregar DRE.</strong><br>O módulo window.DRE.openHome não foi encontrado.</div>';
    return;
  }

  window.DRE.openHome(content, {
    supabase,
    api: { supabase },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => {
      window.location.href = './dashboard.html';
    }
  });
});
