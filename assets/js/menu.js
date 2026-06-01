import { getUserContext } from "./authContext.js";

export function renderMenu() {
  const ctx = getUserContext();
  if (!ctx) return;

  const container = document.getElementById("menu");
  if (!container) return;

  const modulos = ctx.modulos || [];

  modulos.sort((a, b) => a.ordem - b.ordem);

  container.innerHTML = modulos
    .map(
      (m) => `
      <a href="${m.rota}" class="menu-item">
        ${m.nome}
      </a>
    `
    )
    .join("");
}
