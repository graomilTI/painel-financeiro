import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getSession } from './auth.js';
import { toPanelUrl, toApiUrl } from './paths.js';

function makeCell(text) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  return td;
}

function normalizeCpfInput(value) {
  return String(value || '').replace(/\D/g, '');
}

async function getLatestReferenceDate() {
  const { data, error } = await supabase
    .from('colaborador_importacoes')
    .select('data_referencia')
    .eq('status', 'processado')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.data_referencia || null;
}

async function getAccessToken() {
  const session = await getSession();
  const token = session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  return token;
}

async function loadData() {
  const tbody = document.getElementById('tbodyColaboradores');
  const meta = document.getElementById('metaConsulta');

  const fCoordenacao = document.getElementById('fCoordenacao').value.trim();
  const fSupervisao = document.getElementById('fSupervisao').value.trim();
  const fNome = document.getElementById('fNome').value.trim();
  const fSituacao = document.getElementById('fSituacao').value;
  const fEmpresa = document.getElementById('fEmpresa').value.trim();
  const fTipo = document.getElementById('fTipo').value.trim();
  const fCpf = normalizeCpfInput(document.getElementById('fCpf').value);

  tbody.innerHTML = '';
  meta.textContent = 'Consultando base...';

  const latestReferenceDate = await getLatestReferenceDate();

  let query = supabase
    .from('colaborador_snapshot')
    .select(`
      cpf,
      nome,
      situacao,
      empresa,
      coordenacao,
      supervisao,
      cargo,
      cidade,
      tipo,
      email_empresa,
      whatsapp,
      admissao
    `)
    .order('nome', { ascending: true })
    .limit(1000);

  if (latestReferenceDate) query = query.eq('data_referencia', latestReferenceDate);
  if (fCoordenacao) query = query.ilike('coordenacao', `%${fCoordenacao}%`);
  if (fSupervisao) query = query.ilike('supervisao', `%${fSupervisao}%`);
  if (fNome) query = query.ilike('nome', `%${fNome}%`);
  if (fSituacao && fSituacao !== 'Todos') query = query.eq('situacao', fSituacao);
  if (fEmpresa) query = query.ilike('empresa', `%${fEmpresa}%`);
  if (fTipo) query = query.ilike('tipo', `%${fTipo}%`);
  if (fCpf) query = query.eq('cpf', fCpf);

  const { data, error } = await query;
  if (error) throw error;

  if (!data.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = 11;
    td.textContent = 'Nenhum colaborador encontrado com os filtros informados.';
    tr.appendChild(td);
    tbody.appendChild(tr);
    meta.textContent = '0 registro(s) localizado(s).';
    return;
  }

  data.forEach((row) => {
    const tr = document.createElement('tr');
    tr.appendChild(makeCell(row.cpf));
    tr.appendChild(makeCell(row.nome));
    tr.appendChild(makeCell(row.situacao));
    tr.appendChild(makeCell(row.empresa));
    tr.appendChild(makeCell(row.coordenacao));
    tr.appendChild(makeCell(row.supervisao));
    tr.appendChild(makeCell(row.cargo));
    tr.appendChild(makeCell(row.cidade));
    tr.appendChild(makeCell(row.tipo));
    tr.appendChild(makeCell(row.email_empresa));
    tr.appendChild(makeCell(row.whatsapp));
    tbody.appendChild(tr);
  });

  meta.textContent = latestReferenceDate
    ? `${data.length} registro(s) localizado(s) na base mais recente.`
    : `${data.length} registro(s) localizado(s).`;
}

function getExportEndpoint(tipo) {
  const map = {
    ifood: toApiUrl('exportacoes/cartoes/ifood'),
    flash: toApiUrl('exportacoes/cartoes/flash'),
    uber: toApiUrl('exportacoes/uber'),
    google_contacts: toApiUrl('exportacoes/google-contacts'),
  };
  return map[tipo] || '';
}

function getExportLabel(tipo) {
  const map = {
    ifood: 'iFood',
    flash: 'Flash',
    uber: 'Uber',
    google_contacts: 'Google Contacts',
  };
  return map[tipo] || tipo;
}

async function baixarArquivoAutenticado(downloadUrl, filename) {
  const token = await getAccessToken();

  const response = await fetch(downloadUrl, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err?.error || 'Erro ao baixar arquivo.');
  }

  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = filename || 'exportacao';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(blobUrl);
}

