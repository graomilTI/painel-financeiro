import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const DEFAULT_SETORES = ['RH', 'Caixas', 'Frotas', 'Logística', 'Troca de notas'];
const STORAGE_KEY = 'painel_rh_plantao_setores_extra';
const TEMPLATE_STORAGE_KEY = 'painel_rh_plantao_modelo_padrao';
const IMG_W = 1600;
const IMG_H = 900;
const WA_W  = 1080;

let setores = [...DEFAULT_SETORES];
let colaboradores = [];
let contatosMap = new Map();
let escala = {};
let modeloPlantao = [];
let currentUserContext = null;

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function norm(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
}

function onlyDigits(value) {
  return String(value || '').replace(/\D/g, '');
}

function collaboratorKey(row) {
  const cpf = onlyDigits(row?.cpf);
  if (cpf) return cpf;
  return norm(row?.nome || row?.name || '');
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nextWeekendBase() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 6 ? 0 : (6 - day + 7) % 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function addDaysISO(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function dateFromISO(iso) {
  const [y, m, d] = String(iso || '').split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

function isoFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateBR(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function weekdayBR(iso) {
  if (!iso) return '';
  const date = new Date(`${iso}T12:00:00`);
  return ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][date.getDay()];
}

function getPlantaoDatesInRange() {
  const ini = document.getElementById('plantaoData')?.value || nextWeekendBase();
  const fim = document.getElementById('plantaoDataFim')?.value || ini;
  const start = dateFromISO(ini);
  const end = dateFromISO(fim);
  if (!start || !end) return [ini].filter(Boolean);

  const datas = [];
  const d = new Date(start);
  let safety = 0;
  while (d <= end && safety < 370) {
    datas.push(isoFromDate(d));
    d.setDate(d.getDate() + 1);
    safety += 1;
  }
  return datas.length ? datas : [ini].filter(Boolean);
}

function buildDateOptions(selected = '') {
  const datas = getPlantaoDatesInRange();
  const value = selected || datas[0] || nextWeekendBase();
  return datas.map((iso) => `<option value="${esc(iso)}" ${iso === value ? 'selected' : ''}>${esc(weekdayBR(iso))} · ${esc(formatDateBR(iso))}</option>`).join('');
}

function getHorarioPadrao() {
  return {
    hora_inicio: document.getElementById('plantaoPadraoInicio1')?.value || '08:00',
    hora_fim: document.getElementById('plantaoPadraoFim1')?.value || '12:00',
    hora_inicio_2: document.getElementById('plantaoPadraoInicio2')?.value || '13:30',
    hora_fim_2: document.getElementById('plantaoPadraoFim2')?.value || '18:00',
  };
}

function applyHorarioPadraoToForms() {
  const horario = getHorarioPadrao();
  document.querySelectorAll('.plantao-setor').forEach((section) => {
    Object.entries(horario).forEach(([field, value]) => {
      const input = section.querySelector(`[data-field="${field}"]`);
      if (input) input.value = value || '';
    });
  });
}

function formatPhone(value) {
  const d = onlyDigits(value);
  if (!d) return '';
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value || '';
}

function formatTime(time) {
  if (!time) return '';
  return String(time).slice(0, 5).replace(':', ':') + 'h';
}

function buildHorario(row) {
  const parts = [];
  if (row.hora_inicio && row.hora_fim) parts.push(`${formatTime(row.hora_inicio)} às ${formatTime(row.hora_fim)}`);
  if (row.hora_inicio_2 && row.hora_fim_2) parts.push(`${formatTime(row.hora_inicio_2)} às ${formatTime(row.hora_fim_2)}`);
  return parts.join(' | ');
}

function getSavedExtraSetores() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function saveExtraSetores(extra) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(extra));
  } catch {}
}

function injectPlantaoStyles() {
  if (document.getElementById('plantaoStyles')) return;
  const style = document.createElement('style');
  style.id = 'plantaoStyles';
  style.textContent = `
    .plantao-page{display:grid;gap:18px}
    .plantao-tabs{display:flex;gap:10px;flex-wrap:wrap}
    .plantao-tab{border:1px solid var(--line);background:#15152a;color:var(--text);border-radius:14px;padding:10px 14px;font-weight:800;cursor:pointer}
    .plantao-tab.active{background:rgba(22,101,52,.28);color:#dcfce7;border-color:rgba(111,208,165,.28)}
    .plantao-panel{display:none}
    .plantao-panel.active{display:block}
    .plantao-grid{display:grid;grid-template-columns:repeat(12,1fr);gap:14px}
    .plantao-field{grid-column:span 12}
    .plantao-field.third{grid-column:span 4}
    .plantao-field.half{grid-column:span 6}
    .plantao-field.quarter{grid-column:span 3}
    .plantao-label{display:block;font-size:13px;color:var(--muted);font-weight:800;margin-bottom:7px}
    .plantao-input,.plantao-select,.plantao-textarea{width:100%;background:#15152a;color:var(--text);border:1px solid rgba(255,255,255,0.08);border-radius:13px;padding:11px 12px;outline:none}
    .plantao-input:focus,.plantao-select:focus,.plantao-textarea:focus{border-color:#16a34a;box-shadow:0 0 0 2px rgba(22,163,74,.15)}
    .plantao-textarea{min-height:82px;resize:vertical}
    .plantao-card{background:var(--bg-card);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:var(--shadow-soft)}
    .plantao-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
    .plantao-btn{border:0;border-radius:13px;padding:11px 14px;font-weight:800;cursor:pointer}
    .plantao-btn.primary{background:#15803d;color:#fff}
    .plantao-btn.secondary{background:#15152a;color:var(--text);border:1px solid rgba(255,255,255,0.08)}
    .plantao-btn.danger{background:rgba(220,38,38,.18);color:#fecaca;border:1px solid rgba(220,38,38,.28)}
    .plantao-btn:disabled{opacity:.55;cursor:not-allowed}
    .plantao-setores{display:grid;gap:16px}
    .plantao-setor{border:1px solid var(--line);border-radius:18px;padding:14px;background:#15152a}
    .plantao-setor-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:12px}
    .plantao-setor-head h3{margin:0}
    .plantao-add-grid{display:grid;grid-template-columns:1.7fr minmax(150px, .9fr) repeat(4, minmax(92px, 1fr)) 120px;gap:10px;align-items:end}
    .plantao-person-list{display:grid;gap:8px;margin-top:12px}
    .plantao-person{display:grid;grid-template-columns:1.5fr 1fr 1fr auto;gap:10px;align-items:center;border:1px solid var(--line);background:#10101e;border-radius:14px;padding:10px}
    .plantao-person strong{display:block}
    .plantao-person span{color:var(--muted);font-size:13px}
    .plantao-suggest-wrap{position:relative}
    .plantao-suggestions{position:absolute;top:calc(100% + 6px);left:0;right:0;background:#15152a;border:1px solid rgba(255,255,255,0.08);border-radius:14px;box-shadow:0 20px 45px rgba(0,0,0,.35);z-index:20;max-height:260px;overflow:auto;display:none}
    .plantao-suggestions.show{display:block}
    .plantao-suggestion{width:100%;display:block;text-align:left;border:0;background:transparent;color:var(--text);padding:10px 12px;cursor:pointer;border-bottom:1px solid rgba(51,65,85,.4)}
    .plantao-suggestion:hover{background:rgba(22,101,52,.22)}
    .plantao-suggestion small{display:block;color:var(--muted);margin-top:3px}
    .plantao-meta{color:var(--muted);font-size:13px;line-height:1.5}
    .plantao-feedback{min-height:22px;color:#bbf7d0;font-size:14px}
    .plantao-feedback.error{color:#fecaca}
    .plantao-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:16px}
    .plantao-table{width:100%;min-width:920px;border-collapse:collapse;background:#15152a}
    .plantao-table th,.plantao-table td{padding:11px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}
    .plantao-table th{color:var(--muted);font-size:12px;text-transform:uppercase;letter-spacing:.06em}
    .plantao-div-grid{display:grid;gap:20px;margin-top:4px}
    .plantao-div-card{background:var(--bg-card);border:1px solid var(--line);border-radius:22px;padding:20px;box-shadow:var(--shadow-soft)}
    .plantao-div-head{display:flex;justify-content:space-between;align-items:center;padding-bottom:14px;margin-bottom:16px;border-bottom:1px solid rgba(111,208,165,.12)}
    .plantao-div-label{display:flex;align-items:center;gap:10px}
    .plantao-div-num{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:8px;background:rgba(22,101,52,.32);border:1px solid rgba(111,208,165,.28);color:#6fd0a5;font-size:12px;font-weight:900;letter-spacing:.04em;flex-shrink:0}
    .plantao-div-title{font-size:15px;font-weight:900;color:var(--text)}
    .plantao-div-sub{font-size:12px;color:var(--muted);margin-top:2px}
    .plantao-canvas-img{display:block;max-width:100%;background:#050c09;border:1px solid rgba(111,208,165,.10);border-radius:14px}
    .plantao-mini-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
    .plantao-mini-kpi{background:#15152a;border:1px solid var(--line);border-radius:16px;padding:12px}
    .plantao-mini-kpi b{display:block;font-size:22px;margin-top:4px}
    .plantao-radio-row{display:flex;gap:12px;flex-wrap:wrap;align-items:center}
    .plantao-radio-row label{display:inline-flex;gap:8px;align-items:center;background:#15152a;border:1px solid var(--line);border-radius:999px;padding:9px 12px;color:var(--text)}
    .plantao-date-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid rgba(111,208,165,.22);background:rgba(22,101,52,.14);color:#dcfce7;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:800;margin-bottom:5px}
    .plantao-consulta-list{display:grid;gap:10px}
    .plantao-consulta-item{display:grid;grid-template-columns:1fr auto;gap:12px;align-items:center;border:1px solid var(--line);background:#15152a;border-radius:16px;padding:12px}
    .plantao-consulta-title{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-weight:900}
    .plantao-consulta-tags{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}
    .plantao-tag{display:inline-flex;border:1px solid rgba(255,255,255,0.08);background:#10101e;border-radius:999px;padding:5px 8px;color:var(--muted);font-size:12px}
    @media (max-width:980px){
      .plantao-field.third,.plantao-field.half,.plantao-field.quarter{grid-column:span 12}
      .plantao-add-grid,.plantao-person{grid-template-columns:1fr}
      .plantao-mini-kpis{grid-template-columns:1fr 1fr}
    }
  `;
  document.head.appendChild(style);
}

async function loadSetores() {
  const extra = getSavedExtraSetores();
  setores = [...new Set([...DEFAULT_SETORES, ...extra])];

  const { data, error } = await supabase
    .from('rh_plantao_setores')
    .select('nome,ativo,ordem')
    .eq('ativo', true)
    .order('ordem', { ascending: true })
    .order('nome', { ascending: true });

  if (!error && Array.isArray(data) && data.length) {
    setores = [...new Set([...data.map((r) => r.nome).filter(Boolean), ...extra])];
  }
}

