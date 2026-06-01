import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser, getUserContext } from './auth.js';

const STEPS = [
  { code: 'A', label: 'Disponibilidade' },
  { code: 'B', label: 'Estadia' },
  { code: 'C', label: 'Alimentação' },
  { code: 'D', label: 'Deslocamento' },
  { code: 'E', label: 'Extras' },
];

const DISPONIBILIDADES = ['OK', 'LOGISTICA', 'DESLOCAMENTO', 'SEM EMBARQUE', 'INDISPONIVEL', 'ATESTADO', 'FALTA', 'FERIAS', 'FOLGA'];
const DISPONIBILIDADES_PRINCIPAIS = ['OK', 'LOGISTICA', 'DESLOCAMENTO', 'SEM EMBARQUE', 'INDISPONIVEL'];
const INDISPONIBILIDADE_MOTIVOS = ['ATESTADO', 'FALTA', 'FERIAS', 'FOLGA'];
const TIPOS_ESTADIA = ['CASA', 'PERNOITE', 'ALOJAMENTO', 'HOTEL'];
const TIPOS_DESLOCAMENTO = ['NÃO PRECISA', 'MOTORISTA FROTA', 'CARONA FROTA', 'UBER/TÁXI', 'REEMBOLSO KM', 'ÔNIBUS', 'OUTRO'];
const TIPOS_EXTRA = ['ESTADIA', 'RECARGA', 'LAVAGEM', 'MANUTENÇÃO VEÍCULO', 'PEDÁGIO', 'ESTACIONAMENTO', 'MATERIAL', 'OUTRO'];
const DISPONIBILIDADES_LIBERADAS = new Set(['', 'OK', 'DISPONIVEL', 'LIBERADO', 'LOGISTICA', 'DESLOCAMENTO']);

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function todayIso() {
  const now = new Date();
  const tz = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - tz).toISOString().slice(0, 10);
}

function normalizeCpf(value) {
  return String(value || '').replace(/\D/g, '');
}

function colaboradorKey(colab) {
  return normalizeCpf(colab.cpf) || String(colab.id || colab.nome || '').trim();
}

function toNumberBR(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const clean = String(value ?? '').replace(/\./g, '').replace(',', '.').replace(/[^0-9.-]/g, '');
  const parsed = Number(clean);
  return Number.isFinite(parsed) ? parsed : 0;
}

function moneyBR(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function normalizeUF(value) {
  return String(value || '').trim().toUpperCase().slice(0, 2);
}

function onlyPlate(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 7);
}

function firstFilled(...values) {
  return values.map((value) => String(value ?? '').trim()).find(Boolean) || '';
}

function splitPossibleNames(value) {
  return String(value || '')
    .split(/[;,|\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function pessoaMatchesColaborador(pessoa, colab) {
  if (!pessoa || !colab) return false;
  const cpfPessoa = normalizeCpf(pessoa.cpf || pessoa.documento || pessoa.cpf_colaborador || pessoa.colaborador_cpf);
  const cpfColab = normalizeCpf(colab.cpf);
  if (cpfPessoa && cpfColab && cpfPessoa === cpfColab) return true;

  const nomes = splitPossibleNames(firstFilled(pessoa.nome, pessoa.name, pessoa.motorista, pessoa.condutor, pessoa.colaborador, pessoa.responsavel));
  const nomeColab = normalizeText(colab.nome);
  if (!nomeColab) return false;
  return nomes.some((nome) => {
    const nomeNorm = normalizeText(nome);
    return nomeNorm && (nomeNorm === nomeColab || nomeNorm.includes(nomeColab) || nomeColab.includes(nomeNorm));
  });
}

function isColaboradorAtivo(colab) {
  if (!colab) return false;
  if (colab.ativo === false) return false;

  const situacao = normalizeAccessText(colab.situacao);
  const desligamento = String(colab.desligamento || '').trim();
  if (desligamento) return false;

  return ![
    'NAO ATIVO',
    'NAO ATIVA',
    'INATIVO',
    'INATIVA',
    'DESLIGADO',
    'DESLIGADA',
    'DEMITIDO',
    'DEMITIDA',
  ].some((status) => situacao.includes(status));
}


function normalizeAccessText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim();
}

function getDeepValue(source, path) {
  return String(path || '').split('.').reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), source);
}

function parseSupervisoes(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.flatMap(parseSupervisoes))];
  if (typeof value === 'object') {
    return parseSupervisoes(value.supervisoes || value.supervisao || value.nome || value.name);
  }

  const text = String(value).trim();
  if (!text) return [];

  if ((text.startsWith('[') && text.endsWith(']')) || (text.startsWith('{') && text.endsWith('}'))) {
    try { return parseSupervisoes(JSON.parse(text)); } catch (_) {}
  }

  return [...new Set(text.split(/[,;|\n]+/).map((item) => item.trim()).filter(Boolean))];
}

function looksLikeGestor(value) {
  const normalized = normalizeAccessText(value);
  return normalized === 'GESTOR' || normalized.startsWith('GESTOR ');
}

function buildAccessTokens(access) {
  const tokens = new Set();
  const sources = [access?.setor, access?.departmentName, access?.departmentCode, access?.role, ...(access?.allowedSupervisoes || [])];

  sources.forEach((source) => {
    const normalized = normalizeAccessText(source);
    if (!normalized) return;

    tokens.add(normalized);
    normalized
      .replace(/^GESTOR\s+/, '')
      .split(/\s+/)
      .filter((part) => part.length >= 4 && !['GERAL', 'SETOR', 'ADM', 'ADMINISTRADOR'].includes(part))
      .forEach((part) => tokens.add(part));
  });

  return [...tokens];
}

