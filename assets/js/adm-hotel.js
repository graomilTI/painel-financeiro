import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';

const LABELS = {
  CASA: 'Casa', APARTAMENTO: 'Apartamento', POUSADA: 'Pousada', ESCRITORIO: 'Escritório',
  SOLICITADA: 'Solicitada', EM_ANALISE: 'Em análise', EM_COTACAO: 'Em cotação', RESERVADA: 'Reservada', CANCELADA: 'Cancelada', CONCLUIDA: 'Concluída',
  CHECKIN_PREVISTO: 'Check-in previsto', HOSPEDADO: 'Hospedado', CHECKOUT_HOJE: 'Checkout hoje', RENOVACAO_NECESSARIA: 'Renovação necessária', CHECKOUT_REALIZADO: 'Checkout realizado',
  NAO_INICIADO: 'Não iniciado', AGUARDANDO_PAGAMENTO: 'Aguardando pagamento', ENVIADO_AO_FINANCEIRO: 'Enviado ao financeiro', PAGO: 'Pago', SEM_COBRANCA: 'Sem cobrança',
  NAO_SOLICITADA: 'Não solicitada', AGUARDANDO_NF: 'Aguardando NF', NF_RECEBIDA: 'NF recebida', ENVIADO_PARA_LANCAMENTO: 'Enviado p/ lançamento', LANCADO: 'Lançado', DISPENSADO: 'Dispensado',
  ATIVO: 'Ativo', INATIVO: 'Inativo', BLOQUEADO: 'Bloqueado', PREFERENCIAL: 'Preferencial', NORMAL: 'Normal', EVITAR: 'Evitar'
};