async function loadLatestReferenceDate() {
  const { data, error } = await supabase
    .from('colaborador_importacoes')
    .select('data_referencia')
    .eq('status', 'processado')
    .order('data_referencia', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return null;
  return data?.data_referencia || null;
}

async function loadColaboradores() {
  const latest = await loadLatestReferenceDate();
  const pageSize = 1000;
  let from = 0;
  const allRows = [];

  while (true) {
    let query = supabase
      .from('colaborador_snapshot')
      .select('cpf,nome,situacao,empresa,coordenacao,supervisao,cargo,email_empresa,email_pessoal,whatsapp,tipo')
      .order('nome', { ascending: true })
      .range(from, from + pageSize - 1);

    if (latest) query = query.eq('data_referencia', latest);
    query = query.eq('situacao', 'Ativo');

    const { data, error } = await query;
    if (error) throw error;

    const rows = data || [];
    allRows.push(...rows);
    if (rows.length < pageSize) break;
    from += pageSize;

    if (from > 20000) break;
  }

  const unique = new Map();
  allRows.forEach((r) => {
    const key = collaboratorKey(r);
    if (!key) return;
    unique.set(key, {
      ...r,
      key,
      telefone_base: r.whatsapp || '',
      email_base: r.email_empresa || r.email_pessoal || '',
    });
  });

  colaboradores = Array.from(unique.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
}

async function loadContatos() {
  const { data, error } = await supabase
    .from('rh_plantao_contatos')
    .select('*')
    .order('nome', { ascending: true });

  contatosMap = new Map();
  if (!error && Array.isArray(data)) {
    data.forEach((row) => contatosMap.set(row.colaborador_key, row));
  }
}

function getContactForKey(key, baseRow = null) {
  const saved = contatosMap.get(key);
  return {
    telefone: saved?.telefone || baseRow?.telefone_base || baseRow?.whatsapp || '',
    email: saved?.email_corporativo || baseRow?.email_base || baseRow?.email_empresa || baseRow?.email_pessoal || '',
    setor_preferencial: saved?.setor_preferencial || '',
  };
}

function buildEmptyEscala() {
  escala = {};
  setores.forEach((setor) => {
    escala[setor] = [];
  });
}

function addEscalaRow(setor, row) {
  if (!escala[setor]) escala[setor] = [];
  const key = row.colaborador_key || collaboratorKey(row);
  escala[setor].push({
    uid: row.id || `${Date.now()}_${Math.random().toString(16).slice(2)}`,
    id: row.id || null,
    data_plantao: row.data_plantao || document.getElementById('plantaoData')?.value || nextWeekendBase(),
    evento: row.evento || document.getElementById('plantaoEvento')?.value || '',
    setor,
    colaborador_key: key,
    cpf: row.cpf || '',
    nome: row.nome || '',
    telefone: row.telefone || '',
    email_corporativo: row.email_corporativo || '',
    hora_inicio: row.hora_inicio || '',
    hora_fim: row.hora_fim || '',
    hora_inicio_2: row.hora_inicio_2 || '',
    hora_fim_2: row.hora_fim_2 || '',
    observacoes: row.observacoes || '',
  });
}

function getAllEscalaRows() {
  const rows = [];
  Object.entries(escala).forEach(([setor, pessoas]) => {
    pessoas.forEach((p, idx) => rows.push({ ...p, setor, ordem: idx + 1 }));
  });
  return rows;
}

function getSavedModeloLocal() {
  try {
    const parsed = JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveModeloLocal(rows) {
  try {
    localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(rows || []));
  } catch {}
}

async function loadModeloPlantao() {
  modeloPlantao = getSavedModeloLocal();

  const { data, error } = await supabase
    .from('rh_plantao_modelos')
    .select('*')
    .eq('nome_modelo', 'Padrão')
    .order('setor', { ascending: true })
    .order('ordem', { ascending: true });

  if (!error && Array.isArray(data) && data.length) {
    modeloPlantao = data.map((row) => ({
      setor: row.setor,
      colaborador_key: row.colaborador_key,
      cpf: row.cpf || '',
      nome: row.nome || '',
      telefone: row.telefone || '',
      email_corporativo: row.email_corporativo || '',
      hora_inicio: row.hora_inicio || '',
      hora_fim: row.hora_fim || '',
      hora_inicio_2: row.hora_inicio_2 || '',
      hora_fim_2: row.hora_fim_2 || '',
      dias_semana: Array.isArray(row.dias_semana) && row.dias_semana.length ? row.dias_semana : [6, 0],
      ordem: row.ordem || 1,
    }));
    saveModeloLocal(modeloPlantao);
  }
}

async function salvarModeloPlantao() {
  const feedback = document.getElementById('plantaoProgramacaoFeedback');
  const rows = getAllEscalaRows()
    .filter((r) => r.nome && r.hora_inicio && r.hora_fim)
    .map((r, idx) => ({
      setor: r.setor,
      colaborador_key: r.colaborador_key || collaboratorKey(r),
      cpf: r.cpf || '',
      nome: r.nome,
      telefone: r.telefone || '',
      email_corporativo: r.email_corporativo || '',
      hora_inicio: r.hora_inicio || '',
      hora_fim: r.hora_fim || '',
      hora_inicio_2: r.hora_inicio_2 || '',
      hora_fim_2: r.hora_fim_2 || '',
      dias_semana: [6, 0],
      ordem: idx + 1,
    }));

  if (!rows.length) {
    alert('Monte pelo menos uma escala com horário antes de salvar como modelo.');
    return;
  }

  modeloPlantao = rows;
  saveModeloLocal(rows);
  renderModeloTable();

  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = 'Modelo local salvo. Salvando também no Supabase...';
  }

  try {
    const { error: delError } = await supabase
      .from('rh_plantao_modelos')
      .delete()
      .eq('nome_modelo', 'Padrão');
    if (delError) throw delError;

    const payload = rows.map((r) => ({
      nome_modelo: 'Padrão',
      setor: r.setor,
      colaborador_key: r.colaborador_key,
      cpf: r.cpf || null,
      nome: r.nome,
      telefone: r.telefone || null,
      email_corporativo: r.email_corporativo || null,
      hora_inicio: r.hora_inicio || null,
      hora_fim: r.hora_fim || null,
      hora_inicio_2: r.hora_inicio_2 || null,
      hora_fim_2: r.hora_fim_2 || null,
      dias_semana: r.dias_semana || [6, 0],
      ordem: r.ordem || 1,
      created_by: currentUserContext?.user?.id || null,
      updated_at: new Date().toISOString(),
    }));

    const { error: insertError } = await supabase
      .from('rh_plantao_modelos')
      .insert(payload);
    if (insertError) throw insertError;

    if (feedback) feedback.textContent = `Modelo padrão salvo com ${rows.length} linha(s).`;
  } catch (err) {
    console.warn('Modelo salvo localmente, mas não foi possível salvar no banco:', err);
    if (feedback) {
      feedback.classList.add('error');
      feedback.textContent = `Modelo salvo no navegador, mas o banco retornou erro: ${err.message || err}. Confira se a migration nova foi executada.`;
    }
  }
}

function getDiasSelecionadosProgramacao() {
  const dias = [];
  if (document.getElementById('progSabado')?.checked) dias.push(6);
  if (document.getElementById('progDomingo')?.checked) dias.push(0);
  if (document.getElementById('progSexta')?.checked) dias.push(5);
  return dias.length ? dias : [6, 0];
}

function getDatasProgramadas() {
  const inicio = dateFromISO(document.getElementById('progDataInicial')?.value || nextWeekendBase());
  const semanas = Math.max(1, Math.min(52, Number(document.getElementById('progSemanas')?.value || 1)));
  const dias = getDiasSelecionadosProgramacao();
  const datas = [];
  if (!inicio) return datas;

  const base = new Date(inicio);
  const currentDay = base.getDay();
  const firstSaturday = new Date(base);
  firstSaturday.setDate(base.getDate() + ((6 - currentDay + 7) % 7));

  for (let w = 0; w < semanas; w++) {
    dias.forEach((dia) => {
      const d = new Date(firstSaturday);
      const offset = dia === 0 ? 1 : dia - 6;
      d.setDate(firstSaturday.getDate() + (w * 7) + offset);
      datas.push(isoFromDate(d));
    });
  }

  return [...new Set(datas)].sort();
}

function aplicarModeloNaEscala() {
  const feedback = document.getElementById('plantaoProgramacaoFeedback');
  if (!modeloPlantao.length) {
    alert('Salve ou carregue um modelo antes de gerar a programação.');
    return;
  }

  const datas = getDatasProgramadas();
  if (!datas.length) {
    alert('Informe uma data inicial válida.');
    return;
  }

  const modo = document.querySelector('input[name="progModo"]:checked')?.value || 'substituir';
  const evento = document.getElementById('progEvento')?.value?.trim() || document.getElementById('plantaoEvento')?.value?.trim() || 'Plantão programado';

  if (modo === 'substituir') buildEmptyEscala();

  datas.forEach((dataPlantao) => {
    modeloPlantao.forEach((m) => {
      if (!setores.includes(m.setor)) {
        setores.push(m.setor);
        if (!escala[m.setor]) escala[m.setor] = [];
      }
      addEscalaRow(m.setor, {
        ...m,
        data_plantao: dataPlantao,
        evento,
      });
    });
  });

  document.getElementById('plantaoData').value = datas[0];
  document.getElementById('plantaoDataFim').value = datas[datas.length - 1];
  document.getElementById('plantaoEvento').value = evento;
  document.getElementById('plantaoImgData').value = datas[0];
  document.getElementById('plantaoImgDataFim').value = datas[datas.length - 1];

  renderSetores();
  updateKpis();
  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = `Programação gerada: ${datas.length} data(s), ${modeloPlantao.length} linha(s) por data. Clique em “Salvar plantão” para gravar no banco.`;
  }
}

async function carregarModeloPadrao() {
  const feedback = document.getElementById('plantaoProgramacaoFeedback');
  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = 'Carregando modelo padrão...';
  }
  await loadModeloPlantao();
  renderModeloTable();
  if (feedback) feedback.textContent = modeloPlantao.length ? `Modelo carregado com ${modeloPlantao.length} linha(s).` : 'Nenhum modelo salvo ainda. Monte uma escala e clique em “Salvar escala atual como modelo”.';
}

