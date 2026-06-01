import { initProtectedPage } from './pageInit.js';

initProtectedPage('Notificações', (content) => {
  content.innerHTML = `
    <article class="card">
      <h3>Notificações</h3>
      <p>Área preparada para centralizar os avisos dos módulos.</p>
    </article>
  `;
});
