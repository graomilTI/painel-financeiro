import { supabase } from './supabaseClient.js';
import { getCurrentUser, getSession, getUserContext, signOut } from './auth.js';
import { toPanelUrl } from './paths.js';

const BR = new Intl.NumberFormat('pt-BR');
const KM = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const CACHE_KEY = 'grao1000:gestor-app:v1';
const CACHE_TTL = 1000 * 60 * 7;
const LIMITE_MULTIPLOS = 500000;
const STATUS = ['PENDENTE', 'AGUARDAR', 'ATENDER', 'FINALIZAR', 'AJUSTAR'];
const ICO_AGUARDAR  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" style="pointer-events:none"><line x1="8" y1="5" x2="8" y2="19"/><line x1="16" y1="5" x2="16" y2="19"/></svg>`;
const ICO_ATENDER   = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><polyline points="20 6 9 17 4 12"/></svg>`;
const ICO_FINALIZAR = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`;
const ICO_AJUSTAR   = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/></svg>`;
const ICO_SOMAR_KG  = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="pointer-events:none"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>`;

const app = document.getElementById('app');

const state = {
  user: null,
  context: null,
  appUser: null,
  isMaster: false,
  allowedSupervisoes: [],
  currentTab: 'inicio',
  loading: false,
  os: [],
  colaboradores: [],
  pontos: [],
  atribuicoes: [],
  filters: { supervisao: '', status: '', busca: '' },
  selections: new Map(),
  extras: new Map(),
  allowMulti: new Set(),
  suggested: new Map(),
  busy: new Set(),
  tomorrow: new Set(),
  installPrompt: null,
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

function compactKey(value) {
  return normalize(value).replace(/\s+/g, '');
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

function fmt(value) { return BR.format(num(value)); }

function brDate(value) {
  if (!value) return '-';
  const raw = String(value).slice(0, 10);
  const [y, m, d] = raw.split('-');
  return y && m && d ? `${d}/${m}/${y}` : escapeHtml(value);
}

function toIsoDate(value) {
  return String(value || '').slice(0, 10);
}

function first(value, fallback = '-') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function colabKey(c) {
  return String(c?.colaborador_id || c?.cpf || c?.id || c?.nome || '')
    .replace(/\D/g, '') || String(c?.id || c?.nome || '').trim();
}

function osId(row) { return String(row?.id || row?.numero_os || ''); }

function isActiveColab(c) {
  if (!c || c.ativo === false) return false;
  const sit = normalize(c.situacao);
  return !['NAO ATIVO', 'INATIVO', 'DESLIGADO', 'DEMITIDO'].some((s) => sit.includes(s));
}

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

function saveCache(payload) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), payload })); } catch {}
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > CACHE_TTL) return null;
    return parsed.payload || null;
  } catch { return null; }
}

function clearCache() {
  try { localStorage.removeItem(CACHE_KEY); } catch {}
}

function showToast(message, type = 'ok') {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    document.body.appendChild(wrap);
  }
  const el = document.createElement('div');
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.textContent = message;
  wrap.appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

function panelHref(path) { return toPanelUrl(path); }

async function boot() {
  const session = await getSession().catch(() => null);
  if (!session?.user) {
    window.location.replace(panelHref('login'));
    return;
  }

  state.user = await getCurrentUser();
  state.context = await getUserContext(state.user?.id).catch(() => null);
  const { data: appUser } = await supabase
    .from('app_usuarios')
    .select('id,nome,email,setor,supervisao,coordenacao,empresa,status')
    .eq('auth_user_id', state.user?.id)
    .maybeSingle();
  state.appUser = appUser || null;

  const role = state.context?.user?.role || state.context?.perfil_codigo || state.context?.perfil_nome || state.context?.role || '';
  const setor = appUser?.setor || state.context?.setor || state.context?.department?.name || '';
  state.isMaster = Boolean(state.context?.user?.is_master || state.context?.is_master || normalize(role) === 'MASTER');
  const isGestor = normalize(role) === 'GESTOR' || normalize(setor) === 'GESTOR' || normalize(state.context?.department?.code) === 'GESTOR';
  state.allowedSupervisoes = [
    ...parseList(appUser?.supervisao),
    ...parseList(state.context?.user?.supervisao),
    ...parseList(state.context?.user?.supervisoes),
    ...parseList(state.context?.supervisao),
    ...parseList(state.context?.supervisoes),
  ];

  if (!state.isMaster && !isGestor) {
    renderShell();
    document.getElementById('appMain').innerHTML = `<section class="section-card"><h2>Acesso restrito</h2><p class="help">Este app é exclusivo para usuários do módulo Gestor.</p></section>`;
    return;
  }

  renderShell();
  setupPwaInstall();
  await loadData({ useCache: true });
  renderCurrentTab();
}

