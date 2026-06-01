// assets/js/menuConfig.js
// Menu alinhado com os códigos reais do Supabase, mantendo compatibilidade com IDs legados.

function item(code, label, path, aliases = [], opts = {}) {
  return { code, label, path, aliases, ...opts };
}

export const MENU_CONFIG = [
  {
    grupo: "INÍCIO",
    itens: [
      item("dashboard", "Dashboard", "dashboard", ["DASHBOARD"]),
      item("notificacoes", "Notificações", "notificacoes", ["NOTIFICACOES"]),
      item("historico_geral", "Histórico Geral", "historico", ["HISTORICO_GERAL"])
    ]
  },

  {
    grupo: "GESTOR",
    itens: [
      item("programacao", "Programação", "programacao", ["PROGRAMACAO"]),
      item("os_gestor", "OS", "os", ["OS", "O.S", "OPERACIONAL_OS", "GESTOR_OS"]),
      item("hospedagem", "Hospedagem", "hospedagem", ["HOSPEDAGEM"]),
      item("compras_gestor", "Compras", "compras", ["COMPRAS"]),
      item("logistica_gestor", "Logística", "logistica", ["LOGISTICA"]),
      item("patrimonios_gestor", "Patrimônios", "patrimonios", ["PATRIMONIOS"]),
      item("contato_cliente", "Contato Cliente", "contato-cliente", ["CONTATO_CLIENTE"])
    ]
  },

  {
    grupo: "CONFERÊNCIA",
    itens: [
      item("conferencia", "Painel de Conferência", "adm-conferencia", ["ADM_CONFERENCIA"]),
      item("distribuir_os", "Distribuir O.S", "distribuir-os", ["DISTRIBUIR_OS", "CONFERENCIA_DISTRIBUIR_OS"])
    ]
  },

  {
    grupo: "TERMOS",
    itens: [
      item("termos_celular", "Celular", "termos#celular", ["TERMOS_CELULAR", "TERMOS"]),
      item("termos_veiculos", "Veículos", "termos#veiculos", ["TERMOS_VEICULOS", "TERMOS"])
    ]
  },

  {
    grupo: "COMPRAS",
    itens: [
      item("compras_adm", "Painel de Compras", "adm-compras", ["COMPRAS_ADM"])
    ]
  },

  {
    grupo: "PATRIMÔNIOS",
    itens: [
      item("patrimonio", "Painel de Patrimônios", "adm-patrimonio", ["PATRIMONIO_ADM"])
    ]
  },

  {
    grupo: "HOSPEDAGEM",
    itens: [
      item("hotel", "Hotéis", "adm-hotel#hoteis", ["ADM_HOTEL", "HOTEL"]),
      item("hotel_alojamentos", "Alojamentos", "adm-hotel#alojamentos", ["ADM_HOTEL", "HOTEL"]),
      item("hotel_relatorio", "Relatório", "hotel-relatorio", ["ADM_HOTEL", "HOTEL", "HOTEL_RELATORIO"])
    ]
  },

  {
    grupo: "RECURSOS HUMANOS",
    itens: [
      item("ferias_atestados", "Férias e Atestados", "ferias-atestados", ["RH_FERIAS_ATESTADOS"]),
      item("rh_plantao", "Plantão", "plantao", ["RH_PLANTAO", "PLANTAO", "PLANTÃO"]),
      item("rh_epi", "EPI", "epi-rh", ["RH_EPI"]),
      item("historico_geral", "Histórico Geral", "historico", ["RH_HIST_INDISP"]),
      item("base_colab_consulta", "Consultar Base", "consultar-colaboradores", ["BASE_COLAB_CONSULTA"]),
      item("contatos_exportacoes", "Contatos e Cadastros", "contatos", ["CONTATOS_EXPORTACOES", "CONTATOS", "GOOGLE_CONTACTS"])
    ]
  },

  {
    grupo: "OPERACIONAL",
    itens: [
      item("operacional_mapa", "Mapa de Direcionamento", "adm-operacional", ["OPERACIONAL", "OPERACIONAL_MAPA", "MAPA_DIRECIONAMENTO"])
    ]
  },

  {
    grupo: "FROTAS",
    itens: [
      item("frotas_dashboard", "Dashboard de Frotas", "frotas-dashboard", ["FROTAS", "EXCESSO_VELOCIDADE", "FROTAS_EXCESSO_VELOCIDADE", "FROTAS_VEICULOS", "VEICULOS", "FROTAS_MULTAS", "MULTAS", "FROTAS_HISTORICO", "HISTORICO_FROTAS"], { hidden: true }),
      item("frotas_excesso_velocidade", "Excesso de Velocidade", "frotas", ["FROTAS", "EXCESSO_VELOCIDADE", "FROTAS_EXCESSO_VELOCIDADE"]),
      item("frotas_veiculos", "Veículos", "frotas-veiculos", ["FROTAS_VEICULOS", "VEICULOS", "VEÍCULOS", "FROTA_VEICULOS"]),
      item("frotas_multas", "Multas", "frotas-multas", ["MULTAS", "FROTAS_MULTAS"]),
      item("frotas_historico", "Histórico", "frotas-historico", ["FROTAS_HISTORICO", "HISTORICO_FROTAS"])
    ]
  },

  {
    grupo: "NOTAS FISCAIS",
    itens: [
      item("notas_fiscais", "Painel de Notas Fiscais", "notas-fiscais", ["NOTAS_FISCAIS", "NF", "NFS", "FINANCEIRO_NOTAS_FISCAIS"])
    ]
  },

  {
    grupo: "FINANCEIRO",
    itens: [
      item("financeiro_fluxo_caixa", "Fluxo de Caixa", "financeiro", ["FINANCEIRO", "FLUXO_CAIXA", "FINANCEIRO_FLUXO_CAIXA"]),
      item("financeiro_pagamentos", "Pagamentos", "financeiro#pagamentos", ["FINANCEIRO", "PAGAMENTOS", "FINANCEIRO_PAGAMENTOS"]),
      item("financeiro_adiantamentos", "Adiantamentos", "financeiro#pagamentos", ["ADIANTAMENTOS", "FINANCEIRO_ADIANTAMENTOS"]),
      item("financeiro_alimentacao", "Alimentação", "financeiro#pagamentos", ["ALIMENTACAO", "ALIMENTAÇÃO", "FINANCEIRO_ALIMENTACAO"])
    ]
  },

  {
    grupo: "LOGÍSTICA",
    itens: [
      item("logistica_adm", "Painel de Logística", "adm-logistica", ["LOGISTICA_ADM", "LOGISTICA"]),
      item("logistica_finalizacao_os", "Finalização de O.S", "adm-logistica", ["LOGISTICA_FINALIZACAO_OS", "FINALIZACAO_OS"])
    ]
  },

  {
    grupo: "TROCA DE NOTAS",
    itens: []
  },


  {
    grupo: 'ENVIOS',
    itens: [
      item('envios', 'Envios', 'envios', ['ENVIOS', 'CORREIOS', 'PREPOSTAGEM']),
    ]
  },

  {
    grupo: "AUDITORIA",
    itens: [
      item("admin_auditoria", "Auditoria do Sistema", "admin-auditoria", ["ADMIN_AUDITORIA"])
    ]
  },

  {
    grupo: "RELATÓRIOS",
    itens: [
      item("relatorios_importar", "Importar Relatórios", "importar-relatorios", ["RELATORIOS_IMPORTAR", "RELATORIOS_UPLOAD"]),
      item("relatorios_colab", "Colaboradores", "consultar-colaboradores", ["RELATORIOS_COLAB"]),
      item("relatorios_prod", "Produção", "consultar-producao", ["RELATORIOS_PROD"]),
      item("relatorios_patrimonios_importar", "Patrimônios", "importar-patrimonios", ["RELATORIOS_PATRIMONIOS_IMPORTAR"])
    ]
  },

  {
    grupo: "DIRETORIA",
    itens: [
      item("diretoria_dre", "DRE", "dre", ["DRE", "DIRETORIA_DRE"]),
      item("diretoria_metas", "METAS", "metas", ["METAS", "DIRETORIA_METAS"]),
      item("diretoria_desempenho", "Desempenho", "desempenho", ["DESEMPENHO", "DIRETORIA_DESEMPENHO"]),
      item("diretoria_contato_cliente", "Contato Cliente", "contato-cliente", ["DIRETORIA_CONTATO_CLIENTE"]),
      item("usuarios_acessos", "Usuários e Acessos", "admin-usuarios", ["ADMIN_USUARIOS", "USUARIOS_E_ACESSOS"]),
      item("admin_config", "Configurações", "admin-configuracoes", ["ADMIN_CONFIG"])
    ]
  }
];

export const PANEL_MENU = MENU_CONFIG.map((section) => ({
  section: section.grupo,
  items: section.itens.map((item) => ({
    code: item.code,
    label: item.label,
    path: item.path,
    aliases: item.aliases || [],
    hidden: item.hidden || false
  }))
}));