function renderModeloTable() {
  const tbody = document.getElementById('plantaoModeloBody');
  if (!tbody) return;
  tbody.innerHTML = modeloPlantao.length ? modeloPlantao.map((row, idx) => `
    <tr>
      <td>${esc(row.setor)}</td>
      <td><strong>${esc(row.nome)}</strong><div class="plantao-meta">${esc(row.cpf || row.colaborador_key || '')}</div></td>
      <td>${esc(formatPhone(row.telefone) || '-')}</td>
      <td>${esc(row.email_corporativo || '-')}</td>
      <td>${esc(buildHorario(row) || '-')}</td>
      <td><button type="button" class="plantao-btn danger" data-remove-modelo="${idx}">Remover</button></td>
    </tr>
  `).join('') : '<tr><td colspan="6">Nenhum modelo salvo. Monte um final de semana na aba Escala e salve como modelo.</td></tr>';

  tbody.querySelectorAll('[data-remove-modelo]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modeloPlantao.splice(Number(btn.dataset.removeModelo), 1);
      saveModeloLocal(modeloPlantao);
      renderModeloTable();
    });
  });
}

async function loadEscalaFromDb() {
  const dataIni = document.getElementById('plantaoData')?.value || nextWeekendBase();
  const dataFim = document.getElementById('plantaoDataFim')?.value || addDaysISO(dataIni, 1);

  buildEmptyEscala();

  const { data, error } = await supabase
    .from('rh_plantao_escalas')
    .select('*')
    .gte('data_plantao', dataIni)
    .lte('data_plantao', dataFim)
    .order('data_plantao', { ascending: true })
    .order('setor', { ascending: true })
    .order('ordem', { ascending: true });

  if (error) throw error;

  (data || []).forEach((row) => {
    if (!setores.includes(row.setor)) {
      setores.push(row.setor);
      if (!escala[row.setor]) escala[row.setor] = [];
    }
    addEscalaRow(row.setor, row);
  });

  renderSetores();
  updateKpis();
  const feedback = document.getElementById('plantaoFeedback');
  if (feedback) feedback.textContent = `${data?.length || 0} plantonista(s) carregado(s).`;
}

async function loadEscalaSingleDate(dataPlantao) {
  if (!dataPlantao) return;
  const ini = document.getElementById('plantaoData');
  const fim = document.getElementById('plantaoDataFim');
  const imgIni = document.getElementById('plantaoImgData');
  const imgFim = document.getElementById('plantaoImgDataFim');
  if (ini) ini.value = dataPlantao;
  if (fim) fim.value = dataPlantao;
  if (imgIni) imgIni.value = dataPlantao;
  if (imgFim) imgFim.value = dataPlantao;
  await loadEscalaFromDb();
  switchTab('escala');
}

async function abrirImagemSingleDate(dataPlantao) {
  if (!dataPlantao) return;
  const imgIni = document.getElementById('plantaoImgData');
  const imgFim = document.getElementById('plantaoImgDataFim');
  if (imgIni) imgIni.value = dataPlantao;
  if (imgFim) imgFim.value = dataPlantao;
  await loadEscalaSingleDate(dataPlantao);
  switchTab('divulgacao');
}

function aggregateEscalasByDate(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = row.data_plantao;
    if (!map.has(key)) {
      map.set(key, {
        data_plantao: key,
        eventos: new Set(),
        setores: new Set(),
        total: 0,
        nomes: [],
      });
    }
    const item = map.get(key);
    item.total += 1;
    if (row.evento) item.eventos.add(row.evento);
    if (row.setor) item.setores.add(row.setor);
    if (row.nome && item.nomes.length < 8) item.nomes.push(row.nome);
  });

  return Array.from(map.values())
    .sort((a, b) => String(a.data_plantao).localeCompare(String(b.data_plantao)))
    .map((item) => ({
      ...item,
      eventos: Array.from(item.eventos),
      setores: Array.from(item.setores).sort((a, b) => a.localeCompare(b, 'pt-BR')),
    }));
}

async function consultarDatasPlantao() {
  const holder = document.getElementById('plantaoConsultaLista');
  const feedback = document.getElementById('plantaoConsultaFeedback');
  if (!holder) return;

  const dataIni = document.getElementById('consultaDataIni')?.value || todayISO();
  const dataFim = document.getElementById('consultaDataFim')?.value || addDaysISO(dataIni, 45);
  const setor = document.getElementById('consultaSetor')?.value || 'todos';
  const busca = norm(document.getElementById('consultaBusca')?.value || '');

  holder.innerHTML = '';
  if (feedback) {
    feedback.classList.remove('error');
    feedback.textContent = 'Consultando plantões salvos...';
  }

  try {
    let query = supabase
      .from('rh_plantao_escalas')
      .select('id,data_plantao,evento,setor,nome,colaborador_key,hora_inicio,hora_fim')
      .gte('data_plantao', dataIni)
      .lte('data_plantao', dataFim)
      .order('data_plantao', { ascending: true })
      .order('setor', { ascending: true })
      .order('ordem', { ascending: true });

    if (setor !== 'todos') query = query.eq('setor', setor);

    const { data, error } = await query;
    if (error) throw error;

    const filtered = busca
      ? (data || []).filter((r) => norm(`${r.data_plantao} ${r.evento} ${r.setor} ${r.nome}`).includes(busca))
      : (data || []);

    const grouped = aggregateEscalasByDate(filtered);

    if (!grouped.length) {
      holder.innerHTML = '<div class="plantao-meta">Nenhum plantão salvo encontrado para os filtros informados.</div>';
      if (feedback) feedback.textContent = '0 data(s) localizada(s).';
      return;
    }

    holder.innerHTML = grouped.map((item) => `
      <article class="plantao-consulta-item">
        <div>
          <div class="plantao-consulta-title">
            <span class="plantao-date-pill">${esc(weekdayBR(item.data_plantao))} · ${esc(formatDateBR(item.data_plantao))}</span>
            <span>${esc(item.eventos[0] || 'Plantão')}</span>
          </div>
          <div class="plantao-meta">${item.total} plantonista(s) · ${item.setores.length} setor(es)</div>
          <div class="plantao-consulta-tags">
            ${item.setores.slice(0, 8).map((s) => `<span class="plantao-tag">${esc(s)}</span>`).join('')}
            ${item.setores.length > 8 ? `<span class="plantao-tag">+${item.setores.length - 8}</span>` : ''}
          </div>
          <div class="plantao-meta" style="margin-top:8px;">${esc(item.nomes.join(', ') || '-')}</div>
        </div>
        <div class="plantao-actions" style="justify-content:flex-end;">
          <button type="button" class="plantao-btn secondary" data-consulta-carregar="${esc(item.data_plantao)}">Carregar</button>
          <button type="button" class="plantao-btn primary" data-consulta-imagem="${esc(item.data_plantao)}">Imagem</button>
        </div>
      </article>
    `).join('');

    holder.querySelectorAll('[data-consulta-carregar]').forEach((btn) => {
      btn.addEventListener('click', () => loadEscalaSingleDate(btn.dataset.consultaCarregar).catch(showLoadError));
    });
    holder.querySelectorAll('[data-consulta-imagem]').forEach((btn) => {
      btn.addEventListener('click', () => abrirImagemSingleDate(btn.dataset.consultaImagem).catch(showLoadError));
    });

    if (feedback) feedback.textContent = `${grouped.length} data(s) localizada(s), com ${filtered.length} plantonista(s).`;
  } catch (err) {
    console.error(err);
    if (feedback) {
      feedback.classList.add('error');
      feedback.textContent = `Erro ao consultar datas: ${err.message || err}`;
    }
  }
}

function renderKpis() {
  return `
    <div class="plantao-mini-kpis">
      <div class="plantao-mini-kpi"><span class="plantao-meta">Setores</span><b id="kpiSetores">${setores.length}</b></div>
      <div class="plantao-mini-kpi"><span class="plantao-meta">Plantonistas</span><b id="kpiPessoas">0</b></div>
      <div class="plantao-mini-kpi"><span class="plantao-meta">Período</span><b id="kpiPeriodo">-</b></div>
      <div class="plantao-mini-kpi"><span class="plantao-meta">Base contatos</span><b id="kpiContatos">${contatosMap.size}</b></div>
    </div>
  `;
}

function updateKpis() {
  const total = Object.values(escala).reduce((acc, rows) => acc + rows.length, 0);
  const dataIni = document.getElementById('plantaoData')?.value || '';
  const dataFim = document.getElementById('plantaoDataFim')?.value || '';
  const elSetores = document.getElementById('kpiSetores');
  const elPessoas = document.getElementById('kpiPessoas');
  const elPeriodo = document.getElementById('kpiPeriodo');
  const elContatos = document.getElementById('kpiContatos');
  if (elSetores) elSetores.textContent = String(setores.length);
  if (elPessoas) elPessoas.textContent = String(total);
  if (elPeriodo) elPeriodo.textContent = dataIni && dataFim ? `${formatDateBR(dataIni)} a ${formatDateBR(dataFim)}` : '-';
  if (elContatos) elContatos.textContent = String(contatosMap.size);
}

function setupSuggest(input, onSelect) {
  const wrap = input.closest('.plantao-suggest-wrap');
  const box = wrap.querySelector('.plantao-suggestions');

  function render(term) {
    const q = norm(term);
    if (!q || q.length < 2) {
      box.classList.remove('show');
      box.innerHTML = '';
      return;
    }

    const matches = colaboradores
      .filter((c) => norm(`${c.nome} ${c.cpf} ${c.supervisao} ${c.coordenacao}`).includes(q))
      .slice(0, 12);

    box.innerHTML = matches.length
      ? matches.map((c, idx) => `
          <button type="button" class="plantao-suggestion" data-idx="${idx}">
            <strong>${esc(c.nome)}</strong>
            <small>${esc(c.supervisao || c.coordenacao || c.cargo || '')} · ${esc(formatPhone(c.telefone_base) || 'sem telefone')} · ${esc(c.email_base || 'sem e-mail')}</small>
          </button>
        `).join('')
      : '<div class="plantao-suggestion">Nenhum colaborador localizado.</div>';

    box.querySelectorAll('button[data-idx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const selected = matches[Number(btn.dataset.idx)];
        input.value = selected.nome;
        input.dataset.key = selected.key;
        input.dataset.cpf = selected.cpf || '';
        box.classList.remove('show');
        onSelect(selected);
      });
    });

    box.classList.add('show');
  }

  input.addEventListener('input', () => render(input.value));
  input.addEventListener('focus', () => render(input.value));
  document.addEventListener('click', (ev) => {
    if (!wrap.contains(ev.target)) box.classList.remove('show');
  });
}

