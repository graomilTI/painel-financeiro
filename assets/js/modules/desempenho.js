/* assets/js/modules/desempenho.js
 * Módulo Diretoria > Desempenho
 * Volume por colaborador considerando efetivos + diaristas/intermitentes com produção no dia.
 * Fonte de produção: public.relatorio_resultado_diario
 * Base de pessoas: public.historico_colaboradores por data; fallback em colaborador_snapshot.
 */
(function () {
  'use strict';

  const STYLE_ID = 'desempenho-module-style-v1';
  const MONTHS = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  const VOLUME_OPTIONS = {
    toneladas: {
      field: 'toneladas',
      label: 'Volume Classificado',
      hint: 'Toneladas do Resultado Diário ÷ classificadores considerados por dia: efetivos + diaristas/intermitentes com carga no dia.'
    },
    embarcado: {
      field: 'embarcado',
      label: 'Volume Embarcado',
      hint: 'Embarcado do Resultado Diário ÷ classificadores considerados por dia: efetivos + diaristas/intermitentes com carga no dia.'
    }
  };

  const state = {
    loading: false,
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    volumeType: 'toneladas',
    sort: { key: 'media', dir: 'desc' },
    rows: [],
    days: [],
    totals: null,
    regionais: [],
    error: null
  };

  function injectStyle() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .des-page{--bg:#020617;--panel:#0d0d18;--card:rgba(15,23,42,.92);--line:rgba(148,163,184,.18);--text:#e2e2f0;--muted:#6b7280;--green:#22c55e;--green2:#166534;--red:#ef4444;--yellow:#facc15;color:var(--text);width:100%}
      .des-page *{box-sizing:border-box}.des-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:end;margin-bottom:18px;padding:20px;border:1px solid rgba(34,197,94,.22);border-radius:26px;background:radial-gradient(circle at 10% 0%,rgba(34,197,94,.22),transparent 30%),radial-gradient(circle at 90% 0%,rgba(20,184,166,.16),transparent 28%),linear-gradient(145deg,rgba(15,23,42,.96),rgba(2,6,23,.82));box-shadow:0 22px 70px rgba(0,0,0,.24)}
      .des-kicker{font-size:12px;color:#bbf7d0;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.des-hero h1{margin:6px 0 4px;font-size:30px;letter-spacing:-.045em}.des-hero p{margin:0;color:var(--muted);max-width:820px;line-height:1.5}.des-actions{display:flex;gap:10px;flex-wrap:wrap;justify-content:flex-end}.des-btn,.des-field select,.des-field input{height:42px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#e2e2f0;padding:0 12px;font-weight:850;color-scheme:dark}.des-btn{cursor:pointer;background:linear-gradient(135deg,#166534,#22c55e);color:#052e16;border:0}.des-btn.secondary{background:#0d0d18;color:#e2e2f0;border:1px solid rgba(255,255,255,0.08)}.des-btn:disabled{opacity:.55;cursor:not-allowed}.des-field select option{background:#0d0d18;color:#e2e2f0}.des-field select option:checked{background:#166534;color:#fff}
      .des-filter-card,.des-card,.des-table-card{background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.88));border:1px solid var(--line);border-radius:22px;box-shadow:0 18px 40px rgba(0,0,0,.26)}.des-filter-card{padding:16px;margin-bottom:16px}.des-filters{display:grid;grid-template-columns:repeat(4,minmax(140px,1fr)) auto;gap:12px;align-items:end}.des-field label{display:block;font-size:11px;color:var(--muted);margin:0 0 6px;text-transform:uppercase;letter-spacing:.08em}.des-field select,.des-field input{width:100%}
      .des-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}.des-card{padding:16px}.des-card span{display:block;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}.des-card strong{display:block;margin-top:8px;font-size:24px;letter-spacing:-.035em}.des-card small{display:block;margin-top:4px;color:#6b7280}.des-status{margin-bottom:14px;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:rgba(15,23,42,.72);color:var(--muted)}.des-status strong{color:var(--text)}.des-status.err{border-color:rgba(239,68,68,.45);color:#fecaca;background:rgba(127,29,29,.22)}
      .des-table-card{overflow:hidden}.des-table-top{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:16px 18px;border-bottom:1px solid var(--line);flex-wrap:wrap}.des-table-top h2{margin:0;font-size:18px}.des-table-top p{margin:4px 0 0;color:var(--muted);font-size:12px}.des-table-wrap{overflow:auto;background:#fff}.des-table{width:100%;border-collapse:collapse;font-size:12px;min-width:980px;color:#10101e}.des-table th{position:sticky;top:0;z-index:1;background:#e2e2f0;color:#10101e;text-align:center;font-weight:900;padding:8px;border:1px solid #9ca3af;white-space:nowrap}.des-table th.sortable{cursor:pointer;user-select:none}.des-table th.sortable:hover{background:#bbf7d0}.des-table td{padding:7px 8px;border:1px solid #cbd5e1;text-align:right;white-space:nowrap}.des-table td:first-child{text-align:left;font-weight:900;color:#10101e;min-width:240px}.des-table tr.total td{background:#f8fafc!important;font-weight:950}.des-table tr.empty td{background:#fff!important;text-align:center;color:#64748b}.des-val{font-variant-numeric:tabular-nums}.des-muted{color:#6b7280}.des-cell-low{background:#fecaca}.des-cell-mid{background:#bbf7d0}.des-cell-high{background:#22c55e;color:#052e16;font-weight:900}.des-cell-zero{background:#fee2e2;color:#991b1b}.des-footer-note{padding:12px 16px;color:#64748b;background:#fff;border-top:1px solid #e2e2f0;font-size:12px}
      @media(max-width:1180px){.des-hero{grid-template-columns:1fr}.des-actions{justify-content:flex-start}.des-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.des-filters{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:760px){.des-kpis,.des-filters{grid-template-columns:1fr}.des-btn{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function esc(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function norm(value) {
    return String(value ?? '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function keyText(value) {
    return norm(value).replace(/[^A-Z0-9]/g, '');
  }

  function mapRegional(value) {
    const raw = String(value ?? '').trim();
    const k = keyText(raw);
    if (k === 'TERMINAISINATIVO') return 'MARINGA E TERMINAIS';
    return raw;
  }

  function toNumber(value) {
    if (value == null || value === '') return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const raw = String(value).replace(/R\$\s*/gi, '').replace(/[^\d,.-]/g, '');
    const parsed = raw.includes(',') && raw.includes('.') ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function fmtNumber(value, digits = 2) {
    return toNumber(value).toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  function fmtInt(value) {
    return toNumber(value).toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  }

  function isoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function dateKey(value) {
    const s = String(value ?? '').slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
  }

  function brDay(iso) {
    const [, month, day] = String(iso || '').split('-');
    return day && month ? `${day}/${month}` : iso;
  }

  function firstDay(year, month) {
    return new Date(Date.UTC(year, month - 1, 1));
  }

  function nextMonthDay(year, month) {
    return new Date(Date.UTC(year, month, 1));
  }

  function addDays(date, days) {
    const d = new Date(date.getTime());
    d.setUTCDate(d.getUTCDate() + days);
    return d;
  }

  function isActive(row) {
    if (row?.ativo === true) return true;
    if (row?.ativo === false) return false;
    const s = keyText(row?.situacao);
    return Boolean(s) && !s.includes('INATIVO') && !s.includes('NAOATIVO') && !s.includes('DESLIG');
  }

  function isClassificador(row) {
    return keyText(row?.cargo).includes('CLASSIFICADOR');
  }

  function isSafristaTipo(row) {
    const t = keyText(row?.tipo);
    return t.includes('DIARISTA') || t.includes('INTERMITENTE') || t.includes('SAFRISTA');
  }

  function collaboratorKey(row) {
    return String(row?.cpf || '').replace(/\D/g, '') || keyText(row?.nome);
  }

  async function fetchAllRows(supabase, table, select, applyQuery, pageSize = 1000) {
    const out = [];
    let from = 0;
    while (true) {
      let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
      if (typeof applyQuery === 'function') query = applyQuery(query);
      const { data, error } = await query;
      if (error) throw error;
      const rows = Array.isArray(data) ? data : [];
      out.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return out;
  }

  async function loadProducao(supabase) {
    const start = isoDate(firstDay(state.year, state.month));
    const end = isoDate(nextMonthDay(state.year, state.month));
    return fetchAllRows(
      supabase,
      'relatorio_resultado_diario',
      'data,coordenacao,funcionario,cargas,toneladas,embarcado',
      (q) => q.gte('data', start).lt('data', end).order('data', { ascending: true })
    );
  }

  async function loadClassificadoresHistorico(supabase) {
    const start = isoDate(addDays(firstDay(state.year, state.month), -45));
    const end = isoDate(nextMonthDay(state.year, state.month));
    const select = 'cpf,nome,situacao,ativo,coordenacao,supervisao,tipo,cargo,data_referencia';

    try {
      return await fetchAllRows(
        supabase,
        'historico_colaboradores',
        select,
        (q) => q.gte('data_referencia', start).lt('data_referencia', end).order('data_referencia', { ascending: true })
      );
    } catch (error) {
      console.warn('[DESEMPENHO] historico_colaboradores indisponível; usando colaborador_snapshot como fallback.', error);
      return fetchAllRows(
        supabase,
        'colaborador_snapshot',
        select,
        (q) => q.gte('data_referencia', start).lt('data_referencia', end).order('data_referencia', { ascending: true })
      );
    }
  }

  function buildProducedPeopleByDayRegional(prodRows) {
    const produced = new Map();
    for (const row of prodRows || []) {
      const date = dateKey(row.data);
      const reg = mapRegional(row.coordenacao || '');
      const regKey = keyText(reg);
      const person = keyText(row.funcionario || row.nome || row.colaborador || '');
      const volume = Math.max(toNumber(row.toneladas), toNumber(row.embarcado), toNumber(row.cargas));
      if (!date || !regKey || !person || volume <= 0) continue;
      const key = `${date}|${regKey}`;
      if (!produced.has(key)) produced.set(key, new Set());
      produced.get(key).add(person);
    }
    return produced;
  }

  function buildActiveMapsByDay(colabRows, days, producedPeopleByDayRegional) {
    const rows = [...(colabRows || [])]
      .filter((row) => dateKey(row.data_referencia))
      .sort((a, b) => dateKey(a.data_referencia).localeCompare(dateKey(b.data_referencia)));

    const activeByDay = new Map();

    for (const day of days) {
      const latestByPerson = new Map();

      for (const row of rows) {
        const ref = dateKey(row.data_referencia);
        if (!ref || ref > day) continue;
        const key = collaboratorKey(row);
        if (!key) continue;
        const current = latestByPerson.get(key);
        if (!current || ref >= dateKey(current.data_referencia)) latestByPerson.set(key, row);
      }

      const byRegional = new Map();
      latestByPerson.forEach((row) => {
        if (!isActive(row) || !isClassificador(row)) return;
        const reg = mapRegional(row.coordenacao || row.supervisao || '');
        if (!reg || keyText(reg) === 'GERAL') return;
        const k = keyText(reg);

        // Regra oficial: efetivos contam todos os dias; diaristas/intermitentes/safristas
        // contam somente quando tiveram carga/produção lançada no Resultado Diário naquele dia.
        if (isSafristaTipo(row)) {
          const producedPeople = producedPeopleByDayRegional.get(`${day}|${k}`) || new Set();
          if (!producedPeople.has(keyText(row.nome))) return;
        }

        if (!byRegional.has(k)) byRegional.set(k, { regional: reg, count: 0 });
        byRegional.get(k).count += 1;
      });

      activeByDay.set(day, byRegional);
    }

    return activeByDay;
  }

  function buildDataset(prodRows, colabRows) {
    const volumeField = VOLUME_OPTIONS[state.volumeType]?.field || 'toneladas';

    const prodByRegional = new Map();
    const daysSet = new Set();
    for (const row of prodRows) {
      const date = dateKey(row.data);
      const reg = mapRegional(row.coordenacao || '');
      const regKey = keyText(reg);
      if (!date || !reg || !regKey || regKey === 'GERAL') continue;
      const volume = toNumber(row[volumeField]);
      if (volume <= 0) continue;
      daysSet.add(date);
      if (!prodByRegional.has(regKey)) prodByRegional.set(regKey, { regional: reg, days: {}, totalVolume: 0 });
      const item = prodByRegional.get(regKey);
      item.days[date] = (item.days[date] || 0) + volume;
      item.totalVolume += volume;
    }

    const days = [...daysSet].sort();
    const producedPeopleByDayRegional = buildProducedPeopleByDayRegional(prodRows);
    const activeByDay = buildActiveMapsByDay(colabRows, days, producedPeopleByDayRegional);
    const rows = [];

    for (const [regKey, prod] of prodByRegional.entries()) {
      const values = {};
      let sumDailyAverage = 0;
      let countDailyAverage = 0;
      let sumActive = 0;
      let countActive = 0;

      for (const day of days) {
        const volume = toNumber(prod.days[day]);
        const active = activeByDay.get(day)?.get(regKey)?.count || 0;
        const value = active > 0 && volume > 0 ? volume / active : 0;
        values[day] = value;
        if (volume > 0 && active > 0) {
          sumDailyAverage += value;
          countDailyAverage += 1;
          sumActive += active;
          countActive += 1;
        }
      }

      rows.push({
        regional: prod.regional,
        active: countActive ? sumActive / countActive : 0,
        totalVolume: prod.totalVolume,
        values,
        media: countDailyAverage ? sumDailyAverage / countDailyAverage : 0
      });
    }

    const totalByDay = {};
    let totalVolume = 0;
    let totalActiveSum = 0;
    let totalActiveCount = 0;

    for (const row of rows) totalVolume += row.totalVolume;

    const totalValues = {};
    let totalMediaSum = 0;
    let totalMediaCount = 0;
    for (const day of days) {
      let activeOnDay = 0;
      let volumeOnDay = 0;
      rows.forEach((row) => {
        const regKey = keyText(row.regional);
        const active = activeByDay.get(day)?.get(regKey)?.count || 0;
        const dailyAvg = toNumber(row.values[day]);
        if (active > 0 && dailyAvg > 0) {
          activeOnDay += active;
          volumeOnDay += dailyAvg * active;
        }
      });
      totalByDay[day] = volumeOnDay;
      const value = activeOnDay > 0 ? volumeOnDay / activeOnDay : 0;
      totalValues[day] = value;
      if (value > 0) {
        totalMediaSum += value;
        totalMediaCount += 1;
        totalActiveSum += activeOnDay;
        totalActiveCount += 1;
      }
    }

    const regionais = [];
    const seenRegionais = new Set();
    activeByDay.forEach((map) => {
      map.forEach((value, key) => {
        if (seenRegionais.has(key)) return;
        seenRegionais.add(key);
        regionais.push(value);
      });
    });

    return {
      rows,
      days,
      totals: {
        active: totalActiveCount ? totalActiveSum / totalActiveCount : 0,
        totalVolume,
        values: totalValues,
        media: totalMediaCount ? totalMediaSum / totalMediaCount : 0,
        regionais: rows.length,
        activeTotal: totalActiveCount ? totalActiveSum / totalActiveCount : 0
      },
      regionais: regionais.sort((a, b) => a.regional.localeCompare(b.regional, 'pt-BR'))
    };
  }

  function sortRows(rows) {
    const { key, dir } = state.sort;
    const signal = dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      let av;
      let bv;
      if (key === 'regional') {
        return signal * String(a.regional).localeCompare(String(b.regional), 'pt-BR');
      }
      if (key === 'active') {
        av = a.active; bv = b.active;
      } else if (key === 'volume') {
        av = a.totalVolume; bv = b.totalVolume;
      } else if (key && key.startsWith('day:')) {
        const day = key.slice(4);
        av = a.values[day] || 0; bv = b.values[day] || 0;
      } else {
        av = a.media; bv = b.media;
      }
      if (toNumber(av) === toNumber(bv)) return String(a.regional).localeCompare(String(b.regional), 'pt-BR');
      return signal * (toNumber(av) - toNumber(bv));
    });
  }

  function cellClass(value, columnValues) {
    const n = toNumber(value);
    if (n <= 0) return 'des-cell-zero';
    const vals = columnValues.map(toNumber).filter((v) => v > 0).sort((a, b) => a - b);
    if (!vals.length) return '';
    const min = vals[0];
    const max = vals[vals.length - 1];
    if (max === min) return 'des-cell-mid';
    const ratio = (n - min) / (max - min);
    if (ratio >= 0.72) return 'des-cell-high';
    if (ratio >= 0.36) return 'des-cell-mid';
    return 'des-cell-low';
  }

  function sortMark(key) {
    return state.sort.key === key ? (state.sort.dir === 'asc' ? ' ▲' : ' ▼') : '';
  }

  function renderKpis() {
    const t = state.totals || { totalVolume: 0, active: 0, media: 0, regionais: 0 };
    const volumeOpt = VOLUME_OPTIONS[state.volumeType] || VOLUME_OPTIONS.toneladas;
    return `
      <div class="des-kpis">
        <article class="des-card"><span>${esc(volumeOpt.label)}</span><strong>${fmtNumber(t.totalVolume, 2)}</strong><small>Total do mês no Resultado Diário</small></article>
        <article class="des-card"><span>Classificadores ativos</span><strong>${fmtNumber(t.active, 0)}</strong><small>Média diária histórica nas regionais com produção</small></article>
        <article class="des-card"><span>Média geral</span><strong>${fmtNumber(t.media, 2)}</strong><small>Volume por classificador/dia</small></article>
        <article class="des-card"><span>Coordenações</span><strong>${fmtInt(t.regionais)}</strong><small>Com produção no período</small></article>
      </div>
    `;
  }

  function renderTable() {
    const rows = sortRows(state.rows);
    const dayColumns = state.days;
    const allColumns = [...dayColumns, 'media'];
    const colValues = {};
    dayColumns.forEach((day) => { colValues[day] = rows.map((r) => r.values[day] || 0); });
    colValues.media = rows.map((r) => r.media || 0);

    const headers = `
      <tr>
        <th class="sortable" data-sort="regional">Coordenação${sortMark('regional')}</th>
        <th class="sortable" data-sort="active">Classif.${sortMark('active')}</th>
        <th class="sortable" data-sort="volume">Volume${sortMark('volume')}</th>
        ${dayColumns.map((day) => `<th class="sortable" data-sort="day:${esc(day)}">${esc(brDay(day))}${sortMark('day:' + day)}</th>`).join('')}
        <th class="sortable" data-sort="media">Média mensal${sortMark('media')}</th>
      </tr>
    `;

    const body = rows.length ? rows.map((row) => `
      <tr>
        <td>${esc(row.regional)}</td>
        <td class="des-val">${fmtInt(row.active)}</td>
        <td class="des-val">${fmtNumber(row.totalVolume, 2)}</td>
        ${dayColumns.map((day) => `<td class="des-val ${cellClass(row.values[day] || 0, colValues[day])}">${row.values[day] ? fmtNumber(row.values[day], 2) : '-'}</td>`).join('')}
        <td class="des-val ${cellClass(row.media || 0, colValues.media)}">${row.media ? fmtNumber(row.media, 2) : '-'}</td>
      </tr>
    `).join('') : `<tr class="empty"><td colspan="${4 + dayColumns.length}">Nenhuma produção localizada para o mês selecionado.</td></tr>`;

    const totals = state.totals || { active: 0, totalVolume: 0, values: {}, media: 0 };
    const totalRow = rows.length ? `
      <tr class="total">
        <td>Média geral</td>
        <td class="des-val">${fmtInt(totals.active)}</td>
        <td class="des-val">${fmtNumber(totals.totalVolume, 2)}</td>
        ${dayColumns.map((day) => `<td class="des-val">${totals.values?.[day] ? fmtNumber(totals.values[day], 2) : '-'}</td>`).join('')}
        <td class="des-val">${totals.media ? fmtNumber(totals.media, 2) : '-'}</td>
      </tr>
    ` : '';

    return `
      <section class="des-table-card">
        <div class="des-table-top">
          <div>
            <h2>Volume por colaborador</h2>
            <p>${esc(VOLUME_OPTIONS[state.volumeType]?.hint || '')}</p>
          </div>
          <div class="des-muted">Clique nos cabeçalhos para classificar.</div>
        </div>
        <div class="des-table-wrap">
          <table class="des-table">
            <thead>${headers}</thead>
            <tbody>${body}${totalRow}</tbody>
          </table>
        </div>
        <div class="des-footer-note">A cor é comparativa por coluna: vermelho para menor desempenho, verde para maior desempenho. A base de colaboradores usa o histórico diário e somente ativos com cargo Classificador.</div>
      </section>
    `;
  }

  function render(container) {
    const volumeOptions = Object.entries(VOLUME_OPTIONS).map(([key, item]) => `<option value="${esc(key)}" ${state.volumeType === key ? 'selected' : ''}>${esc(item.label)}</option>`).join('');
    const years = Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i);
    container.innerHTML = `
      <section class="des-page">
        <div class="des-hero">
          <div>
            <div class="des-kicker">Diretoria · Desempenho</div>
            <h1>Desempenho por coordenação</h1>
            <p>Comparativo diário e mensal de volume por colaborador, usando o Resultado Diário já importado no DRE e o histórico diário de colaboradores ativos com cargo <b>Classificador</b>.</p>
          </div>
          <div class="des-actions">
            <button class="des-btn secondary" type="button" data-des-back>Voltar</button>
            <button class="des-btn" type="button" data-des-refresh ${state.loading ? 'disabled' : ''}>${state.loading ? 'Carregando...' : 'Atualizar'}</button>
          </div>
        </div>

        <div class="des-filter-card">
          <div class="des-filters">
            <div class="des-field"><label>Mês</label><select data-des-month>${MONTHS.map((m, idx) => `<option value="${idx + 1}" ${state.month === idx + 1 ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div>
            <div class="des-field"><label>Ano</label><select data-des-year>${years.map((y) => `<option value="${y}" ${state.year === y ? 'selected' : ''}>${y}</option>`).join('')}</select></div>
            <div class="des-field"><label>Indicador</label><select data-des-volume>${volumeOptions}</select></div>
            <div class="des-field"><label>Ordenação</label><select data-des-sort>
              <option value="media:desc" ${state.sort.key === 'media' && state.sort.dir === 'desc' ? 'selected' : ''}>Maior média mensal</option>
              <option value="media:asc" ${state.sort.key === 'media' && state.sort.dir === 'asc' ? 'selected' : ''}>Menor média mensal</option>
              <option value="regional:asc" ${state.sort.key === 'regional' && state.sort.dir === 'asc' ? 'selected' : ''}>Coordenação A → Z</option>
              <option value="regional:desc" ${state.sort.key === 'regional' && state.sort.dir === 'desc' ? 'selected' : ''}>Coordenação Z → A</option>
              <option value="volume:desc" ${state.sort.key === 'volume' && state.sort.dir === 'desc' ? 'selected' : ''}>Maior volume</option>
              <option value="volume:asc" ${state.sort.key === 'volume' && state.sort.dir === 'asc' ? 'selected' : ''}>Menor volume</option>
            </select></div>
            <button class="des-btn" type="button" data-des-apply ${state.loading ? 'disabled' : ''}>Aplicar</button>
          </div>
        </div>

        ${state.error ? `<div class="des-status err"><strong>Erro:</strong> ${esc(state.error)}</div>` : ''}
        ${state.loading ? `<div class="des-status"><strong>Carregando dados...</strong> Consultando produção e histórico diário de colaboradores.</div>` : ''}
        ${renderKpis()}
        ${renderTable()}
      </section>
    `;
    bind(container);
  }

  function bind(container) {
    container.querySelector('[data-des-back]')?.addEventListener('click', () => {
      if (state.onBack) state.onBack();
      else window.location.href = './dre.html';
    });
    container.querySelector('[data-des-refresh]')?.addEventListener('click', () => load(container));
    container.querySelector('[data-des-apply]')?.addEventListener('click', () => {
      state.month = Number(container.querySelector('[data-des-month]')?.value || state.month);
      state.year = Number(container.querySelector('[data-des-year]')?.value || state.year);
      state.volumeType = container.querySelector('[data-des-volume]')?.value || state.volumeType;
      const [key, dir] = String(container.querySelector('[data-des-sort]')?.value || 'media:desc').split(':');
      state.sort = { key: key || 'media', dir: dir || 'desc' };
      load(container);
    });
    container.querySelector('[data-des-volume]')?.addEventListener('change', () => {
      state.volumeType = container.querySelector('[data-des-volume]')?.value || state.volumeType;
      load(container);
    });
    container.querySelectorAll('[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = th.getAttribute('data-sort') || 'media';
        if (state.sort.key === key) {
          state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
        } else {
          state.sort.key = key;
          state.sort.dir = key === 'regional' ? 'asc' : 'desc';
        }
        render(container);
      });
    });
  }

  async function load(container) {
    try {
      state.loading = true;
      state.error = null;
      render(container);
      const supabase = state.supabase;
      if (!supabase) throw new Error('Cliente Supabase não disponível.');

      const [prodRows, colabRows] = await Promise.all([
        loadProducao(supabase),
        loadClassificadoresHistorico(supabase)
      ]);
      const dataset = buildDataset(prodRows, colabRows);
      state.rows = dataset.rows;
      state.days = dataset.days;
      state.totals = dataset.totals;
      state.regionais = dataset.regionais;
    } catch (error) {
      console.error('[DESEMPENHO]', error);
      state.error = error?.message || 'Falha ao carregar desempenho.';
      state.rows = [];
      state.days = [];
      state.totals = null;
    } finally {
      state.loading = false;
      render(container);
    }
  }

  function openHome(container, opts = {}) {
    injectStyle();
    state.supabase = opts.supabase || opts.api?.supabase;
    state.onBack = opts.onBack;
    render(container);
    load(container);
  }

  window.DESEMPENHO = { openHome };
})();
