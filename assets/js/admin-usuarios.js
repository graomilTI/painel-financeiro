import { initProtectedPage } from './pageInit.js';
import { getSession } from './auth.js';
import { MENU_CONFIG } from './menuConfig.js';

const SUPERVISOES_DISPONIVEIS = [
  "TOCANTINS - Geral",
  "PARA - Sul",
  "GOIAS 1 - Rio Verde",
  "RIO GRANDE DO SUL - Cruz Alta",
  "Londrina",
  "LOG1000",
  "RIO GRANDE DO SUL - Santa Rosa",
  "MINAS GERAIS - Geral",
  "GERAL - Administrativo",
  "CASCAVEL - Geral",
  "MATO GROSSO MT2 - Sul",
  "MATO GROSSO MT3 - Confresa",
  "MATO GROSSO MT3 - Querencia",
  "SP - Cândido Mota",
  "PARA - Norte",
  "MATO GROSSO MT1 - Lucas do Rio Verde/Nova Mutum",
  "MATO GROSSO MT1 - Sinop",
  "MATO GROSSO MT4 - Geral",
  "BAHIA - Geral",
  "Maringa e Terminais",
  "MATO GROSSO DO SUL - Geral",
  "RIO GRANDE DO SUL - Palmeira das Missões",
  "PONTA GROSSA - Geral",
  "GOIAS 4 - Cristalina",
  "GERAL - Operacional",
  "SP - Avaré",
  "Geral - Frota",
  "MATO GROSSO MT2 - Campo Verde",
  "CASCAVEL - Campo Mourão",
  "RIO GRANDE DO SUL - Norte",
  "RIO GRANDE DO SUL - Geral",
  "Geral - Estoque",
  "Geral - Logistica",
  "MATO GROSSO MT2 - Leste",
  "MATO GROSSO MT1 - Sorriso",
  "SP - Araçatuba",
  "GOIAS 2 - Jataí",
  "Geral - Troca de Notas",
  "MARANHAO - Geral",
  "GOIAS 3 - Pontalina",
  "MATO GROSSO MT1 - Geral",
  "AGROTRADER"
];


const MODULE_GROUP_FALLBACKS = [
  { group: 'GESTOR', terms: ['app gestor', 'gestor', 'programacao', 'programação', 'os gestor', 'o.s gestor'] },
  { group: 'CONFERÊNCIA', terms: ['conferencia', 'conferência', 'conferencias', 'conferências', 'distribuir o.s', 'distribuir os', 'irregularidades', 'uber'] },
  { group: 'COMPRAS', terms: ['compras adm', 'compras_adm', 'painel de compras', 'fornecedores', 'pedidos'] },
  { group: 'GESTOR', terms: ['compras', 'compras gestor'] },
  { group: 'HOSPEDAGEM', terms: ['hospedagem', 'hotel', 'hoteis', 'hotéis', 'alojamentos', 'reservas', 'checkouts'] },
  { group: 'FROTAS', terms: ['frotas', 'excesso de velocidade', 'veiculos', 'veículos', 'multas', 'historico frotas', 'histórico frotas'] },
  { group: 'FINANCEIRO', terms: ['financeiro', 'fluxo de caixa', 'pagamentos', 'adiantamentos', 'alimentacao', 'alimentação'] },
  { group: 'LOGÍSTICA', terms: ['logistica', 'logística', 'finalizacao de o.s', 'finalização de o.s', 'finalizacao os', 'finalização os'] },
  { group: 'DIRETORIA', terms: ['diretoria', 'dre', 'metas', 'desempenho'] },
  { group: 'RELATÓRIOS', terms: ['importar relatorios', 'importar relatórios', 'relatorios', 'relatórios', 'resultado diario', 'resultado diário', 'producao', 'produção'] },
  { group: 'RECURSOS HUMANOS', terms: ['contatos e cadastros', 'contatos', 'ferias', 'férias', 'atestados', 'classificadores'] },
  { group: 'TI', terms: ['integracoes', 'integrações', 'ti'] },
  { group: 'PATRIMÔNIOS', terms: ['patrimonio', 'patrimônio', 'patrimonios', 'patrimônios'] },
  { group: 'AUDITORIA', terms: ['auditoria', 'logs'] },
  { group: 'OPERACIONAL', terms: ['operacional', 'mapa de direcionamento'] },
];

function normalizeModuleText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getModuleDisplayName(mod) {
  return String(mod?.nome || mod?.label || mod?.codigo || mod?.code || '-').trim();
}

function getMenuGroupOrder() {
  const groups = (Array.isArray(MENU_CONFIG) ? MENU_CONFIG : []).map((section) => section.grupo);
  return [...groups, 'TI', 'OUTROS'].filter((item, index, arr) => item && arr.indexOf(item) === index);
}

function getModuleGroupInfo(mod) {
  const code = normalizeModuleText(mod?.codigo || mod?.code || '');
  const name = normalizeModuleText(getModuleDisplayName(mod));
  const haystack = [code, name].filter(Boolean).join(' | ');

  for (const section of Array.isArray(MENU_CONFIG) ? MENU_CONFIG : []) {
    for (const item of section.itens || []) {
      const candidates = [item.code, item.label, item.path, ...(item.aliases || [])]
        .map(normalizeModuleText)
        .filter(Boolean);
      if (candidates.some((candidate) => candidate === code || candidate === name)) {
        return { group: section.grupo, order: candidates.indexOf(name) >= 0 ? candidates.indexOf(name) : 0 };
      }
    }
  }

  for (const rule of MODULE_GROUP_FALLBACKS) {
    const terms = (rule.terms || []).map(normalizeModuleText).filter(Boolean);
    if (terms.some((term) => haystack.includes(term))) {
      return { group: rule.group, order: 999 };
    }
  }

  return { group: 'OUTROS', order: 9999 };
}

