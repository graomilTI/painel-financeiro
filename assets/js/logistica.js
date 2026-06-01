import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const BR = new Intl.NumberFormat('pt-BR');
function fmt(v) { return BR.format(Number(v) || 0); }
function brDate(v) { if (!v) return '-'; const [y,m,d] = String(v).slice(0,10).split('-'); return `${d}/${m}/${y}`; }
function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;'); }
function safe(d) { return Array.isArray(d) ? d : []; }

const TABS = ['os','fob','report','conferir'];
const TAB_LABELS = { os: 'O.S.', fob: 'FOB', report: 'Report', conferir: 'Conferir' };

const state = { tab: location.hash.replace('#','') || 'os', rows: [], loading: false };

initProtectedPage('Logística', async (content) => {
  injectStyles();
  content.innerHTML = `
    <section class="card mt-16">
      <div class="log-tab-bar">${TABS.map(t => `<button class="log-tab ${state.tab===t?'active':''}" data-tab="${t}">${TAB_LABELS[t]}</button>`).join('')}</div>
    </section>
    <div id="logContent"></div>
  `;

  content.querySelector('.log-tab-bar').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    state.tab = btn.dataset.tab;
    location.hash = state.tab;
    content.querySelectorAll('.log-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
    if (state.tab === 'os' && !state.rows.length) await loadOs();
    render(content);
  });

  content.addEventListener('click', async (e) => {
    const okBtn = e.target.closest('[data-ok-id]');
    if (okBtn) await handleOk(okBtn.dataset.okId, okBtn.dataset.okType, content);
  });

  await loadOs();
  render(content);
});

async function loadOs() {
  state.loading = true;
  const { data } = await supabase
    .from('operacional_os')
    .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,lote,embarcado,status_gestor,status_logistica,observacao_logistica')
    .or('status_gestor.eq.FINALIZAR,observacao_logistica.ilike.KG solicitado*,remanescente.eq.0')
    .or('status_logistica.is.null,status_logistica.neq.FINALIZADA')
    .order('data_os', { ascending: false })
    .limit(1000);
  state.rows = safe(data);
  state.loading = false;
}

function render(content) {
  const el = content.querySelector('#logContent');
  if (!el) return;
  if (state.tab === 'os') { el.innerHTML = renderOsTab(); return; }
  el.innerHTML = `<section class="card mt-16"><div class="log-empty">Módulo <strong>${TAB_LABELS[state.tab]}</strong> em desenvolvimento.</div></section>`;
}

function renderOsTab() {
  if (state.loading) return `<section class="card mt-16"><p class="muted" style="padding:16px">Carregando...</p></section>`;
  if (!state.rows.length) return `<section class="card mt-16"><div class="log-empty">Nenhuma O.S. pendente para a Logística.</div></section>`;

  const kgRows = state.rows.filter(r => String(r.observacao_logistica||'').startsWith('KG solicitado'));
  const finalizarRows = state.rows.filter(r => !String(r.observacao_logistica||'').startsWith('KG solicitado') && String(r.status_gestor||'') === 'FINALIZAR');
  const saldoZeroRows = state.rows.filter(r => !String(r.observacao_logistica||'').startsWith('KG solicitado') && String(r.status_gestor||'') !== 'FINALIZAR' && Number(r.remanescente) === 0);

  return `
    <section class="card mt-16">
      <div class="section-head">
        <div><h3>O.S. para Logística</h3>
          <p class="muted">${finalizarRows.length} para finalizar · ${kgRows.length} aumento de saldo · ${saldoZeroRows.length} saldo zerado</p>
        </div>
        <button class="btn btn-secondary" id="logReload" type="button">Atualizar</button>
      </div>
      <div class="log-table-wrap">
        <table class="log-table">
          <thead><tr>
            <th style="width:10%">O.S.</th>
            <th style="width:32%">Cliente / Rota</th>
            <th style="width:13%">Remanescente</th>
            <th style="width:30%">Solicitação</th>
            <th style="width:15%">Ação</th>
          </tr></thead>
          <tbody>${state.rows.map(rowHtml).join('')}</tbody>
        </table>
      </div>
    </section>
  `;
}