function esc(value) { return String(value ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#039;"); }
function brDate(value) { if (!value) return '-'; const [y,m,d] = String(value).slice(0,10).split('-'); return y&&m&&d ? `${d}/${m}/${y}` : String(value); }
function money(value) { return Number(value||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function diffDays(start,end) { if (!start||!end) return 1; return Math.max(1,Math.round((new Date(`${end}T00:00:00`)-new Date(`${start}T00:00:00`))/86400000)||1); }
function slug(value) { return String(value||'').toLowerCase().replace(/[^a-z0-9]+/g,'_'); }
function label(value) { return LABELS[value]||value||'-'; }
function normalizeText(value) { return String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(); }
function normalizeUF(value) { return String(value||'').trim().toUpperCase().slice(0,2); }
function toNumber(value) { const n=Number(String(value??'').replace(',','.')); return Number.isFinite(n)?n:0; }
function getHotelDiariaPorTipo(hotel,tipo='INDIVIDUAL') {
  if (!hotel) return 0;
  const keyByTipo={INDIVIDUAL:'valor_diaria_individual',DUPLO:'valor_diaria_duplo',TRIPLO:'valor_diaria_triplo',QUADRUPLO:'valor_diaria_quadruplo'};
  const key=keyByTipo[String(tipo||'INDIVIDUAL').toUpperCase()]||'valor_diaria_individual';
  return toNumber(hotel[key]??hotel.valor_diaria_padrao??hotel.valor_diaria_individual);
}

function injectStyles() {
  if (document.getElementById('admHospStyles')) return;
  const style = document.createElement('style');
  style.id = 'admHospStyles';
  style.textContent = `
    .adm-hosp-tabs{display:flex;gap:6px;flex-wrap:wrap;margin:16px 0}.adm-hosp-tab{width:auto!important;margin-top:0!important;border:1px solid var(--line-2);background:#15152a;color:var(--text);border-radius:999px;padding:9px 16px;cursor:pointer;font-weight:800;font-size:13px}.adm-hosp-tab.active{background:rgba(22,101,52,.32);color:#dcfce7;border-color:rgba(111,208,165,.34)}.adm-hosp-tab small{margin-left:5px;color:#fde68a;font-weight:900;font-size:11px}.adm-hosp-panel{display:none}.adm-hosp-panel.active{display:block}.adm-hosp-btn{width:auto!important;margin-top:0!important}.adm-hosp-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.adm-hosp-table{width:100%;border-collapse:collapse;min-width:700px;background:#15152a}.adm-hosp-table th,.adm-hosp-table td{padding:12px 14px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.adm-hosp-table th{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.07em}.adm-hosp-table tr:hover td{background:rgba(111,208,165,.03)}.adm-hosp-actions{display:flex;gap:8px;flex-wrap:wrap}.adm-hosp-small{padding:8px 12px!important;border-radius:12px!important;font-size:12px;font-weight:800!important}.adm-hosp-status{display:inline-flex;align-items:center;padding:5px 9px;border-radius:999px;border:1px solid var(--line-2);background:rgba(255,255,255,.04);font-size:11px;font-weight:800;white-space:nowrap}.adm-hosp-status.solicitada,.adm-hosp-status.em_analise,.adm-hosp-status.em_cotacao,.adm-hosp-status.aguardando_pagamento,.adm-hosp-status.aguardando_nf{color:#fde68a;background:rgba(245,158,11,.1);border-color:rgba(245,158,11,.24)}.adm-hosp-status.reservada,.adm-hosp-status.checkin_previsto,.adm-hosp-status.hospedado,.adm-hosp-status.enviado_ao_financeiro,.adm-hosp-status.nf_recebida{color:#bfdbfe;background:rgba(59,130,246,.11);border-color:rgba(59,130,246,.25)}.adm-hosp-status.concluida,.adm-hosp-status.pago,.adm-hosp-status.lancado,.adm-hosp-status.ativo,.adm-hosp-status.preferencial{color:#bbf7d0;background:rgba(22,101,52,.22);border-color:rgba(22,101,52,.34)}.adm-hosp-status.cancelada,.adm-hosp-status.bloqueado,.adm-hosp-status.evitar{color:#fecaca;background:rgba(220,38,38,.13);border-color:rgba(220,38,38,.24)}.adm-hosp-status.checkout_hoje,.adm-hosp-status.renovacao_necessaria{color:#fed7aa;background:rgba(249,115,22,.11);border-color:rgba(249,115,22,.24)}
    .adm-hosp-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.adm-hosp-field{display:flex;flex-direction:column;gap:7px}.adm-hosp-field.full{grid-column:1/-1}.adm-hosp-field label{font-size:13px;color:#cbd5e1;font-weight:800}.adm-hosp-field input,.adm-hosp-field textarea,.adm-hosp-field select{width:100%;border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:14px;padding:12px 13px;outline:none;color-scheme:dark}.adm-hosp-field textarea{resize:vertical;min-height:72px}.adm-hosp-field input:focus,.adm-hosp-field textarea:focus,.adm-hosp-field select:focus{border-color:var(--green-2);box-shadow:0 0 0 3px rgba(111,208,165,.12)}.adm-hosp-form-actions{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:16px}.adm-hosp-feedback{color:var(--muted);font-size:13px}.adm-hosp-danger{border-color:rgba(220,38,38,.32)!important;background:rgba(127,29,29,.45)!important;color:#fecaca!important}.adm-hosp-danger:hover{background:rgba(185,28,28,.55)!important;color:#fff!important}.adm-hosp-feedback.ok{color:#bbf7d0}.adm-hosp-feedback.err{color:#fecaca}.adm-hosp-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;padding:16px;background:rgba(2,6,23,.82);backdrop-filter:blur(6px)}.adm-hosp-modal.open{display:flex}.adm-hosp-modal-card{width:min(900px,100%);max-height:94vh;overflow:auto;background:#081611;border:1px solid var(--line-2);border-radius:24px;box-shadow:var(--shadow);padding:24px}.adm-hosp-modal-card.narrow{width:min(560px,100%)}.adm-hosp-modal-card.medium{width:min(680px,100%)}.adm-hosp-modal-card.small{width:min(480px,100%)}.adm-hosp-modal-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:0}.adm-hosp-modal-head h3{margin:0}.adm-hosp-toolbar{display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap;margin-bottom:14px}.adm-hosp-search{min-width:220px;border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:14px;padding:10px 13px;color-scheme:dark;font-size:13px}.adm-hosp-empty{padding:20px;text-align:center;color:var(--muted)}.adm-hosp-row-note{display:block;color:var(--muted);font-size:12px;margin-top:3px}.adm-hosp-colab-list{display:grid;gap:5px}.adm-hosp-colab-item{display:grid;gap:1px;line-height:1.2}.adm-hosp-colab-name{font-weight:800;color:var(--text);font-size:13px}.adm-hosp-colab-regional{font-size:11px;color:#9ca3af}.adm-hosp-select-hint{margin-top:6px;font-size:12px;color:#93c5fd}.adm-hosp-select-hint.warn{color:#fde68a}
    .adm-section-block{margin-top:16px}.adm-section-label{font-size:11px;font-weight:900;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
    .adm-colab-chips{display:flex;flex-wrap:wrap;gap:8px;padding:4px 0;min-height:36px}.adm-colab-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(22,101,52,.16);border:1px solid rgba(111,208,165,.22);border-radius:999px;padding:6px 10px 6px 12px}.adm-colab-chip .cn{font-size:13px;font-weight:800;color:#dcfce7}.adm-colab-chip .cr{font-size:11px;color:#9ca3af}.adm-colab-chip .cx{background:none;border:none;color:#6b7280;cursor:pointer;font-size:15px;font-weight:900;padding:0 2px;line-height:1;margin-left:2px}.adm-colab-chip .cx:hover{color:#fecaca}.adm-colab-chip.excluido{background:rgba(220,38,38,.07);border-color:rgba(220,38,38,.2);opacity:.65}.adm-colab-chip.excluido .cn{color:#fca5a5;text-decoration:line-through}.adm-colab-chip.excluido .cx{color:#fca5a5}
    .adm-colab-check-list{display:flex;flex-direction:column;gap:6px;padding:4px 0}.adm-check-colab{display:flex;align-items:center;gap:10px;cursor:pointer;padding:9px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.02);transition:background .1s}.adm-check-colab:hover{background:rgba(111,208,165,.06)}.adm-check-colab input[type="checkbox"]{width:16px;height:16px;accent-color:#4ade80;flex-shrink:0}.adm-check-colab span{font-size:13px;font-weight:800;color:var(--text)}
    .adm-room-wrap{margin-top:16px;border:1px solid var(--line);border-radius:18px;background:rgba(15,23,42,.34);padding:14px}.adm-room-title{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:10px}.adm-room-title strong{display:block;color:#e2e2f0}.adm-room-title span{display:block;color:#9ca3af;font-size:12px;margin-top:3px}.adm-room-chip{display:inline-flex;border:1px solid rgba(111,208,165,.22);background:rgba(22,101,52,.16);color:#dcfce7;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900}.adm-room-add{display:grid;grid-template-columns:1fr 1fr .65fr .9fr auto;gap:10px;align-items:end;margin-top:12px}.adm-room-mini{display:flex;flex-direction:column;gap:6px}.adm-room-add label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:900}.adm-room-add select,.adm-room-add input{border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:12px;padding:10px 11px;outline:none;color-scheme:dark}.adm-room-list{display:grid;gap:8px;margin-top:12px}.adm-room-row{display:grid;grid-template-columns:1fr 1fr .65fr .9fr 1fr auto;gap:8px;align-items:center;border:1px solid rgba(148,163,184,.14);background:rgba(2,6,23,.34);border-radius:14px;padding:10px}.adm-room-row-pill{font-weight:900;color:#e2e2f0}.adm-room-row-type{color:#cbd5e1}.adm-room-row input{border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:12px;padding:10px 11px;outline:none;color-scheme:dark}.adm-room-row-subtotal{font-weight:900;color:#bbf7d0}.adm-room-remove{border:1px solid rgba(220,38,38,.24);background:rgba(127,29,29,.36);color:#fecaca;border-radius:12px;padding:9px 11px;font-weight:900;cursor:pointer}.adm-room-empty{border:1px dashed rgba(148,163,184,.22);border-radius:14px;padding:12px;color:#6b7280;font-size:12px}.adm-room-summary{margin-top:10px;color:#fde68a;font-size:12px;font-weight:800}
    .adm-checkout-totals{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line);border-radius:14px;padding:12px}.adm-checkout-line{display:flex;justify-content:space-between;align-items:center;color:#cbd5e1;font-size:14px}.adm-checkout-total-box{display:flex;justify-content:space-between;align-items:center;background:rgba(22,101,52,.12);border:1px solid rgba(111,208,165,.22);border-radius:14px;padding:12px 16px;font-size:15px;color:#dcfce7;margin-top:12px}.adm-checkout-total-box strong{font-size:18px;font-weight:900}
    .adm-extra-list{display:grid;gap:8px;margin-top:8px}.adm-extra-row{display:grid;grid-template-columns:1fr .4fr .5fr auto;gap:8px;align-items:end}.adm-extra-row input,.adm-extra-row select{border:1px solid rgba(255,255,255,0.08);background:#15152a;color:var(--text);border-radius:12px;padding:10px 11px;color-scheme:dark}
    .adm-pix-placeholder{border:1px dashed rgba(111,208,165,.28);border-radius:14px;padding:20px;text-align:center;color:#6b7280;font-size:13px;margin-top:8px}
    .adm-hosp-action-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.adm-hosp-action-grid .btn{width:100%!important}
    .adm-hidden-soft{display:none!important}.adm-hidden{display:none!important}.adm-hosp-help{font-size:12px;color:#6b7280;margin-top:4px}.mt-16{margin-top:16px!important}
    .adm-menu-mode-hoteis [data-tab="alojamentos"],.adm-menu-mode-alojamentos [data-tab="solicitadas"],.adm-menu-mode-alojamentos [data-tab="reservados"],.adm-menu-mode-alojamentos [data-tab="checkout"],.adm-menu-mode-alojamentos [data-tab="financeiro"],.adm-menu-mode-alojamentos [data-tab="concluidos"],.adm-menu-mode-alojamentos [data-tab="hoteis"]{display:none!important}
    .dash-period-bar{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
    .dash-period-btn{padding:6px 14px;border-radius:999px;border:1px solid var(--line-2);background:transparent;color:var(--muted);font-size:12px;font-weight:800;cursor:pointer;transition:all .15s}
    .dash-period-btn.active{background:rgba(22,101,52,.28);color:#dcfce7;border-color:rgba(111,208,165,.3)}
    .dash-kpi-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:16px}
    .dash-kpi{background:#0d1b12;border:1px solid rgba(111,208,165,.12);border-radius:18px;padding:16px 18px;position:relative;overflow:hidden}
    .dash-kpi::before{content:'';position:absolute;inset:0;background:var(--kpi-glow,transparent);pointer-events:none}
    .dash-kpi-value{font-size:30px;font-weight:900;font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:var(--kpi-color,#e2e8f0);line-height:1;position:relative}
    .dash-kpi-label{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin-top:8px;position:relative}
    .dash-kpi-sub{font-size:11px;color:var(--muted);margin-top:3px;opacity:.7;position:relative}
    .dash-main-grid{display:grid;grid-template-columns:1fr 1.5fr;gap:14px;margin-bottom:14px}
    .dash-bottom-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .dash-card{background:#0d1b12;border:1px solid rgba(111,208,165,.1);border-radius:18px;padding:16px 18px}
    .dash-card-title{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.08em;color:#6b7280;margin-bottom:12px}
    .dash-rank-list{display:flex;flex-direction:column;gap:6px}
    .dash-rank-row{display:flex;align-items:center;gap:8px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05)}
    .dash-rank-num{font-size:10px;font-weight:900;color:#4b5563;width:16px;flex-shrink:0;text-align:center}
    .dash-rank-name{flex:1;font-size:12px;font-weight:800;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dash-rank-bar-wrap{width:70px;height:5px;background:rgba(255,255,255,.07);border-radius:3px;flex-shrink:0}
    .dash-rank-bar{height:100%;border-radius:3px;background:linear-gradient(90deg,#4ade80,#22d3ee)}
    .dash-rank-value{font-size:11px;font-weight:900;color:#4ade80;min-width:68px;text-align:right;flex-shrink:0}
    .dash-upcoming-list{display:flex;flex-direction:column;gap:6px}
    .dash-upcoming-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:12px;background:rgba(255,255,255,.02);border:1px solid rgba(255,255,255,.05)}
    .dash-upcoming-date{font-size:11px;font-weight:900;color:#fde68a;flex-shrink:0;min-width:46px}
    .dash-upcoming-name{flex:1;font-size:12px;font-weight:800;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .dash-upcoming-city{font-size:10px;color:var(--muted);flex-shrink:0}
    @media(max-width:900px){.adm-hosp-form{grid-template-columns:1fr}.adm-room-add,.adm-room-row{grid-template-columns:1fr}.adm-extra-row{grid-template-columns:1fr 1fr auto}.adm-hosp-search{min-width:0;width:100%}.adm-hosp-action-grid{grid-template-columns:1fr}.dash-main-grid,.dash-bottom-grid{grid-template-columns:1fr}.dash-kpi-grid{grid-template-columns:repeat(2,1fr)}}
  `;
  document.head.appendChild(style);
}

initProtectedPage('Módulo Hospedagem', (content, userContext) => {
  injectStyles();
  const state = {
    rows: [], resumo: {}, hoteis: [], alojamentos: [],
    editingHotel: null, editingAlojamento: null,
    tab: 'dashboard', selected: null,
    reservarColabs: [], estenderColabs: [],
    dashPeriod: 30
  };
  function getHotelById(id) { return state.hoteis.find((h) => String(h.id) === String(id)); }

  const HOTEIS_HTML = `
    <section id="tab-hoteis" class="adm-hosp-panel">
      <article class="card">
        <div class="adm-hosp-toolbar"><div><h3>Cadastro de hotéis</h3><p class="muted">Base usada pela equipe de hospedagem e pelo futuro mapa de custos.</p></div><input id="hotelSearch" class="adm-hosp-search" placeholder="Buscar hotel, cidade, CNPJ..." /></div>
        <form id="hotelForm" class="adm-hosp-form">
          <div class="adm-hosp-field"><label>Nome do hotel *</label><input id="hotelNome" required /></div>
          <div class="adm-hosp-field"><label>Cidade *</label><input id="hotelCidade" required /></div>
          <div class="adm-hosp-field"><label>UF *</label><input id="hotelUf" required maxlength="2" /></div>
          <div class="adm-hosp-field"><label>Diária individual</label><input id="hotelDiariaIndividual" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária duplo</label><input id="hotelDiariaDuplo" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária triplo</label><input id="hotelDiariaTriplo" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>Diária quádruplo</label><input id="hotelDiariaQuadruplo" type="number" step="0.01" min="0" /></div>
          <div class="adm-hosp-field"><label>WhatsApp</label><input id="hotelWhatsapp" /></div>
          <div class="adm-hosp-field"><label>CNPJ/CPF</label><input id="hotelCnpj" /></div>
          <div class="adm-hosp-field full"><label>Endereço</label><input id="hotelEndereco" /></div>
          <div class="adm-hosp-field full"><label>Link Google Maps</label><input id="hotelMaps" /></div>
          <div class="adm-hosp-field"><label>Status</label><select id="hotelStatus"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div>
          <div class="adm-hosp-field"><label>Prioridade</label><select id="hotelPrioridade"><option value="NORMAL">Normal</option><option value="PREFERENCIAL">Preferencial</option><option value="EVITAR">Evitar</option></select></div>
          <div class="adm-hosp-field full"><label>Observações</label><textarea id="hotelObs"></textarea></div>
        </form>
        <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="hotelForm" id="hotelSave">Salvar hotel</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="hotelClear">Limpar</button><span id="hotelFeedback" class="adm-hosp-feedback"></span></div>
      </article>
      <article class="card mt-16"><div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Hotel</th><th>Cidade</th><th>Diárias</th><th>Contato</th><th>Status</th><th>Prioridade</th><th>Ações</th></tr></thead><tbody id="hotelTbody"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div></article>
    </section>`;

  const ALOJAMENTOS_HTML = `
    <section id="tab-alojamentos" class="adm-hosp-panel">
      <article class="card">
        <div class="adm-hosp-toolbar">
          <div><h3>Cadastro de alojamentos</h3><p class="muted">Base de casas, apartamentos, pousadas e escritórios para sugerir na programação.</p></div>
          <input id="alojSearch" class="adm-hosp-search" placeholder="Buscar alojamento, cidade, responsável..." />
        </div>
        <form id="alojForm" class="adm-hosp-form">
          <div class="adm-hosp-field"><label>Nome do alojamento *</label><input id="alojNome" required placeholder="Ex.: MT - Confresa" /></div>
          <div class="adm-hosp-field"><label>Tipo</label><select id="alojTipo"><option value="CASA">Casa</option><option value="APARTAMENTO">Apartamento</option><option value="POUSADA">Pousada</option><option value="ESCRITORIO">Escritório</option><option value="OUTRO">Outro</option></select></div>
          <div class="adm-hosp-field"><label>Cidade *</label><input id="alojCidade" required /></div>
          <div class="adm-hosp-field"><label>UF *</label><input id="alojUf" required maxlength="2" /></div>
          <div class="adm-hosp-field full"><label>Endereço</label><input id="alojEndereco" /></div>
          <div class="adm-hosp-field"><label>Capacidade</label><input id="alojCapacidade" type="number" min="0" step="1" /></div>
          <div class="adm-hosp-field"><label>Quartos</label><input id="alojQuartos" type="number" min="0" step="1" /></div>
          <div class="adm-hosp-field"><label>Responsável</label><input id="alojResponsavel" /></div>
          <div class="adm-hosp-field"><label>Contato</label><input id="alojContato" /></div>
          <div class="adm-hosp-field"><label>Status</label><select id="alojStatus"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option><option value="BLOQUEADO">Bloqueado</option></select></div>
          <div class="adm-hosp-field"><label>Prioridade</label><select id="alojPrioridade"><option value="NORMAL">Normal</option><option value="PREFERENCIAL">Preferencial</option><option value="EVITAR">Evitar</option></select></div>
          <div class="adm-hosp-field"><label>Aluguel mensal</label><input id="alojAluguel" type="number" min="0" step="0.01" /></div>
          <div class="adm-hosp-field"><label>Água</label><input id="alojAgua" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Energia</label><input id="alojEnergia" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Internet</label><input id="alojInternet" placeholder="Conta, status ou valor" /></div>
          <div class="adm-hosp-field"><label>Empresa internet</label><input id="alojEmpresaNet" /></div>
          <div class="adm-hosp-field"><label>Vencimento aluguel</label><input id="alojVencAluguel" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento água</label><input id="alojVencAgua" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento energia</label><input id="alojVencEnergia" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field"><label>Vencimento internet</label><input id="alojVencInternet" type="number" min="1" max="31" /></div>
          <div class="adm-hosp-field full"><label>Anexo comprovante/fatura</label><input id="alojAnexo" placeholder="Cole o link do Drive/Supabase Storage" /></div>
          <div class="adm-hosp-field full"><label>Descrição da fatura</label><textarea id="alojDescricaoFatura" placeholder="Ex.: aluguel janeiro/26 lançado; energia solicitada..."></textarea></div>
          <div class="adm-hosp-field full"><label>Observações</label><textarea id="alojObs"></textarea></div>
        </form>
        <div class="adm-hosp-form-actions"><button class="btn btn-primary adm-hosp-btn" type="submit" form="alojForm" id="alojSave">Salvar alojamento</button><button class="btn btn-secondary adm-hosp-btn" type="button" id="alojClear">Limpar</button><span id="alojFeedback" class="adm-hosp-feedback"></span></div>
      </article>
      <article class="card mt-16"><div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Alojamento</th><th>Cidade</th><th>Estrutura</th><th>Despesas</th><th>Fatura</th><th>Status</th><th>Ações</th></tr></thead><tbody id="alojTbody"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div></article>
    </section>`;

  content.innerHTML = `
    <section class="hero-card">
      <div>
        <div class="eyebrow">Operação</div>
        <h2>Hospedagem</h2>
        <p>Gerencie reservas, checkouts, financeiro e hotéis em um fluxo único por etapas.</p>
      </div>
      <div class="hero-badge-wrap"><span class="hero-badge">HOTELARIA</span></div>
    </section>

    <div class="adm-hosp-tabs">
      <button class="adm-hosp-tab active" data-tab="dashboard" type="button">Dashboard</button>
      <button class="adm-hosp-tab" data-tab="solicitadas" type="button">Solicitado <small id="cntSolicitadas">0</small></button>
      <button class="adm-hosp-tab" data-tab="reservados" type="button">Reservado <small id="cntReservados">0</small></button>
      <button class="adm-hosp-tab" data-tab="checkout" type="button">Checkout <small id="cntCheckout">0</small></button>
      <button class="adm-hosp-tab" data-tab="financeiro" type="button">Financeiro <small id="cntFinanceiro">0</small></button>
      <button class="adm-hosp-tab" data-tab="concluidos" type="button">Concluído <small id="cntConcluidos">0</small></button>
      <button class="adm-hosp-tab" data-tab="hoteis" type="button">Hotéis</button>
      <button class="adm-hosp-tab" data-tab="alojamentos" type="button">Alojamentos</button>
    </div>

    <section id="tab-dashboard" class="adm-hosp-panel active">
      <div style="padding:10px 0;color:var(--muted);font-size:13px">Carregando dashboard...</div>
    </section>

    <section id="tab-solicitadas" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head"><div><h3>Aguardando reserva</h3><p class="muted">Solicitações abertas sem reserva definida.</p></div><button class="btn btn-secondary adm-hosp-btn" id="refreshPainel" type="button">Atualizar</button></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data / Código</th><th>Colaboradores</th><th>Gestor</th><th>Cidade / UF</th><th>Período</th><th>Status</th><th>Ações</th></tr></thead><tbody id="tbodySolicitadas"><tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-reservados" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head"><div><h3>Reservas ativas</h3><p class="muted">Hospedagens reservadas aguardando check-in ou em andamento.</p></div><button class="btn btn-secondary adm-hosp-btn" id="refreshReservados" type="button">Atualizar</button></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data / Código</th><th>Colaboradores</th><th>Hotel</th><th>Check-out previsto</th><th>Ações</th></tr></thead><tbody id="tbodyReservados"><tr><td colspan="5" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-checkout" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head"><div><h3>Checkout pendente</h3><p class="muted">Hospedagens com saída prevista ou solicitações de checkout.</p></div><button class="btn btn-secondary adm-hosp-btn" id="refreshCheckout" type="button">Atualizar</button></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data / Código</th><th>Colaboradores</th><th>Hotel</th><th>Status</th><th>Valor previsto</th><th>Ações</th></tr></thead><tbody id="tbodyCheckout"><tr><td colspan="6" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-financeiro" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head"><div><h3>Aguardando pagamento</h3><p class="muted">Cobranças enviadas ao financeiro ainda não pagas.</p></div><button class="btn btn-secondary adm-hosp-btn" id="refreshFinanceiro" type="button">Atualizar</button></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data / Código</th><th>Colaboradores</th><th>Hotel</th><th>Valor</th><th>Status financeiro</th><th>Ações</th></tr></thead><tbody id="tbodyFinanceiro"><tr><td colspan="6" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    <section id="tab-concluidos" class="adm-hosp-panel">
      <article class="card">
        <div class="section-head"><div><h3>Concluídos</h3><p class="muted">Hospedagens pagas e encerradas.</p></div></div>
        <div class="adm-hosp-table-wrap"><table class="adm-hosp-table"><thead><tr><th>Data / Código</th><th>Colaboradores</th><th>Hotel</th><th>Valor</th><th>Conclusão</th></tr></thead><tbody id="tbodyConcluidos"><tr><td colspan="5" class="adm-hosp-empty">Carregando...</td></tr></tbody></table></div>
      </article>
    </section>

    ${HOTEIS_HTML}
    ${ALOJAMENTOS_HTML}

    <!-- Modal: Reservar -->
    <div id="modalReservar" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card">
        <div class="adm-hosp-modal-head">
          <div><h3>Reservar hospedagem</h3><p class="muted" id="reservarSub"></p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalReservarClose">Fechar</button>
        </div>
        <div class="adm-section-block"><div class="adm-section-label">Colaboradores da solicitação — clique em × para excluir da reserva</div><div id="reservarColabList" class="adm-colab-chips"></div></div>
        <div class="adm-hosp-form mt-16">
          <div class="adm-hosp-field"><label>Check-in *</label><input id="resCheckin" type="date" /></div>
          <div class="adm-hosp-field"><label>Check-out *</label><input id="resCheckout" type="date" /></div>
          <div class="adm-hosp-field"><label>Hotel *</label><select id="resHotel"></select><span id="resHotelHint" class="adm-hosp-select-hint"></span></div>
          <div class="adm-hosp-field"><label>Nome manual (se não cadastrado)</label><input id="resHotelNome" placeholder="Ex.: Hotel das Flores" /></div>
          <div class="adm-hosp-field"><label>Confirmado com</label><input id="resConfirmado" /></div>
          <div class="adm-hosp-field"><label>Contato de confirmação</label><input id="resContato" /></div>
        </div>
        <div class="adm-room-wrap">
          <div class="adm-room-title"><div><strong>Composição dos quartos</strong><span>Informe gênero, tipo, quantidade e valor da diária.</span></div><span class="adm-room-chip">Por gênero</span></div>
          <div class="adm-room-add">
            <div class="adm-room-mini"><label>Gênero</label><select id="roomGenero"><option value="MASCULINO">Masculino</option><option value="FEMININO">Feminino</option></select></div>
            <div class="adm-room-mini"><label>Tipo</label><select id="roomTipo"><option value="INDIVIDUAL">Individual</option><option value="DUPLO">Duplo</option><option value="TRIPLO">Triplo</option><option value="QUADRUPLO">Quádruplo</option></select></div>
            <div class="adm-room-mini"><label>Qtd.</label><input id="roomQtd" type="number" min="1" step="1" value="1" /></div>
            <div class="adm-room-mini"><label>Valor/noite</label><input id="roomDiaria" type="number" min="0" step="0.01" value="0" /></div>
            <button class="btn btn-secondary adm-hosp-btn" type="button" id="roomAdd">Adicionar</button>
          </div>
          <div class="adm-room-list" id="roomList"><div class="adm-room-empty">Nenhum quarto adicionado.</div></div>
          <div class="adm-room-summary" id="roomSummary">Informe a composição dos quartos.</div>
        </div>
        <div class="adm-hosp-field full mt-16"><label>Observação</label><textarea id="resObs"></textarea></div>
        <div class="adm-hosp-form-actions mt-16">
          <button class="btn btn-primary" type="button" id="btnConfirmarReserva">RESERVAR</button>
          <span id="reservarFeedback" class="adm-hosp-feedback"></span>
        </div>
      </div>
    </div>

    <!-- Modal: Estender -->
    <div id="modalEstender" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card narrow">
        <div class="adm-hosp-modal-head">
          <div><h3>Estender hospedagem</h3><p class="muted" id="estenderSub"></p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalEstenderClose">Fechar</button>
        </div>
        <div class="adm-section-block"><div class="adm-section-label">Quem permanece no hotel? (desmarque quem fará checkout)</div><div id="estenderColabList" class="adm-colab-check-list"></div></div>
        <div class="adm-hosp-form mt-16">
          <div class="adm-hosp-field full"><label>Nova data de check-out *</label><input id="estenderNovoCheckout" type="date" /></div>
          <div class="adm-hosp-field full"><label>Observação</label><textarea id="estenderObs"></textarea></div>
        </div>
        <div class="adm-hosp-form-actions mt-16">
          <button class="btn btn-primary" type="button" id="btnConfirmarEstender">ESTENDER</button>
          <span id="estenderFeedback" class="adm-hosp-feedback"></span>
        </div>
      </div>
    </div>

    <!-- Modal: Checkout -->
    <div id="modalCheckout" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card medium">
        <div class="adm-hosp-modal-head">
          <div><h3>Checkout</h3><p class="muted" id="checkoutSub"></p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalCheckoutClose">Fechar</button>
        </div>
        <div class="adm-section-block"><div class="adm-section-label">Colaboradores</div><div id="checkoutColabList" class="adm-colab-chips"></div></div>
        <div class="adm-checkout-totals mt-16">
          <div class="adm-checkout-line"><span>Valor total das diárias</span><strong id="checkoutValorDiarias">R$ 0,00</strong></div>
        </div>
        <div class="adm-section-block">
          <div class="adm-section-label" style="display:flex;justify-content:space-between;align-items:center"><span>Extras / Descontos</span><button class="btn btn-secondary adm-hosp-small" type="button" id="btnAddExtra">+ Adicionar</button></div>
          <div id="checkoutExtrasList" class="adm-extra-list"></div>
        </div>
        <div class="adm-checkout-total-box"><span>Total</span><strong id="checkoutTotal">R$ 0,00</strong></div>
        <div class="adm-hosp-field full mt-16"><label>Observação</label><textarea id="checkoutObs"></textarea></div>
        <div class="adm-hosp-form-actions mt-16">
          <button class="btn btn-primary" type="button" id="btnEnviarFinanceiro">ENVIAR AO FINANCEIRO</button>
          <button class="btn btn-secondary" type="button" id="btnAbrirPagar">PAGAR</button>
          <span id="checkoutFeedback" class="adm-hosp-feedback"></span>
        </div>
      </div>
    </div>

    <!-- Modal: Pagar -->
    <div id="modalPagar" class="adm-hosp-modal">
      <div class="adm-hosp-modal-card small">
        <div class="adm-hosp-modal-head">
          <div><h3>Pagamento PIX</h3><p class="muted" id="pagarSub"></p></div>
          <button class="btn btn-secondary adm-hosp-btn" type="button" id="modalPagarClose">Fechar</button>
        </div>
        <div class="adm-hosp-form mt-16">
          <div class="adm-hosp-field"><label>CNPJ/CPF do fornecedor</label><input id="pagarCnpj" placeholder="Ex.: 00.000.000/0001-00" /></div>
          <div class="adm-hosp-field"><label>Nome do fornecedor</label><input id="pagarFornecedor" /></div>
          <div class="adm-hosp-field full"><label>Valor (R$)</label><input id="pagarValor" type="number" step="0.01" min="0" /></div>
        </div>
        <div class="adm-pix-placeholder">QR Code PIX será gerado em breve.</div>
        <div class="adm-hosp-form-actions mt-16">
          <button class="btn btn-primary" type="button" id="btnConfirmarPagamento">PAGAR</button>
          <span id="pagarFeedback" class="adm-hosp-feedback"></span>
        </div>
      </div>
    </div>
  `;

  // ─── Helpers ───────────────────────────────────────────────────────────────

  function setFeedback(id, msg, type = '') { const el = document.getElementById(id); if (!el) return; el.textContent = msg||''; el.className = `adm-hosp-feedback ${type}`.trim(); }
  function statusPill(value) { return `<span class="adm-hosp-status ${esc(slug(value))}">${esc(label(value))}</span>`; }
  function splitColaboradores(value) { return String(value||'').split(/[\n\r,;]+/).map((n) => n.trim()).filter(Boolean); }
  function getRegionalColaborador(colab,fallback='') { return colab?.supervisao||colab?.regional||colab?.supervisao_colaborador||colab?.regional_colaborador||fallback||'-'; }
  function getColaboradoresDetalhados(row) {
    if (Array.isArray(row?._colaboradoresDetalhados)&&row._colaboradoresDetalhados.length) return row._colaboradoresDetalhados;
    return splitColaboradores(row?.colaboradores).map((nome) => ({ nome_colaborador: nome, supervisao: row?.supervisao_colaborador||row?.regional_colaborador||'' }));
  }
  function renderColaboradoresCell(row) {
    const colabs = getColaboradoresDetalhados(row);
    if (!colabs.length) return '-';
    return `<div class="adm-hosp-colab-list">${colabs.map((c) => {
      const nome = c.nome_colaborador||c.nome||'-';
      const reg = getRegionalColaborador(c);
      return `<div class="adm-hosp-colab-item"><span class="adm-hosp-colab-name">${esc(nome)}</span><span class="adm-hosp-colab-regional">${esc(reg)}</span></div>`;
    }).join('')}</div>`;
  }

  // ─── Room composition ──────────────────────────────────────────────────────

  const ROOM_KEYS = [
    {key:'FEMININO_INDIVIDUAL',grupo:'Feminino',tipo:'INDIVIDUAL',label:'Feminino individual'},
    {key:'FEMININO_DUPLO',grupo:'Feminino',tipo:'DUPLO',label:'Feminino duplo'},
    {key:'FEMININO_TRIPLO',grupo:'Feminino',tipo:'TRIPLO',label:'Feminino triplo'},
    {key:'FEMININO_QUADRUPLO',grupo:'Feminino',tipo:'QUADRUPLO',label:'Feminino quádruplo'},
    {key:'MASCULINO_INDIVIDUAL',grupo:'Masculino',tipo:'INDIVIDUAL',label:'Masculino individual'},
    {key:'MASCULINO_DUPLO',grupo:'Masculino',tipo:'DUPLO',label:'Masculino duplo'},
    {key:'MASCULINO_TRIPLO',grupo:'Masculino',tipo:'TRIPLO',label:'Masculino triplo'},
    {key:'MASCULINO_QUADRUPLO',grupo:'Masculino',tipo:'QUADRUPLO',label:'Masculino quádruplo'}
  ];
  function emptyComposicaoQuartos() { return ROOM_KEYS.reduce((acc,item) => { acc[item.key]={qtd:0,diaria:0}; return acc; },{}); }
  function getRoomKey(grupo,tipo) { return `${String(grupo||'').toUpperCase()}_${String(tipo||'').toUpperCase()}`; }
  function getRoomMeta(key) { return ROOM_KEYS.find((item) => item.key===key)||null; }
  function getComposicaoFromForm() {
    const comp = emptyComposicaoQuartos();
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const key = row.dataset.roomKey;
      if (!comp[key]) return;
      comp[key] = { qtd: Math.max(0,Math.floor(Number(row.querySelector('[data-room-qtd]')?.value||0))), diaria: Math.max(0,Number(row.querySelector('[data-room-diaria]')?.value||0)) };
    });
    return comp;
  }
  function renderRoomRow(item,value={}) {
    const qtd=Math.max(0,Math.floor(Number(value.qtd||0)));
    const diaria=Math.max(0,Number(value.diaria||0));
    return `<div class="adm-room-row" data-room-row data-room-key="${esc(item.key)}">
      <div class="adm-room-row-pill">${esc(item.grupo)}</div>
      <div class="adm-room-row-type">${esc(item.tipo.charAt(0)+item.tipo.slice(1).toLowerCase())}</div>
      <input type="number" min="1" step="1" value="${qtd||1}" data-room-qtd aria-label="Qtd" />
      <input type="number" min="0" step="0.01" value="${diaria}" data-room-diaria aria-label="Diária" />
      <div class="adm-room-row-subtotal">${money(qtd*diaria)}</div>
      <button class="adm-room-remove" type="button" data-room-remove title="Remover">×</button>
    </div>`;
  }
  function calcularComposicao(comp=getComposicaoFromForm()) {
    return ROOM_KEYS.reduce((acc,item) => {
      const qtd=Number(comp[item.key]?.qtd||0);
      const diaria=Number(comp[item.key]?.diaria||0);
      acc.quartos+=qtd; acc.totalDia+=qtd*diaria;
      if (qtd>0) acc.itens.push({...item,qtd,diaria,subtotal:qtd*diaria});
      return acc;
    },{quartos:0,totalDia:0,itens:[]});
  }
  function formatComposicaoResumo(comp=getComposicaoFromForm()) {
    const calc=calcularComposicao(comp);
    return calc.itens.map((item) => `${item.qtd} ${item.label} (${money(item.diaria)}/dia)`).join(' + ');
  }
  function extrairComposicaoObservacao(value) {
    const text=String(value||'');
    const match=text.match(/\[COMPOSICAO_QUARTOS\]([\s\S]*?)\[\/COMPOSICAO_QUARTOS\]/);
    if (!match) return {observacao:text,composicao:null};
    try { return {observacao:text.replace(match[0],'').replace(/^Composição dos quartos:.*$/gmi,'').trim(),composicao:{...emptyComposicaoQuartos(),...JSON.parse(match[1])}}; }
    catch(e) { return {observacao:text.replace(match[0],'').trim(),composicao:null}; }
  }
  function montarObservacaoComComposicao(observacao,comp) {
    const resumo=formatComposicaoResumo(comp);
    const blocoComposicao=`[COMPOSICAO_QUARTOS]${JSON.stringify(comp)}[/COMPOSICAO_QUARTOS]`;
    return [String(observacao||'').trim(),resumo?`Composição dos quartos: ${resumo}`:'',blocoComposicao].filter(Boolean).join('\n');
  }
  function atualizarDiariaSugeridaQuarto() {
    const hotel=getHotelById(document.getElementById('resHotel')?.value);
    const tipo=document.getElementById('roomTipo')?.value||'INDIVIDUAL';
    const diariaEl=document.getElementById('roomDiaria');
    if (!hotel||!diariaEl) return;
    const diaria=getHotelDiariaPorTipo(hotel,tipo);
    if (diaria&&!Number(diariaEl.value||0)) diariaEl.value=diaria;
  }
  function aplicarDiariasHotelNaComposicao(hotel,substituir=false) {
    if (!hotel) return;
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const item=getRoomMeta(row.dataset.roomKey);
      const diariaEl=row.querySelector('[data-room-diaria]');
      if (!item||!diariaEl) return;
      const diaria=getHotelDiariaPorTipo(hotel,item.tipo);
      if (diaria&&(substituir||!Number(diariaEl.value||0))) diariaEl.value=diaria;
    });
    const tipoAtual=document.getElementById('roomTipo')?.value||'INDIVIDUAL';
    const diariaDraft=getHotelDiariaPorTipo(hotel,tipoAtual);
    const draftEl=document.getElementById('roomDiaria');
    if (draftEl&&diariaDraft&&(substituir||!Number(draftEl.value||0))) draftEl.value=diariaDraft;
    updateReservaTotals();
  }
  function addRoomFromDraft() {
    const grupo=document.getElementById('roomGenero')?.value||'MASCULINO';
    const tipo=document.getElementById('roomTipo')?.value||'INDIVIDUAL';
    const key=getRoomKey(grupo,tipo);
    const item=getRoomMeta(key);
    if (!item) return;
    const qtd=Math.max(1,Math.floor(Number(document.getElementById('roomQtd')?.value||1)));
    const diaria=Math.max(0,Number(document.getElementById('roomDiaria')?.value||0));
    const list=document.getElementById('roomList');
    if (!list) return;
    list.querySelector('.adm-room-empty')?.remove();
    const existing=list.querySelector(`[data-room-key="${key}"]`);
    if (existing) {
      const qtdEl=existing.querySelector('[data-room-qtd]');
      const diariaEl=existing.querySelector('[data-room-diaria]');
      if (qtdEl) qtdEl.value=Math.max(1,Math.floor(Number(qtdEl.value||0)))+qtd;
      if (diariaEl) diariaEl.value=diaria||Number(diariaEl.value||0);
    } else {
      list.insertAdjacentHTML('beforeend',renderRoomRow(item,{qtd,diaria}));
    }
    document.getElementById('roomQtd').value=1;
    updateReservaTotals();
  }
  function updateReservaTotals() {
    const dias=diffDays(document.getElementById('resCheckin')?.value,document.getElementById('resCheckout')?.value);
    const comp=getComposicaoFromForm();
    const calc=calcularComposicao(comp);
    const total=dias*calc.totalDia;
    document.querySelectorAll('#roomList [data-room-row]').forEach((row) => {
      const qtd=Number(row.querySelector('[data-room-qtd]')?.value||0);
      const diaria=Number(row.querySelector('[data-room-diaria]')?.value||0);
      const sub=row.querySelector('.adm-room-row-subtotal');
      if (sub) sub.textContent=money(qtd*diaria);
    });
    const summary=document.getElementById('roomSummary');
    const resumo=formatComposicaoResumo(comp);
    if (summary) summary.textContent=resumo?`${calc.quartos} quarto(s) · ${money(calc.totalDia)}/dia · Total ${money(total)} · ${resumo}`:'Informe a composição dos quartos.';
  }
  function aplicarDiariaHotelSelecionado() {
    const hotel=getHotelById(document.getElementById('resHotel')?.value);
    if (!hotel) return;
    document.getElementById('resHotelNome').value=hotel.nome||'';
    aplicarDiariasHotelNaComposicao(hotel,true);
  }

  // ─── Dashboard ─────────────────────────────────────────────────────────────

  function renderBrazilMap(stateData,maxVal) {
    // Polígonos simplificados dos 27 estados (coordenada: x=(lon+74)*20, y=(5.5-lat)*22, viewBox 0 0 800 880)
    // Ordenados do maior para o menor para sobreposição correta no SVG
    const STATES=[
      {uf:'AM',name:'Amazonas',pts:'20,66 130,66 178,77 198,88 278,88 328,121 328,165 278,165 198,231 198,319 10,275 10,101'},
      {uf:'PA',name:'Pará',pts:'328,121 480,77 480,121 550,143 550,231 520,231 520,319 500,341 278,341 278,165 328,165'},
      {uf:'MT',name:'Mato Grosso',pts:'148,319 278,275 278,341 460,341 460,429 440,517 318,517 278,451 148,418'},
      {uf:'BA',name:'Bahia',pts:'550,319 730,319 730,374 710,517 600,517 540,451'},
      {uf:'MG',name:'Minas Gerais',pts:'460,407 560,385 680,451 710,517 680,616 600,616 540,605 460,517'},
      {uf:'GO',name:'Goiás',pts:'440,385 560,385 560,517 480,561 440,517'},
      {uf:'MS',name:'M.G.Sul',pts:'318,517 460,506 460,649 378,649 318,561'},
      {uf:'SP',name:'São Paulo',pts:'460,561 600,561 600,649 418,649'},
      {uf:'PR',name:'Paraná',pts:'400,616 520,616 520,704 400,704'},
      {uf:'SC',name:'Sta.Catarina',pts:'400,704 520,704 520,770 400,770'},
      {uf:'RS',name:'R.G.Sul',pts:'400,770 520,770 460,858 420,858'},
      {uf:'MA',name:'Maranhão',pts:'550,143 650,143 650,286 600,341 550,319'},
      {uf:'PI',name:'Piauí',pts:'650,187 710,187 680,341 650,341'},
      {uf:'CE',name:'Ceará',pts:'660,187 784,209 740,297 680,275'},
      {uf:'PE',name:'Pernambuco',pts:'650,286 784,297 784,341 650,341'},
      {uf:'AC',name:'Acre',pts:'10,275 148,275 165,319 145,363 10,363'},
      {uf:'RO',name:'Rondônia',pts:'148,275 278,275 278,418 148,418'},
      {uf:'TO',name:'Tocantins',pts:'520,231 570,231 570,407 520,407'},
      {uf:'RR',name:'Roraima',pts:'190,88 284,88 284,7 215,7 178,35 188,66'},
      {uf:'AP',name:'Amapá',pts:'440,26 480,26 480,121 440,121'},
      {uf:'ES',name:'Esp.Santo',pts:'660,495 712,495 712,583 682,583'},
      {uf:'RJ',name:'Rio de Janeiro',pts:'600,616 660,605 660,638 620,627'},
      {uf:'RN',name:'R.G.Norte',pts:'740,231 784,231 784,275 740,275'},
      {uf:'PB',name:'Paraíba',pts:'720,264 780,264 780,308 720,308'},
      {uf:'AL',name:'Alagoas',pts:'730,319 782,319 782,352 730,352'},
      {uf:'SE',name:'Sergipe',pts:'730,341 760,341 760,374 730,374'},
      {uf:'DF',name:'D.F.',pts:'524,463 542,463 542,484 524,484'},
    ];
    const TINY=new Set(['AP','ES','RJ','DF','AL','SE','RN','PB']);
    function ctr(pts){const p=pts.split(' ').map(s=>s.split(',').map(Number));return{x:Math.round(p.reduce((s,v)=>s+v[0],0)/p.length),y:Math.round(p.reduce((s,v)=>s+v[1],0)/p.length)};}
    const polys=STATES.map(s=>{
      const d=stateData[s.uf]||{count:0,value:0};
      const has=d.count>0;
      const r=maxVal>0&&has?Math.min(1,(d.value||d.count)/maxVal):0;
      const fill=`rgba(74,222,128,${(has?0.13+r*0.75:0.05).toFixed(2)})`;
      const stroke=has?`rgba(74,222,128,${(0.4+r*0.5).toFixed(2)})`:'rgba(111,208,165,0.18)';
      const {x,y}=ctr(s.pts);
      const tip=esc(has?`${s.name}: ${d.count} hospedagem(s) · ${money(d.value)}`:s.name);
      const fs=TINY.has(s.uf)?6:8;
      const txtFill=has?'#ecfdf5':'#4b5563';
      return `<polygon points="${s.pts}" fill="${fill}" stroke="${stroke}" stroke-width="1" stroke-linejoin="round" style="cursor:pointer"><title>${tip}</title></polygon><text x="${x}" y="${y+0.5}" text-anchor="middle" dominant-baseline="central" font-size="${fs}" font-weight="900" fill="${txtFill}" stroke="#0d1b12" stroke-width="2.5" paint-order="stroke fill" style="pointer-events:none;user-select:none">${s.uf}</text>`;
    }).join('');
    const noData=Object.keys(stateData).length===0?`<text x="400" y="440" text-anchor="middle" fill="#4b5563" font-size="13" font-weight="800">Sem dados no período</text>`:'';
    return `<svg viewBox="0 0 800 880" width="100%" style="max-height:290px;display:block">${polys}${noData}</svg>`;
  }

  function renderTabDashboard() {
    const section=document.getElementById('tab-dashboard');
    if (!section) return;
    const today=new Date().toISOString().slice(0,10);
    const todayPlus7=new Date(Date.now()+7*86400000).toISOString().slice(0,10);
    const cutoff=state.dashPeriod?new Date(Date.now()-state.dashPeriod*86400000).toISOString().slice(0,10):'';
    const rows=cutoff?state.rows.filter(r=>(r.data_solicitacao||'')>=cutoff):state.rows;
    // KPIs
    const hospedados=rows.filter(r=>['HOSPEDADO','CHECKIN_PREVISTO','CHECKOUT_HOJE','RENOVACAO_NECESSARIA'].includes(String(r.status_hospedagem||'').toUpperCase())).length;
    const solicitadas=rows.filter(r=>painelBucket(r)==='solicitadas').length;
    const checkinsHoje=rows.filter(r=>{const d=r.data_checkin||r.data_checkin_prevista;return d&&d.slice(0,10)===today;}).length;
    const checkoutsHoje=rows.filter(r=>{const d=r.data_checkout||r.data_checkout_prevista;return d&&d.slice(0,10)===today;}).length;
    const valorTotal=rows.reduce((a,r)=>a+toNumber(r.valor_financeiro||r.valor_total_previsto),0);
    const pendFinanceiro=rows.filter(r=>painelBucket(r)==='financeiro').length;
    // Mapa: agrupar por UF
    const stateData={};
    rows.forEach(r=>{const uf=normalizeUF(r.uf);if(!uf||uf.length!==2)return;if(!stateData[uf])stateData[uf]={count:0,value:0};stateData[uf].count++;stateData[uf].value+=toNumber(r.valor_financeiro||r.valor_total_previsto);});
    const maxStateVal=Math.max(1,...Object.values(stateData).map(d=>d.value||d.count));
    // Gráfico mensal (sempre últimos 12 meses de state.rows completo)
    const now=new Date();
    const months=[];
    for(let i=11;i>=0;i--){const d=new Date(now.getFullYear(),now.getMonth()-i,1);months.push([`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,{count:0,value:0}]);}
    const monthMap=new Map(months);
    state.rows.forEach(r=>{const k=(r.data_solicitacao||r.created_at||'').slice(0,7);if(monthMap.has(k)){const m=monthMap.get(k);m.count++;m.value+=toNumber(r.valor_financeiro||r.valor_total_previsto);}});
    const maxMonth=Math.max(1,...months.map(([,v])=>v.count));
    const currentMonthKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
    const mNames=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
    // Top hotéis
    const hotelMap={};
    rows.forEach(r=>{if(!r.hotel)return;if(!hotelMap[r.hotel])hotelMap[r.hotel]={value:0,count:0};hotelMap[r.hotel].value+=toNumber(r.valor_financeiro||r.valor_total_previsto);hotelMap[r.hotel].count++;});
    const topHoteis=Object.entries(hotelMap).sort((a,b)=>b[1].value-a[1].value).slice(0,5);
    const maxHotelVal=Math.max(1,topHoteis[0]?.[1]?.value||1);
    // Próximos check-ins
    const upcoming=rows.filter(r=>{const d=r.data_checkin||r.data_checkin_prevista;return d&&d.slice(0,10)>=today&&d.slice(0,10)<=todayPlus7&&painelBucket(r)!=='concluidos';}).sort((a,b)=>{const da=a.data_checkin||a.data_checkin_prevista||'';const db=b.data_checkin||b.data_checkin_prevista||'';return da<db?-1:da>db?1:0;}).slice(0,6);
    const kpiCards=[
      {val:hospedados,label:'Hospedados agora',sub:'Ativos ou check-in previsto',color:'#4ade80',glow:'rgba(74,222,128,.07)'},
      {val:solicitadas,label:'Aguardando reserva',sub:'Solicitações abertas',color:'#fde68a',glow:'rgba(253,230,138,.07)'},
      {val:checkinsHoje,label:'Check-ins hoje',sub:brDate(today),color:'#93c5fd',glow:'rgba(147,197,253,.07)'},
      {val:checkoutsHoje,label:'Checkouts hoje',sub:brDate(today),color:'#c4b5fd',glow:'rgba(196,181,253,.07)'},
      {val:money(valorTotal),label:'Valor total',sub:'Período selecionado',color:'#4ade80',glow:'rgba(74,222,128,.07)',small:true},
      {val:pendFinanceiro,label:'Aguardando financeiro',sub:'A processar',color:'#fca5a5',glow:'rgba(252,165,165,.07)'}
    ];
    section.innerHTML=`
      <div class="dash-period-bar">
        <span style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">Período</span>
        ${[7,30,90,0].map(p=>`<button class="dash-period-btn${state.dashPeriod===p?' active':''}" data-dash-period="${p}" type="button">${p?p+'d':'Tudo'}</button>`).join('')}
        <span style="margin-left:auto;font-size:11px;color:var(--muted);font-weight:800">${rows.length} registro(s)</span>
      </div>
      <div class="dash-kpi-grid">
        ${kpiCards.map(k=>`<div class="dash-kpi" style="--kpi-color:${k.color};--kpi-glow:radial-gradient(ellipse at top left,${k.glow},transparent 65%)">
          <div class="dash-kpi-value"${k.small?` style="font-size:${String(k.val).length>10?'16px':'22px'}"`:''}>${k.val}</div>
          <div class="dash-kpi-label">${k.label}</div>
          <div class="dash-kpi-sub">${k.sub}</div>
        </div>`).join('')}
      </div>
      <div class="dash-main-grid">
        <div class="dash-card">
          <div class="dash-card-title">Distribuição por estado — <span style="color:#4ade80">${Object.keys(stateData).length} estado(s)</span></div>
          ${renderBrazilMap(stateData,maxStateVal)}
        </div>
        <div class="dash-card">
          <div class="dash-card-title">Reservas mensais <span style="color:var(--muted);font-weight:700;text-transform:none;letter-spacing:0">(últimos 12 meses)</span></div>
          <div style="display:flex;align-items:flex-end;gap:4px;height:155px">
            ${months.map(([key,v])=>{
              const h=maxMonth>0?Math.max(3,Math.round((v.count/maxMonth)*105)):3;
              const isCur=key===currentMonthKey;
              const mName=mNames[parseInt(key.split('-')[1],10)-1];
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:3px">
                <span style="font-size:8px;font-weight:900;color:${v.count>0?(isCur?'#4ade80':'rgba(111,208,165,.6)'):'transparent'}">${v.count||0}</span>
                <div style="width:80%;height:${h}px;border-radius:3px 3px 0 0;background:${isCur?'#4ade80':'rgba(111,208,165,.25)'}" title="${mName}: ${v.count} reservas · ${money(v.value)}"></div>
                <span style="font-size:7px;color:var(--muted);font-weight:800">${mName}</span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
      <div class="dash-bottom-grid">
        <div class="dash-card">
          <div class="dash-card-title">Próximos check-ins — <span style="color:var(--muted);font-weight:700;text-transform:none;letter-spacing:0">7 dias</span></div>
          ${upcoming.length===0
            ?`<div style="color:var(--muted);font-size:13px;padding:6px 0">Nenhum check-in nos próximos 7 dias.</div>`
            :`<div class="dash-upcoming-list">${upcoming.map(r=>{
              const d=r.data_checkin||r.data_checkin_prevista;
              const colabs=getColaboradoresDetalhados(r);
              const nome=colabs.length?colabs[0].nome_colaborador||'-':(String(r.colaboradores||'-').split('\n')[0]);
              const extra=colabs.length>1?`<span style="color:var(--muted)"> +${colabs.length-1}</span>`:'';
              return `<div class="dash-upcoming-row"><div class="dash-upcoming-date">${brDate(d)}</div><div class="dash-upcoming-name">${esc(nome)}${extra}</div><div class="dash-upcoming-city">${esc([r.cidade,r.uf].filter(Boolean).join('/'))}</div></div>`;
            }).join('')}</div>`}
        </div>
        <div class="dash-card">
          <div class="dash-card-title">Top hotéis por valor</div>
          ${topHoteis.length===0
            ?`<div style="color:var(--muted);font-size:13px;padding:6px 0">Sem dados de hotéis no período.</div>`
            :`<div class="dash-rank-list">${topHoteis.map(([name,d],i)=>`
              <div class="dash-rank-row">
                <div class="dash-rank-num">${i+1}</div>
                <div class="dash-rank-name" title="${esc(name)}">${esc(name)}</div>
                <div class="dash-rank-bar-wrap"><div class="dash-rank-bar" style="width:${Math.round(d.value/maxHotelVal*100)}%"></div></div>
                <div class="dash-rank-value">${money(d.value)}</div>
              </div>`).join('')}</div>`}
        </div>
      </div>`;
    section.querySelectorAll('[data-dash-period]').forEach(btn=>{
      btn.addEventListener('click',()=>{state.dashPeriod=Number(btn.dataset.dashPeriod);renderTabDashboard();});
    });
  }

  // ─── Data loading ──────────────────────────────────────────────────────────

  async function enrichRowsWithColaboradores(rows) {
    const ids=[...new Set((rows||[]).map((r) => r.solicitacao_id).filter(Boolean))];
    if (!ids.length) return rows||[];
    const {data,error}=await supabase.from('hospedagem_solicitacao_colaboradores').select('solicitacao_id,nome_colaborador,supervisao,regional,coordenacao,empresa,tipo_colaborador').in('solicitacao_id',ids);
    if (error||!Array.isArray(data)) return rows||[];
    const porSolicitacao=new Map();
    data.forEach((c) => { const key=String(c.solicitacao_id||''); if (!porSolicitacao.has(key)) porSolicitacao.set(key,[]); porSolicitacao.get(key).push(c); });
    return (rows||[]).map((row) => ({...row,_colaboradoresDetalhados:porSolicitacao.get(String(row.solicitacao_id||''))||[]}));
  }

  async function loadRows() {
    const {data,error}=await supabase.from('hospedagem_painel_geral').select('*').order('data_solicitacao',{ascending:false});
    if (error) { ['tbodySolicitadas','tbodyReservados','tbodyCheckout','tbodyFinanceiro','tbodyConcluidos'].forEach((id) => { const el=document.getElementById(id); if (el) el.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">${esc(error.message)}</td></tr>`; }); return; }
    state.rows=await enrichRowsWithColaboradores(data||[]);
    updateTabCounts();
    renderCurrentTab();
  }

  function painelBucket(r) {
    const fin=String(r.status_financeiro||'NAO_INICIADO').toUpperCase();
    const nf=String(r.status_nota||'NAO_SOLICITADA').toUpperCase();
    const hosp=String(r.status_hospedagem||'').toUpperCase();
    const sol=String(r.status_solicitacao||'').toUpperCase();
    if (fin==='PAGO'||nf==='LANCADO'||sol==='CONCLUIDA') return 'concluidos';
    if (['AGUARDANDO_PAGAMENTO','ENVIADO_AO_FINANCEIRO'].includes(fin)||r.pendencia_financeira||r.pendencia_nf) return 'financeiro';
    if (r.checkout_hoje||r.checkout_vencido||['CHECKOUT_HOJE','RENOVACAO_NECESSARIA','CHECKOUT_REALIZADO'].includes(hosp)) return 'checkout';
    if (sol==='RESERVADA'||['CHECKIN_PREVISTO','HOSPEDADO'].includes(hosp)) return 'reservados';
    if (['SOLICITADA','EM_ANALISE','EM_COTACAO'].includes(sol)) return 'solicitadas';
    return 'financeiro';
  }

  function updateTabCounts() {
    const counts={solicitadas:0,reservados:0,checkout:0,financeiro:0,concluidos:0};
    (state.rows||[]).forEach((r) => { const b=painelBucket(r); counts[b]=(counts[b]||0)+1; });
    Object.entries({cntSolicitadas:counts.solicitadas,cntReservados:counts.reservados,cntCheckout:counts.checkout,cntFinanceiro:counts.financeiro,cntConcluidos:counts.concluidos}).forEach(([id,v]) => { const el=document.getElementById(id); if (el) el.textContent=v; });
  }

  function renderCurrentTab() {
    if (['hoteis','alojamentos'].includes(state.tab)) return;
    const fns={dashboard:renderTabDashboard,solicitadas:renderTabSolicitadas,reservados:renderTabReservados,checkout:renderTabCheckout,financeiro:renderTabFinanceiro,concluidos:renderTabConcluidos};
    (fns[state.tab]||renderTabDashboard)();
  }

  function renderTabSolicitadas() {
    const tbody=document.getElementById('tbodySolicitadas');
    if (!tbody) return;
    const rows=state.rows.filter((r) => painelBucket(r)==='solicitadas');
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">Nenhuma solicitação aguardando reserva.</td></tr>`; return; }
    tbody.innerHTML=rows.map((r) => `<tr>
      <td><strong>${esc(r.codigo||'-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
      <td>${renderColaboradoresCell(r)}</td>
      <td>${esc(r.solicitante_nome||'-')}</td>
      <td>${esc([r.cidade,r.uf].filter(Boolean).join('/'))}<span class="adm-hosp-row-note">${esc(r.cliente||'')}</span></td>
      <td>${brDate(r.data_checkin_prevista)} até ${brDate(r.data_checkout_prevista)}<span class="adm-hosp-row-note">${esc(r.quantidade_diarias_prevista||'-')} dia(s)</span></td>
      <td>${statusPill(r.status_solicitacao)}</td>
      <td><div class="adm-hosp-actions"><button class="btn btn-primary adm-hosp-small" data-action="reservar" data-id="${esc(r.solicitacao_id)}" type="button">Reservar</button><button class="btn adm-hosp-small adm-hosp-danger" data-action="recusar" data-id="${esc(r.solicitacao_id)}" type="button">Recusar</button></div></td>
    </tr>`).join('');
  }

  function renderTabReservados() {
    const tbody=document.getElementById('tbodyReservados');
    if (!tbody) return;
    const rows=state.rows.filter((r) => painelBucket(r)==='reservados');
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="5" class="adm-hosp-empty">Nenhuma reserva ativa.</td></tr>`; return; }
    tbody.innerHTML=rows.map((r) => `<tr>
      <td><strong>${esc(r.codigo||'-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
      <td>${renderColaboradoresCell(r)}</td>
      <td>${esc(r.hotel||'-')}<span class="adm-hosp-row-note">${esc([r.cidade,r.uf].filter(Boolean).join('/'))}</span></td>
      <td>${brDate(r.data_checkout||r.data_checkout_prevista)}<span class="adm-hosp-row-note">Check-in: ${brDate(r.data_checkin||r.data_checkin_prevista)}</span></td>
      <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="estender" data-id="${esc(r.solicitacao_id)}" type="button">Estender</button><button class="btn btn-primary adm-hosp-small" data-action="checkout" data-id="${esc(r.solicitacao_id)}" type="button">Checkout</button></div></td>
    </tr>`).join('');
  }

  function renderTabCheckout() {
    const tbody=document.getElementById('tbodyCheckout');
    if (!tbody) return;
    const rows=state.rows.filter((r) => painelBucket(r)==='checkout');
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="6" class="adm-hosp-empty">Nenhum checkout pendente.</td></tr>`; return; }
    tbody.innerHTML=rows.map((r) => `<tr>
      <td><strong>${esc(r.codigo||'-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
      <td>${renderColaboradoresCell(r)}</td>
      <td>${esc(r.hotel||'-')}</td>
      <td>${statusPill(r.status_hospedagem||r.status_solicitacao)}</td>
      <td>${r.valor_total_previsto?money(r.valor_total_previsto):'-'}</td>
      <td><button class="btn btn-primary adm-hosp-small" data-action="checkout" data-id="${esc(r.solicitacao_id)}" type="button">Checkout</button></td>
    </tr>`).join('');
  }

  function renderTabFinanceiro() {
    const tbody=document.getElementById('tbodyFinanceiro');
    if (!tbody) return;
    const rows=state.rows.filter((r) => painelBucket(r)==='financeiro');
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="6" class="adm-hosp-empty">Nenhuma pendência financeira.</td></tr>`; return; }
    tbody.innerHTML=rows.map((r) => `<tr>
      <td><strong>${esc(r.codigo||'-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
      <td>${renderColaboradoresCell(r)}</td>
      <td>${esc(r.hotel||'-')}</td>
      <td>${(r.valor_financeiro||r.valor_total_previsto)?money(r.valor_financeiro||r.valor_total_previsto):'-'}</td>
      <td>${statusPill(r.status_financeiro||'NAO_INICIADO')}</td>
      <td><button class="btn btn-secondary adm-hosp-small" data-action="checkout" data-id="${esc(r.solicitacao_id)}" type="button">Detalhes</button></td>
    </tr>`).join('');
  }

  function renderTabConcluidos() {
    const tbody=document.getElementById('tbodyConcluidos');
    if (!tbody) return;
    const rows=state.rows.filter((r) => painelBucket(r)==='concluidos');
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="5" class="adm-hosp-empty">Nenhuma hospedagem concluída.</td></tr>`; return; }
    tbody.innerHTML=rows.map((r) => `<tr>
      <td><strong>${esc(r.codigo||'-')}</strong><span class="adm-hosp-row-note">${brDate(r.data_solicitacao)}</span></td>
      <td>${renderColaboradoresCell(r)}</td>
      <td>${esc(r.hotel||'-')}</td>
      <td>${(r.valor_financeiro||r.valor_total_previsto)?money(r.valor_financeiro||r.valor_total_previsto):'-'}</td>
      <td>${brDate(r.data_pagamento||r.data_checkout||r.data_checkout_prevista)}</td>
    </tr>`).join('');
  }

  // ─── Tab navigation ────────────────────────────────────────────────────────

  function setTab(tab) {
    const valid=['dashboard','solicitadas','reservados','checkout','financeiro','concluidos','hoteis','alojamentos'];
    const t=valid.includes(tab)?tab:'dashboard';
    state.tab=t;
    document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.classList.toggle('active',b.dataset.tab===t));
    document.querySelectorAll('.adm-hosp-panel').forEach((p) => p.classList.remove('active'));
    document.getElementById(`tab-${t}`)?.classList.add('active');
    if (t==='hoteis') return loadHoteis();
    if (t==='alojamentos') return loadAlojamentos();
    loadRows();
  }

  // ─── Hotels ────────────────────────────────────────────────────────────────

  async function loadHoteis() {
    const {data,error}=await supabase.from('hospedagem_hoteis').select('*').order('cidade',{ascending:true}).order('nome',{ascending:true});
    if (error) { document.getElementById('hotelTbody').innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">${esc(error.message)}</td></tr>`; return; }
    state.hoteis=data||[];
    fillHotelSelect(state.selected);
    renderHoteis();
  }

  function getHoteisRecomendados(row) {
    const cidadeSolicitada=normalizeText(row?.cidade);
    const ufSolicitada=normalizeUF(row?.uf);
    if (!cidadeSolicitada&&!ufSolicitada) return state.hoteis.filter((h) => String(h.status||'ATIVO').toUpperCase()==='ATIVO');
    return state.hoteis.filter((h) => {
      const mesmaCidade=cidadeSolicitada?normalizeText(h.cidade)===cidadeSolicitada:true;
      const mesmaUf=ufSolicitada?normalizeUF(h.uf)===ufSolicitada:true;
      return mesmaCidade&&mesmaUf&&String(h.status||'ATIVO').toUpperCase()!=='INATIVO'&&String(h.status||'').toUpperCase()!=='BLOQUEADO';
    }).sort((a,b) => {const p={PREFERENCIAL:0,NORMAL:1,EVITAR:2}; return (p[String(a.prioridade||'NORMAL').toUpperCase()]??1)-(p[String(b.prioridade||'NORMAL').toUpperCase()]??1)||String(a.nome||'').localeCompare(String(b.nome||''),'pt-BR');});
  }

  function fillHotelSelect(row) {
    const select=document.getElementById('resHotel');
    if (!select) return;
    const hint=document.getElementById('resHotelHint');
    const rows=getHoteisRecomendados(row);
    const cidadeUf=[row?.cidade,row?.uf].filter(Boolean).join('/');
    select.innerHTML=`<option value="">Selecionar hotel</option>`+rows.map((h) => {
      const ind=getHotelDiariaPorTipo(h,'INDIVIDUAL');
      const dup=getHotelDiariaPorTipo(h,'DUPLO');
      const rates=[ind?`Ind. ${money(ind)}`:'',dup?`Dup. ${money(dup)}`:''].filter(Boolean).join(' · ');
      return `<option value="${esc(h.id)}" data-nome="${esc(h.nome)}" data-cidade="${esc(h.cidade||'')}" data-uf="${esc(h.uf||'')}">${esc(h.nome)} · ${esc(h.cidade||'-')}/${esc(h.uf||'')}${rates?` · ${rates}`:''}</option>`;
    }).join('');
    if (hint) {
      if (rows.length) { hint.textContent=`${rows.length} hotel(is) encontrado(s) para ${cidadeUf||'a cidade solicitada'}.`; hint.className='adm-hosp-select-hint'; }
      else { hint.textContent=`Nenhum hotel ativo cadastrado para ${cidadeUf||'a cidade'}. Use o campo manual.`; hint.className='adm-hosp-select-hint warn'; }
    }
  }

  function renderHoteis() {
    const tbody=document.getElementById('hotelTbody');
    const search=String(document.getElementById('hotelSearch')?.value||'').toLowerCase().trim();
    let rows=state.hoteis;
    if (search) rows=rows.filter((h) => [h.nome,h.cidade,h.uf,h.cnpj_cpf,h.whatsapp].join(' ').toLowerCase().includes(search));
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">Nenhum hotel encontrado.</td></tr>`; return; }
    tbody.innerHTML=rows.map((h) => `<tr>
      <td><strong>${esc(h.nome)}</strong><span class="adm-hosp-row-note">${esc(h.endereco||'')}</span></td>
      <td>${esc([h.cidade,h.uf].filter(Boolean).join('/'))}</td>
      <td><strong>Ind:</strong> ${h.valor_diaria_individual?money(h.valor_diaria_individual):'-'}<br><strong>Dup:</strong> ${h.valor_diaria_duplo?money(h.valor_diaria_duplo):'-'}<br><strong>Tri:</strong> ${h.valor_diaria_triplo?money(h.valor_diaria_triplo):'-'}<br><strong>Quad:</strong> ${h.valor_diaria_quadruplo?money(h.valor_diaria_quadruplo):'-'}</td>
      <td>${esc(h.whatsapp||h.telefone||'-')}<span class="adm-hosp-row-note">${esc(h.cnpj_cpf||'')}</span></td>
      <td>${statusPill(h.status||'ATIVO')}</td>
      <td>${statusPill(h.prioridade||'NORMAL')}</td>
      <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="edit-hotel" data-id="${esc(h.id)}" type="button">Editar</button><button class="btn btn-secondary adm-hosp-small adm-hosp-danger" data-action="delete-hotel" data-id="${esc(h.id)}" type="button">Excluir</button></div></td>
    </tr>`).join('');
  }

  function resetHotelForm() {
    state.editingHotel=null;
    document.getElementById('hotelForm')?.reset();
    document.getElementById('hotelStatus').value='ATIVO';
    document.getElementById('hotelPrioridade').value='NORMAL';
    document.getElementById('hotelSave').textContent='Salvar hotel';
    setFeedback('hotelFeedback','');
  }
  function fillHotelForm(h) {
    state.editingHotel=h.id;
    document.getElementById('hotelNome').value=h.nome||'';
    document.getElementById('hotelCidade').value=h.cidade||'';
    document.getElementById('hotelUf').value=h.uf||'';
    document.getElementById('hotelDiariaIndividual').value=h.valor_diaria_individual||h.valor_diaria_padrao||'';
    document.getElementById('hotelDiariaDuplo').value=h.valor_diaria_duplo||'';
    document.getElementById('hotelDiariaTriplo').value=h.valor_diaria_triplo||'';
    document.getElementById('hotelDiariaQuadruplo').value=h.valor_diaria_quadruplo||'';
    document.getElementById('hotelWhatsapp').value=h.whatsapp||'';
    document.getElementById('hotelCnpj').value=h.cnpj_cpf||'';
    document.getElementById('hotelEndereco').value=h.endereco||'';
    document.getElementById('hotelMaps').value=h.link_maps||'';
    document.getElementById('hotelStatus').value=h.status||'ATIVO';
    document.getElementById('hotelPrioridade').value=h.prioridade||'NORMAL';
    document.getElementById('hotelObs').value=h.observacoes||'';
    document.getElementById('hotelSave').textContent='Salvar alterações';
    window.scrollTo({top:0,behavior:'smooth'});
  }
  async function saveHotel(ev) {
    ev.preventDefault();
    setFeedback('hotelFeedback','Salvando...');
    const payload={
      nome:document.getElementById('hotelNome').value.trim(),cidade:document.getElementById('hotelCidade').value.trim(),uf:document.getElementById('hotelUf').value.trim().toUpperCase(),
      valor_diaria_padrao:document.getElementById('hotelDiariaIndividual').value?Number(document.getElementById('hotelDiariaIndividual').value):null,
      valor_diaria_individual:document.getElementById('hotelDiariaIndividual').value?Number(document.getElementById('hotelDiariaIndividual').value):null,
      valor_diaria_duplo:document.getElementById('hotelDiariaDuplo').value?Number(document.getElementById('hotelDiariaDuplo').value):null,
      valor_diaria_triplo:document.getElementById('hotelDiariaTriplo').value?Number(document.getElementById('hotelDiariaTriplo').value):null,
      valor_diaria_quadruplo:document.getElementById('hotelDiariaQuadruplo').value?Number(document.getElementById('hotelDiariaQuadruplo').value):null,
      whatsapp:document.getElementById('hotelWhatsapp').value.trim()||null,cnpj_cpf:document.getElementById('hotelCnpj').value.trim()||null,
      endereco:document.getElementById('hotelEndereco').value.trim()||null,link_maps:document.getElementById('hotelMaps').value.trim()||null,
      status:document.getElementById('hotelStatus').value,prioridade:document.getElementById('hotelPrioridade').value,
      observacoes:document.getElementById('hotelObs').value.trim()||null,atualizado_por:userContext?.user?.id||null
    };
    const result=state.editingHotel?await supabase.from('hospedagem_hoteis').update(payload).eq('id',state.editingHotel):await supabase.from('hospedagem_hoteis').insert({...payload,criado_por:userContext?.user?.id||null});
    if (result.error) { setFeedback('hotelFeedback',result.error.message,'err'); return; }
    resetHotelForm(); setFeedback('hotelFeedback','Hotel salvo com sucesso.','ok'); await loadHoteis();
  }
  async function deleteHotel(id) {
    const hotel=getHotelById(id);
    if (!hotel) return;
    if (!window.confirm(`Excluir o hotel ${hotel.nome}?`)) return;
    setFeedback('hotelFeedback','Excluindo...');
    const result=await supabase.from('hospedagem_hoteis').delete().eq('id',id);
    if (result.error) {
      const msg=String(result.error.message||'').toLowerCase();
      if (msg.includes('foreign key')||msg.includes('violates')||msg.includes('referenced')) {
        const inactive=await supabase.from('hospedagem_hoteis').update({status:'INATIVO',atualizado_por:userContext?.user?.id||null}).eq('id',id);
        if (inactive.error) { setFeedback('hotelFeedback',inactive.error.message,'err'); return; }
        setFeedback('hotelFeedback','Hotel com vínculo marcado como INATIVO.','ok');
        if (state.editingHotel===id) resetHotelForm();
        await loadHoteis(); return;
      }
      setFeedback('hotelFeedback',result.error.message,'err'); return;
    }
    setFeedback('hotelFeedback','Hotel excluído.','ok');
    if (state.editingHotel===id) resetHotelForm();
    await loadHoteis();
  }

  // ─── Alojamentos ───────────────────────────────────────────────────────────

  async function loadAlojamentos() {
    const tbody=document.getElementById('alojTbody');
    if (tbody) tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">Carregando...</td></tr>`;
    const {data,error}=await supabase.from('hospedagem_alojamentos').select('*').order('cidade',{ascending:true}).order('nome',{ascending:true});
    if (error) { if (tbody) tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">${esc(error.message)}</td></tr>`; return; }
    state.alojamentos=data||[];
    renderAlojamentos();
  }
  function renderAlojamentos() {
    const tbody=document.getElementById('alojTbody');
    if (!tbody) return;
    const search=normalizeText(document.getElementById('alojSearch')?.value||'');
    let rows=state.alojamentos||[];
    if (search) rows=rows.filter((a) => normalizeText([a.nome,a.cidade,a.uf,a.responsavel,a.contato,a.empresa_internet,a.descricao_fatura].join(' ')).includes(search));
    if (!rows.length) { tbody.innerHTML=`<tr><td colspan="7" class="adm-hosp-empty">Nenhum alojamento encontrado.</td></tr>`; return; }
    tbody.innerHTML=rows.map((a) => {
      const despesas=[a.valor_aluguel?`Aluguel: ${money(a.valor_aluguel)}`:'',a.agua?`Água: ${esc(a.agua)}`:'',a.energia?`Energia: ${esc(a.energia)}`:'',a.internet?`Internet: ${esc(a.internet)}`:'',a.empresa_internet?`Empresa: ${esc(a.empresa_internet)}`:''].filter(Boolean).join('<br>')||'-';
      const vencs=[a.vencimento_aluguel?`Aluguel dia ${esc(a.vencimento_aluguel)}`:'',a.vencimento_agua?`Água dia ${esc(a.vencimento_agua)}`:'',a.vencimento_energia?`Energia dia ${esc(a.vencimento_energia)}`:'',a.vencimento_internet?`Internet dia ${esc(a.vencimento_internet)}`:''].filter(Boolean).join(' · ');
      return `<tr>
        <td><strong>${esc(a.nome)}</strong><span class="adm-hosp-row-note">${esc(a.endereco||'')}</span></td>
        <td>${esc([a.cidade,a.uf].filter(Boolean).join('/'))}</td>
        <td>${statusPill(a.tipo||'CASA')}<span class="adm-hosp-row-note">Cap.: ${esc(a.capacidade||'-')} · Quartos: ${esc(a.quartos||'-')}</span><span class="adm-hosp-row-note">${esc(a.responsavel||'')}${a.contato?` · ${esc(a.contato)}`:''}</span></td>
        <td>${despesas}<span class="adm-hosp-row-note">${esc(vencs)}</span></td>
        <td>${a.anexo_url?`<a href="${esc(a.anexo_url)}" target="_blank" rel="noopener">Abrir anexo</a>`:'-'}<span class="adm-hosp-row-note">${esc(a.descricao_fatura||'')}</span></td>
        <td>${statusPill(a.status||'ATIVO')}<br>${statusPill(a.prioridade||'NORMAL')}</td>
        <td><div class="adm-hosp-actions"><button class="btn btn-secondary adm-hosp-small" data-action="edit-alojamento" data-id="${esc(a.id)}" type="button">Editar</button><button class="btn btn-secondary adm-hosp-small adm-hosp-danger" data-action="delete-alojamento" data-id="${esc(a.id)}" type="button">Excluir</button></div></td>
      </tr>`;
    }).join('');
  }
  function resetAlojamentoForm() {
    state.editingAlojamento=null;
    document.getElementById('alojForm')?.reset();
    if (document.getElementById('alojStatus')) document.getElementById('alojStatus').value='ATIVO';
    if (document.getElementById('alojPrioridade')) document.getElementById('alojPrioridade').value='NORMAL';
    if (document.getElementById('alojSave')) document.getElementById('alojSave').textContent='Salvar alojamento';
    setFeedback('alojFeedback','');
  }
  function fillAlojamentoForm(a) {
    state.editingAlojamento=a.id;
    ['alojNome','alojTipo','alojCidade','alojUf','alojEndereco','alojCapacidade','alojQuartos','alojResponsavel','alojContato','alojStatus','alojPrioridade','alojAluguel','alojAgua','alojEnergia','alojInternet','alojEmpresaNet','alojVencAluguel','alojVencAgua','alojVencEnergia','alojVencInternet','alojAnexo','alojDescricaoFatura','alojObs'].forEach((id) => {
      const el=document.getElementById(id); if (!el) return;
      const field=id.replace('aloj','').charAt(0).toLowerCase()+id.replace('aloj','').slice(1);
      const keyMap={Nome:'nome',Tipo:'tipo',Cidade:'cidade',Uf:'uf',Endereco:'endereco',Capacidade:'capacidade',Quartos:'quartos',Responsavel:'responsavel',Contato:'contato',Status:'status',Prioridade:'prioridade',Aluguel:'valor_aluguel',Agua:'agua',Energia:'energia',Internet:'internet',EmpresaNet:'empresa_internet',VencAluguel:'vencimento_aluguel',VencAgua:'vencimento_agua',VencEnergia:'vencimento_energia',VencInternet:'vencimento_internet',Anexo:'anexo_url',DescricaoFatura:'descricao_fatura',Obs:'observacoes'};
      const rawKey=id.replace('aloj','');
      const dbKey=keyMap[rawKey];
      if (dbKey!==undefined) el.value=a[dbKey]||'';
    });
    document.getElementById('alojSave').textContent='Salvar alterações';
    document.getElementById('alojNome').scrollIntoView({behavior:'smooth',block:'center'});
  }
  async function saveAlojamento(ev) {
    ev.preventDefault();
    setFeedback('alojFeedback','Salvando...');
    const g=(id) => document.getElementById(id);
    const payload={
      nome:g('alojNome').value.trim(),tipo:g('alojTipo').value||'CASA',cidade:g('alojCidade').value.trim(),uf:normalizeUF(g('alojUf').value),
      endereco:g('alojEndereco').value.trim()||null,capacidade:g('alojCapacidade').value?Number(g('alojCapacidade').value):null,quartos:g('alojQuartos').value?Number(g('alojQuartos').value):null,
      responsavel:g('alojResponsavel').value.trim()||null,contato:g('alojContato').value.trim()||null,status:g('alojStatus').value,prioridade:g('alojPrioridade').value,
      valor_aluguel:g('alojAluguel').value?Number(g('alojAluguel').value):null,agua:g('alojAgua').value.trim()||null,energia:g('alojEnergia').value.trim()||null,
      internet:g('alojInternet').value.trim()||null,empresa_internet:g('alojEmpresaNet').value.trim()||null,
      vencimento_aluguel:g('alojVencAluguel').value?Number(g('alojVencAluguel').value):null,vencimento_agua:g('alojVencAgua').value?Number(g('alojVencAgua').value):null,
      vencimento_energia:g('alojVencEnergia').value?Number(g('alojVencEnergia').value):null,vencimento_internet:g('alojVencInternet').value?Number(g('alojVencInternet').value):null,
      anexo_url:g('alojAnexo').value.trim()||null,descricao_fatura:g('alojDescricaoFatura').value.trim()||null,observacoes:g('alojObs').value.trim()||null,
      atualizado_por:userContext?.user?.id||null
    };
    if (!payload.nome||!payload.cidade||!payload.uf) { setFeedback('alojFeedback','Informe nome, cidade e UF.','err'); return; }
    const result=state.editingAlojamento?await supabase.from('hospedagem_alojamentos').update(payload).eq('id',state.editingAlojamento):await supabase.from('hospedagem_alojamentos').insert({...payload,criado_por:userContext?.user?.id||null});
    if (result.error) { setFeedback('alojFeedback',result.error.message,'err'); return; }
    resetAlojamentoForm(); setFeedback('alojFeedback','Alojamento salvo.','ok'); await loadAlojamentos();
  }
  async function deleteAlojamento(id) {
    const aloj=(state.alojamentos||[]).find((a) => String(a.id)===String(id));
    if (!aloj) return;
    if (!window.confirm(`Excluir o alojamento ${aloj.nome}?`)) return;
    const {error}=await supabase.from('hospedagem_alojamentos').delete().eq('id',id);
    if (error) { setFeedback('alojFeedback',error.message,'err'); return; }
    if (state.editingAlojamento===id) resetAlojamentoForm();
    setFeedback('alojFeedback','Alojamento excluído.','ok'); await loadAlojamentos();
  }

  // ─── Modal: Reservar ───────────────────────────────────────────────────────

  function openModalReservar(row) {
    state.selected=row;
    const colabs=getColaboradoresDetalhados(row);
    state.reservarColabs=colabs.map((c) => ({...c,excluido:false}));
    document.getElementById('reservarSub').textContent=`${colabs.map((c) => c.nome_colaborador||c.nome).join(', ')} · ${[row.cidade,row.uf].filter(Boolean).join('/')}`;
    renderReservarColabs();
    document.getElementById('resCheckin').value=row.data_checkin_prevista||'';
    document.getElementById('resCheckout').value=row.data_checkout_prevista||'';
    document.getElementById('resHotelNome').value='';
    document.getElementById('resConfirmado').value='';
    document.getElementById('resContato').value='';
    document.getElementById('resObs').value=row.observacao_gestor||'';
    const list=document.getElementById('roomList');
    if (list) list.innerHTML='<div class="adm-room-empty">Nenhum quarto adicionado.</div>';
    const summary=document.getElementById('roomSummary');
    if (summary) summary.textContent='Informe a composição dos quartos.';
    fillHotelSelect(row);
    setFeedback('reservarFeedback','');
    document.getElementById('modalReservar').classList.add('open');
  }

  function renderReservarColabs() {
    const container=document.getElementById('reservarColabList');
    if (!container) return;
    container.innerHTML=state.reservarColabs.map((c,i) => {
      const nome=c.nome_colaborador||c.nome||'-';
      const reg=getRegionalColaborador(c);
      if (c.excluido) return `<div class="adm-colab-chip excluido"><span class="cn">${esc(nome)}</span><span class="cr">${esc(reg)}</span><button class="cx" type="button" data-restore-colab="${i}" title="Restaurar">↩</button></div>`;
      return `<div class="adm-colab-chip"><span class="cn">${esc(nome)}</span><span class="cr">${esc(reg)}</span><button class="cx" type="button" data-remove-colab="${i}" title="Excluir da reserva">×</button></div>`;
    }).join('');
  }

  async function saveReservarModal() {
    if (!state.selected) return;
    const hotelSelect=document.getElementById('resHotel');
    const opt=hotelSelect?.selectedOptions[0];
    const hotelId=hotelSelect?.value||null;
    const hotelManual=document.getElementById('resHotelNome')?.value.trim()||'';
    if (!hotelId&&!hotelManual) { setFeedback('reservarFeedback','Selecione ou informe o hotel.','err'); return; }
    const comp=getComposicaoFromForm();
    const calc=calcularComposicao(comp);
    if (!calc.quartos||!calc.totalDia) { setFeedback('reservarFeedback','Informe a composição dos quartos.','err'); return; }
    const checkin=document.getElementById('resCheckin')?.value;
    const checkout=document.getElementById('resCheckout')?.value;
    if (!checkin||!checkout) { setFeedback('reservarFeedback','Informe check-in e check-out.','err'); return; }
    const excluidos=state.reservarColabs.filter((c) => c.excluido).map((c) => c.nome_colaborador||c.nome);
    const obsBase=document.getElementById('resObs')?.value.trim()||'';
    const obs=[obsBase,excluidos.length?`Colaboradores excluídos desta reserva: ${excluidos.join(', ')}`:''].filter(Boolean).join('\n');
    const diariaMedia=calc.totalDia/calc.quartos;
    const diarias=diffDays(checkin,checkout);
    const totalPrevisto=calc.totalDia*diarias;
    const payload={
      solicitacao_id:state.selected.solicitacao_id,hotel_id:hotelId,
      nome_hotel:hotelManual||opt?.dataset?.nome||state.selected.hotel||null,
      cidade_hotel:opt?.dataset?.cidade||state.selected.cidade||null,uf_hotel:opt?.dataset?.uf||state.selected.uf||null,
      valor_diaria:diariaMedia,quantidade_diarias:diarias,quantidade_quartos:calc.quartos,tipo_quarto:'OUTRO',
      valor_total_previsto:totalPrevisto,data_checkin:checkin,data_checkout:checkout,
      confirmado_com:document.getElementById('resConfirmado')?.value.trim()||null,
      contato_confirmacao:document.getElementById('resContato')?.value.trim()||null,
      status_hospedagem:'CHECKIN_PREVISTO',
      observacao_hospedagem:montarObservacaoComComposicao(obs,comp),
      atualizado_por:userContext?.user?.id||null
    };
    setFeedback('reservarFeedback','Salvando reserva...');
    const result=state.selected.reserva_id
      ?await supabase.from('hospedagem_reservas').update(payload).eq('id',state.selected.reserva_id)
      :await supabase.from('hospedagem_reservas').insert({...payload,criado_por:userContext?.user?.id||null}).select('id').single();
    if (result.error) {
      const msg=String(result.error.message||'');
      setFeedback('reservarFeedback',msg.toLowerCase().includes('row-level security')?'Permissão RLS bloqueou. Verifique as políticas do Supabase.':msg,'err');
      return;
    }
    await supabase.from('hospedagem_solicitacoes').update({status_solicitacao:'RESERVADA'}).eq('id',state.selected.solicitacao_id);
    setFeedback('reservarFeedback','Reserva salva com sucesso.','ok');
    await loadRows();
    setTimeout(() => document.getElementById('modalReservar').classList.remove('open'),800);
  }

  // ─── Modal: Estender ───────────────────────────────────────────────────────

  function openModalEstender(row) {
    state.selected=row;
    const colabs=getColaboradoresDetalhados(row);
    state.estenderColabs=colabs.map((c) => ({...c,fica:true}));
    document.getElementById('estenderSub').textContent=`${row.hotel||'-'} · ${[row.cidade,row.uf].filter(Boolean).join('/')}`;
    renderEstenderColabs();
    document.getElementById('estenderNovoCheckout').value=row.data_checkout||row.data_checkout_prevista||'';
    document.getElementById('estenderObs').value='';
    setFeedback('estenderFeedback','');
    document.getElementById('modalEstender').classList.add('open');
  }

  function renderEstenderColabs() {
    const container=document.getElementById('estenderColabList');
    if (!container) return;
    container.innerHTML=state.estenderColabs.map((c,i) => {
      const nome=c.nome_colaborador||c.nome||'-';
      return `<label class="adm-check-colab"><input type="checkbox" checked data-estender-colab="${i}" /><span>${esc(nome)}</span></label>`;
    }).join('');
  }

  async function saveEstenderModal() {
    const novoCheckout=document.getElementById('estenderNovoCheckout')?.value||'';
    if (!novoCheckout) { setFeedback('estenderFeedback','Informe a nova data de check-out.','err'); return; }
    if (!state.selected?.reserva_id) { setFeedback('estenderFeedback','Reserva não encontrada.','err'); return; }
    const ficam=[]; const saem=[];
    (state.estenderColabs||[]).forEach((c,i) => {
      const cb=document.querySelector(`[data-estender-colab="${i}"]`);
      const nome=c.nome_colaborador||c.nome||'-';
      (cb?.checked!==false?ficam:saem).push(nome);
    });
    const obs=document.getElementById('estenderObs')?.value.trim()||'';
    setFeedback('estenderFeedback','Salvando extensão...');
    const {error}=await supabase.from('hospedagem_reservas').update({
      data_checkout:novoCheckout,
      quantidade_diarias:diffDays(state.selected.data_checkin||state.selected.data_checkin_prevista,novoCheckout),
      status_hospedagem:'RENOVACAO_NECESSARIA',
      observacao_hospedagem:appendObservacaoProcesso(state.selected,'Extensão de reserva',[
        `Novo checkout: ${brDate(novoCheckout)}`,
        ficam.length?`Ficam: ${ficam.join(', ')}`:'',
        saem.length?`Checkout parcial: ${saem.join(', ')}`:'',
        obs
      ]),
      atualizado_por:userContext?.user?.id||null
    }).eq('id',state.selected.reserva_id);
    if (error) { setFeedback('estenderFeedback',error.message,'err'); return; }
    setFeedback('estenderFeedback','Extensão salva com sucesso.','ok');
    await loadRows();
    setTimeout(() => document.getElementById('modalEstender').classList.remove('open'),800);
  }

  // ─── Modal: Checkout ───────────────────────────────────────────────────────

  function openModalCheckout(row) {
    state.selected=row;
    const colabs=getColaboradoresDetalhados(row);
    document.getElementById('checkoutSub').textContent=`${row.hotel||'-'} · ${[row.cidade,row.uf].filter(Boolean).join('/')}`;
    document.getElementById('checkoutColabList').innerHTML=colabs.map((c) => {
      const nome=c.nome_colaborador||c.nome||'-';
      return `<div class="adm-colab-chip"><span class="cn">${esc(nome)}</span></div>`;
    }).join('')||'<span class="muted">Nenhum colaborador</span>';
    document.getElementById('checkoutValorDiarias').textContent=money(Number(row.valor_total_previsto||0));
    document.getElementById('checkoutExtrasList').innerHTML='';
    document.getElementById('checkoutObs').value='';
    updateCheckoutTotal();
    setFeedback('checkoutFeedback','');
    document.getElementById('modalCheckout').classList.add('open');
  }

  function addCheckoutExtra() {
    const list=document.getElementById('checkoutExtrasList');
    if (!list) return;
    const row=document.createElement('div');
    row.className='adm-extra-row';
    row.dataset.extraRow='1';
    row.innerHTML=`<input data-extra-desc placeholder="Descrição" /><input data-extra-valor type="number" step="0.01" min="0" placeholder="Valor" /><select data-extra-tipo><option value="adicional">Adicional</option><option value="desconto">Desconto</option></select><button class="btn btn-secondary adm-hosp-small" type="button" data-extra-remove>×</button>`;
    list.appendChild(row);
    row.querySelector('[data-extra-remove]')?.addEventListener('click',() => { row.remove(); updateCheckoutTotal(); });
    row.querySelector('[data-extra-valor]')?.addEventListener('input',updateCheckoutTotal);
    row.querySelector('[data-extra-tipo]')?.addEventListener('change',updateCheckoutTotal);
  }

  function getCheckoutExtrasData() {
    return Array.from(document.querySelectorAll('#checkoutExtrasList [data-extra-row]')).map((row) => ({
      descricao:row.querySelector('[data-extra-desc]')?.value?.trim()||'',
      valor:Number(row.querySelector('[data-extra-valor]')?.value||0),
      tipo:row.querySelector('[data-extra-tipo]')?.value||'adicional'
    })).filter((e) => e.descricao||e.valor);
  }

  function updateCheckoutTotal() {
    const base=Number(state.selected?.valor_total_previsto||0);
    const extras=getCheckoutExtrasData().reduce((s,e) => s+(e.tipo==='desconto'?-e.valor:e.valor),0);
    const total=document.getElementById('checkoutTotal');
    if (total) total.textContent=money(base+extras);
  }

  function calcularTotalCheckout() {
    const base=Number(state.selected?.valor_total_previsto||0);
    return base+getCheckoutExtrasData().reduce((s,e) => s+(e.tipo==='desconto'?-e.valor:e.valor),0);
  }

  async function enviarFinanceiroCheckout() {
    if (!state.selected?.reserva_id) { setFeedback('checkoutFeedback','Reserva não encontrada.','err'); return; }
    const total=calcularTotalCheckout();
    const extras=getCheckoutExtrasData();
    const obs=document.getElementById('checkoutObs')?.value.trim()||'';
    const colabs=getColaboradoresDetalhados(state.selected).map((c) => c.nome_colaborador||c.nome).filter(Boolean).join(', ');
    const destino=[state.selected.cidade,state.selected.uf].filter(Boolean).join('/');
    const checkin=state.selected.data_checkin||state.selected.data_checkin_prevista;
    const checkout=state.selected.data_checkout||state.selected.data_checkout_prevista;
    setFeedback('checkoutFeedback','Enviando ao financeiro...');
    const pagamentoPayload={
      origem_setor:'HOSPEDAGEM',origem_tabela:'hospedagem_reservas',origem_id:state.selected.reserva_id,
      origem_codigo:state.selected.codigo||null,competencia:checkin,
      descricao:`Hospedagem ${destino}${checkin||checkout?` · ${brDate(checkin)} até ${brDate(checkout)}`:''}${colabs?` · ${colabs}`:''}`.trim(),
      favorecido_nome:state.selected.hotel||'Hotel',forma_pagamento:'PIX',valor:total,
      status:'PENDENTE',prioridade:'NORMAL',observacoes:obs||null,
      solicitado_por:userContext?.user?.id||null,solicitado_por_nome:userContext?.user?.name||null,
      atualizado_por:userContext?.user?.id||null,atualizado_por_nome:userContext?.user?.name||null
    };
    const {error}=await supabase.from('financeiro_pagamentos').upsert(pagamentoPayload,{onConflict:'origem_tabela,origem_id'});
    if (error) { setFeedback('checkoutFeedback',`${error.message}. Verifique se o módulo financeiro está configurado.`,'err'); return; }
    const finPayload={reserva_id:state.selected.reserva_id,status_financeiro:'ENVIADO_AO_FINANCEIRO',valor_total:total};
    if (state.selected.financeiro_id) await supabase.from('hospedagem_financeiro').update(finPayload).eq('id',state.selected.financeiro_id);
    else await supabase.from('hospedagem_financeiro').insert(finPayload);
    await supabase.from('hospedagem_reservas').update({
      status_hospedagem:'CHECKOUT_REALIZADO',
      valor_total_previsto:total,
      observacao_hospedagem:appendObservacaoProcesso(state.selected,'Enviado ao financeiro',[money(total),extras.length?extras.map((e) => `${e.tipo==='desconto'?'Desconto':'Extra'}: ${e.descricao} ${money(e.valor)}`).join('; '):'',obs]),
      atualizado_por:userContext?.user?.id||null
    }).eq('id',state.selected.reserva_id);
    setFeedback('checkoutFeedback','Enviado ao financeiro com sucesso.','ok');
    await loadRows();
    setTimeout(() => document.getElementById('modalCheckout').classList.remove('open'),800);
  }

  // ─── Modal: Pagar ──────────────────────────────────────────────────────────

  function openModalPagar() {
    const total=calcularTotalCheckout();
    const hotel=getHotelById(state.selected?.hotel_id);
    document.getElementById('pagarSub').textContent=`${state.selected?.hotel||'-'} · ${money(total)}`;
    document.getElementById('pagarCnpj').value=hotel?.cnpj_cpf||'';
    document.getElementById('pagarFornecedor').value=state.selected?.hotel||'';
    document.getElementById('pagarValor').value=total.toFixed(2);
    setFeedback('pagarFeedback','');
    document.getElementById('modalPagar').classList.add('open');
  }

  async function confirmarPagamento() {
    const fornecedor=document.getElementById('pagarFornecedor')?.value.trim();
    const valor=Number(document.getElementById('pagarValor')?.value||0);
    if (!fornecedor||!valor) { setFeedback('pagarFeedback','Informe o fornecedor e o valor.','err'); return; }
    if (!state.selected?.reserva_id) { setFeedback('pagarFeedback','Reserva não encontrada.','err'); return; }
    setFeedback('pagarFeedback','Registrando pagamento...');
    const finPayload={reserva_id:state.selected.reserva_id,status_financeiro:'PAGO',valor_total:valor,data_pagamento:new Date().toISOString().slice(0,10)};
    if (state.selected.financeiro_id) await supabase.from('hospedagem_financeiro').update(finPayload).eq('id',state.selected.financeiro_id);
    else await supabase.from('hospedagem_financeiro').insert(finPayload);
    await supabase.from('hospedagem_reservas').update({
      status_hospedagem:'CHECKOUT_REALIZADO',valor_total_previsto:valor,
      atualizado_por:userContext?.user?.id||null
    }).eq('id',state.selected.reserva_id);
    setFeedback('pagarFeedback','Pagamento registrado. QR Code PIX será implementado em breve.','ok');
    await loadRows();
    setTimeout(() => { document.getElementById('modalPagar').classList.remove('open'); document.getElementById('modalCheckout').classList.remove('open'); },1200);
  }

  // ─── Recusar solicitação ───────────────────────────────────────────────────

  async function recusarSolicitacao(row) {
    if (!row) return;
    const motivo=window.prompt('Motivo da recusa (obrigatório):');
    if (motivo===null) return;
    const motivoLimpo=String(motivo||'').trim();
    if (!motivoLimpo) { window.alert('Informe o motivo da recusa.'); return; }
    await supabase.from('hospedagem_solicitacoes').update({status_solicitacao:'CANCELADA'}).eq('id',row.solicitacao_id);
    if (row.reserva_id) await supabase.from('hospedagem_reservas').update({status_hospedagem:'CANCELADA',observacao_hospedagem:`Recusada: ${motivoLimpo}`}).eq('id',row.reserva_id);
    await loadRows();
  }

  // ─── Shared process helpers ────────────────────────────────────────────────

  function appendObservacaoProcesso(row,titulo,linhas=[]) {
    const base=String(row?.observacao_hospedagem||'').trim();
    const corpo=linhas.filter(Boolean).join(' | ');
    const registro=`[${new Date().toLocaleString('pt-BR')}] ${titulo}${corpo?`: ${corpo}`:''}`;
    return [base,registro].filter(Boolean).join('\n');
  }

  function initialTabFromHash() {
    const hash=normalizeText(window.location.hash.replace('#',''));
    const root=content.closest('main')||content;
    if (hash.includes('aloj')) { root.classList.add('adm-menu-mode-alojamentos'); return 'alojamentos'; }
    if (hash.includes('hotel')||hash.includes('hoteis')) { root.classList.add('adm-menu-mode-hoteis'); return 'hoteis'; }
    return 'dashboard';
  }

  // ─── Event listeners ───────────────────────────────────────────────────────

  document.querySelectorAll('.adm-hosp-tab').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));
  ['refreshPainel','refreshReservados','refreshCheckout','refreshFinanceiro'].forEach((id) => document.getElementById(id)?.addEventListener('click',loadRows));

  // Hotel/Alojamento management
  document.getElementById('hotelSearch')?.addEventListener('input',renderHoteis);
  document.getElementById('hotelForm')?.addEventListener('submit',saveHotel);
  document.getElementById('hotelClear')?.addEventListener('click',resetHotelForm);
  document.getElementById('alojSearch')?.addEventListener('input',renderAlojamentos);
  document.getElementById('alojForm')?.addEventListener('submit',saveAlojamento);
  document.getElementById('alojClear')?.addEventListener('click',resetAlojamentoForm);

  // Modal: Reservar
  document.getElementById('modalReservarClose')?.addEventListener('click',() => document.getElementById('modalReservar').classList.remove('open'));
  document.getElementById('modalReservar')?.addEventListener('click',(ev) => { if (ev.target.id==='modalReservar') document.getElementById('modalReservar').classList.remove('open'); });
  document.getElementById('btnConfirmarReserva')?.addEventListener('click',saveReservarModal);
  document.getElementById('resHotel')?.addEventListener('change',aplicarDiariaHotelSelecionado);
  ['resCheckin','resCheckout'].forEach((id) => document.getElementById(id)?.addEventListener('input',updateReservaTotals));
  document.getElementById('roomAdd')?.addEventListener('click',addRoomFromDraft);
  document.getElementById('roomList')?.addEventListener('input',updateReservaTotals);
  document.getElementById('roomList')?.addEventListener('click',(ev) => {
    if (!ev.target.closest('[data-room-remove]')) return;
    ev.target.closest('[data-room-row]')?.remove();
    const list=document.getElementById('roomList');
    if (list&&!list.querySelector('[data-room-row]')) list.innerHTML='<div class="adm-room-empty">Nenhum quarto adicionado.</div>';
    updateReservaTotals();
  });
  ['roomGenero','roomTipo'].forEach((id) => document.getElementById(id)?.addEventListener('change',() => {
    const el=document.getElementById('roomDiaria'); if (el) el.value='';
    atualizarDiariaSugeridaQuarto();
  }));
  document.getElementById('reservarColabList')?.addEventListener('click',(ev) => {
    const btnRemove=ev.target.closest('[data-remove-colab]');
    const btnRestore=ev.target.closest('[data-restore-colab]');
    if (btnRemove) { const i=Number(btnRemove.dataset.removeColab); if (state.reservarColabs[i]) { state.reservarColabs[i].excluido=true; renderReservarColabs(); } }
    if (btnRestore) { const i=Number(btnRestore.dataset.restoreColab); if (state.reservarColabs[i]) { state.reservarColabs[i].excluido=false; renderReservarColabs(); } }
  });

  // Modal: Estender
  document.getElementById('modalEstenderClose')?.addEventListener('click',() => document.getElementById('modalEstender').classList.remove('open'));
  document.getElementById('modalEstender')?.addEventListener('click',(ev) => { if (ev.target.id==='modalEstender') document.getElementById('modalEstender').classList.remove('open'); });
  document.getElementById('btnConfirmarEstender')?.addEventListener('click',saveEstenderModal);

  // Modal: Checkout
  document.getElementById('modalCheckoutClose')?.addEventListener('click',() => document.getElementById('modalCheckout').classList.remove('open'));
  document.getElementById('modalCheckout')?.addEventListener('click',(ev) => { if (ev.target.id==='modalCheckout') document.getElementById('modalCheckout').classList.remove('open'); });
  document.getElementById('btnAddExtra')?.addEventListener('click',addCheckoutExtra);
  document.getElementById('btnEnviarFinanceiro')?.addEventListener('click',enviarFinanceiroCheckout);
  document.getElementById('btnAbrirPagar')?.addEventListener('click',() => { openModalPagar(); });

  // Modal: Pagar
  document.getElementById('modalPagarClose')?.addEventListener('click',() => document.getElementById('modalPagar').classList.remove('open'));
  document.getElementById('modalPagar')?.addEventListener('click',(ev) => { if (ev.target.id==='modalPagar') document.getElementById('modalPagar').classList.remove('open'); });
  document.getElementById('btnConfirmarPagamento')?.addEventListener('click',confirmarPagamento);

  // Table delegation
  content.addEventListener('click',(ev) => {
    const btn=ev.target.closest('button[data-action]');
    if (!btn) return;
    const id=btn.dataset.id;
    if (btn.dataset.action==='reservar') { const r=state.rows.find((x) => x.solicitacao_id===id); if (r) openModalReservar(r); }
    else if (btn.dataset.action==='recusar') { const r=state.rows.find((x) => x.solicitacao_id===id); if (r) recusarSolicitacao(r); }
    else if (btn.dataset.action==='estender') { const r=state.rows.find((x) => x.solicitacao_id===id); if (r) openModalEstender(r); }
    else if (btn.dataset.action==='checkout') { const r=state.rows.find((x) => x.solicitacao_id===id); if (r) openModalCheckout(r); }
    else if (btn.dataset.action==='edit-hotel') { const h=state.hoteis.find((x) => x.id===btn.dataset.id); if (h) fillHotelForm(h); }
    else if (btn.dataset.action==='delete-hotel') deleteHotel(btn.dataset.id);
    else if (btn.dataset.action==='edit-alojamento') { const a=(state.alojamentos||[]).find((x) => String(x.id)===String(btn.dataset.id)); if (a) fillAlojamentoForm(a); }
    else if (btn.dataset.action==='delete-alojamento') deleteAlojamento(btn.dataset.id);
  });

  // ─── Boot ──────────────────────────────────────────────────────────────────

  (async function boot() { await loadHoteis(); await loadAlojamentos(); await loadRows(); setTab(initialTabFromHash()); })();
});
