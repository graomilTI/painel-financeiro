/**
 * Exemplo de encaixe no menu/sidebar do painel.
 * Ajuste conforme a estrutura real do seu menuconfig.js / adm.js
 */

const MENU_RELATORIOS = {
  id: "relatorios",
  label: "RELATÓRIOS",
  children: [
    {
      id: "colaboradores_historico",
      label: "Colaboradores > Histórico",
      action: (container, opts) => window.HISTORICO_COLABORADORES.openHome(container, opts),
    }
  ],
};

const MENU_COMUNICACAO = {
  id: "comunicacao",
  label: "COMUNICAÇÃO",
  children: [
    {
      id: "botconversa",
      label: "BotConversa",
      action: (container, opts) => window.BOTCONVERSA.openHome(container, opts),
    }
  ],
};