function rowHtml(row) {
  const isKg = String(row.observacao_logistica||'').startsWith('KG solicitado');
  const isFinalizar = !isKg && String(row.status_gestor||'') === 'FINALIZAR';
  const isSaldoZero = !isKg && !isFinalizar && Number(row.remanescente) === 0;
  const type = isKg ? 'kg' : isSaldoZero ? 'saldo_zero' : 'finalizar';
  const badge = isKg
    ? `<span class="log-chip red">↑ KG</span><div class="log-obs">${esc(row.observacao_logistica)}</div>`
    : isSaldoZero
      ? `<span class="log-chip warn">Saldo zerado</span>`
      : `<span class="log-chip blue">$ Finalizar</span>`;
  const rem = Number(row.remanescente);
  return `<tr data-log-row="${esc(String(row.id))}">
    <td><strong>${esc(row.numero_os)}</strong><br><small class="muted">${brDate(row.data_os)}</small><br><small class="muted">${esc(row.supervisao||'-')}</small></td>
    <td><div style="font-weight:850">${esc(row.cliente||'-')}</div><div class="muted" style="font-size:12px;margin-top:3px">Emb.: ${esc(row.embarque||'-')}</div><div class="muted" style="font-size:12px">Dest.: ${esc(row.destino||'-')}</div></td>
    <td><span class="log-chip ${rem<=0?'warn':'ok'}">${fmt(rem)}</span><div class="muted" style="font-size:11px;margin-top:4px">Lote ${fmt(row.lote)}</div></td>
    <td>${badge}</td>
    <td><button class="log-btn-ok" data-ok-id="${esc(String(row.id))}" data-ok-type="${type}" type="button">OK</button></td>
  </tr>`;
}

async function handleOk(id, type, content) {
  const row = state.rows.find(r => String(r.id) === String(id));
  if (!row) return;
  const btn = content.querySelector(`[data-ok-id="${id}"]`);
  if (btn) { btn.disabled = true; btn.textContent = '...'; }

  const patch = type === 'kg'
    ? { observacao_logistica: null, updated_at: new Date().toISOString() }
    : { status_gestor: null, status_logistica: 'FINALIZADA', finalizado_em: new Date().toISOString(), updated_at: new Date().toISOString() };

  const { error } = await supabase.from('operacional_os').update(patch).eq('id', id);
  if (error) {
    alert(error.message);
    if (btn) { btn.disabled = false; btn.textContent = 'OK'; }
    return;
  }
  state.rows = state.rows.filter(r => String(r.id) !== String(id));
  render(content);
}

function injectStyles() {
  if (document.getElementById('log-styles')) return;
  const s = document.createElement('style');
  s.id = 'log-styles';
  s.textContent = `
    .log-tab-bar{display:flex;gap:8px;flex-wrap:wrap}
    .log-tab{background:rgba(15,23,42,.6);border:1px solid rgba(52,211,153,.18);color:#6b7280;border-radius:12px;padding:10px 22px;font-weight:900;cursor:pointer;font-size:14px;transition:background .15s}
    .log-tab.active{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;border-color:transparent}
    .log-tab:hover:not(.active){background:rgba(22,101,52,.15);color:#bbf7d0}
    .log-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25);margin-top:16px}
    .log-table{width:100%;min-width:720px;border-collapse:separate;border-spacing:0;color:#e2e2f0}
    .log-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:11px 13px;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}
    .log-table td{padding:11px 13px;border-bottom:1px solid rgba(148,163,184,.1);vertical-align:middle}
    .log-table tr:last-child td{border-bottom:0}
    .log-table tr:hover td{background:rgba(22,101,52,.07)}
    .log-chip{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:900;white-space:nowrap}
    .log-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0;border:1px solid rgba(22,163,74,.2)}
    .log-chip.warn{background:rgba(250,204,21,.14);color:#fde68a;border:1px solid rgba(250,204,21,.2)}
    .log-chip.red{background:rgba(239,68,68,.12);color:#fca5a5;border:1px solid rgba(239,68,68,.2)}
    .log-chip.blue{background:rgba(59,130,246,.12);color:#bfdbfe;border:1px solid rgba(59,130,246,.2)}
    .log-obs{font-size:11px;color:#6b7280;margin-top:4px;line-height:1.3}
    .log-btn-ok{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border:0;border-radius:12px;padding:9px 22px;font-weight:950;cursor:pointer;font-size:13px;transition:opacity .15s}
    .log-btn-ok:hover{opacity:.88}
    .log-btn-ok:disabled{opacity:.45;cursor:wait}
    .log-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:32px;color:#6b7280;text-align:center}
  `;
  document.head.appendChild(s);
}
