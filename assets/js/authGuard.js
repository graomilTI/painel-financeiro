import { getSession, getUserContext } from './auth.js';
import { saveUserContext, clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';
import { PANEL_MENU } from './menuConfig.js';

function normalize(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function normalizePath(value = '') {
  return String(value || '')
    .split('?')[0]
    .split('#')[0]
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '')
    .trim();
}

function getCurrentPanelPath() {
  const clean = normalizePath(window.location.pathname);
  const parts = clean.split('/').filter(Boolean);
  const painelIndex = parts.findIndex((part) => normalize(part) === 'painel');
  const last = painelIndex >= 0 ? parts[painelIndex + 1] : parts[parts.length - 1];
  return normalizePath(last || 'dashboard');
}

function isGestorContext(context) {
  const role = normalize(context?.user?.role || context?.perfil_codigo || context?.perfil_nome || context?.role);
  const department = normalize(context?.department?.code || context?.department?.name || context?.setor);
  return role === 'gestor' || department === 'gestor';
}

function buildModuleCodeSet(context) {
  const set = new Set();
  for (const mod of context?.modules || []) {
    if (mod?.can_view === false) continue;
    const code = normalize(mod?.code || mod?.codigo);
    if (code) set.add(code);
  }
  return set;
}

function itemIsAllowedByModules(item, allowedCodes) {
  const candidates = [item.code, ...(Array.isArray(item.aliases) ? item.aliases : [])]
    .map(normalize)
    .filter(Boolean);
  return candidates.some((code) => allowedCodes.has(code));
}

function allowedItemsForContext(context) {
  if (context?.user?.is_master) {
    return PANEL_MENU.flatMap((section) => section.items || []);
  }

  if (isGestorContext(context)) {
    const allowedSections = new Set(['inicio', 'gestor']);
    return PANEL_MENU
      .filter((section) => allowedSections.has(normalize(section.section)))
      .flatMap((section) => section.items || []);
  }

  const allowedCodes = buildModuleCodeSet(context);
  return PANEL_MENU.flatMap((section) => section.items || [])
    .filter((item) => itemIsAllowedByModules(item, allowedCodes));
}

function getFirstAllowedPath(context) {
  const items = allowedItemsForContext(context);
  const preferred = items.find((item) => normalizePath(item.path) === 'programacao') || items[0];
  return preferred?.path || 'dashboard';
}

function userCanOpenCurrentPage(context) {
  if (context?.user?.is_master) return true;

  const current = getCurrentPanelPath();
  if (!current || current === 'login') return true;

  const allowedPaths = new Set(
    allowedItemsForContext(context).map((item) => normalizePath(item.path)).filter(Boolean)
  );

  return allowedPaths.has(current);
}

export async function requireAuth() {
  const session = await getSession();
  if (!session?.user) {
    clearUserContext();
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  let context = null;
  try {
    context = await getUserContext(session.user.id);
    saveUserContext(context);
  } catch (error) {
    clearUserContext();
    console.error('Erro ao carregar permissões do usuário:', error);
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  if (!context?.user?.active) {
    clearUserContext();
    window.location.replace(toPanelUrl('login.html'));
    return null;
  }

  if (!userCanOpenCurrentPage(context)) {
    window.location.replace(toPanelUrl(getFirstAllowedPath(context)));
    return null;
  }

  return context;
}
