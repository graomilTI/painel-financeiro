import { signInWithPassword, getUserContext, getSession } from './auth.js';
import { saveUserContext } from './sessionStore.js';
import { toPanelUrl } from './paths.js';

const form = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');
const feedback = document.getElementById('loginFeedback');
const togglePassword = document.getElementById('togglePassword');
const submitBtn = form?.querySelector('button[type="submit"]');

if (togglePassword) {
  togglePassword.addEventListener('click', () => {
    passwordInput.type = passwordInput.type === 'password' ? 'text' : 'password';
    togglePassword.textContent = passwordInput.type === 'password' ? 'Mostrar' : 'Ocultar';
  });
}

async function redirectIfSessionExists() {
  try {
    const session = await getSession();
    if (session?.user) {
      feedback.textContent = 'Sessão ativa encontrada. Redirecionando...';
      window.location.replace(toPanelUrl('dashboard'));
    }
  } catch (err) {
    console.error(err);
  }
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  feedback.textContent = 'Entrando...';
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Entrando...';
  }

  try {
    const authData = await signInWithPassword(emailInput.value.trim(), passwordInput.value);
    const userId = authData.user?.id;
    if (!userId) throw new Error('Usuário não encontrado após login.');

    const context = await getUserContext(userId);
    if (!context?.user?.active) throw new Error('Usuário inativo.');

    saveUserContext(context);
    feedback.textContent = 'Login realizado com sucesso.';
    window.location.replace(toPanelUrl('dashboard'));
  } catch (err) {
    console.error(err);
    feedback.textContent = err.message || 'Erro ao realizar login.';
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Entrar';
    }
  }
});

redirectIfSessionExists();
