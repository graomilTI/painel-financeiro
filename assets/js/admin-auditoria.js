import { initProtectedPage } from './pageInit.js';

initProtectedPage('Auditoria', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Auditoria</h3>
      <p>Página base de logs e auditoria do sistema.</p>
    </article>
  `;
});
