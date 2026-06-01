import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('pt-BR');
}

function makeCell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function makeStatusPill(status) {
  const td = document.createElement('td');
  const span = document.createElement('span');
  span.className = 'pill';
  span.textContent = status || '';
  td.appendChild(span);
  return td;
}

async function loadData() {
  const tbody = document.getElementById('tbodyImportacoes');
  const meta = document.getElementById('metaInfo');
  const filtroData = document.getElementById('filtroData').value;
  const filtroStatus = document.getElementById('filtroStatus').value;
  const filtroOrigem = document.getElementById('filtroOrigem').value;

  meta.textContent = 'Carregando histórico...';
  tbody.innerHTML = '';

  let query = supabase
    .from('producao_importacoes')
    .select('*, profiles:importado_por ( full_name, email )')
    .order('data_referencia', { ascending: false })
    .order('created_at', { ascending: false });

  if (filtroData) query = query.eq('data_referencia', filtroData);
  if (filtroStatus) query = query.eq('status', filtroStatus);
  if (filtroOrigem) query = query.eq('origem', filtroOrigem);

  const { data, error } = await query;
  if (error) throw error;

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'Nenhuma importação encontrada.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 importações localizadas.';
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.appendChild(makeCell(row.data_referencia));
    tr.appendChild(makeCell(row.arquivo_nome));
    tr.appendChild(makeCell(row.origem));
    tr.appendChild(makeStatusPill(row.status));
    tr.appendChild(makeCell(row.total_linhas));
    tr.appendChild(makeCell(formatDateTime(row.created_at)));
    tr.appendChild(makeCell(row.profiles?.full_name || row.profiles?.email || ''));
    tr.appendChild(makeCell(row.observacoes || ''));
    tbody.appendChild(tr);
  });

  meta.textContent = `${data.length} importação(ões) encontrada(s).`;
}

initProtectedPage('Histórico de Produção', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Histórico de Produção</h2>
          <p class="section-subtitle">Consulte as cargas já enviadas para a base de produção.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('importar-producao')}">Importar</a>
<a href="${toPanelUrl('consultar-producao')}" class="active">Consultar</a>
<a href="${toPanelUrl('efetivos-sem-producao')}">Efetivos sem Produção</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-grid">
          <div class="base-field fourth">
            <label class="base-label" for="filtroData">Data</label>
            <input class="base-input" type="date" id="filtroData" />
          </div>
          <div class="base-field fourth">
            <label class="base-label" for="filtroStatus">Status</label>
            <select class="base-select" id="filtroStatus">
              <option value="">Todos</option>
              <option value="processado">Processado</option>
              <option value="processando">Processando</option>
              <option value="erro">Erro</option>
            </select>
          </div>
          <div class="base-field fourth">
            <label class="base-label" for="filtroOrigem">Origem</label>
            <select class="base-select" id="filtroOrigem">
              <option value="">Todas</option>
              <option value="upload_manual">Upload manual</option>
              <option value="producao_diaria">Produção diária</option>
              <option value="ajuste_manual">Ajuste manual</option>
            </select>
          </div>
          <div class="base-field fourth">
            <label class="base-label">&nbsp;</label>
            <button class="base-button secondary" id="btnBuscar">Pesquisar</button>
          </div>
        </div>

        <div class="base-table-wrap" style="margin-top:16px;">
          <table class="base-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Arquivo</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Total</th>
                <th>Criado em</th>
                <th>Importado por</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody id="tbodyImportacoes"></tbody>
          </table>
        </div>
        <div id="metaInfo" class="base-meta">Carregando histórico...</div>
      </div>
    </section>
  `;

  document.getElementById('btnBuscar')?.addEventListener('click', loadData);
  loadData().catch((err) => {
    console.error(err);
    document.getElementById('metaInfo').textContent = `Erro ao carregar histórico: ${err.message || err}`;
  });
});