function renderShell() {
  const name = state.appUser?.nome || state.context?.user?.name || state.user?.email || 'Gestor';
  app.className = 'gestor-app';
  app.innerHTML = `
    <header class="app-topbar">
      <div class="brand">
        <img src="./logo-grao1000.svg" alt="Grão 1000" />
        <div>
          <strong>App Gestor</strong>
          <small>Olá, ${escapeHtml(name)}</small>
        </div>
      </div>
      <div class="top-actions">
        <span class="pill">${state.isMaster ? 'MASTER' : 'GESTOR'}</span>
        <button class="icon-btn" id="refreshBtn" type="button" title="Atualizar">↻</button>
        <button class="icon-btn" id="logoutBtn" type="button" title="Sair">⎋</button>
      </div>
    </header>
    <main class="app-main" id="appMain"></main>
    <nav class="bottom-nav" id="bottomNav">
      <button class="nav-btn is-active" data-tab="inicio" type="button">Início</button>
      <button class="nav-btn" data-tab="os" type="button">OS</button>
      <button class="nav-btn" data-tab="programacao" type="button">Programação</button>
      <button class="nav-btn" data-tab="mais" type="button">Mais</button>
    </nav>
  `;

  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await signOut().catch(() => null);
    window.location.replace(panelHref('login'));
  });
  document.getElementById('refreshBtn')?.addEventListener('click', async () => {
    clearCache();
    await loadData({ useCache: false });
    renderCurrentTab();
    showToast('Dados atualizados.');
  });
  document.getElementById('bottomNav')?.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-tab]');
    if (!btn) return;
    state.currentTab = btn.dataset.tab;
    document.querySelectorAll('.nav-btn').forEach((item) => item.classList.toggle('is-active', item === btn));
    renderCurrentTab();
  });
}

function setupPwaInstall() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => null);
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.installPrompt = event;
    renderCurrentTab();
  });
}

async function loadData({ useCache = true } = {}) {
  if (state.loading) return;
  state.loading = true;
  const cached = useCache ? readCache() : null;
  if (cached) {
    Object.assign(state, {
      os: cached.os || [],
      colaboradores: cached.colaboradores || [],
      pontos: cached.pontos || [],
      atribuicoes: cached.atribuicoes || [],
    });
    hydrateSelections();
    state.loading = false;
    refreshSuggestions();
    return;
  }

  try {
    let osQuery = supabase.from('operacional_os').select('*').limit(1000);
    if (!state.isMaster && state.allowedSupervisoes.length) osQuery = osQuery.in('supervisao', state.allowedSupervisoes);
    const [osRes, atrRes, colabRes, pontosRes] = await Promise.all([
      osQuery,
      supabase.from('operacional_os_colaboradores').select('*').limit(5000),
      supabase.from('operacional_colaborador_base').select('id,nome,cpf,tipo_mao_obra,empresa,coordenacao,supervisao,cidade_base,uf_base,latitude,longitude,ativo,nome_chave,telefone').eq('ativo', true).limit(5000),
      supabase.from('operacional_pontos_embarque').select('id,tipo_local,nome_local,uf,cidade,latitude,longitude,supervisao,coordenacao,ativo').eq('ativo', true).limit(8000),
    ]);

    if (osRes.error) throw osRes.error;
    state.os = Array.isArray(osRes.data) ? osRes.data : [];
    state.atribuicoes = Array.isArray(atrRes.data) ? atrRes.data : [];
    state.colaboradores = Array.isArray(colabRes.data)
      ? colabRes.data.filter(isActiveColab).filter((c) =>
          state.isMaster || !state.allowedSupervisoes.length || state.allowedSupervisoes.includes(c.supervisao))
      : [];
    state.pontos = Array.isArray(pontosRes.data) ? pontosRes.data : [];
    saveCache({ os: state.os, atribuicoes: state.atribuicoes, colaboradores: state.colaboradores, pontos: state.pontos });
    hydrateSelections();
    refreshSuggestions();
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Falha ao carregar dados do app.', 'error');
  } finally {
    state.loading = false;
  }
}

function hydrateSelections() {
  state.selections.clear();
  state.extras.clear();
  state.allowMulti.clear();
  for (const os of state.os) if (os.permitir_mais_classificadores) state.allowMulti.add(osId(os));
  for (const item of state.atribuicoes) {
    const key = String(item.os_id || '');
    if (!key) continue;
    const current = state.selections.get(key);
    if (!current) state.selections.set(key, item.colaborador_key || item.colaborador_cpf || item.colaborador_nome || '');
    else {
      const list = state.extras.get(key) || [];
      list.push(item.colaborador_key || item.colaborador_cpf || item.colaborador_nome || '');
      state.extras.set(key, list);
      state.allowMulti.add(key);
    }
  }
}

