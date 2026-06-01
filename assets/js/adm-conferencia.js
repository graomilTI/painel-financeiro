import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const DATE_FMT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });
const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const GEOCODING_DELAY_MS = 1300;
const GEOCODING_RETRY_DELAY_MS = 3500;
const GEOCODING_MAX_BATCH = 25;


const STATUS_LABELS = {
  PENDENTE: 'Pendente',
  EM_ANALISE: 'Em análise',
  CONFERIDO: 'Conferido',
  PENDENCIA: 'Pendência',
  CANCELADO: 'Cancelado',
};

const STATUS_CLASS = {
  PENDENTE: 'warn',
  EM_ANALISE: 'info',
  CONFERIDO: 'ok',
  PENDENCIA: 'danger',
  CANCELADO: 'neutral',
};

const state = {
  tab: 'despesas',
  despesas: [],
  conferenciaStatus: new Map(),
  auditoria: [],
  resultado: [],
  uber: [],
  loading: false,
  sort: {
    despesas: { column: 'colaborador', direction: 'asc' },
  },
  filters: {
    inicio: '',
    fim: '',
    regional: '',
    colaborador: '',
    status: '',
  },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function todayISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function firstDayOfMonthISO() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return escapeHtml(value);
  const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return escapeHtml(value);
  return DATE_FMT.format(date);
}

function money(value) {
  const number = Number(value || 0);
  return MONEY_FMT.format(Number.isFinite(number) ? number : 0);
}

function asNumber(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function coerceBool(value, fallback = false) {
  if (value === null || value === undefined || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1;
  const norm = normalizeText(value);
  if (['TRUE', 'T', 'SIM', 'S', 'YES', 'Y', '1'].includes(norm)) return true;
  if (['FALSE', 'F', 'NAO', 'NÃO', 'NO', 'N', '0'].includes(norm)) return false;
  return fallback;
}

function getStatus(row) {
  return normalizeText(row?.status_conferencia || row?.status || 'PENDENTE').replaceAll(' ', '_') || 'PENDENTE';
}

function statusChip(status) {
  const key = normalizeText(status || 'PENDENTE').replaceAll(' ', '_');
  return `<span class="conf-chip conf-chip-${STATUS_CLASS[key] || 'neutral'}">${escapeHtml(STATUS_LABELS[key] || status || 'Pendente')}</span>`;
}

function sortIcon(column) {
  const current = state.sort.despesas;
  if (current.column !== column) return '<span class="conf-sort-icon">↕</span>';
  return `<span class="conf-sort-icon active">${current.direction === 'asc' ? '↑' : '↓'}</span>`;
}

function sortableTh(column, label) {
  return `<th><button class="conf-sort-btn" type="button" data-sort-column="${escapeHtml(column)}">${escapeHtml(label)} ${sortIcon(column)}</button></th>`;
}

function getSortValue(row, column) {
  if (column === 'colaborador') return row.colaborador || row.nome_colaborador || '';
  if (column === 'regional') return getRegional(row);
  if (column === 'status') return STATUS_LABELS[getStatus(row)] || getStatus(row);
  return row[column] || '';
}

function sortRows(rows, kind = 'despesas') {
  if (kind !== 'despesas') return rows;
  const { column, direction } = state.sort.despesas;
  const factor = direction === 'desc' ? -1 : 1;

  return [...rows].sort((a, b) => {
    const av = normalizeText(getSortValue(a, column));
    const bv = normalizeText(getSortValue(b, column));
    const result = av.localeCompare(bv, 'pt-BR', { numeric: true, sensitivity: 'base' });
    if (result !== 0) return result * factor;

    const ad = String(a.data_referencia || '');
    const bd = String(b.data_referencia || '');
    const dateResult = bd.localeCompare(ad);
    if (dateResult !== 0) return dateResult;

    return String(a.colaborador || '').localeCompare(String(b.colaborador || ''), 'pt-BR') * factor;
  });
}


function yesNoChip(value) {
  return value
    ? '<span class="conf-chip conf-chip-ok">Sim</span>'
    : '<span class="conf-chip conf-chip-neutral">Não</span>';
}

function getRegional(row) {
  return row.supervisao || row.regional || row.coordenacao || '-';
}

function deslocamentoResumo(row) {
  const tipo = row.deslocamento_tipo || 'NÃO PRECISA';
  const tipoNorm = normalizeText(tipo);
  if (!tipo || ['NAO PRECISA', 'NÃO PRECISA'].includes(tipoNorm)) return 'Não precisa';
  const parts = [tipo];
  if (row.deslocamento_origem || row.deslocamento_destino) {
    parts.push([row.deslocamento_origem, row.deslocamento_destino].filter(Boolean).join(' → '));
  }
  if (asNumber(row.deslocamento_valor) > 0) parts.push(money(row.deslocamento_valor));
  return parts.filter(Boolean).join(' • ');
}

function extrasResumo(row) {
  const total = getDespesaValor(row);
  const itens = Array.isArray(row.extras_itens) ? row.extras_itens : [];
  if (!itens.length && total <= 0) return 'Sem extras';
  const tipos = [...new Set(itens.map((item) => item.tipo_despesa || item.descricao || 'Outro').filter(Boolean))];
  const prefix = tipos.length ? tipos.join(' + ') : 'Extras';
  return `${prefix} • ${money(total)}`;
}

function buildDespesaResumo(row) {
  const parts = [];

  if (row.programacao_status) parts.push(`Programação: ${row.programacao_status}`);

  if (row.disponibilidade_status && normalizeText(row.disponibilidade_status) !== 'OK') {
    parts.push(`Disponibilidade: ${row.disponibilidade_status}`);
  }
  if (row.estadia_tipo && !['NÃO PRECISA', 'NAO PRECISA', 'CASA'].includes(normalizeText(row.estadia_tipo))) {
    parts.push(`Estadia: ${row.estadia_tipo}${row.hotel_dias ? ` (${row.hotel_dias} diária(s))` : ''}`);
  }

  const refeicoes = [];
  if (row.cafe_valor) refeicoes.push('café');
  if (row.almoco_valor) refeicoes.push('almoço');
  if (row.janta_valor) refeicoes.push('janta');
  if (refeicoes.length) parts.push(`Alimentação: ${refeicoes.join(', ')}`);

  if (row.deslocamento_tipo && !['NÃO PRECISA', 'NAO PRECISA'].includes(normalizeText(row.deslocamento_tipo))) {
    parts.push(`Deslocamento: ${row.deslocamento_tipo}`);
  }

  if (row.deslocamento_valor || row.valor_deslocamento) {
    const valorDesloc = asNumber(row.deslocamento_valor || row.valor_deslocamento);
    if (valorDesloc > 0) parts.push(`Valor deslocamento: ${money(valorDesloc)}`);
  }

  const extras = getDespesaValor(row);
  if (extras > 0) parts.push(`Extras: ${money(extras)}`);

  if (Array.isArray(row.extras_itens) && row.extras_itens.length) {
    parts.push(`Extras lançados: ${row.extras_itens.map((e) => e.tipo_despesa || e.descricao || 'Outro').join(', ')}`);
  }
  if (row.manut_veic) parts.push(`Manutenção: ${row.manut_veic}`);

  return parts.length ? parts.join(' • ') : 'Sem despesa operacional marcada.';
}

function getDespesaValor(row) {
  return asNumber(row.extras_total)
    + asNumber(row.extras_recarga_valor)
    + asNumber(row.extras_passagem_valor)
    + asNumber(row.extras_lavagem_valor);
}

function isPedidoHospedagem(row) {
  return row.estadia_tipo && !['NÃO PRECISA', 'NAO PRECISA', 'CASA'].includes(normalizeText(row.estadia_tipo));
}

function isPedidoDeslocamento(row) {
  return row.deslocamento_tipo && !['NÃO PRECISA', 'NAO PRECISA'].includes(normalizeText(row.deslocamento_tipo));
}

function getUniqueRegionais() {
  const values = [...state.despesas, ...state.auditoria, ...state.resultado, ...state.uber]
    .map((row) => row.supervisao || row.regional || row.coordenacao)
    .filter(Boolean);
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b), 'pt-BR'));
}