function compareModulesByGroup(a, b) {
  const order = getMenuGroupOrder();
  const ga = getModuleGroupInfo(a);
  const gb = getModuleGroupInfo(b);
  const groupDiff = (order.indexOf(ga.group) === -1 ? 999 : order.indexOf(ga.group)) - (order.indexOf(gb.group) === -1 ? 999 : order.indexOf(gb.group));
  if (groupDiff !== 0) return groupDiff;
  const itemDiff = ga.order - gb.order;
  if (itemDiff !== 0) return itemDiff;
  return getModuleDisplayName(a).localeCompare(getModuleDisplayName(b), 'pt-BR');
}

function groupModules(modules = []) {
  const order = getMenuGroupOrder();
  const map = new Map();
  modules.forEach((mod) => {
    const info = getModuleGroupInfo(mod);
    if (!map.has(info.group)) map.set(info.group, []);
    map.get(info.group).push(mod);
  });
  return [...map.entries()]
    .map(([group, items]) => [group, items.sort(compareModulesByGroup)])
    .sort(([a], [b]) => {
      const ia = order.indexOf(a) === -1 ? 999 : order.indexOf(a);
      const ib = order.indexOf(b) === -1 ? 999 : order.indexOf(b);
      if (ia !== ib) return ia - ib;
      return a.localeCompare(b, 'pt-BR');
    });
}

const state = {
  profiles: [],
  modules: [],
  users: [],
  filteredUsers: [],
  filters: {
    q: '',
    perfil: '',
    status: '',
  },
  loading: false,
  modalMode: 'create',
  editingUser: null,
};

function ensureCorePermissionModules() {
  const modules = Array.isArray(state.modules) ? state.modules : [];

  // Importante: não criar módulos fake no frontend.
  // A tabela app_usuario_modulos possui FK para app_modulos.id.
  // Se o painel enviar IDs inventados, o Supabase retorna erro de foreign key.
  state.modules = modules
    .filter((mod) => mod && mod.id)
    .sort(compareModulesByGroup);
}