function findPoint(os) {
  if (Number.isFinite(Number(os.ponto1_latitude)) && Number.isFinite(Number(os.ponto1_longitude))) {
    return { latitude: Number(os.ponto1_latitude), longitude: Number(os.ponto1_longitude), origem: 'O.S.' };
  }

  const emb = String(os.embarque || '').trim();
  const ufMatch = emb.match(/^\s*([A-Z]{2})\s*[-–]\s*([^()]+?)(?:\(([^)]+)\))?\s*$/i);
  const uf = normalize(ufMatch?.[1] || '');
  const cidade = normalize(ufMatch?.[2] || '');
  const local = normalize(ufMatch?.[3] || emb);

  const candidates = state.pontos.filter((p) => {
    if (uf && normalize(p.uf) !== uf) return false;
    const pCidade = normalize(p.cidade);
    const pLocal = normalize(p.nome_local);
    if (cidade && pCidade && cidade !== pCidade) return false;
    if (!local) return true;
    return pLocal.includes(local) || local.includes(pLocal) || compactKey(pLocal).includes(compactKey(local)) || compactKey(local).includes(compactKey(pLocal));
  }).filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));

  return candidates[0] ? { ...candidates[0], origem: 'Mapa Operacional' } : null;
}

function assignedBigSet(exceptOsId = '') {
  const set = new Set();
  for (const os of state.os) {
    const id = osId(os);
    if (id === exceptOsId) continue;
    if (toIsoDate(os.data_os) === '') continue;
    if (String(os.status_gestor || '').toUpperCase() !== 'ATENDER') continue;
    if (num(os.remanescente) < LIMITE_MULTIPLOS) continue;
    for (const a of state.atribuicoes.filter((item) => String(item.os_id) === id)) {
      if (a.colaborador_key) set.add(String(a.colaborador_key));
    }
  }
  return set;
}

function suggestionsForOs(os) {
  const point = findPoint(os);
  if (!point) return { point: null, items: [], aviso: 'Ponto de embarque sem latitude/longitude no mapa operacional.' };
  const blocked = num(os.remanescente) >= LIMITE_MULTIPLOS ? assignedBigSet(osId(os)) : new Set();
  const items = state.colaboradores
    .map((c) => {
      const distancia = haversineKm(c.latitude, c.longitude, point.latitude, point.longitude);
      return { c, distancia };
    })
    .filter((row) => Number.isFinite(row.distancia))
    .filter((row) => !blocked.has(colabKey(row.c)))
    .sort((a, b) => a.distancia - b.distancia)
    .slice(0, 30);
  return { point, items, aviso: items.length ? '' : 'Nenhum colaborador com coordenada disponível para este ponto.' };
}

function refreshSuggestions() {
  state.suggested.clear();
  for (const os of state.os) {
    const id = osId(os);
    const result = suggestionsForOs(os);
    state.suggested.set(id, result);
    if (!state.selections.get(id) && result.items[0]) state.selections.set(id, colabKey(result.items[0].c));
  }
}

function filteredOs() {
  const term = normalize(state.filters.busca);
  const sup = state.filters.supervisao;
  const status = state.filters.status;
  return [...state.os]
    .filter((row) => !sup || row.supervisao === sup)
    .filter((row) => {
      if (!status) return true;
      const st = (row.status_gestor || 'AGUARDAR').toUpperCase();
      const isCinza = st === 'AGUARDAR' && !row.configurada_em;
      if (status === 'PENDENTE') return isCinza;
      if (status === 'AGUARDAR') return st === 'AGUARDAR' && !isCinza;
      return st === status;
    })
    .filter((row) => !term || normalize(`${row.numero_os} ${row.cliente} ${row.embarque} ${row.destino} ${row.supervisao}`).includes(term))
    .sort((a, b) => num(b.remanescente) - num(a.remanescente) || String(b.numero_os).localeCompare(String(a.numero_os)));
}

function renderCurrentTab() {
  const main = document.getElementById('appMain');
  if (!main) return;
  if (state.currentTab === 'inicio') return renderInicio(main);
  if (state.currentTab === 'os') return renderOs(main);
  if (state.currentTab === 'programacao') return renderProgramacao(main);
  return renderMais(main);
}