function applyLocalFilters(rows, kind) {
  const regional = normalizeText(state.filters.regional);
  const colaborador = normalizeText(state.filters.colaborador);
  const status = normalizeText(state.filters.status).replaceAll(' ', '_');

  return rows.filter((row) => {
    const rowRegional = normalizeText(row.supervisao || row.regional || row.coordenacao);
    const rowColaborador = normalizeText(row.colaborador || row.nome_colaborador || row.nome || row.funcionario || row.classificador);
    const rowStatus = kind === 'despesas' ? getStatus(row) : kind === 'uber' ? getUberClass(row) : normalizeText(row.status || row.severidade || row.resultado).replaceAll(' ', '_');

    if (regional && rowRegional !== regional) return false;
    if (colaborador && !rowColaborador.includes(colaborador)) return false;
    if (status && kind === 'despesas' && rowStatus !== status) return false;
    return true;
  });
}

function summarize() {
  const despesas = applyLocalFilters(state.despesas, 'despesas');
  const auditoria = applyLocalFilters(state.auditoria, 'auditoria');
  const resultado = applyLocalFilters(state.resultado, 'resultado');
  const uber = applyLocalFilters(state.uber, 'uber');

  const pendentes = despesas.filter((row) => ['PENDENTE', 'EM_ANALISE', 'PENDENCIA'].includes(getStatus(row))).length;
  const valorExtras = despesas.reduce((sum, row) => sum + getDespesaValor(row), 0);
  const hoteis = despesas.filter(isPedidoHospedagem).length;
  const deslocamentos = despesas.filter(isPedidoDeslocamento).length;
  const criticas = auditoria.filter((row) => ['ALTA', 'CRITICA', 'CRÍTICA'].includes(normalizeText(row.severidade))).length;
  const tons = resultado.reduce((sum, row) => sum + asNumber(row.toneladas || row.tons || row.embarcado), 0);
  const uberAtencao = uber.filter((row) => ['ATENCAO', 'ATENÇÃO', 'CAIXA_COLABORADOR'].includes(normalizeText(row.classificacao || row.status_validacao))).length;

  return { despesas, auditoria, resultado, uber, pendentes, valorExtras, hoteis, deslocamentos, criticas, tons, uberAtencao };
}

function renderStyles() {
  return `
    <style>
      .conf-hero{display:flex;justify-content:space-between;gap:18px;align-items:center;background:radial-gradient(circle at top right,rgba(34,197,94,.15),transparent 32%),linear-gradient(180deg,rgba(8,22,17,.95),rgba(6,19,14,.95));border:1px solid var(--line);border-radius:28px;padding:24px;box-shadow:var(--shadow)}
      .conf-hero h2{font-size:30px;margin:6px 0 10px}.conf-hero p{margin:0;color:var(--muted)}
      .conf-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.conf-btn{border:1px solid rgba(111,208,165,.22);background:rgba(15,23,42,.78);color:#eef7f2;border-radius:14px;padding:11px 14px;font-weight:800;cursor:pointer}.conf-btn:hover{background:rgba(22,101,52,.28)}.conf-btn-primary{background:#3fa878;color:#04130d}.conf-btn-danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.32)}
      .conf-grid{display:grid;grid-template-columns:repeat(6,minmax(150px,1fr));gap:14px;margin-top:16px}.conf-card{background:rgba(8,22,17,.68);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:var(--shadow-soft)}.conf-card h3{margin:0 0 10px;font-size:15px}.conf-metric{font-size:34px;line-height:1;font-weight:900;color:#dcfce7;margin:0 0 8px}.conf-card p{margin:0;color:var(--muted);font-size:13px}
      .conf-panel{margin-top:16px;background:rgba(8,22,17,.72);border:1px solid var(--line);border-radius:24px;padding:18px;box-shadow:var(--shadow-soft)}.conf-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px}.conf-panel-head h3{margin:0 0 6px}.conf-panel-head p{margin:0;color:var(--muted)}
      .conf-tabs{display:flex;gap:10px;flex-wrap:wrap}.conf-tab{border:1px solid rgba(111,208,165,.22);background:#15152a;color:#e2e2f0;border-radius:999px;padding:10px 14px;font-weight:800;cursor:pointer}.conf-tab.active{background:rgba(34,197,94,.22);border-color:rgba(111,208,165,.45);color:#dcfce7}
      .conf-filters{display:grid;grid-template-columns:repeat(5,minmax(160px,1fr));gap:12px}.conf-field label{display:block;font-size:12px;color:#dcfce7;font-weight:800;text-transform:uppercase;letter-spacing:.06em;margin:0 0 6px}.conf-field input,.conf-field select{width:100%;border:1px solid rgba(96,165,250,.22);border-radius:14px;background:#15152a;color:#e2e2f0;padding:12px 13px;color-scheme:dark}.conf-field option{background:#0d0d18;color:#e2e2f0}.conf-filter-actions{display:flex;gap:10px;align-items:end;flex-wrap:wrap}
      .conf-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px;background:#081611}.conf-table{width:100%;border-collapse:collapse;min-width:1180px}.conf-table-despesas{min-width:1220px}.conf-table th,.conf-table td{padding:13px 12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;vertical-align:top}.conf-table th{background:rgba(15,23,42,.92);color:#dcfce7;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.conf-sort-btn{width:100%;display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:#dcfce7;font:inherit;font-weight:900;text-transform:uppercase;letter-spacing:.06em;text-align:left;cursor:pointer;padding:0}.conf-sort-btn:hover{color:#86efac}.conf-sort-icon{font-size:13px;opacity:.55}.conf-sort-icon.active{opacity:1;color:#86efac}.conf-table td{color:#e2e2f0}.conf-table small{display:block;color:var(--muted);margin-top:4px}.conf-empty{text-align:center;color:var(--muted);padding:24px!important}.conf-row-actions{display:flex;gap:8px;flex-wrap:wrap}.conf-row-actions button{font-size:12px;padding:8px 10px;border-radius:12px}
      .conf-chip{display:inline-flex;align-items:center;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;border:1px solid rgba(148,163,184,.18)}.conf-chip-ok{background:rgba(34,197,94,.16);color:#bbf7d0;border-color:rgba(34,197,94,.28)}.conf-chip-warn{background:rgba(234,179,8,.14);color:#fde68a;border-color:rgba(234,179,8,.28)}.conf-chip-danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.32)}.conf-chip-info{background:rgba(59,130,246,.16);color:#bfdbfe;border-color:rgba(96,165,250,.30)}.conf-chip-neutral{background:rgba(148,163,184,.12);color:#cbd5e1}
      .conf-note{width:100%;min-height:74px;border:1px solid rgba(96,165,250,.22);border-radius:14px;background:#15152a;color:#e2e2f0;padding:12px;resize:vertical}.conf-feedback{min-height:20px;margin-top:10px;color:var(--muted)}
      .conf-subsection-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin:0 0 12px}.conf-subsection-head h4{margin:0;color:#f8fafc;font-size:17px;font-weight:900}.conf-subsection-head p{margin:4px 0 0;color:var(--muted);font-size:13px}.conf-counter{display:inline-flex;align-items:center;white-space:nowrap;border:1px solid rgba(148,163,184,.18);background:rgba(15,23,42,.72);color:#e2e2f0;border-radius:999px;padding:8px 12px;font-size:12px;font-weight:900}.conf-counter-ok{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.30);color:#bbf7d0}.conf-conferidos-box{margin-top:22px;padding:16px;border:1px solid rgba(34,197,94,.22);border-radius:20px;background:rgba(4,24,18,.58)}.conf-table-wrap-conferidos{border-color:rgba(34,197,94,.24)}.conf-row-conferido{background:rgba(34,197,94,.045)}
      .conf-uber-tools{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:0 0 12px;padding:12px 14px;border:1px solid rgba(111,208,165,.18);border-radius:18px;background:rgba(15,23,42,.48)}.conf-uber-tools p{margin:4px 0 0;color:var(--muted);font-size:12px}.conf-uber-actions{display:flex;gap:10px;flex-wrap:wrap}.conf-gps-ok{font-size:12px;color:#bbf7d0;font-weight:800}.conf-gps-missing{font-size:12px;color:#fde68a;font-weight:800}
      @media(max-width:1200px){.conf-grid{grid-template-columns:repeat(2,1fr)}.conf-filters{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.conf-hero,.conf-panel-head{display:block}.conf-grid,.conf-filters{grid-template-columns:1fr}.conf-actions{justify-content:flex-start;margin-top:12px}}
    </style>
  `;
}

