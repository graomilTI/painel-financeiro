import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const STATUS_SOLICITACAO = {
  SOLICITADA: 'Solicitada',
  EM_ANALISE: 'Em análise',
  EM_COTACAO: 'Em cotação',
  RESERVADA: 'Reservada',
  CANCELADA: 'Cancelada',
  CONCLUIDA: 'Concluída'
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function money(value) {
  const n = Number(value || 0);
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function todayISO() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function diffDays(start, end) {
  if (!start || !end) return 1;
  const a = new Date(`${start}T00:00:00`);
  const b = new Date(`${end}T00:00:00`);
  const diff = Math.round((b - a) / 86400000);
  return Math.max(1, diff || 1);
}

function normalizeText(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function getUserField(ctx, ...paths) {
  for (const path of paths) {
    const parts = path.split('.');
    let cur = ctx;
    for (const part of parts) cur = cur?.[part];
    if (cur !== undefined && cur !== null && String(cur).trim() !== '') return cur;
  }
  return null;
}

async function safeSelect(table, columns = '*', build = null) {
  try {
    let query = supabase.from(table).select(columns);
    if (typeof build === 'function') query = build(query);
    const { data, error } = await query;
    if (error) throw error;
    return { data: data || [], error: null };
  } catch (error) {
    return { data: [], error };
  }
}

function injectStyles() {
  if (document.getElementById('hospedagemGestorStyles')) return;
  const style = document.createElement('style');
  style.id = 'hospedagemGestorStyles';
  style.textContent = `
    .hosp-tabs{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}.hosp-tab{width:auto;margin-top:0;border:1px solid var(--line-2);background:#15152a;color:var(--text);border-radius:999px;padding:10px 14px;cursor:pointer;font-weight:800}.hosp-tab.active{background:rgba(22,101,52,.32);color:#dcfce7;border-color:rgba(111,208,165,.34)}
    .hosp-panel{display:none}.hosp-panel.active{display:block}.hosp-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.hosp-field{display:flex;flex-direction:column;gap:7px}.hosp-field.full{grid-column:1/-1}.hosp-field label{font-size:13px;color:#cbd5e1;font-weight:800}.hosp-field input,.hosp-field textarea,.hosp-field select{width:100%;border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:14px;padding:12px 13px;outline:none;color-scheme:dark}.hosp-field textarea{resize:vertical;min-height:86px}.hosp-field input:focus,.hosp-field textarea:focus,.hosp-field select:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}.hosp-help{font-size:12px;color:var(--muted)}
    .hosp-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.hosp-btn{width:auto!important;margin-top:0!important}.hosp-feedback{color:var(--muted);font-size:13px}.hosp-feedback.ok{color:#bbf7d0}.hosp-feedback.err{color:#fecaca}.hosp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.hosp-table{width:100%;border-collapse:collapse;min-width:1040px;background:#15152a}.hosp-table th,.hosp-table td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.hosp-table th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.hosp-table tr:hover td{background:rgba(111,208,165,.035)}
    .hosp-status{display:inline-flex;align-items:center;padding:6px 9px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);font-size:12px;font-weight:800;white-space:nowrap}.hosp-status.solicitada,.hosp-status.em_analise,.hosp-status.em_cotacao{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.24)}.hosp-status.reservada{color:#bfdbfe;background:rgba(59,130,246,.11);border-color:rgba(59,130,246,.25)}.hosp-status.concluida{color:#bbf7d0;background:rgba(22,101,52,.22);border-color:rgba(22,101,52,.34)}.hosp-status.cancelada{color:#fecaca;background:rgba(220,38,38,.13);border-color:rgba(220,38,38,.24)}
    .hosp-mini-list{display:grid;gap:10px}.hosp-mini-item{border:1px solid var(--line);border-radius:16px;padding:12px;background:#15152a}.hosp-mini-item strong{display:block}.hosp-mini-item span{color:var(--muted);font-size:13px}.hosp-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:12px}.hosp-summary div{border:1px solid var(--line);border-radius:16px;padding:12px;background:rgba(11,18,32,.8)}.hosp-summary strong{display:block;font-size:20px;color:#dcfce7}.hosp-summary span{display:block;color:var(--muted);font-size:12px;margin-top:4px}.hosp-colab-box{display:grid;gap:10px}.hosp-colab-row{display:grid;grid-template-columns:1.2fr .6fr auto;gap:10px;align-items:end}.hosp-remove{width:auto!important;margin-top:0!important;padding:10px 12px!important}.hosp-empty{padding:18px;color:var(--muted);text-align:center}.hosp-alert{border:1px solid rgba(245,158,11,.24);background:rgba(245,158,11,.08);color:#fde68a;border-radius:16px;padding:12px 14px;margin-top:12px}
    @media(max-width:850px){.hosp-form-grid,.hosp-colab-row{grid-template-columns:1fr}.hosp-remove{justify-self:flex-start}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Hospedagem', (content, userContext) => {
  injectStyles();
  const state = { solicitacoes: [], colaboradores: [], tab: 'solicitar' };

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Gestor</div>
        <h2>Solicitação de Hospedagem</h2>
        <p>Envie pedidos para o setor de hospedagem com colaboradores, local de embarque, cidade, datas e observações em um fluxo rastreável.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">HOSPEDAGEM</span></div>
    </section>

    <div class="hosp-tabs">
      <button class="hosp-tab active" data-tab="solicitar" type="button">Solicitar hospedagem</button>
      <button class="hosp-tab" data-tab="minhas" type="button">Minhas solicitações</button>
    </div>

    <section class="hosp-panel active" id="panel-solicitar">
      <article class="card">
        <div class="section-head">
          <div>
            <h3>Nova solicitação</h3>
            <p class="muted">O gestor informa a necessidade. A reserva, pagamento e NF ficam com o módulo Hospedagem.</p>
          </div>
        </div>

        <form id="hospForm">
          <div class="hosp-form-grid">
            <div class="hosp-field">
              <label for="cidade">Cidade da reserva *</label>
              <input id="cidade" required placeholder="Ex.: Araguapaz" />
            </div>
            <div class="hosp-field">
              <label for="uf">UF</label>
              <input id="uf" maxlength="2" placeholder="GO" />
            </div>
            <div class="hosp-field">
              <label for="cliente">Cliente</label>
              <input id="cliente" placeholder="Cliente / unidade / fazenda" />
            </div>
            <div class="hosp-field">
              <label for="saldo">Saldo ou limite informado</label>
              <input id="saldo" type="number" step="0.01" min="0" placeholder="1000,00" />
            </div>
            <div class="hosp-field full">
              <label for="localEmbarque">Local de embarque *</label>
              <input id="localEmbarque" required placeholder="Ex.: Fazenda Claite" />
            </div>
            <div class="hosp-field full">
              <label for="linkLocal">Link/localização do embarque</label>
              <input id="linkLocal" placeholder="Cole o link do Google Maps ou referência de localização" />
            </div>
            <div class="hosp-field">
              <label for="checkin">Check-in previsto *</label>
              <input id="checkin" type="date" required />
            </div>
            <div class="hosp-field">
              <label for="checkout">Check-out previsto *</label>
              <input id="checkout" type="date" required />
            </div>
            <div class="hosp-field">
              <label for="horario">Horário previsto de chegada</label>
              <input id="horario" type="time" />
            </div>
            <div class="hosp-field">
              <label>Diárias previstas</label>
              <input id="diarias" readonly />
            </div>
          </div>

          <div class="card mt-16" style="box-shadow:none;">
            <div class="section-head">
              <div>
                <h3>Colaboradores</h3>
                <p class="muted">Adicione um ou mais colaboradores para a mesma hospedagem.</p>
              </div>
              <button class="btn btn-secondary hosp-btn" type="button" id="addColabBtn">Adicionar colaborador</button>
            </div>
            <div class="hosp-colab-box" id="colabBox"></div>
            <div class="hosp-alert" id="colabFallback" style="display:none;">Não foi possível consultar a base de colaboradores agora. Você ainda pode digitar os nomes manualmente.</div>
          </div>

          <div class="hosp-form-grid mt-16">
            <div class="hosp-field full">
              <label for="obs">Observações do gestor</label>
              <textarea id="obs" placeholder="Ex.: chegará por volta das 17h, priorizar hotel próximo ao local de embarque, observações sobre quartos etc."></textarea>
            </div>
          </div>

          <div class="hosp-actions">
            <button class="btn btn-primary hosp-btn" type="submit" id="submitBtn">Enviar solicitação</button>
            <button class="btn btn-secondary hosp-btn" type="button" id="clearBtn">Limpar</button>
            <span class="hosp-feedback" id="feedback"></span>
          </div>
        </form>
      </article>
    </section>

    <section class="hosp-panel" id="panel-minhas">
      <section class="grid-cards compact-grid">
        <article class="card"><h3>Total</h3><p class="metric" id="statTotal">0</p><p class="muted">Solicitações encontradas.</p></article>
        <article class="card"><h3>Em andamento</h3><p class="metric" id="statOpen">0</p><p class="muted">Aguardando análise/reserva.</p></article>
        <article class="card"><h3>Reservadas</h3><p class="metric" id="statReserved">0</p><p class="muted">Hotel já confirmado.</p></article>
      </section>

      <article class="card mt-16">
        <div class="section-head">
          <div><h3>Minhas solicitações</h3><p class="muted">Acompanhe o status enviado pelo setor de hospedagem.</p></div>
          <button class="btn btn-secondary hosp-btn" type="button" id="refreshBtn">Atualizar</button>
        </div>
        <div class="hosp-table-wrap">
          <table class="hosp-table">
            <thead><tr><th>Código</th><th>Colaboradores</th><th>Cidade</th><th>Embarque</th><th>Período</th><th>Hotel</th><th>Status</th></tr></thead>
            <tbody id="minhasTbody"><tr><td colspan="7" class="hosp-empty">Carregando...</td></tr></tbody>
          </table>
        </div>
      </article>
    </section>
  `;

  const form = document.getElementById('hospForm');
  const feedback = document.getElementById('feedback');
  const colabBox = document.getElementById('colabBox');
  const checkin = document.getElementById('checkin');
  const checkout = document.getElementById('checkout');
  const diarias = document.getElementById('diarias');

  function setFeedback(msg, type = '') {
    feedback.textContent = msg || '';
    feedback.className = `hosp-feedback ${type}`.trim();
  }

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.hosp-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.hosp-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`panel-${tab}`).classList.add('active');
    if (tab === 'minhas') loadMinhas();
  }

  function updateDiarias() {
    diarias.value = diffDays(checkin.value, checkout.value);
  }

  function colaboradorOptions() {
    if (!state.colaboradores.length) return '';
    return `<datalist id="colaboradorList">${state.colaboradores.map((c) => `<option value="${esc(c.nome)}">${esc([c.tipo, c.supervisao].filter(Boolean).join(' · '))}</option>`).join('')}</datalist>`;
  }

  function addColabRow(value = '', tipo = '') {
    const id = `colab-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const wrap = document.createElement('div');
    wrap.className = 'hosp-colab-row';
    wrap.innerHTML = `
      <div class="hosp-field">
        <label for="${id}">Nome do colaborador *</label>
        <input id="${id}" class="colabNome" list="colaboradorList" required value="${esc(value)}" placeholder="Digite ou selecione o colaborador" />
      </div>
      <div class="hosp-field">
        <label>Tipo</label>
        <input class="colabTipo" value="${esc(tipo)}" placeholder="Fixo / Diarista" />
      </div>
      <button class="btn btn-secondary hosp-remove" type="button">Remover</button>
    `;
    wrap.querySelector('.hosp-remove').addEventListener('click', () => {
      if (colabBox.children.length <= 1) return;
      wrap.remove();
    });
    wrap.querySelector('.colabNome').addEventListener('change', (ev) => {
      const selected = state.colaboradores.find((c) => normalizeText(c.nome) === normalizeText(ev.target.value));
      if (selected) wrap.querySelector('.colabTipo').value = selected.tipo || '';
    });
    colabBox.appendChild(wrap);
  }

  function resetForm() {
    form.reset();
    checkin.value = todayISO();
    const out = new Date();
    out.setDate(out.getDate() + 1);
    checkout.value = `${out.getFullYear()}-${String(out.getMonth() + 1).padStart(2, '0')}-${String(out.getDate()).padStart(2, '0')}`;
    colabBox.innerHTML = colaboradorOptions();
    addColabRow();
    updateDiarias();
    setFeedback('');
  }

  function getColaboradoresPayload() {
    return Array.from(colabBox.querySelectorAll('.hosp-colab-row')).map((row) => {
      const nome = row.querySelector('.colabNome').value.trim();
      const tipoManual = row.querySelector('.colabTipo').value.trim();
      const found = state.colaboradores.find((c) => normalizeText(c.nome) === normalizeText(nome));
      return {
        colaborador_id: found?.id || null,
        nome_colaborador: nome,
        cpf: found?.cpf || null,
        tipo_colaborador: found?.tipo || tipoManual || null,
        empresa: found?.empresa || getUserField(userContext, 'empresa', 'user.empresa') || null,
        coordenacao: found?.coordenacao || getUserField(userContext, 'coordenacao', 'user.coordenacao') || null,
        supervisao: found?.supervisao || getUserField(userContext, 'supervisao', 'user.supervisao') || null,
        status_colaborador: 'ATIVO'
      };
    }).filter((c) => c.nome_colaborador);
  }

  async function loadColaboradores() {
    const { data, error } = await safeSelect('colaborador_snapshot', 'id,nome,cpf,tipo,empresa,coordenacao,supervisao,ativo,data_referencia', (q) => q.order('nome', { ascending: true }).limit(1500));
    if (error) {
      document.getElementById('colabFallback').style.display = 'block';
      state.colaboradores = [];
      return;
    }
    const latest = data.reduce((max, row) => row.data_referencia > max ? row.data_referencia : max, '');
    state.colaboradores = data
      .filter((row) => !latest || row.data_referencia === latest)
      .filter((row) => row.ativo !== false)
      .map((row) => ({
        id: row.id,
        nome: row.nome,
        cpf: row.cpf,
        tipo: row.tipo,
        empresa: row.empresa,
        coordenacao: row.coordenacao,
        supervisao: row.supervisao
      }));
  }

  async function submitSolicitacao(ev) {
    ev.preventDefault();
    setFeedback('Enviando solicitação...');
    const btn = document.getElementById('submitBtn');
    btn.disabled = true;

    const colaboradores = getColaboradoresPayload();
    if (!colaboradores.length) {
      setFeedback('Informe ao menos um colaborador.', 'err');
      btn.disabled = false;
      return;
    }

    const payload = {
      // Compatibilidade com bases antigas do painel que possuem data_solicitacao NOT NULL.
      // Na base nova, a view usa created_at como data_solicitacao; este campo extra é ignorado quando não existe.
      data_solicitacao: new Date().toISOString().slice(0, 10),
      solicitante_id: userContext?.user?.id || null,
      solicitante_nome: userContext?.user?.name || null,
      solicitante_email: userContext?.user?.email || null,
      empresa: getUserField(userContext, 'empresa', 'user.empresa') || null,
      coordenacao: getUserField(userContext, 'coordenacao', 'user.coordenacao') || null,
      supervisao: getUserField(userContext, 'supervisao', 'user.supervisao') || null,
      regional: getUserField(userContext, 'regional', 'user.regional') || getUserField(userContext, 'supervisao', 'user.supervisao') || null,
      cidade: document.getElementById('cidade').value.trim(),
      uf: document.getElementById('uf').value.trim().toUpperCase() || null,
      cliente: document.getElementById('cliente').value.trim() || null,
      local_embarque: document.getElementById('localEmbarque').value.trim(),
      link_local_embarque: document.getElementById('linkLocal').value.trim() || null,
      data_checkin_prevista: checkin.value,
      data_checkout_prevista: checkout.value,
      horario_chegada_previsto: document.getElementById('horario').value || null,
      quantidade_diarias_prevista: diffDays(checkin.value, checkout.value),
      saldo_informado: document.getElementById('saldo').value ? Number(document.getElementById('saldo').value) : null,
      observacao_gestor: document.getElementById('obs').value.trim() || null,
      status_solicitacao: 'SOLICITADA'
    };

    const { data, error } = await supabase.from('hospedagem_solicitacoes').insert(payload).select('id,codigo').single();
    if (error) {
      setFeedback(error.message || 'Erro ao criar solicitação.', 'err');
      btn.disabled = false;
      return;
    }

    const itens = colaboradores.map((c) => ({ ...c, solicitacao_id: data.id }));
    const { error: colabError } = await supabase.from('hospedagem_solicitacao_colaboradores').insert(itens);
    if (colabError) {
      setFeedback(`Solicitação criada, mas houve erro ao vincular colaboradores: ${colabError.message}`, 'err');
      btn.disabled = false;
      return;
    }

    await supabase.from('hospedagem_eventos').insert({
      solicitacao_id: data.id,
      usuario_id: userContext?.user?.id || null,
      usuario_nome: userContext?.user?.name || null,
      tipo_evento: 'SOLICITACAO_CRIADA',
      descricao: 'Solicitação criada pelo gestor.',
      status_novo: 'SOLICITADA'
    });

    resetForm();
    setFeedback(`Solicitação ${data.codigo || ''} enviada com sucesso.`, 'ok');
    await loadMinhas(false);
    btn.disabled = false;
  }

  async function loadMinhas(showLoading = true) {
    const tbody = document.getElementById('minhasTbody');
    if (showLoading) tbody.innerHTML = `<tr><td colspan="7" class="hosp-empty">Carregando...</td></tr>`;
    let query = supabase.from('hospedagem_minhas_solicitacoes').select('*').order('data_solicitacao', { ascending: false });
    if (userContext?.user?.id) query = query.eq('solicitante_id', userContext.user.id);
    const { data, error } = await query;
    if (error) {
      tbody.innerHTML = `<tr><td colspan="7" class="hosp-empty">${esc(error.message)}</td></tr>`;
      return;
    }
    state.solicitacoes = data || [];
    document.getElementById('statTotal').textContent = state.solicitacoes.length;
    document.getElementById('statOpen').textContent = state.solicitacoes.filter((r) => ['SOLICITADA', 'EM_ANALISE', 'EM_COTACAO'].includes(r.status_solicitacao)).length;
    document.getElementById('statReserved').textContent = state.solicitacoes.filter((r) => r.status_solicitacao === 'RESERVADA').length;
    if (!state.solicitacoes.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="hosp-empty">Nenhuma solicitação encontrada.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.solicitacoes.map((r) => `
      <tr>
        <td><strong>${esc(r.codigo || '-')}</strong><br><span class="hosp-help">${brDate(r.data_solicitacao)}</span></td>
        <td>${esc(r.colaboradores || '-')}</td>
        <td>${esc([r.cidade, r.uf].filter(Boolean).join('/'))}</td>
        <td>${esc(r.local_embarque || '-')}</td>
        <td>${brDate(r.data_checkin_prevista)} até ${brDate(r.data_checkout_prevista)}<br><span class="hosp-help">${esc(r.quantidade_diarias_prevista || '-')} diária(s)</span></td>
        <td>${esc(r.hotel || '-')}</td>
        <td><span class="hosp-status ${esc(String(r.status_solicitacao || '').toLowerCase())}">${esc(STATUS_SOLICITACAO[r.status_solicitacao] || r.status_solicitacao || '-')}</span></td>
      </tr>
    `).join('');
  }

  document.querySelectorAll('.hosp-tab').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  document.getElementById('addColabBtn').addEventListener('click', () => addColabRow());
  document.getElementById('clearBtn').addEventListener('click', resetForm);
  document.getElementById('refreshBtn').addEventListener('click', () => loadMinhas());
  checkin.addEventListener('change', updateDiarias);
  checkout.addEventListener('change', updateDiarias);
  form.addEventListener('submit', submitSolicitacao);

  (async function boot() {
    await loadColaboradores();
    resetForm();
    await loadMinhas(false);
  })();
});