function renderInicio(main) {
  const totalPend = state.os.filter((o) => (o.status_gestor || 'AGUARDAR').toUpperCase() === 'AGUARDAR' && !o.configurada_em).length;
  const atender = state.os.filter((o) => String(o.status_gestor || '').toUpperCase() === 'ATENDER').length;
  main.innerHTML = `
    <section class="hero-card">
      <h1>Gestor Grão 1000</h1>
      <p>Escolha uma rotina abaixo. No celular, os módulos abrem sem sidebar e com botão de voltar para esta tela.</p>
      <div class="install-banner ${state.installPrompt ? 'is-visible' : ''}" id="installBanner">
        <div><b>Instalar app</b><br><span class="help">Adicione na tela inicial do celular.</span></div>
        <button class="btn" id="installBtn" type="button">Instalar</button>
      </div>
      <div class="quick-grid">
        <button class="quick-card is-primary" data-go="os" type="button"><b>OS</b><span>${totalPend} pendente(s) de ajuste</span></button>
        <a class="quick-card" href="${panelHref('programacao')}"><b>Programação</b><span>Abrir módulo completo</span></a>
        <a class="quick-card" href="${panelHref('hospedagem')}"><b>Hospedagem</b><span>Solicitações e reservas</span></a>
        <a class="quick-card" href="${panelHref('compras')}"><b>Compras</b><span>Solicitações do gestor</span></a>
        <a class="quick-card" href="${panelHref('logistica')}"><b>Logística</b><span>Distribuição e finalização</span></a>
        <a class="quick-card" href="${panelHref('patrimonios')}"><b>Patrimônios</b><span>Veículos e vínculos</span></a>
        <a class="quick-card" href="${panelHref('contato-cliente')}"><b>Contato Cliente</b><span>Visitas e registros</span></a>
      </div>
    </section>
    <section class="section-card">
      <div class="section-title"><div><h2>Resumo</h2><p>Leitura cacheada para abrir mais rápido no celular.</p></div></div>
      <div class="stat-grid">
        <div class="stat"><b>${state.os.length}</b><span>O.S. carregadas</span></div>
        <div class="stat"><b>${atender}</b><span>Para Conferência</span></div>
        <div class="stat"><b>${state.os.filter((o) => num(o.remanescente) === 0).length}</b><span>Remanescente zero</span></div>
        <div class="stat"><b>${state.colaboradores.length}</b><span>Colaboradores base</span></div>
      </div>
    </section>
  `;
  main.querySelector('[data-go="os"]')?.addEventListener('click', () => {
    state.currentTab = 'os';
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === 'os'));
    renderOs(main);
  });
  main.querySelector('#installBtn')?.addEventListener('click', async () => {
    if (!state.installPrompt) return;
    state.installPrompt.prompt();
    await state.installPrompt.userChoice.catch(() => null);
    state.installPrompt = null;
    renderInicio(main);
  });
}

function renderProgramacao(main) {
  main.innerHTML = `
    <section class="hero-card">
      <h1>Programação</h1>
      <p>Para a primeira versão do app, a edição completa da programação abre o módulo web atual.</p>
      <div class="quick-grid">
        <a class="quick-card is-primary" href="${panelHref('programacao')}"><b>Abrir Programação</b><span>Disponibilidade, estadia, alimentação e extras</span></a>
        <button class="quick-card" data-go="os" type="button"><b>Voltar para OS</b><span>Ajustar O.S. pendentes</span></button>
      </div>
    </section>
  `;
  main.querySelector('[data-go="os"]')?.addEventListener('click', () => {
    state.currentTab = 'os';
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.tab === 'os'));
    renderOs(main);
  });
}

function renderMais(main) {
  main.innerHTML = `
    <section class="hero-card">
      <h1>Mais módulos</h1>
      <p>Acesso rápido aos módulos do gestor sem abrir a sidebar do painel.</p>
      <div class="quick-grid">
        <a class="quick-card" href="${panelHref('hospedagem')}"><b>Hospedagem</b><span>Solicitações e reservas</span></a>
        <a class="quick-card" href="${panelHref('compras')}"><b>Compras</b><span>Solicitações</span></a>
        <a class="quick-card" href="${panelHref('logistica')}"><b>Logística</b><span>Deslocamentos</span></a>
        <a class="quick-card" href="${panelHref('patrimonios')}"><b>Patrimônios</b><span>Itens e solicitações</span></a>
        <a class="quick-card" href="${panelHref('contato-cliente')}"><b>Contato Cliente</b><span>Registros</span></a>
        <a class="quick-card" href="${panelHref('dashboard')}"><b>Painel Web</b><span>Versão completa</span></a>
      </div>
    </section>
  `;
}

function isOsAjustada(os) {
  const st = String(os.status_gestor || '').toUpperCase();
  if (st === 'ATENDER' || st === 'FINALIZAR' || st === 'AJUSTAR') return true;
  if (String(os.observacao_logistica || '').startsWith('KG solicitado')) return true;
  // Explicitly set AGUARDAR (has configurada_em) also counts as reviewed
  return st === 'AGUARDAR' && !!os.configurada_em;
}

