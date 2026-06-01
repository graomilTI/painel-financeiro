import { requireAuth } from './authGuard.js';
import { renderAppLayout } from './layout.js';

export async function initProtectedPage(title, renderContent) {
  document.documentElement.classList.remove('is-route-transitioning');
  document.documentElement.classList.add('is-route-booting');
  const userContext = await requireAuth();
  if (!userContext) return;

  renderAppLayout({ userContext, currentPageTitle: title });

  const content = document.getElementById('pageContent');
  if (content && typeof renderContent === 'function') {
    renderContent(content, userContext);
  }

  requestAnimationFrame(() => {
    document.documentElement.classList.remove('is-route-booting');
    document.documentElement.classList.add('is-route-ready');
  });
}