function renderSetores() {
  const holder = document.getElementById('plantaoSetores');
  if (!holder) return;
  holder.innerHTML = setores.map((setor) => {
    const rows = escala[setor] || [];
    return `
      <section class="plantao-setor" data-setor="${esc(setor)}">
        <div class="plantao-setor-head">
          <div>
            <h3>${esc(setor)}</h3>
            <div class="plantao-meta">${rows.length} plantonista(s) cadastrado(s)</div>
          </div>
          ${DEFAULT_SETORES.includes(setor) ? '' : `<button type="button" class="plantao-btn danger" data-remove-setor="${esc(setor)}">Remover setor</button>`}
        </div>

        <div class="plantao-add-grid">
          <div class="plantao-suggest-wrap">
            <label class="plantao-label">Colaborador</label>
            <input class="plantao-input plantao-colab-input" data-setor="${esc(setor)}" placeholder="Digite o nome do colaborador" autocomplete="off" />
            <div class="plantao-suggestions"></div>
          </div>
          <div>
            <label class="plantao-label">Dia</label>
            <select class="plantao-select" data-field="data_plantao" data-setor="${esc(setor)}">${buildDateOptions()}</select>
          </div>
          <div>
            <label class="plantao-label">Início 1</label>
            <input class="plantao-input" type="time" data-field="hora_inicio" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_inicio)}" />
          </div>
          <div>
            <label class="plantao-label">Fim 1</label>
            <input class="plantao-input" type="time" data-field="hora_fim" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_fim)}" />
          </div>
          <div>
            <label class="plantao-label">Início 2</label>
            <input class="plantao-input" type="time" data-field="hora_inicio_2" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_inicio_2)}" />
          </div>
          <div>
            <label class="plantao-label">Fim 2</label>
            <input class="plantao-input" type="time" data-field="hora_fim_2" data-setor="${esc(setor)}" value="${esc(getHorarioPadrao().hora_fim_2)}" />
          </div>
          <button type="button" class="plantao-btn primary" data-add="${esc(setor)}">Adicionar</button>
        </div>

        <div class="plantao-person-list">
          ${rows.length ? rows.map((row, idx) => `
            <div class="plantao-person" data-row="${idx}" data-setor="${esc(setor)}">
              <div>
                <span class="plantao-date-pill">${esc(weekdayBR(row.data_plantao))} · ${esc(formatDateBR(row.data_plantao))}</span>
                <strong>${esc(row.nome)}</strong>
                <span>${esc(row.cpf || row.colaborador_key || '')}</span>
              </div>
              <div><span>Contato</span><br>${esc(formatPhone(row.telefone) || '-')}</div>
              <div><span>Horário</span><br>${esc(buildHorario(row) || '-')}</div>
              <button type="button" class="plantao-btn danger" data-remove-row="${idx}" data-setor="${esc(setor)}">Remover</button>
            </div>
          `).join('') : '<div class="plantao-meta">Nenhum plantonista adicionado neste setor.</div>'}
        </div>
      </section>
    `;
  }).join('');

  holder.querySelectorAll('.plantao-colab-input').forEach((input) => {
    setupSuggest(input, (selected) => {
      const setor = input.dataset.setor;
      const section = input.closest('.plantao-setor');
      const contact = getContactForKey(selected.key, selected);
      section.dataset.selected = JSON.stringify({
        colaborador_key: selected.key,
        cpf: selected.cpf || '',
        nome: selected.nome || '',
        telefone: contact.telefone,
        email_corporativo: contact.email,
      });
    });
  });

  holder.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => addFromSetorForm(btn.dataset.add));
  });

  holder.querySelectorAll('[data-remove-row]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const setor = btn.dataset.setor;
      escala[setor].splice(Number(btn.dataset.removeRow), 1);
      renderSetores();
      updateKpis();
    });
  });

  holder.querySelectorAll('[data-remove-setor]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const setor = btn.dataset.removeSetor;
      setores = setores.filter((s) => s !== setor);
      delete escala[setor];
      saveExtraSetores(setores.filter((s) => !DEFAULT_SETORES.includes(s)));
      renderSetores();
      updateKpis();
    });
  });

  updateKpis();
}

function addFromSetorForm(setor) {
  const section = document.querySelector(`.plantao-setor[data-setor="${CSS.escape(setor)}"]`);
  const input = section.querySelector('.plantao-colab-input');
  let selected = null;

  try {
    selected = JSON.parse(section.dataset.selected || 'null');
  } catch {}

  if (!selected || norm(selected.nome) !== norm(input.value)) {
    const found = colaboradores.find((c) => norm(c.nome) === norm(input.value));
    if (found) {
      const contact = getContactForKey(found.key, found);
      selected = {
        colaborador_key: found.key,
        cpf: found.cpf || '',
        nome: found.nome || '',
        telefone: contact.telefone,
        email_corporativo: contact.email,
      };
    }
  }

  if (!selected?.nome) {
    alert('Selecione um colaborador da lista antes de adicionar.');
    return;
  }

  const getField = (name) => section.querySelector(`[data-field="${name}"]`)?.value || '';
  const padrao = getHorarioPadrao();
  const data_plantao = getField('data_plantao') || document.getElementById('plantaoData').value;
  const hora_inicio = getField('hora_inicio') || padrao.hora_inicio;
  const hora_fim = getField('hora_fim') || padrao.hora_fim;
  const hora_inicio_2 = getField('hora_inicio_2') || padrao.hora_inicio_2;
  const hora_fim_2 = getField('hora_fim_2') || padrao.hora_fim_2;

  if (!data_plantao) {
    alert('Selecione o dia do plantão antes de adicionar.');
    return;
  }

  if (!hora_inicio || !hora_fim) {
    alert('Informe pelo menos o primeiro horário trabalhado.');
    return;
  }

  addEscalaRow(setor, {
    ...selected,
    data_plantao,
    evento: document.getElementById('plantaoEvento').value,
    hora_inicio,
    hora_fim,
    hora_inicio_2,
    hora_fim_2,
  });

  section.dataset.selected = '';
  renderSetores();
}

async function saveEscala() {
  const feedback = document.getElementById('plantaoFeedback');
  const btn = document.getElementById('btnSalvarPlantao');
  const dataIni = document.getElementById('plantaoData').value;
  const dataFim = document.getElementById('plantaoDataFim').value || dataIni;
  const evento = document.getElementById('plantaoEvento').value.trim();
  const observacoes = document.getElementById('plantaoObs').value.trim();

  const rows = [];
  Object.entries(escala).forEach(([setor, pessoas]) => {
    pessoas.forEach((p, idx) => {
      rows.push({
        data_plantao: p.data_plantao || dataIni,
        evento,
        setor,
        colaborador_key: p.colaborador_key || collaboratorKey(p),
        cpf: p.cpf || null,
        nome: p.nome,
        telefone: p.telefone || null,
        email_corporativo: p.email_corporativo || null,
        hora_inicio: p.hora_inicio || null,
        hora_fim: p.hora_fim || null,
        hora_inicio_2: p.hora_inicio_2 || null,
        hora_fim_2: p.hora_fim_2 || null,
        observacoes,
        ordem: idx + 1,
        created_by: currentUserContext?.user?.id || null,
        updated_at: new Date().toISOString(),
      });
    });
  });

  if (!rows.length) {
    alert('Adicione pelo menos um plantonista antes de salvar.');
    return;
  }

  btn.disabled = true;
  feedback.classList.remove('error');
  feedback.textContent = 'Salvando escala do plantão...';

  try {
    const { error: delError } = await supabase
      .from('rh_plantao_escalas')
      .delete()
      .gte('data_plantao', dataIni)
      .lte('data_plantao', dataFim);

    if (delError) throw delError;

    const { error: insertError } = await supabase
      .from('rh_plantao_escalas')
      .insert(rows);

    if (insertError) throw insertError;

    feedback.textContent = `Plantão salvo com ${rows.length} plantonista(s), separado por ${new Set(rows.map((r) => r.data_plantao)).size} data(s).`;
    if (document.getElementById('plantaoConsultaLista')) consultarDatasPlantao().catch(() => null);
    await loadEscalaFromDb();
  } catch (err) {
    console.error(err);
    feedback.classList.add('error');
    feedback.textContent = `Erro ao salvar: ${err.message || err}`;
  } finally {
    btn.disabled = false;
  }
}

