import { toPanelUrl } from './paths.js';
import { PANEL_MENU } from './menuConfig.js';
import { supabase } from './supabaseClient.js';

const MENU_STORAGE_KEY = 'painel_sidebar_open_sections';
const PREFETCHED_URLS = new Set();

function normalizeCode(value = '') {
  return String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function isGestorContext(userContext) {
  const role = normalizeCode(userContext?.user?.role || userContext?.perfil_codigo || userContext?.perfil_nome || userContext?.role);
  const department = normalizeCode(userContext?.department?.code || userContext?.department?.name || userContext?.setor);
  return role === 'gestor' || department === 'gestor';
}

function prefetchUrl(url) {
  try {
    const absolute = new URL(url, window.location.href).toString();
    if (PREFETCHED_URLS.has(absolute)) return;
    PREFETCHED_URLS.add(absolute);

    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = absolute;
    link.as = 'document';
    document.head.appendChild(link);
  } catch {}
}

function shouldHandleAsNormalNavigation(event) {
  return !(
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

function loadOpenSections() {
  try {
    const raw = localStorage.getItem(MENU_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOpenSections(sectionNames) {
  try {
    localStorage.setItem(MENU_STORAGE_KEY, JSON.stringify(sectionNames));
  } catch {}
}


function buildPanelHref(path = '') {
  const target = String(path || '')
    .replace(/^\/+/, '')
    .replace(/\.html$/i, '');

  const host = String(window.location.hostname || '').toLowerCase();
  if (host === 'grao1000.com.br' || host === 'www.grao1000.com.br') {
    return target ? `/painel/${target}`.replace(/([^:]\/)\/+/, '$1') : '/painel';
  }

  return toPanelUrl(target);
}

function normalizePath(value = '') {
  return ('/' + String(value || '').replace(/^\.\//, '').replace(/^\//, '')).replace(/\/+/g, '/');
}

function buildAllowedCodeSet(userContext) {
  const set = new Set();
  for (const mod of userContext?.modules || []) {
    if (mod?.can_view === false) continue;
    const code = normalizeCode(mod?.code);
    if (code) set.add(code);
  }
  return set;
}

function isItemAllowed(item, allowedCodes) {
  const candidates = [item.code, ...(Array.isArray(item.aliases) ? item.aliases : [])]
    .map(normalizeCode)
    .filter(Boolean);
  return candidates.some((code) => allowedCodes.has(code));
}

function ensureOperationalSection(menuSections, userContext) {
  const sections = Array.isArray(menuSections) ? menuSections.map((section) => ({ ...section, items: [...(section.items || [])] })) : [];
  const hasOperational = sections.some((section) => normalizeCode(section.section) === 'operacional');
  if (hasOperational) return sections;

  const operationalItem = {
    code: 'operacional_mapa',
    label: 'Mapa de Direcionamento',
    path: 'adm-operacional',
    aliases: ['OPERACIONAL', 'OPERACIONAL_MAPA', 'MAPA_DIRECIONAMENTO']
  };

  const canShow = Boolean(userContext?.user?.is_master) || isItemAllowed(operationalItem, buildAllowedCodeSet(userContext));
  if (!canShow) return sections;

  const indexRh = sections.findIndex((section) => normalizeCode(section.section) === 'recursos humanos');
  const insertAt = indexRh >= 0 ? indexRh + 1 : sections.length;
  sections.splice(insertAt, 0, { section: 'OPERACIONAL', items: [operationalItem] });
  return sections;
}


const FINANCEIRO_FAILSAFE_ITEMS = [
  {
    code: 'financeiro_fluxo_caixa',
    label: 'Fluxo de Caixa',
    path: 'financeiro',
    aliases: ['FINANCEIRO', 'FLUXO_CAIXA', 'FINANCEIRO_FLUXO_CAIXA']
  },
  {
    code: 'financeiro_despesas',
    label: 'Despesas',
    path: 'financeiro#despesas',
    aliases: ['DESPESAS', 'FINANCEIRO_DESPESAS', 'ADIANTAMENTOS', 'FINANCEIRO_ADIANTAMENTOS', 'ALIMENTACAO', 'ALIMENTAÇÃO', 'FINANCEIRO_ALIMENTACAO', 'DIARIAS', 'DIÁRIAS']
  },
  {
    code: 'financeiro_pagamentos',
    label: 'Pagamentos',
    path: 'financeiro#pagamentos',
    aliases: ['FINANCEIRO', 'PAGAMENTOS', 'FINANCEIRO_PAGAMENTOS']
  }
];

function ensureFinanceiroSection(menuSections, userContext) {
  const sections = Array.isArray(menuSections)
    ? menuSections.map((section) => ({
        ...section,
        items: (section.items || []).filter((item) => {
          const itemCode = normalizeCode(item?.code || item?.label || item?.path);
          const itemLabel = normalizeCode(item?.label || item?.nome || item?.modulo || '');
          const itemPath = normalizeCode(item?.path || item?.rota || '');
          const sectionCode = normalizeCode(section?.section);
          if (sectionCode === 'diretoria' && itemCode === 'financeiro') return false;
          if (sectionCode === 'financeiro') {
            const isOldAdiantamento = itemCode.includes('adiantamento') || itemLabel.includes('adiantamento');
            const isOldAlimentacao = itemCode.includes('alimentacao') || itemLabel.includes('alimentacao');
            const oldPointsToPayments = itemPath.includes('financeiro#pagamentos');
            if ((isOldAdiantamento || isOldAlimentacao) && oldPointsToPayments) return false;
          }
          return true;
        }),
      }))
    : [];

  const allowedCodes = buildAllowedCodeSet(userContext);
  const fallbackItems = Boolean(userContext?.user?.is_master)
    ? FINANCEIRO_FAILSAFE_ITEMS
    : FINANCEIRO_FAILSAFE_ITEMS.filter((item) => isItemAllowed(item, allowedCodes));

  if (!fallbackItems.length) return sections.filter((section) => section.items.length > 0);

  const financeiroIndex = sections.findIndex((section) => normalizeCode(section.section) === 'financeiro');
  if (financeiroIndex >= 0) {
    fallbackItems.forEach((fallbackItem) => {
      const exists = sections[financeiroIndex].items.some((item) => normalizeCode(item.code) === normalizeCode(fallbackItem.code));
      if (!exists) sections[financeiroIndex].items.push(fallbackItem);
    });
    return sections.filter((section) => section.items.length > 0);
  }

  const relatoriosIndex = sections.findIndex((section) => normalizeCode(section.section) === 'relatorios');
  const diretoriaIndex = sections.findIndex((section) => normalizeCode(section.section) === 'diretoria');
  const insertAt = relatoriosIndex >= 0 ? relatoriosIndex + 1 : (diretoriaIndex >= 0 ? diretoriaIndex : sections.length);
  sections.splice(insertAt, 0, { section: 'FINANCEIRO', items: fallbackItems });
  return sections.filter((section) => section.items.length > 0);
}

const FROTAS_FAILSAFE_ITEMS = [
  {
    code: 'frotas_excesso_velocidade',
    label: 'Excesso de Velocidade',
    path: 'frotas',
    aliases: ['FROTAS', 'EXCESSO_VELOCIDADE', 'FROTAS_EXCESSO_VELOCIDADE']
  },
  {
    code: 'frotas_veiculos',
    label: 'Veículos',
    path: 'frotas-veiculos',
    aliases: ['FROTAS_VEICULOS', 'VEICULOS', 'VEÍCULOS', 'FROTA_VEICULOS']
  },
  {
    code: 'frotas_multas',
    label: 'Multas',
    path: 'frotas-multas',
    aliases: ['MULTAS', 'FROTAS_MULTAS']
  },
  {
    code: 'frotas_historico',
    label: 'Histórico',
    path: 'frotas-historico',
    aliases: ['FROTAS_HISTORICO', 'HISTORICO_FROTAS']
  }
];

const TI_FAILSAFE_ITEMS = [
  {
    code: 'ti_integracoes',
    label: 'Integrações',
    path: 'ti-integracoes',
    aliases: ['TI', 'INTEGRACOES', 'TI_INTEGRACOES', 'CONFIG_INTEGRACOES']
  }
];

function ensureTiSection(menuSections, userContext) {
  const sections = Array.isArray(menuSections)
    ? menuSections.map((section) => ({ ...section, items: [...(section.items || [])] }))
    : [];

  const allowedCodes = buildAllowedCodeSet(userContext);
  const fallbackItems = Boolean(userContext?.user?.is_master)
    ? TI_FAILSAFE_ITEMS
    : TI_FAILSAFE_ITEMS.filter((item) => isItemAllowed(item, allowedCodes));

  if (!fallbackItems.length) return sections;

  const tiIndex = sections.findIndex((section) => normalizeCode(section.section) === 'ti');
  if (tiIndex >= 0) {
    fallbackItems.forEach((fallbackItem) => {
      const exists = sections[tiIndex].items.some((item) => normalizeCode(item.code) === normalizeCode(fallbackItem.code));
      if (!exists) sections[tiIndex].items.push(fallbackItem);
    });
    return sections;
  }

  const frotasIndex = sections.findIndex((section) => normalizeCode(section.section) === 'frotas');
  const insertAt = frotasIndex >= 0 ? frotasIndex + 1 : sections.length;
  sections.splice(insertAt, 0, { section: 'TI', items: fallbackItems });
  return sections;
}


function ensureFrotasSection(menuSections, userContext) {
  const sections = Array.isArray(menuSections)
    ? menuSections.map((section) => ({ ...section, items: [...(section.items || [])] }))
    : [];

  const allowedCodes = buildAllowedCodeSet(userContext);
  const fallbackItems = Boolean(userContext?.user?.is_master)
    ? FROTAS_FAILSAFE_ITEMS
    : FROTAS_FAILSAFE_ITEMS.filter((item) => isItemAllowed(item, allowedCodes));

  if (!fallbackItems.length) return sections;

  const frotasIndex = sections.findIndex((section) => normalizeCode(section.section) === 'frotas');
  if (frotasIndex >= 0) {
    fallbackItems.forEach((fallbackItem) => {
      const exists = sections[frotasIndex].items.some((item) => normalizeCode(item.code) === normalizeCode(fallbackItem.code));
      if (!exists) sections[frotasIndex].items.push(fallbackItem);
    });
    return sections;
  }

  const operacionalIndex = sections.findIndex((section) => normalizeCode(section.section) === 'operacional');
  const insertAt = operacionalIndex >= 0 ? operacionalIndex + 1 : sections.length;
  sections.splice(insertAt, 0, { section: 'FROTAS', items: fallbackItems });
  return sections;
}

export function buildAllowedMenu(userContext) {
  if (!userContext) return [];

  if (userContext.user?.is_master) {
    return ensureFinanceiroSection(ensureTiSection(ensureFrotasSection(ensureOperationalSection(PANEL_MENU.map((section) => ({ ...section, items: [...section.items] })), userContext), userContext), userContext), userContext);
  }

  // Regra de segurança visual: perfil/setor GESTOR enxerga somente INÍCIO + GESTOR.
  // Mesmo que algum contexto antigo/cache retorne módulos administrativos, eles não entram no menu.
  if (isGestorContext(userContext)) {
    const allowedSections = new Set(['inicio', 'gestor']);
    return PANEL_MENU
      .filter((section) => allowedSections.has(normalizeCode(section.section)))
      .map((section) => ({ ...section, items: [...section.items] }))
      .filter((section) => section.items.length > 0);
  }

  const allowedCodes = buildAllowedCodeSet(userContext);

  return ensureFinanceiroSection(ensureTiSection(ensureFrotasSection(ensureOperationalSection(PANEL_MENU
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => isItemAllowed(item, allowedCodes)),
    }))
    .filter((section) => section.items.length > 0), userContext), userContext), userContext), userContext);
}

export function flattenAllowedMenu(userContext) {
  return buildAllowedMenu(userContext).flatMap((section) =>
    section.items.map((item) => ({ ...item, section: section.section }))
  );
}


function ensureProgramacaoBlockStyle() {
  if (document.getElementById('programacao-os-block-style')) return;
  const style = document.createElement('style');
  style.id = 'programacao-os-block-style';
  style.textContent = `
    .menu-list a.os-pending-blocked{
      color:#fecaca !important;
      border-color:rgba(239,68,68,.55) !important;
      background:rgba(127,29,29,.28) !important;
      box-shadow:inset 3px 0 0 #ef4444;
    }
    .menu-list a.os-pending-blocked::after{
      content:'OS pendente';
      display:inline-flex;
      margin-left:8px;
      padding:2px 6px;
      border-radius:999px;
      font-size:10px;
      font-weight:900;
      color:#7f1d1d;
      background:#fecaca;
      vertical-align:middle;
    }
  `;
  document.head.appendChild(style);
}

async function markProgramacaoIfOsPending(container, userContext) {
  try {
    const programacaoLink = [...container.querySelectorAll('a')].find((link) => normalizePath(link.getAttribute('href') || '').includes('/programacao'));
    if (!programacaoLink) return;

    const today = new Date().toISOString().slice(0, 10);
    const supervisoes = Array.isArray(userContext?.user?.supervisoes) && userContext.user.supervisoes.length
      ? userContext.user.supervisoes
      : userContext?.user?.supervisao
        ? [userContext.user.supervisao]
        : null;

    let query = supabase
      .from('operacional_os')
      .select('id')
      .is('status_gestor', null)
      .gte('data_os', today)
      .lte('data_os', today);

    if (supervisoes?.length) {
      query = query.in('supervisao', supervisoes);
    }

    const { data, error } = await query.limit(1);
    if (error || !Array.isArray(data) || !data.length) return;
    ensureProgramacaoBlockStyle();
    programacaoLink.classList.add('os-pending-blocked');
    programacaoLink.title = 'Existem O.S. pendentes. Ajuste o submenu OS antes de acessar Programação.';
    if (!programacaoLink.dataset.osPendingBound) {
      programacaoLink.addEventListener('click', (event) => {
        if (!programacaoLink.classList.contains('os-pending-blocked')) return;
        event.preventDefault();
        alert('Antes de acessar Programação, ajuste as O.S. pendentes no submenu OS.');
        window.location.href = buildPanelHref('os');
      });
      programacaoLink.dataset.osPendingBound = '1';
    }
  } catch (error) {
    console.warn('Não foi possível validar pendências de O.S. para o menu.', error);
  }
}

const SECTION_ICONS = {
  'INÍCIO':            `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M3 12L5 10M5 10L12 3L19 10M5 10V20a1 1 0 001 1h3M19 10V20a1 1 0 01-1 1h-3M9 21V15a1 1 0 011-1h4a1 1 0 011 1v6M9 21h6"/></svg>`,
  'GESTOR':            `<svg class="menu-section-icon" viewBox="0 0 24 24"><rect x="5" y="2" width="14" height="20" rx="2"/><path d="M9 7h6M9 11h6M9 15h4"/></svg>`,
  'CONFERÊNCIA':       `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>`,
  'COMPRAS':           `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.3 2.3c-.6.6-.2 1.7.7 1.7H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z"/></svg>`,
  'PATRIMÔNIOS':       `<svg class="menu-section-icon" viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`,
  'HOSPEDAGEM':        `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M3 22V9l9-7 9 7v13M9 22V12h6v10"/></svg>`,
  'RECURSOS HUMANOS':  `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>`,
  'OPERACIONAL':       `<svg class="menu-section-icon" viewBox="0 0 24 24"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>`,
  'FROTAS':            `<svg class="menu-section-icon" viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>`,
  'FINANCEIRO':        `<svg class="menu-section-icon" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg>`,
  'NOTAS FISCAIS':     `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  'LOGÍSTICA':         `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M5 17H3a2 2 0 01-2-2V5a2 2 0 012-2h11a2 2 0 012 2v3M9 21H5a2 2 0 01-2-2v-4a2 2 0 012-2h4a2 2 0 012 2v4a2 2 0 01-2 2zm8-8h4a2 2 0 012 2v4a2 2 0 01-2 2h-4a2 2 0 01-2-2v-4a2 2 0 012-2z"/></svg>`,
  'AUDITORIA':         `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
  'RELATÓRIOS':        `<svg class="menu-section-icon" viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6"  y1="20" x2="6"  y2="14"/></svg>`,
  'TI':                `<svg class="menu-section-icon" viewBox="0 0 24 24"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>`,
  'DIRETORIA':         `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`,
  'ADMINISTRAÇÃO':     `<svg class="menu-section-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06-.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>`,
  'TROCA DE NOTAS':    `<svg class="menu-section-icon" viewBox="0 0 24 24"><path d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>`,
};

function getSectionIcon(sectionName = '') {
  const key = sectionName.toUpperCase().trim();
  for (const [k, v] of Object.entries(SECTION_ICONS)) {
    if (key === k || key.startsWith(k)) return v;
  }
  return `<svg class="menu-section-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/></svg>`;
}

export function renderMenu(container, menuSections, currentPath = '', userContext = null) {
  if (!container) return;

  container.innerHTML = '';
  const normalizedCurrent = normalizePath(`${currentPath || window.location.pathname}${window.location.hash || ''}`);
  const storedOpenSections = new Set(loadOpenSections());

  menuSections.forEach((section) => {
    const sectionEl = document.createElement('section');
    sectionEl.className = 'menu-section';

    const hasItems = Array.isArray(section.items) && section.items.length > 0;
    const hasActiveItem = (section.items || []).some((item) => {
      const normalizedItemPath = normalizePath(item.path);
      return (
        normalizedCurrent.endsWith(normalizedItemPath) ||
        normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, '')) ||
        normalizedCurrent.endsWith(normalizedItemPath + '.html')
      );
    });

    const titleBtn = document.createElement('button');
    titleBtn.type = 'button';
    titleBtn.className = 'menu-section-toggle';
    if (hasActiveItem) titleBtn.classList.add('is-active');

    const iconEl = document.createElement('span');
    iconEl.innerHTML = getSectionIcon(section.section);

    const titleText = document.createElement('span');
    titleText.className = 'menu-section-toggle-text';
    titleText.textContent = section.section;

    const caret = document.createElement('span');
    caret.className = 'menu-section-caret';
    caret.textContent = hasItems ? '▾' : '•';

    titleBtn.appendChild(iconEl);
    titleBtn.appendChild(titleText);
    titleBtn.appendChild(caret);
    sectionEl.appendChild(titleBtn);

    const listWrap = document.createElement('div');
    listWrap.className = 'menu-section-body';

    const isOpen = hasItems && (hasActiveItem || storedOpenSections.has(section.section) || menuSections.length <= 3);

    if (!isOpen) {
      listWrap.hidden = true;
      titleBtn.classList.add('is-collapsed');
    }

    if (hasItems) {
      const list = document.createElement('ul');
      list.className = 'menu-list';

      section.items.forEach((item) => {
        const li = document.createElement('li');
        const link = document.createElement('a');
        link.href = buildPanelHref(item.path);

        const dot = document.createElement('span');
        dot.className = 'menu-item-dot';
        const label = document.createElement('span');
        label.textContent = item.label;
        link.appendChild(dot);
        link.appendChild(label);

        const normalizedItemPath = normalizePath(item.path);
        if (
          normalizedCurrent.endsWith(normalizedItemPath) ||
          normalizedCurrent.endsWith('/' + normalizedItemPath.replace(/^\//, '')) ||
          normalizedCurrent.endsWith(normalizedItemPath + '.html')
        ) {
          link.classList.add('active');
        }

        link.addEventListener('mouseenter', () => prefetchUrl(link.href), { passive: true });
        link.addEventListener('focus', () => prefetchUrl(link.href), { passive: true });
        link.addEventListener('touchstart', () => prefetchUrl(link.href), { passive: true, once: true });
        link.addEventListener('click', (event) => {
          if (!shouldHandleAsNormalNavigation(event)) return;
          document.documentElement.classList.add('is-route-transitioning');
        });

        li.appendChild(link);
        list.appendChild(li);
      });

      listWrap.appendChild(list);

      titleBtn.addEventListener('click', () => {
        const willOpen = listWrap.hidden;
        listWrap.hidden = !willOpen;
        titleBtn.classList.toggle('is-collapsed', !willOpen);

        const openSections = new Set(loadOpenSections());
        if (willOpen) openSections.add(section.section);
        else openSections.delete(section.section);
        saveOpenSections([...openSections]);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'menu-empty';
      empty.textContent = 'Em implantação';
      listWrap.appendChild(empty);
    }

    sectionEl.appendChild(listWrap);
    container.appendChild(sectionEl);
  });

  markProgramacaoIfOsPending(container, userContext);
}