function buildSyncPayload(prefix = 'sync') {
  const getValue = (suffix) => {
    const element = document.getElementById(`${prefix}${suffix}`);
    return element ? element.value : '';
  };

  return {
    data_admissao_inicial: getValue('AdmissaoInicial') || null,
    data_admissao_final: getValue('AdmissaoFinal') || null,
    situacao: getValue('Situacao') || 'Todos',
    empresa: (getValue('Empresa') || '').trim() || null,
    nome: (getValue('Nome') || '').trim() || null,
  };
}

async function gerarExportacao() {
  const tipo = document.getElementById('exportTipo').value;
  const admissaoInicial = document.getElementById('exportAdmissaoInicial').value;
  const admissaoFinal = document.getElementById('exportAdmissaoFinal').value;
  const feedback = document.getElementById('exportFeedback');
  const btn = document.getElementById('btnGerarExportacao');

  feedback.textContent = 'Gerando exportação...';

  const endpoint = getExportEndpoint(tipo);
  if (!endpoint) {
    feedback.textContent = 'Tipo de exportação inválido.';
    return;
  }

  try {
    btn.disabled = true;
    btn.textContent = 'Gerando...';

    const token = await getAccessToken();

    const payload = {
      data_admissao_inicial: admissaoInicial || null,
      data_admissao_final: admissaoFinal || null,
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao gerar exportação.');
    }

    const arquivoId = data?.arquivo_id || data?.file_id || data?.id || '';
    const downloadUrl = data?.download_url || (arquivoId ? `${toApiUrl('exportacoes/download')}?id=${arquivoId}` : '');
    const filename = data?.filename || `export_${tipo}`;

    if (!downloadUrl) {
      throw new Error('A exportação foi criada, mas a rota não retornou link para download.');
    }

    feedback.textContent = `Arquivo ${getExportLabel(tipo)} gerado. Iniciando download...`;
    await baixarArquivoAutenticado(downloadUrl, filename);
    feedback.textContent = `${getExportLabel(tipo)} gerado e baixado com sucesso.`;
  } catch (err) {
    console.error(err);
    feedback.textContent = err.message || 'Erro ao gerar exportação.';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Gerar e baixar';
  }
}

async function sincronizarBotConversa() {
  const feedback = document.getElementById('syncFeedback');
  const trigger = document.getElementById('btnAbrirSync');
  const originalText = trigger?.textContent || 'BotConversa';

  try {
    if (trigger) {
      trigger.dataset.busy = 'true';
      trigger.setAttribute('aria-disabled', 'true');
      trigger.style.pointerEvents = 'none';
      trigger.textContent = 'Sincronizando...';
    }
    if (feedback) {
      feedback.style.display = 'block';
      feedback.textContent = 'Sincronizando contatos e tags no BotConversa...';
    }

    const token = await getAccessToken();
    const payload = buildSyncPayload('sync');

    const response = await fetch(toApiUrl('botconversa/sync-subscribers'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error || 'Erro ao sincronizar com o BotConversa.');
    }

    if (feedback) {
      feedback.textContent = `Sincronização concluída. Total: ${data?.total ?? 0} | Sucesso: ${data?.sucesso ?? 0} | Erro: ${data?.erro ?? 0}${data?.job_id ? ` | Job: ${data.job_id}` : ''}`;
    }
  } catch (err) {
    console.error(err);
    if (feedback) {
      feedback.style.display = 'block';
      feedback.textContent = err.message || 'Erro ao sincronizar com o BotConversa.';
    }
  } finally {
    if (trigger) {
      delete trigger.dataset.busy;
      trigger.removeAttribute('aria-disabled');
      trigger.style.pointerEvents = '';
      trigger.textContent = originalText;
    }
  }
}

