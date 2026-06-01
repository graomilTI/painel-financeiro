
import { mountRequestModule } from './requestModuleFactory.js';

const STATUS_LABELS = {
  "aberto": "Aberto",
  "em_andamento": "Em andamento",
  "aguardando_cliente": "Aguardando cliente",
  "concluido": "Concluído",
  "cancelado": "Cancelado"
};

mountRequestModule({
  pageTitle: "Contato Cliente",
  key: "contatocliente",
  table: "contato_cliente_registros",
  description: "Registro de contatos com clientes e acompanhamentos do gestor no Supabase.",
  badge: "GESTOR",
  dateField: "data_contato",
  createdByField: "created_by",
  orderBy: "data_contato",
  formHint: "Registre visitas, alinhamentos e pendências com o cliente.",
  listHint: "Histórico dos contatos com clientes.",
  fields: [
  {
    "name": "data_contato",
    "label": "Data do contato",
    "type": "date",
    "required": true,
    "defaultToday": true
  },
  {
    "name": "cliente",
    "label": "Cliente",
    "type": "text",
    "placeholder": "Nome do cliente"
  },
  {
    "name": "contato",
    "label": "Contato",
    "type": "text",
    "placeholder": "Nome / telefone / e-mail"
  },
  {
    "name": "assunto",
    "label": "Assunto",
    "type": "text",
    "placeholder": "Tema principal"
  },
  {
    "name": "retorno_previsto",
    "label": "Retorno previsto",
    "type": "date"
  },
  {
    "name": "status",
    "label": "Status",
    "type": "select",
    "defaultValue": "aberto",
    "options": [
      {
        "value": "aberto",
        "label": "Aberto"
      },
      {
        "value": "em_andamento",
        "label": "Em andamento"
      },
      {
        "value": "aguardando_cliente",
        "label": "Aguardando cliente"
      },
      {
        "value": "concluido",
        "label": "Concluído"
      },
      {
        "value": "cancelado",
        "label": "Cancelado"
      }
    ]
  },
  {
    "name": "observacoes",
    "label": "Observações",
    "type": "textarea",
    "placeholder": "Resumo do contato",
    "span2": true,
    "rows": 4
  }
],
  columns: [
  {
    "field": "data_contato",
    "label": "Data",
    "type": "date"
  },
  {
    "field": "cliente",
    "label": "Cliente"
  },
  {
    "field": "contato",
    "label": "Contato"
  },
  {
    "field": "assunto",
    "label": "Assunto"
  },
  {
    "field": "retorno_previsto",
    "label": "Retorno",
    "type": "date"
  },
  {
    "field": "status",
    "label": "Status",
    "type": "status"
  }
].map((col) => col.field === 'status' ? ({ ...col, statusLabel: (value) => STATUS_LABELS[value] || value || '-' }) : col),
  statusOptions: Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label })),
  searchFields: ["cliente", "contato", "assunto", "observacoes", "status"]
});
