const STORAGE_KEY = 'painel_user_context';

export function saveUserContext(context) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(context));
}

export function loadUserContext() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function clearUserContext() {
  localStorage.removeItem(STORAGE_KEY);
}
