import { initProtectedPage } from './pageInit.js';

initProtectedPage('Histórico Geral', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Histórico Geral</h3>
      <p>Área preparada para exibir o histórico consolidado do sistema.</p>
    </article>
  `;
});