function renderOsList(rows) {
  if (!rows.length) return '<section class="os-list" id="osList"><div class="empty">Nenhuma O.S. encontrada para o filtro atual.</div></section>';
  const pendentes = rows.filter((o) => !isOsAjustada(o));
  const ajustadas = rows.filter((o) => isOsAjustada(o));
  return `
    <section class="os-list" id="osList">
      ${pendentes.length ? pendentes.map(renderOsCard).join('') : '<div class="empty">Todas as O.S. do filtro foram ajustadas.</div>'}
      ${ajustadas.length ? `
        <div class="os-ajustadas-divider">
          <span>AJUSTADAS (${ajustadas.length})</span>
        </div>
        ${ajustadas.map(renderOsCard).join('')}
      ` : ''}
    </section>
  `;
}

function renderOs(main) {
  const supervisoes = [...new Set(state.os.map((o) => o.supervisao).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const rows = filteredOs();
  main.innerHTML = `
    <section class="section-card">
      <div class="section-title"><div><h2>Ordens de Serviço</h2><p>Indique colaboradores e envie para Conferência direto pelo app.</p></div></div>
      <div class="filter-grid">
        <div class="field"><label>Supervisão</label><select id="filterSupervisao"><option value="">Todas liberadas</option>${supervisoes.map((s) => `<option value="${escapeHtml(s)}" ${state.filters.supervisao === s ? 'selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select></div>
        <div class="field"><label>Status</label><select id="filterStatus"><option value="">Todos</option>${STATUS.map((s) => `<option value="${s}" ${state.filters.status === s ? 'selected' : ''}>${s}</option>`).join('')}</select></div>
        <div class="field"><label>Buscar</label><input id="filterBusca" value="${escapeHtml(state.filters.busca)}" placeholder="OS, cliente, embarque..." /></div>
      </div>
      <div class="stat-grid">
        <div class="stat"><b>${rows.length}</b><span>Dentro do filtro</span></div>
        <div class="stat"><b>${rows.filter((o) => String(o.status_gestor || '').toUpperCase() === 'ATENDER').length}</b><span>Para Conferência</span></div>
      </div>
    </section>
    ${renderOsList(rows)}
  `;
  main.querySelector('#filterSupervisao')?.addEventListener('change', (e) => { state.filters.supervisao = e.target.value; renderOs(main); });
  main.querySelector('#filterStatus')?.addEventListener('change', (e) => { state.filters.status = e.target.value; renderOs(main); });
  main.querySelector('#filterBusca')?.addEventListener('input', debounce((e) => { state.filters.busca = e.target.value; renderOs(main); }, 220));
  bindOsEvents(main);
}

function renderOsCard(os) {
  const id = osId(os);
  const isCinza = (os.status_gestor || 'AGUARDAR').toUpperCase() === 'AGUARDAR' && !os.configurada_em;
  const status = isCinza ? 'PENDENTE' : String(os.status_gestor).toUpperCase();
  const sugg = state.suggested.get(id) || { items: [], aviso: '' };
  const selected = state.selections.get(id) || (sugg.items[0] ? colabKey(sugg.items[0].c) : '');
  const selectedInfo = sugg.items.find((row) => colabKey(row.c) === selected) || null;
  const isNegativo = num(os.remanescente) < 0;
  const canMulti = num(os.remanescente) >= LIMITE_MULTIPLOS;
  const isMulti = state.allowMulti.has(id) && canMulti;
  const extraValues = state.extras.get(id) || [];
  const hasLaudo = String(os.observacao_logistica||'').startsWith('LAUDO:');
  const rowColor = isNegativo ? 'row-kg' : os.observacao_logistica?.startsWith('KG solicitado') ? 'row-kg' : status === 'AGUARDAR' ? 'row-aguardar' : status === 'ATENDER' ? 'row-atender' : status === 'FINALIZAR' ? 'row-finalizar' : status === 'AJUSTAR' ? 'row-ajustar' : '';
  return `
    <article class="os-card ${num(os.remanescente) === 0 ? 'is-zero' : ''} ${state.busy.has(id) ? 'is-updating' : ''} ${rowColor}" data-os-id="${escapeHtml(id)}">
      <div class="os-head">
        <div><div class="os-number">${escapeHtml(os.numero_os)}</div><div class="os-date">${brDate(os.data_os)} · ${escapeHtml(first(os.servico))}</div></div>
        <span class="status-badge ${escapeHtml(status)}">${escapeHtml(status)}</span>
      </div>
      <div class="os-client">${escapeHtml(first(os.cliente))}</div>
      <div class="os-route">
        <span>Emb.: ${escapeHtml(first(os.embarque))}</span>
        <span>Dest.: ${escapeHtml(first(os.destino))}</span>
        <span>${escapeHtml(first(os.supervisao))} · Contrato ${escapeHtml(first(os.contrato))} · ${escapeHtml(first(os.produto))}</span>
      </div>
      <div class="os-metrics">
        <div class="metric"><small>Rem.</small><b>${fmt(os.remanescente)}</b></div>
        <div class="metric"><small>Lote</small><b>${fmt(os.lote)}</b></div>
        <div class="metric"><small>Emb.</small><b>${fmt(os.embarcado)}</b></div>
      </div>
      <div class="indicacao-box">
        <select data-role="main-colab">
          <option value="">Selecionar colaborador</option>
          ${sugg.items.map(({ c, distancia }, index) => `<option value="${escapeHtml(colabKey(c))}" ${selected === colabKey(c) ? 'selected' : ''}>${index === 0 ? '⭐ ' : ''}${escapeHtml(c.nome)}${Number.isFinite(distancia) ? ` • ${KM.format(distancia)} km` : ''}</option>`).join('')}
        </select>
        ${selectedInfo ? `<div class="help ok">Indicação: ${escapeHtml(selectedInfo.c.nome)} · ${KM.format(selectedInfo.distancia)} km do ponto operacional.</div>` : `<div class="help warn">${escapeHtml(sugg.aviso || 'Selecione um colaborador para enviar à Conferência.')}</div>`}
        ${canMulti ? `<label class="multi-line"><input data-role="allow-multi" type="checkbox" ${isMulti ? 'checked' : ''} /> permitir 2 ou mais colaboradores</label>` : ''}
        ${canMulti && isMulti ? renderExtraSelects(id, sugg.items, selected, extraValues) : ''}
      </div>
      <div class="action-grid">
        ${isNegativo
          ? `<button class="btn secondary ${hasLaudo ? 'kg-active' : ''}" data-action-laudo="${escapeHtml(id)}" data-action-laudo-num="${escapeHtml(os.numero_os)}" type="button" title="Anexar laudo para conferência" style="color:#fca5a5;border-color:rgba(239,68,68,.4);grid-column:span 6;font-size:18px;font-weight:950">!</button>`
          : `<div class="status-dot ${isCinza ? 'is-active' : ''}" title="Sem ação definida"><span class="dot"></span></div>
        <button class="btn ${status === 'AGUARDAR' ? 'warn' : 'secondary'}" data-action="AGUARDAR" type="button" title="Aguardar">${ICO_AGUARDAR}</button>
        <button class="btn ${status === 'ATENDER' ? '' : 'secondary'}" data-action="ATENDER" type="button" title="Atender">${ICO_ATENDER}</button>
        <button class="btn ${status === 'FINALIZAR' ? '' : 'secondary'}" data-action="FINALIZAR" type="button" title="Finalizar">${ICO_FINALIZAR}</button>
        <button class="btn ${status === 'AJUSTAR' ? 'ajustar' : 'secondary'}" data-action="AJUSTAR" type="button" title="Ajustar saldo">${ICO_AJUSTAR}</button>
        <button class="btn secondary ${os.observacao_logistica?.startsWith('KG solicitado') ? 'kg-active' : ''}" data-action-kg="${escapeHtml(id)}" data-action-kg-num="${escapeHtml(os.numero_os)}" type="button" title="Solicitar KG para Logística" style="color:#90cdf4;border-color:rgba(99,179,237,.35)">${ICO_SOMAR_KG}</button>`
        }
      </div>
      <label class="tomorrow-label"><input type="checkbox" data-toggle-tomorrow="${escapeHtml(id)}" ${state.tomorrow.has(id) ? 'checked' : ''} /> Salvar para amanhã</label>
    </article>
  `;
}

function renderExtraSelects(id, suggestions, selected, extraValues) {
  const values = extraValues.length ? extraValues : [''];
  return `<div class="indicacao-box" data-role="extras">${values.map((value, idx) => `
    <select data-role="extra-colab" data-index="${idx}">
      <option value="">${idx + 2}º colaborador na mesma O.S.</option>
      ${suggestions.filter(({ c }) => colabKey(c) !== selected).map(({ c, distancia }) => `<option value="${escapeHtml(colabKey(c))}" ${value === colabKey(c) ? 'selected' : ''}>${escapeHtml(c.nome)}${Number.isFinite(distancia) ? ` • ${KM.format(distancia)} km` : ''}</option>`).join('')}
    </select>`).join('')}
    <button class="btn secondary" data-role="add-extra" type="button">+ outro colaborador</button>
  </div>`;
}

function bindOsEvents(scope) {
  scope.querySelectorAll('[data-role="main-colab"]').forEach((select) => {
    select.addEventListener('change', (e) => {
      const card = e.target.closest('[data-os-id]');
      const id = card?.dataset.osId;
      if (!id) return;
      state.selections.set(id, e.target.value);
      state.extras.set(id, (state.extras.get(id) || []).filter((v) => v && v !== e.target.value));
      renderOs(document.getElementById('appMain'));
    });
  });
  scope.querySelectorAll('[data-role="allow-multi"]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      if (!id) return;
      if (e.target.checked) state.allowMulti.add(id);
      else { state.allowMulti.delete(id); state.extras.delete(id); }
      renderOs(document.getElementById('appMain'));
    });
  });
  scope.querySelectorAll('[data-role="extra-colab"]').forEach((select) => {
    select.addEventListener('change', (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      if (!id) return;
      const index = Number(e.target.dataset.index) || 0;
      const list = state.extras.get(id) || [];
      list[index] = e.target.value;
      state.extras.set(id, [...new Set(list.filter(Boolean))]);
      renderOs(document.getElementById('appMain'));
    });
  });
  scope.querySelectorAll('[data-role="add-extra"]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      if (!id) return;
      const list = state.extras.get(id) || [];
      list.push('');
      state.extras.set(id, list);
      renderOs(document.getElementById('appMain'));
    });
  });
  scope.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      const status = e.target.dataset.action;
      if (!id || !status) return;
      await saveOsStatus(id, status);
    });
  });
  scope.querySelectorAll('[data-action-kg]').forEach((btn) => {
    btn.addEventListener('click', () => openKgModal(btn.dataset.actionKg, btn.dataset.actionKgNum));
  });
  scope.querySelectorAll('[data-action-laudo]').forEach((btn) => {
    btn.addEventListener('click', () => openLaudoModal(btn.dataset.actionLaudo, btn.dataset.actionLaudoNum));
  });
  scope.querySelectorAll('[data-toggle-tomorrow]').forEach((input) => {
    input.addEventListener('change', (e) => {
      const id = e.target.closest('[data-os-id]')?.dataset.osId;
      if (!id) return;
      if (e.target.checked) state.tomorrow.add(id);
      else state.tomorrow.delete(id);
    });
  });
}

function openKgModal(recordId, osNumero) {
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
    const row = state.os.find((o) => osId(o) === recordId);
    if (row) { row.observacao_logistica = kgText; row.status_gestor = 'AGUARDAR'; row.configurada_em = null; }
    overlay.remove();
    renderOs(document.getElementById('appMain'));
    showToast('Solicitação enviada para a Logística.', 'success');
    supabase.from('operacional_os').update({ observacao_logistica: kgText, status_gestor: 'AGUARDAR', configurada_em: null, updated_at: new Date().toISOString() }).eq('id', recordId);
  });
}

function openLaudoModal(recordId, osNumero) {
  const existing = document.getElementById('kg-modal-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'kg-modal-overlay';
  overlay.className = 'kg-overlay';
  overlay.innerHTML = `
    <div class="kg-modal">
      <h3>Anexar laudo para O.S. ${escapeHtml(osNumero)}</h3>
      <p style="margin:0;font-size:12px;color:#6b7280">Remanescente negativo — anexe imagens, planilhas ou PDFs para conferência.</p>
      <div id="laudo-dropzone" style="border:2px dashed rgba(239,68,68,.35);border-radius:14px;padding:28px 16px;text-align:center;color:#6b7280;cursor:pointer;margin-top:8px;font-size:13px;transition:border-color .15s">
        Clique ou arraste arquivos aqui<br><small style="font-size:11px">imagens, PDF, Excel, CSV</small>
      </div>
      <input id="laudo-file-input" type="file" multiple accept="image/*,.pdf,.xlsx,.xls,.csv" style="display:none" />
      <div id="laudo-file-list" style="margin-top:8px;font-size:12px;color:#bbf7d0;min-height:20px"></div>
      <div class="kg-modal-actions">
        <button class="kg-btn-cancel" id="laudoCancelar">Cancelar</button>
        <button class="kg-btn-confirm" id="laudoEnviar">Enviar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const dropzone = overlay.querySelector('#laudo-dropzone');
  const fileInput = overlay.querySelector('#laudo-file-input');
  const fileList = overlay.querySelector('#laudo-file-list');
  let selectedFiles = [];

  function updateFileList() {
    fileList.textContent = selectedFiles.map((f) => f.name).join(', ') || '';
  }

  dropzone.addEventListener('click', () => fileInput.click());
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.style.borderColor = 'rgba(239,68,68,.7)'; });
  dropzone.addEventListener('dragleave', () => { dropzone.style.borderColor = 'rgba(239,68,68,.35)'; });
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.style.borderColor = 'rgba(239,68,68,.35)';
    selectedFiles = [...(e.dataTransfer.files || [])];
    updateFileList();
  });
  fileInput.addEventListener('change', () => {
    selectedFiles = [...(fileInput.files || [])];
    updateFileList();
  });

  overlay.querySelector('#laudoCancelar').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  overlay.querySelector('#laudoEnviar').addEventListener('click', async () => {
    if (!selectedFiles.length) { dropzone.style.borderColor = 'rgba(239,68,68,.9)'; return; }
    const btn = overlay.querySelector('#laudoEnviar');
    btn.disabled = true;
    btn.textContent = 'Enviando...';

    const urls = [];
    for (const file of selectedFiles) {
      const path = `${recordId}/${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const { data: upData, error: upErr } = await supabase.storage.from('os-laudos').upload(path, file, { upsert: true });
      if (upErr) { alert(upErr.message); btn.disabled = false; btn.textContent = 'Enviar'; return; }
      const { data: urlData } = supabase.storage.from('os-laudos').getPublicUrl(upData.path);
      urls.push(urlData.publicUrl);
    }

    const laudoText = `LAUDO:${urls.join(',')}`;
    const row = state.os.find((o) => osId(o) === recordId);
    if (row) row.observacao_logistica = laudoText;
    overlay.remove();
    renderOs(document.getElementById('appMain'));
    showToast('Laudo anexado com sucesso.', 'success');
    supabase.from('operacional_os').update({ observacao_logistica: laudoText, updated_at: new Date().toISOString() }).eq('id', recordId);
  });
}

async function saveOsStatus(id, status) {
  const os = state.os.find((row) => osId(row) === id);
  if (!os) return;
  const selected = state.selections.get(id) || '';
  const suggestions = state.suggested.get(id)?.items || [];
  const selectedInfo = suggestions.find((row) => colabKey(row.c) === selected) || suggestions[0] || null;

  let colabKeys = [];
  if (status === 'ATENDER') {
    const main = selected || (selectedInfo ? colabKey(selectedInfo.c) : '');
    if (!main) {
      showToast('A O.S. não pode ir para Conferência sem colaborador indicado.', 'error');
      return;
    }
    colabKeys = [main];
    if (num(os.remanescente) >= LIMITE_MULTIPLOS && state.allowMulti.has(id)) {
      colabKeys.push(...(state.extras.get(id) || []));
    }
    colabKeys = [...new Set(colabKeys.filter(Boolean))];
  }

  const isTomorrow = state.tomorrow.has(id);
  const configuradaEm = isTomorrow
    ? (() => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(0, 0, 0, 0); return d.toISOString(); })()
    : new Date().toISOString();

  state.busy.add(id);
  os.status_gestor = status;
  os.configurada_em = configuradaEm;
  os.observacao_logistica = null;
  os.permitir_mais_classificadores = state.allowMulti.has(id) && num(os.remanescente) >= LIMITE_MULTIPLOS;
  renderOs(document.getElementById('appMain'));

  try {
    if (status === 'ATENDER') {
      const rows = colabKeys.map((key) => {
        const hit = suggestions.find((row) => colabKey(row.c) === key);
        const c = hit?.c || state.colaboradores.find((row) => colabKey(row) === key) || {};
        return {
          os_id: id,
          colaborador_key: key,
          colaborador_nome: c.nome || key,
          colaborador_cpf: c.cpf || null,
          distancia_km: Number.isFinite(hit?.distancia) ? hit.distancia : null,
          origem_sugestao: hit ? 'APP_GESTOR_DISTANCIA' : 'APP_GESTOR_MANUAL',
          indicado_por: state.user?.id || null,
          updated_at: new Date().toISOString(),
        };
      });
      await supabase.from('operacional_os_colaboradores').delete().eq('os_id', id);
      const { error: insError } = await supabase.from('operacional_os_colaboradores').insert(rows);
      if (insError) throw insError;
    }

    const { error } = await supabase.from('operacional_os').update({
      status_gestor: status,
      observacao_logistica: null,
      permitir_mais_classificadores: os.permitir_mais_classificadores,
      configurada_em: configuradaEm,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    if (error) throw error;

    if (status === 'ATENDER' && colabKeys.length) {
      const dataOs = String(os.data_os || '').slice(0, 10);
      if (dataOs && os.supervisao) {
        try {
          const { data: progDia } = await supabase
            .from('programacao_dia')
            .select('id')
            .eq('data_referencia', dataOs)
            .eq('supervisao', os.supervisao)
            .maybeSingle();
          if (progDia?.id) {
            await supabase
              .from('programacao_colaboradores')
              .update({ disponibilidade: 'OK' })
              .eq('programacao_id', progDia.id)
              .in('colaborador_id', colabKeys)
              .eq('disponibilidade', 'SEM EMBARQUE');
          }
        } catch (_) {}
      }
    }

    clearCache();
    await loadData({ useCache: false });
    renderOs(document.getElementById('appMain'));
    showToast(`O.S. ${os.numero_os} marcada como ${status}.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || 'Não foi possível salvar a O.S.', 'error');
    await loadData({ useCache: false });
    renderOs(document.getElementById('appMain'));
  } finally {
    state.busy.delete(id);
  }
}

function debounce(fn, wait = 250) {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
}

boot().catch((error) => {
  console.error(error);
  app.innerHTML = `<div class="app-loader"><strong>Erro ao abrir o app</strong><span>${escapeHtml(error.message || error)}</span></div>`;
});