function renderContatosTable() {
  const tbody = document.getElementById('plantaoContatosBody');
  if (!tbody) return;

  const q = norm(document.getElementById('plantaoContatoBusca')?.value || '');
  const rows = colaboradores
    .filter((c) => !q || norm(`${c.nome} ${c.supervisao} ${c.cpf}`).includes(q))
    .slice(0, 300);

  tbody.innerHTML = rows.map((c) => {
    const contact = getContactForKey(c.key, c);
    return `
      <tr data-key="${esc(c.key)}">
        <td><strong>${esc(c.nome)}</strong><div class="plantao-meta">${esc(c.supervisao || c.coordenacao || '')}</div></td>
        <td>${esc(c.cpf || '')}</td>
        <td><input class="plantao-input" data-contact-field="telefone" value="${esc(contact.telefone)}" /></td>
        <td><input class="plantao-input" data-contact-field="email_corporativo" value="${esc(contact.email)}" /></td>
        <td>
          <select class="plantao-select" data-contact-field="setor_preferencial">
            <option value="">Não definido</option>
            ${setores.map((s) => `<option value="${esc(s)}" ${contact.setor_preferencial === s ? 'selected' : ''}>${esc(s)}</option>`).join('')}
          </select>
        </td>
        <td><button type="button" class="plantao-btn secondary" data-save-contact="${esc(c.key)}">Salvar</button></td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-save-contact]').forEach((btn) => {
    btn.addEventListener('click', () => saveContato(btn.dataset.saveContact));
  });
}

async function saveContato(key) {
  const tr = document.querySelector(`tr[data-key="${CSS.escape(key)}"]`);
  const base = colaboradores.find((c) => c.key === key);
  if (!tr || !base) return;

  const get = (name) => tr.querySelector(`[data-contact-field="${name}"]`)?.value?.trim() || '';
  const payload = {
    colaborador_key: key,
    cpf: base.cpf || null,
    nome: base.nome,
    telefone: get('telefone') || null,
    email_corporativo: get('email_corporativo') || null,
    setor_preferencial: get('setor_preferencial') || null,
    atualizado_por: currentUserContext?.user?.id || null,
    updated_at: new Date().toISOString(),
  };

  const feedback = document.getElementById('plantaoContatosFeedback');
  feedback.textContent = 'Salvando contato...';
  feedback.classList.remove('error');

  try {
    const { error } = await supabase
      .from('rh_plantao_contatos')
      .upsert(payload, { onConflict: 'colaborador_key' });

    if (error) throw error;
    contatosMap.set(key, payload);
    feedback.textContent = `Contato de ${base.nome} salvo.`;
    updateKpis();
  } catch (err) {
    console.error(err);
    feedback.classList.add('error');
    feedback.textContent = `Erro ao salvar contato: ${err.message || err}`;
  }
}

async function addSetor() {
  const input = document.getElementById('plantaoNovoSetor');
  const nome = input.value.trim();
  if (!nome) return;

  if (!setores.some((s) => norm(s) === norm(nome))) {
    setores.push(nome);
    escala[nome] = [];
    saveExtraSetores(setores.filter((s) => !DEFAULT_SETORES.includes(s)));

    await supabase
      .from('rh_plantao_setores')
      .upsert({ nome, ativo: true, ordem: setores.length }, { onConflict: 'nome' })
      .then(() => null);
  }

  input.value = '';
  renderSetores();
  renderContatosTable();
  updateKpis();
}

function drawRoundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}


function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#020c05');
  grad.addColorStop(0.5, '#030e07');
  grad.addColorStop(1, '#051209');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const glow1 = ctx.createRadialGradient(120, h * 0.45, 0, 120, h * 0.45, 320);
  glow1.addColorStop(0, 'rgba(22,163,74,.2)');
  glow1.addColorStop(1, 'rgba(22,163,74,0)');
  ctx.fillStyle = glow1;
  ctx.fillRect(0, 0, w, h);

  const glow2 = ctx.createRadialGradient(w * 0.8, h * 0.1, 0, w * 0.8, h * 0.1, 280);
  glow2.addColorStop(0, 'rgba(34,197,94,.10)');
  glow2.addColorStop(1, 'rgba(34,197,94,0)');
  ctx.fillStyle = glow2;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.globalAlpha = 0.042;
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.2;
  const sp = 72;
  for (let i = -3; i < Math.ceil((w + h) / sp) + 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * sp, 0);
    ctx.lineTo(i * sp - h * 0.55, h);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.052;
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1;
  const hexR = 26;
  const hexW = hexR * Math.sqrt(3);
  const hexH2 = hexR * 2;
  for (let row = -1; row < Math.ceil(h / (hexH2 * 0.75)) + 2; row++) {
    for (let col = -1; col < Math.ceil(w / hexW) + 2; col++) {
      const hx = col * hexW + (row % 2 === 0 ? 0 : hexW / 2);
      const hy = row * hexH2 * 0.75;
      ctx.beginPath();
      for (let a = 0; a < 6; a++) {
        const ang = Math.PI / 3 * a - Math.PI / 6;
        const px = hx + hexR * Math.cos(ang);
        const py = hy + hexR * Math.sin(ang);
        a === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

async function drawLogo(ctx, x = 25, y = 25, w = 150, h = 62) {
  try {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.src = './logo-grao1000.svg';
    await new Promise((resolve, reject) => { img.onload = resolve; img.onerror = reject; });
    ctx.drawImage(img, x, y, w, h);
  } catch {
    ctx.fillStyle = '#6fd0a5';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('GRÃO 1000', x, y + 6);
    ctx.font = '13px Arial';
    ctx.fillText('Rastreabilidade e Logística', x, y + 40);
  }
}

function drawRoundRectFilled(ctx, x, y, w, h, r, fillStyle, strokeStyle = '', lineWidth = 1) {
  drawRoundRect(ctx, x, y, w, h, r);
  if (fillStyle) { ctx.fillStyle = fillStyle; ctx.fill(); }
  if (strokeStyle) { ctx.strokeStyle = strokeStyle; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function fitText(ctx, value, maxWidth) {
  let text = String(value || '');
  if (!text) return '';
  if (ctx.measureText(text).width <= maxWidth) return text;
  while (text.length > 4 && ctx.measureText(`${text}…`).width > maxWidth) text = text.slice(0, -1);
  return `${text}…`;
}

function drawCalendarIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.strokeRect(cx - s * 0.85, cy - s * 0.6, s * 1.7, s * 1.3);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.85, cy - s * 0.15); ctx.lineTo(cx + s * 0.85, cy - s * 0.15);
  ctx.moveTo(cx - s * 0.28, cy - s * 0.9); ctx.lineTo(cx - s * 0.28, cy - s * 0.28);
  ctx.moveTo(cx + s * 0.28, cy - s * 0.9); ctx.lineTo(cx + s * 0.28, cy - s * 0.28);
  ctx.stroke();
  ctx.restore();
}

function drawPhoneIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.5, cy - s * 0.8);
  ctx.lineTo(cx - s * 0.5, cy + s * 0.8);
  ctx.arcTo(cx - s * 0.5, cy + s * 0.8, cx + s * 0.5, cy + s * 0.8, s * 0.3);
  ctx.lineTo(cx + s * 0.5, cy - s * 0.8);
  ctx.arcTo(cx + s * 0.5, cy - s * 0.8, cx - s * 0.5, cy - s * 0.8, s * 0.3);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + s * 0.5, s * 0.2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawEmailIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.strokeRect(cx - s * 0.75, cy - s * 0.5, s * 1.5, s);
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.75, cy - s * 0.5);
  ctx.lineTo(cx, cy + s * 0.1);
  ctx.lineTo(cx + s * 0.75, cy - s * 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawClockIcon(ctx, cx, cy, s) {
  ctx.save();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.7;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.78, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy - s * 0.44); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + s * 0.32, cy + s * 0.2); ctx.stroke();
  ctx.restore();
}

function drawSectorIcon(ctx, cx, cy, r, setor) {
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(22,101,52,.32)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(111,208,165,.45)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.strokeStyle = '#6fd0a5';
  ctx.lineWidth = 1.9;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const s = r * 0.46;
  if (setor === 'RH') {
    ctx.beginPath(); ctx.arc(cx, cy - s * 0.4, s * 0.38, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.72, cy + s * 0.88);
    ctx.quadraticCurveTo(cx - s * 0.72, cy + s * 0.1, cx, cy + s * 0.05);
    ctx.quadraticCurveTo(cx + s * 0.72, cy + s * 0.1, cx + s * 0.72, cy + s * 0.88);
    ctx.stroke();
  } else if (setor === 'Logística') {
    const bw = s * 1.3, bh = s * 1.05;
    ctx.strokeRect(cx - bw / 2, cy - bh / 2, bw, bh);
    ctx.beginPath();
    ctx.moveTo(cx - bw / 2, cy - bh / 2 + bh * 0.38); ctx.lineTo(cx + bw / 2, cy - bh / 2 + bh * 0.38);
    ctx.moveTo(cx, cy - bh / 2); ctx.lineTo(cx, cy - bh / 2 + bh * 0.38);
    ctx.stroke();
  } else if (setor === 'Frotas') {
    ctx.strokeRect(cx - s * 0.85, cy - s * 0.38, s * 1.15, s * 0.85);
    ctx.strokeRect(cx + s * 0.3, cy - s * 0.72, s * 0.55, s * 0.72);
    ctx.beginPath();
    ctx.arc(cx - s * 0.42, cy + s * 0.48, s * 0.2, 0, Math.PI * 2);
    ctx.arc(cx + s * 0.57, cy + s * 0.48, s * 0.2, 0, Math.PI * 2);
    ctx.stroke();
  } else if (setor === 'Caixas') {
    ctx.strokeRect(cx - s * 0.72, cy - s * 0.42, s * 1.44, s * 0.84);
    ctx.beginPath(); ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.18, cy); ctx.lineTo(cx + s * 0.18, cy);
    ctx.moveTo(cx, cy - s * 0.28); ctx.lineTo(cx, cy + s * 0.28);
    ctx.stroke();
  } else if (setor === 'Troca de notas') {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.75, cy - s * 0.28); ctx.lineTo(cx + s * 0.35, cy - s * 0.28);
    ctx.moveTo(cx + s * 0.08, cy - s * 0.62); ctx.lineTo(cx + s * 0.75, cy - s * 0.28); ctx.lineTo(cx + s * 0.08, cy + s * 0.06);
    ctx.moveTo(cx + s * 0.75, cy + s * 0.28); ctx.lineTo(cx - s * 0.35, cy + s * 0.28);
    ctx.moveTo(cx - s * 0.08, cy - s * 0.06); ctx.lineTo(cx - s * 0.75, cy + s * 0.28); ctx.lineTo(cx - s * 0.08, cy + s * 0.62);
    ctx.stroke();
  } else {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 3 * i - Math.PI / 6;
      const px = cx + s * 0.82 * Math.cos(a), py = cy + s * 0.82 * Math.sin(a);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.stroke();
  }
  ctx.restore();
}

function computeCardH(pessoas) {
  let h = 20 + 38 + 48 + 11;
  pessoas.forEach((p, i) => {
    h += 40;
    if (formatPhone(p.telefone)) h += 30;
    if (p.email_corporativo) h += 30;
    if (buildHorario(p)) h += 30;
    h += 10;
    if (i < pessoas.length - 1) h += 13;
  });
  return h + 20;
}

function drawPersonBlock(ctx, x, y, w, person) {
  const iS = 9;
  let cy = y;
  ctx.save();
  ctx.font = 'bold 26px Arial';
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(fitText(ctx, (person.nome || '').toUpperCase(), w), x, cy);
  cy += 40;

  function infoRow(drawIcon, label, value) {
    if (!value) return;
    const mid = cy + 15;
    drawIcon(ctx, x + iS, mid, iS);
    ctx.font = '12px Arial';
    ctx.fillStyle = 'rgba(185,210,195,.52)';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + iS * 2 + 7, cy + 1);
    ctx.font = '15px Arial';
    ctx.fillStyle = '#dff5e8';
    ctx.textBaseline = 'bottom';
    ctx.fillText(fitText(ctx, value, w - iS * 2 - 9), x + iS * 2 + 7, cy + 29);
    cy += 30;
  }

  const phone = formatPhone(person.telefone);
  const email = person.email_corporativo;
  const horario = buildHorario(person);
  if (phone) infoRow(drawPhoneIcon, 'Contato', phone);
  if (email) infoRow(drawEmailIcon, 'E-mail', email);
  if (horario) infoRow(drawClockIcon, 'Horário', horario);
  cy += 10;
  ctx.restore();
  return cy - y;
}

function drawSectorCard(ctx, x, y, w, setor, pessoas, dateLabel) {
  const pad = 20;
  const iconR = 18;
  const cardH = computeCardH(pessoas);
  drawRoundRectFilled(ctx, x, y, w, cardH, 18, 'rgba(3,10,6,.88)', 'rgba(22,163,74,.38)', 1.8);

  let cy = y + pad;

  // Date row
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  drawCalendarIcon(ctx, x + pad + 8, cy + 14, 9);
  ctx.fillStyle = 'rgba(185,210,195,.72)';
  ctx.font = '15px Arial';
  ctx.fillText(dateLabel, x + pad + 26, cy + 14);
  ctx.restore();
  cy += 38;

  // Sector badge
  drawSectorIcon(ctx, x + pad + iconR, cy + iconR, iconR, setor);
  const badgeX = x + pad + iconR * 2 + 12;
  ctx.save();
  ctx.font = 'bold 18px Arial';
  const textW = ctx.measureText(setor).width;
  const bh = 34, by = cy + iconR - bh / 2;
  drawRoundRectFilled(ctx, badgeX, by, textW + 28, bh, 10, 'rgba(22,101,52,.28)', 'rgba(111,208,165,.28)', 1.2);
  ctx.fillStyle = '#dcfce7';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(setor, badgeX + 14, by + bh / 2 + 1);
  ctx.restore();
  cy += iconR * 2 + 12;

  // Divider
  ctx.fillStyle = 'rgba(111,208,165,.13)';
  ctx.fillRect(x + pad, cy, w - pad * 2, 1);
  cy += 10;

  // People
  pessoas.forEach((person, i) => {
    const usedH = drawPersonBlock(ctx, x + pad, cy, w - pad * 2, person);
    cy += usedH;
    if (i < pessoas.length - 1) {
      ctx.fillStyle = 'rgba(111,208,165,.07)';
      ctx.fillRect(x + pad, cy - 5, w - pad * 2, 1);
      cy += 8;
    }
  });

  return cardH;
}

function getDateRangeText(pessoas) {
  const dates = [...new Set(pessoas.map((p) => p.data_plantao).filter(Boolean))].sort();
  if (!dates.length) return '';
  if (dates.length === 1) return `${weekdayBR(dates[0])} • ${formatDateBR(dates[0])}`;
  const wds = [...new Set(dates.map(weekdayBR))];
  const fmts = dates.map(formatDateBR);
  return wds.length <= 2
    ? `${wds.join(' e ')} • ${fmts[0]} e ${fmts[fmts.length - 1]}`
    : `${fmts[0]} a ${fmts[fmts.length - 1]}`;
}

function getRowsForDivulgacao(setorFiltro = 'todos') {
  const dataIni = document.getElementById('plantaoImgData')?.value || document.getElementById('plantaoData')?.value || '';
  const dataFim = document.getElementById('plantaoImgDataFim')?.value || document.getElementById('plantaoDataFim')?.value || dataIni;

  const rows = [];
  Object.entries(escala).forEach(([setor, pessoas]) => {
    pessoas.forEach((p) => {
      const date = p.data_plantao || dataIni;
      const inRange = date >= dataIni && date <= dataFim;
      const inSetor = setorFiltro === 'todos' ? true
        : setorFiltro === 'exceto_troca' ? setor !== 'Troca de notas'
        : setor === setorFiltro;
      if (inRange && inSetor) rows.push({ ...p, setor, data_plantao: date });
    });
  });

  rows.sort((a, b) => {
    const byDate = String(a.data_plantao || '').localeCompare(String(b.data_plantao || ''));
    if (byDate) return byDate;
    const bySetor = String(a.setor || '').localeCompare(String(b.setor || ''));
    if (bySetor) return bySetor;
    return String(a.nome || '').localeCompare(String(b.nome || ''));
  });
  return rows;
}

async function renderImagemPlantao(canvasEl = null, setorFiltro = 'todos', subtitleLabel = '') {
  const canvas = canvasEl || document.getElementById('plantaoCanvasGeral');
  if (!canvas) return;

  const rows = getRowsForDivulgacao(setorFiltro);

  const sidebarW = 200;
  const mainX = sidebarW + 20;
  const mainW = IMG_W - mainX - 20;
  const colGap = 20;
  const colW = (mainW - colGap) / 2;
  const headerH = 215;
  const footerH = 70;
  const cardGap = 20;

  // Group rows by sector preserving order
  const orderedSectors = setores.filter((s) =>
    setorFiltro === 'exceto_troca' ? s !== 'Troca de notas' :
    setorFiltro === 'todos' ? true : s === setorFiltro
  );
  const grouped = new Map();
  orderedSectors.forEach((s) => grouped.set(s, []));
  rows.forEach((row) => {
    if (!grouped.has(row.setor)) grouped.set(row.setor, []);
    grouped.get(row.setor).push(row);
  });
  const sectors = [...grouped.entries()].filter(([, p]) => p.length > 0);

  const col1 = sectors.filter((_, i) => i % 2 === 0);
  const col2 = sectors.filter((_, i) => i % 2 === 1);

  function colTotalH(col) {
    return col.reduce((sum, [, p], i) => sum + computeCardH(p) + (i > 0 ? cardGap : 0), 0);
  }

  const cardsH = sectors.length === 0 ? 180
    : sectors.length === 1 ? computeCardH(sectors[0][1])
    : Math.max(colTotalH(col1), colTotalH(col2));

  const canvasH = Math.max(IMG_H, headerH + cardsH + cardGap + footerH);

  canvas.width = IMG_W;
  canvas.height = canvasH;
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, IMG_W, canvasH);
  await drawLogo(ctx, 25, 28, 150, 62);

  // Sidebar divider
  ctx.fillStyle = 'rgba(111,208,165,.15)';
  ctx.fillRect(sidebarW - 5, 18, 1, canvasH - 36);

  // Sidebar tagline at bottom
  const iconBoxSz = 58;
  const tagY = canvasH - 185;
  drawRoundRectFilled(ctx, 18, tagY, iconBoxSz, iconBoxSz, 14, 'rgba(22,101,52,.22)', 'rgba(111,208,165,.20)', 1.2);
  ctx.save();
  ctx.font = '28px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6fd0a5';
  ctx.fillText('🎧', 18 + iconBoxSz / 2, tagY + iconBoxSz / 2);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#6fd0a5';
  ctx.font = 'bold 13px Arial';
  ['ATENDIMENTO', 'QUE MOVE', 'O AGRO.'].forEach((line, i) => ctx.fillText(line, 18, tagY + iconBoxSz + 10 + i * 18));
  ctx.restore();

  // Main header
  const subtitle = subtitleLabel || (setorFiltro === 'exceto_troca' ? 'Todos os setores' : setorFiltro === 'todos' ? 'Todos os setores' : `Setor: ${setorFiltro}`);
  const dataIni = document.getElementById('plantaoImgData')?.value || document.getElementById('plantaoData')?.value || '';
  const dataFim = document.getElementById('plantaoImgDataFim')?.value || document.getElementById('plantaoDataFim')?.value || dataIni;
  const dateText = dataIni === dataFim
    ? `${weekdayBR(dataIni)} • ${formatDateBR(dataIni)}`
    : `${formatDateBR(dataIni)} e ${formatDateBR(dataFim)}`;

  ctx.save();
  ctx.textAlign = 'left';

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 66px Arial';
  ctx.textBaseline = 'top';
  ctx.fillText('Escala de Plantão', mainX, 22);

  ctx.fillStyle = 'rgba(185,210,195,.6)';
  ctx.font = '20px Arial';
  ctx.fillText('Relação de plantonistas escalados para atendimento no período informado.', mainX, 100);

  // Info bar
  const barY = 136;
  ctx.font = 'bold 16px Arial';
  const slW = ctx.measureText(subtitle).width + 26;
  drawRoundRectFilled(ctx, mainX, barY, slW, 34, 999, 'rgba(255,255,255,.055)', 'rgba(111,208,165,.18)', 1);
  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(subtitle, mainX + 13, barY + 17);

  ctx.fillStyle = 'rgba(111,208,165,.22)';
  ctx.fillRect(mainX + slW + 13, barY + 7, 1, 20);

  const periodX = mainX + slW + 26;
  drawCalendarIcon(ctx, periodX + 8, barY + 17, 8);
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = 'rgba(185,210,195,.8)';
  ctx.textBaseline = 'middle';
  ctx.fillText(' Período:', periodX + 22, barY + 17);
  ctx.fillStyle = '#6fd0a5';
  ctx.fillText(dateText, periodX + 22 + ctx.measureText(' Período: ').width, barY + 17);

  ctx.fillStyle = 'rgba(111,208,165,.18)';
  ctx.fillRect(mainX, 186, mainW, 1.5);
  ctx.restore();

  // Cards
  const cardsY = headerH;

  if (sectors.length === 0) {
    drawRoundRectFilled(ctx, mainX, cardsY, mainW, 180, 18, 'rgba(3,10,6,.88)', 'rgba(22,163,74,.25)', 1.5);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Nenhum plantonista cadastrado', mainX + mainW / 2, cardsY + 90);
  } else if (sectors.length === 1) {
    const [[setor, pessoas]] = sectors;
    drawSectorCard(ctx, mainX, cardsY, mainW, setor, pessoas, getDateRangeText(pessoas));
  } else {
    let y1 = cardsY, y2 = cardsY;
    col1.forEach(([setor, pessoas]) => {
      const h = drawSectorCard(ctx, mainX, y1, colW, setor, pessoas, getDateRangeText(pessoas));
      y1 += h + cardGap;
    });
    col2.forEach(([setor, pessoas]) => {
      const h = drawSectorCard(ctx, mainX + colW + colGap, y2, colW, setor, pessoas, getDateRangeText(pessoas));
      y2 += h + cardGap;
    });
  }

  // Footer
  const footerY = canvasH - footerH + 8;
  ctx.save();
  ctx.fillStyle = 'rgba(111,208,165,.18)';
  ctx.fillRect(mainX, footerY, mainW, 1.5);
  drawRoundRectFilled(ctx, mainX, footerY + 12, 26, 26, 6, 'rgba(22,101,52,.2)', 'rgba(111,208,165,.18)', 1);
  ctx.font = '14px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#6fd0a5';
  ctx.fillText('📦', mainX + 13, footerY + 25);
  ctx.textAlign = 'left';
  ctx.font = 'italic 15px Arial';
  ctx.fillStyle = 'rgba(185,210,195,.65)';
  ctx.fillText('Compromisso, agilidade e confiança para manter o agro sempre em movimento.', mainX + 34, footerY + 25);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#6fd0a5';
  ctx.font = 'bold 15px Arial';
  ctx.fillText('www.grao1000.com.br', mainX + mainW, footerY + 25);
  ctx.restore();
}

function baixarImagemPlantao(canvasEl = null, sufixo = '') {
  const canvas = canvasEl || document.getElementById('plantaoCanvasGeral');
  if (!canvas) return;
  const dataIni = document.getElementById('plantaoImgData')?.value || todayISO();
  const link = document.createElement('a');
  link.download = `plantao_${dataIni}${sufixo ? '_' + sufixo : ''}.png`;
  link.href = canvas.toDataURL('image/png');
  link.click();
}

async function renderWhatsappStatus(canvasEl, setor) {
  if (!canvasEl || !setor) return;
  const rows = getRowsForDivulgacao(setor);

  if (!rows.length) {
    canvasEl.width = WA_W; canvasEl.height = 400;
    const ctx = canvasEl.getContext('2d');
    ctx.fillStyle = '#030e07'; ctx.fillRect(0, 0, WA_W, 400);
    ctx.fillStyle = 'rgba(185,210,195,.5)'; ctx.font = '30px Arial';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Nenhum plantonista neste setor', WA_W / 2, 200);
    return;
  }

  const PAD = 56, HEADER_H = 360, FOOTER_H = 90, GAP = 18;

  function personH(p) {
    let h = 32 + 52; // top-pad + name
    if (formatPhone(p.telefone)) h += 46;
    if (p.email_corporativo) h += 46;
    if (buildHorario(p)) h += 46;
    return h + 26; // bottom-pad
  }

  const cardsH = rows.reduce((s, p) => s + personH(p), 0) + (rows.length - 1) * GAP;
  const canvasH = Math.max(1080, HEADER_H + cardsH + 60 + FOOTER_H);

  canvasEl.width = WA_W; canvasEl.height = canvasH;
  const ctx = canvasEl.getContext('2d');

  drawBackground(ctx, WA_W, canvasH);

  // Acento lateral esquerdo
  const aG = ctx.createLinearGradient(0, 0, 0, canvasH);
  aG.addColorStop(0, 'rgba(111,208,165,.55)');
  aG.addColorStop(0.5, 'rgba(111,208,165,.18)');
  aG.addColorStop(1, 'rgba(111,208,165,.0)');
  ctx.fillStyle = aG; ctx.fillRect(0, 0, 8, canvasH);

  // Logo
  await drawLogo(ctx, PAD, 44, 190, 78);

  // Título
  ctx.save();
  ctx.font = 'bold 82px Arial'; ctx.fillStyle = '#fff';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('Escala de Plantão', PAD, 150);
  ctx.restore();

  // Badge setor
  const iconR = 28, badgeY = 256;
  drawSectorIcon(ctx, PAD + iconR, badgeY + iconR, iconR, setor);
  const bx = PAD + iconR * 2 + 20, bH = 54, bW = WA_W - bx - PAD;
  drawRoundRectFilled(ctx, bx, badgeY + iconR - bH / 2, bW, bH, 16,
    'rgba(21,101,52,.3)', 'rgba(111,208,165,.3)', 1.5);
  ctx.save();
  ctx.font = 'bold 34px Arial'; ctx.fillStyle = '#dcfce7';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(setor, bx + 22, badgeY + iconR + 1);
  ctx.restore();

  // Data
  const dateY = badgeY + iconR * 2 + 22;
  const iS = 14;
  drawCalendarIcon(ctx, PAD + iS, dateY + iS, iS);
  ctx.save();
  ctx.font = '28px Arial'; ctx.fillStyle = '#6fd0a5';
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(getDateRangeText(rows), PAD + iS * 2 + 14, dateY + iS);
  ctx.restore();

  // Divisor
  const divY = HEADER_H - 20;
  ctx.fillStyle = 'rgba(111,208,165,.22)'; ctx.fillRect(PAD, divY, WA_W - PAD * 2, 1.5);

  // Cards por pessoa
  const cardW = WA_W - PAD * 2;
  let cy = divY + 30;

  rows.forEach((person) => {
    const h = personH(person);
    drawRoundRectFilled(ctx, PAD, cy, cardW, h, 22,
      'rgba(3,12,7,.85)', 'rgba(22,163,74,.28)', 1.5);

    let iy = cy + 32;

    ctx.save();
    ctx.font = 'bold 44px Arial'; ctx.fillStyle = '#fff';
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(fitText(ctx, (person.nome || '').toUpperCase(), cardW - 44), PAD + 22, iy);
    ctx.restore();
    iy += 52;

    function infoRow(drawIcon, val) {
      if (!val) return;
      const s = 13, mid = iy + 23;
      drawIcon(ctx, PAD + 22 + s, mid, s);
      ctx.save();
      ctx.font = 'bold 26px Arial'; ctx.fillStyle = '#c8ead7';
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(fitText(ctx, val, cardW - 68), PAD + 22 + s * 2 + 10, mid);
      ctx.restore();
      iy += 46;
    }

    infoRow(drawPhoneIcon, formatPhone(person.telefone));
    infoRow(drawEmailIcon, person.email_corporativo);
    infoRow(drawClockIcon, buildHorario(person));

    cy += h + GAP;
  });

  // Rodapé
  const footerY = canvasH - FOOTER_H + 12;
  ctx.fillStyle = 'rgba(111,208,165,.18)'; ctx.fillRect(PAD, footerY, WA_W - PAD * 2, 1.5);
  ctx.save();
  ctx.font = 'bold 26px Arial'; ctx.fillStyle = '#6fd0a5';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('www.grao1000.com.br', WA_W / 2, footerY + 38);
  ctx.restore();
}

async function renderAmbasImagens() {
  renderDivulgacaoControls();
  const canvasGeral = document.getElementById('plantaoCanvasGeral');
  const canvasTroca = document.getElementById('plantaoCanvasTroca');
  const canvasWA   = document.getElementById('plantaoCanvasWA');
  const waSetor    = document.getElementById('plantaoWASetor')?.value || setores[0] || '';
  await Promise.all([
    canvasGeral ? renderImagemPlantao(canvasGeral, 'exceto_troca', 'Escala Geral') : Promise.resolve(),
    canvasTroca ? renderImagemPlantao(canvasTroca, 'Troca de notas', 'Troca de Notas') : Promise.resolve(),
    (canvasWA && waSetor) ? renderWhatsappStatus(canvasWA, waSetor) : Promise.resolve(),
  ]);
}

function renderDivulgacaoControls() {
  const waSelect = document.getElementById('plantaoWASetor');
  if (!waSelect) return;
  const current = waSelect.value;
  waSelect.innerHTML = setores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('');
  if (setores.includes(current)) waSelect.value = current;
}

function renderConsultaSetores() {
  const select = document.getElementById('consultaSetor');
  if (!select) return;
  const current = select.value || 'todos';
  select.innerHTML = `<option value="todos">Todos os setores</option>${setores.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join('')}`;
  select.value = setores.includes(current) ? current : 'todos';
}

function switchTab(tab) {
  document.querySelectorAll('.plantao-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
  document.querySelectorAll('.plantao-panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab));
  if (tab === 'programacao') renderModeloTable();
  if (tab === 'consulta') { renderConsultaSetores(); consultarDatasPlantao(); }
  if (tab === 'contatos') renderContatosTable();
  if (tab === 'divulgacao') {
    renderAmbasImagens();
  }
}

function renderPage(content) {
  const dataIni = nextWeekendBase();
  const dataFim = addDaysISO(dataIni, 1);

  content.innerHTML = `
    <section class="plantao-page">
      <div class="section-heading">
        <div>
          <h2>Plantão</h2>
          <p class="section-subtitle">Monte a escala por data, cadastre mais de um plantonista por setor, consulte plantões salvos e gere a arte de divulgação com telefone, e-mail e horário.</p>
        </div>
      </div>

      ${renderKpis()}

      <div class="plantao-tabs">
        <button type="button" class="plantao-tab active" data-tab="escala">Escala</button>
        <button type="button" class="plantao-tab" data-tab="programacao">Programar várias semanas</button>
        <button type="button" class="plantao-tab" data-tab="consulta">Consultar datas</button>
        <button type="button" class="plantao-tab" data-tab="contatos">Contatos</button>
        <button type="button" class="plantao-tab" data-tab="divulgacao">Divulgação</button>
      </div>

      <div class="plantao-panel active" data-panel="escala">
        <div class="plantao-card">
          <div class="plantao-grid">
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoData">Data inicial</label>
              <input class="plantao-input" type="date" id="plantaoData" value="${dataIni}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoDataFim">Data final</label>
              <input class="plantao-input" type="date" id="plantaoDataFim" value="${dataFim}" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label" for="plantaoEvento">Evento / observação do final de semana</label>
              <input class="plantao-input" id="plantaoEvento" placeholder="Ex.: Sábado e domingo / feriado / plantão operação" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoPadraoInicio1">Horário padrão · Início 1</label>
              <input class="plantao-input" type="time" id="plantaoPadraoInicio1" value="08:00" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoPadraoFim1">Horário padrão · Fim 1</label>
              <input class="plantao-input" type="time" id="plantaoPadraoFim1" value="12:00" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoPadraoInicio2">Horário padrão · Início 2</label>
              <input class="plantao-input" type="time" id="plantaoPadraoInicio2" value="13:30" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="plantaoPadraoFim2">Horário padrão · Fim 2</label>
              <input class="plantao-input" type="time" id="plantaoPadraoFim2" value="18:00" />
            </div>
            <div class="plantao-field">
              <div class="plantao-actions">
                <button type="button" class="plantao-btn secondary" id="btnAplicarHorarioPadrao">Aplicar horário padrão nos campos</button>
                <span class="plantao-meta">Use este horário para preencher rápido os setores; depois ajuste individualmente quando precisar.</span>
              </div>
            </div>
            <div class="plantao-field">
              <label class="plantao-label" for="plantaoObs">Observações internas</label>
              <textarea class="plantao-textarea" id="plantaoObs" placeholder="Observações opcionais para controle interno"></textarea>
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn secondary" id="btnCarregarPlantao">Carregar período</button>
            <button type="button" class="plantao-btn primary" id="btnSalvarPlantao">Salvar plantão</button>
            <input class="plantao-input" id="plantaoNovoSetor" placeholder="Adicionar novo setor" style="max-width:260px;" />
            <button type="button" class="plantao-btn secondary" id="btnAddSetor">Adicionar setor</button>
          </div>
          <div class="plantao-feedback" id="plantaoFeedback"></div>
        </div>

        <div class="plantao-setores" id="plantaoSetores"></div>
      </div>

      <div class="plantao-panel" data-panel="programacao">
        <div class="plantao-card">
          <div class="section-heading">
            <div>
              <h3 style="margin:0 0 6px;">Programar escala por várias semanas</h3>
              <p class="plantao-meta">Monte uma escala-base uma única vez, salve como modelo e gere automaticamente vários finais de semana.</p>
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:12px;">
            <button type="button" class="plantao-btn secondary" id="btnSalvarModeloPlantao">Salvar escala atual como modelo</button>
            <button type="button" class="plantao-btn secondary" id="btnCarregarModeloPlantao">Carregar modelo padrão</button>
          </div>
          <div class="plantao-feedback" id="plantaoProgramacaoFeedback"></div>

          <div class="plantao-grid" style="margin-top:14px;">
            <div class="plantao-field quarter">
              <label class="plantao-label" for="progDataInicial">Primeiro final de semana</label>
              <input class="plantao-input" type="date" id="progDataInicial" value="${dataIni}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="progSemanas">Quantidade de semanas</label>
              <input class="plantao-input" type="number" id="progSemanas" min="1" max="52" value="4" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label" for="progEvento">Evento / descrição</label>
              <input class="plantao-input" id="progEvento" placeholder="Ex.: Plantão final de semana" value="Plantão final de semana" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label">Dias que entram na programação</label>
              <div class="plantao-radio-row">
                <label><input type="checkbox" id="progSexta" /> Sexta</label>
                <label><input type="checkbox" id="progSabado" checked /> Sábado</label>
                <label><input type="checkbox" id="progDomingo" checked /> Domingo</label>
              </div>
            </div>
            <div class="plantao-field half">
              <label class="plantao-label">Modo de geração</label>
              <div class="plantao-radio-row">
                <label><input type="radio" name="progModo" value="substituir" checked /> Substituir escala da tela</label>
                <label><input type="radio" name="progModo" value="somar" /> Somar na escala atual</label>
              </div>
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn primary" id="btnGerarProgramacaoPlantao">Gerar programação</button>
            <button type="button" class="plantao-btn secondary" id="btnSalvarProgramacaoPlantao">Salvar programação gerada</button>
          </div>
        </div>

        <div class="plantao-card" style="margin-top:14px;">
          <h3 style="margin-top:0;">Modelo padrão salvo</h3>
          <div class="plantao-table-wrap">
            <table class="plantao-table">
              <thead>
                <tr>
                  <th>Setor</th>
                  <th>Colaborador</th>
                  <th>Telefone</th>
                  <th>E-mail</th>
                  <th>Horário</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody id="plantaoModeloBody"></tbody>
            </table>
          </div>
        </div>
      </div>


      <div class="plantao-panel" data-panel="consulta">
        <div class="plantao-card">
          <div class="section-heading">
            <div>
              <h3 style="margin:0 0 6px;">Consultar plantões salvos por data</h3>
              <p class="plantao-meta">Cada data fica salva separadamente. Use esta lista para localizar um plantão antigo, carregar para edição ou gerar a imagem de divulgação daquela data.</p>
            </div>
          </div>

          <div class="plantao-grid" style="margin-top:12px;">
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaDataIni">Data inicial</label>
              <input class="plantao-input" type="date" id="consultaDataIni" value="${dataIni}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaDataFim">Data final</label>
              <input class="plantao-input" type="date" id="consultaDataFim" value="${addDaysISO(dataIni, 60)}" />
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaSetor">Setor</label>
              <select class="plantao-select" id="consultaSetor"></select>
            </div>
            <div class="plantao-field quarter">
              <label class="plantao-label" for="consultaBusca">Buscar</label>
              <input class="plantao-input" id="consultaBusca" placeholder="Nome, setor ou evento" />
            </div>
          </div>

          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn primary" id="btnConsultarDatasPlantao">Consultar datas</button>
            <button type="button" class="plantao-btn secondary" id="btnConsultaProximos90">Próximos 90 dias</button>
          </div>
          <div class="plantao-feedback" id="plantaoConsultaFeedback"></div>
        </div>

        <div class="plantao-card" style="margin-top:14px;">
          <div id="plantaoConsultaLista" class="plantao-consulta-list"></div>
        </div>
      </div>

      <div class="plantao-panel" data-panel="contatos">
        <div class="plantao-card">
          <div class="section-heading">
            <div>
              <h3 style="margin:0 0 6px;">Contatos do plantão</h3>
              <p class="plantao-meta">Os dados vêm da base de colaboradores. Quando editar telefone ou e-mail corporativo aqui, o ajuste fica salvo para os próximos plantões.</p>
            </div>
            <input class="plantao-input" id="plantaoContatoBusca" placeholder="Buscar colaborador" style="max-width:320px;" />
          </div>
          <div class="plantao-feedback" id="plantaoContatosFeedback"></div>
          <div class="plantao-table-wrap" style="margin-top:14px;">
            <table class="plantao-table">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>CPF</th>
                  <th>Telefone</th>
                  <th>E-mail corporativo</th>
                  <th>Setor preferencial</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody id="plantaoContatosBody"></tbody>
            </table>
          </div>
        </div>
      </div>

      <div class="plantao-panel" data-panel="divulgacao">
        <div class="plantao-card">
          <div class="plantao-grid">
            <div class="plantao-field half">
              <label class="plantao-label" for="plantaoImgData">Data inicial</label>
              <input class="plantao-input" type="date" id="plantaoImgData" value="${dataIni}" />
            </div>
            <div class="plantao-field half">
              <label class="plantao-label" for="plantaoImgDataFim">Data final</label>
              <input class="plantao-input" type="date" id="plantaoImgDataFim" value="${dataFim}" />
            </div>
          </div>
          <div class="plantao-actions" style="margin-top:14px;">
            <button type="button" class="plantao-btn secondary" id="btnAtualizarImagem">Atualizar imagens</button>
          </div>
        </div>

        <div class="plantao-div-grid">
          <div class="plantao-div-card">
            <div class="plantao-div-head">
              <div class="plantao-div-label">
                <span class="plantao-div-num">01</span>
                <div>
                  <div class="plantao-div-title">Escala Geral</div>
                  <div class="plantao-div-sub">RH · Caixas · Frotas · Logística</div>
                </div>
              </div>
              <button type="button" class="plantao-btn primary" id="btnBaixarImagemGeral">Baixar PNG</button>
            </div>
            <canvas id="plantaoCanvasGeral" class="plantao-canvas-img" width="${IMG_W}" height="${IMG_H}"></canvas>
          </div>

          <div class="plantao-div-card">
            <div class="plantao-div-head">
              <div class="plantao-div-label">
                <span class="plantao-div-num">02</span>
                <div>
                  <div class="plantao-div-title">Troca de Notas</div>
                  <div class="plantao-div-sub">Setor exclusivo</div>
                </div>
              </div>
              <button type="button" class="plantao-btn primary" id="btnBaixarImagemTroca">Baixar PNG</button>
            </div>
            <canvas id="plantaoCanvasTroca" class="plantao-canvas-img" width="${IMG_W}" height="${IMG_H}"></canvas>
          </div>

          <div class="plantao-div-card">
            <div class="plantao-div-head">
              <div class="plantao-div-label">
                <span class="plantao-div-num" style="font-size:11px;letter-spacing:.5px;padding:0 8px;">WA</span>
                <div>
                  <div class="plantao-div-title">Status WhatsApp</div>
                  <div class="plantao-div-sub">1080×vertical · por setor</div>
                </div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <select class="plantao-select" id="plantaoWASetor" style="min-width:160px;"></select>
                <button type="button" class="plantao-btn primary" id="btnBaixarWA">Baixar PNG</button>
              </div>
            </div>
            <canvas id="plantaoCanvasWA" class="plantao-canvas-img" width="${WA_W}" height="${WA_W}"></canvas>
          </div>
        </div>
      </div>
    </section>
  `;

  document.querySelectorAll('.plantao-tab').forEach((btn) => btn.addEventListener('click', () => switchTab(btn.dataset.tab)));
  document.getElementById('btnCarregarPlantao')?.addEventListener('click', () => loadEscalaFromDb().catch(showLoadError));
  document.getElementById('btnSalvarPlantao')?.addEventListener('click', saveEscala);
  document.getElementById('btnAplicarHorarioPadrao')?.addEventListener('click', applyHorarioPadraoToForms);
  document.getElementById('btnSalvarModeloPlantao')?.addEventListener('click', salvarModeloPlantao);
  document.getElementById('btnCarregarModeloPlantao')?.addEventListener('click', () => carregarModeloPadrao().catch(showLoadError));
  document.getElementById('btnGerarProgramacaoPlantao')?.addEventListener('click', aplicarModeloNaEscala);
  document.getElementById('btnSalvarProgramacaoPlantao')?.addEventListener('click', saveEscala);
  document.getElementById('btnAddSetor')?.addEventListener('click', addSetor);
  document.getElementById('btnConsultarDatasPlantao')?.addEventListener('click', consultarDatasPlantao);
  document.getElementById('btnConsultaProximos90')?.addEventListener('click', () => {
    const ini = todayISO();
    document.getElementById('consultaDataIni').value = ini;
    document.getElementById('consultaDataFim').value = addDaysISO(ini, 90);
    consultarDatasPlantao();
  });
  ['consultaDataIni','consultaDataFim','consultaSetor'].forEach((id) => document.getElementById(id)?.addEventListener('change', consultarDatasPlantao));
  document.getElementById('consultaBusca')?.addEventListener('input', () => {
    clearTimeout(window.__plantaoConsultaTimer);
    window.__plantaoConsultaTimer = setTimeout(consultarDatasPlantao, 250);
  });
  document.getElementById('plantaoContatoBusca')?.addEventListener('input', renderContatosTable);
  document.getElementById('btnAtualizarImagem')?.addEventListener('click', renderAmbasImagens);
  document.getElementById('btnBaixarImagemGeral')?.addEventListener('click', () => baixarImagemPlantao(document.getElementById('plantaoCanvasGeral'), 'geral'));
  document.getElementById('btnBaixarImagemTroca')?.addEventListener('click', () => baixarImagemPlantao(document.getElementById('plantaoCanvasTroca'), 'troca_notas'));
  document.getElementById('plantaoWASetor')?.addEventListener('change', async () => {
    const setor = document.getElementById('plantaoWASetor').value;
    const canvasWA = document.getElementById('plantaoCanvasWA');
    if (canvasWA && setor) await renderWhatsappStatus(canvasWA, setor);
  });
  document.getElementById('btnBaixarWA')?.addEventListener('click', () => {
    const setor = document.getElementById('plantaoWASetor')?.value || '';
    baixarImagemPlantao(document.getElementById('plantaoCanvasWA'), `wa_${setor.replace(/\s+/g, '_')}`);
  });
  document.getElementById('plantaoData')?.addEventListener('change', () => {
    const ini = document.getElementById('plantaoData').value;
    document.getElementById('plantaoDataFim').value = addDaysISO(ini, 1);
    document.getElementById('plantaoImgData').value = ini;
    document.getElementById('plantaoImgDataFim').value = addDaysISO(ini, 1);
    renderSetores();
    updateKpis();
  });
  document.getElementById('plantaoDataFim')?.addEventListener('change', () => {
    document.getElementById('plantaoImgDataFim').value = document.getElementById('plantaoDataFim').value;
    renderSetores();
    updateKpis();
  });
  ['plantaoPadraoInicio1','plantaoPadraoFim1','plantaoPadraoInicio2','plantaoPadraoFim2'].forEach((id) => {
    document.getElementById(id)?.addEventListener('change', applyHorarioPadraoToForms);
  });

  buildEmptyEscala();
  renderSetores();
  renderConsultaSetores();
  renderDivulgacaoControls();
}

function showLoadError(err) {
  console.error(err);
  const feedback = document.getElementById('plantaoFeedback');
  if (feedback) {
    feedback.classList.add('error');
    feedback.textContent = `Erro ao carregar plantão: ${err.message || err}`;
  }
}

initProtectedPage('Plantão', async (content, userContext) => {
  currentUserContext = userContext;
  injectPlantaoStyles();
  renderPage(content);

  const feedback = document.getElementById('plantaoFeedback');
  try {
    feedback.textContent = 'Carregando colaboradores, contatos e setores...';
    await Promise.all([loadSetores(), loadColaboradores(), loadContatos(), loadModeloPlantao()]);
    buildEmptyEscala();
    renderSetores();
    renderContatosTable();
    renderModeloTable();
    renderConsultaSetores();
    renderDivulgacaoControls();
    updateKpis();
    feedback.textContent = `Base carregada com ${colaboradores.length} colaborador(es). Preencha a escala, carregue um período salvo ou programe várias semanas.`;
  } catch (err) {
    console.error(err);
    feedback.classList.add('error');
    feedback.textContent = `Erro ao iniciar Plantão: ${err.message || err}`;
  }
});
