import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/frotas-veiculos.js';

initProtectedPage('Frotas · Veículos', (content, ctx) => {
  window.FROTAS_VEICULOS.openHome(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
