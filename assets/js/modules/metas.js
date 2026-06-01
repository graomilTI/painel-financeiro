/* assets/js/modules/metas.js
 * Módulo Diretoria > METAS
 * Padrão do projeto: IIFE + window.METAS.openHome(container, { auth, api, onBack })
 *
 * Regras oficiais:
 * - Produção usada para bater meta = relatorio_resultado_diario.toneladas
 * - Não usar embarcado nem total_embarcado_mais_teste
 * - Dados vêm das views:
 *   public.vw_metas_producao_regional
 *   public.vw_metas_producao_estado
 *   public.vw_metas_producao_mensal
 */

(function () {
  'use strict';

  const STYLE_ID = 'metas-module-style-v1';

  const MONTHS = [
    { value: 1, label: 'Janeiro' },
    { value: 2, label: 'Fevereiro' },
    { value: 3, label: 'Março' },
    { value: 4, label: 'Abril' },
    { value: 5, label: 'Maio' },
    { value: 6, label: 'Junho' },
    { value: 7, label: 'Julho' },
    { value: 8, label: 'Agosto' },
    { value: 9, label: 'Setembro' },
    { value: 10, label: 'Outubro' },
    { value: 11, label: 'Novembro' },
    { value: 12, label: 'Dezembro' }
  ];

  const DEFAULT_STATE = {
    loading: false,
    ano: new Date().getFullYear(),
    mes: new Date().getMonth() + 1,
    estado: '',
    regional: '',
    tab: 'geral',
    regionais: [],
    estados: [],
    mensal: [],
    metasCadastro: [],
    erro: null
  };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .metas-page {
        --metas-bg: #020617;
        --metas-card: rgba(15, 23, 42, .92);
        --metas-card-2: rgba(17, 24, 39, .82);
        --metas-border: rgba(148, 163, 184, .18);
        --metas-text: #e2e2f0;
        --metas-muted: #6b7280;
        --metas-green: #22c55e;
        --metas-green-2: #166534;
        --metas-yellow: #facc15;
        --metas-red: #ef4444;
        --metas-blue: #38bdf8;
        color: var(--metas-text);
        width: 100%;
      }

      .metas-page * {
        box-sizing: border-box;
      }

      .metas-header {
        display: flex;
        justify-content: space-between;
        gap: 18px;
        align-items: flex-start;
        margin-bottom: 18px;
      }

      .metas-title-wrap h1 {
        margin: 0;
        font-size: 28px;
        letter-spacing: -.04em;
        line-height: 1.05;
      }

      .metas-title-wrap p {
        margin: 8px 0 0;
        color: var(--metas-muted);
        font-size: 13px;
        max-width: 760px;
      }

      .metas-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        justify-content: flex-end;
      }

      .metas-btn {
        border: 1px solid rgba(34, 197, 94, .35);
        background: linear-gradient(135deg, rgba(22, 101, 52, .96), rgba(21, 128, 61, .85));
        color: #ecfdf5;
        border-radius: 14px;
        padding: 10px 14px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 12px 26px rgba(0,0,0,.22);
        transition: transform .15s ease, border-color .15s ease, filter .15s ease;
      }

      .metas-btn:hover {
        transform: translateY(-1px);
        filter: brightness(1.05);
        border-color: rgba(74, 222, 128, .75);
      }

      .metas-btn.secondary {
        background: rgba(15, 23, 42, .78);
        color: var(--metas-text);
        border-color: var(--metas-border);
      }

      .metas-filter-card,
      .metas-card,
      .metas-table-card {
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, .08), transparent 32%),
          linear-gradient(180deg, rgba(15, 23, 42, .96), rgba(2, 6, 23, .88));
        border: 1px solid var(--metas-border);
        border-radius: 22px;
        box-shadow: 0 18px 40px rgba(0,0,0,.26);
      }

      .metas-filter-card {
        padding: 16px;
        margin-bottom: 16px;
      }

      .metas-filters {
        display: grid;
        grid-template-columns: repeat(5, minmax(120px, 1fr));
        gap: 12px;
        align-items: end;
      }

      .metas-field label {
        display: block;
        font-size: 11px;
        color: var(--metas-muted);
        margin: 0 0 6px;
        text-transform: uppercase;
        letter-spacing: .08em;
      }

      .metas-field select,
      .metas-field input {
        width: 100%;
        border: 1px solid var(--metas-border);
        border-radius: 14px;
        background: #0d0d18;
        color: #e2e2f0;
        padding: 10px 11px;
        outline: none;
        color-scheme: dark;
      }

      .metas-field select option {
        background: #0d0d18;
        color: #e2e2f0;
      }

      .metas-field select option:checked {
        background: #166534;
        color: #ffffff;
      }

      .metas-tabs {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin: 0 0 16px;
      }

      .metas-tab {
        border: 1px solid var(--metas-border);
        background: rgba(15, 23, 42, .72);
        color: var(--metas-muted);
        padding: 9px 12px;
        border-radius: 999px;
        font-weight: 700;
        cursor: pointer;
      }

      .metas-tab.active {
        color: #dcfce7;
        background: rgba(22, 101, 52, .84);
        border-color: rgba(74, 222, 128, .42);
      }

      .metas-kpis {
        display: grid;
        grid-template-columns: repeat(4, minmax(140px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .metas-card {
        padding: 16px;
        overflow: hidden;
      }

      .metas-card-label {
        font-size: 12px;
        color: var(--metas-muted);
        margin-bottom: 8px;
      }

      .metas-card-value {
        font-size: 26px;
        font-weight: 900;
        letter-spacing: -.04em;
      }

      .metas-card-sub {
        margin-top: 8px;
        font-size: 12px;
        color: var(--metas-muted);
      }

      .metas-grid-2 {
        display: grid;
        grid-template-columns: 1.1fr .9fr;
        gap: 16px;
        margin-bottom: 16px;
      }

      .metas-section-title {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: center;
        margin-bottom: 14px;
      }

      .metas-section-title h2 {
        margin: 0;
        font-size: 16px;
        letter-spacing: -.02em;
      }

      .metas-section-title span {
        color: var(--metas-muted);
        font-size: 12px;
      }

      .metas-progress-wrap {
        margin-top: 12px;
      }

      .metas-progress {
        height: 16px;
        width: 100%;
        overflow: hidden;
        border-radius: 999px;
        background: rgba(148, 163, 184, .18);
        border: 1px solid rgba(148, 163, 184, .16);
      }

      .metas-progress-fill {
        height: 100%;
        width: 0;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(34,197,94,.78), rgba(132,204,22,.94));
        transition: width .35s ease;
      }

      .metas-progress-meta {
        display: flex;
        justify-content: space-between;
        color: var(--metas-muted);
        font-size: 12px;
        margin-top: 8px;
      }

      .metas-bars {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .metas-bar-row {
        display: grid;
        grid-template-columns: minmax(120px, 190px) 1fr minmax(74px, 90px);
        gap: 10px;
        align-items: center;
      }

      .metas-bar-name {
        color: var(--metas-text);
        font-weight: 750;
        font-size: 13px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .metas-bar-track {
        height: 13px;
        border-radius: 999px;
        overflow: hidden;
        background: rgba(148, 163, 184, .16);
      }

      .metas-bar-fill {
        height: 100%;
        width: 0;
        border-radius: inherit;
        background: linear-gradient(90deg, rgba(34,197,94,.72), rgba(56,189,248,.82));
      }

      .metas-bar-value {
        color: var(--metas-muted);
        text-align: right;
        font-size: 12px;
        font-weight: 700;
      }

      .metas-table-card {
        overflow: hidden;
      }

      .metas-table-top {
        padding: 14px 16px;
        border-bottom: 1px solid var(--metas-border);
        display: flex;
        justify-content: space-between;
        gap: 10px;
        align-items: center;
      }

      .metas-table-top h2 {
        margin: 0;
        font-size: 16px;
      }

      .metas-table-wrap {
        width: 100%;
        overflow: auto;
      }

      .metas-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 760px;
      }

      .metas-table th,
      .metas-table td {
        padding: 12px 14px;
        border-bottom: 1px solid rgba(148, 163, 184, .10);
        text-align: left;
        font-size: 13px;
      }

      .metas-table th {
        color: var(--metas-muted);
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: .08em;
        background: rgba(15, 23, 42, .62);
      }

      .metas-table td.num,
      .metas-table th.num {
        text-align: right;
      }

      .metas-pill {
        display: inline-flex;
        align-items: center;
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 12px;
        font-weight: 800;
        background: rgba(148, 163, 184, .12);
        color: var(--metas-muted);
        border: 1px solid rgba(148, 163, 184, .14);
      }

      .metas-pill.good {
        color: #bbf7d0;
        background: rgba(22, 101, 52, .42);
        border-color: rgba(74, 222, 128, .26);
      }

      .metas-pill.warn {
        color: #fef08a;
        background: rgba(133, 77, 14, .35);
        border-color: rgba(250, 204, 21, .22);
      }

      .metas-pill.bad {
        color: #fecaca;
        background: rgba(127, 29, 29, .35);
        border-color: rgba(248, 113, 113, .22);
      }

      .metas-empty,
      .metas-error {
        padding: 22px;
        border: 1px dashed rgba(148, 163, 184, .25);
        border-radius: 18px;
        color: var(--metas-muted);
        background: rgba(15, 23, 42, .45);
      }

      .metas-error {
        color: #fecaca;
        border-color: rgba(248, 113, 113, .3);
        background: rgba(127, 29, 29, .18);
      }

      .metas-form-grid {
        display: grid;
        grid-template-columns: 110px 110px 120px 1fr 150px auto;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid var(--metas-border);
        align-items: end;
      }

      .metas-loading {
        opacity: .65;
        pointer-events: none;
      }

      @media (max-width: 1100px) {
        .metas-filters,
        .metas-kpis,
        .metas-grid-2,
        .metas-form-grid {
          grid-template-columns: 1fr 1fr;
        }
      }

      @media (max-width: 720px) {
        .metas-header {
          flex-direction: column;
        }

        .metas-filters,
        .metas-kpis,
        .metas-grid-2,
        .metas-form-grid {
          grid-template-columns: 1fr;
        }

        .metas-actions {
          justify-content: flex-start;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function fmtTons(value) {
    const n = Number(value || 0);
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
  }

  function fmtPct(value) {
    const n = Number(value || 0);
    return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function pctClass(value) {
    const n = Number(value || 0);
    if (n >= 100) return 'good';
    if (n >= 60) return 'warn';
    return 'bad';
  }

  function clampPct(value) {
    return Math.max(0, Math.min(100, Number(value || 0)));
  }

  function getSupabaseClient(api) {
    if (api && typeof api.from === 'function') return api;
    if (api && api.supabase) return api.supabase;
    if (api && api.client) return api.client;
    if (window.supabaseClient) return window.supabaseClient;
    if (window.supabase) return window.supabase;
    if (window.sb) return window.sb;
    return null;
  }

  async function fetchAllRows(queryBuilder) {
    const { data, error } = await queryBuilder;
    if (error) throw error;
    return Array.isArray(data) ? data : [];
  }

  function uniqueSorted(values) {
    return Array.from(new Set(values.filter(Boolean).map(v => String(v).trim()).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }

  function getMonthName(mes) {
    const item = MONTHS.find(m => Number(m.value) === Number(mes));
    return item ? item.label : String(mes || '');
  }

  function buildOptions(items, current, allLabel) {
    return [
      `<option value="">${escapeHtml(allLabel)}</option>`,
      ...items.map(item => `<option value="${escapeHtml(item)}" ${String(item) === String(current) ? 'selected' : ''}>${escapeHtml(item)}</option>`)
    ].join('');
  }

  function totalsFromRegional(rows) {
    const meta = rows.reduce((acc, r) => acc + Number(r.meta_tons || 0), 0);
    const produzido = rows.reduce((acc, r) => acc + Number(r.produzido_tons || 0), 0);
    const restante = Math.max(0, meta - produzido);
    const percentual = meta > 0 ? (produzido / meta) * 100 : 0;
    const best = [...rows].sort((a, b) => Number(b.produzido_tons || 0) - Number(a.produzido_tons || 0))[0];
    const bestEstado = rows.reduce((map, row) => {
      const estado = row.estado || 'Sem estado';
      map[estado] = (map[estado] || 0) + Number(row.produzido_tons || 0);
      return map;
    }, {});
    const estadoTop = Object.entries(bestEstado).sort((a, b) => b[1] - a[1])[0];

    return { meta, produzido, restante, percentual, best, estadoTop };
  }

  function renderKpis(rows) {
    const total = totalsFromRegional(rows);

    return `
      <div class="metas-kpis">
        <div class="metas-card">
          <div class="metas-card-label">Meta do período</div>
          <div class="metas-card-value">${fmtTons(total.meta)}</div>
          <div class="metas-card-sub">Soma das metas regionais ativas</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">Produzido</div>
          <div class="metas-card-value">${fmtTons(total.produzido)}</div>
          <div class="metas-card-sub">Base: toneladas classificadas</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">Restante</div>
          <div class="metas-card-value">${fmtTons(total.restante)}</div>
          <div class="metas-card-sub">Saldo até atingir a meta</div>
        </div>
        <div class="metas-card">
          <div class="metas-card-label">% atingido</div>
          <div class="metas-card-value">${fmtPct(total.percentual)}</div>
          <div class="metas-card-sub">${total.best ? `Líder: ${escapeHtml(total.best.regional)}` : 'Sem produção no período'}</div>
        </div>
      </div>
    `;
  }

  function renderProgress(rows) {
    const total = totalsFromRegional(rows);
    const pct = clampPct(total.percentual);

    return `
      <div class="metas-card">
        <div class="metas-section-title">
          <h2>Comparativo Produzido x Restante</h2>
          <span>${fmtPct(total.percentual)} atingido</span>
        </div>

        <div class="metas-progress-wrap">
          <div class="metas-progress" title="${fmtPct(total.percentual)}">
            <div class="metas-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="metas-progress-meta">
            <span>Produzido: ${fmtTons(total.produzido)}</span>
            <span>Restante: ${fmtTons(total.restante)}</span>
          </div>
        </div>
      </div>
    `;
  }

  function renderBars(title, subtitle, rows, labelKey, valueKey, limit) {
    const list = [...rows]
      .sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0))
      .slice(0, limit || 12);

    const max = Math.max(...list.map(r => Number(r[valueKey] || 0)), 1);

    return `
      <div class="metas-card">
        <div class="metas-section-title">
          <h2>${escapeHtml(title)}</h2>
          <span>${escapeHtml(subtitle || '')}</span>
        </div>

        ${
          list.length
            ? `<div class="metas-bars">
                ${list.map(row => {
                  const value = Number(row[valueKey] || 0);
                  const pct = Math.max(2, (value / max) * 100);
                  return `
                    <div class="metas-bar-row">
                      <div class="metas-bar-name" title="${escapeHtml(row[labelKey])}">${escapeHtml(row[labelKey])}</div>
                      <div class="metas-bar-track">
                        <div class="metas-bar-fill" style="width:${pct}%"></div>
                      </div>
                      <div class="metas-bar-value">${fmtTons(value)}</div>
                    </div>
                  `;
                }).join('')}
              </div>`
            : `<div class="metas-empty">Nenhum dado encontrado para os filtros selecionados.</div>`
        }
      </div>
    `;
  }

  function renderRegionalTable(rows) {
    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Metas por Regional</h2>
          <span class="metas-pill">${rows.length} registros</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Regional</th>
                <th>Estado</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(row => `
                    <tr>
                      <td><strong>${escapeHtml(row.regional)}</strong></td>
                      <td>${escapeHtml(row.estado)}</td>
                      <td class="num">${fmtTons(row.meta_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_tons)}</td>
                      <td class="num">${fmtTons(row.restante_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="6"><div class="metas-empty">Nenhuma meta cadastrada para esse período.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderEstadoTable(rows) {
    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Consolidado por Estado</h2>
          <span class="metas-pill">${rows.length} estados</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Estado</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                rows.length
                  ? rows.map(row => `
                    <tr>
                      <td><strong>${escapeHtml(row.estado)}</strong></td>
                      <td class="num">${fmtTons(row.meta_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_tons)}</td>
                      <td class="num">${fmtTons(row.restante_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="5"><div class="metas-empty">Nenhum estado encontrado para esse período.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderHistoricoTable(rows) {
    const ordered = [...rows].sort((a, b) => (Number(b.ano) - Number(a.ano)) || (Number(b.mes) - Number(a.mes)));

    return `
      <div class="metas-grid-2">
        ${renderBars('Histórico mensal', 'Produção por mês', [...rows].sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes))).map(r => ({
          label: `${getMonthName(r.mes).slice(0, 3)}/${r.ano}`,
          produzido_total_tons: r.produzido_total_tons
        })), 'label', 'produzido_total_tons', 12)}
        ${renderBars('Meta mensal', 'Comparativo por mês', [...rows].sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes))).map(r => ({
          label: `${getMonthName(r.mes).slice(0, 3)}/${r.ano}`,
          meta_total_tons: r.meta_total_tons
        })), 'label', 'meta_total_tons', 12)}
      </div>

      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Histórico mês a mês</h2>
          <span class="metas-pill">${ordered.length} meses</span>
        </div>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Mês</th>
                <th class="num">Meta</th>
                <th class="num">Produzido</th>
                <th class="num">Restante</th>
                <th class="num">%</th>
              </tr>
            </thead>
            <tbody>
              ${
                ordered.length
                  ? ordered.map(row => `
                    <tr>
                      <td><strong>${getMonthName(row.mes)}/${row.ano}</strong></td>
                      <td class="num">${fmtTons(row.meta_total_tons)}</td>
                      <td class="num">${fmtTons(row.produzido_total_tons)}</td>
                      <td class="num">${fmtTons(row.restante_total_tons)}</td>
                      <td class="num"><span class="metas-pill ${pctClass(row.percentual_atingido)}">${fmtPct(row.percentual_atingido)}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="5"><div class="metas-empty">Histórico ainda não encontrado.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderCadastroMetas(state) {
    const years = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);

    return `
      <div class="metas-table-card">
        <div class="metas-table-top">
          <h2>Configurar Metas</h2>
          <span class="metas-pill">Cadastro por mês/regional</span>
        </div>

        <form class="metas-form-grid" data-metas-form>
          <div class="metas-field">
            <label>Ano</label>
            <select name="ano">
              ${years.map(y => `<option value="${y}" ${Number(state.ano) === y ? 'selected' : ''}>${y}</option>`).join('')}
            </select>
          </div>

          <div class="metas-field">
            <label>Mês</label>
            <select name="mes">
              ${MONTHS.map(m => `<option value="${m.value}" ${Number(state.mes) === Number(m.value) ? 'selected' : ''}>${m.label}</option>`).join('')}
            </select>
          </div>

          <div class="metas-field">
            <label>Estado</label>
            <input name="estado" maxlength="80" placeholder="Ex.: PR" required />
          </div>

          <div class="metas-field">
            <label>Regional</label>
            <input name="regional" maxlength="160" placeholder="Nome da regional" required />
          </div>

          <div class="metas-field">
            <label>Meta em toneladas</label>
            <input name="meta_tons" type="number" step="0.01" min="0" placeholder="0,00" required />
          </div>

          <button class="metas-btn" type="submit">Salvar meta</button>
        </form>

        <div class="metas-table-wrap">
          <table class="metas-table">
            <thead>
              <tr>
                <th>Ano/Mês</th>
                <th>Estado</th>
                <th>Regional</th>
                <th class="num">Meta</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${
                state.metasCadastro.length
                  ? state.metasCadastro.map(row => `
                    <tr>
                      <td><strong>${getMonthName(row.mes)}/${row.ano}</strong></td>
                      <td>${escapeHtml(row.estado)}</td>
                      <td>${escapeHtml(row.regional)}</td>
                      <td class="num">${fmtTons(row.meta_tons)}</td>
                      <td><span class="metas-pill ${row.ativo ? 'good' : 'bad'}">${row.ativo ? 'Ativa' : 'Inativa'}</span></td>
                    </tr>
                  `).join('')
                  : `<tr><td colspan="5"><div class="metas-empty">Nenhuma meta cadastrada para o período selecionado.</div></td></tr>`
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function renderMainContent(state) {
    if (state.erro) {
      return `<div class="metas-error"><strong>Erro ao carregar metas:</strong><br>${escapeHtml(state.erro)}</div>`;
    }

    if (state.tab === 'regionais') {
      return `
        ${renderKpis(state.regionais)}
        ${renderBars('Corrida de produção por regional', 'Ranking por toneladas classificadas', state.regionais, 'regional', 'produzido_tons', 20)}
        ${renderRegionalTable(state.regionais)}
      `;
    }

    if (state.tab === 'estados') {
      return `
        ${renderBars('Comparativo por Estado', 'Estados com uma ou mais regionais', state.estados, 'estado', 'produzido_tons', 20)}
        ${renderEstadoTable(state.estados)}
      `;
    }

    if (state.tab === 'historico') {
      return renderHistoricoTable(state.mensal);
    }

    if (state.tab === 'configurar') {
      return renderCadastroMetas(state);
    }

    return `
      ${renderKpis(state.regionais)}
      <div class="metas-grid-2">
        ${renderProgress(state.regionais)}
        ${renderBars('Corrida de produção', 'Top regionais do mês', state.regionais, 'regional', 'produzido_tons', 8)}
      </div>
      <div class="metas-grid-2">
        ${renderBars('Comparativo por Estado', 'Produção consolidada', state.estados, 'estado', 'produzido_tons', 8)}
        ${renderBars('Histórico recente', 'Produção mensal', [...state.mensal].sort((a, b) => (Number(a.ano) - Number(b.ano)) || (Number(a.mes) - Number(b.mes))).map(r => ({
          label: `${getMonthName(r.mes).slice(0, 3)}/${r.ano}`,
          produzido_total_tons: r.produzido_total_tons
        })), 'label', 'produzido_total_tons', 8)}
      </div>
      ${renderRegionalTable(state.regionais)}
    `;
  }

  function render(container, state) {
    const estados = uniqueSorted([
      ...state.regionais.map(r => r.estado),
      ...state.estados.map(r => r.estado),
      ...state.metasCadastro.map(r => r.estado)
    ]);

    const regionais = uniqueSorted([
      ...state.regionais.map(r => r.regional),
      ...state.metasCadastro.map(r => r.regional)
    ]);

    const years = [];
    const currentYear = new Date().getFullYear();
    for (let y = currentYear - 2; y <= currentYear + 2; y++) years.push(y);

    container.innerHTML = `
      <div class="metas-page ${state.loading ? 'metas-loading' : ''}">
        <div class="metas-header">
          <div class="metas-title-wrap">
            <h1>Metas de Produção</h1>
            <p>
              Acompanhamento mensal da meta por regional e estado.
              Produção considerada: <strong>toneladas classificadas</strong> do Resultado Diário.
            </p>
          </div>
          <div class="metas-actions">
            <button class="metas-btn secondary" type="button" data-metas-back>Voltar</button>
            <button class="metas-btn" type="button" data-metas-refresh>Atualizar</button>
          </div>
        </div>

        <div class="metas-filter-card">
          <div class="metas-filters">
            <div class="metas-field">
              <label>Mês</label>
              <select data-metas-filter="mes">
                ${MONTHS.map(m => `<option value="${m.value}" ${Number(state.mes) === Number(m.value) ? 'selected' : ''}>${m.label}</option>`).join('')}
              </select>
            </div>

            <div class="metas-field">
              <label>Ano</label>
              <select data-metas-filter="ano">
                ${years.map(y => `<option value="${y}" ${Number(state.ano) === y ? 'selected' : ''}>${y}</option>`).join('')}
              </select>
            </div>

            <div class="metas-field">
              <label>Estado</label>
              <select data-metas-filter="estado">
                ${buildOptions(estados, state.estado, 'Todos os estados')}
              </select>
            </div>

            <div class="metas-field">
              <label>Regional</label>
              <select data-metas-filter="regional">
                ${buildOptions(regionais, state.regional, 'Todas as regionais')}
              </select>
            </div>

            <button class="metas-btn" type="button" data-metas-apply>Aplicar filtros</button>
          </div>
        </div>

        <div class="metas-tabs">
          <button type="button" class="metas-tab ${state.tab === 'geral' ? 'active' : ''}" data-metas-tab="geral">Visão Geral</button>
          <button type="button" class="metas-tab ${state.tab === 'regionais' ? 'active' : ''}" data-metas-tab="regionais">Regionais</button>
          <button type="button" class="metas-tab ${state.tab === 'estados' ? 'active' : ''}" data-metas-tab="estados">Estados</button>
          <button type="button" class="metas-tab ${state.tab === 'historico' ? 'active' : ''}" data-metas-tab="historico">Histórico Mensal</button>
          <button type="button" class="metas-tab ${state.tab === 'configurar' ? 'active' : ''}" data-metas-tab="configurar">Configurar Metas</button>
        </div>

        <div data-metas-content>
          ${renderMainContent(state)}
        </div>
      </div>
    `;
  }

  async function loadData(state, supabase) {
    state.loading = true;
    state.erro = null;

    try {
      let regionalQuery = supabase
        .from('vw_metas_producao_regional')
        .select('*')
        .eq('ano', Number(state.ano))
        .eq('mes', Number(state.mes))
        .order('produzido_tons', { ascending: false });

      let estadoQuery = supabase
        .from('vw_metas_producao_estado')
        .select('*')
        .eq('ano', Number(state.ano))
        .eq('mes', Number(state.mes))
        .order('produzido_tons', { ascending: false });

      let metasQuery = supabase
        .from('metas_producao')
        .select('*')
        .eq('ano', Number(state.ano))
        .eq('mes', Number(state.mes))
        .order('estado', { ascending: true })
        .order('regional', { ascending: true });

      if (state.estado) {
        regionalQuery = regionalQuery.eq('estado', state.estado);
        estadoQuery = estadoQuery.eq('estado', state.estado);
        metasQuery = metasQuery.eq('estado', state.estado);
      }

      if (state.regional) {
        regionalQuery = regionalQuery.eq('regional', state.regional);
        metasQuery = metasQuery.eq('regional', state.regional);
      }

      const [regionais, estados, metasCadastro, mensal] = await Promise.all([
        fetchAllRows(regionalQuery),
        fetchAllRows(estadoQuery),
        fetchAllRows(metasQuery),
        fetchAllRows(
          supabase
            .from('vw_metas_producao_mensal')
            .select('*')
            .eq('ano', Number(state.ano))
            .order('ano', { ascending: true })
            .order('mes', { ascending: true })
        )
      ]);

      state.regionais = regionais;
      state.estados = estados;
      state.metasCadastro = metasCadastro;
      state.mensal = mensal;
    } catch (err) {
      console.error('[METAS] Erro ao carregar dados:', err);
      state.erro = err && err.message ? err.message : String(err);
    } finally {
      state.loading = false;
    }
  }

  async function salvarMeta(form, state, supabase, rerender) {
    const fd = new FormData(form);

    const payload = {
      ano: Number(fd.get('ano')),
      mes: Number(fd.get('mes')),
      estado: String(fd.get('estado') || '').trim().toUpperCase(),
      regional: String(fd.get('regional') || '').trim(),
      meta_tons: Number(fd.get('meta_tons') || 0),
      ativo: true,
      updated_at: new Date().toISOString()
    };

    if (!payload.ano || !payload.mes || !payload.estado || !payload.regional) {
      alert('Preencha ano, mês, estado e regional.');
      return;
    }

    const { error } = await supabase
      .from('metas_producao')
      .upsert(payload, { onConflict: 'ano,mes,regional' });

    if (error) {
      console.error('[METAS] Erro ao salvar meta:', error);
      alert('Erro ao salvar meta: ' + error.message);
      return;
    }

    state.ano = payload.ano;
    state.mes = payload.mes;
    state.estado = '';
    state.regional = '';

    await loadData(state, supabase);
    rerender();
  }

  function bindEvents(container, state, supabase, opts) {
    const rerender = () => {
      render(container, state);
      bindEvents(container, state, supabase, opts);
    };

    const reload = async () => {
      await loadData(state, supabase);
      rerender();
    };

    const backBtn = container.querySelector('[data-metas-back]');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        if (typeof opts.onBack === 'function') opts.onBack();
      });
    }

    const refreshBtn = container.querySelector('[data-metas-refresh]');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', reload);
    }

    const applyBtn = container.querySelector('[data-metas-apply]');
    if (applyBtn) {
      applyBtn.addEventListener('click', async () => {
        const mes = container.querySelector('[data-metas-filter="mes"]');
        const ano = container.querySelector('[data-metas-filter="ano"]');
        const estado = container.querySelector('[data-metas-filter="estado"]');
        const regional = container.querySelector('[data-metas-filter="regional"]');

        state.mes = Number(mes && mes.value ? mes.value : state.mes);
        state.ano = Number(ano && ano.value ? ano.value : state.ano);
        state.estado = estado ? estado.value : '';
        state.regional = regional ? regional.value : '';

        await reload();
      });
    }

    container.querySelectorAll('[data-metas-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.tab = btn.getAttribute('data-metas-tab') || 'geral';
        rerender();
      });
    });

    const form = container.querySelector('[data-metas-form]');
    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        await salvarMeta(form, state, supabase, rerender);
      });
    }
  }

  async function openHome(container, opts) {
    injectStyle();

    const options = opts || {};
    const supabase = getSupabaseClient(options.supabase || options.api);

    if (!container) {
      console.error('[METAS] Container não informado.');
      return;
    }

    if (!supabase || typeof supabase.from !== 'function') {
      container.innerHTML = `
        <div class="metas-page">
          <div class="metas-error">
            <strong>Cliente Supabase não encontrado.</strong><br>
            O módulo METAS precisa receber api.supabase, api.client, window.supabaseClient, window.supabase ou window.sb.
          </div>
        </div>
      `;
      return;
    }

    const state = Object.assign({}, DEFAULT_STATE, {
      ano: Number(options.ano || DEFAULT_STATE.ano),
      mes: Number(options.mes || DEFAULT_STATE.mes)
    });

    render(container, state);
    bindEvents(container, state, supabase, options);

    await loadData(state, supabase);
    render(container, state);
    bindEvents(container, state, supabase, options);
  }

  window.METAS = {
    openHome
  };
})();
