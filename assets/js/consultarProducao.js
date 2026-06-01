import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

function makeCell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

async function getLatestReferenceDate() {
  const { data, error } = await supabase
    .from('producao_importacoes')
    .select('data_referencia')
    .eq('status', 'processado')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.data_referencia || null;
}

async function loadData() {
  const tbody = document.getElementById('tbodyProducao');
  const meta = document.getElementById('metaConsulta');

  let fData = document.getElementById('fData').value;
  const fCoordenacao = document.getElementById('fCoordenacao').value.trim();
  const fSupervisao = document.getElementById('fSupervisao').value.trim();
  const fFuncionario = document.getElementById('fFuncionario').value.trim();
  const fCliente = document.getElementById('fCliente').value.trim();
  const fCidade = document.getElementById('fCidade').value.trim();

  if (!fData) {
    fData = await getLatestReferenceDate();
    if (fData) document.getElementById('fData').value = fData;
  }

  tbody.innerHTML = '';
  meta.textContent = 'Consultando produção...';

  let query = supabase
    .from('producao_snapshot')
    .select(`
      data_referencia,
      coordenacao,
      supervisao,
      funcionario,
      cliente,
      cidade,
      os,
      servico,
      cargas,
      tons
    `)
    .order('funcionario', { ascending: true })
    .limit(1000);

  if (fData) query = query.eq('data_referencia', fData);
  if (fCoordenacao) query = query.ilike('coordenacao', `%${fCoordenacao}%`);
  if (fSupervisao) query = query.ilike('supervisao', `%${fSupervisao}%`);
  if (fFuncionario) query = query.ilike('funcionario', `%${fFuncionario}%`);
  if (fCliente) query = query.ilike('cliente', `%${fCliente}%`);
  if (fCidade) query = query.ilike('cidade', `%${fCidade}%`);

  const { data, error } = await query;
  if (error) throw error;

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 10;
    td.textContent = 'Nenhum registro localizado.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 registro(s) localizado(s).';
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.appendChild(makeCell(row.data_referencia));
    tr.appendChild(makeCell(row.coordenacao));
    tr.appendChild(makeCell(row.supervisao));
    tr.appendChild(makeCell(row.funcionario));
    tr.appendChild(makeCell(row.cliente));
    tr.appendChild(makeCell(row.cidade));
    tr.appendChild(makeCell(row.os));
    tr.appendChild(makeCell(row.servico));
    tr.appendChild(makeCell(row.cargas));
    tr.appendChild(makeCell(row.tons));
    tbody.appendChild(tr);
  });

  meta.textContent = `${data.length} registro(s) localizado(s).`;
}

initProtectedPage('Consultar Produção', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Consultar Produção</h2>
          <p class="section-subtitle">Filtre a base de produção por data, coordenação, supervisão, funcionário e cliente.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('importar-producao')}">Importar</a>
          <a class="active" href="${toPanelUrl('consultar-producao')}">Consultar</a>
          <a href="${toPanelUrl('efetivos-sem-producao')}">Efetivos sem Produção</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-actions-row filters-5">
          <div>
            <label class="base-label" for="fData">Data referência</label>
            <input class="base-input" type="date" id="fData" />
          </div>
          <div>
            <label class="base-label" for="fCoordenacao">Coordenação</label>
            <input class="base-input" type="text" id="fCoordenacao" placeholder="Ex.: Operações" />
          </div>
          <div>
            <label class="base-label" for="fSupervisao">Supervisão</label>
            <input class="base-input" type="text" id="fSupervisao" placeholder="Ex.: Norte" />
          </div>
          <div>
            <label class="base-label" for="fFuncionario">Funcionário</label>
            <input class="base-input" type="text" id="fFuncionario" placeholder="Nome do colaborador" />
          </div>
          <div>
            <label class="base-label" for="fCliente">Cliente</label>
            <input class="base-input" type="text" id="fCliente" placeholder="Cliente" />
          </div>
          <div>
            <label class="base-label" for="fCidade">Cidade</label>
            <input class="base-input" type="text" id="fCidade" placeholder="Cidade" />
          </div>
        </div>

        <div class="base-actions">
          <button class="base-button primary" id="btnBuscar">Buscar</button>
        </div>
      </div>

      <div class="base-card">
        <div class="section-heading" style="margin-bottom:12px">
          <div>
            <h3 style="margin:0">Resultados</h3>
            <p class="section-subtitle" id="metaConsulta">Aguardando filtros.</p>
          </div>
        </div>

        <div class="table-wrap">
          <table class="base-table">
            <thead>
              <tr>
                <th>Data</th>
                <th>Coordenação</th>
                <th>Supervisão</th>
                <th>Funcionário</th>
                <th>Cliente</th>
                <th>Cidade</th>
                <th>O.S.</th>
                <th>Serviço</th>
                <th>Cargas</th>
                <th>Tons</th>
              </tr>
            </thead>
            <tbody id="tbodyProducao"></tbody>
          </table>
        </div>
      </div>
    </section>
  `;

  document.getElementById('btnBuscar').addEventListener('click', async () => {
    try {
      await loadData();
    } catch (err) {
      console.error(err);
      document.getElementById('metaConsulta').textContent = err.message || 'Erro ao consultar produção.';
    }
  });

  loadData().catch((err) => {
    console.error(err);
    document.getElementById('metaConsulta').textContent = err.message || 'Erro ao consultar produção.';
  });
});