import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const MONEY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

const state = {
  loading: false,
  syncing: false,
  rows: [],
  filters: {
    inicio: todayISO(),
    fim: todayISO(),
    q: '',
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

function normalize(value) {
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

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const parts = raw.split('-');
  if (parts.length !== 3) return escapeHtml(value);
  const date = new Date(`${parts[0]}-${parts[1]}-${parts[2]}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? escapeHtml(value) : DATE.format(date);
}

function money(value) {
  const number = Number(value || 0);
  return MONEY.format(Number.isFinite(number) ? number : 0);
}

function statusOf(row) {
  return normalize(row.status_validacao || row.classificacao_manual || row.classificacao || 'PENDENTE').replaceAll(' ', '_');
}

function isUsoPessoal(row) {
  const text = normalize([
    row.observacao,
    row.observacao_validacao,
    row.detalhamento_despesa,
    row.motivo_validacao,
    row.finalidade,
  ].filter(Boolean).join(' '));
  return text.includes('PESSOAL');
}

function computedStatus(row) {
  const manual = statusOf(row);
  if (manual && manual !== 'PENDENTE') return manual;
  if (isUsoPessoal(row)) return 'ATENCAO';
  return manual || 'PENDENTE';
}

function statusChip(row) {
  const key = computedStatus(row);
  const map = {
    VALIDADA: ['Validada', 'ok'],
    CONFERIDO: ['Conferida', 'ok'],
    ATENCAO: ['Atenção', 'warn'],
    ATENÇÃO: ['Atenção', 'warn'],
    CAIXA_COLABORADOR: ['Caixa colaborador', 'danger'],
    PENDENTE: ['Pendente', 'neutral'],
  };
  const item = map[key] || [key.replaceAll('_', ' '), 'neutral'];
  return `<span class="uber-chip uber-chip-${item[1]}">${escapeHtml(item[0])}</span>`;
}

function rowText(row) {
  return normalize([
    row.nome_colaborador,
    row.nome,
    row.email,
    row.supervisao,
    row.regional,
    row.coordenacao,
    row.endereco_partida,
    row.endereco_destino,
    row.centro_custo,
  ].filter(Boolean).join(' '));
}

function filteredRows() {
  const q = normalize(state.filters.q);
  const status = normalize(state.filters.status).replaceAll(' ', '_');
  return state.rows.filter((row) => {
    if (q && !rowText(row).includes(q)) return false;
    if (status && computedStatus(row) !== status) return false;
    return true;
  });
}

function splitRows() {
  const rows = filteredRows();
  const done = new Set(['VALIDADA', 'CONFERIDO']);
  return {
    pendentes: rows.filter((row) => !done.has(computedStatus(row))),
    conferidas: rows.filter((row) => done.has(computedStatus(row))),
  };
}

function getValor(row) {
  return Number(row.valor ?? row.preco_liquido ?? row.preco_liquido_parceiro ?? 0) || 0;
}

function metrics() {
  const rows = filteredRows();
  const total = rows.length;
  const validadas = rows.filter((row) => ['VALIDADA', 'CONFERIDO'].includes(computedStatus(row))).length;
  const atencao = rows.filter((row) => ['ATENCAO', 'ATENÇÃO', 'CAIXA_COLABORADOR'].includes(computedStatus(row))).length;
  const valor = rows.reduce((sum, row) => sum + getValor(row), 0);
  return { total, validadas, atencao, pendentes: total - validadas, valor };
}

function styles() {
  return `<style>
    .uber-shell{color:#e2e2f0}.uber-hero{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;background:radial-gradient(circle at top right,rgba(34,197,94,.16),transparent 34%),linear-gradient(180deg,rgba(8,22,17,.96),rgba(3,13,10,.96));border:1px solid rgba(148,163,184,.16);border-radius:28px;padding:24px;box-shadow:0 22px 70px rgba(0,0,0,.28)}.uber-kicker{display:inline-flex;color:#86efac;font-size:12px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.uber-title{margin:0;color:#f8fafc;font-size:clamp(24px,2.6vw,36px);letter-spacing:-.045em}.uber-sub{max-width:850px;margin:10px 0 0;color:#6b7280;line-height:1.55}.uber-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.uber-btn{border:1px solid rgba(34,197,94,.28);background:rgba(15,23,42,.78);color:#e2e2f0;border-radius:14px;padding:11px 14px;font-weight:950;cursor:pointer;min-height:42px}.uber-btn:hover{background:rgba(22,101,52,.24)}.uber-btn.primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;border:0}.uber-btn.danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.34)}.uber-btn:disabled{opacity:.55;cursor:not-allowed}.uber-grid{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:14px;margin-top:16px}.uber-kpi{background:rgba(8,22,17,.72);border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:17px;box-shadow:0 18px 50px rgba(0,0,0,.20)}.uber-kpi span{display:block;color:#6b7280;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.uber-kpi strong{display:block;color:#f8fafc;font-size:28px;margin-top:8px}.uber-card{margin-top:16px;background:rgba(8,22,17,.72);border:1px solid rgba(148,163,184,.14);border-radius:24px;padding:18px;box-shadow:0 18px 50px rgba(0,0,0,.22)}.uber-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:14px}.uber-card h3{margin:0;color:#f8fafc}.uber-card p{margin:5px 0 0;color:#6b7280;font-size:13px}.uber-filters{display:grid;grid-template-columns:150px 150px minmax(240px,1fr) 180px auto;gap:10px;align-items:end}.uber-field label{display:block;color:#bbf7d0;font-size:11px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;margin:0 0 6px}.uber-input,.uber-select{width:100%;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:14px;padding:11px 12px;outline:none;color-scheme:dark}.uber-select option{background:#0d0d18;color:#e2e2f0}.uber-feedback{min-height:22px;color:#6b7280;font-size:13px;margin-top:10px}.uber-feedback.error{color:#fecaca}.uber-table-wrap{overflow:auto;border:1px solid rgba(148,163,184,.14);border-radius:18px;background:rgba(2,6,23,.30)}.uber-table{width:100%;border-collapse:collapse;min-width:1360px}.uber-table th,.uber-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.10);text-align:left;vertical-align:top}.uber-table th{background:rgba(15,23,42,.92);color:#bbf7d0;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.uber-table td{color:#e2e2f0;font-size:13px}.uber-table small{display:block;color:#6b7280;margin-top:4px;line-height:1.35}.uber-row-actions{display:flex;gap:8px;flex-wrap:wrap}.uber-row-actions .uber-btn{font-size:12px;padding:8px 10px;min-height:34px}.uber-chip{display:inline-flex;align-items:center;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:950;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.uber-chip-ok{background:rgba(34,197,94,.16);color:#bbf7d0;border-color:rgba(34,197,94,.30)}.uber-chip-warn{background:rgba(234,179,8,.14);color:#fde68a;border-color:rgba(234,179,8,.30)}.uber-chip-danger{background:rgba(220,38,38,.16);color:#fecaca;border-color:rgba(248,113,113,.34)}.uber-chip-neutral{background:rgba(148,163,184,.12);color:#cbd5e1}.uber-empty{text-align:center;color:#6b7280;padding:28px!important}.uber-conferidas{margin-top:18px;border-color:rgba(34,197,94,.24);background:rgba(4,24,18,.55)}@media(max-width:1180px){.uber-grid{grid-template-columns:repeat(2,1fr)}.uber-filters{grid-template-columns:1fr 1fr}}@media(max-width:760px){.uber-hero,.uber-card-head{display:block}.uber-actions{justify-content:flex-start;margin-top:12px}.uber-grid,.uber-filters{grid-template-columns:1fr}}
  </style>`;
}

function renderShell(content) {
  content.innerHTML = `${styles()}
    <section class="uber-shell">
      <div class="uber-hero">
        <div>
          <div class="uber-kicker">Conferência diária</div>
          <h2 class="uber-title">Uber</h2>
          <p class="uber-sub">Sincronize as corridas pela API, confira os lançamentos do dia e mande para validação, atenção ou caixa do colaborador sem poluir o painel principal.</p>
        </div>
        <div class="uber-actions">
          <button class="uber-btn" type="button" data-refresh>Atualizar</button>
          <button class="uber-btn primary" type="button" data-sync-api>Sincronizar API</button>
        </div>
      </div>
      <div class="uber-grid" data-metrics></div>
      <section class="uber-card">
        <div class="uber-card-head">
          <div>
            <h3>Filtros</h3>
            <p>Por padrão abre somente o dia atual para a equipe conferir diariamente.</p>
          </div>
        </div>
        <form class="uber-filters" data-filter-form>
          <div class="uber-field"><label>Data inicial</label><input class="uber-input" type="date" data-inicio value="${escapeHtml(state.filters.inicio)}"></div>
          <div class="uber-field"><label>Data final</label><input class="uber-input" type="date" data-fim value="${escapeHtml(state.filters.fim)}"></div>
          <div class="uber-field"><label>Buscar</label><input class="uber-input" type="search" data-q placeholder="Colaborador, e-mail, regional, endereço..." value="${escapeHtml(state.filters.q)}"></div>
          <div class="uber-field"><label>Status</label><select class="uber-select" data-status><option value="">Todos</option><option value="PENDENTE">Pendente</option><option value="ATENCAO">Atenção</option><option value="CAIXA_COLABORADOR">Caixa colaborador</option><option value="VALIDADA">Validada</option></select></div>
          <button class="uber-btn primary" type="submit">Aplicar</button>
        </form>
        <div class="uber-feedback" data-feedback></div>
      </section>
      <section class="uber-card">
        <div class="uber-card-head"><div><h3>Pendências para conferência</h3><p>Validar somente corridas corretas. Corridas com uso pessoal ou divergência ficam em atenção/caixa.</p></div></div>
        <div data-pendentes></div>
      </section>
      <section class="uber-card uber-conferidas">
        <div class="uber-card-head"><div><h3>Conferidas</h3><p>Corridas já validadas saem da lista principal e ficam agrupadas aqui embaixo.</p></div></div>
        <div data-conferidas></div>
      </section>
    </section>`;
  bindEvents(content);
}

function setFeedback(message, error = false) {
  const el = document.querySelector('[data-feedback]');
  if (!el) return;
  el.textContent = message || '';
  el.classList.toggle('error', Boolean(error));
}

function renderMetrics() {
  const m = metrics();
  const target = document.querySelector('[data-metrics]');
  if (!target) return;
  target.innerHTML = [
    ['Corridas', m.total],
    ['Pendentes', m.pendentes],
    ['Atenção/Caixa', m.atencao],
    ['Validadas', m.validadas],
    ['Valor filtrado', money(m.valor)],
  ].map(([label, value]) => `<article class="uber-kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></article>`).join('');
}

function renderTable(target, rows, mode = 'pendentes') {
  if (!target) return;
  if (!rows.length) {
    target.innerHTML = `<div class="uber-table-wrap"><table class="uber-table"><tbody><tr><td class="uber-empty">Nenhuma corrida ${mode === 'pendentes' ? 'pendente' : 'conferida'} nos filtros atuais.</td></tr></tbody></table></div>`;
    return;
  }
  target.innerHTML = `<div class="uber-table-wrap"><table class="uber-table">
    <thead><tr><th>Data</th><th>Colaborador</th><th>Regional</th><th>Partida</th><th>Destino</th><th>Valor</th><th>Categoria</th><th>Status</th><th>Observação</th><th>Ações</th></tr></thead>
    <tbody>${rows.map((row) => renderRow(row)).join('')}</tbody>
  </table></div>`;
}

function renderRow(row) {
  const motivo = isUsoPessoal(row)
    ? 'Atenção: observação/detalhamento contém "Pessoal".'
    : (row.motivo_validacao || row.observacao_validacao || row.detalhamento_despesa || row.observacao || '-');
  return `<tr>
    <td>${brDate(row.data_solicitacao_local || row.data_corrida || row.data)}<small>${escapeHtml(row.hora_solicitacao_local || row.hora || '')}</small></td>
    <td><strong>${escapeHtml(row.nome_colaborador || row.nome || '-')}</strong><small>${escapeHtml(row.email || row.matricula || '')}</small></td>
    <td>${escapeHtml(row.supervisao || row.regional || '-')}<small>${escapeHtml(row.coordenacao || row.centro_custo || '')}</small></td>
    <td>${escapeHtml(row.endereco_partida || '-')}</td>
    <td>${escapeHtml(row.endereco_destino || '-')}</td>
    <td><strong>${money(getValor(row))}</strong><small>${escapeHtml(row.metodo_pagamento || '')}</small></td>
    <td>${escapeHtml(row.servico || row.grupo || row.categoria || '-')}<small>${escapeHtml(row.distancia_km || row.distancia_mi || '')}</small></td>
    <td>${statusChip(row)}</td>
    <td>${escapeHtml(motivo)}</td>
    <td><div class="uber-row-actions">
      <button class="uber-btn primary" type="button" data-action="VALIDADA" data-id="${escapeHtml(row.id)}">Validar</button>
      <button class="uber-btn danger" type="button" data-action="CAIXA_COLABORADOR" data-id="${escapeHtml(row.id)}">Caixa</button>
      <button class="uber-btn" type="button" data-action="ATENCAO" data-id="${escapeHtml(row.id)}">Atenção</button>
    </div></td>
  </tr>`;
}

function renderData() {
  renderMetrics();
  const split = splitRows();
  renderTable(document.querySelector('[data-pendentes]'), split.pendentes, 'pendentes');
  renderTable(document.querySelector('[data-conferidas]'), split.conferidas, 'conferidas');
}

function getFilterValues(root = document) {
  state.filters.inicio = root.querySelector('[data-inicio]')?.value || todayISO();
  state.filters.fim = root.querySelector('[data-fim]')?.value || state.filters.inicio;
  state.filters.q = root.querySelector('[data-q]')?.value || '';
  state.filters.status = root.querySelector('[data-status]')?.value || '';
}

async function loadRows() {
  if (state.loading) return;
  state.loading = true;
  setFeedback('Carregando corridas Uber...');
  try {
    let query = supabase
      .from('vw_conferencia_uber_corridas')
      .select('*')
      .order('data_solicitacao_local', { ascending: false, nullsFirst: false })
      .limit(1500);
    if (state.filters.inicio) query = query.gte('data_solicitacao_local', state.filters.inicio);
    if (state.filters.fim) query = query.lte('data_solicitacao_local', state.filters.fim);
    const { data, error } = await query;
    if (error) throw error;
    state.rows = Array.isArray(data) ? data : [];
    setFeedback(`Atualizado: ${state.rows.length} corrida(s) no período.`);
  } catch (error) {
    console.error('[Uber] loadRows:', error);
    state.rows = [];
    setFeedback(`Não foi possível carregar o Uber. Rode o SQL enviado no ZIP. Detalhe: ${error.message}`, true);
  } finally {
    state.loading = false;
    renderData();
  }
}

async function syncApi(root) {
  if (state.syncing) return;
  getFilterValues(root);
  state.syncing = true;
  const btn = root.querySelector('[data-sync-api]');
  if (btn) btn.disabled = true;
  setFeedback('Sincronizando corridas pela API Uber...');
  try {
    const { data, error } = await supabase.functions.invoke('sync-uber-corridas', {
      body: { data_inicial: state.filters.inicio, data_final: state.filters.fim },
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    const total = Number(data?.upserted ?? data?.importados ?? data?.total ?? 0);
    setFeedback(`Sincronização concluída: ${total} corrida(s) processada(s).`);
    await loadRows();
  } catch (error) {
    console.error('[Uber] syncApi:', error);
    setFeedback(`Falha ao sincronizar API Uber: ${error.message || 'verifique a Edge Function e os tokens em TI > Integrações.'}`, true);
  } finally {
    state.syncing = false;
    if (btn) btn.disabled = false;
  }
}

async function updateStatus(id, status) {
  setFeedback('Salvando conferência da corrida...');
  try {
    const { error } = await supabase
      .from('conferencia_uber_corridas')
      .update({
        classificacao_manual: status,
        status_validacao: status,
        validado_em: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);
    if (error) throw error;
    const row = state.rows.find((item) => String(item.id) === String(id));
    if (row) Object.assign(row, { classificacao_manual: status, status_validacao: status, validado_em: new Date().toISOString() });
    setFeedback('Corrida atualizada.');
    renderData();
  } catch (error) {
    console.error('[Uber] updateStatus:', error);
    setFeedback(`Não foi possível salvar a conferência: ${error.message}`, true);
  }
}

function exportCsv() {
  const rows = filteredRows();
  if (!rows.length) return setFeedback('Nenhuma corrida para exportar.', true);
  const headers = ['Data', 'Hora', 'Colaborador', 'Regional', 'Partida', 'Destino', 'Valor', 'Status', 'Observação'];
  const csvRows = rows.map((row) => [
    row.data_solicitacao_local || row.data_corrida || '',
    row.hora_solicitacao_local || '',
    row.nome_colaborador || row.nome || '',
    row.supervisao || row.regional || '',
    row.endereco_partida || '',
    row.endereco_destino || '',
    getValor(row),
    computedStatus(row),
    row.motivo_validacao || row.observacao_validacao || row.detalhamento_despesa || row.observacao || '',
  ]);
  const csv = [headers, ...csvRows].map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';')).join('\n');
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `uber-conferencia-${state.filters.inicio}-a-${state.filters.fim}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function bindEvents(root) {
  root.querySelector('[data-filter-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    getFilterValues(root);
    loadRows();
  });
  root.querySelector('[data-refresh]')?.addEventListener('click', () => {
    getFilterValues(root);
    loadRows();
  });
  root.querySelector('[data-sync-api]')?.addEventListener('click', () => syncApi(root));
  root.querySelector('[data-q]')?.addEventListener('input', (event) => {
    state.filters.q = event.target.value || '';
    renderData();
  });
  root.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-action][data-id]');
    if (!btn) return;
    updateStatus(btn.dataset.id, btn.dataset.action);
  });
}

initProtectedPage('Uber · Conferência', async (content) => {
  renderShell(content);
  await loadRows();
});
