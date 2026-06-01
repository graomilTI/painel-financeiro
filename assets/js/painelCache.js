const CACHE_PREFIX = 'grao1000:painel-cache:';
const META_VERSION_KEY = `${CACHE_PREFIX}version`;
const META_REASON_KEY = `${CACHE_PREFIX}last-reason`;
const DEFAULT_TTL_MS = 10 * 60 * 1000;

function now() {
  return Date.now();
}

function safeJsonParse(value, fallback = null) {
  try { return JSON.parse(value); } catch { return fallback; }
}

function storageKey(key) {
  return `${CACHE_PREFIX}${key}`;
}

export function getCacheVersion() {
  return localStorage.getItem(META_VERSION_KEY) || '1';
}

export function bumpPainelCache(reason = 'alteracao_painel') {
  const version = String(now());
  localStorage.setItem(META_VERSION_KEY, version);
  localStorage.setItem(META_REASON_KEY, reason);
  window.dispatchEvent(new CustomEvent('painel-cache:invalidated', { detail: { version, reason } }));
  return version;
}

export function getCache(key, { ttlMs = DEFAULT_TTL_MS } = {}) {
  const payload = safeJsonParse(localStorage.getItem(storageKey(key)));
  if (!payload) return null;
  if (payload.version !== getCacheVersion()) return null;
  if (ttlMs > 0 && now() - Number(payload.savedAt || 0) > ttlMs) return null;
  return payload.data ?? null;
}

export function setCache(key, data) {
  localStorage.setItem(storageKey(key), JSON.stringify({
    version: getCacheVersion(),
    savedAt: now(),
    data,
  }));
  return data;
}

export function removeCache(key) {
  localStorage.removeItem(storageKey(key));
}

export function invalidateCacheByPrefix(prefix) {
  const full = storageKey(prefix);
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(full)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  window.dispatchEvent(new CustomEvent('painel-cache:prefix-invalidated', { detail: { prefix } }));
}

export async function cachedQuery(key, loader, { ttlMs = DEFAULT_TTL_MS, force = false } = {}) {
  if (!force) {
    const cached = getCache(key, { ttlMs });
    if (cached !== null) return cached;
  }
  const fresh = await loader();
  setCache(key, fresh);
  return fresh;
}

export function clearPainelCache() {
  const keys = [];
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (key && key.startsWith(CACHE_PREFIX)) keys.push(key);
  }
  keys.forEach((key) => localStorage.removeItem(key));
  bumpPainelCache('limpeza_manual');
}

window.PainelCache = {
  getCacheVersion,
  bumpPainelCache,
  getCache,
  setCache,
  removeCache,
  invalidateCacheByPrefix,
  cachedQuery,
  clearPainelCache,
};
