import { initProtectedPage } from './pageInit.js';
import './operacional.js';

initProtectedPage('Operacional ADM', (content, userContext) => {
  if (window.OPERACIONAL?.openHome) {
    window.OPERACIONAL.openHome(content, { userContext });
    return;
  }

  content.innerHTML = `
    <article class="card">
      <h3>Operacional ADM</h3>
      <p>Não foi possível carregar o módulo operacional.</p>
    </article>
  `;
});
