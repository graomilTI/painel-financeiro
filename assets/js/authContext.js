import { supabase } from "./supabaseClient.js";
import { cachedQuery, invalidateCacheByPrefix } from "./painelCache.js";

let USER_CONTEXT = null;

function normalizeContextPayload(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] || null;
  return data;
}

export async function loadUserContext(options = {}) {
  const context = await cachedQuery('auth:user_context:v2', async () => {
    const { data, error } = await supabase.rpc("rpc_get_user_context");
    if (error) {
      console.error("Erro ao carregar contexto:", error);
      throw error;
    }
    return normalizeContextPayload(data);
  }, { ttlMs: 30 * 60 * 1000, force: Boolean(options.force) });
  if (!context?.user?.id) {
    throw new Error("Erro ao carregar contexto do usuário autenticado.");
  }

  USER_CONTEXT = {
    ...context,
    modules: Array.isArray(context.modules) ? context.modules : [],
  };
  return USER_CONTEXT;
}

export function getUserContext() {
  return USER_CONTEXT;
}

export async function logout() {
  invalidateCacheByPrefix('auth:');
  await supabase.auth.signOut();
  window.location.href = "/painel/login.html";
}