initProtectedPage('Consultar Base de Colaboradores', (content) => {
  content.innerHTML = `
    <section class="base-page">
      <div class="section-heading">
        <div>
          <h2>Consultar Base de Colaboradores</h2>
          <p class="section-subtitle">Filtre a base funcional por coordenação, supervisão e colaborador.</p>
        </div>
        <div class="inline-nav">
          <a href="${toPanelUrl('importar-colaboradores')}">Importar</a>
          <a class="active" href="${toPanelUrl('consultar-colaboradores')}">Consultar</a>
          <a href="${toPanelUrl('historico-colaboradores')}">Histórico</a>
          <a href="#exportar" id="btnAbrirExportar">Exportar</a>
          <a href="#" id="btnAbrirSync" title="Sincronizar contatos e tags no BotConversa">BotConversa</a>
        </div>
      </div>

      <div id="syncFeedback" class="base-meta" style="display:none; margin-top:-4px; margin-bottom:16px;">Pronto para sincronizar contatos e tags com o BotConversa.</div>

      <div class="base-card" id="exportar">
        <h3 style="margin-top:0">Exportar tabelas</h3>
        <div class="base-actions-row compact" style="margin-top:12px;">
          <div>
            <label class="base-label" for="exportTipo">Tabela</label>
            <select class="base-select" id="exportTipo">
              <option value="ifood">iFood</option>
              <option value="flash">Flash</option>
              <option value="uber">Uber</option>
              <option value="google_contacts">Google Contacts</option>
            </select>
          </div>
          <div>
            <label class="base-label" for="exportAdmissaoInicial">Admissão inicial</label>
            <input class="base-input" type="date" id="exportAdmissaoInicial" />
          </div>
          <div>
            <label class="base-label" for="exportAdmissaoFinal">Admissão final</label>
            <input class="base-input" type="date" id="exportAdmissaoFinal" />
          </div>
          <div style="display:flex; align-items:end;">
            <button class="base-button primary inline" id="btnGerarExportacao">Gerar e baixar</button>
          </div>
        </div>
        <div id="exportFeedback" class="base-meta" style="margin-top:12px;">Selecione a tabela e o período de admissão para gerar e baixar o arquivo.</div>
      </div>

      <div class="base-card">
        <div class="base-actions-row filters-5">
          <div>
            <label class="base-label" for="fCoordenacao">Coordenação</label>
            <input class="base-input" type="text" id="fCoordenacao" placeholder="Ex.: Operações" />
          </div>
          <div>
            <label class="base-label" for="fSupervisao">Supervisão</label>
            <input class="base-input" type="text" id="fSupervisao" placeholder="Ex.: Supervisão Sul" />
          </div>
          <div>
            <label class="base-label" for="fNome">Nome</label>
            <input class="base-input" type="text" id="fNome" placeholder="Buscar nome" />
          </div>
          <div>
            <label class="base-label" for="fSituacao">Situação</label>
            <select class="base-select" id="fSituacao">
              <option value="Todos">Todos</option>
              <option value="Ativo" selected>Ativo</option>
              <option value="Não Ativo">Não Ativo</option>
            </select>
          </div>
          <div>
            <label class="base-label" for="fEmpresa">Empresa</label>
            <input class="base-input" type="text" id="fEmpresa" placeholder="Empresa" />
          </div>
        </div>

        <div class="base-actions-row compact" style="margin-top:12px;">
          <div>
            <label class="base-label" for="fTipo">Tipo</label>
            <input class="base-input" type="text" id="fTipo" placeholder="Tipo" />
          </div>
          <div>
            <label class="base-label" for="fCpf">CPF</label>
            <input class="base-input" type="text" id="fCpf" placeholder="CPF" />
          </div>
          <div></div>
          <div style="display:flex; align-items:end;">
            <button class="base-button secondary inline" id="btnPesquisar">Pesquisar</button>
          </div>
        </div>

        <div class="base-table-wrap" style="margin-top:16px;">
          <table class="base-table wide">
            <thead>
              <tr>
                <th>CPF</th>
                <th>Nome</th>
                <th>Situação</th>
                <th>Empresa</th>
                <th>Coordenação</th>
                <th>Supervisão</th>
                <th>Cargo</th>
                <th>Cidade</th>
                <th>Tipo</th>
                <th>E-mail empresa</th>
                <th>Whatsapp</th>
              </tr>
            </thead>
            <tbody id="tbodyColaboradores"></tbody>
          </table>
        </div>

        <div class="base-meta" id="metaConsulta">Aguardando pesquisa.</div>
      </div>
    </section>
  `;

  document.getElementById('btnPesquisar')?.addEventListener('click', loadData);
  document.getElementById('btnGerarExportacao')?.addEventListener('click', gerarExportacao);

  document.getElementById('btnAbrirExportar')?.addEventListener('click', (event) => {
    event.preventDefault();
    document.getElementById('exportar')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  document.getElementById('btnAbrirSync')?.addEventListener('click', async (event) => {
    event.preventDefault();
    await sincronizarBotConversa();
  });

  loadData().catch((err) => {
    console.error(err);
    const meta = document.getElementById('metaConsulta');
    if (meta) meta.textContent = `Erro ao consultar base: ${err.message || err}`;
  });
});
