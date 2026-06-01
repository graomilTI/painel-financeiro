import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import './modules/ti.js';

initProtectedPage('TI · Integrações', (content, ctx) => {
  window.TI.openIntegracoes(content, {
    supabase,
    auth: ctx,
    user: ctx?.user || null
  });
});