function renderShell(content) {
  state.filters.inicio = state.filters.inicio || firstDayOfMonthISO();
  state.filters.fim = state.filters.fim || todayISO();

  content.innerHTML = `
    ${renderStyles()}
    <section class="conf-hero">
      <div>
        <div class="eyebrow">Operação ADM</div>
        <h2>Conferência operacional</h2>
        <p>Central para conferir despesas solicitadas na programação, irregularidades de auditoria e produção do período.</p>
      </div>
      <div class="conf-actions">
        <button class="conf-btn" id="conf-export-csv" type="button">Exportar CSV</button>
        <button class="conf-btn conf-btn-primary" id="conf-refresh" type="button">Atualizar</button>
      </div>
    </section>

    <section class="conf-grid" id="conf-metrics"></section>

    <section class="conf-panel">
      <div class="conf-panel-head">
        <div>
          <h3>Filtros</h3>
          <p>Filtre por período, supervisão/regional, colaborador e status da conferência.</p>
        </div>
      </div>
      <form class="conf-filters" id="conf-filters">
        <div class="conf-field">
          <label for="conf-inicio">Data inicial</label>
          <input id="conf-inicio" type="date" value="${escapeHtml(state.filters.inicio)}" />
        </div>
        <div class="conf-field">
          <label for="conf-fim">Data final</label>
          <input id="conf-fim" type="date" value="${escapeHtml(state.filters.fim)}" />
        </div>
        <div class="conf-field">
          <label for="conf-regional">Supervisão / Regional</label>
          <select id="conf-regional"><option value="">Todas</option></select>
        </div>
        <div class="conf-field">
          <label for="conf-colaborador">Colaborador</label>
          <input id="conf-colaborador" type="search" placeholder="Nome do colaborador" value="${escapeHtml(state.filters.colaborador)}" />
        </div>
        <div class="conf-field">
          <label for="conf-status">Status</label>
          <select id="conf-status">
            <option value="">Todos</option>
            <option value="PENDENTE">Pendente</option>
            <option value="EM_ANALISE">Em análise</option>
            <option value="CONFERIDO">Conferido</option>
            <option value="PENDENCIA">Pendência</option>
            <option value="CANCELADO">Cancelado</option>
          </select>
        </div>
        <div class="conf-filter-actions">
          <button class="conf-btn conf-btn-primary" type="submit">Aplicar</button>
          <button class="conf-btn" id="conf-clear" type="button">Limpar</button>
        </div>
      </form>
      <div class="conf-feedback" id="conf-feedback"></div>
    </section>

    <section class="conf-panel">
      <div class="conf-panel-head">
        <div>
          <h3>Fila de conferência</h3>
          <p id="conf-table-subtitle">Resumo por colaborador: alimentação, deslocamento e extras.</p>
        </div>
        <div class="conf-tabs">
          <button class="conf-tab active" data-tab="despesas" type="button">Despesas da programação</button>
          <button class="conf-tab" data-tab="auditoria" type="button">Auditoria</button>
          <button class="conf-tab" data-tab="resultado" type="button">Resultado diário</button>
          <button class="conf-tab" data-tab="uber" type="button">Uber</button>
        </div>
      </div>
      <div id="conf-table"></div>
    </section>
  `;

  bindEvents();
}

function renderRegionalOptions() {
  const select = document.getElementById('conf-regional');
  if (!select) return;
  const current = state.filters.regional;
  const options = getUniqueRegionais().map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
  select.innerHTML = `<option value="">Todas</option>${options}`;
  select.value = current;
}

function renderMetrics() {
  const s = summarize();
  const html = [
    ['Pendentes', s.pendentes, 'Solicitações aguardando conferência.'],
    ['Colaboradores', s.despesas.length, 'Linhas carregadas para conferência.'],
    ['Extras', money(s.valorExtras), 'Recarga, passagem e lavagem.'],
    ['Hotel/Desloc.', `${s.hoteis}/${s.deslocamentos}`, 'Hospedagens e deslocamentos solicitados.'],
    ['Auditoria crítica', s.criticas, 'Ocorrências alta/crítica no período.'],
    ['Uber atenção', s.uberAtencao, 'Corridas fora da regra de 2 km.'],
  ].map(([title, metric, desc]) => `
    <article class="conf-card">
      <h3>${escapeHtml(title)}</h3>
      <div class="conf-metric">${escapeHtml(metric)}</div>
      <p>${escapeHtml(desc)}</p>
    </article>
  `).join('');
  document.getElementById('conf-metrics').innerHTML = html;
}

