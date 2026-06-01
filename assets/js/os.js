import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';

const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const STATUS_OPTIONS = ['AGUARDAR', 'ATENDER', 'FINALIZAR'];
const ICO_AGUARDAR  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="pointer-events:none"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>`;
const ICO_ATENDER   = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICO_FINALIZAR = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
const ICO_SOMAR_KG  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;
const LIMITE_UM_CLASSIFICADOR = 555000;
const LIMITE_COMPARTILHAR = 300000;
const LIMITE_BLOQUEIO_COMPARTILHAMENTO = 500000;
const LIMITE_MULTIPLOS_COLABORADORES = 500000;
const RAIO_COMPARTILHAR_KM = 20;

const state = {
  user: null,
  context: null,
  access: { restricted: false, allowedSupervisoes: [] },
  os: [],
  colaboradores: [],
  pontosEmbarque: [],
  atribuicoes: [],
  filters: { supervisao: '', status: '', busca: '' },
  sort: { field: 'numero_os', dir: 'desc' },
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function parseList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.flatMap(parseList))];
  if (typeof value === 'object') return parseList(value.supervisao || value.supervisoes || value.nome || value.name);
  const text = String(value).trim();
  if (!text) return [];
  try {
    if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) return parseList(JSON.parse(text));
  } catch {}
  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function num(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function fmtTon(value) {
  return `${BR.format(num(value))}`;
}

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value);
}

function first(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function safeArray(data) { return Array.isArray(data) ? data : []; }

function haversineKm(aLat, aLng, bLat, bLng) {
  const lat1 = Number(aLat), lon1 = Number(aLng), lat2 = Number(bLat), lon2 = Number(bLng);
  if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) return null;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const s1 = Math.sin(dLat / 2) ** 2;
  const s2 = Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(s1 + s2), Math.sqrt(1 - s1 - s2));
}


function hasGeo(lat, lng) {
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function sameDay(a, b) {
  return String(a || '').slice(0, 10) === String(b || '').slice(0, 10);
}

function osById(id) {
  return state.os.find((row) => String(row.id) === String(id));
}

function assignedKeysForOs(osId) {
  return new Set(
    state.atribuicoes
      .filter((a) => String(a.os_id) === String(osId))
      .map((a) => String(a.colaborador_key || '').trim())
      .filter(Boolean)
  );
}

function colaboradorBloqueadoEmOsGrande(row, colaboradorKey) {
  const key = String(colaboradorKey || '').trim();
  if (!key) return false;
  return state.atribuicoes.some((atr) => {
    if (String(atr.os_id) === String(row.id)) return false;
    if (String(atr.colaborador_key || '').trim() !== key) return false;
    const other = osById(atr.os_id);
    if (!other) return false;
    if (!sameDay(other.data_os, row.data_os)) return false;
    if (normalize(other.status_gestor || 'AGUARDAR') === 'FINALIZAR') return false;
    return num(other.remanescente) > LIMITE_BLOQUEIO_COMPARTILHAMENTO;
  });
}

function canShareSmallOs(row, other) {
  if (!row || !other) return false;
  if (num(row.remanescente) > LIMITE_COMPARTILHAR || num(other.remanescente) > LIMITE_COMPARTILHAR) return false;
  if (!hasGeo(row.ponto1_latitude, row.ponto1_longitude) || !hasGeo(other.ponto1_latitude, other.ponto1_longitude)) return false;
  const dist = haversineKm(row.ponto1_latitude, row.ponto1_longitude, other.ponto1_latitude, other.ponto1_longitude);
  return dist != null && dist <= RAIO_COMPARTILHAR_KM;
}

function onlyActiveColab(c) {
  if (!c || c.ativo === false) return false;
  const sit = normalize(c.situacao);
  return !['NAO ATIVO', 'INATIVO', 'DESLIGADO', 'DEMITIDO'].some((status) => sit.includes(status));
}

function colabKey(c) {
  return String(c.colaborador_id || c.cpf || c.id || c.nome || '').replace(/\D/g, '') || String(c.id || c.nome || '').trim();
}

function getOsKey(row) { return String(row.id || row.numero_os || ''); }

function splitUfCidadeLocal(text) {
  const raw = String(text || '').trim();
  const match = raw.match(/^([A-Z]{2})\s*-\s*([^()]+?)(?:\s*\(([^)]+)\))?\s*$/i);
  if (!match) return { uf: '', cidade: raw, local: '' };
  return { uf: match[1].toUpperCase(), cidade: match[2].trim(), local: (match[3] || '').trim() };
}

function bestPontoForOs(row) {
  const parsed = splitUfCidadeLocal(row.embarque || row.local_embarque || '');
  const uf = normalize(parsed.uf);
  const cidade = normalize(parsed.cidade);
  const local = normalize(parsed.local);
  const cliente = normalize(row.cliente);
  const candidatos = state.pontosEmbarque
    .filter((p) => hasGeo(p.latitude, p.longitude))
    .map((p) => {
      let score = 0;
      const pUf = normalize(p.uf);
      const pCidade = normalize(p.cidade);
      const pNome = normalize(p.nome_local || p.tipo_local || '');
      const pSup = normalize(p.supervisao || p.coordenacao || '');
      if (uf && pUf === uf) score += 50;
      if (cidade && (pCidade === cidade || pCidade.includes(cidade) || cidade.includes(pCidade))) score += 80;
      if (local && (pNome.includes(local) || local.includes(pNome))) score += 120;
      if (cliente && (pNome.includes(cliente) || cliente.includes(pNome))) score += 30;
      if (row.supervisao && pSup && (pSup.includes(normalize(row.supervisao)) || normalize(row.supervisao).includes(pSup))) score += 15;
      return { ponto: p, score };
    })
    .filter((x) => x.score >= 120)
    .sort((a, b) => b.score - a.score);
  return candidatos[0]?.ponto || null;
}

function osPoint(row) {
  const ponto = bestPontoForOs(row);
  if (ponto) {
    return {
      latitude: Number(ponto.latitude),
      longitude: Number(ponto.longitude),
      origem: 'MAPA_OPERACIONAL',
      label: `${ponto.nome_local || 'Ponto operacional'} · ${ponto.cidade || ''}/${ponto.uf || ''}`,
    };
  }
  return { latitude: null, longitude: null, origem: 'SEM_PONTO_MAPA', label: 'Sem ponto georreferenciado no mapa operacional' };
}


async function resolveAccess() {
  state.user = await getCurrentUser();
  try { state.context = await getUserContext(state.user?.id); } catch { state.context = null; }
  let appUser = null;
  try {
    const { data } = await supabase
      .from('app_usuarios')
      .select('id,nome,email,setor,supervisao,coordenacao,empresa,status')
      .eq('auth_user_id', state.user?.id)
      .maybeSingle();
    appUser = data || null;
  } catch {}

  const role = state.context?.user?.role || state.context?.perfil_codigo || state.context?.perfil_nome || state.context?.role || '';
  const setor = appUser?.setor || state.context?.setor || state.context?.department?.name || '';
  const isMaster = Boolean(state.context?.user?.is_master || state.context?.is_master || normalize(role) === 'MASTER');
  const isGestor = normalize(role) === 'GESTOR' || normalize(setor) === 'GESTOR' || normalize(state.context?.department?.code) === 'GESTOR';
  const allowedSupervisoes = [
    ...parseList(appUser?.supervisao),
    ...parseList(state.context?.supervisao),
    ...parseList(state.context?.supervisoes),
    ...parseList(state.context?.user?.supervisao),
    ...parseList(state.context?.user?.supervisoes),
  ];
  state.access = { restricted: !isMaster && isGestor, allowedSupervisoes: [...new Set(allowedSupervisoes)] };
}

function isAllowedSupervisao(supervisao) {
  if (!state.access.restricted) return true;
  const key = normalize(supervisao);
  return state.access.allowedSupervisoes.some((sup) => normalize(sup) === key || key.includes(normalize(sup)) || normalize(sup).includes(key));
}

function injectStyles() {
  if (document.getElementById('os-styles')) return;
  const style = document.createElement('style');
  style.id = 'os-styles';
  style.textContent = `
    .os-grid{display:grid;grid-template-columns:1fr 1fr 2fr;gap:12px}.os-grid .field-span-2{grid-column:span 1}
    .os-table-wrap{overflow:auto;border:1px solid rgba(52,211,153,.16);border-radius:18px;background:rgba(2,6,23,.25)}
    .os-table{width:100%;min-width:980px;border-collapse:separate;border-spacing:0;table-layout:fixed;color:#e2e2f0}.os-table th{position:sticky;top:0;background:#07170f;color:#bbf7d0;text-align:left;padding:10px 9px;font-size:11px;text-transform:uppercase;letter-spacing:.035em;border-bottom:1px solid rgba(52,211,153,.18);z-index:1}.os-table th[data-sort]{cursor:pointer;user-select:none}.os-table th[data-sort]:hover{color:#fff;background:#0b2116}.os-table td{padding:10px 9px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:top;background:rgba(15,23,42,.24)}
    .os-col-num{width:9.5%}.os-col-cliente{width:40%}.os-col-rem{width:12.5%}.os-col-ind{width:27%}.os-col-acao{width:11%}
    .os-table tr:hover td{background:rgba(22,101,52,.1)}.os-title{font-weight:850;color:#f8fafc;font-size:13.5px;line-height:1.18}.os-num{font-size:13.5px;font-weight:950}.os-meta{font-size:11px;color:#6b7280;margin-top:3px;line-height:1.25}.os-client-main{max-width:100%;font-size:13.5px;line-height:1.16}.os-route-line{display:block;white-space:normal;overflow-wrap:anywhere}.os-actions{display:flex;gap:6px;flex-wrap:wrap}.os-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.72);color:#dcfce7;border-radius:999px;padding:7px 10px;font-weight:900;cursor:pointer;font-size:12px}.os-btn.active{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16}.os-btn.warn.active{background:#fde68a;color:#713f12}.os-btn.danger.active{background:#fecaca;color:#7f1d1d}.os-chip{display:inline-flex;align-items:center;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900;border:1px solid rgba(148,163,184,.18);white-space:nowrap}.os-chip.ok{background:rgba(22,163,74,.13);color:#bbf7d0}.os-chip.warn{background:rgba(250,204,21,.14);color:#fde68a}.os-chip.info{background:rgba(59,130,246,.13);color:#bfdbfe}.os-chip.danger{background:rgba(239,68,68,.12);color:#fecaca}.os-zero{box-shadow:inset 4px 0 0 #facc15}.os-indbox{display:flex;gap:8px;align-items:flex-start;flex-direction:column}.os-select{width:100%;min-height:38px;border-radius:12px;border:1px solid rgba(52,211,153,.18);background:#0d0d18;color:#e2e2f0;color-scheme:dark;padding:8px;font-size:12px}.os-mini{font-size:11px;color:#a7f3d0;line-height:1.25}.os-warn-text{font-size:11px;color:#fde68a;margin-top:6px;line-height:1.25}.os-empty{border:1px dashed rgba(148,163,184,.2);border-radius:18px;padding:18px;color:#6b7280;background:rgba(15,23,42,.16)}
    .os-rem-box{display:flex;flex-direction:column;gap:3px;align-items:flex-start}.os-rem-box .os-meta{margin-top:0}.os-extra-box{width:100%;margin-top:6px;padding-top:7px;border-top:1px solid rgba(52,211,153,.16);display:flex;flex-direction:column;gap:6px}.os-status-dot{display:inline-flex;align-items:center;justify-content:center;border-radius:999px;padding:7px 10px;border:1px solid rgba(148,163,184,.2);cursor:default;background:transparent}.os-dot{width:12px;height:12px;border-radius:50%;background:rgba(148,163,184,.25)}.os-status-dot.is-active .os-dot{background:#6b7280;box-shadow:0 0 0 3px rgba(148,163,184,.2)}
    .os-btn-kg{border-color:rgba(99,179,237,.35);color:#90cdf4}.os-btn-kg:hover{background:rgba(59,130,246,.15)}.os-btn-kg.active{background:rgba(239,68,68,.2);border-color:rgba(239,68,68,.55);color:#fca5a5}
    .os-btn-laudo{border-color:rgba(239,68,68,.45);color:#fca5a5;font-size:15px;font-weight:950;min-width:38px}.os-btn-laudo:hover{background:rgba(239,68,68,.15)}.os-btn-laudo.has-laudo{background:rgba(239,68,68,.18);border-color:rgba(239,68,68,.6)}
    .os-row-aguardar td{background:rgba(250,204,21,.06)!important}.os-row-aguardar td:first-child{box-shadow:inset 3px 0 0 rgba(250,204,21,.55)}
    .os-row-atender td{background:rgba(34,197,94,.06)!important}.os-row-atender td:first-child{box-shadow:inset 3px 0 0 rgba(34,197,94,.55)}
    .os-row-finalizar td{background:rgba(59,130,246,.06)!important}.os-row-finalizar td:first-child{box-shadow:inset 3px 0 0 rgba(59,130,246,.55)}
    .os-row-kg td{background:rgba(239,68,68,.06)!important}.os-row-kg td:first-child{box-shadow:inset 3px 0 0 rgba(239,68,68,.55)}
    .kg-overlay{position:fixed;inset:0;background:rgba(0,0,0,.65);display:flex;align-items:center;justify-content:center;z-index:9999}.kg-modal{background:#0d0d18;border:1px solid rgba(52,211,153,.22);border-radius:20px;padding:28px 24px;width:100%;max-width:380px;display:flex;flex-direction:column;gap:16px}.kg-modal h3{margin:0;color:#f8fafc;font-size:16px;font-weight:950}.kg-modal input{width:100%;box-sizing:border-box;min-height:44px;border-radius:12px;border:1px solid rgba(52,211,153,.25);background:#020617;color:#e2e2f0;color-scheme:dark;padding:10px 14px;font-size:15px}.kg-modal input:focus{outline:none;border-color:#34d399}.kg-modal-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px}.kg-modal-actions button{min-height:44px;border-radius:12px;font-weight:950;cursor:pointer;border:0;font-size:14px}.kg-btn-confirm{background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16}.kg-btn-cancel{background:rgba(15,23,42,.8);border:1px solid rgba(148,163,184,.2)!important;color:#e2e2f0}
    @media(max-width:900px){.os-grid{grid-template-columns:1fr}.os-grid .field-span-2{grid-column:span 1}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('OS', async (content) => {
  injectStyles();
  content.innerHTML = `
    <section class="card mt-16">
      <div class="section-head"><div><h3>Ordens de Serviço da regional</h3><p class="muted">O gestor visualiza somente as O.S. liberadas para sua supervisão/regional e define se vai atender, finalizar ou aguardar.</p></div></div>
      <div class="filters-grid os-grid">
        <div class="field"><label>Supervisão</label><select id="osSupervisao" class="os-select"></select></div>
        <div class="field"><label>Status gestor</label><select id="osStatus" class="os-select"><option value="">Todos</option><option value="PENDENTE">Pendente</option><option value="AGUARDAR">Aguardar</option><option value="ATENDER">Atender</option><option value="FINALIZAR">Finalizar</option><option value="AJUSTAR">Ajustar</option></select></div>
        <div class="field field-span-2"><label>Buscar</label><input id="osBusca" class="os-select" type="text" placeholder="O.S., cliente, embarque, destino..." /></div>
      </div>
      <div class="feedback mt-16" id="osFeedback">Carregando...</div>
    </section>
    <section class="grid-cards mt-16" id="osStats"></section>
    <section class="card mt-16"><div class="section-head"><div><h3>Lista de O.S.</h3><p class="muted">A sugestão de colaborador usa a menor distância disponível do mapa operacional/base de colaboradores.</p></div><button class="btn btn-secondary" id="osReload">Atualizar</button></div><div id="osList"></div></section>
  `;

  const el = {
    supervisao: document.getElementById('osSupervisao'), status: document.getElementById('osStatus'), busca: document.getElementById('osBusca'),
    feedback: document.getElementById('osFeedback'), list: document.getElementById('osList'), stats: document.getElementById('osStats'), reload: document.getElementById('osReload'),
  };

  await resolveAccess();
  bind();
  await loadAll();

  function bind() {
    el.supervisao.addEventListener('change', () => { state.filters.supervisao = el.supervisao.value; render(); });
    el.status.addEventListener('change', () => { state.filters.status = el.status.value; render(); });
    el.busca.addEventListener('input', () => { state.filters.busca = el.busca.value.trim(); render(); });
    el.reload.addEventListener('click', loadAll);
    el.list.addEventListener('click', onListClick);
    el.list.addEventListener('change', onListChange);
  }

  async function loadAll() {
    el.feedback.textContent = 'Carregando O.S. e colaboradores...';
    try {
      await loadOs();

      try {
        await loadPontosEmbarque();
      } catch (pontoError) {
        console.warn('Não foi possível carregar pontos de embarque do mapa operacional.', pontoError);
        state.pontosEmbarque = [];
      }

      try {
        await loadColaboradores();
      } catch (colabError) {
        console.warn('Não foi possível carregar colaboradores para sugestão. A lista de O.S. continuará funcionando.', colabError);
        state.colaboradores = [];
      }

      fillSupervisoes();
      render();
      el.feedback.textContent = `Carregado: ${state.os.length} O.S.`;
    } catch (error) {
      console.error(error);
      el.feedback.textContent = error.message || 'Erro ao carregar O.S.';
    }
  }

  async function loadOs() {
    // Consulta propositalmente simples para evitar Bad Request por schema cache/order.
    // A ordenação é feita no front pelos cabeçalhos da tabela.
    const { data, error } = await supabase
      .from('operacional_os')
      .select('*')
      .limit(3000);

    if (error) {
      throw new Error(error.message || 'Falha ao consultar operacional_os.');
    }

    state.os = safeArray(data).filter((row) => isAllowedSupervisao(row.supervisao));
    const ids = state.os.map((row) => row.id).filter(Boolean);
    if (!ids.length) {
      state.atribuicoes = [];
      return;
    }

    try {
      const atr = await supabase
        .from('operacional_os_colaboradores')
        .select('*')
        .in('os_id', ids);

      if (atr.error) {
        console.warn('Falha ao carregar colaboradores vinculados às O.S.', atr.error);
        state.atribuicoes = [];
      } else {
        state.atribuicoes = safeArray(atr.data);
      }
    } catch (atrError) {
      console.warn('Falha ao carregar colaboradores vinculados às O.S.', atrError);
      state.atribuicoes = [];
    }
  }

  async function loadPontosEmbarque() {
    try {
      let q = supabase
        .from('operacional_pontos_embarque')
        .select('id,tipo_local,nome_local,uf,cidade,latitude,longitude,supervisao,coordenacao,ativo')
        .limit(5000);
      const { data, error } = await q;
      if (error) {
        console.warn('Falha ao consultar operacional_pontos_embarque.', error);
        state.pontosEmbarque = [];
        return;
      }
      state.pontosEmbarque = safeArray(data).filter((p) => p.ativo !== false && hasGeo(p.latitude, p.longitude));
    } catch (error) {
      console.warn('Falha ao consultar operacional_pontos_embarque.', error);
      state.pontosEmbarque = [];
    }
  }

  async function loadColaboradores() {
    let rows = [];

    try {
      const { data, error } = await supabase
        .from('operacional_colaborador_base')
        .select('*')
        .eq('ativo', true)
        .limit(5000);

      if (!error) rows = data || [];
      else console.warn('Falha em operacional_colaborador_base; tentando colaborador_snapshot.', error);
    } catch (error) {
      console.warn('Falha em operacional_colaborador_base; tentando colaborador_snapshot.', error);
    }

    if (!rows.length) {
      try {
        const latest = await supabase
          .from('colaborador_snapshot')
          .select('data_referencia')
          .order('data_referencia', { ascending: false })
          .limit(1);

        const dt = latest.data?.[0]?.data_referencia;
        let q = supabase.from('colaborador_snapshot').select('*').limit(5000);
        if (dt) q = q.eq('data_referencia', dt);
        const { data, error } = await q;
        if (error) {
          console.warn('Falha em colaborador_snapshot.', error);
          rows = [];
        } else {
          rows = data || [];
        }
      } catch (error) {
        console.warn('Falha em colaborador_snapshot.', error);
        rows = [];
      }
    }

    state.colaboradores = rows
      .filter(onlyActiveColab)
      .filter((c) => !state.access.restricted || isAllowedSupervisao(c.supervisao || c.regional));
  }

  function fillSupervisoes() {
    const sups = [...new Set(state.os.map((row) => row.supervisao).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
    el.supervisao.innerHTML = '<option value="">Todas liberadas</option>' + sups.map((sup) => `<option value="${escapeHtml(sup)}">${escapeHtml(sup)}</option>`).join('');
    if (state.access.restricted && sups.length === 1) {
      el.supervisao.value = sups[0];
      state.filters.supervisao = sups[0];
    }
  }

  function filteredOs() {
    const sup = normalize(state.filters.supervisao);
    const status = normalize(state.filters.status);
    const busca = normalize(state.filters.busca);
    const rows = state.os.filter((row) => {
      if (sup && normalize(row.supervisao) !== sup) return false;
      if (status) {
        const st = (row.status_gestor || 'AGUARDAR').toUpperCase();
        const isCinza = st === 'AGUARDAR' && !row.configurada_em;
        if (status === 'PENDENTE' && !isCinza) return false;
        if (status === 'AGUARDAR' && (isCinza || st !== 'AGUARDAR')) return false;
        if (status === 'ATENDER' && st !== 'ATENDER') return false;
        if (status === 'FINALIZAR' && st !== 'FINALIZAR') return false;
        if (status === 'AJUSTAR' && st !== 'AJUSTAR') return false;
      }
      const hay = normalize(`${row.numero_os} ${row.cliente} ${row.embarque} ${row.destino} ${row.contrato} ${row.produto}`);
      return !busca || hay.includes(busca);
    });
    return sortRows(rows);
  }

  function sortRows(rows) {
    const { field, dir } = state.sort || { field: 'numero_os', dir: 'desc' };
    const factor = dir === 'asc' ? 1 : -1;
    const copy = [...rows];
    copy.sort((a, b) => {
      let av;
      let bv;
      if (field === 'cliente') {
        av = normalize(a.cliente || '');
        bv = normalize(b.cliente || '');
        return av.localeCompare(bv, 'pt-BR') * factor;
      }
      if (field === 'remanescente') {
        av = num(a.remanescente);
        bv = num(b.remanescente);
      } else {
        av = num(a.numero_os);
        bv = num(b.numero_os);
      }
      if (av === bv) return String(a.cliente || '').localeCompare(String(b.cliente || ''), 'pt-BR');
      return (av - bv) * factor;
    });
    return copy;
  }

  function sortLabel(field) {
    if (state.sort?.field !== field) return '↕';
    return state.sort.dir === 'asc' ? '↑' : '↓';
  }


  function atribuicoesDaOs(osId) {
    return state.atribuicoes.filter((a) => String(a.os_id) === String(osId));
  }

  function sugestoesParaOs(row) {
    const supKey = normalize(row.supervisao);
    const ponto = osPoint(row);
    const osTemCoordenada = hasGeo(ponto.latitude, ponto.longitude);
    const jaIndicadosNaOs = assignedKeysForOs(row.id);
    const cols = state.colaboradores.filter((c) => {
      const key = colabKey(c);
      if (key && colaboradorBloqueadoEmOsGrande(row, key) && !jaIndicadosNaOs.has(key)) return false;
      const colSup = normalize(c.supervisao || c.regional);
      return !supKey || !colSup || colSup.includes(supKey) || supKey.includes(colSup);
    });

    return cols.map((c) => {
      const dist = osTemCoordenada && hasGeo(c.latitude, c.longitude)
        ? haversineKm(ponto.latitude, ponto.longitude, c.latitude, c.longitude)
        : null;
      return { ...c, distancia_km: dist, os_tem_coordenada: osTemCoordenada, ponto_origem: ponto.origem, ponto_label: ponto.label };
    }).sort((a, b) => {
      const aHas = a.distancia_km != null;
      const bHas = b.distancia_km != null;
      if (aHas !== bHas) return aHas ? -1 : 1;
      if (aHas && bHas && a.distancia_km !== b.distancia_km) return a.distancia_km - b.distancia_km;
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    }).slice(0, 12);
  }

  function sugestaoValida(row, sugestoes) {
    const primeira = sugestoes?.[0];
    if (!primeira) return null;
    return primeira.distancia_km == null ? null : primeira;
  }


  function statusClass(row) {
    const st = row.status_gestor ? normalize(row.status_gestor) : 'PENDENTE';
    if (st === 'ATENDER') return 'ok';
    if (st === 'FINALIZAR') return 'danger';
    if (st === 'AGUARDAR') return 'warn';
    return '';
  }

  function renderStats(rows = filteredOs()) {
    const atender = rows.filter((r) => normalize(r.status_gestor) === 'ATENDER').length;
    const zero = rows.filter((r) => num(r.remanescente) === 0).length;
    const ate555 = rows.filter((r) => num(r.remanescente) > 0 && num(r.remanescente) <= LIMITE_UM_CLASSIFICADOR).length;
    el.stats.innerHTML = `
      <article class="card"><h3>Total O.S.</h3><p class="metric">${rows.length}</p><p class="muted">Dentro do filtro atual.</p></article>
      <article class="card"><h3>Para atender</h3><p class="metric">${atender}</p><p class="muted">Vai para Conferência.</p></article>
      <article class="card"><h3>Remanescente zero</h3><p class="metric">${zero}</p><p class="muted">Destacadas em amarelo.</p></article>
      <article class="card"><h3>Até 555.000</h3><p class="metric">${ate555}</p><p class="muted">Indicação padrão: 1 classificador.</p></article>
    `;
  }

  function render() {
    const rows = filteredOs();
    renderStats(rows);
    if (!rows.length) {
      el.list.innerHTML = '<div class="os-empty">Nenhuma O.S. encontrada para o filtro atual.</div>';
      return;
    }
    el.list.innerHTML = `<div class="os-table-wrap"><table class="os-table"><colgroup><col class="os-col-num"><col class="os-col-cliente"><col class="os-col-rem"><col class="os-col-ind"><col class="os-col-acao"></colgroup><thead><tr><th data-sort="numero_os">O.S. ${sortLabel('numero_os')}</th><th data-sort="cliente">Cliente / rota ${sortLabel('cliente')}</th><th data-sort="remanescente">Remanescente ${sortLabel('remanescente')}</th><th>Indicação operacional</th><th>Ação gestor</th></tr></thead><tbody>${rows.map(rowHtml).join('')}</tbody></table></div>`;
  }

  function rowHtml(row) {
    const rem = num(row.remanescente);
    const zero = rem === 0;
    const sugestoes = sugestoesParaOs(row);
    const principal = sugestaoValida(row, sugestoes);
    const atr = atribuicoesDaOs(row.id);
    const selectedKey = atr[0]?.colaborador_key || (principal ? colabKey(principal) : '');
    const selectedNome = atr[0]?.colaborador_nome || principal?.nome || principal?.nome_colaborador || '';
    const podeTerMultiplos = rem >= LIMITE_MULTIPLOS_COLABORADORES;
    const maxPadrao = 1;
    const permitirMais = podeTerMultiplos && (Boolean(row.permitir_mais_classificadores) || atr.length > maxPadrao);
    const status = row.status_gestor ? normalize(row.status_gestor) : 'PENDENTE';
    const compartilhavel = rem > 0 && rem <= LIMITE_COMPARTILHAR;
    const ponto = osPoint(row);
    function optionList(selected, excludeKeys = new Set()) {
      return sugestoes.map((c, index) => {
        const key = colabKey(c);
        if (excludeKeys.has(String(key)) && String(key) !== String(selected)) return '';
        const distTxt = c.distancia_km == null ? 'sem distância' : `${KM.format(c.distancia_km)} km`;
        const label = `${index === 0 && c.distancia_km != null ? '⭐ ' : ''}${c.nome || c.nome_colaborador || ''} • ${distTxt}`;
        return `<option value="${escapeHtml(key)}" data-nome="${escapeHtml(c.nome || c.nome_colaborador || '')}" data-dist="${escapeHtml(c.distancia_km ?? '')}" ${String(key) === String(selected) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
      }).join('');
    }

    const selectedKeys = new Set(atr.map((a) => String(a.colaborador_key || '').trim()).filter(Boolean));
    const mainOptions = optionList(selectedKey, new Set([...selectedKeys].filter((key) => String(key) !== String(selectedKey))));
    const extra = atr[1] || null;
    const extraKey = extra?.colaborador_key || '';
    const extraNome = extra?.colaborador_nome || '';
    const extraOptions = optionList(extraKey, new Set([...selectedKeys, String(selectedKey)].filter((key) => key && String(key) !== String(extraKey))));
    const extraSelectHtml = permitirMais ? `
      <div class="os-extra-box">
        <label class="os-mini"><strong>2º colaborador na mesma O.S.</strong></label>
        <select class="os-select" data-assign-extra data-existing-id="${escapeHtml(extra?.id || '')}">
          <option value="">${extraNome ? 'Trocar/remover 2º colaborador' : 'Selecionar 2º colaborador'}</option>
          ${extraOptions}
        </select>
        ${extraNome ? `<div class="os-mini"><strong>Também indicado:</strong> ${escapeHtml(extraNome)} ${extra?.distancia_km != null ? `• ${KM.format(extra.distancia_km)} km` : ''}</div>` : '<div class="os-mini">Use este campo para indicar mais um classificador junto na mesma O.S.</div>'}
        ${atr.length > 2 ? `<div class="os-meta">${atr.slice(2).map((a) => `<span class="os-chip ok">${escapeHtml(a.colaborador_nome)} <button class="os-btn" style="padding:2px 6px;margin-left:5px" data-remove-colab="${escapeHtml(a.id)}">×</button></span>`).join(' ')}</div>` : ''}
      </div>` : '';

    const isNegativo = rem < 0;
    const rowColorClass = isNegativo ? 'os-row-kg' : row.observacao_logistica?.startsWith('KG solicitado') ? 'os-row-kg' : status === 'AGUARDAR' ? 'os-row-aguardar' : status === 'ATENDER' ? 'os-row-atender' : status === 'FINALIZAR' ? 'os-row-finalizar' : '';
    const hasLaudo = String(row.observacao_logistica||'').startsWith('LAUDO:');
    const acaoCol = isNegativo
      ? `<div class="os-actions"><button class="os-btn os-btn-laudo ${hasLaudo ? 'has-laudo' : ''}" data-laudo-id="${escapeHtml(String(row.id))}" data-laudo-num="${escapeHtml(row.numero_os)}" title="Anexar laudo para conferência">!</button></div><div style="margin-top:8px"><span class="os-chip danger" style="font-size:10px">REM. NEGATIVO</span></div>`
      : `<div class="os-actions"><div class="os-status-dot ${status === 'PENDENTE' ? 'is-active' : ''}" title="Sem ação definida"><span class="os-dot"></span></div>${STATUS_OPTIONS.map((opt) => `<button class="os-btn ${opt === 'AGUARDAR' ? 'warn' : opt === 'FINALIZAR' ? 'danger' : ''} ${status === opt ? 'active' : ''}" data-status="${opt}" title="${opt === 'AGUARDAR' ? 'Aguardar' : opt === 'ATENDER' ? 'Atender' : 'Finalizar'}">${opt === 'AGUARDAR' ? ICO_AGUARDAR : opt === 'ATENDER' ? ICO_ATENDER : ICO_FINALIZAR}</button>`).join('')}<button class="os-btn os-btn-kg ${row.observacao_logistica?.startsWith('KG solicitado') ? 'active' : ''}" data-kg-id="${escapeHtml(String(row.id))}" data-kg-num="${escapeHtml(row.numero_os)}" title="Solicitar KG para Logística">${ICO_SOMAR_KG}</button></div><div style="margin-top:8px"><span class="os-chip ${statusClass(row)}">${escapeHtml(status)}</span></div>`;
    return `<tr data-os-id="${escapeHtml(row.id)}" class="${zero ? 'os-zero' : ''} ${rowColorClass}">
      <td><div class="os-title os-num">${escapeHtml(row.numero_os)}</div><div class="os-meta">${brDate(row.data_os)}</div><div class="os-meta">${escapeHtml(first(row.servico))}</div><div class="os-meta">${escapeHtml(first(row.supervisao))}</div>${zero ? '<div class="os-warn-text">Remanescente zerado</div>' : ''}</td>
      <td><div class="os-title os-client-main">${escapeHtml(first(row.cliente))}</div><div class="os-meta os-route-line">Emb.: ${escapeHtml(first(row.embarque))}</div><div class="os-meta os-route-line">Dest.: ${escapeHtml(first(row.destino))}</div><div class="os-meta os-route-line">Contrato ${escapeHtml(first(row.contrato))} • ${escapeHtml(first(row.produto))}</div></td>
      <td><div class="os-rem-box"><span class="os-chip ${zero ? 'warn' : rem <= LIMITE_UM_CLASSIFICADOR ? 'info' : 'ok'}">${fmtTon(rem)}</span><div class="os-meta">Lote ${fmtTon(row.lote)}</div><div class="os-meta">Emb. ${fmtTon(row.embarcado)}</div>${compartilhavel ? `<div class="os-warn-text">Pode reaproveitar em outra O.S. até ${RAIO_COMPARTILHAR_KM} km.</div>` : ''}</div></td>
      <td>
        <div class="os-indbox">
          <select class="os-select" data-assign-main>
            <option value="">${principal ? 'Selecionar outro colaborador' : 'Selecionar colaborador'}</option>
            ${mainOptions}
          </select>
          ${selectedNome ? `<div class="os-mini"><strong>Indicação:</strong> ${escapeHtml(selectedNome)}</div>` : '<div class="os-warn-text">Sem sugestão automática. Ponto de embarque ou colaborador sem coordenadas válidas.</div>'}
          ${principal ? `<div class="os-mini">${KM.format(principal.distancia_km)} km do ponto operacional.</div>` : `<div class="os-mini">${escapeHtml(ponto.label)}</div>`}
          ${podeTerMultiplos ? `<label class="os-mini" style="display:block"><input type="checkbox" data-allow-more ${permitirMais ? 'checked' : ''}/> permitir 2 ou mais colaboradores</label>` : '<div class="os-mini">2º colaborador permitido somente para O.S. com remanescente de 500.000 ou mais.</div>'}
          ${extraSelectHtml}
        </div>
      </td>
      <td>${acaoCol}</td>
    </tr>`;
  }


  async function onListClick(event) {
    const sortTh = event.target.closest('[data-sort]');
    if (sortTh) {
      const field = sortTh.dataset.sort;
      const current = state.sort || { field: 'numero_os', dir: 'desc' };
      state.sort = {
        field,
        dir: current.field === field && current.dir === 'desc' ? 'asc' : 'desc',
      };
      render();
      return;
    }

    const statusBtn = event.target.closest('[data-status]');
    if (statusBtn) {
      const tr = statusBtn.closest('[data-os-id]');
      const row = state.os.find((o) => String(o.id) === String(tr.dataset.osId));
      const nextStatus = statusBtn.dataset.status;
      if (nextStatus === 'ATENDER') {
        const ok = await garantirColaboradorAntesDeAtender(row);
        if (!ok) return;
      }
      const agoraIso = new Date().toISOString();
      const previous = {
        status_gestor: row.status_gestor,
        configurada_em: row.configurada_em,
        status_logistica: row.status_logistica,
        enviado_logistica_em: row.enviado_logistica_em,
        logistica_solicitado_por: row.logistica_solicitado_por,
        observacao_logistica: row.observacao_logistica,
      };
      const patch = {
        status_gestor: nextStatus,
        configurada_em: agoraIso,
        observacao_logistica: null,
      };
      if (nextStatus === 'FINALIZAR') {
        patch.status_logistica = 'PENDENTE';
        patch.enviado_logistica_em = row.enviado_logistica_em || agoraIso;
        patch.logistica_solicitado_por = state.user?.id || null;
      } else {
        patch.status_logistica = null;
        patch.enviado_logistica_em = null;
        patch.logistica_solicitado_por = null;
      }
      Object.assign(row, patch);
      render();
      const saved = await updateOs(tr.dataset.osId, patch, true);
      if (!saved) {
        Object.assign(row, previous);
        render();
      }
      return;
    }
    const removeBtn = event.target.closest('[data-remove-colab]');
    if (removeBtn) {
      const { error } = await supabase.from('operacional_os_colaboradores').delete().eq('id', removeBtn.dataset.removeColab);
      if (error) return alert(error.message);
      await loadOs(); render();
    }

    const kgBtn = event.target.closest('[data-kg-id]');
    if (kgBtn) openKgModal(kgBtn.dataset.kgId, kgBtn.dataset.kgNum);

    const laudoBtn = event.target.closest('[data-laudo-id]');
    if (laudoBtn) openLaudoModal(laudoBtn.dataset.laudoId, laudoBtn.dataset.laudoNum);
  }

  function openKgModal(osId, osNumero) {
    const existing = document.getElementById('kg-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'kg-modal-overlay';
    overlay.className = 'kg-overlay';
    overlay.innerHTML = `
      <div class="kg-modal">
        <h3>Qual o valor precisa somar na O.S?</h3>
        <p style="margin:0;font-size:12px;color:#6b7280">O.S. <strong style="color:#bbf7d0">${escapeHtml(osNumero)}</strong> — valor será enviado para a Logística.</p>
        <input id="kgInput" type="number" min="1" placeholder="Inserir KG" inputmode="numeric" />
        <div class="kg-modal-actions">
          <button class="kg-btn-cancel" id="kgCancelar">Cancelar</button>
          <button class="kg-btn-confirm" id="kgConfirmar">Confirmar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#kgInput');
    input.focus();

    overlay.querySelector('#kgCancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#kgConfirmar').addEventListener('click', async () => {
      const kg = Number(input.value);
      if (!kg || kg <= 0) { input.focus(); return; }
      const btn = overlay.querySelector('#kgConfirmar');
      btn.disabled = true;
      btn.textContent = 'Enviando...';
      const kgText = `KG solicitado pelo gestor: ${new Intl.NumberFormat('pt-BR').format(kg)} kg`;
      const row = state.os.find((o) => String(o.id) === String(osId));
      if (row) { row.observacao_logistica = kgText; row.status_gestor = 'AGUARDAR'; row.configurada_em = null; }
      overlay.remove();
      render();
      supabase.from('operacional_os').update({ observacao_logistica: kgText, status_gestor: 'AGUARDAR', configurada_em: null, updated_at: new Date().toISOString() }).eq('id', osId);
    });
  }

  function openLaudoModal(osId, osNumero) {
    const existing = document.getElementById('laudo-modal-overlay');
    if (existing) existing.remove();
    const overlay = document.createElement('div');
    overlay.id = 'laudo-modal-overlay';
    overlay.className = 'kg-overlay';
    overlay.innerHTML = `
      <div class="kg-modal">
        <h3>Anexar laudo para conferência</h3>
        <p style="margin:0;font-size:12px;color:#6b7280">O.S. <strong style="color:#fca5a5">${escapeHtml(osNumero)}</strong> — remanescente negativo.</p>
        <div id="laudoDropzone" style="border:2px dashed rgba(239,68,68,.4);border-radius:12px;padding:22px;text-align:center;cursor:pointer;color:#6b7280;font-size:13px;transition:border-color .2s">
          <div style="font-size:22px;margin-bottom:6px">📎</div>
          Clique ou arraste arquivos aqui<br><small>Imagens, PDF, planilhas (.xlsx, .csv)</small>
          <input id="laudoInput" type="file" accept="image/*,.pdf,.xlsx,.xls,.csv" multiple style="display:none" />
        </div>
        <div id="laudoFileList" style="font-size:12px;color:#bbf7d0;min-height:18px"></div>
        <div class="kg-modal-actions">
          <button class="kg-btn-cancel" id="laudoCancelar">Cancelar</button>
          <button class="kg-btn-confirm" id="laudoConfirmar">Enviar</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector('#laudoInput');
    const dropzone = overlay.querySelector('#laudoDropzone');
    const fileList = overlay.querySelector('#laudoFileList');

    dropzone.addEventListener('click', () => input.click());
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'rgba(239,68,68,.8)'; });
    dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'rgba(239,68,68,.4)'; });
    dropzone.addEventListener('drop', (e) => { e.preventDefault(); dropzone.style.borderColor = 'rgba(239,68,68,.4)'; input.files = e.dataTransfer.files; updateFileList(); });
    input.addEventListener('change', updateFileList);

    function updateFileList() {
      fileList.textContent = [...(input.files||[])].map(f => f.name).join(', ') || '';
    }

    overlay.querySelector('#laudoCancelar').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#laudoConfirmar').addEventListener('click', async () => {
      const files = [...(input.files||[])];
      if (!files.length) { input.click(); return; }
      const btn = overlay.querySelector('#laudoConfirmar');
      btn.disabled = true; btn.textContent = 'Enviando...';

      const urls = [];
      for (const file of files) {
        const path = `os/${osId}/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g,'_')}`;
        const { data: up, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
        if (upErr) { alert(`Erro ao enviar ${file.name}: ${upErr.message}`); btn.disabled = false; btn.textContent = 'Enviar'; return; }
        const { data: pub } = supabase.storage.from('os-laudos').getPublicUrl(up.path);
        urls.push(pub.publicUrl);
      }

      const laudoRef = `LAUDO:${urls.join(',')}`;
      const row = state.os.find((o) => String(o.id) === String(osId));
      if (row) row.observacao_logistica = laudoRef;
      overlay.remove();
      render();
      supabase.from('operacional_os').update({ observacao_logistica: laudoRef, updated_at: new Date().toISOString() }).eq('id', osId);
    });
  }

  async function garantirColaboradorAntesDeAtender(row) {
    if (!row) return false;
    const current = atribuicoesDaOs(row.id);
    if (current.length > 0) return true;
    const sugestoes = sugestoesParaOs(row);
    const sugestao = sugestaoValida(row, sugestoes);
    if (!sugestao) {
      alert('Não é possível enviar esta O.S. para Conferência sem colaborador válido. Alinhe o ponto de embarque no mapa operacional com latitude/longitude ou selecione um colaborador manualmente.');
      return false;
    }
    const payload = {
      os_id: row.id,
      colaborador_key: colabKey(sugestao),
      colaborador_nome: sugestao.nome || sugestao.nome_colaborador || 'Colaborador sugerido',
      distancia_km: sugestao.distancia_km == null ? null : Number(sugestao.distancia_km),
      origem_sugestao: 'DISTANCIA_OPERACIONAL',
      indicado_por: state.user?.id || null,
    };
    const { data, error } = await supabase
      .from('operacional_os_colaboradores')
      .upsert(payload, { onConflict: 'os_id,colaborador_key' })
      .select('*')
      .maybeSingle();
    if (error) {
      alert(error.message || 'Não foi possível confirmar o colaborador sugerido.');
      return false;
    }
    const saved = data || { ...payload, id: `local-${Date.now()}`, created_at: new Date().toISOString() };
    state.atribuicoes = [
      ...state.atribuicoes.filter((a) => !(String(a.os_id) === String(row.id) && String(a.colaborador_key) === String(payload.colaborador_key))),
      saved,
    ];
    return true;
  }


  async function onListChange(event) {
    const tr = event.target.closest('[data-os-id]');
    if (!tr) return;
    if (event.target.matches('[data-allow-more]')) {
      const checked = event.target.checked;
      if (!checked) {
        const extras = atribuicoesDaOs(tr.dataset.osId).slice(1).map((a) => a.id).filter(Boolean);
        if (extras.length) {
          const del = await supabase.from('operacional_os_colaboradores').delete().in('id', extras);
          if (del.error) return alert(del.error.message);
          state.atribuicoes = state.atribuicoes.filter((a) => !extras.includes(a.id));
        }
      }
      await updateOs(tr.dataset.osId, { permitir_mais_classificadores: checked, configurada_em: new Date().toISOString() }, true);
      render();
      return;
    }
    if ((event.target.matches('[data-assign-main]') || event.target.matches('[data-assign-extra]')) && event.target.value) {
      const row = state.os.find((o) => String(o.id) === String(tr.dataset.osId));
      const selected = event.target.selectedOptions[0];
      const current = atribuicoesDaOs(row.id);
      const rem = num(row.remanescente);
      const isExtra = event.target.matches('[data-assign-extra]');
      const allowMore = rem >= LIMITE_MULTIPLOS_COLABORADORES && Boolean(row.permitir_mais_classificadores);
      if (isExtra && !allowMore) {
        alert('Para adicionar 2º colaborador, a O.S. precisa ter remanescente de 500.000 ou mais e a opção deve estar marcada.');
        event.target.value = '';
        return;
      }
      if (!isExtra && rem > 0 && rem <= LIMITE_UM_CLASSIFICADOR && current.length >= 1 && !allowMore) {
        // A seleção principal troca o classificador atual, não adiciona um segundo.
        const atual = current[0];
        if (atual?.id && String(atual.colaborador_key) !== String(event.target.value)) {
          const del = await supabase.from('operacional_os_colaboradores').delete().eq('id', atual.id);
          if (del.error) return alert(del.error.message);
          state.atribuicoes = state.atribuicoes.filter((a) => a.id !== atual.id);
        }
      }
      if (isExtra) {
        const mainKey = current[0]?.colaborador_key || '';
        if (mainKey && String(mainKey) === String(event.target.value)) {
          alert('Este colaborador já está como indicação principal desta O.S.');
          event.target.value = '';
          return;
        }
        const existingId = event.target.dataset.existingId;
        if (existingId) {
          const del = await supabase.from('operacional_os_colaboradores').delete().eq('id', existingId);
          if (del.error) return alert(del.error.message);
          state.atribuicoes = state.atribuicoes.filter((a) => String(a.id) !== String(existingId));
        }
      }
      const payload = {
        os_id: row.id,
        colaborador_key: event.target.value,
        colaborador_nome: selected.dataset.nome || selected.textContent,
        distancia_km: selected.dataset.dist ? Number(selected.dataset.dist) : null,
        origem_sugestao: selected.dataset.dist ? 'DISTANCIA_OPERACIONAL' : 'MANUAL_SEM_DISTANCIA',
        indicado_por: state.user?.id || null,
      };
      const { data, error } = await supabase
        .from('operacional_os_colaboradores')
        .upsert(payload, { onConflict: 'os_id,colaborador_key' })
        .select('*')
        .maybeSingle();
      if (error) return alert(error.message);
      const saved = data || { ...payload, id: `local-${Date.now()}`, created_at: new Date().toISOString() };
      state.atribuicoes = [
        ...state.atribuicoes.filter((a) => !(String(a.os_id) === String(row.id) && String(a.colaborador_key) === String(payload.colaborador_key))),
        saved,
      ];
      await updateOs(row.id, { configurada_em: new Date().toISOString() }, true);
      render();
    }
  }

  async function updateOs(id, payload, silent = false) {
    const updatedAt = new Date().toISOString();
    const { error } = await supabase.from('operacional_os').update({ ...payload, updated_at: updatedAt }).eq('id', id);
    if (error) {
      alert(error.message);
      return false;
    }
    const row = state.os.find((o) => String(o.id) === String(id));
    if (row) Object.assign(row, payload, { updated_at: updatedAt });
    if (!silent) render();
    return true;
  }
});
