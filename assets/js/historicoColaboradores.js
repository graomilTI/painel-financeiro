import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

function makeCell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function makeStatusPill(text) {
  const span = document.createElement('span');
  span.className = 'base-pill';
  span.textContent = text ?? '';
  return span;
}

async function loadHistorico() {
  const tbody = document.getElementById('tbodyHistorico');
  const meta = document.getElementById('metaHistorico');
  const dataRef = document.getElementById('fDataReferencia').value;
  const status = document.getElementById('fStatus').value;
  const origem = document.getElementById('fOrigem').value;

  tbody.innerHTML = '';
  meta.textContent = 'Carregando histórico...';

  let query = supabase
    .from('colaborador_importacoes')
    .select('data_referencia,arquivo_nome,origem,status,total_linhas,created_at,created_by_nome,observacoes')
    .order('created_at', { ascending: false })
    .limit(200);

  if (dataRef) query = query.eq('data_referencia', dataRef);
  if (status && status !== 'Todos') query = query.eq('status', status);
  if (origem && origem !== 'Todas') query = query.eq('origem', origem);

  const { data, error } = await query;
  if (error) throw error;

  if (!data?.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'Nenhuma importação encontrada.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 importação(ões) encontrada(s).';
    return;
  }

  for (const row of data) {
    const tr = document.createElement('tr');
    tr.appendChild(makeCell(row.data_referencia));
    tr.appendChild(makeCell(row.arquivo_nome));
    tr.appendChild(makeCell(row.origem));
    const tdStatus = document.createElement('td');
    tdStatus.appendChild(makeStatusPill(row.status));
    tr.appendChild(tdStatus);
    tr.appendChild(makeCell(row.total_linhas));
    tr.appendChild(makeCell(row.created_at));
    tr.appendChild(makeCell(row.created_by_nome));
    tr.appendChild(makeCell(row.observacoes));
    tbody.appendChild(tr);
  }

  meta.textContent = `${data.length} importação(ões) encontrada(s).`;
}

initProtectedPage('Histórico de Importações', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Histórico de Importações</h2>
          <p class="section-subtitle">Consulte as cargas já enviadas para a base de colaboradores.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('importar-colaboradores')}">Importar</a>
          <a href="${toPanelUrl('consultar-colaboradores')}">Consultar</a>
          <a class="active" href="${toPanelUrl('historico-colaboradores')}">Histórico</a>
          <a href="${toPanelUrl('consultar-colaboradores')}#exportar">Exportar</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-actions-row compact">
          <div>
            <label class="base-label" for="fDataReferencia">Data de referência</label>
            <input class="base-input" type="date" id="fDataReferencia" />
          </div>
          <div>
            <label class="base-label" for="fStatus">Status</label>
            <select class="base-select" id="fStatus">
              <option>Todos</option>
              <option>processado</option>
              <option>erro</option>
              <option>pendente</option>
            </select>
          </div>
          <div>
            <label class="base-label" for="fOrigem">Origem</label>
            <select class="base-select" id="fOrigem">
              <option>Todas</option>
              <option>upload_manual</option>
              <option>integracao</option>
            </select>
          </div>
          <div style="display:flex; align-items:end;">
            <button class="base-button secondary inline" id="btnAtualizar">Atualizar histórico</button>
          </div>
        </div>

        <div class="base-table-wrap" style="margin-top:16px;">
          <table class="base-table wide">
            <thead>
              <tr>
                <th>Data referência</th>
                <th>Arquivo</th>
                <th>Origem</th>
                <th>Status</th>
                <th>Total linhas</th>
                <th>Importado em</th>
                <th>Importado por</th>
                <th>Observações</th>
              </tr>
            </thead>
            <tbody id="tbodyHistorico"></tbody>
          </table>
        </div>

        <div class="base-meta" id="metaHistorico">Aguardando carregamento.</div>
      </div>
    </section>
  `;

  document.getElementById('btnAtualizar')?.addEventListener('click', () => {
    loadHistorico().catch((err) => {
      console.error(err);
      const meta = document.getElementById('metaHistorico');
      if (meta) meta.textContent = `Erro ao carregar histórico: ${err.message || err}`;
    });
  });

  loadHistorico().catch((err) => {
    console.error(err);
    const meta = document.getElementById('metaHistorico');
    if (meta) meta.textContent = `Erro ao carregar histórico: ${err.message || err}`;
  });
});