function renderActiveTab() {
  document.querySelectorAll('.conf-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === state.tab));
  renderMetrics();
  renderRegionalOptions();

  const subtitle = document.getElementById('conf-table-subtitle');
  if (subtitle) {
    subtitle.textContent = state.tab === 'despesas'
      ? 'Resumo por colaborador: alimentação, deslocamento e extras.'
      : state.tab === 'auditoria'
        ? 'Ocorrências e divergências registradas na auditoria.'
        : state.tab === 'resultado'
          ? 'Produção importada para comparação operacional.'
          : 'Corridas corporativas com validação por ponto de embarque e casa do colaborador.';
  }

  if (state.tab === 'despesas') return renderDespesasTable();
  if (state.tab === 'auditoria') return renderAuditoriaTable();
  if (state.tab === 'uber') return renderUberTable();
  return renderResultadoTable();
}

function despesasTableHead() {
  return `
    <thead>
      <tr>
        ${sortableTh('colaborador', 'Colaborador')}
        ${sortableTh('regional', 'Regional')}
        ${sortableTh('status', 'Status')}
        <th>Café</th>
        <th>Almoço</th>
        <th>Janta</th>
        <th>Deslocamento</th>
        <th>Extras</th>
        <th>Ações</th>
      </tr>
    </thead>
  `;
}

function despesasRowHtml(row, mode = 'fila') {
  const isConferido = mode === 'conferidos';
  return `
    <tr class="${isConferido ? 'conf-row-conferido' : ''}">
      <td>
        <strong>${escapeHtml(row.colaborador || row.nome_colaborador || '-')}</strong>
        <small>${brDate(row.data_referencia)}${row.cargo ? ` • ${escapeHtml(row.cargo)}` : ''}</small>
      </td>
      <td>
        ${escapeHtml(getRegional(row))}
        <small>${escapeHtml(row.coordenacao || '')}</small>
      </td>
      <td>${statusChip(getStatus(row))}</td>
      <td>${yesNoChip(!!row.cafe_valor)}</td>
      <td>${yesNoChip(!!row.almoco_valor)}</td>
      <td>${yesNoChip(!!row.janta_valor)}</td>
      <td>
        ${escapeHtml(deslocamentoResumo(row))}
        <small>${escapeHtml(row.deslocamento_obs || '')}</small>
      </td>
      <td>
        <strong>${escapeHtml(extrasResumo(row))}</strong>
        <small>${escapeHtml(row.extras_obs || '')}</small>
      </td>
      <td>
        <div class="conf-row-actions">
          ${isConferido
            ? `
              <button class="conf-btn" data-action="EM_ANALISE" data-id="${escapeHtml(row.id)}" type="button">Reabrir</button>
              <button class="conf-btn conf-btn-danger" data-action="PENDENCIA" data-id="${escapeHtml(row.id)}" type="button">Pendência</button>
            `
            : `
              <button class="conf-btn" data-action="EM_ANALISE" data-id="${escapeHtml(row.id)}" type="button">Analisar</button>
              <button class="conf-btn conf-btn-primary" data-action="CONFERIDO" data-id="${escapeHtml(row.id)}" type="button">Conferir</button>
              <button class="conf-btn conf-btn-danger" data-action="PENDENCIA" data-id="${escapeHtml(row.id)}" type="button">Pendência</button>
            `}
        </div>
      </td>
    </tr>
  `;
}

function renderDespesasTable() {
  const rows = sortRows(applyLocalFilters(state.despesas, 'despesas'), 'despesas');
  const target = document.getElementById('conf-table');
  const filaRows = rows.filter((row) => getStatus(row) !== 'CONFERIDO');
  const conferidosRows = rows.filter((row) => getStatus(row) === 'CONFERIDO');

  if (!rows.length) {
    target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Nenhuma despesa encontrada para os filtros selecionados.</td></tr></tbody></table></div>`;
    return;
  }

  target.innerHTML = `
    <div class="conf-subsection-head">
      <div>
        <h4>Itens para conferir</h4>
        <p>Somente registros ainda não finalizados aparecem nesta fila.</p>
      </div>
      <span class="conf-counter">${filaRows.length} item(ns)</span>
    </div>
    <div class="conf-table-wrap">
      <table class="conf-table conf-table-despesas">
        ${despesasTableHead()}
        <tbody>
          ${filaRows.length
            ? filaRows.map((row) => despesasRowHtml(row, 'fila')).join('')
            : '<tr><td class="conf-empty" colspan="9">Nenhum item pendente. Os registros conferidos estão na tabela abaixo.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="conf-conferidos-box">
      <div class="conf-subsection-head">
        <div>
          <h4>Conferidos</h4>
          <p>Registros finalizados ficam separados para facilitar a revisão do conferente.</p>
        </div>
        <span class="conf-counter conf-counter-ok">${conferidosRows.length} conferido(s)</span>
      </div>
      <div class="conf-table-wrap conf-table-wrap-conferidos">
        <table class="conf-table conf-table-despesas">
          ${despesasTableHead()}
          <tbody>
            ${conferidosRows.length
              ? conferidosRows.map((row) => despesasRowHtml(row, 'conferidos')).join('')
              : '<tr><td class="conf-empty" colspan="9">Nenhum registro conferido nos filtros atuais.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function renderAuditoriaTable() {
  const rows = applyLocalFilters(state.auditoria, 'auditoria');
  const target = document.getElementById('conf-table');
  if (!rows.length) {
    target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Nenhuma ocorrência de auditoria encontrada.</td></tr></tbody></table></div>`;
    return;
  }
  target.innerHTML = `
    <div class="conf-table-wrap">
      <table class="conf-table">
        <thead><tr><th>Data</th><th>Colaborador</th><th>Supervisão</th><th>Ocorrência</th><th>Resultado</th><th>Impacto</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${brDate(row.data_evento || row.data_classificacao)}</td>
              <td><strong>${escapeHtml(row.nome_colaborador)}</strong><small>${escapeHtml(row.tipo_funcionario || '')}</small></td>
              <td>${escapeHtml(row.supervisao || '-')}<small>${escapeHtml(row.coordenacao || '')}</small></td>
              <td>${escapeHtml(row.tipo_evento || row.motivo_recusa || '-')}<small>${escapeHtml(row.descricao || row.observacoes || '')}</small></td>
              <td>${escapeHtml(row.resultado || row.resultado_auditoria || row.resultado_recusa || '-')}</td>
              <td>${statusChip(row.severidade || 'baixa')}<small>Score: ${escapeHtml(row.score_impacto ?? row.diferenca ?? 0)}</small></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}


function isUberUsoPessoal(row) {
  const text = [row.detalhamento_despesa, row.observacao_validacao, row.motivo_validacao, row.observacao, row.observacoes]
    .filter(Boolean)
    .join(' ');
  return normalizeText(text).includes('PESSOAL');
}

function getUberClass(row) {
  if (isUberUsoPessoal(row)) return 'ATENCAO';
  const value = row.classificacao || row.status_validacao || 'ATENCAO';
  const norm = normalizeText(value).replaceAll(' ', '_');
  if (norm === 'VALIDADA' || norm === 'VALIDADO') return 'VALIDADA';
  if (norm === 'CAIXA_COLABORADOR' || norm === 'CAIXA') return 'CAIXA_COLABORADOR';
  return 'ATENCAO';
}

function uberClassChip(row) {
  const key = getUberClass(row);
  if (key === 'VALIDADA') return '<span class="conf-chip conf-chip-ok">Válida</span>';
  if (key === 'CAIXA_COLABORADOR') return '<span class="conf-chip conf-chip-danger">Caixa colaborador</span>';
  return '<span class="conf-chip conf-chip-warn">Atenção</span>';
}


function hasUberCoordinates(row) {
  return row.partida_latitude !== null && row.partida_latitude !== undefined && row.partida_latitude !== ''
    && row.partida_longitude !== null && row.partida_longitude !== undefined && row.partida_longitude !== ''
    && row.destino_latitude !== null && row.destino_latitude !== undefined && row.destino_latitude !== ''
    && row.destino_longitude !== null && row.destino_longitude !== undefined && row.destino_longitude !== '';
}

function needsUberGeocoding(row) {
  return !hasUberCoordinates(row) && (row.endereco_partida || row.endereco_destino);
}

function geocodingKey(address) {
  return normalizeText(address).replace(/\s+/g, ' ').slice(0, 220);
}

function buildBrazilAddress(address) {
  const text = String(address || '').trim();
  if (!text) return '';
  return /brasil|brazil/i.test(text) ? text : `${text}, Brasil`;
}

function cleanUberAddress(address) {
  return String(address || '')
    .replace(/\s+/g, ' ')
    .replace(/\s+-\s+/g, ', ')
    .replace(/,\s*,+/g, ',')
    .replace(/\bBrasil\b,?\s*Brasil\b/gi, 'Brasil')
    .trim();
}

function extractPostalCode(address) {
  const match = String(address || '').match(/\b\d{5}-?\d{3}\b/);
  return match ? match[0].replace(/\D/g, '') : '';
}

function withoutPostalCode(address) {
  return String(address || '').replace(/\b\d{5}-?\d{3}\b/g, '').replace(/,\s*,+/g, ',').trim();
}

function buildGeocodeQueries(address) {
  const raw = cleanUberAddress(address);
  if (!raw) return [];

  const noCep = cleanUberAddress(withoutPostalCode(raw));
  const normalizedSeparators = cleanUberAddress(raw.replace(/\s+-\s+/g, ', '));
  const noCepNormalized = cleanUberAddress(withoutPostalCode(normalizedSeparators));

  const parts = raw.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
  const variants = [
    raw,
    normalizedSeparators,
    noCep,
    noCepNormalized,
  ];

  if (parts.length >= 2) variants.push(`${parts[0]}, ${parts.slice(-1)[0]}`);
  if (parts.length >= 3) variants.push(`${parts[0]}, ${parts[parts.length - 2]}, ${parts[parts.length - 1]}`);

  const cep = extractPostalCode(raw);
  if (cep) variants.push(cep);

  const unique = [];
  const seen = new Set();
  variants.forEach((variant) => {
    const value = buildBrazilAddress(cleanUberAddress(variant));
    const key = normalizeText(value);
    if (value && !seen.has(key)) {
      seen.add(key);
      unique.push(value);
    }
  });
  return unique.slice(0, 7);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCachedGeocode(address) {
  const addressKey = geocodingKey(address);
  if (!addressKey) return null;

  const { data, error } = await supabase
    .from('conferencia_geocoding_cache')
    .select('latitude,longitude,display_name')
    .eq('address_key', addressKey)
    .maybeSingle();

  if (error) {
    console.warn('[Conferência Uber] cache indisponível:', error.message);
    return null;
  }
  if (!data) return null;
  return { lat: Number(data.latitude), lon: Number(data.longitude), display_name: data.display_name || '' };
}

async function saveGeocodeCache(address, result, provider = 'nominatim') {
  if (!address || !result || !Number.isFinite(result.lat) || !Number.isFinite(result.lon)) return;
  const payload = {
    address_key: geocodingKey(address),
    endereco_original: address,
    latitude: result.lat,
    longitude: result.lon,
    display_name: result.display_name || null,
    provider,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('conferencia_geocoding_cache')
    .upsert(payload, { onConflict: 'address_key' });

  if (error) console.warn('[Conferência Uber] não salvou cache:', error.message);
}

async function fetchNominatim(query) {
  const params = new URLSearchParams({
    q: query,
    format: 'jsonv2',
    addressdetails: '1',
    limit: '3',
    countrycodes: 'br',
  });

  const response = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
    headers: { 'Accept': 'application/json', 'Accept-Language': 'pt-BR,pt;q=0.9' },
  });

  if (response.status === 429) {
    await sleep(GEOCODING_RETRY_DELAY_MS);
    throw new Error('Limite temporário do geocoding. Tente novamente em alguns segundos.');
  }
  if (!response.ok) throw new Error(`Geocoding retornou HTTP ${response.status}`);

  const results = await response.json();
  const first = Array.isArray(results) ? results[0] : null;
  if (!first?.lat || !first?.lon) return null;

  return {
    lat: Number(first.lat),
    lon: Number(first.lon),
    display_name: first.display_name || '',
    query_used: query,
  };
}

async function geocodeAddress(address) {
  const original = cleanUberAddress(address);
  if (!original) return null;

  const cached = await getCachedGeocode(original);
  if (cached && Number.isFinite(cached.lat) && Number.isFinite(cached.lon)) return cached;

  const queries = buildGeocodeQueries(original);
  for (let index = 0; index < queries.length; index += 1) {
    const query = queries[index];
    try {
      const result = await fetchNominatim(query);
      if (result && Number.isFinite(result.lat) && Number.isFinite(result.lon)) {
        await saveGeocodeCache(original, result, 'nominatim');
        return result;
      }
    } catch (error) {
      console.warn('[Conferência Uber] falha no geocoding:', query, error.message);
      if (/Limite temporário/i.test(error.message)) throw error;
    }
    if (index < queries.length - 1) await sleep(GEOCODING_DELAY_MS);
  }

  return null;
}

async function geocodeUberRow(row) {
  if (!row?.id) return false;
  const update = {};
  let changed = false;
  const missing = [];

  if ((!row.partida_latitude || !row.partida_longitude) && row.endereco_partida) {
    const partida = await geocodeAddress(row.endereco_partida);
    if (partida) {
      update.partida_latitude = partida.lat;
      update.partida_longitude = partida.lon;
      changed = true;
    } else {
      missing.push('partida');
    }
    await sleep(GEOCODING_DELAY_MS);
  }

  if ((!row.destino_latitude || !row.destino_longitude) && row.endereco_destino) {
    const destino = await geocodeAddress(row.endereco_destino);
    if (destino) {
      update.destino_latitude = destino.lat;
      update.destino_longitude = destino.lon;
      changed = true;
    } else {
      missing.push('destino');
    }
    await sleep(GEOCODING_DELAY_MS);
  }

  if (!changed && missing.length) {
    update.observacao_validacao = `GPS não localizado automaticamente para ${missing.join(' e ')}. Conferir manualmente ou ajustar endereço.`;
    update.updated_at = new Date().toISOString();
    const { error } = await supabase
      .from('conferencia_uber_corridas')
      .update(update)
      .eq('id', row.id);
    if (error) throw new Error(`Não foi possível salvar retorno do GPS: ${error.message}`);
    return false;
  }

  if (!changed) return false;

  update.observacao_validacao = missing.length
    ? `GPS convertido parcialmente. Ainda falta ${missing.join(' e ')}.`
    : null;
  update.updated_at = new Date().toISOString();

  const { error } = await supabase
    .from('conferencia_uber_corridas')
    .update(update)
    .eq('id', row.id);

  if (error) throw new Error(`Não foi possível salvar coordenadas: ${error.message}`);
  return true;
}

async function geocodeUberBatch(onlyId = null) {
  const sourceRows = onlyId
    ? state.uber.filter((row) => String(row.id) === String(onlyId))
    : applyLocalFilters(state.uber, 'uber').filter(needsUberGeocoding).slice(0, GEOCODING_MAX_BATCH);

  if (!sourceRows.length) {
    setFeedback('Nenhuma corrida pendente de coordenadas nos filtros atuais.');
    return;
  }

  setFeedback(`Convertendo endereços em GPS: 0/${sourceRows.length}. Aguarde a finalização antes de sair da tela.`);
  let ok = 0;
  let fail = 0;

  for (const row of sourceRows) {
    try {
      const changed = await geocodeUberRow(row);
      if (changed) ok += 1;
      else fail += 1;
    } catch (error) {
      console.error(error);
      fail += 1;
    }
    setFeedback(`Convertendo endereços em GPS: ${ok + fail}/${sourceRows.length}. Sucesso: ${ok}. Não localizados/erro: ${fail}.`);
  }

  await loadUber();
  renderActiveTab();
  setFeedback(`Conversão GPS concluída. Atualizadas: ${ok}. Não localizadas/erro: ${fail}.`);
}

function renderUberTable() {
  const rows = applyLocalFilters(state.uber, 'uber');
  const target = document.getElementById('conf-table');
  const pendingGps = rows.filter(needsUberGeocoding).length;
  if (!rows.length) {
    target.innerHTML = `
      <div class="conf-uber-tools">
        <div>
          <strong>Sincronização Uber</strong>
          <p>Nenhuma corrida encontrada nos filtros atuais. Sincronize pela API para buscar as corridas do período selecionado.</p>
        </div>
        <div class="conf-uber-actions">
          <button class="conf-btn conf-btn-primary" data-uber-sync-api="1" type="button">Sincronizar API</button>
          <label class="conf-btn" for="uber-csv-import-empty">Importar CSV Uber<input id="uber-csv-import-empty" data-uber-csv-import="1" type="file" accept=".csv,text/csv" hidden></label>
          <button class="conf-btn" data-uber-geocode-pending="1" type="button" disabled>Converter GPS pendentes</button>
        </div>
      </div>
      <div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Nenhuma corrida Uber encontrada para os filtros selecionados.</td></tr></tbody></table></div>`;
    return;
  }
  target.innerHTML = `
    <div class="conf-uber-tools">
      <div>
        <strong>GPS das corridas</strong>
        <p>${pendingGps ? `${pendingGps} corrida(s) sem coordenadas nos filtros atuais.` : 'Todas as corridas filtradas já possuem coordenadas de partida e destino.'} Fonte: OpenStreetMap/Nominatim.</p>
      </div>
      <div class="conf-uber-actions">
        <button class="conf-btn conf-btn-primary" data-uber-sync-api="1" type="button">Sincronizar API</button>
        <label class="conf-btn" for="uber-csv-import">Importar CSV Uber<input id="uber-csv-import" data-uber-csv-import="1" type="file" accept=".csv,text/csv" hidden></label>
        <button class="conf-btn" data-uber-geocode-pending="1" type="button" ${pendingGps ? '' : 'disabled'}>Converter GPS pendentes</button>
      </div>
    </div>
    <div class="conf-table-wrap">
      <table class="conf-table" style="min-width:1540px">
        <thead><tr><th>Data</th><th>Colaborador</th><th>Regional</th><th>Partida</th><th>Destino</th><th>Valor</th><th>Distância</th><th>GPS</th><th>Validação</th><th>Motivo</th><th>Ações</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${brDate(row.data_solicitacao_local || row.data_corrida || row.data)}</td>
              <td><strong>${escapeHtml(row.nome_colaborador || row.nome || '-')}</strong><small>${escapeHtml(row.servico || row.grupo || '')}</small></td>
              <td>${escapeHtml(row.supervisao || row.regional || '-')}<small>${escapeHtml(row.coordenacao || row.coord || '')}</small></td>
              <td>${escapeHtml(row.endereco_partida || '-')}<small>Casa: ${escapeHtml(row.distancia_partida_casa_km ?? row.distancia_destino_casa_km ?? '-')} km</small></td>
              <td>${escapeHtml(row.endereco_destino || '-')}<small>Embarque: ${escapeHtml(row.distancia_partida_embarque_km ?? row.distancia_destino_embarque_km ?? '-')} km</small></td>
              <td><strong>${money(row.valor || row.preco_liquido || 0)}</strong></td>
              <td>${escapeHtml(row.distancia_mi || row.distancia_km || '-')}<small>${escapeHtml(row.duracao_min ? `${row.duracao_min} min` : '')}</small></td>
              <td>${hasUberCoordinates(row) ? '<span class="conf-gps-ok">GPS ok</span>' : '<span class="conf-gps-missing">Sem GPS</span>'}</td>
              <td>${uberClassChip(row)}</td>
              <td>${escapeHtml(isUberUsoPessoal(row) ? 'Atenção: observação/detalhamento contém "Pessoal". Conferir antes de validar a corrida.' : (row.motivo_validacao || row.observacao_validacao || row.detalhamento_despesa || '-'))}</td>
              <td>
                <div class="conf-row-actions">
                  ${needsUberGeocoding(row) ? `<button class="conf-btn" data-uber-geocode-id="${escapeHtml(row.id)}" type="button">GPS</button>` : ''}
                  <button class="conf-btn conf-btn-primary" data-uber-action="VALIDADA" data-uber-id="${escapeHtml(row.id)}" type="button">Validar</button>
                  <button class="conf-btn conf-btn-danger" data-uber-action="CAIXA_COLABORADOR" data-uber-id="${escapeHtml(row.id)}" type="button">Caixa</button>
                  <button class="conf-btn" data-uber-action="ATENCAO" data-uber-id="${escapeHtml(row.id)}" type="button">Atenção</button>
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderResultadoTable() {
  const rows = applyLocalFilters(state.resultado, 'resultado');
  const target = document.getElementById('conf-table');
  if (!rows.length) {
    target.innerHTML = `<div class="conf-table-wrap"><table class="conf-table"><tbody><tr><td class="conf-empty">Nenhum resultado diário encontrado.</td></tr></tbody></table></div>`;
    return;
  }
  target.innerHTML = `
    <div class="conf-table-wrap">
      <table class="conf-table">
        <thead><tr><th>Data</th><th>Funcionário</th><th>Supervisão</th><th>Cliente / Local</th><th>OS</th><th>Cargas</th><th>Toneladas</th><th>Embarcado</th></tr></thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${brDate(row.data)}</td>
              <td><strong>${escapeHtml(row.funcionario || '-')}</strong></td>
              <td>${escapeHtml(row.supervisao || '-')}<small>${escapeHtml(row.coordenacao || '')}</small></td>
              <td>${escapeHtml(row.cliente_final || row.cliente_regional || row.cliente_nacional || '-')}<small>${escapeHtml(row.local_embarque || row.destino || '')}</small></td>
              <td>${escapeHtml(row.os || '-')}</td>
              <td>${escapeHtml(row.cargas || 0)}</td>
              <td>${escapeHtml(row.toneladas || 0)}</td>
              <td>${escapeHtml(row.embarcado || 0)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function getFilterValues() {
  state.filters.inicio = document.getElementById('conf-inicio')?.value || '';
  state.filters.fim = document.getElementById('conf-fim')?.value || '';
  state.filters.regional = document.getElementById('conf-regional')?.value || '';
  state.filters.colaborador = document.getElementById('conf-colaborador')?.value || '';
  state.filters.status = document.getElementById('conf-status')?.value || '';
}

function setFeedback(message, isError = false) {
  const el = document.getElementById('conf-feedback');
  if (!el) return;
  el.textContent = message || '';
  el.style.color = isError ? '#fecaca' : 'var(--muted)';
}

async function selectByProgramacoes(table, columns, programacaoIds) {
  if (!programacaoIds.length) return [];
  const { data, error } = await supabase
    .from(table)
    .select(columns)
    .in('programacao_id', programacaoIds)
    .limit(5000);

  if (error) {
    console.warn(`[Conferência] ${table} indisponível:`, error.message);
    return [];
  }
  return data || [];
}

function makeKey(programacaoId, colaboradorId) {
  return `${programacaoId}::${colaboradorId}`;
}

function baseRow(programacao, colaboradorId, nomeColaborador = '') {
  return {
    id: makeKey(programacao.id, colaboradorId),
    programacao_id: programacao.id,
    colaborador_id: colaboradorId,
    data_referencia: programacao.data_referencia,
    coordenacao: programacao.coordenacao || '',
    supervisao: programacao.supervisao || programacao.regional || '',
    regional: programacao.regional || programacao.supervisao || '',
    colaborador: nomeColaborador || 'Colaborador',
    nome_colaborador: nomeColaborador || 'Colaborador',
    programacao_status: programacao.status || 'rascunho',
    status_conferencia: 'PENDENTE',
    observacao_conferencia: '',
    // Regra operacional: almoço nasce como SIM na programação.
    // Se não existir linha em programacao_alimentacao, a conferência deve manter SIM.
    cafe_valor: false,
    almoco_valor: true,
    janta_valor: false,
    alimentacao_registrada: false,
    extras_total: 0,
    extras_itens: [],
  };
}

async function loadDespesas() {
  let progQuery = supabase
    .from('programacao_dia')
    .select('*')
    .order('data_referencia', { ascending: false })
    .limit(500);

  if (state.filters.inicio) progQuery = progQuery.gte('data_referencia', state.filters.inicio);
  if (state.filters.fim) progQuery = progQuery.lte('data_referencia', state.filters.fim);

  const { data: programacoes, error: progError } = await progQuery;
  if (progError) throw new Error(`Programações: ${progError.message}`);

  const programacaoIds = (programacoes || []).map((p) => p.id).filter(Boolean);
  if (!programacaoIds.length) {
    state.despesas = [];
    return;
  }

  const programacaoMap = new Map((programacoes || []).map((p) => [p.id, p]));

  const [disp, estadia, alimentacao, deslocamento, extras, statusRows] = await Promise.all([
    selectByProgramacoes('programacao_colaboradores', '*', programacaoIds),
    selectByProgramacoes('programacao_estadia', '*', programacaoIds),
    selectByProgramacoes('programacao_alimentacao', '*', programacaoIds),
    selectByProgramacoes('programacao_deslocamento', '*', programacaoIds),
    selectByProgramacoes('programacao_extras', '*', programacaoIds),
    selectByProgramacoes('programacao_conferencia_status', '*', programacaoIds),
  ]);

  const rows = new Map();

  const getRow = (programacaoId, colaboradorId, nomeColaborador = '') => {
    const key = makeKey(programacaoId, colaboradorId);
    if (!rows.has(key)) rows.set(key, baseRow(programacaoMap.get(programacaoId) || {}, colaboradorId, nomeColaborador));
    const row = rows.get(key);
    if (nomeColaborador && (!row.colaborador || row.colaborador === 'Colaborador')) {
      row.colaborador = nomeColaborador;
      row.nome_colaborador = nomeColaborador;
    }
    return row;
  };

  disp.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.disponibilidade_status = r.disponibilidade || 'OK';
    row.disponibilidade_obs = r.observacao || '';
    row.cargo = r.cargo || row.cargo || '';
    row.coordenacao = r.coordenacao || row.coordenacao;
    row.supervisao = r.supervisao || row.supervisao;
  });

  estadia.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.estadia_tipo = r.tipo_estadia || 'NÃO PRECISA';
    row.estadia_obs = r.observacao || '';
    row.hotel_dias = r.diarias || 0;
    row.estadia_cidade = r.cidade || '';
    row.estadia_uf = r.uf || '';
    row.checkin = r.checkin || '';
    row.checkout = r.checkout || '';
  });

  alimentacao.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.alimentacao_registrada = true;
    row.cafe_valor = coerceBool(r.cafe, false);
    row.almoco_valor = coerceBool(r.almoco, true);
    row.janta_valor = coerceBool(r.janta, false);
    row.alimentacao_obs = r.observacao || '';
  });

  deslocamento.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.deslocamento_tipo = r.tipo_deslocamento || 'NÃO PRECISA';
    row.deslocamento_obs = r.observacao || '';
    row.deslocamento_origem = r.origem || '';
    row.deslocamento_destino = r.destino || '';
    row.deslocamento_km = r.km || 0;
    row.deslocamento_valor = r.valor || 0;
  });

  extras.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador);
    row.extras_itens.push(r);
    row.extras_total += asNumber(r.valor);
    row.extras_obs = [row.extras_obs, r.observacao, r.descricao].filter(Boolean).join(' | ');
  });

  statusRows.forEach((r) => {
    const row = getRow(r.programacao_id, r.colaborador_id, r.nome_colaborador || '');
    row.status_conferencia = r.status_conferencia || 'PENDENTE';
    row.observacao_conferencia = r.observacao_conferencia || '';
    row.conferencia_status_id = r.id;
    row.conferido_em = r.conferido_em || null;
  });

  state.despesas = [...rows.values()].sort((a, b) => {
    const d = String(b.data_referencia || '').localeCompare(String(a.data_referencia || ''));
    if (d) return d;
    return String(a.colaborador || '').localeCompare(String(b.colaborador || ''), 'pt-BR');
  });
}