function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function apiFetch(path, options = {}) {
  const session = await getSession();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Accept')) headers.set('Accept', 'application/json');
  if (session?.access_token) headers.set('Authorization', `Bearer ${session.access_token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const response = await fetch(path, { ...options, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }

  if (!response.ok || data?.ok === false) {
    throw new Error(data?.error || data?.message || `Erro ${response.status}`);
  }
  return data;
}

function ensureStyles() {
  if (document.getElementById('adminUsuariosStyles')) return;
  const style = document.createElement('style');
  style.id = 'adminUsuariosStyles';
  style.textContent = `
    .au-shell{display:grid;gap:18px}
    .au-hero{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;flex-wrap:wrap}
    .au-hero-copy h3{margin:0 0 6px;font-size:26px}
    .au-hero-copy p{margin:0;color:#6b7280}
    .au-actions{display:flex;gap:10px;flex-wrap:wrap}
    .au-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .au-kpi{background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.92));border:1px solid rgba(51,65,85,.8);border-radius:20px;padding:16px 18px;box-shadow:0 12px 28px rgba(2,6,23,.28)}
    .au-kpi-label{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#6b7280}
    .au-kpi-value{margin-top:10px;font-size:28px;font-weight:800;color:#f8fafc}
    .au-panel{background:linear-gradient(180deg,rgba(15,23,42,.96),rgba(2,6,23,.92));border:1px solid rgba(51,65,85,.8);border-radius:24px;box-shadow:0 18px 34px rgba(2,6,23,.26)}
    .au-panel-head{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:20px 20px 0;flex-wrap:wrap}
    .au-panel-title{display:flex;flex-direction:column;gap:4px}
    .au-panel-title h3{margin:0;font-size:20px}
    .au-panel-title p{margin:0;color:#6b7280;font-size:14px}
    .au-filter-grid{display:grid;grid-template-columns:2fr 1fr 1fr auto;gap:12px;padding:20px}
    .au-field{display:flex;flex-direction:column;gap:6px}
    .au-field label{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280}
    .au-input,.au-select,.au-textarea{width:100%;box-sizing:border-box;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#e2e2f0;padding:12px 14px;outline:none;transition:.18s ease}
    .au-textarea{min-height:92px;resize:vertical}
    .au-input:focus,.au-select:focus,.au-textarea:focus{border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.18)}
    .au-btn{border:1px solid transparent;border-radius:14px;padding:12px 16px;font-weight:700;cursor:pointer;transition:.18s ease}
    .au-btn:hover{transform:translateY(-1px)}
    .au-btn-primary{background:#166534;color:#fff}
    .au-btn-secondary{background:#0d0d18;border-color:rgba(255,255,255,0.08);color:#e2e2f0}
    .au-btn-danger{background:#7f1d1d;color:#fff}
    .au-btn-ghost{background:transparent;border-color:rgba(255,255,255,0.08);color:#cbd5e1}
    .au-btn-inline{padding:9px 12px;border-radius:12px;font-size:13px}
    .au-table-wrap{padding:0 20px 20px;overflow:auto}
    .au-table{width:100%;border-collapse:collapse;min-width:1040px}
    .au-table th,.au-table td{padding:14px 12px;border-bottom:1px solid rgba(51,65,85,.45);vertical-align:top;text-align:left}
    .au-table th{font-size:12px;text-transform:uppercase;letter-spacing:.05em;color:#6b7280;background:rgba(15,23,42,.9);position:sticky;top:0}
    .au-table tbody tr:hover{background:rgba(15,23,42,.56)}
    .au-name{display:flex;flex-direction:column;gap:4px}
    .au-name strong{font-size:14px;color:#f8fafc}
    .au-sub{font-size:12px;color:#6b7280}
    .au-badges,.au-actions-row,.au-check-grid,.au-chip-wrap{display:flex;flex-wrap:wrap;gap:8px}
    .au-chip{display:inline-flex;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid rgba(51,65,85,.8);background:#10101e;color:#e2e2f0;font-size:12px}
    .au-chip-soft{background:rgba(22,101,52,.16);border-color:rgba(22,163,74,.3)}
    .au-chip-neutral{background:rgba(30,41,59,.72)}
    .au-chip-danger{background:rgba(127,29,29,.18);border-color:rgba(239,68,68,.28)}
    .au-status{font-weight:700;text-transform:capitalize}
    .au-feedback{display:none;margin:0 20px 20px;padding:12px 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18}
    .au-feedback.is-visible{display:block}
    .au-feedback.is-error{border-color:rgba(239,68,68,.35);background:rgba(127,29,29,.12)}
    .au-feedback.is-success{border-color:rgba(34,197,94,.35);background:rgba(22,101,52,.12)}
    .au-empty{padding:26px 20px;color:#6b7280}
    .au-overlay{position:fixed;inset:0;background:rgba(2,6,23,.72);display:none;align-items:center;justify-content:center;padding:20px;z-index:99999}
    .au-overlay.is-open{display:flex}
    .au-modal{width:min(1080px,100%);max-height:92vh;overflow:auto;background:#020617;border:1px solid rgba(51,65,85,.85);border-radius:26px;box-shadow:0 28px 60px rgba(0,0,0,.45)}
    .au-modal-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;padding:22px 22px 0}
    .au-modal-head h3{margin:0;font-size:24px}
    .au-modal-head p{margin:6px 0 0;color:#6b7280}
    .au-close{width:42px;height:42px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#fff;font-size:20px;cursor:pointer}
    .au-modal-body{padding:22px;display:grid;grid-template-columns:1.3fr .7fr;gap:20px}
    .au-card{border:1px solid rgba(51,65,85,.72);border-radius:20px;padding:18px;background:#0d0d18}
    .au-card h4{margin:0 0 14px;font-size:16px}
    .au-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
    .au-form-grid .full{grid-column:1 / -1}
    .au-search-box{position:relative}
    .au-search-results{position:absolute;left:0;right:0;top:calc(100% + 6px);background:#020617;border:1px solid rgba(51,65,85,.92);border-radius:18px;box-shadow:0 20px 40px rgba(2,6,23,.4);overflow:hidden;z-index:5;display:none;max-height:260px;overflow:auto}
    .au-search-results.is-open{display:block}
    .au-result{padding:12px 14px;border-bottom:1px solid rgba(51,65,85,.45);cursor:pointer}
    .au-result:last-child{border-bottom:none}
    .au-result:hover{background:rgba(15,23,42,.9)}
    .au-result strong{display:block;font-size:14px;color:#f8fafc}
    .au-result span{display:block;font-size:12px;color:#6b7280;margin-top:3px}
    .au-selected-colab{margin-top:10px;padding:12px;border-radius:16px;background:rgba(22,101,52,.14);border:1px solid rgba(34,197,94,.25)}
    .au-modal-actions{display:flex;justify-content:flex-end;gap:10px;padding:0 22px 22px}
    .au-loading{opacity:.7;pointer-events:none}
    .au-section-note{font-size:12px;color:#6b7280;margin-top:-4px;margin-bottom:12px}
    .au-switch{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:#cbd5e1}
    .au-check-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    .au-check-grid .au-switch{padding:10px 12px;border:1px solid rgba(51,65,85,.72);border-radius:14px;background:#020617}
    .au-modules-groups{display:flex;flex-direction:column;gap:12px}
    .au-module-group{border:1px solid rgba(51,65,85,.72);border-radius:18px;background:rgba(2,6,23,.55);overflow:hidden}
    .au-module-group-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;background:rgba(15,23,42,.9);border-bottom:1px solid rgba(51,65,85,.55)}
    .au-module-group-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#93c5fd}
    .au-module-group-count{font-size:11px;color:#6b7280}
    .au-module-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:10px}
    .au-module-grid .au-switch{padding:10px 11px;border:1px solid rgba(51,65,85,.72);border-radius:14px;background:#020617;min-height:40px}
    .au-module-grid .au-switch span{line-height:1.15}
    .au-section-tools{display:flex;justify-content:flex-end;margin:-4px 0 10px}
    .au-link-btn{background:none;border:none;color:#86efac;font-weight:700;cursor:pointer;padding:0;font-size:12px}
    @media (max-width: 1100px){.au-grid,.au-filter-grid,.au-modal-body,.au-form-grid,.au-module-grid{grid-template-columns:1fr}.au-modal-body{display:block}.au-card + .au-card{margin-top:18px}}
  `;
  document.head.appendChild(style);
}

function renderSkeleton(content) {
  content.innerHTML = `
    <section class="au-shell">
      <section class="au-hero">
        <div class="au-hero-copy">
          <h3>Usuários e acessos</h3>
          <p>Gerencie perfis, módulos liberados, supervisões e redefinição de senha.</p>
        </div>
      </section>
      <section class="au-grid">
        <article class="au-kpi"><div class="au-kpi-label">Usuários</div><div class="au-kpi-value">--</div></article>
        <article class="au-kpi"><div class="au-kpi-label">Ativos</div><div class="au-kpi-value">--</div></article>
        <article class="au-kpi"><div class="au-kpi-label">Perfis</div><div class="au-kpi-value">--</div></article>
        <article class="au-kpi"><div class="au-kpi-label">Módulos</div><div class="au-kpi-value">--</div></article>
      </section>
      <section class="au-panel"><div class="au-empty">Carregando usuários...</div></section>
    </section>
  `;
}

function applyFilters() {
  const q = state.filters.q.trim().toLowerCase();
  const perfil = state.filters.perfil.trim().toLowerCase();
  const status = state.filters.status.trim().toLowerCase();

  state.filteredUsers = state.users.filter((user) => {
    const matchQ = !q || [user.nome, user.email, user.empresa, user.coordenacao, user.supervisao, user.setor]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(q));
    const matchPerfil = !perfil || String(user.perfil_codigo || '').toLowerCase() === perfil;
    const matchStatus = !status || String(user.status || '').toLowerCase() === status;
    return matchQ && matchPerfil && matchStatus;
  });
}

function badgeStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'ativo') return 'au-chip au-chip-soft';
  return 'au-chip au-chip-danger';
}

function renderPage(content) {
  applyFilters();

  const total = state.users.length;
  const active = state.users.filter((item) => String(item.status || '').toLowerCase() === 'ativo').length;
  const inactive = total - active;

  content.innerHTML = `
    <section class="au-shell ${state.loading ? 'au-loading' : ''}">
      <section class="au-hero">
        <div class="au-hero-copy">
          <h3>Usuários e acessos</h3>
          <p>Controle centralizado de usuários, permissões por módulo, supervisões liberadas e senhas temporárias.</p>
        </div>
        <div class="au-actions">
          <button class="au-btn au-btn-secondary" id="auRefreshBtn" type="button">Atualizar</button>
          <button class="au-btn au-btn-primary" id="auCreateBtn" type="button">Novo usuário</button>
        </div>
      </section>

      <section class="au-grid">
        <article class="au-kpi"><div class="au-kpi-label">Usuários</div><div class="au-kpi-value">${total}</div></article>
        <article class="au-kpi"><div class="au-kpi-label">Ativos</div><div class="au-kpi-value">${active}</div></article>
        <article class="au-kpi"><div class="au-kpi-label">Inativos</div><div class="au-kpi-value">${inactive}</div></article>
        <article class="au-kpi"><div class="au-kpi-label">Perfis / módulos</div><div class="au-kpi-value">${state.profiles.length} / ${state.modules.length}</div></article>
      </section>

      <section class="au-panel">
        <div class="au-panel-head">
          <div class="au-panel-title">
            <h3>Base de acessos</h3>
            <p>${state.filteredUsers.length} registro(s) exibido(s)</p>
          </div>
        </div>

        <div class="au-filter-grid">
          <div class="au-field">
            <label for="auFiltroBusca">Buscar</label>
            <input class="au-input" id="auFiltroBusca" type="text" placeholder="Nome, e-mail, coordenação, supervisão ou setor" value="${escapeHtml(state.filters.q)}">
          </div>
          <div class="au-field">
            <label for="auFiltroPerfil">Perfil</label>
            <select class="au-select" id="auFiltroPerfil">
              <option value="">Todos</option>
              ${state.profiles.map((perfil) => `<option value="${escapeHtml(perfil.codigo)}" ${String(state.filters.perfil) === String(perfil.codigo) ? 'selected' : ''}>${escapeHtml(perfil.nome || perfil.codigo)}</option>`).join('')}
            </select>
          </div>
          <div class="au-field">
            <label for="auFiltroStatus">Status</label>
            <select class="au-select" id="auFiltroStatus">
              <option value="">Todos</option>
              <option value="ativo" ${state.filters.status === 'ativo' ? 'selected' : ''}>Ativo</option>
              <option value="inativo" ${state.filters.status === 'inativo' ? 'selected' : ''}>Inativo</option>
            </select>
          </div>
          <div class="au-field" style="justify-content:flex-end">
            <label>&nbsp;</label>
            <button class="au-btn au-btn-ghost" id="auClearBtn" type="button">Limpar filtros</button>
          </div>
        </div>

        <div class="au-feedback" id="auFeedback"></div>

        <div class="au-table-wrap">
          ${state.filteredUsers.length ? `
            <table class="au-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Perfil</th>
                  <th>Setor</th>
                  <th>Supervisões</th>
                  <th>Módulos</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${state.filteredUsers.map((user) => `
                  <tr>
                    <td>
                      <div class="au-name">
                        <strong>${escapeHtml(user.nome || '-')}</strong>
                        <span class="au-sub">${escapeHtml(user.email || '-')}</span>
                        <span class="au-sub">${escapeHtml(user.empresa || '-')} • ${escapeHtml(user.coordenacao || 'Sem coordenação')}</span>
                      </div>
                    </td>
                    <td>
                      <div class="au-badges">
                        <span class="au-chip au-chip-neutral">${escapeHtml(user.perfil_nome || user.perfil_codigo || '-')}</span>
                      </div>
                    </td>
                    <td>
                      <div class="au-name">
                        <strong>${escapeHtml(user.setor || '-')}</strong>
                        <span class="au-sub">Último login: ${escapeHtml(formatDateTime(user.ultimo_login_em) || '—')}</span>
                      </div>
                    </td>
                    <td>
                      <div class="au-chip-wrap">
                        ${Array.isArray(user.supervisoes) && user.supervisoes.length
                          ? user.supervisoes.map((sup) => `<span class="au-chip">${escapeHtml(sup)}</span>`).join('')
                          : '<span class="au-sub">Sem supervisão definida</span>'}
                      </div>
                    </td>
                    <td>
                      <div class="au-chip-wrap">
                        ${Array.isArray(user.modulos) && user.modulos.length
                          ? user.modulos.slice(0, 4).map((mod) => `<span class="au-chip">${escapeHtml(mod.nome || mod.codigo || '-')}</span>`).join('') + (user.modulos.length > 4 ? `<span class="au-chip au-chip-neutral">+${user.modulos.length - 4}</span>` : '')
                          : '<span class="au-sub">Sem módulos específicos</span>'}
                      </div>
                    </td>
                    <td><span class="${badgeStatus(user.status)} au-status">${escapeHtml(user.status || '-')}</span></td>
                    <td>
                      <div class="au-actions-row">
                        <button class="au-btn au-btn-inline au-btn-secondary" type="button" data-action="edit" data-id="${escapeHtml(user.id)}">Editar</button>
                        <button class="au-btn au-btn-inline au-btn-ghost" type="button" data-action="password" data-id="${escapeHtml(user.id)}">Redefinir senha</button>
                        <button class="au-btn au-btn-inline ${String(user.status || '').toLowerCase() === 'ativo' ? 'au-btn-danger' : 'au-btn-primary'}" type="button" data-action="toggle" data-id="${escapeHtml(user.id)}">${String(user.status || '').toLowerCase() === 'ativo' ? 'Inativar' : 'Ativar'}</button>
                      </div>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          ` : `<div class="au-empty">Nenhum usuário encontrado com os filtros atuais.</div>`}
        </div>
      </section>
    </section>
  `;

  bindPageEvents(content);
}

function getUserById(id) {
  return state.users.find((item) => String(item.id) === String(id)) || null;
}

function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(date);
}

function setFeedback(message, type = 'success') {
  const box = document.getElementById('auFeedback');
  if (!box) return;
  if (!message) {
    box.className = 'au-feedback';
    box.textContent = '';
    return;
  }
  box.className = `au-feedback is-visible ${type === 'error' ? 'is-error' : 'is-success'}`;
  box.textContent = message;
}

function bindPageEvents(content) {
  content.querySelector('#auRefreshBtn')?.addEventListener('click', () => loadAll(content, true));
  content.querySelector('#auCreateBtn')?.addEventListener('click', () => openUserModal('create'));

  content.querySelector('#auFiltroBusca')?.addEventListener('input', (event) => {
    state.filters.q = event.target.value;
    renderPage(content);
  });
  content.querySelector('#auFiltroPerfil')?.addEventListener('change', (event) => {
    state.filters.perfil = event.target.value;
    renderPage(content);
  });
  content.querySelector('#auFiltroStatus')?.addEventListener('change', (event) => {
    state.filters.status = event.target.value;
    renderPage(content);
  });
  content.querySelector('#auClearBtn')?.addEventListener('click', () => {
    state.filters = { q: '', perfil: '', status: '' };
    renderPage(content);
  });

  content.querySelectorAll('[data-action="edit"]').forEach((btn) => {
    btn.addEventListener('click', () => openUserModal('edit', getUserById(btn.dataset.id)));
  });
  content.querySelectorAll('[data-action="password"]').forEach((btn) => {
    btn.addEventListener('click', () => handleResetPassword(btn.dataset.id, content));
  });
  content.querySelectorAll('[data-action="toggle"]').forEach((btn) => {
    btn.addEventListener('click', () => handleToggleStatus(btn.dataset.id, content));
  });
}

function ensureModal() {
  let overlay = document.getElementById('auModalOverlay');

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auModalOverlay';
    overlay.className = 'au-overlay';
    overlay.innerHTML = `
      <div class="au-modal" role="dialog" aria-modal="true" aria-labelledby="auModalTitle">
        <div class="au-modal-head">
          <div>
            <h3 id="auModalTitle">Usuário</h3>
            <p id="auModalSubtitle">Gerencie acessos e permissões.</p>
          </div>
          <button class="au-close" type="button" id="auModalClose">×</button>
        </div>
        <div class="au-modal-body">
          <section class="au-card">
            <h4>Dados do usuário</h4>
            <div class="au-form-grid">
              <div class="au-field full au-search-box" id="auCollaboratorWrap">
                <label for="auCollaboratorSearch">Vincular colaborador</label>
                <input class="au-input" id="auCollaboratorSearch" type="text" placeholder="Digite nome, CPF ou e-mail do colaborador">
                <div class="au-search-results" id="auCollaboratorResults"></div>
                <div id="auSelectedCollaborator"></div>
              </div>
              <div class="au-field">
                <label for="auNome">Nome</label>
                <input class="au-input" id="auNome" type="text" autocomplete="name">
              </div>
              <div class="au-field">
                <label for="auEmail">E-mail</label>
                <input class="au-input" id="auEmail" type="email" autocomplete="email">
              </div>
              <div class="au-field">
                <label for="auPerfil">Perfil</label>
                <select class="au-select" id="auPerfil"></select>
              </div>
              <div class="au-field">
                <label for="auStatus">Status</label>
                <select class="au-select" id="auStatus">
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
              <div class="au-field full">
                <label for="auSetor">Setor</label>
                <input class="au-input" id="auSetor" type="text" placeholder="Ex.: Diretoria, RH, Logística">
              </div>
              <div class="au-field full">
                <label>Supervisões liberadas</label>
                <div class="au-section-tools">
                  <button class="au-link-btn" type="button" id="auToggleAllSupervisoes">Marcar / desmarcar todas</button>
                </div>
                <div class="au-check-grid" id="auSupervisoesGrid"></div>
                <div class="au-section-note">Selecione em checkbox as supervisões que o usuário poderá acessar.</div>
              </div>
              <div class="au-field full">
                <label for="auPassword">Senha</label>
                <input class="au-input" id="auPassword" type="text" placeholder="Deixe em branco para gerar automaticamente">
              </div>
            </div>
          </section>
          <section class="au-card">
            <h4>Módulos liberados</h4>
            <div class="au-section-note">Selecione os módulos que esse usuário pode acessar individualmente.</div>
            <div class="au-section-tools">
              <button class="au-link-btn" type="button" id="auToggleAllModules">Marcar / desmarcar todos</button>
            </div>
            <div class="au-modules-groups" id="auModulesGrid"></div>
          </section>
        </div>
        <div class="au-feedback" id="auModalFeedback" style="margin:0 22px 18px"></div>
        <div class="au-modal-actions">
          <button class="au-btn au-btn-ghost" type="button" id="auModalCancel">Cancelar</button>
          <button class="au-btn au-btn-primary" type="button" id="auModalSave">Salvar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  if (overlay.dataset.bound !== '1') {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) closeModal();
    });
    overlay.querySelector('#auModalClose')?.addEventListener('click', closeModal);
    overlay.querySelector('#auModalCancel')?.addEventListener('click', closeModal);
    overlay.querySelector('#auModalSave')?.addEventListener('click', handleSaveModal);
    overlay.querySelector('#auToggleAllSupervisoes')?.addEventListener('click', () => {
      const boxes = [...overlay.querySelectorAll('#auSupervisoesGrid input[type="checkbox"]')];
      if (!boxes.length) return;
      const shouldCheck = boxes.some((box) => !box.checked);
      boxes.forEach((box) => {
        box.checked = shouldCheck;
      });
    });
    overlay.querySelector('#auToggleAllModules')?.addEventListener('click', () => {
      const boxes = [...overlay.querySelectorAll('#auModulesGrid input[type="checkbox"]')];
      if (!boxes.length) return;
      const shouldCheck = boxes.some((box) => !box.checked);
      boxes.forEach((box) => {
        box.checked = shouldCheck;
      });
    });
    bindCollaboratorSearch(overlay);
    overlay.dataset.bound = '1';
  }

  return overlay;
}

function closeModal() {
  const overlay = document.getElementById('auModalOverlay');
  if (!overlay) return;
  overlay.classList.remove('is-open');
}

function normalizeList(values = []) {
  return [...new Set((values || []).map((item) => String(item || '').trim()).filter(Boolean))];
}

function getAllSupervisoesOptions() {
  const set = new Set(SUPERVISOES_DISPONIVEIS);
  state.users.forEach((user) => {
    (Array.isArray(user.supervisoes) ? user.supervisoes : []).forEach((sup) => {
      const value = String(sup || '').trim();
      if (value) set.add(value);
    });
    const single = String(user.supervisao || '').trim();
    if (single) set.add(single);
  });
  return [...set].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function renderSupervisoes(selectedValues = [], extraValues = []) {
  const wrap = document.getElementById('auSupervisoesGrid');
  if (!wrap) return;
  const selectedSet = new Set(normalizeList(selectedValues));
  const options = normalizeList([...getAllSupervisoesOptions(), ...(extraValues || [])]);

  wrap.innerHTML = options.length
    ? options.map((sup) => `
      <label class="au-switch">
        <input type="checkbox" value="${escapeHtml(sup)}" ${selectedSet.has(String(sup)) ? 'checked' : ''}>
        <span>${escapeHtml(sup)}</span>
      </label>
    `).join('')
    : '<span class="au-sub">Nenhuma supervisão encontrada na base.</span>';
}

function getSelectedSupervisoes(overlay) {
  return normalizeList(
    [...overlay.querySelectorAll('#auSupervisoesGrid input[type="checkbox"]:checked')]
      .map((input) => input.value)
  );
}

function renderSelectedCollaborator(collaborator) {
  const wrap = document.getElementById('auSelectedCollaborator');
  if (!wrap) return;
  if (!collaborator) {
    wrap.innerHTML = '';
    return;
  }
  wrap.innerHTML = `
    <div class="au-selected-colab">
      <strong>${escapeHtml(collaborator.nome || '-')}</strong>
      <div class="au-sub">${escapeHtml(collaborator.email_empresa || '')}</div>
      <div class="au-sub">${escapeHtml(collaborator.empresa || '-')} • ${escapeHtml(collaborator.coordenacao || '-')} • ${escapeHtml(collaborator.supervisao || '-')}</div>
    </div>
  `;
}

function fillProfiles(select, selectedValue) {
  if (!select) return;
  select.innerHTML = state.profiles.map((perfil) => `<option value="${escapeHtml(perfil.codigo)}" ${String(selectedValue || '') === String(perfil.codigo || '') ? 'selected' : ''}>${escapeHtml(perfil.nome || perfil.codigo)}</option>`).join('');
}

function renderModules(selectedIds = []) {
  const wrap = document.getElementById('auModulesGrid');
  if (!wrap) return;
  const selectedSet = new Set((selectedIds || []).map((id) => String(id)));
  const grouped = groupModules(state.modules || []);

  wrap.innerHTML = grouped.length
    ? grouped.map(([group, items]) => `
      <section class="au-module-group">
        <div class="au-module-group-head">
          <span class="au-module-group-title">${escapeHtml(group)}</span>
          <span class="au-module-group-count">${items.length} módulo(s)</span>
        </div>
        <div class="au-module-grid">
          ${items.map((mod) => `
            <label class="au-switch">
              <input type="checkbox" value="${escapeHtml(mod.id)}" ${selectedSet.has(String(mod.id)) ? 'checked' : ''}>
              <span>${escapeHtml(getModuleDisplayName(mod))}</span>
            </label>
          `).join('')}
        </div>
      </section>
    `).join('')
    : '<span class="au-sub">Nenhum módulo ativo encontrado.</span>';
}

function openUserModal(mode, user = null) {
  state.modalMode = mode;
  state.editingUser = user || null;
  const overlay = ensureModal();
  const isEdit = mode === 'edit';
  const title = overlay.querySelector('#auModalTitle');
  const subtitle = overlay.querySelector('#auModalSubtitle');
  const saveBtn = overlay.querySelector('#auModalSave');
  const passwordLabel = overlay.querySelector('label[for="auPassword"]');
  const collaboratorWrap = overlay.querySelector('#auCollaboratorWrap');
  const collaboratorSearch = overlay.querySelector('#auCollaboratorSearch');

  title.textContent = isEdit ? 'Editar usuário' : 'Novo usuário';
  subtitle.textContent = isEdit ? 'Atualize perfil, setor, supervisões e módulos liberados.' : 'Crie um novo acesso vinculando um colaborador da base.';
  saveBtn.textContent = isEdit ? 'Salvar alterações' : 'Criar usuário';
  passwordLabel.textContent = isEdit ? 'Nova senha (opcional)' : 'Senha inicial (opcional)';

  fillProfiles(overlay.querySelector('#auPerfil'), user?.perfil_codigo || state.profiles[0]?.codigo || '');
  overlay.querySelector('#auNome').value = user?.nome || '';
  overlay.querySelector('#auEmail').value = user?.email || '';
  overlay.querySelector('#auStatus').value = String(user?.status || 'ativo').toLowerCase() === 'inativo' ? 'inativo' : 'ativo';
  overlay.querySelector('#auSetor').value = user?.setor || '';
  renderSupervisoes(user?.supervisoes || [], user?.supervisao ? [user.supervisao] : []);
  overlay.querySelector('#auPassword').value = '';
  overlay.querySelector('#auModalFeedback').className = 'au-feedback';
  overlay.querySelector('#auModalFeedback').textContent = '';
  overlay.dataset.collaboratorId = isEdit ? '' : '';
  collaboratorSearch.value = '';
  collaboratorSearch.disabled = isEdit;
  collaboratorWrap.style.display = isEdit ? 'none' : 'block';
  renderSelectedCollaborator(null);
  renderModules((user?.modulos || []).map((mod) => mod.id));

  overlay.classList.add('is-open');
}

let collaboratorSearchTimer = null;
function bindCollaboratorSearch(overlay) {
  const input = overlay.querySelector('#auCollaboratorSearch');
  const results = overlay.querySelector('#auCollaboratorResults');
  if (!input || input.dataset.bound === '1') return;
  input.dataset.bound = '1';

  input.addEventListener('input', () => {
    const term = input.value.trim();
    clearTimeout(collaboratorSearchTimer);
    if (term.length < 2) {
      results.classList.remove('is-open');
      results.innerHTML = '';
      return;
    }
    collaboratorSearchTimer = setTimeout(async () => {
      try {
        const data = await apiFetch(`/api/admin/users/collaborators?q=${encodeURIComponent(term)}`);
        const items = Array.isArray(data?.items) ? data.items : [];
        if (!items.length) {
          results.innerHTML = '<div class="au-result"><strong>Nenhum colaborador encontrado</strong></div>';
          results.classList.add('is-open');
          return;
        }
        results.innerHTML = items.map((item) => `
          <button class="au-result" type="button" data-id="${escapeHtml(item.id)}" data-nome="${escapeHtml(item.nome || '')}" data-email="${escapeHtml(item.email_empresa || '')}" data-empresa="${escapeHtml(item.empresa || '')}" data-coordenacao="${escapeHtml(item.coordenacao || '')}" data-supervisao="${escapeHtml(item.supervisao || '')}">
            <strong>${escapeHtml(item.nome || '-')}</strong>
            <span>${escapeHtml(item.email_empresa || 'Sem e-mail')} • ${escapeHtml(item.empresa || '-')}</span>
            <span>${escapeHtml(item.coordenacao || '-')} • ${escapeHtml(item.supervisao || '-')}</span>
          </button>
        `).join('');
        results.classList.add('is-open');
        results.querySelectorAll('.au-result').forEach((button) => {
          button.addEventListener('click', () => {
            const collaborator = {
              id: button.dataset.id,
              nome: button.dataset.nome,
              email_empresa: button.dataset.email,
              empresa: button.dataset.empresa,
              coordenacao: button.dataset.coordenacao,
              supervisao: button.dataset.supervisao,
            };
            overlay.dataset.collaboratorId = collaborator.id;
            overlay.querySelector('#auNome').value = collaborator.nome || '';
            if (collaborator.email_empresa) overlay.querySelector('#auEmail').value = collaborator.email_empresa;
            const currentSup = getSelectedSupervisoes(overlay);
            if (!currentSup.length && collaborator.supervisao) {
              renderSupervisoes([collaborator.supervisao], [collaborator.supervisao]);
            } else if (collaborator.supervisao) {
              renderSupervisoes(currentSup, [collaborator.supervisao]);
            }
            renderSelectedCollaborator(collaborator);
            results.classList.remove('is-open');
            results.innerHTML = '';
          });
        });
      } catch (error) {
        results.innerHTML = `<div class="au-result"><strong>${escapeHtml(error.message || 'Erro ao buscar colaborador')}</strong></div>`;
        results.classList.add('is-open');
      }
    }, 280);
  });
}

async function handleSaveModal() {
  const overlay = document.getElementById('auModalOverlay');
  const feedback = overlay.querySelector('#auModalFeedback');
  const isEdit = state.modalMode === 'edit';
  const validModuleIds = new Set((state.modules || []).map((mod) => String(mod.id)).filter(Boolean));
  const moduleIds = [...overlay.querySelectorAll('#auModulesGrid input[type="checkbox"]:checked')]
    .map((input) => String(input.value || '').trim())
    .filter((id) => id && validModuleIds.has(id));

  const payload = {
    nome: overlay.querySelector('#auNome').value.trim(),
    email: overlay.querySelector('#auEmail').value.trim(),
    perfil_codigo: overlay.querySelector('#auPerfil').value,
    status: overlay.querySelector('#auStatus').value,
    setor: overlay.querySelector('#auSetor').value.trim(),
    supervisoes: getSelectedSupervisoes(overlay),
    modulos: moduleIds,
  };
  const password = overlay.querySelector('#auPassword').value.trim();
  if (password) payload.password = password;
  if (!isEdit && overlay.dataset.collaboratorId) payload.colaborador_id = overlay.dataset.collaboratorId;
  if (isEdit) payload.id = state.editingUser?.id;

  if (!payload.nome) {
    feedback.className = 'au-feedback is-visible is-error';
    feedback.textContent = 'Informe o nome do usuário.';
    return;
  }
  if (!payload.email) {
    feedback.className = 'au-feedback is-visible is-error';
    feedback.textContent = 'Informe um e-mail válido.';
    return;
  }

  try {
    feedback.className = 'au-feedback is-visible';
    feedback.textContent = isEdit ? 'Salvando alterações...' : 'Criando usuário...';

    const data = await apiFetch(isEdit ? '/api/admin/users/update' : '/api/admin/users/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    closeModal();
    await loadAll(document.getElementById('pageContent'), true);
    const senhaMsg = data?.temp_password ? ` Senha temporária: ${data.temp_password}` : '';
    setFeedback((data?.message || (isEdit ? 'Usuário atualizado com sucesso.' : 'Usuário criado com sucesso.')) + senhaMsg, 'success');
  } catch (error) {
    feedback.className = 'au-feedback is-visible is-error';
    feedback.textContent = error.message || 'Erro ao salvar usuário.';
  }
}

async function handleToggleStatus(userId, content) {
  const user = getUserById(userId);
  if (!user) return;
  try {
    await apiFetch('/api/admin/users/toggle-status', {
      method: 'POST',
      body: JSON.stringify({ id: userId }),
    });
    await loadAll(content, true);
    setFeedback(`Status de ${user.nome || 'usuário'} atualizado com sucesso.`, 'success');
  } catch (error) {
    setFeedback(error.message || 'Erro ao alterar status.', 'error');
  }
}

async function handleResetPassword(userId, content) {
  const user = getUserById(userId);
  if (!user) return;
  try {
    const data = await apiFetch('/api/admin/users/reset-password', {
      method: 'POST',
      body: JSON.stringify({ id: userId }),
    });
    const msg = data?.temp_password
      ? `Senha temporária de ${user.nome || 'usuário'}: ${data.temp_password}`
      : (data?.message || 'Senha redefinida com sucesso.');
    setFeedback(msg, 'success');
    await loadAll(content, true);
  } catch (error) {
    setFeedback(error.message || 'Erro ao redefinir senha.', 'error');
  }
}

async function loadAll(content, keepFeedback = false) {
  try {
    state.loading = true;
    if (!keepFeedback) setFeedback('');
    renderPage(content);

    const [profilesRes, modulesRes, usersRes] = await Promise.all([
      apiFetch('/api/admin/users/profiles'),
      apiFetch('/api/admin/users/modulos'),
      apiFetch('/api/admin/users/list'),
    ]);

    state.profiles = Array.isArray(profilesRes?.items) ? profilesRes.items : [];
    state.modules = Array.isArray(modulesRes?.items) ? modulesRes.items : [];
    ensureCorePermissionModules();
    state.users = Array.isArray(usersRes?.items) ? usersRes.items : [];
  } catch (error) {
    setFeedback(error.message || 'Erro ao carregar usuários.', 'error');
  } finally {
    state.loading = false;
    renderPage(content);
  }
}

initProtectedPage('Usuários e acessos', async (content, userContext) => {
  ensureStyles();

  if (!userContext?.user?.is_master) {
    content.innerHTML = `
      <section class="au-panel">
        <div class="au-empty">Acesso restrito ao perfil master.</div>
      </section>
    `;
    return;
  }

  renderSkeleton(content);
  await loadAll(content);
});
