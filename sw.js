const CACHE_NAME = 'g1000-comprovante-v1';
const SHARE_CACHE = 'g1000-shared-file';
const STATIC = ['/painel/comprovante-mobile.html'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((c) => c.addAll(STATIC).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== SHARE_CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Web Share Target — intercepta POST do app do banco
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  if (e.request.method === 'POST' && url.pathname.includes('comprovante-mobile')) {
    e.respondWith(handleShareTarget(e.request));
    return;
  }

  // Cache-first para o shell da PWA
  if (e.request.method === 'GET' && STATIC.some((s) => url.pathname.endsWith(s.split('/').pop()))) {
    e.respondWith(caches.match(e.request).then((cached) => cached || fetch(e.request)));
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (file && file.size > 0) {
      const cache = await caches.open(SHARE_CACHE);
      await cache.put('/g1000-shared-file', new Response(file, {
        headers: { 'Content-Type': file.type || 'image/jpeg', 'X-File-Name': encodeURIComponent(file.name || 'comprovante.jpg') }
      }));
    }
  } catch (err) {
    console.warn('[SW] Falha ao capturar arquivo compartilhado:', err);
  }
  return Response.redirect('/painel/comprovante-mobile.html?shared=1', 303);
}