async function loadAuditoria() {
  let query = supabase
    .from('operacional_auditoria_colaborador')
    .select('*')
    .order('data_evento', { ascending: false, nullsFirst: false })
    .limit(500);

  if (state.filters.inicio) query = query.gte('data_evento', state.filters.inicio);
  if (state.filters.fim) query = query.lte('data_evento', state.filters.fim);

  const { data, error } = await query;
  if (error) {
    state.auditoria = [];
    console.warn('[Conferência] Auditoria indisponível:', error.message);
    return;
  }
  state.auditoria = data || [];
}

async function loadResultado() {
  let query = supabase
    .from('relatorio_resultado_diario')
    .select('*')
    .order('data', { ascending: false, nullsFirst: false })
    .limit(500);

  if (state.filters.inicio) query = query.gte('data', state.filters.inicio);
  if (state.filters.fim) query = query.lte('data', state.filters.fim);

  const { data, error } = await query;
  if (error) {
    state.resultado = [];
    console.warn('[Conferência] Resultado diário indisponível:', error.message);
    return;
  }
  state.resultado = data || [];
}


async function loadUber() {
  let query = supabase
    .from('vw_conferencia_uber_corridas')
    .select('*')
    .order('data_solicitacao_local', { ascending: false, nullsFirst: false })
    .limit(1000);

  if (state.filters.inicio) query = query.gte('data_solicitacao_local', state.filters.inicio);
  if (state.filters.fim) query = query.lte('data_solicitacao_local', state.filters.fim);

  const { data, error } = await query;
  if (error) {
    state.uber = [];
    console.warn('[Conferência] Uber indisponível:', error.message);
    return;
  }
  state.uber = data || [];
}


