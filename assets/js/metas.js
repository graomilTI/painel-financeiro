import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/metas.js';

initProtectedPage('METAS', (content, ctx) => {
  window.METAS.openHome(content, {
    supabase,
    api: { supabase },
    auth: ctx,
    user: ctx?.user || null,
    onBack: () => {
      window.location.href = './dre.html';
    }
  });
});
