import { initProtectedPage } from './pageInit.js';

initProtectedPage('Configurações', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Configurações</h3>
      <p>Página base para parâmetros e integrações do sistema.</p>
    </article>
  `;
});
