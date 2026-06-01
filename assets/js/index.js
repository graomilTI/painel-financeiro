import { getSession } from './auth.js';
import { clearUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';

const bootMessage = document.getElementById('bootMessage');
const bootFeedback = document.getElementById('bootFeedback');

function setStatus(message, detail = '') {
  if (bootMessage) bootMessage.textContent = message;
  if (bootFeedback) bootFeedback.textContent = detail;
}

async function boot() {
  try {
    setStatus('Verificando sessão', 'Redirecionando para a tela correta...');
    const session = await getSession();

    if (session?.user) {
      setStatus('Sessão encontrada', 'Abrindo o painel...');
      window.location.replace(toPanelUrl('dashboard'));
      return;
    }

    clearUserContext();
    setStatus('Sessão não encontrada', 'Abrindo login...');
    window.location.replace(toPanelUrl('login.html'));
  } catch (error) {
    console.error('Erro ao iniciar o painel:', error);
    clearUserContext();
    setStatus('Não foi possível validar a sessão', 'Redirecionando para o login...');
    window.location.replace(toPanelUrl('login.html'));
  }
}

boot();
