import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/desempenho.js';

initProtectedPage('Desempenho', (content, ctx) => {
  if (!window.DESEMPENHO || typeof window.DESEMPENHO.openHome !== 'function') {
    content.innerHTML = '<div class="card"><strong>Erro ao carregar Desempenho.</strong><br>O módulo window.DESEMPENHO.openHome não foi encontrado.</div>';
    return;
  }

  window.DESEMPENHO.openHome(content, {
    supabase,
    api: { supabase },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => {
      window.location.href = './dre.html';
    }
  });
});
