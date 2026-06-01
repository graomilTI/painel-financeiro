import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { toPanelUrl } from './paths.js';

function normalizeText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function normalizeCPF(v) {
  if (!v) return null;
  return String(v).replace(/\D/g, '').padStart(11, '0');
}

function cell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

async function carregarRecentes() {
  const tbody = document.getElementById('tbodyRecentes');
  const meta = document.getElementById('metaRecentes');
  tbody.innerHTML = '';
  meta.textContent = 'Carregando registros...';

  const { data, error } = await supabase
    .from('indisponibilidades')
    .select('*, profiles:created_by ( full_name, email )')
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    meta.textContent = `Erro ao carregar registros: ${error.message}`;
    return;
  }

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 7;
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
    tr.appendChild(cell(row.profiles?.full_name || row.profiles?.email || ''));
    tbody.appendChild(tr);
  });

  meta.textContent = `${data.length} registro(s) carregado(s).`;
}

initProtectedPage('Férias e Atestados', (content, ctx) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Férias e Atestados</h2>
          <p class="section-subtitle">Cadastre indisponibilidades de colaboradores e acompanhe os últimos registros lançados pelo RH.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('dashboard')}">Dashboard</a>
          <a href="${toPanelUrl('historico-indisponibilidade')}">Histórico</a>
        </div>
      </div>

      <div class="base-card">
        <div class="base-grid">
          <div class="base-field half">
            <label class="base-label" for="colaboradorNome">Colaborador</label>
            <input class="base-input" id="colaboradorNome" type="text" />
          </div>
          <div class="base-field half">
            <label class="base-label" for="colaboradorCpf">CPF</label>
            <input class="base-input" id="colaboradorCpf" type="text" />
          </div>
          <div class="base-field third">
            <label class="base-label" for="dataInicio">Data inicial</label>
            <input class="base-input" id="dataInicio" type="date" />
          </div>
          <div class="base-field third">
            <label class="base-label" for="dataFim">Data final</label>
            <input class="base-input" id="dataFim" type="date" />
          </div>
          <div class="base-field third">
            <label class="base-label" for="motivo">Motivo</label>
            <select class="base-select" id="motivo">
              <option>Férias</option>
              <option>Atestado</option>
              <option>Folga</option>
              <option>Afastamento</option>
              <option>Outro</option>
            </select>
          </div>
          <div class="base-field">
            <label class="base-label" for="observacoes">Observações</label>
            <textarea class="base-textarea" id="observacoes"></textarea>
          </div>
        </div>
        <div class="base-actions">
          <button class="base-button primary" id="btnSalvar">Salvar indisponibilidade</button>
          <button class="base-button secondary" id="btnLimpar">Limpar</button>
        </div>
        <div id="feedback" class="base-status">Preencha os dados e clique em "Salvar indisponibilidade".</div>
      </div>

      <div class="base-card">
        <h3 style="margin-top:0">Últimos registros</h3>
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
                <th>Lançado por</th>
              </tr>
            </thead>
            <tbody id="tbodyRecentes"></tbody>
          </table>
        </div>
        <div id="metaRecentes" class="base-meta">Carregando registros...</div>
      </div>
    </section>
  `;

  const nome = document.getElementById('colaboradorNome');
  const cpf = document.getElementById('colaboradorCpf');
  const dataInicio = document.getElementById('dataInicio');
  const dataFim = document.getElementById('dataFim');
  const motivo = document.getElementById('motivo');
  const observacoes = document.getElementById('observacoes');
  const feedback = document.getElementById('feedback');
  const btnSalvar = document.getElementById('btnSalvar');
  const btnLimpar = document.getElementById('btnLimpar');

  btnLimpar.addEventListener('click', () => {
    nome.value = '';
    cpf.value = '';
    dataInicio.value = '';
    dataFim.value = '';
    motivo.value = 'Férias';
    observacoes.value = '';
    feedback.textContent = 'Preencha os dados e clique em "Salvar indisponibilidade".';
  });

  btnSalvar.addEventListener('click', async () => {
    try {
      btnSalvar.disabled = true;
      const payload = {
        colaborador_nome: normalizeText(nome.value),
        colaborador_cpf: normalizeCPF(cpf.value),
        data_inicio: dataInicio.value || null,
        data_fim: dataFim.value || null,
        motivo: normalizeText(motivo.value),
        observacoes: normalizeText(observacoes.value),
        created_by: ctx.user.id
      };

      if (!payload.colaborador_nome) throw new Error('Informe o nome do colaborador.');
      if (!payload.data_inicio) throw new Error('Informe a data inicial.');
      if (!payload.data_fim) throw new Error('Informe a data final.');
      if (payload.data_fim < payload.data_inicio) throw new Error('A data final não pode ser menor que a data inicial.');

      const { error } = await supabase.from('indisponibilidades').insert(payload);
      if (error) throw error;

      feedback.textContent = `Indisponibilidade salva com sucesso.\n\nColaborador: ${payload.colaborador_nome}\nPeríodo: ${payload.data_inicio} até ${payload.data_fim}\nMotivo: ${payload.motivo}`;
      btnLimpar.click();
      await carregarRecentes();
    } catch (err) {
      console.error(err);
      feedback.textContent = `Erro ao salvar indisponibilidade:\n${err.message || err}`;
    } finally {
      btnSalvar.disabled = false;
    }
  });

  carregarRecentes().catch(console.error);
});
