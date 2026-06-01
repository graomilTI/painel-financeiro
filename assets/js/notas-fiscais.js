import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const state = {
  inicio: new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10),
  fim: new Date().toISOString().slice(0, 10),
  rows: []
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

initProtectedPage('Notas Fiscais', (content) => {
  content.innerHTML = `
    <style>
      .nf-wrap{display:grid;gap:18px}.nf-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.22));box-shadow:0 20px 50px rgba(2,6,23,.22)}.nf-hero h2{margin:0 0 6px;color:#f8fafc;font-size:28px}.nf-hero p{margin:0;color:#6b7280}.nf-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:18px}.nf-filter{display:grid;grid-template-columns:repeat(3,minmax(160px,1fr));gap:12px;align-items:end}.nf-field{display:grid;gap:6px}.nf-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}.nf-field input{border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:10px 12px;color-scheme:dark}.nf-kpis{display:grid;grid-template-columns:repeat(3,minmax(150px,1fr));gap:12px}.nf-kpi{border:1px solid rgba(148,163,184,.14);border-radius:18px;padding:14px;background:rgba(2,6,23,.36)}.nf-kpi span{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.nf-kpi strong{display:block;margin-top:6px;color:#f8fafc;font-size:20px}.nf-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}.nf-table{width:100%;border-collapse:collapse;min-width:760px}.nf-table th,.nf-table td{padding:12px;border-bottom:1px solid rgba(148,163,184,.12);text-align:left;color:#e2e2f0}.nf-table th{background:rgba(15,23,42,.96);color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.06em}.nf-empty{text-align:center;color:#6b7280;padding:24px!important}@media(max-width:760px){.nf-filter,.nf-kpis{grid-template-columns:1fr}}
    </style>
    <section class="nf-wrap">
      <div class="nf-hero">
        <h2>Notas Fiscais</h2>
        <p>Resumo agrupado dos pagamentos enviados pelo Financeiro para controle de emissão/lançamento por regional.</p>
      </div>
      <article class="nf-card">
        <form class="nf-filter" id="nfFilterForm">
          <div class="nf-field"><label>Data inicial</label><input id="nfInicio" type="date" value="${esc(state.inicio)}"></div>
          <div class="nf-field"><label>Data final</label><input id="nfFim" type="date" value="${esc(state.fim)}"></div>
          <div class="nf-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Atualizar</button></div>
        </form>
      </article>
      <div class="nf-kpis">
        <div class="nf-kpi"><span>Registros</span><strong id="nfKpiRegistros">0</strong></div>
        <div class="nf-kpi"><span>Total pago</span><strong id="nfKpiTotal">R$ 0,00</strong></div>
        <div class="nf-kpi"><span>Regionais</span><strong id="nfKpiRegionais">0</strong></div>
      </div>
      <article class="nf-card">
        <div class="nf-table-wrap">
          <table class="nf-table">
            <thead><tr><th>Data pagamento</th><th>Regional</th><th>Destino</th><th>Quantidade</th><th>Valor total</th><th>Origem</th></tr></thead>
            <tbody id="nfTbody"><tr><td colspan="6" class="nf-empty">Carregando...</td></tr></tbody>
          </table>
        </div>
      </article>
    </section>
  `;

  function render() {
    const tbody = document.getElementById('nfTbody');
    if (!state.rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">Nenhum resumo localizado no período.</td></tr>`;
    } else {
      tbody.innerHTML = state.rows.map((row) => `
        <tr>
          <td>${brDate(row.data_pagamento)}</td>
          <td><strong>${esc(row.regional || '-')}</strong></td>
          <td>${esc(row.destino || '-')}</td>
          <td>${Number(row.quantidade || 0)}</td>
          <td>${money(row.valor_total)}</td>
          <td>${esc(row.modulo_origem || 'FINANCEIRO')}</td>
        </tr>
      `).join('');
    }
    const total = state.rows.reduce((sum, row) => sum + Number(row.valor_total || 0), 0);
    document.getElementById('nfKpiRegistros').textContent = String(state.rows.length);
    document.getElementById('nfKpiTotal').textContent = money(total);
    document.getElementById('nfKpiRegionais').textContent = String(new Set(state.rows.map((row) => row.regional || '-')).size);
  }

  async function load() {
    const tbody = document.getElementById('nfTbody');
    tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">Consultando Notas Fiscais...</td></tr>`;
    const { data, error } = await supabase
      .from('financeiro_notas_fiscais_resumo')
      .select('*')
      .gte('data_pagamento', state.inicio)
      .lte('data_pagamento', state.fim)
      .order('data_pagamento', { ascending: false })
      .order('regional', { ascending: true });
    if (error) {
      tbody.innerHTML = `<tr><td colspan="6" class="nf-empty">${esc(error.message)}<br>Execute a migration de pagamentos/notas fiscais no Supabase.</td></tr>`;
      return;
    }
    state.rows = data || [];
    render();
  }

  document.getElementById('nfFilterForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.inicio = document.getElementById('nfInicio').value;
    state.fim = document.getElementById('nfFim').value;
    load();
  });

  load();
});
