// Compatibilidade com versões antigas do index.html
// Mantém a rota /painel/script.js respondendo com JavaScript válido.
import('./assets/js/index.js').catch((error) => {
  console.error('Falha ao carregar o bootstrap do painel:', error);
  window.location.href = './login.html';
});
