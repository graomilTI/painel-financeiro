export function getPanelBasePath(pathname = window.location.pathname) {
  const clean = String(pathname || '').split('?')[0].split('#')[0];
  const host = String(window.location.hostname || '').toLowerCase();

  // Domínio oficial sempre deve navegar dentro de /painel.
  // Isso evita links acidentais como grao1000.com.br/frotas, que caem fora do Worker do painel.
  if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
    return '/painel';
  }

  const painelMatch = clean.match(/^(.*?)(\/painel)(?:\/.*)?$/i);
  if (painelMatch) return `${painelMatch[1]}${painelMatch[2]}`;

  const lastSlash = clean.lastIndexOf('/');
  if (lastSlash <= 0) return '';
  return clean.slice(0, lastSlash);
}

export function toPanelUrl(target = '') {
  const normalized = String(target || '')
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');

  const base = getPanelBasePath();

  if (!normalized) return base || './';

  if (!base) return `./${normalized}`;

  return `${base}/${normalized}`.replace(/([^:]\/)\/+/g, '$1');
}

export function getApiBaseUrl(origin = window.location.origin) {
  const normalizedOrigin = String(origin || '').toLowerCase();
  const isPrimaryDomain =
    normalizedOrigin.includes('grao1000.com.br') ||
    normalizedOrigin.includes('www.grao1000.com.br');

  return isPrimaryDomain ? '/api' : 'https://grao1000.com.br/api';
}

export function toApiUrl(path = '') {
  const normalizedPath = String(path || '').replace(/^\/+/, '');
  const apiBase = getApiBaseUrl();
  return `${apiBase}/${normalizedPath}`.replace(/([^:]\/)\/+/g, '$1');
}