function parseDelimitedLine(line, delimiter = ';') {
  const values = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  values.push(current);
  return values.map((value) => String(value || '').trim());
}

function parseUberCsvText(text) {
  const normalized = String(text || '').replace(/^\ufeff/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n').filter((line) => line.trim() !== '');
  const headerIndex = lines.findIndex((line) => /^Data da solicitação/i.test(line.trim()));
  if (headerIndex < 0) throw new Error('Cabeçalho do CSV Uber não localizado. O arquivo precisa conter a seção Transações.');

  const headers = parseDelimitedLine(lines[headerIndex]).map((h) => h.trim());
  const rows = [];
  for (const line of lines.slice(headerIndex + 1)) {
    const cols = parseDelimitedLine(line);
    if (!cols.some(Boolean)) continue;
    const obj = {};
    headers.forEach((header, index) => { obj[header] = cols[index] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

function uberCsvDateToISO(value) {
  const raw = String(value || '').trim();
  const mdy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const [, month, day, year] = mdy;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const dmy = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (dmy) {
    const [, day, month, year] = dmy;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? todayISO() : date.toISOString().slice(0, 10);
}

function normalizeUberTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const match12 = raw.match(/^(\d{1,2}):(\d{2})\s*([AP]M)$/i);
  if (match12) {
    let hour = Number(match12[1]);
    const minute = match12[2];
    const suffix = match12[3].toUpperCase();
    if (suffix === 'PM' && hour < 12) hour += 12;
    if (suffix === 'AM' && hour === 12) hour = 0;
    return `${String(hour).padStart(2, '0')}:${minute}:00`;
  }
  const match24 = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (match24) return `${String(match24[1]).padStart(2, '0')}:${match24[2]}:${match24[3] || '00'}`;
  return raw.slice(0, 20);
}

function makeUberImportHash(row) {
  return [
    row.data_solicitacao_local,
    row.hora_solicitacao_local,
    row.nome_colaborador,
    row.servico,
    row.endereco_partida,
    row.endereco_destino,
    row.valor,
  ].map((v) => String(v ?? '').trim().toUpperCase()).join('|');
}

function mapUberCsvRow(row, fileName = '') {
  const nome = String(row.Nome || '').trim();
  const sobrenome = String(row.Sobrenome || '').trim();
  const data = uberCsvDateToISO(row['Data da solicitação (UTC)']);
  const hora = normalizeUberTime(row['Hora da solicitação (UTC)']);
  const valor = asNumber(row['Valor total: BRL']);
  const payload = {
    external_id: null,
    import_hash: null,
    data_solicitacao_local: data,
    hora_solicitacao_local: hora,
    hora_solicitacao_utc: hora,
    nome_colaborador: [nome, sobrenome].filter(Boolean).join(' ').trim(),
    nome,
    regional: row.Cidade || null,
    supervisao: row.Cidade || null,
    servico: row.Serviço || null,
    grupo: row.Serviço || null,
    categoria: 'UBER_EMPRESAS',
    endereco_partida: row['Endereço de partida'] || null,
    endereco_destino: row['Endereço de destino'] || null,
    valor,
    preco_liquido: valor,
    detalhamento_despesa: row['Detalhamento da despesa'] || null,
    observacao: row['Detalhamento da despesa'] || null,
    status_validacao: /pessoal/i.test(String(row['Detalhamento da despesa'] || '')) ? 'ATENCAO' : 'PENDENTE',
    origem: 'SFTP_CSV',
    raw: { ...row, arquivo_origem: fileName, conta_sftp: 'a3f32dd9' },
    updated_at: new Date().toISOString(),
  };
  payload.import_hash = makeUberImportHash(payload);
  return payload;
}

async function importUberCsvFile(file) {
  if (!file) return;
  setFeedback(`Lendo CSV Uber: ${file.name}...`);
  try {
    const text = await file.text();
    const rawRows = parseUberCsvText(text);
    const rows = rawRows.map((row) => mapUberCsvRow(row, file.name)).filter((row) => row.import_hash && row.nome_colaborador);
    if (!rows.length) throw new Error('Nenhuma transação válida localizada no CSV Uber.');

    const chunkSize = 400;
    let saved = 0;
    for (let i = 0; i < rows.length; i += chunkSize) {
      const chunk = rows.slice(i, i + chunkSize);
      const { error } = await supabase
        .from('conferencia_uber_corridas')
        .upsert(chunk, { onConflict: 'import_hash' });
      if (error) throw error;
      saved += chunk.length;
      setFeedback(`Importando CSV Uber: ${saved}/${rows.length} corrida(s)...`);
    }

    await loadUber();
    renderActiveTab();
    setFeedback(`CSV Uber importado. ${saved} corrida(s) inseridas/atualizadas.`);
  } catch (error) {
    console.error('[Conferência Uber] importação CSV:', error);
    setFeedback(`Falha ao importar CSV Uber. Detalhe: ${error.message || 'erro desconhecido'}`, true);
  }
}

async function syncUberApi() {
  if (state.loading) return;

  const inicio = state.filters.inicio || todayISO();
  const fim = state.filters.fim || inicio;

  setFeedback(`Sincronizando corridas da API Uber de ${brDate(inicio)} até ${brDate(fim)}...`);

  const { data, error } = await supabase.functions.invoke('sync-uber-corridas', {
    body: {
      inicio,
      fim,
      data_inicial: inicio,
      data_final: fim,
    },
  });

  if (error) {
    console.error('[Conferência Uber] falha ao sincronizar API:', error);
    setFeedback(`Falha ao sincronizar a API Uber. Confira a Edge Function sync-uber-corridas e a integração em TI > Integrações. Detalhe: ${error.message || 'erro desconhecido'}`, true);
    return;
  }

  if (data && data.ok === false) {
    console.warn('[Conferência Uber] sincronização pendente:', data);
    setFeedback(data.message || data.error || 'A sincronização Uber retornou pendência de configuração.', true);
    return;
  }

  await loadUber();
  renderActiveTab();

  const total = data?.inserted ?? data?.upserted ?? data?.total ?? data?.count ?? data?.sincronizadas ?? 0;
  setFeedback(data?.message || `Sincronização Uber concluída. Corridas retornadas/gravadas: ${total}.`);
}

async function updateUberStatus(id, classificacao) {
  const row = state.uber.find((item) => String(item.id) === String(id));
  if (!row) return;
  setFeedback('Salvando validação da corrida Uber...');

  const { data, error } = await supabase
    .from('conferencia_uber_corridas')
    .update({
      classificacao_manual: classificacao,
      status_validacao: classificacao,
      validado_em: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    setFeedback(`Não foi possível salvar validação Uber. Rode o SQL enviado no ZIP. Detalhe: ${error.message}`, true);
    return;
  }

  Object.assign(row, data, { classificacao });
  setFeedback('Validação da corrida Uber atualizada.');
  await loadUber();
  renderActiveTab();
}

async function loadAll() {
  if (state.loading) return;
  state.loading = true;
  setFeedback('Carregando dados da conferência...');
  try {
    await Promise.all([loadDespesas(), loadAuditoria(), loadResultado(), loadUber()]);
    setFeedback('Dados atualizados.');
  } catch (error) {
    console.error(error);
    setFeedback(error.message || 'Erro ao carregar conferência.', true);
  } finally {
    state.loading = false;
    renderActiveTab();
  }
}

async function updateDespesaStatus(id, status) {
  const row = state.despesas.find((item) => String(item.id) === String(id));
  if (!row) return;

  const note = row.observacao_conferencia || '';
  setFeedback('Salvando conferência...');

  const payload = {
    programacao_id: row.programacao_id,
    colaborador_id: row.colaborador_id,
    nome_colaborador: row.colaborador || row.nome_colaborador || null,
    data_referencia: row.data_referencia,
    coordenacao: row.coordenacao || null,
    supervisao: row.supervisao || row.regional || null,
    status_conferencia: status,
    observacao_conferencia: note,
    conferido_em: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('programacao_conferencia_status')
    .upsert(payload, { onConflict: 'programacao_id,colaborador_id' })
    .select('*')
    .single();

  if (error) {
    setFeedback(`Não foi possível salvar. Rode o SQL de estrutura enviado no ZIP. Detalhe: ${error.message}`, true);
    return;
  }

  Object.assign(row, {
    status_conferencia: data.status_conferencia,
    observacao_conferencia: data.observacao_conferencia,
    conferencia_status_id: data.id,
    conferido_em: data.conferido_em,
  });
  setFeedback('Status da conferência atualizado.');
  renderActiveTab();
}

function exportCsv() {
  const rows = state.tab === 'despesas'
    ? sortRows(applyLocalFilters(state.despesas, 'despesas'), 'despesas')
    : state.tab === 'auditoria'
      ? applyLocalFilters(state.auditoria, 'auditoria')
      : state.tab === 'uber'
        ? applyLocalFilters(state.uber, 'uber')
        : applyLocalFilters(state.resultado, 'resultado');

  if (!rows.length) {
    setFeedback('Não há dados para exportar.', true);
    return;
  }

  let headers;
  let csvRows;
  if (state.tab === 'despesas') {
    headers = ['Colaborador', 'Regional', 'Status', 'Café', 'Almoço', 'Janta', 'Deslocamento', 'Extras'];
    csvRows = rows.map((row) => [
      row.colaborador || row.nome_colaborador || '',
      getRegional(row),
      STATUS_LABELS[getStatus(row)] || getStatus(row),
      row.cafe_valor ? 'Sim' : 'Não',
      row.almoco_valor ? 'Sim' : 'Não',
      row.janta_valor ? 'Sim' : 'Não',
      deslocamentoResumo(row),
      extrasResumo(row),
    ]);
  } else if (state.tab === 'uber') {
    headers = ['Data', 'Colaborador', 'Regional', 'Partida', 'Destino', 'Valor', 'Validação', 'Motivo'];
    csvRows = rows.map((row) => [
      row.data_solicitacao_local || row.data_corrida || '',
      row.nome_colaborador || row.nome || '',
      row.supervisao || row.regional || '',
      row.endereco_partida || '',
      row.endereco_destino || '',
      row.valor || row.preco_liquido || 0,
      getUberClass(row),
      isUberUsoPessoal(row) ? 'Atenção: observação/detalhamento contém "Pessoal".' : (row.motivo_validacao || row.observacao_validacao || row.detalhamento_despesa || ''),
    ]);
  } else {
    headers = Object.keys(rows[0]);
    csvRows = rows.map((row) => headers.map((key) => row[key] ?? ''));
  }
  const csv = [headers.join(';')]
    .concat(csvRows.map((values) => values.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')))
    .join('\n');

  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conferencia-${state.tab}-${todayISO()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function bindEvents() {
  document.getElementById('conf-refresh')?.addEventListener('click', () => {
    getFilterValues();
    loadAll();
  });

  document.getElementById('conf-export-csv')?.addEventListener('click', exportCsv);

  document.getElementById('conf-filters')?.addEventListener('submit', (event) => {
    event.preventDefault();
    getFilterValues();
    loadAll();
  });

  document.getElementById('conf-clear')?.addEventListener('click', () => {
    state.filters = { inicio: firstDayOfMonthISO(), fim: todayISO(), regional: '', colaborador: '', status: '' };
    document.getElementById('conf-inicio').value = state.filters.inicio;
    document.getElementById('conf-fim').value = state.filters.fim;
    document.getElementById('conf-colaborador').value = '';
    document.getElementById('conf-status').value = '';
    document.getElementById('conf-regional').value = '';
    loadAll();
  });

  document.querySelectorAll('.conf-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.tab = btn.dataset.tab;
      renderActiveTab();
    });
  });

  document.getElementById('conf-table')?.addEventListener('change', (event) => {
    const input = event.target.closest('[data-uber-csv-import]');
    if (!input) return;
    const file = input.files && input.files[0];
    input.value = '';
    importUberCsvFile(file);
  });

  document.getElementById('conf-table')?.addEventListener('click', (event) => {
    const sortBtn = event.target.closest('[data-sort-column]');
    if (sortBtn) {
      const column = sortBtn.dataset.sortColumn;
      const current = state.sort.despesas;
      state.sort.despesas = {
        column,
        direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
      };
      renderActiveTab();
      return;
    }

    const syncUberBtn = event.target.closest('[data-uber-sync-api]');
    if (syncUberBtn) {
      syncUberApi();
      return;
    }

    const geocodePendingBtn = event.target.closest('[data-uber-geocode-pending]');
    if (geocodePendingBtn) {
      geocodeUberBatch();
      return;
    }

    const geocodeBtn = event.target.closest('[data-uber-geocode-id]');
    if (geocodeBtn) {
      geocodeUberBatch(geocodeBtn.dataset.uberGeocodeId);
      return;
    }

    const uberBtn = event.target.closest('[data-uber-action][data-uber-id]');
    if (uberBtn) {
      updateUberStatus(uberBtn.dataset.uberId, uberBtn.dataset.uberAction);
      return;
    }

    const btn = event.target.closest('[data-action][data-id]');
    if (!btn) return;
    updateDespesaStatus(btn.dataset.id, btn.dataset.action);
  });
}

initProtectedPage('ADM Conferência', async (content) => {
  renderShell(content);
  await loadAll();
});
