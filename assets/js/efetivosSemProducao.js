import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function setSummary(data, total, status) {
  document.getElementById('sumData').textContent = data || '-';
  document.getElementById('sumTotal').textContent = String(total ?? 0);
  document.getElementById('sumStatus').textContent = status || 'Aguardando';
}

async function getLatestDate(table) {
  const { data, error } = await supabase
    .from(table)
    .select('data_referencia')
    .eq('status', 'processado')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.data_referencia || null;
}

async function fetchOptional(table, dateField, dateValue) {
  try {
    let query = supabase.from(table).select('*');
    if (dateField && dateValue) query = query.eq(dateField, dateValue);
    const { data, error } = await query;
    if (error) return [];
    return data || [];
  } catch {
    return [];
  }
}

function renderRows(rows) {
  const tbody = document.getElementById('tbodyResultado');
  tbody.innerHTML = '';

  if (!rows.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="6">Nenhum colaborador localizado.</td>';
    tbody.appendChild(tr);
    return;
  }

  rows.forEach((r) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${r.colaborador || ''}</td>
      <td>${r.coordenacao || ''}</td>
      <td>${r.supervisao || ''}</td>
      <td>${r.cargo || ''}</td>
      <td>${r.tipo || ''}</td>
      <td>${r.motivo || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename;
  link.click();
}

function wrapText(ctx, text, maxWidth) {
  const words = String(text || '').split(' ');
  const lines = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function generateImage(rows, dataReferencia) {
  const canvas = document.getElementById('canvasImagem');
  const ctx = canvas.getContext('2d');

  const width = 1700;
  const margin = 40;
  const rowHeight = 38;
  const headerY = 170;
  const tableY = 220;
  const totalRows = Math.max(rows.length, 1);
  const height = tableY + (totalRows + 1) * rowHeight + 70;

  canvas.width = width;
  canvas.height = height;

  ctx.fillStyle = '#07152f';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#e2e2f0';
  ctx.font = 'bold 44px Arial';
  ctx.fillText('EFETIVOS SEM PRODUÇÃO', margin, 70);

  ctx.fillStyle = '#9fb1d1';
  ctx.font = '24px Arial';
  ctx.fillText(`Data: ${dataReferencia || '-'}`, margin, 115);
  ctx.fillText(`Total: ${rows.length}`, width - 220, 115);

  ctx.strokeStyle = '#16325f';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(margin, 135);
  ctx.lineTo(width - margin, 135);
  ctx.stroke();

  const col1 = margin;
  const col2 = 900;
  const col3 = 1240;

  ctx.fillStyle = '#c9d7f2';
  ctx.font = 'bold 22px Arial';
  ctx.fillText('Colaborador', col1, headerY);
  ctx.fillText('Coordenação', col2, headerY);
  ctx.fillText('Supervisão', col3, headerY);

  ctx.beginPath();
  ctx.moveTo(margin, headerY + 16);
  ctx.lineTo(width - margin, headerY + 16);
  ctx.stroke();

  ctx.font = '20px Arial';
  rows.forEach((row, idx) => {
    const y = tableY + idx * rowHeight;
    if (idx % 2 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.03)';
      ctx.fillRect(margin - 12, y - 24, width - margin * 2 + 24, rowHeight);
    }
    ctx.fillStyle = '#e2e2f0';
    const line1 = wrapText(ctx, row.colaborador, 800)[0] || '';
    ctx.fillText(line1, col1, y);
    ctx.fillText(row.coordenacao || '', col2, y);
    ctx.fillText(row.supervisao || '', col3, y);
  });

  downloadCanvas(canvas, `efetivos-sem-producao-${dataReferencia || 'geral'}.png`);
}

async function saveResults(rows, dataReferencia) {
  try {
    await supabase.from('efetivos_sem_producao').delete().eq('data_referencia', dataReferencia);
    if (!rows.length) return;
    const payload = rows.map((r) => ({
      data_referencia: dataReferencia,
      colaborador: r.colaborador,
      coordenacao: r.coordenacao,
      supervisao: r.supervisao,
      cargo: r.cargo,
      tipo: r.tipo,
      motivo: r.motivo
    }));
    const { error } = await supabase.from('efetivos_sem_producao').insert(payload);
    if (error) console.warn(error);
  } catch (err) {
    console.warn('Falha ao salvar resultado processado:', err);
  }
}

async function processDay() {
  const dataInput = document.getElementById('fData');
  let dataReferencia = dataInput.value;

  if (!dataReferencia) {
    dataReferencia = await getLatestDate('colaborador_importacoes');
    if (dataReferencia) dataInput.value = dataReferencia;
  }
  if (!dataReferencia) throw new Error('Informe a data de referência.');

  setSummary(dataReferencia, 0, 'Processando');
  document.getElementById('metaResultado').textContent = 'Carregando bases...';

  const { data: colaboradores, error: errCol } = await supabase
    .from('colaborador_snapshot')
    .select('*')
    .eq('data_referencia', dataReferencia)
    .eq('ativo', true);

  if (errCol) throw errCol;

  const { data: producao, error: errProd } = await supabase
    .from('producao_snapshot')
    .select('*')
    .eq('data_referencia', dataReferencia);

  if (errProd) throw errProd;

  const excecoes = await fetchOptional('excecoes', null, null);
  const indisponibilidades = await fetchOptional('indisponibilidades', null, null);

  const producedNames = new Set((producao || []).map((r) => normalizeName(r.funcionario)).filter(Boolean));
  const excludedCoordenacoes = new Set(['GERAL', 'MATRIZ GERAL', 'MATRIZ', 'ADMINISTRATIVO', 'DIRETORIA']);
  const excecoesSet = new Set((excecoes || []).map((r) => normalizeName(r.Nome || r.nome)).filter(Boolean));
  const indisponiveisSet = new Set((indisponibilidades || []).map((r) => normalizeName(r.Nome || r.nome)).filter(Boolean));

  const rows = (colaboradores || [])
    .filter((c) => normalizeName(c.tipo) === 'EFETIVO')
    .filter((c) => normalizeName(c.cargo).includes('CLASSIFICADOR'))
    .filter((c) => !excludedCoordenacoes.has(normalizeName(c.coordenacao)))
    .filter((c) => !excecoesSet.has(normalizeName(c.nome)))
    .filter((c) => !indisponiveisSet.has(normalizeName(c.nome)))
    .filter((c) => !producedNames.has(normalizeName(c.nome)))
    .map((c) => ({
      colaborador: c.nome,
      coordenacao: c.coordenacao,
      supervisao: c.supervisao,
      cargo: c.cargo,
      tipo: c.tipo,
      motivo: 'Sem produção no dia'
    }))
    .sort((a, b) => {
      const c = String(a.coordenacao || '').localeCompare(String(b.coordenacao || ''));
      return c !== 0 ? c : String(a.colaborador || '').localeCompare(String(b.colaborador || ''));
    });

  await saveResults(rows, dataReferencia);
  window.__efetivosRows = rows;
  window.__filteredRows = rows;
  window.__efetivosDate = dataReferencia;

  setSummary(dataReferencia, rows.length, 'Concluído');
  renderRows(rows);
  document.getElementById('metaResultado').textContent = `${rows.length} colaborador(es) sem produção identificados.`;
}

function applyFilters(rows) {
  const fCoord = document.getElementById('fCoordenacao').value.trim().toUpperCase();
  const fSup = document.getElementById('fSupervisao').value.trim().toUpperCase();
  const fNome = document.getElementById('fNome').value.trim().toUpperCase();

  const filtered = (rows || []).filter((r) => {
    if (fCoord && !String(r.coordenacao || '').toUpperCase().includes(fCoord)) return false;
    if (fSup && !String(r.supervisao || '').toUpperCase().includes(fSup)) return false;
    if (fNome && !String(r.colaborador || '').toUpperCase().includes(fNome)) return false;
    return true;
  });

  window.__filteredRows = filtered;
  renderRows(filtered);
  setSummary(window.__efetivosDate, filtered.length, 'Filtrado');
  document.getElementById('metaResultado').textContent = `${filtered.length} colaborador(es) após filtros.`;
}

initProtectedPage('Efetivos sem Produção', async (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Efetivos sem Produção</h2>
          <p class="section-subtitle">Cruze a base funcional com a produção do dia para localizar efetivos sem lançamento.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('importar-producao')}">Importar</a>
<a href="${toPanelUrl('consultar-producao')}">Consultar</a>
<a href="${toPanelUrl('efetivos-sem-producao')}" class="active">Efetivos sem Produção</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-grid">
          <div class="base-field fourth">
            <label class="base-label" for="fData">Data</label>
            <input class="base-input" type="date" id="fData" />
          </div>
          <div class="base-field fourth">
            <label class="base-label" for="fCoordenacao">Coordenação</label>
            <input class="base-input" type="text" id="fCoordenacao" />
          </div>
          <div class="base-field fourth">
            <label class="base-label" for="fSupervisao">Supervisão</label>
            <input class="base-input" type="text" id="fSupervisao" />
          </div>
          <div class="base-field fourth">
            <label class="base-label" for="fNome">Colaborador</label>
            <input class="base-input" type="text" id="fNome" />
          </div>
        </div>
        <div class="base-actions">
          <button class="base-button primary" id="btnProcessar">Processar dia</button>
          <button class="base-button secondary" id="btnPesquisar">Aplicar filtros</button>
          <button class="base-button secondary" id="btnGerarImagem">Gerar imagem</button>
        </div>

        <div class="base-summary">
          <div class="base-mini"><div class="base-mini-label">Data</div><div class="base-mini-value" id="sumData">-</div></div>
          <div class="base-mini"><div class="base-mini-label">Total</div><div class="base-mini-value" id="sumTotal">0</div></div>
          <div class="base-mini"><div class="base-mini-label">Status</div><div class="base-mini-value" id="sumStatus">Aguardando</div></div>
        </div>

        <div class="base-table-wrap">
          <table class="base-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>Coordenação</th>
                <th>Supervisão</th>
                <th>Cargo</th>
                <th>Tipo</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody id="tbodyResultado"></tbody>
          </table>
        </div>
        <div id="metaResultado" class="base-meta">Aguardando processamento.</div>
      </div>

      <canvas id="canvasImagem" style="display:none;"></canvas>
    </section>
  `;

  const dataInput = document.getElementById('fData');
  if (!dataInput.value) {
    const latest = await getLatestDate('colaborador_importacoes');
    if (latest) dataInput.value = latest;
  }

  document.getElementById('btnProcessar').addEventListener('click', async () => {
    try {
      await processDay();
    } catch (err) {
      console.error(err);
      setSummary(document.getElementById('fData').value, 0, 'Erro');
      document.getElementById('metaResultado').textContent = `Erro ao processar: ${err.message || err}`;
    }
  });

  document.getElementById('btnPesquisar').addEventListener('click', () => applyFilters(window.__efetivosRows || []));
  document.getElementById('btnGerarImagem').addEventListener('click', () => {
    const rows = window.__filteredRows || window.__efetivosRows || [];
    if (!rows.length) {
      alert('Não há dados para gerar a imagem.');
      return;
    }
    generateImage(rows, window.__efetivosDate || document.getElementById('fData').value);
  });
});
