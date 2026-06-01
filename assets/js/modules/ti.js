/* assets/js/modules/ti.js */
(function () {
  'use strict';

  const MODULE_NAME = 'TI';
  const state = {
    integrations: [],
    secrets: [],
    selectedId: null,
    loading: false,
    search: '',
    suggestedSecrets: []
  };

  const TEMPLATES = [
    {
      codigo: 'DETRAN_PR_FROTISTA',
      nome: 'DETRAN PR · Frotista',
      categoria: 'FROTAS',
      ambiente: 'PRODUCAO',
      base_url: 'https://detranfrotistaapi.paas.pr.gov.br',
      auth_url: 'https://auth-cs.identidadedigital.pr.gov.br/centralautenticacao/api/v1/token/jwt',
      segredos: ['DETRAN_CLIENT_ID', 'DETRAN_CLIENT_SECRET', 'DETRAN_SCOPE', 'DETRAN_CONSUMER_ID']
    },
    {
      codigo: 'BFLEET_SERVICE24GPS',
      nome: 'BFleet · Service24GPS',
      categoria: 'FROTAS',
      ambiente: 'PRODUCAO',
      base_url: 'https://api.service24gps.com/api/v1',
      auth_url: 'https://api.service24gps.com/api/v1/gettoken',
      segredos: ['BFLEET_API_KEY', 'BFLEET_USERNAME', 'BFLEET_PASSWORD', 'BFLEET_REPORT_EXCESSO_VELOCIDADE_ID']
    },
    {
      codigo: 'BOTCONVERSA',
      nome: 'BotConversa',
      categoria: 'COMUNICACAO',
      ambiente: 'PRODUCAO',
      base_url: 'https://backend.botconversa.com.br/api/v1',
      auth_url: '',
      segredos: ['BOTCONVERSA_API_KEY']
    },
    {
      codigo: 'CORREIOS_PRE_POSTAGEM',
      nome: 'Correios · Pré-postagem',
      categoria: 'LOGISTICA',
      ambiente: 'PRODUCAO',
      base_url: 'https://api.correios.com.br',
      auth_url: 'https://api.correios.com.br/token/v1/autentica/cartaopostagem',
      segredos: ['CORREIOS_USUARIO', 'CORREIOS_SENHA', 'CORREIOS_CARTAO_POSTAGEM', 'CORREIOS_CONTRATO']
    },
    {
      codigo: 'UBER_EMPRESAS',
      nome: 'Uber Empresas',
      categoria: 'CONFERENCIA',
      ambiente: 'PRODUCAO',
      base_url: 'sftp://sftp.uber.com:2222',
      auth_url: 'https://login.uber.com/oauth/v2/token',
      segredos: ['UBER_SFTP_HOST', 'UBER_SFTP_PORT', 'UBER_SFTP_USERNAME', 'UBER_SFTP_REMOTE_DIR', 'UBER_SFTP_PRIVATE_KEY', 'UBER_SFTP_PASSPHRASE', 'UBER_CLIENT_ID', 'UBER_CLIENT_SECRET', 'UBER_SCOPES']
    }
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function normalizeCode(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  function getSupabase(opts = {}) {
    return opts.supabase || window.supabase || window.SUPABASE || null;
  }

  function isMaster(opts = {}) {
    const u = opts?.auth?.user || opts?.user || window.AUTH?.user || window.currentUser || {};
    return Boolean(u.is_master || u.can_manage_settings || String(u.role || '').toLowerCase() === 'admin' || String(u.perfil_codigo || '').toLowerCase() === 'master');
  }

  function toast(message, type = 'success') {
    let el = document.querySelector('.ti-toast');
    if (!el) { el = document.createElement('div'); el.className = 'ti-toast'; document.body.appendChild(el); }
    el.textContent = message;
    el.style.background = type === 'error' ? 'rgba(127,29,29,.96)' : 'rgba(22,101,52,.96)';
    el.classList.add('show');
    window.setTimeout(() => el.classList.remove('show'), 3200);
  }

  function styles() {
    return `
      <style id="ti-integracoes-style">
        .ti-shell{width:100%;color:#e2e2f0}.ti-header{margin-bottom:18px}.ti-kicker{display:inline-flex;align-items:center;gap:8px;color:#86efac;font-size:12px;font-weight:950;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px}.ti-title{margin:0;color:#f8fafc;font-size:clamp(22px,2.2vw,32px);line-height:1.1;letter-spacing:-.04em}.ti-subtitle{max-width:920px;margin:10px 0 0;color:#6b7280;font-size:14px;line-height:1.55}.ti-card{background:radial-gradient(circle at top left,rgba(34,197,94,.12),transparent 34%),linear-gradient(180deg,rgba(15,23,42,.98),rgba(2,6,23,.98));border:1px solid rgba(148,163,184,.16);border-radius:24px;box-shadow:0 20px 60px rgba(0,0,0,.28);overflow:hidden}.ti-tabs{display:flex;gap:10px;flex-wrap:wrap;padding:14px;border-bottom:1px solid rgba(148,163,184,.12);background:rgba(2,6,23,.36)}.ti-tab{appearance:none;border:1px solid rgba(34,197,94,.35);background:rgba(22,101,52,.30);color:#f8fafc;border-radius:999px;padding:10px 14px;font-weight:950;font-size:13px}.ti-body{padding:18px}.ti-grid{display:grid;grid-template-columns:minmax(300px,390px) minmax(440px,1fr);gap:18px;align-items:start}.ti-panel{background:rgba(15,23,42,.72);border:1px solid rgba(148,163,184,.14);border-radius:22px;padding:18px}.ti-panel h3{margin:0 0 14px;color:#f8fafc;font-size:16px;letter-spacing:-.02em}.ti-field{display:flex;flex-direction:column;gap:7px;margin-bottom:14px}.ti-field label{color:#cbd5e1;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.08em}.ti-input,.ti-select,.ti-textarea{width:100%;border:1px solid rgba(148,163,184,.18);background:#0d0d18;color:#e2e2f0;border-radius:14px;padding:12px 13px;outline:none;font-size:14px;transition:.16s ease;color-scheme:dark}.ti-select option{background:#0d0d18;color:#e2e2f0}.ti-input:focus,.ti-select:focus,.ti-textarea:focus{border-color:rgba(34,197,94,.68);box-shadow:0 0 0 4px rgba(34,197,94,.10)}.ti-row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.ti-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:12px}.ti-btn{border:0;border-radius:14px;padding:12px 14px;font-weight:950;cursor:pointer;transition:.18s ease;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px}.ti-btn-primary{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;box-shadow:0 14px 34px rgba(34,197,94,.20)}.ti-btn-soft{background:rgba(34,197,94,.12);color:#86efac;border:1px solid rgba(34,197,94,.24)}.ti-btn-danger{background:rgba(239,68,68,.12);color:#fecaca;border:1px solid rgba(239,68,68,.25)}.ti-btn:disabled{opacity:.55;cursor:not-allowed}.ti-list{display:grid;gap:10px;max-height:620px;overflow:auto;padding-right:2px}.ti-item{border:1px solid rgba(148,163,184,.14);background:rgba(15,23,42,.68);border-radius:16px;padding:12px;cursor:pointer;text-align:left;color:#e2e2f0}.ti-item:hover,.ti-item.active{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.20)}.ti-item strong{display:block;color:#f8fafc;font-size:13px}.ti-item span{display:block;color:#6b7280;font-size:12px;line-height:1.4;margin-top:4px}.ti-badges{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.ti-badge{display:inline-flex;border-radius:999px;padding:4px 8px;background:rgba(34,197,94,.12);border:1px solid rgba(34,197,94,.24);color:#bbf7d0;font-size:10px;font-weight:950;text-transform:uppercase;letter-spacing:.04em}.ti-badge.off{background:rgba(148,163,184,.08);border-color:rgba(148,163,184,.16);color:#6b7280}.ti-secret-table{width:100%;border-collapse:separate;border-spacing:0;border:1px solid rgba(148,163,184,.12);border-radius:16px;overflow:hidden}.ti-secret-table th,.ti-secret-table td{padding:12px 10px;border-bottom:1px solid rgba(148,163,184,.10);font-size:12px;text-align:left}.ti-secret-table th{color:#bfdbfe;text-transform:uppercase;letter-spacing:.08em;background:rgba(2,6,23,.38)}.ti-secret-table td{color:#e2e2f0}.ti-secret-table tr:last-child td{border-bottom:0}.ti-mask{font-family:ui-monospace,Menlo,Consolas,monospace;color:#6b7280}.ti-note{border:1px dashed rgba(34,197,94,.32);background:rgba(22,101,52,.12);border-radius:18px;padding:14px;color:#d1fae5;font-size:12px;line-height:1.55;margin-top:14px}.ti-empty{border:1px dashed rgba(148,163,184,.22);border-radius:16px;padding:14px;color:#6b7280;font-size:13px}.ti-template-grid{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.ti-template{font-size:12px}.ti-quick-add{border:1px dashed rgba(125,211,252,.34);background:rgba(14,165,233,.10);border-radius:18px;padding:12px;margin-bottom:14px}.ti-quick-add-title{color:#bae6fd;font-size:12px;font-weight:950;text-transform:uppercase;letter-spacing:.08em;margin-bottom:8px}.ti-chip-row{display:flex;gap:8px;flex-wrap:wrap}.ti-chip{appearance:none;border:1px solid rgba(148,163,184,.22);background:#0d0d18;color:#dbeafe;border-radius:999px;padding:8px 10px;font-size:11px;font-weight:900;cursor:pointer}.ti-chip:hover{border-color:rgba(34,197,94,.55);color:#bbf7d0}.ti-toast{position:fixed;right:22px;bottom:22px;background:rgba(22,101,52,.96);color:#dcfce7;border:1px solid rgba(134,239,172,.32);border-radius:16px;padding:12px 14px;font-weight:900;box-shadow:0 16px 45px rgba(0,0,0,.35);z-index:99999;opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s ease}@media(max-width:980px){.ti-grid{grid-template-columns:1fr}.ti-row{grid-template-columns:1fr}}.ti-toast.show{opacity:1;transform:translateY(0)}
      </style>`;
  }

  function filteredIntegrations() {
    const q = String(state.search || '').toLowerCase().trim();
    if (!q) return state.integrations;
    return state.integrations.filter((item) => [item.nome, item.codigo, item.categoria, item.base_url].some((v) => String(v || '').toLowerCase().includes(q)));
  }

  function selectedIntegration() {
    return state.integrations.find((i) => i.id === state.selectedId) || state.integrations[0] || null;
  }

  function getSelectedSecrets() {
    const current = selectedIntegration();
    if (!current) return [];
    return state.secrets.filter((s) => s.integracao_id === current.id);
  }

  async function loadData(root, opts = {}) {
    const supabase = getSupabase(opts);
    if (!supabase) return toast('Supabase não encontrado nesta página.', 'error');
    state.loading = true;
    renderLists(root, opts);
    try {
      const [{ data: integrations, error: iErr }, { data: secrets, error: sErr }] = await Promise.all([
        supabase.from('ti_integracoes').select('*').order('nome', { ascending: true }),
        supabase.from('ti_integracao_segredos').select('id,integracao_id,chave,descricao,sensivel,ativo,updated_at,created_at').order('chave', { ascending: true })
      ]);
      if (iErr) throw iErr;
      if (sErr) throw sErr;
      state.integrations = Array.isArray(integrations) ? integrations : [];
      state.secrets = Array.isArray(secrets) ? secrets : [];
      if (!state.selectedId && state.integrations[0]) state.selectedId = state.integrations[0].id;
      if (state.selectedId && !state.integrations.some((i) => i.id === state.selectedId)) state.selectedId = state.integrations[0]?.id || null;
    } catch (err) {
      console.error('[TI] loadData:', err);
      toast('Não foi possível carregar TI > Integrações. Rode o SQL enviado.', 'error');
    } finally {
      state.loading = false;
      renderLists(root, opts);
      fillForm(root);
    }
  }

  function renderLists(root, opts = {}) {
    const list = root.querySelector('[data-ti-list]');
    const secrets = root.querySelector('[data-secret-list]');
    const total = root.querySelector('[data-ti-total]');
    if (total) total.textContent = `${state.integrations.length} integração(ões)`;

    if (list) {
      const items = filteredIntegrations();
      if (state.loading) {
        list.innerHTML = '<div class="ti-empty">Carregando integrações...</div>';
      } else if (!items.length) {
        list.innerHTML = '<div class="ti-empty">Nenhuma integração cadastrada ainda.</div>';
      } else {
        list.innerHTML = items.map((item) => `
          <button type="button" class="ti-item ${item.id === state.selectedId ? 'active' : ''}" data-select-integracao="${escapeHtml(item.id)}">
            <strong>${escapeHtml(item.nome || item.codigo)}</strong>
            <span>${escapeHtml(item.codigo)} · ${escapeHtml(item.base_url || 'sem URL base')}</span>
            <div class="ti-badges"><span class="ti-badge">${escapeHtml(item.categoria || 'GERAL')}</span><span class="ti-badge ${item.ativo ? '' : 'off'}">${item.ativo ? 'ATIVA' : 'INATIVA'}</span><span class="ti-badge">${escapeHtml(item.ambiente || 'PRODUCAO')}</span></div>
          </button>`).join('');
      }
      list.querySelectorAll('[data-select-integracao]').forEach((btn) => btn.addEventListener('click', () => {
        state.selectedId = btn.getAttribute('data-select-integracao');
        state.suggestedSecrets = [];
        renderLists(root, opts);
        fillForm(root);
      }));
    }

    if (secrets) {
      const rows = getSelectedSecrets();
      if (!selectedIntegration()) {
        secrets.innerHTML = '<div class="ti-empty">Selecione ou crie uma integração para ver os tokens.</div>';
      } else if (!rows.length) {
        secrets.innerHTML = '<div class="ti-empty">Nenhum token/chave cadastrado para esta integração.</div>';
      } else {
        secrets.innerHTML = `
          <table class="ti-secret-table">
            <thead><tr><th>Chave</th><th>Valor</th><th>Status</th><th></th></tr></thead>
            <tbody>${rows.map((s) => `
              <tr>
                <td><strong>${escapeHtml(s.chave)}</strong><br><span style="color:#6b7280">${escapeHtml(s.descricao || '')}</span></td>
                <td class="ti-mask">${s.sensivel ? '••••••••••••••••' : 'salvo'}</td>
                <td><span class="ti-badge ${s.ativo ? '' : 'off'}">${s.ativo ? 'ATIVO' : 'INATIVO'}</span></td>
                <td><button class="ti-btn ti-btn-danger" type="button" data-remove-secret="${escapeHtml(s.id)}">Remover</button></td>
              </tr>`).join('')}</tbody>
          </table>`;
      }
      secrets.querySelectorAll('[data-remove-secret]').forEach((btn) => btn.addEventListener('click', () => removeSecret(root, opts, btn.getAttribute('data-remove-secret'))));
    }
  }

  function fillForm(root) {
    const current = selectedIntegration();
    const fields = {
      id: root.querySelector('[data-integracao-id]'),
      nome: root.querySelector('[data-integracao-nome]'),
      codigo: root.querySelector('[data-integracao-codigo]'),
      categoria: root.querySelector('[data-integracao-categoria]'),
      ambiente: root.querySelector('[data-integracao-ambiente]'),
      base_url: root.querySelector('[data-integracao-base]'),
      auth_url: root.querySelector('[data-integracao-auth]'),
      ativo: root.querySelector('[data-integracao-ativo]'),
      observacoes: root.querySelector('[data-integracao-obs]')
    };
    if (!current) {
      Object.entries(fields).forEach(([key, el]) => {
        if (!el) return;
        if (key === 'ativo') el.checked = true;
        else el.value = '';
      });
      return;
    }
    if (fields.id) fields.id.value = current.id || '';
    if (fields.nome) fields.nome.value = current.nome || '';
    if (fields.codigo) fields.codigo.value = current.codigo || '';
    if (fields.categoria) fields.categoria.value = current.categoria || '';
    if (fields.ambiente) fields.ambiente.value = current.ambiente || 'PRODUCAO';
    if (fields.base_url) fields.base_url.value = current.base_url || '';
    if (fields.auth_url) fields.auth_url.value = current.auth_url || '';
    if (fields.ativo) fields.ativo.checked = current.ativo !== false;
    if (fields.observacoes) fields.observacoes.value = current.observacoes || '';
  }

  function clearForm(root) {
    state.selectedId = null;
    state.suggestedSecrets = [];
    fillForm(root);
    renderLists(root);
    root.querySelector('[data-integracao-nome]')?.focus();
  }


  function prepareCustomApi(root, opts = {}) {
    state.selectedId = null;
    state.suggestedSecrets = ['API_KEY', 'CLIENT_ID', 'CLIENT_SECRET', 'USERNAME', 'PASSWORD', 'TOKEN'];
    fillForm(root);
    const now = new Date().toISOString().slice(0, 10);
    const fields = {
      nome: root.querySelector('[data-integracao-nome]'),
      codigo: root.querySelector('[data-integracao-codigo]'),
      categoria: root.querySelector('[data-integracao-categoria]'),
      ambiente: root.querySelector('[data-integracao-ambiente]'),
      base: root.querySelector('[data-integracao-base]'),
      auth: root.querySelector('[data-integracao-auth]'),
      obs: root.querySelector('[data-integracao-obs]'),
      ativo: root.querySelector('[data-integracao-ativo]')
    };
    if (fields.nome) fields.nome.value = '';
    if (fields.codigo) fields.codigo.value = '';
    if (fields.categoria) fields.categoria.value = 'GERAL';
    if (fields.ambiente) fields.ambiente.value = 'PRODUCAO';
    if (fields.base) fields.base.value = '';
    if (fields.auth) fields.auth.value = '';
    if (fields.obs) fields.obs.value = `API personalizada criada em ${now}. Preencha URL base, URL de autenticação e cadastre as chaves necessárias.`;
    if (fields.ativo) fields.ativo.checked = true;
    renderLists(root, opts);
    renderSecretSuggestions(root);
    fields.nome?.focus();
    toast('Nova API personalizada pronta para cadastro.');
  }

  function renderSecretSuggestions(root) {
    const box = root.querySelector('[data-secret-suggestions]');
    if (!box) return;
    const keys = Array.isArray(state.suggestedSecrets) ? state.suggestedSecrets.filter(Boolean) : [];
    if (!keys.length) {
      box.innerHTML = '';
      box.style.display = 'none';
      return;
    }
    box.style.display = 'block';
    box.innerHTML = `<div class="ti-quick-add-title">Chaves sugeridas para cadastrar</div><div class="ti-chip-row">${keys.map((key) => `<button class="ti-chip" type="button" data-use-secret-key="${escapeHtml(key)}">${escapeHtml(key)}</button>`).join('')}</div>`;
    box.querySelectorAll('[data-use-secret-key]').forEach((btn) => btn.addEventListener('click', () => {
      const key = btn.getAttribute('data-use-secret-key') || '';
      const input = root.querySelector('[data-secret-key]');
      const desc = root.querySelector('[data-secret-desc]');
      if (input) input.value = key;
      if (desc && !desc.value) desc.value = `Chave ${key} da integração ${selectedIntegration()?.nome || root.querySelector('[data-integracao-nome]')?.value || ''}`.trim();
      root.querySelector('[data-secret-value]')?.focus();
    }));
  }

  async function saveIntegration(root, opts = {}) {
    const supabase = getSupabase(opts);
    const id = root.querySelector('[data-integracao-id]')?.value || '';
    const nome = root.querySelector('[data-integracao-nome]')?.value.trim() || '';
    const codigo = normalizeCode(root.querySelector('[data-integracao-codigo]')?.value || nome);
    if (!nome) return toast('Informe o nome da integração.', 'error');
    if (!codigo) return toast('Informe o código da integração.', 'error');

    const payload = {
      nome,
      codigo,
      categoria: normalizeCode(root.querySelector('[data-integracao-categoria]')?.value || 'GERAL'),
      ambiente: root.querySelector('[data-integracao-ambiente]')?.value || 'PRODUCAO',
      base_url: root.querySelector('[data-integracao-base]')?.value.trim() || null,
      auth_url: root.querySelector('[data-integracao-auth]')?.value.trim() || null,
      ativo: Boolean(root.querySelector('[data-integracao-ativo]')?.checked),
      observacoes: root.querySelector('[data-integracao-obs]')?.value.trim() || null,
      updated_at: new Date().toISOString()
    };

    try {
      let result;
      if (id) result = await supabase.from('ti_integracoes').update(payload).eq('id', id).select('*').single();
      else result = await supabase.from('ti_integracoes').insert(payload).select('*').single();
      if (result.error) throw result.error;
      state.selectedId = result.data.id;
      toast('Integração salva.');
      await loadData(root, opts);
    } catch (err) {
      console.error('[TI] saveIntegration:', err);
      toast(err.message || 'Erro ao salvar integração.', 'error');
    }
  }

  async function saveSecret(root, opts = {}) {
    const supabase = getSupabase(opts);
    const current = selectedIntegration();
    if (!current) return toast('Selecione uma integração antes de salvar token.', 'error');
    const chave = normalizeCode(root.querySelector('[data-secret-key]')?.value || '');
    const valor = root.querySelector('[data-secret-value]')?.value || '';
    const descricao = root.querySelector('[data-secret-desc]')?.value.trim() || null;
    const sensivel = Boolean(root.querySelector('[data-secret-sensitive]')?.checked);
    if (!chave) return toast('Informe o nome da chave/token.', 'error');
    if (!valor) return toast('Informe o valor do token/chave.', 'error');

    const payload = {
      integracao_id: current.id,
      chave,
      valor,
      descricao,
      sensivel,
      ativo: true,
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await supabase.from('ti_integracao_segredos').upsert(payload, { onConflict: 'integracao_id,chave' });
      if (error) throw error;
      root.querySelector('[data-secret-value]').value = '';
      root.querySelector('[data-secret-desc]').value = '';
      toast('Token/chave salvo.');
      await loadData(root, opts);
    } catch (err) {
      console.error('[TI] saveSecret:', err);
      toast(err.message || 'Erro ao salvar token.', 'error');
    }
  }

  async function removeSecret(root, opts = {}, id) {
    const supabase = getSupabase(opts);
    if (!id) return;
    if (!confirm('Remover este token/chave?')) return;
    try {
      const { error } = await supabase.from('ti_integracao_segredos').delete().eq('id', id);
      if (error) throw error;
      toast('Token removido.');
      await loadData(root, opts);
    } catch (err) {
      console.error('[TI] removeSecret:', err);
      toast(err.message || 'Erro ao remover token.', 'error');
    }
  }

  async function applyTemplate(root, opts = {}, tpl) {
    root.querySelector('[data-integracao-id]').value = '';
    root.querySelector('[data-integracao-nome]').value = tpl.nome;
    root.querySelector('[data-integracao-codigo]').value = tpl.codigo;
    root.querySelector('[data-integracao-categoria]').value = tpl.categoria;
    root.querySelector('[data-integracao-ambiente]').value = tpl.ambiente;
    root.querySelector('[data-integracao-base]').value = tpl.base_url;
    root.querySelector('[data-integracao-auth]').value = tpl.auth_url;
    root.querySelector('[data-integracao-ativo]').checked = true;
    root.querySelector('[data-integracao-obs]').value = `Template criado para ${tpl.nome}. Cadastre os tokens necessários: ${tpl.segredos.join(', ')}.`;
    state.selectedId = null;
    state.suggestedSecrets = Array.isArray(tpl.segredos) ? tpl.segredos.slice() : [];
    renderLists(root, opts);
    renderSecretSuggestions(root);
    toast('Template preenchido. Clique em Salvar integração.');
  }

  async function testIntegration(root, opts = {}) {
    const current = selectedIntegration();
    if (!current) return toast('Selecione uma integração para testar.', 'error');
    const supabase = getSupabase(opts);
    try {
      const { data, error } = await supabase.functions.invoke('ti-testar-integracao', { body: { integracao_id: current.id } });
      if (error) throw error;
      toast(data?.message || 'Teste solicitado.');
    } catch (err) {
      console.warn('[TI] testIntegration:', err);
      toast('A função ti-testar-integracao ainda não foi publicada. A configuração foi salva no banco.', 'error');
    }
  }

  function renderIntegracoes(container, opts = {}) {
    container.innerHTML = `${styles()}
      <section class="ti-shell">
        <div class="ti-header">
          <div class="ti-kicker">TI · Segurança · APIs</div>
          <h1 class="ti-title">Integrações</h1>
          <p class="ti-subtitle">Gerencie endpoints, tokens e chaves usados por Edge Functions, Workers e automações. Assim você troca credenciais pelo painel sem editar arquivos do projeto.</p>
        </div>
        <div class="ti-card">
          <div class="ti-tabs"><button class="ti-tab" type="button">Integrações</button></div>
          <div class="ti-body">
            ${!isMaster(opts) ? '<div class="ti-note"><strong>Atenção:</strong> esta tela deve ficar liberada apenas para usuários MASTER/TI. Se você estiver vendo sem ser master, revise as permissões do módulo.</div>' : ''}
            <div class="ti-grid">
              <div class="ti-panel">
                <h3>Integrações cadastradas</h3>
                <div class="ti-field"><label>Buscar</label><input class="ti-input" data-ti-search placeholder="Buscar por nome, código, categoria ou URL"></div>
                <p class="ti-subtitle" style="margin:0 0 12px" data-ti-total>0 integração(ões)</p>
                <div class="ti-list" data-ti-list></div>
              </div>
              <div class="ti-panel">
                <h3>Configuração</h3>
                <div class="ti-template-grid">
                  ${TEMPLATES.map((tpl, index) => `<button class="ti-btn ti-btn-soft ti-template" type="button" data-template="${index}">${escapeHtml(tpl.nome)}</button>`).join('')}<button class="ti-btn ti-btn-soft ti-template" type="button" data-custom-api>+ Adicionar API personalizada</button>
                </div>
                <input type="hidden" data-integracao-id>
                <div class="ti-row">
                  <div class="ti-field"><label>Nome</label><input class="ti-input" data-integracao-nome placeholder="Ex.: DETRAN PR · Frotista"></div>
                  <div class="ti-field"><label>Código</label><input class="ti-input" data-integracao-codigo placeholder="DETRAN_PR_FROTISTA"></div>
                </div>
                <div class="ti-row">
                  <div class="ti-field"><label>Categoria</label><input class="ti-input" data-integracao-categoria placeholder="FROTAS"></div>
                  <div class="ti-field"><label>Ambiente</label><select class="ti-select" data-integracao-ambiente><option value="PRODUCAO">Produção</option><option value="HOMOLOGACAO">Homologação</option><option value="TESTE">Teste</option></select></div>
                </div>
                <div class="ti-field"><label>URL base</label><input class="ti-input" data-integracao-base placeholder="https://api.exemplo.com.br"></div>
                <div class="ti-field"><label>URL de autenticação</label><input class="ti-input" data-integracao-auth placeholder="https://auth.exemplo.com.br/token"></div>
                <div class="ti-field"><label>Observações</label><textarea class="ti-input ti-textarea" data-integracao-obs rows="3" placeholder="Regras de uso, endpoints, expiração, responsável..."></textarea></div>
                <label style="display:flex;gap:8px;align-items:center;color:#cbd5e1;font-weight:800;margin-bottom:10px"><input type="checkbox" data-integracao-ativo checked> Integração ativa</label>
                <div class="ti-actions"><button class="ti-btn ti-btn-primary" type="button" data-save-integracao>Salvar integração</button><button class="ti-btn ti-btn-soft" type="button" data-new-integracao>Nova</button><button class="ti-btn ti-btn-soft" type="button" data-test-integracao>Testar</button></div>
                <div class="ti-note"><strong>Segurança:</strong> o frontend salva a configuração, mas as chamadas sensíveis devem ser feitas por Edge Function/Worker. Evite usar tokens diretamente em módulos públicos do navegador.</div>
                <div class="ti-divider" style="height:1px;background:rgba(148,163,184,.14);margin:18px 0"></div>
                <div class="ti-quick-add" data-secret-suggestions style="display:none"></div>
                <h3>Tokens / Chaves</h3>
                <div class="ti-row">
                  <div class="ti-field"><label>Chave</label><input class="ti-input" data-secret-key placeholder="DETRAN_CLIENT_SECRET"></div>
                  <div class="ti-field"><label>Valor</label><input class="ti-input" data-secret-value type="password" placeholder="Cole o token/chave aqui"></div>
                </div>
                <div class="ti-field"><label>Descrição</label><input class="ti-input" data-secret-desc placeholder="Ex.: token da empresa 04 / client secret / API key"></div>
                <label style="display:flex;gap:8px;align-items:center;color:#cbd5e1;font-weight:800;margin-bottom:10px"><input type="checkbox" data-secret-sensitive checked> Valor sensível / mascarar na listagem</label>
                <div class="ti-actions"><button class="ti-btn ti-btn-primary" type="button" data-save-secret>Salvar token/chave</button></div>
                <div style="margin-top:14px" data-secret-list></div>
              </div>
            </div>
          </div>
        </div>
      </section>`;

    container.querySelector('[data-ti-search]')?.addEventListener('input', (ev) => { state.search = ev.target.value || ''; renderLists(container, opts); });
    container.querySelector('[data-save-integracao]')?.addEventListener('click', () => saveIntegration(container, opts));
    container.querySelector('[data-new-integracao]')?.addEventListener('click', () => clearForm(container));
    container.querySelector('[data-custom-api]')?.addEventListener('click', () => prepareCustomApi(container, opts));
    container.querySelector('[data-save-secret]')?.addEventListener('click', () => saveSecret(container, opts));
    container.querySelector('[data-test-integracao]')?.addEventListener('click', () => testIntegration(container, opts));
    container.querySelectorAll('[data-template]').forEach((btn) => btn.addEventListener('click', () => applyTemplate(container, opts, TEMPLATES[Number(btn.getAttribute('data-template'))])));
    loadData(container, opts);
  }

  window[MODULE_NAME] = window[MODULE_NAME] || {};
  window[MODULE_NAME].openIntegracoes = renderIntegracoes;
  window.ADM_MODULES = window.ADM_MODULES || {};
  window.ADM_MODULES.ti = { mount: renderIntegracoes };
})();