function filterAllowedSupervisoes(allSupervisoes, access) {
  const all = [...new Set((allSupervisoes || []).map((item) => String(item || '').trim()).filter(Boolean))];
  if (!access?.restricted) return all;

  const allowed = [...new Set((access.allowedSupervisoes || []).map((item) => String(item || '').trim()).filter(Boolean))];
  const allowedKeys = new Set(allowed.map(normalizeAccessText));
  const tokens = buildAccessTokens(access).filter(Boolean);

  let filtered = all.filter((sup) => {
    const key = normalizeAccessText(sup);
    if (allowedKeys.has(key)) return true;
    return tokens.some((token) => token.length >= 4 && key.includes(token));
  });

  if (!filtered.length && allowed.length) filtered = allowed;
  return [...new Set(filtered)].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function selectOptions(options, selected) {
  return options.map((opt) => `<option value="${escapeHtml(opt)}" ${String(selected || '') === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`).join('');
}

function disponibilidadeNorm(value) {
  return normalizeText(value).replace('INDISPONIVEL', 'INDISPONIVEL').replace('FERIAS', 'FERIAS');
}

function disponibilidadeCategoria(value) {
  const norm = disponibilidadeNorm(value);
  if (INDISPONIBILIDADE_MOTIVOS.includes(norm) || norm === 'INDISPONIVEL') return 'INDISPONIVEL';
  if (norm === 'SEM EMBARQUE') return 'SEM EMBARQUE';
  if (norm === 'LOGISTICA') return 'LOGISTICA';
  if (norm === 'DESLOCAMENTO') return 'DESLOCAMENTO';
  return 'OK';
}

function disponibilidadeMotivo(value) {
  const norm = disponibilidadeNorm(value);
  return INDISPONIBILIDADE_MOTIVOS.includes(norm) ? norm : '';
}

function disponibilidadeLabel(value) {
  const norm = disponibilidadeNorm(value);
  const labels = {
    OK: 'OK',
    LOGISTICA: 'Logística',
    DESLOCAMENTO: 'Deslocamento',
    'SEM EMBARQUE': 'Sem Embarque',
    INDISPONIVEL: 'Indisponível',
    ATESTADO: 'Atestado',
    FALTA: 'Falta',
    FERIAS: 'Férias',
    FOLGA: 'Folga',
  };
  return labels[norm] || String(value || 'OK');
}

function estadiaLabel(tipo) {
  return ({ CASA: 'Casa', PERNOITE: 'Pernoite', ALOJAMENTO: 'Alojamento', HOTEL: 'Hotel' })[normalizeText(tipo)] || '';
}

function estadiaIcon(tipo) {
  const key = normalizeText(tipo);
  if (key === 'CASA') return '<svg viewBox="0 0 48 48"><path d="M7 24L24 10l17 14"/><path d="M13 22v17h22V22"/><path d="M20 39V28h8v11"/></svg>';
  if (key === 'PERNOITE') return '<svg viewBox="0 0 48 48"><path d="M8 36h32"/><path d="M12 36V22l12-8 12 8v14"/><path d="M18 36v-9h12v9"/><path d="M6 26l18-12 18 12"/><path d="M36 12c4 2 6 5 6 9"/></svg>';
  if (key === 'ALOJAMENTO') return '<svg viewBox="0 0 48 48"><circle cx="16" cy="16" r="5"/><circle cx="32" cy="16" r="5"/><path d="M8 36c1-7 5-11 8-11s7 4 8 11"/><path d="M24 36c1-7 5-11 8-11s7 4 8 11"/></svg>';
  return '<svg viewBox="0 0 48 48"><path d="M12 40V10h24v30"/><path d="M8 40h32"/><path d="M18 16h4M26 16h4M18 23h4M26 23h4M18 30h4M26 30h4"/><path d="M22 40v-6h4v6"/></svg>';
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const a = Number(lat1), b = Number(lon1), c = Number(lat2), d = Number(lon2);
  if (![a,b,c,d].every(Number.isFinite)) return null;
  const R = 6371;
  const toRad = (deg) => deg * Math.PI / 180;
  const dLat = toRad(c - a);
  const dLon = toRad(d - b);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a)) * Math.cos(toRad(c)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function injectProgramacaoStyles() {
  if (document.getElementById('programacao-table-styles')) return;
  const style = document.createElement('style');
  style.id = 'programacao-table-styles';
  style.textContent = `
    .prog-table-wrap{width:100%;overflow:auto;border:1px solid rgba(52,211,153,.18);border-radius:18px;background:rgba(2,6,23,.26)}
    .prog-table{width:100%;border-collapse:separate;border-spacing:0;min-width:980px;color:#e2e2f0}
    .prog-table th{position:sticky;top:0;z-index:1;background:#07170f;color:#c7f9df;font-size:12px;text-transform:uppercase;letter-spacing:.045em;text-align:left;padding:13px 12px;border-bottom:1px solid rgba(52,211,153,.2)}
    .prog-table td{padding:10px 12px;border-bottom:1px solid rgba(148,163,184,.12);vertical-align:middle;background:rgba(15,23,42,.28)}
    .prog-table tr:hover td{background:rgba(22,101,52,.12)}
    .prog-table .colab-name{font-weight:900;color:#f8fafc;line-height:1.15;min-width:240px}
    .prog-table .colab-meta{font-size:12px;color:#a7b5aa;margin-top:3px}
    .prog-table input,.prog-table select,.prog-table textarea,.prog-context-grid select{color-scheme:dark;background:#0d0d18!important;color:#e2e2f0!important;border:1px solid rgba(52,211,153,.18);border-radius:11px;padding:9px 10px;outline:none;width:100%;min-height:38px}
    .prog-table select option,.prog-context-grid select option{background:#0d0d18;color:#e2e2f0}
    .prog-table input[type="checkbox"]{width:18px;min-height:18px;accent-color:#16a34a}
    .prog-table input:disabled,.prog-table select:disabled,.prog-table textarea:disabled{opacity:.58;cursor:not-allowed;background:#10101e!important}
    .prog-status{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 10px;font-size:11px;font-weight:900;white-space:nowrap;border:1px solid rgba(148,163,184,.18)}
    .prog-status.ok{background:rgba(22,163,74,.14);color:#bbf7d0;border-color:rgba(34,197,94,.22)}
    .prog-status.block{background:rgba(239,68,68,.12);color:#fecaca;border-color:rgba(248,113,113,.22)}
    .prog-mini-btn{border:1px solid rgba(52,211,153,.28);background:rgba(22,101,52,.22);color:#dcfce7;border-radius:12px;padding:9px 12px;font-weight:800;cursor:pointer;white-space:nowrap}
    .prog-mini-btn:hover{background:rgba(22,101,52,.42)}
    .prog-mini-btn.danger{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.25);color:#fecaca}
    .prog-save-actions{display:flex;gap:10px;align-items:center;justify-content:flex-end;flex-wrap:wrap}
    .prog-save-main{border:1px solid rgba(187,247,208,.32);background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border-radius:14px;padding:12px 18px;font-weight:950;cursor:pointer;box-shadow:0 14px 35px rgba(22,163,74,.18)}
    .prog-save-main:hover{filter:brightness(1.04)}
    .prog-save-main:disabled{opacity:.55;cursor:not-allowed;filter:none}
    .prog-extra-card{display:grid;grid-template-columns:160px 1.2fr 120px 1.2fr 86px;gap:8px;align-items:center;margin-bottom:8px;padding:8px;border:1px solid rgba(148,163,184,.14);border-radius:14px;background:rgba(15,23,42,.38)}
    .prog-extra-total{font-weight:900;color:#bbf7d0;text-align:right;white-space:nowrap}
    .prog-feedback-ok{color:#bbf7d0}.prog-feedback-error{color:#fecaca}.prog-feedback-warn{color:#fde68a}
    .prog-patrimonio-alert{display:none;margin-top:6px;border:1px solid rgba(250,204,21,.24);background:rgba(113,63,18,.20);color:#fde68a;border-radius:10px;padding:7px 9px;font-size:11px;font-weight:800;line-height:1.35}
    .prog-patrimonio-alert.show{display:block}
    .prog-section-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:18px 0 10px}
    .prog-section-title h4{margin:0;color:#f8fafc;font-size:15px;font-weight:950;letter-spacing:.02em}
    .prog-section-title .badge{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:11px;font-weight:900;border:1px solid rgba(52,211,153,.22);background:rgba(22,101,52,.14);color:#bbf7d0}
    .prog-section-title.blocked .badge{border-color:rgba(248,113,113,.22);background:rgba(127,29,29,.18);color:#fecaca}
    .prog-empty-section{border:1px dashed rgba(148,163,184,.2);border-radius:16px;padding:14px;color:#6b7280;background:rgba(15,23,42,.18)}
    .prog-os-modal-backdrop{position:fixed;inset:0;z-index:9990;background:rgba(2,6,23,.72);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:18px}
    .prog-tipo-selector{display:flex;gap:6px;flex-wrap:wrap}
    .prog-tipo-btn{border:1px solid rgba(52,211,153,.22);background:rgba(15,23,42,.5);color:#6b7280;border-radius:10px;padding:7px 11px;font-size:12px;font-weight:800;cursor:pointer;transition:all .15s}
    .prog-tipo-btn:hover{background:rgba(22,101,52,.25);color:#bbf7d0}
    .prog-tipo-btn.disabled,.prog-tipo-btn:disabled{opacity:.45;cursor:not-allowed;filter:grayscale(.45)}
    .prog-tipo-btn.disabled:hover,.prog-tipo-btn:disabled:hover{background:rgba(15,23,42,.5);color:#6b7280}
    .prog-tipo-btn.active{background:rgba(22,101,52,.35);color:#bbf7d0;border-color:rgba(52,211,153,.55)}
    .prog-tipo-btn.active[data-tipo="SEM EMBARQUE"],.prog-tipo-btn.active[data-tipo="INDISPONIVEL"]{background:rgba(127,29,29,.30);color:#fecaca;border-color:rgba(248,113,113,.45)}
    .prog-indisponivel-wrap{display:flex;align-items:center;gap:8px;margin-top:8px;max-width:260px}
    .prog-indisponivel-wrap select{min-height:34px!important;padding:6px 9px!important}
    .prog-estadia-selector{display:grid;grid-template-columns:repeat(4,minmax(112px,1fr));gap:10px;min-width:520px}
    .prog-estadia-card{border:1px solid rgba(52,211,153,.18);background:rgba(15,23,42,.56);color:#e2e2f0;border-radius:16px;padding:12px 10px;display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;font-weight:900;transition:all .15s;min-height:92px}
    .prog-estadia-card svg{width:34px;height:34px;stroke:#86efac;stroke-width:1.8;fill:none;stroke-linecap:round;stroke-linejoin:round}
    .prog-estadia-card:hover{background:rgba(22,101,52,.22);transform:translateY(-1px)}
    .prog-estadia-card.active{border-color:rgba(134,239,172,.70);background:rgba(22,101,52,.34);box-shadow:0 0 0 1px rgba(134,239,172,.16) inset}
    .prog-estadia-card span{font-size:12px;letter-spacing:.02em;text-align:center}
    .prog-required-note{margin-top:6px;font-size:11px;color:#fde68a;font-weight:800}
    .prog-km-note{display:block;margin-top:4px;color:#6b7280;font-size:11px;line-height:1.35}
    .prog-placa-wrap{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:8px}
    .prog-placa-wrap input{width:130px!important;font-family:monospace;text-transform:uppercase;min-height:32px!important;padding:5px 8px!important}
    .prog-placa-suggest-btn{border:1px solid rgba(52,211,153,.28);background:rgba(22,101,52,.22);color:#dcfce7;border-radius:8px;padding:5px 9px;font-size:11px;font-weight:800;cursor:pointer;white-space:nowrap}
    .prog-placa-suggest-btn:hover{background:rgba(22,101,52,.42)}
    .prog-placa-alert{display:none;margin-top:6px;border:1px solid rgba(250,204,21,.24);background:rgba(113,63,18,.20);color:#fde68a;border-radius:10px;padding:6px 8px;font-size:11px;font-weight:700;line-height:1.35;width:100%}
    .prog-placa-alert.show{display:block}
    .prog-os-modal{width:min(920px,96vw);max-height:86vh;overflow:auto;border:1px solid rgba(52,211,153,.22);border-radius:24px;background:linear-gradient(180deg,#0d0d18,#07130d);box-shadow:0 30px 90px rgba(0,0,0,.55);color:#e2e2f0;padding:22px}
    .prog-os-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:16px}.prog-os-modal-head h3{margin:0;color:#f8fafc;font-size:22px}.prog-os-modal-head p{margin:6px 0 0;color:#6b7280}
    .prog-os-list{display:grid;gap:10px}.prog-os-card{border:1px solid rgba(52,211,153,.16);background:rgba(15,23,42,.62);border-radius:18px;padding:14px}.prog-os-card.zero{box-shadow:inset 4px 0 0 #facc15}.prog-os-title{font-weight:950;color:#f8fafc}.prog-os-meta{font-size:12px;color:#6b7280;margin-top:4px}.prog-os-rem{display:inline-flex;border-radius:999px;padding:5px 10px;margin-top:8px;font-size:12px;font-weight:950;border:1px solid rgba(250,204,21,.25);color:#fde68a;background:rgba(113,63,18,.22)}
    .prog-os-modal-actions{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:18px}.prog-os-close{border:1px solid rgba(148,163,184,.22);background:rgba(15,23,42,.72);color:#e2e2f0;border-radius:13px;padding:10px 14px;font-weight:900;cursor:pointer}.prog-os-go{border:1px solid rgba(187,247,208,.32);background:linear-gradient(135deg,#16a34a,#86efac);color:#052e16;border-radius:13px;padding:10px 14px;font-weight:950;cursor:pointer}
    @media(max-width:900px){.prog-extra-card{grid-template-columns:1fr}.prog-table{min-width:860px}.prog-os-modal{padding:16px}.prog-estadia-selector{grid-template-columns:repeat(2,minmax(110px,1fr));min-width:320px}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Programação', (content) => {
  injectProgramacaoStyles();

  content.innerHTML = `
    <section class="card mt-16">
      <div class="filters-grid prog-context-grid">
        <div class="field">
          <label for="progSup">Supervisão</label>
          <select id="progSup"></select>
        </div>
        <div class="field">
          <label for="progDataRef">Data</label>
          <input id="progDataRef" type="date" />
        </div>
        <div class="filter-actions prog-filter-actions">
          <button class="btn btn-primary" type="button" id="progLoadContext">Carregar</button>
        </div>
      </div>
      <div class="feedback mt-16" id="progCtxFeedback">Nenhuma programação carregada.</div>
    </section>

    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Etapas</h3>
          <p class="muted">Clique em uma etapa para editar as necessidades em formato de tabela.</p>
        </div>
      </div>
      <div class="steps-wrap" id="progSteps">
        ${STEPS.map((step) => `<button type="button" class="stepbtn ${step.code === 'A' ? 'active' : ''}" data-step="${step.code}">${step.code} · ${step.label}</button>`).join('')}
      </div>
    </section>

    <section class="card mt-16">
      <div class="section-head">
        <div>
          <h3>Lista da etapa</h3>
          <p class="muted">As alterações são salvas automaticamente, mas o botão abaixo confirma e finaliza a programação.</p>
        </div>
        <div class="prog-save-actions">
          <button class="prog-save-main" type="button" id="progSaveProgramacao" disabled>Salvar programação</button>
        </div>
      </div>
      <div class="filters-grid prog-context-grid">
        <div class="field field-span-2">
          <label for="progSearch">Buscar colaborador</label>
          <input id="progSearch" type="text" placeholder="Digite nome, cargo ou supervisão..." />
        </div>
      </div>
      <div class="prog-list mt-16" id="progList"></div>
    </section>
  `;

  const el = {
    dataRef: document.getElementById('progDataRef'),
    sup: document.getElementById('progSup'),
    loadBtn: document.getElementById('progLoadContext'),
    feedback: document.getElementById('progCtxFeedback'),
    steps: document.getElementById('progSteps'),
    list: document.getElementById('progList'),
    search: document.getElementById('progSearch'),
    saveBtn: document.getElementById('progSaveProgramacao'),
    statTotal: document.getElementById('progStatTotal'),
    statBlocked: document.getElementById('progStatBlocked'),
    currentStep: document.getElementById('progCurrentStep'),
    currentStepLabel: document.getElementById('progCurrentStepLabel'),
  };

  const state = {
    user: null,
    userContext: null,
    access: { restricted: false, allowedSupervisoes: [] },
    step: 'A',
    dataReferencia: todayIso(),
    supervisao: '',
    programacaoId: null,
    colaboradores: [],
    colabsEmOsAtender: new Set(),
    cidades: [],
    alojamentos: [],
    veiculos: [],
    pontosEmbarque: [],
    operacionalColabs: [],
    osPorColaborador: new Map(),
    search: '',
    maps: {
      disponibilidade: new Map(),
      estadia: new Map(),
      alimentacao: new Map(),
      deslocamento: new Map(),
      extras: new Map(),
    },
    timers: new Map(),
  };

  el.dataRef.value = state.dataReferencia;

  async function init() {
    state.user = await getCurrentUser();
    try {
      state.userContext = await getUserContext(state.user?.id);
    } catch (error) {
      console.warn('Não foi possível carregar o contexto completo do usuário.', error);
      state.userContext = null;
    }
    state.access = await resolveProgramacaoAccess();
    bindEvents();
    await Promise.all([loadCidadesBrasil(), loadAlojamentos(), loadVeiculosFrota(), loadBaseOperacional()]);
    await fillSupervisoes();
    await checkOsPendingPopup();
  }

  function bindEvents() {
    el.loadBtn.addEventListener('click', loadContext);
    el.sup.addEventListener('change', () => checkOsPendingPopup());
    el.saveBtn.addEventListener('click', saveProgramacao);
    el.search.addEventListener('input', () => {
      state.search = el.search.value.trim().toLowerCase();
      renderRows();
    });
    el.steps.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-step]');
      if (!btn) return;
      setStep(btn.dataset.step);
    });
    el.list.addEventListener('change', handleTableChange);
    el.list.addEventListener('input', handleTableInput);
    el.list.addEventListener('click', handleTableClick);
  }


  function osRemanescenteLabel(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toLocaleString('pt-BR') : '0';
  }

  function pendingOsFilter(row) {
    if (!row) return false;
    return row.status_gestor === 'AGUARDAR' && !row.configurada_em;
  }

  async function checkOsPendingPopup() {
    try {
      const selectedSup = el.sup?.value || '';
      const today = todayIso();
      let query = supabase
        .from('operacional_os')
        .select('id,numero_os,data_os,cliente,embarque,destino,supervisao,remanescente,status_gestor,configurada_em,updated_at,created_at')
        .eq('status_gestor', 'AGUARDAR')
        .is('configurada_em', null)
        .gte('data_os', today)
        .lte('data_os', today)
        .order('data_os', { ascending: false })
        .limit(50);

      if (selectedSup) {
        query = query.eq('supervisao', selectedSup);
      } else if (state.access?.restricted && state.access.allowedSupervisoes?.length) {
        query = query.in('supervisao', state.access.allowedSupervisoes);
      }

      const { data, error } = await query;
      if (error) throw error;
      const pending = (data || []).filter(pendingOsFilter).slice(0, 8);
      if (pending.length) showOsPendingModal(pending);
    } catch (error) {
      console.warn('Não foi possível verificar O.S. pendentes para pop-up.', error);
    }
  }

  function showOsPendingModal(rows) {
    const old = document.getElementById('progOsPendingModal');
    if (old) old.remove();
    const wrap = document.createElement('div');
    wrap.id = 'progOsPendingModal';
    wrap.className = 'prog-os-modal-backdrop';
    wrap.innerHTML = `
      <div class="prog-os-modal" role="dialog" aria-modal="true" aria-label="Configuração de O.S.">
        <div class="prog-os-modal-head">
          <div>
            <h3>Configurar O.S. antes da programação</h3>
            <p>Existem O.S. novas ou alteradas para a regional liberada. Configure atendimento, colaborador sugerido e distribuição antes de seguir com a programação.</p>
          </div>
          
        </div>
        <div class="prog-os-list">
          ${rows.map((row) => {
            const zero = Number(row.remanescente || 0) === 0;
            return `<div class="prog-os-card ${zero ? 'zero' : ''}">
              <div class="prog-os-title">${escapeHtml(row.numero_os)} • ${escapeHtml(row.supervisao || '-')}</div>
              <div class="prog-os-meta">${escapeHtml(row.cliente || '-')}</div>
              <div class="prog-os-meta">Embarque: ${escapeHtml(row.embarque || '-')}</div>
              <div class="prog-os-meta">Destino: ${escapeHtml(row.destino || '-')}</div>
              <span class="prog-os-rem">Remanescente: ${osRemanescenteLabel(row.remanescente)}${zero ? ' • zerada' : ''}</span>
            </div>`;
          }).join('')}
        </div>
        <div class="prog-os-modal-actions">
          <button class="prog-os-go" type="button" data-os-open>Ajustar O.S. agora</button>
        </div>
      </div>`;
    wrap.addEventListener('click', (event) => {
      if (event.target.matches('[data-os-open]')) window.location.href = '/painel/os';
    });
    document.body.appendChild(wrap);
  }


  async function loadCidadesBrasil() {
    try {
      const resp = await fetch('https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome');
      const data = await resp.json();
      state.cidades = (Array.isArray(data) ? data : []).map((m) => ({
        nome: m.nome,
        uf: m.microrregiao?.mesorregiao?.UF?.sigla || '',
        label: `${m.nome} - ${m.microrregiao?.mesorregiao?.UF?.sigla || ''}`,
        key: normalizeText(`${m.nome} ${m.microrregiao?.mesorregiao?.UF?.sigla || ''}`),
      })).filter((m) => m.nome && m.uf);
      ensureCidadeDatalist();
    } catch (error) {
      console.warn('Não foi possível carregar cidades do IBGE.', error);
      state.cidades = [];
    }
  }

  async function loadAlojamentos() {
    try {
      const { data, error } = await supabase
        .from('hospedagem_alojamentos')
        .select('id,nome,cidade,uf,tipo,capacidade,quartos,status,prioridade,endereco')
        .eq('status', 'ATIVO')
        .order('cidade', { ascending: true });
      if (error) throw error;
      state.alojamentos = data || [];
    } catch (error) {
      console.warn('Não foi possível carregar alojamentos para sugestão.', error);
      state.alojamentos = [];
    }
  }

  async function loadVeiculosFrota() {
    const normalizeRows = (rows) => (rows || []).map((v) => {
      const placa = onlyPlate(v.placa || v.identificacao || v.patrimonio_placa || v.veiculo_placa || v.codigo || v.tombamento);
      if (!placa) return null;

      const motoristaNome = firstFilled(
        v.motorista_atual,
        v.motorista,
        v.condutor,
        v.condutor_atual,
        v.patrimonio_funcionario,
        v.colaborador,
        v.colaborador_nome,
        v.funcionario,
        v.responsavel,
        v.nome_responsavel
      );
      const motoristaCpf = normalizeCpf(firstFilled(
        v.motorista_cpf,
        v.condutor_cpf,
        v.colaborador_cpf,
        v.funcionario_cpf,
        v.responsavel_cpf,
        v.cpf
      ));

      return {
        placa,
        motoristaNome,
        motoristaCpf,
        raw: v,
        label: [placa, v.modelo || v.nome || v.descricao || v.marca, v.cor, motoristaNome ? `Atual: ${motoristaNome}` : 'sem vínculo identificado'].filter(Boolean).join(' · '),
      };
    }).filter(Boolean);
    try {
      const { data, error } = await supabase.from('frotas_veiculos').select('*').order('placa', { ascending: true }).limit(1000);
      if (error) throw error;
      state.veiculos = normalizeRows(data);
      if (state.veiculos.length) return;
    } catch (error) {
      console.warn('Não foi possível carregar frotas_veiculos.', error);
    }
    try {
      const { data, error } = await supabase.from('patrimonios_snapshot').select('*').limit(1500);
      if (error) throw error;
      state.veiculos = normalizeRows(data);
    } catch (error) {
      console.warn('Não foi possível carregar patrimonios_snapshot para placas.', error);
      state.veiculos = [];
    }
  }

  async function loadBaseOperacional() {
    try {
      const [colabs, pontos] = await Promise.all([
        supabase.from('operacional_colaborador_base').select('id,colaborador_id,nome,cpf,latitude,longitude,ativo').eq('ativo', true).limit(5000),
        supabase.from('operacional_pontos_embarque').select('id,nome_local,cidade,uf,latitude,longitude,ativo').eq('ativo', true).limit(8000),
      ]);
      if (!colabs.error) state.operacionalColabs = colabs.data || [];
      if (!pontos.error) state.pontosEmbarque = pontos.data || [];
    } catch (error) {
      console.warn('Não foi possível carregar base operacional para cálculo de KM.', error);
      state.operacionalColabs = [];
      state.pontosEmbarque = [];
    }
  }

  function findOperacionalColab(colab) {
    const cpf = normalizeCpf(colab?.cpf);
    const nome = normalizeText(colab?.nome);
    return (state.operacionalColabs || []).find((row) => cpf && normalizeCpf(row.cpf) === cpf)
      || (state.operacionalColabs || []).find((row) => nome && normalizeText(row.nome) === nome)
      || null;
  }

  function findPontoFromOs(os) {
    if (!os) return null;
    if (Number.isFinite(Number(os.ponto1_latitude)) && Number.isFinite(Number(os.ponto1_longitude))) {
      return { latitude: Number(os.ponto1_latitude), longitude: Number(os.ponto1_longitude), nome: os.embarque || 'Ponto da O.S.' };
    }
    const emb = normalizeText(os.embarque || os.local_embarque || '');
    if (!emb) return null;
    const candidates = (state.pontosEmbarque || []).filter((p) => {
      const label = normalizeText(`${p.uf || ''} ${p.cidade || ''} ${p.nome_local || ''}`);
      return label && (label.includes(emb) || emb.includes(label) || normalizeText(p.nome_local).includes(emb) || emb.includes(normalizeText(p.nome_local)));
    }).filter((p) => Number.isFinite(Number(p.latitude)) && Number.isFinite(Number(p.longitude)));
    return candidates[0] || null;
  }

  function kmEstimadoColaborador(colab) {
    const os = state.osPorColaborador.get(String(colab?.id || '').trim())
      || state.osPorColaborador.get(normalizeCpf(colab?.cpf))
      || state.osPorColaborador.get(normalizeText(colab?.nome || '').trim().toUpperCase());
    if (!os) return { km: null, motivo: 'Sem O.S. vinculada ao colaborador.' };
    if (Number.isFinite(Number(os.distancia_km))) return { km: Number(os.distancia_km), motivo: 'Distância da indicação da O.S.' };
    const base = findOperacionalColab(colab);
    const ponto = findPontoFromOs(os);
    if (!base || !Number.isFinite(Number(base.latitude)) || !Number.isFinite(Number(base.longitude))) return { km: null, motivo: 'Casa/base do colaborador sem coordenadas.' };
    if (!ponto) return { km: null, motivo: 'Ponto de embarque sem coordenadas.' };
    const km = haversineKm(base.latitude, base.longitude, ponto.latitude, ponto.longitude);
    return Number.isFinite(km) ? { km, motivo: `Casa → ${ponto.nome_local || ponto.nome || 'ponto de embarque'}` } : { km: null, motivo: 'Coordenadas insuficientes.' };
  }

  function ensureCidadeDatalist() {
    let list = document.getElementById('progCidadesBrasilList');
    if (!list) {
      list = document.createElement('datalist');
      list.id = 'progCidadesBrasilList';
      document.body.appendChild(list);
    }
    list.innerHTML = (state.cidades || []).map((c) => `<option value="${escapeHtml(c.label)}"></option>`).join('');
  }

  function ensureVeiculosDatalist() {
    let list = document.getElementById('progVeiculosFrotaList');
    if (!list) {
      list = document.createElement('datalist');
      list.id = 'progVeiculosFrotaList';
      document.body.appendChild(list);
    }
    list.innerHTML = (state.veiculos || []).map((v) => `<option value="${escapeHtml(v.placa)}">${escapeHtml(v.label)}</option>`).join('');
  }

  function matchCidade(value, ufValue = '') {
    const text = String(value || '').trim();
    const uf = normalizeUF(ufValue);
    const normalized = normalizeText(text.replace(/\s+-\s+[A-Z]{2}$/i, ''));
    const explicitUf = normalizeUF((text.match(/-\s*([A-Z]{2})$/i) || [])[1] || uf);
    return (state.cidades || []).find((c) => normalizeText(c.nome) === normalized && (!explicitUf || c.uf === explicitUf))
      || (state.cidades || []).find((c) => c.key === normalizeText(`${text} ${uf}`));
  }

  function alojamentoOptions(selectedId, cidade, uf) {
    const cidadeNorm = normalizeText(cidade);
    const ufNorm = normalizeUF(uf);
    const rows = (state.alojamentos || []).filter((a) => {
      if (!cidadeNorm && !ufNorm) return true;
      return (!cidadeNorm || normalizeText(a.cidade) === cidadeNorm) && (!ufNorm || normalizeUF(a.uf) === ufNorm);
    });
    const all = rows.length ? rows : (state.alojamentos || []);
    return `<option value="">Selecionar alojamento</option>` + all.map((a) => {
      const label = `${a.nome} · ${a.cidade || '-'}/${a.uf || ''}${a.capacidade ? ` · Cap. ${a.capacidade}` : ''}`;
      return `<option value="${escapeHtml(a.id)}" ${String(selectedId || '') === String(a.id) ? 'selected' : ''}>${escapeHtml(label)}</option>`;
    }).join('');
  }

  function findVeiculoByPlaca(placa) {
    const normalized = onlyPlate(placa);
    if (!normalized) return null;
    return (state.veiculos || []).find((v) => onlyPlate(v.placa) === normalized) || null;
  }

  function patrimonioMessageForRow(colab, tipoDeslocamento, placa) {
    const tipo = normalizeText(tipoDeslocamento);
    const normalizedPlate = onlyPlate(placa);
    if (tipo !== 'MOTORISTA FROTA' || !normalizedPlate || normalizedPlate.length < 7) return '';

    const veiculo = findVeiculoByPlaca(normalizedPlate);
    if (!veiculo) {
      return `Placa ${normalizedPlate} não localizada na base de patrimônios/frota. Solicitar leitura do patrimônio para confirmar o veículo.`;
    }

    const pessoa = {
      nome: veiculo.motoristaNome,
      cpf: veiculo.motoristaCpf,
      motorista: veiculo.motoristaNome,
      ...((veiculo.raw && typeof veiculo.raw === 'object') ? veiculo.raw : {}),
    };

    if (pessoaMatchesColaborador(pessoa, colab)) return '';

    const vinculo = veiculo.motoristaNome || 'sem colaborador vinculado identificado';
    return `Atenção: o veículo ${normalizedPlate} está vinculado a ${vinculo}, não a ${colab?.nome || 'este motorista'}. Solicitar leitura do patrimônio.`;
  }

  function updatePatrimonioAlert(tr) {
    if (!tr) return;
    const alert = tr.querySelector('[data-patrimonio-alert]');
    if (!alert) return;
    const colab = colabById(tr.dataset.colabId);
    const tipo = tr.querySelector('[data-field="tipo_deslocamento"]')?.value || '';
    const placa = tr.querySelector('[data-field="placa_veiculo"]')?.value || '';
    const message = patrimonioMessageForRow(colab, tipo, placa);
    alert.textContent = message;
    alert.classList.toggle('show', Boolean(message));
  }

  async function resolveProgramacaoAccess() {
    const context = state.userContext || {};
    let appUser = null;

    try {
      const { data, error } = await supabase
        .from('app_usuarios')
        .select('id,nome,email,setor,empresa,coordenacao,supervisao,status')
        .eq('auth_user_id', state.user?.id)
        .maybeSingle();
      if (!error) appUser = data || null;
    } catch (error) {
      console.warn('Não foi possível consultar app_usuarios para restrição de supervisão.', error);
    }

    const role = getDeepValue(context, 'user.role') || context.perfil_codigo || context.perfil_nome || context.role || appUser?.perfil_codigo || '';
    const setor = appUser?.setor || context.setor || getDeepValue(context, 'user.setor') || getDeepValue(context, 'department.name') || '';
    const departmentName = getDeepValue(context, 'department.name') || context.department_name || setor || '';
    const departmentCode = getDeepValue(context, 'department.code') || context.department_code || '';
    const isMaster = Boolean(getDeepValue(context, 'user.is_master') || context.is_master || normalizeAccessText(role) === 'MASTER');
    const isGestor = looksLikeGestor(role) || looksLikeGestor(setor) || looksLikeGestor(departmentName) || looksLikeGestor(departmentCode);

    const allowedSupervisoes = [
      ...parseSupervisoes(appUser?.supervisao),
      ...parseSupervisoes(context.supervisoes),
      ...parseSupervisoes(context.supervisao),
      ...parseSupervisoes(getDeepValue(context, 'user.supervisoes')),
      ...parseSupervisoes(getDeepValue(context, 'user.supervisao')),
    ];

    return {
      restricted: !isMaster && isGestor,
      allowedSupervisoes: [...new Set(allowedSupervisoes)],
      role,
      setor,
      departmentName,
      departmentCode,
    };
  }

  async function loadOsAtender(dataReferencia, supervisao) {
    const set = new Set();
    state.osPorColaborador = new Map();
    try {
      const { data: osRows } = await supabase
        .from('operacional_os')
        .select('*')
        .eq('supervisao', supervisao)
        .eq('status_gestor', 'ATENDER');
      const atenderRows = osRows || [];
      if (!atenderRows.length) return set;
      const osMap = new Map((atenderRows || []).map((r) => [String(r.id), r]));
      const { data: colabRows } = await supabase
        .from('operacional_os_colaboradores')
        .select('*')
        .in('os_id', atenderRows.map((r) => r.id));
      (colabRows || []).forEach((r) => {
        const os = { ...(osMap.get(String(r.os_id)) || {}), distancia_km: r.distancia_km };
        const cpf = normalizeCpf(r.colaborador_cpf || r.cpf);
        const key = String(r.colaborador_key || r.colaborador_id || '').trim();
        const nomeKey = normalizeText(r.colaborador_nome || r.nome_colaborador || r.nome || '').trim().toUpperCase();
        if (cpf) set.add(cpf);
        if (key) set.add(key);
        if (nomeKey) set.add(nomeKey);
        if (cpf) state.osPorColaborador.set(cpf, os);
        if (key) state.osPorColaborador.set(key, os);
        if (nomeKey) state.osPorColaborador.set(nomeKey, os);
      });
    } catch (e) {
      console.warn('Não foi possível carregar OS ATENDER.', e);
    }
    return set;
  }

  function colabEmOsAtender(colab) {
    if (!state.colabsEmOsAtender.size) return false;
    const cpf = normalizeCpf(colab.cpf);
    if (cpf && state.colabsEmOsAtender.has(cpf)) return true;
    const id = String(colab.id || '').trim();
    if (id && state.colabsEmOsAtender.has(id)) return true;
    const nomeKey = normalizeText(colab.nome || '').trim().toUpperCase();
    return Boolean(nomeKey && state.colabsEmOsAtender.has(nomeKey));
  }

  function colaboradorPodeFicarOk(colab) {
    return colabEmOsAtender(colab);
  }

  function suggestVeiculoForColab(colab) {
    return (state.veiculos || []).find((v) => {
      const pessoa = { nome: v.motoristaNome, cpf: v.motoristaCpf, motorista: v.motoristaNome, ...(v.raw && typeof v.raw === 'object' ? v.raw : {}) };
      return pessoaMatchesColaborador(pessoa, colab);
    });
  }

  function updatePlacaLogisticaAlert(tr) {
    if (!tr) return;
    const alert = tr.querySelector('.prog-placa-alert');
    if (!alert) return;
    const colab = colabById(tr.dataset.colabId);
    const placa = tr.querySelector('[data-field="placa_veiculo"]')?.value || '';
    const msg = placa ? patrimonioMessageForRow(colab, 'MOTORISTA FROTA', placa) : '';
    alert.textContent = msg;
    alert.classList.toggle('show', Boolean(msg));
  }

  async function fillSupervisoes() {
    el.sup.innerHTML = '<option value="">Selecione...</option>';
    el.sup.disabled = false;

    const { data, error } = await supabase
      .from('supervisoes')
      .select('nome')
      .eq('ativo', true)
      .order('nome', { ascending: true });

    if (error) {
      setFeedback(`Erro ao carregar supervisões: ${error.message}`, 'error');
      return;
    }

    const todasSupervisoes = (data || []).map((r) => String(r.nome || '').trim()).filter(Boolean);
    const supervisoes = filterAllowedSupervisoes(todasSupervisoes, state.access);

    if (state.access?.restricted && !supervisoes.length) {
      el.sup.disabled = true;
      setFeedback('Seu usuário está como Gestor, mas não possui supervisão liberada. Ajuste a supervisão no cadastro do usuário.', 'error');
      return;
    }

    supervisoes.forEach((sup) => {
      const option = document.createElement('option');
      option.value = sup;
      option.textContent = sup;
      el.sup.appendChild(option);
    });

    if (supervisoes.length === 1) {
      el.sup.value = supervisoes[0];
      el.sup.disabled = true;
      setFeedback(`Supervisão limitada ao acesso do usuário: ${supervisoes[0]}.`, 'ok');
    } else if (state.access?.restricted) {
      setFeedback(`Supervisões liberadas para este gestor: ${supervisoes.length}.`, 'ok');
    }
  }

  async function getLatestSnapshotDate() {
    const { data, error } = await supabase
      .from('colaborador_importacoes')
      .select('data_referencia')
      .eq('status', 'processado')
      .order('data_referencia', { ascending: false })
      .limit(1);

    if (!error && data?.[0]?.data_referencia) return data[0].data_referencia;

    const fallback = await supabase
      .from('colaborador_snapshot')
      .select('data_referencia')
      .order('data_referencia', { ascending: false })
      .limit(1);

    return fallback.data?.[0]?.data_referencia || null;
  }

  async function ensureProgramacaoDia(dataReferencia, supervisao, coordenacao = '') {
    const found = await supabase
      .from('programacao_dia')
      .select('*')
      .eq('data_referencia', dataReferencia)
      .eq('supervisao', supervisao)
      .limit(1)
      .maybeSingle();

    if (found.error) throw found.error;
    if (found.data) return found.data;

    const inserted = await supabase
      .from('programacao_dia')
      .insert({
        data_referencia: dataReferencia,
        supervisao,
        coordenacao: coordenacao || null,
        regional: supervisao || null,
        status: 'rascunho',
        criado_por: state.user?.id || null,
      })
      .select('*')
      .single();

    if (inserted.error) throw inserted.error;
    return inserted.data;
  }

  async function loadIndisponibilidades(dataReferencia) {
    try {
      const { data, error } = await supabase
        .from('indisponibilidades')
        .select('colaborador_cpf, colaborador_nome, data_inicio, data_fim, motivo')
        .lte('data_inicio', dataReferencia)
        .or(`data_fim.is.null,data_fim.gte.${dataReferencia}`);
      if (error) return new Map();
      return new Map((data || []).map((r) => [normalizeCpf(r.colaborador_cpf), r]));
    } catch (_) {
      return new Map();
    }
  }

  async function loadContext() {
    const dataReferencia = el.dataRef.value;
    const supervisao = el.sup.value;
    if (!dataReferencia || !supervisao) {
      setFeedback('Selecione a data e a supervisão.', 'warn');
      return;
    }

    const allowedNow = filterAllowedSupervisoes([supervisao], state.access);
    if (state.access?.restricted && !allowedNow.includes(supervisao)) {
      setFeedback('Esta supervisão não está liberada para o seu usuário.', 'error');
      return;
    }

    state.dataReferencia = dataReferencia;
    state.supervisao = supervisao;
    setFeedback('Carregando contexto...', 'warn');
    el.saveBtn.disabled = true;
    el.list.innerHTML = '<div class="table-empty">Carregando colaboradores...</div>';

    try {
      const latestSnapshotDate = await getLatestSnapshotDate();
      if (!latestSnapshotDate) throw new Error('Nenhuma base de colaboradores foi importada ainda.');

      const { data: colaboradores, error: colabError } = await supabase
        .from('colaborador_snapshot')
        .select('*')
        .eq('data_referencia', latestSnapshotDate)
        .eq('supervisao', supervisao)
        .order('nome', { ascending: true });

      if (colabError) throw colabError;

      const _seenColabs = new Set();
      const colaboradoresAtivos = (colaboradores || []).filter(isColaboradorAtivo).filter((colab) => {
        const cpf = normalizeCpf(colab.cpf);
        const key = cpf || normalizeText(String(colab.nome || '')).trim().toUpperCase();
        if (!key || _seenColabs.has(key)) return false;
        _seenColabs.add(key);
        return true;
      });

      const programacao = await ensureProgramacaoDia(dataReferencia, supervisao, colaboradoresAtivos?.[0]?.coordenacao || '');
      state.programacaoId = programacao.id;

      const indisponibilidades = await loadIndisponibilidades(dataReferencia);
      state.colaboradores = colaboradoresAtivos.map((colab) => {
        const key = colaboradorKey(colab);
        const indis = indisponibilidades.get(normalizeCpf(colab.cpf));
        return {
          id: key,
          cpf: normalizeCpf(colab.cpf),
          nome: colab.nome || 'Colaborador',
          cargo: colab.cargo || '',
          coordenacao: colab.coordenacao || '',
          supervisao: colab.supervisao || '',
          indisponibilidade: indis || null,
        };
      });

      state.colabsEmOsAtender = await loadOsAtender(dataReferencia, supervisao);
      await ensureDefaultRows();
      await loadStageData();
      updateStats();
      renderRows();
      el.saveBtn.disabled = false;
      setFeedback(`Contexto carregado com ${state.colaboradores.length} colaboradores.`, 'ok');
    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Erro ao carregar contexto.', 'error');
      el.list.innerHTML = `<div class="table-empty">${escapeHtml(error.message || 'Erro ao carregar')}</div>`;
    }
  }

  async function ensureDefaultRows() {
    if (!state.programacaoId || !state.colaboradores.length) return;
    const payload = state.colaboradores.map((colab) => {
      const motivo = disponibilidadeNorm(colab.indisponibilidade?.motivo || '');
      const disponibilidade = colab.indisponibilidade
        ? (INDISPONIBILIDADE_MOTIVOS.includes(motivo) ? motivo : 'ATESTADO')
        : (colaboradorPodeFicarOk(colab) ? 'OK' : 'SEM EMBARQUE');
      return {
        programacao_id: state.programacaoId,
        data_referencia: state.dataReferencia,
        colaborador_id: colab.id,
        nome_colaborador: colab.nome,
        cargo: colab.cargo || null,
        coordenacao: colab.coordenacao || null,
        supervisao: colab.supervisao || null,
        disponibilidade,
      };
    });

    const { error } = await supabase
      .from('programacao_colaboradores')
      .upsert(payload, { onConflict: 'programacao_id,colaborador_id', ignoreDuplicates: true });
    if (error) throw error;

    // Promove SEM EMBARQUE → OK para colaboradores que agora têm OS em ATENDER
    const idsParaOk = payload.filter((p) => p.disponibilidade === 'OK').map((p) => p.colaborador_id);
    if (idsParaOk.length) {
      await supabase
        .from('programacao_colaboradores')
        .update({ disponibilidade: 'OK' })
        .eq('programacao_id', state.programacaoId)
        .in('colaborador_id', idsParaOk)
        .eq('disponibilidade', 'SEM EMBARQUE');
    }
  }

  async function loadStageData() {
    const pid = state.programacaoId;
    const [disp, estadia, alimentacao, deslocamento, extras] = await Promise.all([
      supabase.from('programacao_colaboradores').select('*').eq('programacao_id', pid),
      supabase.from('programacao_estadia').select('*').eq('programacao_id', pid),
      supabase.from('programacao_alimentacao').select('*').eq('programacao_id', pid),
      supabase.from('programacao_deslocamento').select('*').eq('programacao_id', pid),
      supabase.from('programacao_extras').select('*').eq('programacao_id', pid).order('created_at', { ascending: true }),
    ]);

    for (const res of [disp, estadia, alimentacao, deslocamento, extras]) {
      if (res.error) throw res.error;
    }

    state.maps.disponibilidade = new Map((disp.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.estadia = new Map((estadia.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.alimentacao = new Map((alimentacao.data || []).map((r) => [String(r.colaborador_id), r]));
    state.maps.deslocamento = new Map((deslocamento.data || []).map((r) => [String(r.colaborador_id), r]));
    const extrasMap = new Map();
    (extras.data || []).forEach((r) => {
      const key = String(r.colaborador_id);
      if (!extrasMap.has(key)) extrasMap.set(key, []);
      extrasMap.get(key).push(r);
    });
    state.maps.extras = extrasMap;
  }

  function setStep(step) {
    state.step = step;
    const meta = STEPS.find((s) => s.code === step) || STEPS[0];
    if (el.currentStep) el.currentStep.textContent = meta.code;
    if (el.currentStepLabel) el.currentStepLabel.textContent = meta.label;
    [...el.steps.querySelectorAll('.stepbtn')].forEach((btn) => btn.classList.toggle('active', btn.dataset.step === step));
    renderRows();
  }

  function disponibilidadeAtual(colab) {
    const row = state.maps.disponibilidade.get(String(colab.id));
    return disponibilidadeNorm(row?.disponibilidade || 'OK');
  }

  function isDisponibilidadeBloqueada(value) {
    const normalized = disponibilidadeNorm(value);
    return !DISPONIBILIDADES_LIBERADAS.has(normalized);
  }

  function isBlocked(colab) {
    const disp = disponibilidadeCategoria(disponibilidadeAtual(colab));
    if (disp === 'OK' && !colaboradorPodeFicarOk(colab)) return true;
    return isDisponibilidadeBloqueada(disponibilidadeAtual(colab));
  }

  function splitByDisponibilidade(rows) {
    const disponiveis = [];
    const bloqueados = [];
    (rows || []).forEach((colab) => (isBlocked(colab) ? bloqueados : disponiveis).push(colab));
    return { disponiveis, bloqueados };
  }

  function updateStats() {
    if (el.statTotal) el.statTotal.textContent = String(state.colaboradores.length);
    if (el.statBlocked) el.statBlocked.textContent = String(state.colaboradores.filter(isBlocked).length);
  }

  function filteredColaboradores() {
    return state.colaboradores.filter((colab) => {
      if (!state.search) return true;
      return `${colab.nome} ${colab.cargo} ${colab.supervisao} ${colab.coordenacao}`.toLowerCase().includes(state.search);
    });
  }

  function renderRows() {
    ensureCidadeDatalist();
    ensureVeiculosDatalist();
    if (!state.programacaoId) {
      el.list.innerHTML = '<div class="table-empty">Carregue um contexto para iniciar a programação.</div>';
      return;
    }
    const rows = filteredColaboradores();
    if (!rows.length) {
      el.list.innerHTML = '<div class="table-empty">Nenhum colaborador encontrado.</div>';
      return;
    }
    if (state.step === 'A') return renderDisponibilidade(rows);
    if (state.step === 'B') return renderEstadia(rows);
    if (state.step === 'C') return renderAlimentacao(rows);
    if (state.step === 'D') return renderDeslocamento(rows);
    return renderExtras(rows);
  }

  function colabCell(colab) {
    const blocked = isBlocked(colab);
    return `
      <div class="colab-name">${escapeHtml(colab.nome)}</div>
      <div class="colab-meta">${escapeHtml(colab.cargo || 'Colaborador')} • ${escapeHtml(colab.supervisao || '-')}</div>
      ${colab.indisponibilidade ? `<div class="colab-meta">Indisponibilidade importada: ${escapeHtml(colab.indisponibilidade.motivo || 'Indisponível')}</div>` : ''}
      ${!colaboradorPodeFicarOk(colab) ? '<div class="colab-meta">Sem O.S. em ATENDER vinculada para permitir OK.</div>' : ''}
      <div style="margin-top:6px"><span class="prog-status ${blocked ? 'block' : 'ok'}">${blocked ? 'Bloqueado' : 'Liberado'}</span></div>
    `;
  }

  function renderDisponibilidade(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      ${renderDisponibilidadeTable('Disponíveis', disponiveis, false)}
      ${renderDisponibilidadeTable('Bloqueados', bloqueados, true)}
    `;
  }

  function renderDisponibilidadeTable(title, rows, blockedSection) {
    return `
      <div class="prog-section-title ${blockedSection ? 'blocked' : ''}">
        <h4>${escapeHtml(title)}</h4>
        <span class="badge">${rows.length}</span>
      </div>
      ${rows.length ? `
        <div class="prog-table-wrap">
          <table class="prog-table">
            <thead><tr><th>Colaborador</th><th>Disponibilidade</th><th>Observação</th></tr></thead>
            <tbody>
              ${rows.map((colab) => {
                const r = state.maps.disponibilidade.get(String(colab.id)) || {};
                const categoria = disponibilidadeCategoria(r.disponibilidade || 'OK');
                const motivo = disponibilidadeMotivo(r.disponibilidade || '');
                const placa = r.placa_veiculo || '';
                const sugestao = categoria === 'LOGISTICA' && !placa ? suggestVeiculoForColab(colab) : null;
                const placaSugerida = sugestao?.placa || '';
                const alertMsg = placa ? patrimonioMessageForRow(colab, 'MOTORISTA FROTA', placa) : '';
                const podeOk = colaboradorPodeFicarOk(colab);
                return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_colaboradores">
                  <td>${colabCell(colab)}</td>
                  <td>
                    <div class="prog-tipo-selector">
                      ${DISPONIBILIDADES_PRINCIPAIS.map((op) => {
                        const okBloqueado = op === 'OK' && !podeOk;
                        return `<button type="button" class="prog-tipo-btn${categoria === op ? ' active' : ''}${okBloqueado ? ' disabled' : ''}" data-tipo="${escapeHtml(op)}" ${okBloqueado ? 'disabled title="OK só é liberado quando houver O.S. em ATENDER vinculada ao colaborador"' : ''}>${escapeHtml(disponibilidadeLabel(op))}</button>`;
                      }).join('')}
                      <input type="hidden" data-field="disponibilidade" value="${escapeHtml(categoria === 'INDISPONIVEL' ? (motivo || 'ATESTADO') : categoria)}" />
                    </div>
                    ${categoria === 'OK' && !podeOk ? `<div class="prog-placa-alert show">OK bloqueado: este colaborador não possui O.S. marcada como ATENDER no menu OS.</div>` : ''}
                    ${categoria === 'INDISPONIVEL' ? `<div class="prog-indisponivel-wrap">
                      <select data-indisponivel-motivo>${INDISPONIBILIDADE_MOTIVOS.map((op) => `<option value="${escapeHtml(op)}" ${String(motivo || 'ATESTADO') === op ? 'selected' : ''}>${escapeHtml(disponibilidadeLabel(op))}</option>`).join('')}</select>
                    </div>` : ''}
                    ${categoria === 'LOGISTICA' ? `<div class="prog-placa-wrap">
                      <input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" maxlength="8" value="${escapeHtml(placa)}" placeholder="${placaSugerida ? 'Sugestão: ' + placaSugerida : 'Digite a placa'}" />
                      ${placaSugerida && !placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(placaSugerida)}">Usar ${escapeHtml(placaSugerida)}</button>` : ''}
                      <div class="prog-placa-alert${alertMsg ? ' show' : ''}">${escapeHtml(alertMsg)}</div>
                    </div>` : ''}
                  </td>
                  <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" placeholder="Observação da disponibilidade" /></td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>` : `<div class="prog-empty-section">Nenhum colaborador em ${blockedSection ? 'Bloqueados' : 'Disponíveis'}.</div>`}
    `;
  }

  function renderBloqueadosResumo(rows) {
    if (!rows.length) return '';
    return `
      <div class="prog-section-title blocked">
        <h4>Bloqueados</h4>
        <span class="badge">${rows.length}</span>
      </div>
      <div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Motivo</th><th>Observação</th></tr></thead>
          <tbody>
            ${rows.map((colab) => {
              const r = state.maps.disponibilidade.get(String(colab.id)) || {};
              return `<tr data-colab-id="${escapeHtml(colab.id)}">
                <td>${colabCell(colab)}</td>
                <td><span class="prog-status block">${escapeHtml(disponibilidadeLabel(r.disponibilidade || 'BLOQUEADO'))}</span></td>
                <td>${escapeHtml(r.observacao || '-')}</td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderEstadia(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Tipo de hospedagem</th><th>Cidade</th><th>UF</th><th>Alojamento sugerido</th><th>Check-in</th><th>Check-out</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.estadia.get(String(colab.id)) || {};
              const blocked = isBlocked(colab);
              const tipoAtual = normalizeText(r.tipo_estadia || '');
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_estadia">
                <td>${colabCell(colab)}</td>
                <td>
                  <div class="prog-estadia-selector" data-estadia-selector>
                    ${TIPOS_ESTADIA.map((tipo) => `<button type="button" class="prog-estadia-card${tipoAtual === tipo ? ' active' : ''}" data-estadia-tipo="${escapeHtml(tipo)}" ${blocked ? 'disabled' : ''}>${estadiaIcon(tipo)}<span>${escapeHtml(estadiaLabel(tipo))}</span></button>`).join('')}
                  </div>
                  <input data-field="tipo_estadia" type="hidden" value="${escapeHtml(tipoAtual)}" />
                  ${!tipoAtual ? '<div class="prog-required-note">Selecione uma opção para liberar o salvamento.</div>' : ''}
                </td>
                <td><input data-field="cidade" list="progCidadesBrasilList" type="text" value="${escapeHtml(r.cidade || '')}" placeholder="Digite e selecione a cidade" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="uf" type="text" value="${escapeHtml(r.uf || '')}" placeholder="UF" maxlength="2" ${blocked ? 'disabled' : ''}/></td>
                <td><select data-field="alojamento_id" ${blocked ? 'disabled' : ''}>${alojamentoOptions(r.alojamento_id, r.cidade, r.uf)}</select><input data-field="alojamento_nome" type="hidden" value="${escapeHtml(r.alojamento_nome || '')}" /></td>
                <td><input data-field="checkin" type="date" value="${escapeHtml(r.checkin || '')}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="checkout" type="date" value="${escapeHtml(r.checkout || '')}" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para estadia.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function renderAlimentacao(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Café</th><th>Almoço</th><th>Janta</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.alimentacao.get(String(colab.id)) || { almoco: true };
              const blocked = isBlocked(colab);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_alimentacao">
                <td>${colabCell(colab)}</td>
                <td><input data-field="cafe" type="checkbox" ${r.cafe ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="almoco" type="checkbox" ${r.almoco !== false ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="janta" type="checkbox" ${r.janta ? 'checked' : ''} ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para alimentação.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function renderDeslocamento(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th>Colaborador</th><th>Deslocamento</th><th>Placa</th><th>KM estimado</th><th>Valor</th><th>Observação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const r = state.maps.deslocamento.get(String(colab.id)) || {};
              const disp = state.maps.disponibilidade.get(String(colab.id)) || {};
              const isLogistica = disponibilidadeCategoria(disp.disponibilidade) === 'LOGISTICA';
              const kmInfo = kmEstimadoColaborador(colab);
              const kmValue = r.km || (Number.isFinite(kmInfo.km) ? kmInfo.km.toFixed(2) : '');
              const tipoDefault = isLogistica ? 'MOTORISTA FROTA' : 'NÃO PRECISA';
              const tipoValue = r.tipo_deslocamento || tipoDefault;
              const placaValue = r.placa_veiculo || (isLogistica ? disp.placa_veiculo || '' : '');
              const blocked = isBlocked(colab);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_deslocamento">
                <td>${colabCell(colab)}</td>
                <td><select data-field="tipo_deslocamento" ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_DESLOCAMENTO, tipoValue)}</select></td>
                <td>
                  <input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" value="${escapeHtml(placaValue)}" placeholder="Placa" maxlength="7" ${blocked ? 'disabled' : ''}/>
                  ${(() => {
                    const message = patrimonioMessageForRow(colab, tipoValue, placaValue);
                    return `<div data-patrimonio-alert class="prog-patrimonio-alert ${message ? 'show' : ''}">${escapeHtml(message)}</div>`;
                  })()}
                </td>
                <td>
                  <input data-field="km" type="number" min="0" step="0.01" value="${escapeHtml(kmValue)}" placeholder="" ${blocked ? 'disabled' : ''}/>
                  <span class="prog-km-note">${escapeHtml(kmInfo.km == null ? kmInfo.motivo : kmInfo.motivo)}</span>
                </td>
                <td><input data-field="valor" type="text" value="${escapeHtml(r.valor || '')}" placeholder="R$ 0,00" ${blocked ? 'disabled' : ''}/></td>
                <td><input data-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" ${blocked ? 'disabled' : ''}/></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para deslocamento.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function renderExtras(rows) {
    const { disponiveis, bloqueados } = splitByDisponibilidade(rows);
    el.list.innerHTML = `
      <div class="prog-section-title">
        <h4>Disponíveis</h4>
        <span class="badge">${disponiveis.length}</span>
      </div>
      ${disponiveis.length ? `<div class="prog-table-wrap">
        <table class="prog-table">
          <thead><tr><th style="width:280px">Colaborador</th><th>Despesas extras</th><th style="width:130px">Total</th><th style="width:150px">Ação</th></tr></thead>
          <tbody>
            ${disponiveis.map((colab) => {
              const blocked = isBlocked(colab);
              const extras = state.maps.extras.get(String(colab.id)) || [];
              const total = extras.reduce((acc, r) => acc + Number(r.valor || 0), 0);
              return `<tr data-colab-id="${escapeHtml(colab.id)}" data-table="programacao_extras">
                <td>${colabCell(colab)}</td>
                <td>
                  ${extras.length ? extras.map((r) => extraCard(r, blocked)).join('') : '<span class="muted">Nenhuma despesa extra lançada.</span>'}
                </td>
                <td class="prog-extra-total">${moneyBR(total)}</td>
                <td><button type="button" class="prog-mini-btn" data-action="add-extra" ${blocked ? 'disabled' : ''}>+ Adicionar</button></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>` : '<div class="prog-empty-section">Nenhum colaborador disponível para extras.</div>'}
      ${renderBloqueadosResumo(bloqueados)}`;
  }

  function extraCard(r, blocked) {
    return `<div class="prog-extra-card" data-extra-id="${escapeHtml(r.id)}">
      <select data-extra-field="tipo_despesa" ${blocked ? 'disabled' : ''}>${selectOptions(TIPOS_EXTRA, r.tipo_despesa || 'OUTRO')}</select>
      <input data-extra-field="descricao" type="text" value="${escapeHtml(r.descricao || '')}" placeholder="Descrição" ${blocked ? 'disabled' : ''}/>
      <input data-extra-field="valor" type="text" value="${escapeHtml(r.valor || '')}" placeholder="R$ 0,00" ${blocked ? 'disabled' : ''}/>
      <input data-extra-field="observacao" type="text" value="${escapeHtml(r.observacao || '')}" placeholder="Observação" ${blocked ? 'disabled' : ''}/>
      <button type="button" class="prog-mini-btn danger" data-action="delete-extra" ${blocked ? 'disabled' : ''}>Excluir</button>
    </div>`;
  }


  function preencherUfPorCidade(tr) {
    if (!tr) return;
    const cidadeEl = tr.querySelector('[data-field="cidade"]');
    const ufEl = tr.querySelector('[data-field="uf"]');
    const match = matchCidade(cidadeEl?.value, ufEl?.value);
    if (match) {
      cidadeEl.value = match.nome;
      if (ufEl) ufEl.value = match.uf;
    }
    atualizarSugestaoAlojamento(tr);
  }

  function preencherAlojamentoSelecionado(tr) {
    if (!tr) return;
    const select = tr.querySelector('[data-field="alojamento_id"]');
    const hidden = tr.querySelector('[data-field="alojamento_nome"]');
    const aloj = (state.alojamentos || []).find((a) => String(a.id) === String(select?.value || ''));
    if (hidden) hidden.value = aloj?.nome || '';
    if (aloj) {
      const cidadeEl = tr.querySelector('[data-field="cidade"]');
      const ufEl = tr.querySelector('[data-field="uf"]');
      if (cidadeEl && !cidadeEl.value) cidadeEl.value = aloj.cidade || '';
      if (ufEl && !ufEl.value) ufEl.value = aloj.uf || '';
    }
  }

  function atualizarSugestaoAlojamento(tr) {
    if (!tr) return;
    const tipo = String(tr.querySelector('[data-field="tipo_estadia"]')?.value || '').toUpperCase();
    const select = tr.querySelector('[data-field="alojamento_id"]');
    if (!select) return;
    const cidade = tr.querySelector('[data-field="cidade"]')?.value || '';
    const uf = tr.querySelector('[data-field="uf"]')?.value || '';
    const current = select.value;
    select.innerHTML = alojamentoOptions(current, cidade, uf);
    if (tipo !== 'ALOJAMENTO') {
      select.value = '';
      const hidden = tr.querySelector('[data-field="alojamento_nome"]');
      if (hidden) hidden.value = '';
    }
  }

  function handleTableInput(event) {
    const tr = event.target.closest('tr');
    if (event.target.matches('[data-field="placa_veiculo"]')) {
      event.target.value = onlyPlate(event.target.value);
      if (tr?.dataset.table === 'programacao_colaboradores') updatePlacaLogisticaAlert(tr);
      else updatePatrimonioAlert(tr);
    }
    if (event.target.matches('[data-field]')) scheduleSaveRow(tr);
    if (event.target.matches('[data-extra-field]')) scheduleSaveExtra(event.target.closest('.prog-extra-card'));
  }

  function handleTableChange(event) {
    const tr = event.target.closest('tr');
    if (event.target.matches('[data-field="cidade"]')) preencherUfPorCidade(tr);
    if (event.target.matches('[data-field="uf"]')) event.target.value = normalizeUF(event.target.value);
    if (event.target.matches('[data-field="alojamento_id"]')) preencherAlojamentoSelecionado(tr);
    if (event.target.matches('[data-field="disponibilidade"]') && tr?.dataset.table === 'programacao_colaboradores') {
      const disp = event.target.value;
      const td = event.target.closest('td');
      let placaWrap = td?.querySelector('.prog-placa-wrap');
      if (disp === 'LOGISTICA') {
        if (!placaWrap) {
          const colab = colabById(tr.dataset.colabId);
          const sugestao = suggestVeiculoForColab(colab);
          placaWrap = document.createElement('div');
          placaWrap.className = 'prog-placa-wrap';
          placaWrap.innerHTML = `<input data-field="placa_veiculo" type="text" maxlength="8" value="" placeholder="${sugestao?.placa ? 'Sugestão: ' + sugestao.placa : 'Digite a placa'}" />${sugestao?.placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(sugestao.placa)}">Usar ${escapeHtml(sugestao.placa)}</button>` : ''}<div class="prog-placa-alert"></div>`;
          td.appendChild(placaWrap);
        }
      } else if (placaWrap) {
        placaWrap.remove();
      }
      const colabId = tr.dataset.colabId;
      const existing = state.maps.disponibilidade.get(colabId) || {};
      state.maps.disponibilidade.set(colabId, { ...existing, disponibilidade: disp });
      const statusSpan = tr.querySelector('.prog-status');
      const isNowBlocked = !DISPONIBILIDADES_LIBERADAS.has(disp.trim().toUpperCase());
      if (statusSpan) {
        statusSpan.className = `prog-status ${isNowBlocked ? 'block' : 'ok'}`;
        statusSpan.textContent = isNowBlocked ? 'Bloqueado' : 'Liberado';
      }
    }
    if (event.target.matches('[data-field="placa_veiculo"]')) {
      event.target.value = onlyPlate(event.target.value);
      if (tr?.dataset.table === 'programacao_colaboradores') updatePlacaLogisticaAlert(tr);
    }
    if (event.target.matches('[data-field="tipo_deslocamento"], [data-field="placa_veiculo"]') && tr?.dataset.table !== 'programacao_colaboradores') updatePatrimonioAlert(tr);
    if (event.target.matches('[data-indisponivel-motivo]')) {
      const hidden = tr?.querySelector('[data-field="disponibilidade"]');
      if (hidden) hidden.value = event.target.value || 'ATESTADO';
      scheduleSaveRow(tr);
      return;
    }
    if (event.target.matches('[data-field="tipo_estadia"]')) atualizarSugestaoAlojamento(tr);
    if (event.target.matches('[data-field]')) scheduleSaveRow(tr);
    if (event.target.matches('[data-extra-field]')) scheduleSaveExtra(event.target.closest('.prog-extra-card'));
  }

  async function handleTableClick(event) {
    const estadiaBtn = event.target.closest('.prog-estadia-card');
    if (estadiaBtn) {
      const tr = estadiaBtn.closest('tr');
      if (!tr || estadiaBtn.disabled) return;
      const tipo = estadiaBtn.dataset.estadiaTipo || '';
      const hidden = tr.querySelector('[data-field="tipo_estadia"]');
      if (hidden) hidden.value = tipo;
      tr.querySelectorAll('.prog-estadia-card').forEach((btn) => btn.classList.toggle('active', btn === estadiaBtn));
      const note = tr.querySelector('.prog-required-note');
      if (note) note.remove();
      atualizarSugestaoAlojamento(tr);
      scheduleSaveRow(tr);
      return;
    }

    const tipoBtn = event.target.closest('.prog-tipo-btn');
    if (tipoBtn) {
      if (tipoBtn.disabled || tipoBtn.classList.contains('disabled')) return;
      const tipo = tipoBtn.dataset.tipo;
      const tr = tipoBtn.closest('tr');
      if (!tr) return;
      const colabId = tr.dataset.colabId;
      const colab = colabById(colabId);
      if (tipo === 'OK' && !colaboradorPodeFicarOk(colab)) {
        setFeedback('OK só pode ser marcado quando o colaborador tiver O.S. com status ATENDER no menu OS.', 'warn');
        return;
      }
      const existing = state.maps.disponibilidade.get(colabId) || {};
      const valorDisponibilidade = tipo === 'INDISPONIVEL' ? (disponibilidadeMotivo(existing.disponibilidade) || 'ATESTADO') : tipo;
      state.maps.disponibilidade.set(colabId, { ...existing, disponibilidade: valorDisponibilidade });
      const hiddenInput = tr.querySelector('[data-field="disponibilidade"]');
      if (hiddenInput) hiddenInput.value = valorDisponibilidade;
      tr.querySelectorAll('.prog-tipo-btn').forEach((b) => b.classList.toggle('active', b.dataset.tipo === tipo));
      let placaWrap = tr.querySelector('.prog-placa-wrap');
      let indisWrap = tr.querySelector('.prog-indisponivel-wrap');
      if (indisWrap && tipo !== 'INDISPONIVEL') indisWrap.remove();
      if (tipo === 'INDISPONIVEL' && !indisWrap) {
        const td = tipoBtn.closest('td');
        indisWrap = document.createElement('div');
        indisWrap.className = 'prog-indisponivel-wrap';
        indisWrap.innerHTML = `<select data-indisponivel-motivo>${INDISPONIBILIDADE_MOTIVOS.map((op) => `<option value="${escapeHtml(op)}" ${op === valorDisponibilidade ? 'selected' : ''}>${escapeHtml(disponibilidadeLabel(op))}</option>`).join('')}</select>`;
        const before = td.querySelector('.prog-placa-wrap');
        if (before) td.insertBefore(indisWrap, before); else td.appendChild(indisWrap);
      }
      if (tipo === 'LOGISTICA' && !placaWrap) {
        const td = tipoBtn.closest('td');
        placaWrap = document.createElement('div');
        placaWrap.className = 'prog-placa-wrap';
        const sugestao = suggestVeiculoForColab(colab);
        placaWrap.innerHTML = `<input data-field="placa_veiculo" list="progVeiculosFrotaList" type="text" maxlength="8" value="" placeholder="${sugestao?.placa ? 'Sugestão: ' + sugestao.placa : 'Digite a placa'}" />${sugestao?.placa ? `<button type="button" class="prog-placa-suggest-btn" data-placa="${escapeHtml(sugestao.placa)}">Usar ${escapeHtml(sugestao.placa)}</button>` : ''}<div class="prog-placa-alert"></div>`;
        td.appendChild(placaWrap);
      } else if (placaWrap && tipo !== 'LOGISTICA') {
        placaWrap.remove();
        if (existing.placa_veiculo) {
          state.maps.disponibilidade.set(colabId, { ...state.maps.disponibilidade.get(colabId), placa_veiculo: null });
        }
      }
      const statusSpan = tr.querySelector('.prog-status');
      const isNowBlocked = tipo === 'SEM EMBARQUE' || tipo === 'INDISPONIVEL' || (tipo === 'OK' && !colaboradorPodeFicarOk(colab));
      if (statusSpan) {
        statusSpan.className = `prog-status ${isNowBlocked ? 'block' : 'ok'}`;
        statusSpan.textContent = isNowBlocked ? 'Bloqueado' : 'Liberado';
      }
      scheduleSaveRow(tr);
      return;
    }

    const suggestBtn = event.target.closest('.prog-placa-suggest-btn');
    if (suggestBtn) {
      const tr = suggestBtn.closest('tr');
      if (!tr) return;
      const input = tr.querySelector('[data-field="placa_veiculo"]');
      if (input) {
        input.value = onlyPlate(suggestBtn.dataset.placa || '');
        suggestBtn.remove();
        updatePlacaLogisticaAlert(tr);
        scheduleSaveRow(tr);
      }
      return;
    }

    const addBtn = event.target.closest('[data-action="add-extra"]');
    if (addBtn) {
      const tr = addBtn.closest('tr');
      await addExtra(tr?.dataset.colabId);
      return;
    }
    const delBtn = event.target.closest('[data-action="delete-extra"]');
    if (delBtn) {
      const card = delBtn.closest('.prog-extra-card');
      await deleteExtra(card?.dataset.extraId);
    }
  }

  function scheduleSaveRow(tr) {
    if (!tr) return;
    const key = `${tr.dataset.table}:${tr.dataset.colabId}`;
    clearTimeout(state.timers.get(key));
    state.timers.set(key, setTimeout(() => saveRow(tr), 450));
  }

  function scheduleSaveExtra(card) {
    if (!card) return;
    const key = `extra:${card.dataset.extraId}`;
    clearTimeout(state.timers.get(key));
    state.timers.set(key, setTimeout(() => saveExtra(card), 450));
  }

  function colabById(id) {
    return state.colaboradores.find((c) => String(c.id) === String(id));
  }

  function getFieldPayload(container, attr = 'data-field') {
    const payload = {};
    container.querySelectorAll(`[${attr}]`).forEach((field) => {
      const key = field.getAttribute(attr);
      if (field.type === 'checkbox') payload[key] = !!field.checked;
      else if (['km', 'valor', 'diarias'].includes(key)) payload[key] = toNumberBR(field.value);
      else payload[key] = field.value || null;
    });
    return payload;
  }

  async function saveRow(tr) {
    const table = tr.dataset.table;
    const colab = colabById(tr.dataset.colabId);
    if (!table || !colab) return;

    const payload = {
      ...getFieldPayload(tr),
      programacao_id: state.programacaoId,
      data_referencia: state.dataReferencia,
      colaborador_id: colab.id,
      nome_colaborador: colab.nome,
    };

    if (table === 'programacao_estadia') {
      payload.uf = normalizeUF(payload.uf);
      if (payload.alojamento_id) {
        const aloj = (state.alojamentos || []).find((a) => String(a.id) === String(payload.alojamento_id));
        payload.alojamento_nome = aloj?.nome || payload.alojamento_nome || null;
      }
      payload.tipo_estadia = normalizeText(payload.tipo_estadia || '') || null;
      payload.tem_estadia = Boolean(payload.tipo_estadia);
    }
    if (table === 'programacao_deslocamento') {
      const disp = state.maps.disponibilidade.get(String(colab.id)) || {};
      if (disponibilidadeCategoria(disp.disponibilidade) === 'LOGISTICA') {
        payload.tipo_deslocamento = payload.tipo_deslocamento || 'MOTORISTA FROTA';
        payload.placa_veiculo = payload.placa_veiculo || disp.placa_veiculo || null;
      }
      payload.placa_veiculo = onlyPlate(payload.placa_veiculo);
    }
    if (table === 'programacao_colaboradores') {
      payload.placa_veiculo = payload.disponibilidade === 'LOGISTICA' ? onlyPlate(payload.placa_veiculo) : null;
    }

    const { data, error } = await supabase
      .from(table)
      .upsert(payload, { onConflict: 'programacao_id,colaborador_id' })
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao salvar ${colab.nome}: ${error.message}`, 'error');
      return;
    }

    if (table === 'programacao_colaboradores') state.maps.disponibilidade.set(String(colab.id), data);
    if (table === 'programacao_estadia') state.maps.estadia.set(String(colab.id), data);
    if (table === 'programacao_alimentacao') state.maps.alimentacao.set(String(colab.id), data);
    if (table === 'programacao_deslocamento') state.maps.deslocamento.set(String(colab.id), data);

    updateStats();
    setFeedback(`Salvo automaticamente em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');

    if (table === 'programacao_colaboradores') renderRows();
  }

  async function addExtra(colabId) {
    const colab = colabById(colabId);
    if (!colab) return;

    const { data, error } = await supabase
      .from('programacao_extras')
      .insert({
        programacao_id: state.programacaoId,
        data_referencia: state.dataReferencia,
        colaborador_id: colab.id,
        nome_colaborador: colab.nome,
        tipo_despesa: 'OUTRO',
        descricao: '',
        valor: 0,
        observacao: '',
      })
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao adicionar extra: ${error.message}`, 'error');
      return;
    }

    const arr = state.maps.extras.get(String(colab.id)) || [];
    arr.push(data);
    state.maps.extras.set(String(colab.id), arr);
    renderRows();
    setFeedback('Despesa extra adicionada.', 'ok');
  }

  async function saveExtra(card, opts = {}) {
    const extraId = card?.dataset.extraId;
    if (!extraId) return;
    const payload = getFieldPayload(card, 'data-extra-field');

    const { data, error } = await supabase
      .from('programacao_extras')
      .update(payload)
      .eq('id', extraId)
      .select('*')
      .single();

    if (error) {
      console.error(error);
      setFeedback(`Falha ao salvar extra: ${error.message}`, 'error');
      return;
    }

    const arr = state.maps.extras.get(String(data.colaborador_id)) || [];
    const idx = arr.findIndex((r) => r.id === data.id);
    if (idx >= 0) arr[idx] = data;
    state.maps.extras.set(String(data.colaborador_id), arr);
    if (!opts.silent) {
      setFeedback(`Extra salvo em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');
      renderRows();
    }
  }

  async function deleteExtra(extraId) {
    if (!extraId) return;
    const { error } = await supabase.from('programacao_extras').delete().eq('id', extraId);
    if (error) {
      console.error(error);
      setFeedback(`Falha ao excluir extra: ${error.message}`, 'error');
      return;
    }
    for (const [key, arr] of state.maps.extras.entries()) {
      state.maps.extras.set(key, arr.filter((r) => r.id !== extraId));
    }
    renderRows();
    setFeedback('Despesa extra excluída.', 'ok');
  }


  function draftValueFromDom(table, colabId, field) {
    const tr = el.list.querySelector(`tr[data-table="${table}"][data-colab-id="${CSS.escape(String(colabId))}"]`);
    return tr?.querySelector(`[data-field="${field}"]`)?.value ?? undefined;
  }

  function validarProgramacaoAntesSalvar() {
    const problemas = [];
    state.colaboradores.forEach((colab) => {
      const dispRow = state.maps.disponibilidade.get(String(colab.id)) || {};
      const disp = disponibilidadeCategoria(dispRow.disponibilidade || 'OK');
      const placaLogistica = onlyPlate((draftValueFromDom('programacao_colaboradores', colab.id, 'placa_veiculo') ?? dispRow.placa_veiculo) || '');
      if (disp === 'OK' && !colaboradorPodeFicarOk(colab)) problemas.push(`${colab.nome}: OK só é permitido quando existir O.S. com status ATENDER vinculada no menu OS.`);
      if (disp === 'LOGISTICA' && !placaLogistica) problemas.push(`${colab.nome}: informe ou selecione a placa na etapa A/Logística.`);
      if (disp === 'SEM EMBARQUE' || disp === 'INDISPONIVEL') return;

      const est = state.maps.estadia.get(String(colab.id)) || {};
      const tipoEstadia = normalizeText((draftValueFromDom('programacao_estadia', colab.id, 'tipo_estadia') ?? est.tipo_estadia) || '');
      if (!tipoEstadia) problemas.push(`${colab.nome}: selecione o tipo de hospedagem na etapa B.`);
      const cidade = String((draftValueFromDom('programacao_estadia', colab.id, 'cidade') ?? est.cidade) || '').trim();
      const uf = normalizeUF((draftValueFromDom('programacao_estadia', colab.id, 'uf') ?? est.uf) || '');
      const alojamentoId = (draftValueFromDom('programacao_estadia', colab.id, 'alojamento_id') ?? est.alojamento_id) || '';
      if (['HOTEL', 'ALOJAMENTO', 'PERNOITE'].includes(tipoEstadia) && (!cidade || !uf)) problemas.push(`${colab.nome}: informe cidade/UF da hospedagem.`);
      if (tipoEstadia === 'ALOJAMENTO' && !alojamentoId) problemas.push(`${colab.nome}: selecione o alojamento sugerido/cadastrado.`);

      const desl = state.maps.deslocamento.get(String(colab.id)) || {};
      const tipoDeslocamento = String((draftValueFromDom('programacao_deslocamento', colab.id, 'tipo_deslocamento') ?? desl.tipo_deslocamento) || (disp === 'LOGISTICA' ? 'MOTORISTA FROTA' : '')).toUpperCase();
      const placaDeslocamento = onlyPlate((draftValueFromDom('programacao_deslocamento', colab.id, 'placa_veiculo') ?? desl.placa_veiculo) || (disp === 'LOGISTICA' ? placaLogistica : ''));
      if (['MOTORISTA FROTA', 'CARONA FROTA'].includes(tipoDeslocamento) && !placaDeslocamento) problemas.push(`${colab.nome}: informe a placa do veículo na etapa D.`);
    });
    return problemas;
  }

  async function saveProgramacao() {
    if (!state.programacaoId) {
      setFeedback('Carregue um contexto antes de salvar a programação.', 'warn');
      return;
    }

    const problemas = validarProgramacaoAntesSalvar();
    if (problemas.length) {
      setFeedback(problemas.slice(0, 3).join(' | ') + (problemas.length > 3 ? ` +${problemas.length - 3} pendência(s)` : ''), 'error');
      return;
    }

    try {
      el.saveBtn.disabled = true;
      el.saveBtn.textContent = 'Salvando...';
      setFeedback('Salvando programação...', 'warn');

      for (const timer of state.timers.values()) clearTimeout(timer);
      state.timers.clear();

      const rows = [...el.list.querySelectorAll('tr[data-table]:not([data-table="programacao_extras"])')];
      for (const tr of rows) await saveRow(tr);

      const extraCards = [...el.list.querySelectorAll('.prog-extra-card[data-extra-id]')];
      for (const card of extraCards) await saveExtra(card, { silent: true });

      const { error } = await supabase
        .from('programacao_dia')
        .update({ status: 'salvo', updated_at: new Date().toISOString() })
        .eq('id', state.programacaoId);

      if (error) throw error;

      setFeedback(`Programação salva com sucesso em ${new Date().toLocaleTimeString('pt-BR')}.`, 'ok');
    } catch (error) {
      console.error(error);
      setFeedback(error.message || 'Falha ao salvar programação.', 'error');
    } finally {
      el.saveBtn.disabled = false;
      el.saveBtn.textContent = 'Salvar programação';
    }
  }

  function setFeedback(message, type = '') {
    el.feedback.className = `feedback mt-16 ${type ? `prog-feedback-${type}` : ''}`;
    el.feedback.textContent = message;
  }

  init();
});
