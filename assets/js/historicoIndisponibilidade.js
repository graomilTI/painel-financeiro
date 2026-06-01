import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function formatDateTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleString('pt-BR');
}

async function carregarHistorico() {
  const tbody = document.getElementById('tbodyHistorico');
  const meta = document.getElementById('metaHistorico');

  const fNome = document.getElementById('fNome').value.trim();
  const fMotivo = document.getElementById('fMotivo').value;
  const fInicio = document.getElementById('fInicio').value;
  const fFim = document.getElementById('fFim').value;

  tbody.innerHTML = '';
  meta.textContent = 'Carregando histórico...';

  let query = supabase
    .from('indisponibilidades')
    .select('*, profiles:created_by ( full_name, email )')
    .order('data_inicio', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1000);

  if (fNome) query = query.ilike('colaborador_nome', `%${fNome}%`);
  if (fMotivo) query = query.eq('motivo', fMotivo);
  if (fInicio) query = query.gte('data_inicio', fInicio);
  if (fFim) query = query.lte('data_fim', fFim);

  const { data, error } = await query;
  if (error) {
    meta.textContent = `Erro ao carregar histórico: ${error.message}`;
    return;
  }

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 8;
    td.textContent = 'Nenhum registro encontrado.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 registro(s) encontrado(s).';
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.appendChild(cell(row.colaborador_nome));
    tr.appendChild(cell(row.colaborador_cpf));
    tr.appendChild(cell(row.data_inicio));
    tr.appendChild(cell(row.data_fim));
    tr.appendChild(cell(row.motivo));
    tr.appendChild(cell(row.observacoes));
    tr.appendChild(cell(formatDateTime(row.created_at)));
    tr.appendChild(cell(row.profiles?.full_name || row.profiles?.email || ''));
    tbody.appendChild(tr);
  });

  meta.textContent = `${data.length} registro(s) encontrado(s).`;
}

initProtectedPage('Histórico de Indisponibilidade', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Histórico de Indisponibilidade</h2>
          <p class="section-subtitle">Consulte e filtre férias, atestados e outros registros de indisponibilidade lançados pelo RH.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('dashboard')}">Dashboard</a>
          <a href="${toPanelUrl('ferias-atestados')}">Novo lançamento</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-grid">
          <div class="base-field fourth">
            <label class="base-label" for="fNome">Colaborador</label>
            <input class="base-input" id="fNome" type="text" />
          </div>
          <div class="base-field fourth">
            <label class="base-label" for="fMotivo">Motivo</label>
            <select class="base-select" id="fMotivo">
              <option value="">Todos</option>
              <option value="Férias">Férias</option>
              <option value="Atestado">Atestado</option>
              <option value="Folga">Folga</option>
              <option value="Afastamento">Afastamento</option>
              <option value="Outro">Outro</option>
            </select>
          </div>
          <div class="base-field fourth">
            <label class="base-label" for="fInicio">Início</label>
            <input class="base-input" id="fInicio" type="date" />
          </div>
          <div class="base-field fourth">
            <label class="base-label" for="fFim">Fim</label>
            <input class="base-input" id="fFim" type="date" />
          </div>
        </div>
        <div class="base-actions">
          <button class="base-button secondary" id="btnPesquisar">Pesquisar</button>
        </div>

        <div class="base-table-wrap">
          <table class="base-table">
            <thead>
              <tr>
                <th>Colaborador</th>
                <th>CPF</th>
                <th>Início</th>
                <th>Fim</th>
                <th>Motivo</th>
                <th>Observações</th>
                <th>Criado em</th>
                <th>Lançado por</th>
              </tr>
            </thead>
            <tbody id="tbodyHistorico"></tbody>
          </table>
        </div>
        <div id="metaHistorico" class="base-meta">Carregando histórico...</div>
      </div>
    </section>
  `;

  document.getElementById('btnPesquisar').addEventListener('click', carregarHistorico);
  carregarHistorico().catch(console.error);
});
