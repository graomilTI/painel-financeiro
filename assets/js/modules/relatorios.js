(function () {
  const BUCKET = 'relatorios-uploads';
  const DIRECT_UPLOAD_LIMIT = 45 * 1024 * 1024;
  const CHUNK_SIZE = 8 * 1024 * 1024;
  const MAX_ENTERPRISE_SIZE = 1024 * 1024 * 1024;
  const MONEY_FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

  const styles = `
    <style>
      .relatorios-importacao {
        --ri-bg: #020617;
        --ri-card: rgba(15, 23, 42, .78);
        --ri-card-2: rgba(2, 6, 23, .78);
        --ri-border: rgba(34, 197, 94, .25);
        --ri-border-soft: rgba(148, 163, 184, .16);
        --ri-text: #e2e2f0;
        --ri-muted: #6b7280;
        --ri-green: #22c55e;
        --ri-green-2: #16a34a;
        --ri-red: #ef4444;
        --ri-yellow: #f59e0b;
        color: var(--ri-text);
      }

      .relatorios-grid {
        display: grid;
        grid-template-columns: minmax(0, 1fr);
        gap: 18px;
      }

      .import-card {
        border: 1px solid var(--ri-border-soft);
        background:
          radial-gradient(circle at top left, rgba(34, 197, 94, .16), transparent 34%),
          linear-gradient(145deg, rgba(15, 23, 42, .92), rgba(2, 6, 23, .72));
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 22px 60px rgba(0, 0, 0, .22);
      }

      .import-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 16px;
      }

      .import-title {
        margin: 0;
        font-size: 18px;
        font-weight: 800;
        letter-spacing: -.02em;
      }

      .import-subtitle {
        margin: 6px 0 0;
        color: var(--ri-muted);
        font-size: 13px;
      }

      .dropzone {
        position: relative;
        border: 2px dashed rgba(34, 197, 94, .55);
        border-radius: 22px;
        padding: 30px 22px;
        min-height: 118px;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
        background:
          linear-gradient(180deg, rgba(2, 6, 23, .9), rgba(2, 6, 23, .58)),
          radial-gradient(circle at center, rgba(22, 101, 52, .24), transparent 58%);
        cursor: pointer;
        transition: transform .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease;
      }

      .dropzone:hover,
      .dropzone.is-dragging {
        transform: translateY(-1px);
        border-color: rgba(34, 197, 94, .95);
        box-shadow: 0 0 0 4px rgba(34, 197, 94, .08);
        background:
          linear-gradient(180deg, rgba(2, 6, 23, .88), rgba(2, 6, 23, .68)),
          radial-gradient(circle at center, rgba(34, 197, 94, .2), transparent 62%);
      }

      .dropzone-main {
        font-weight: 800;
        font-size: 15px;
      }

      .dropzone-hint {
        margin-top: 7px;
        color: var(--ri-muted);
        font-size: 12px;
      }

      .file-list {
        display: grid;
        gap: 10px;
        margin-top: 16px;
      }

      .file-empty {
        padding: 16px;
        color: var(--ri-muted);
        border: 1px solid var(--ri-border-soft);
        border-radius: 16px;
        background: rgba(2, 6, 23, .38);
        font-size: 13px;
      }

      .file-item {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        align-items: center;
        gap: 14px;
        padding: 13px 14px;
        border: 1px solid var(--ri-border-soft);
        border-radius: 16px;
        background: rgba(2, 6, 23, .42);
      }

      .file-name {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
        font-weight: 700;
      }

      .file-name span:last-child {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .file-meta {
        margin-top: 5px;
        color: var(--ri-muted);
        font-size: 12px;
      }

      .file-right {
        min-width: 220px;
        display: grid;
        gap: 8px;
      }

      .file-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
      }

      .file-status {
        font-size: 12px;
        color: var(--ri-muted);
        white-space: nowrap;
      }

      .file-remove {
        border: 0;
        background: rgba(148, 163, 184, .08);
        color: #cbd5e1;
        border-radius: 10px;
        height: 30px;
        padding: 0 10px;
        cursor: pointer;
      }

      .file-remove:hover { background: rgba(239, 68, 68, .14); color: #fecaca; }
      .file-remove:disabled { opacity: .45; cursor: not-allowed; }

      .progress {
        height: 8px;
        background: rgba(30, 41, 59, .92);
        border-radius: 999px;
        overflow: hidden;
      }

      .progress-bar {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg, var(--ri-green-2), var(--ri-green));
        border-radius: 999px;
        transition: width .25s ease, background .2s ease;
      }

      .file-item.is-error .progress-bar { background: linear-gradient(90deg, #b91c1c, var(--ri-red)); }
      .file-item.is-success { border-color: rgba(34, 197, 94, .38); }
      .file-item.is-error { border-color: rgba(239, 68, 68, .42); }
      .file-item.is-enterprise { border-color: rgba(59, 130, 246, .38); }
      .file-item.is-enterprise .progress-bar { background: linear-gradient(90deg, #2563eb, #22c55e); }
      .upload-mode { margin-left: 8px; font-size: 10px; font-weight: 900; letter-spacing: .05em; color: #bfdbfe; border: 1px solid rgba(59, 130, 246, .35); background: rgba(37, 99, 235, .16); border-radius: 999px; padding: 3px 7px; white-space: nowrap; }

      .tag {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        padding: 5px 9px;
        font-size: 11px;
        font-weight: 800;
        letter-spacing: .02em;
        background: rgba(34, 197, 94, .12);
        color: #bbf7d0;
        border: 1px solid rgba(34, 197, 94, .22);
      }

      .import-actions {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid var(--ri-border-soft);
      }

      .import-summary {
        color: var(--ri-muted);
        font-size: 13px;
      }

      .btn-importar {
        border: 0;
        min-height: 44px;
        padding: 0 18px;
        border-radius: 14px;
        background: linear-gradient(135deg, #16a34a, #22c55e);
        color: #052e16;
        font-weight: 900;
        cursor: pointer;
        box-shadow: 0 16px 34px rgba(34, 197, 94, .18);
        transition: transform .16s ease, opacity .16s ease, filter .16s ease;
      }

      .btn-importar:hover:not(:disabled) { transform: translateY(-1px); filter: brightness(1.04); }
      .btn-importar:disabled { opacity: .48; cursor: not-allowed; box-shadow: none; }
      .btn-importar.is-error { background: linear-gradient(135deg, #991b1b, #ef4444); color: #fff; }
      .btn-importar.is-success { background: linear-gradient(135deg, #15803d, #22c55e); color: #052e16; }

      .spinner {
        display: inline-block;
        width: 14px;
        height: 14px;
        margin-right: 8px;
        border-radius: 50%;
        border: 2px solid rgba(5, 46, 22, .26);
        border-top-color: #052e16;
        vertical-align: -2px;
        animation: spin .75s linear infinite;
      }

      .import-log {
        margin-top: 14px;
        padding: 12px 14px;
        border-radius: 16px;
        border: 1px solid var(--ri-border-soft);
        background: rgba(2, 6, 23, .38);
        color: var(--ri-muted);
        font-size: 13px;
        display: none;
      }

      .import-log.is-visible { display: block; }
      .import-log strong { color: var(--ri-text); }

      .import-intelligence {
        margin-top: 16px;
        padding: 14px;
        border: 1px solid rgba(34, 197, 94, .18);
        border-radius: 18px;
        background: rgba(2, 6, 23, .42);
        display: grid;
        gap: 12px;
      }

      .import-intelligence-row {
        display: grid;
        grid-template-columns: minmax(180px, 260px) minmax(0, 1fr);
        gap: 12px;
        align-items: end;
      }

      .import-field label {
        display: block;
        margin: 0 0 6px;
        color: #bbf7d0;
        font-size: 11px;
        font-weight: 900;
        letter-spacing: .06em;
        text-transform: uppercase;
      }

      .import-field select {
        width: 100%;
        min-height: 40px;
        border: 1px solid rgba(148, 163, 184, .22);
        border-radius: 12px;
        padding: 0 12px;
        color: #e2e2f0;
        background: #0d0d18;
        color-scheme: dark;
        outline: none;
      }

      .import-intelligence-note {
        color: var(--ri-muted);
        font-size: 12px;
        line-height: 1.45;
      }

      .file-period {
        display: inline-flex;
        margin-left: 8px;
        padding: 3px 7px;
        border-radius: 999px;
        background: rgba(34, 197, 94, .1);
        border: 1px solid rgba(34, 197, 94, .22);
        color: #bbf7d0;
        font-size: 10px;
        font-weight: 900;
        white-space: nowrap;
      }

      @media (max-width: 760px) {
        .import-intelligence-row { grid-template-columns: 1fr; }
      }

      @keyframes spin { to { transform: rotate(360deg); } }

      @media (max-width: 760px) {
        .file-item { grid-template-columns: 1fr; }
        .file-right { min-width: 0; }
        .import-actions { align-items: stretch; }
        .btn-importar { width: 100%; }
      }
    </style>
  `;

  const state = {
    files: [],
    running: false,
    imported: 0,
    errors: 0,
  };

  function loadScript(src, globalName) {
    if (globalName && window[globalName]) return Promise.resolve(window[globalName]);
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src="${src}"]`);
      if (existing) {
        existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
        existing.addEventListener('error', reject, { once: true });
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve(globalName ? window[globalName] : true);
      script.onerror = () => reject(new Error('Falha ao carregar biblioteca XLSX.'));
      document.head.appendChild(script);
    });
  }

  async function loadXlsx() {
    return loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js', 'XLSX');
  }

  function sanitizeFileName(name) {
    return String(name || 'arquivo')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'arquivo';
  }

  function humanSize(bytes) {
    const value = Number(bytes || 0);
    if (value < 1024) return `${value} B`;
    if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${(value / 1024 / 1024).toFixed(1)} MB`;
  }

  function isEnterpriseUpload(file) {
    return Number(file?.size || 0) > DIRECT_UPLOAD_LIMIT;
  }

  function uploadModeLabel(file) {
    return isEnterpriseUpload(file) ? 'ENTERPRISE · CHUNKS' : 'SEGURO';
  }


  function normalizeHeader(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function isValidDateParts(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
    if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
  }

  function makeIsoDate(year, month, day) {
    if (!isValidDateParts(year, month, day)) return null;
    return `${Number(year)}-${String(Number(month)).padStart(2, '0')}-${String(Number(day)).padStart(2, '0')}`;
  }

  function excelSerialToIsoDate(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return null;
    if (window.XLSX?.SSF?.parse_date_code) {
      const parsed = window.XLSX.SSF.parse_date_code(num);
      if (parsed?.y && parsed?.m && parsed?.d) return makeIsoDate(parsed.y, parsed.m, parsed.d);
    }
    // Fallback: serial do Excel/Sheets. Mantém a data correta mesmo se SSF não estiver disponível.
    const utc = Math.round((num - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (Number.isNaN(d.getTime())) return null;
    return makeIsoDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function toIsoDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') return excelSerialToIsoDate(value);
    const s = String(value || '').trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = Number(m[3]);
      // Padrão brasileiro primeiro. Se o mês ficaria inválido, aceita padrão Uber/EUA MM/DD/YYYY.
      if (b <= 12) return makeIsoDate(year, b, a);
      if (a <= 12) return makeIsoDate(year, a, b);
      return null;
    }
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return makeIsoDate(m[1], m[2], m[3]);
    m = s.match(/^(\d{1,2})[\/\-.](\d{4})$/);
    if (m) return makeIsoDate(m[2], m[1], 1);
    const MAP = {jan:1,fev:2,feb:2,mar:3,abr:4,apr:4,mai:5,may:5,jun:6,jul:7,ago:8,aug:8,set:9,sep:9,out:10,oct:10,nov:11,dez:12,dec:12};
    m = normalizeHeader(s).match(/^([a-z]{3,})[\/\-. ]+(\d{4})$/);
    if (m && MAP[m[1].slice(0,3)]) return makeIsoDate(m[2], MAP[m[1].slice(0,3)], 1);
    return null;
  }

  function parseDataFromSheetName(name) {
    const raw = String(name || '').trim();
    let m = raw.match(/^(\d{2})(\d{2})(\d{4})$/);
    if (m) return makeIsoDate(m[3], m[2], m[1]);
    m = raw.match(/^(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{4})$/);
    if (m) return makeIsoDate(m[3], m[2], m[1]);
    return toIsoDate(raw);
  }

  function headerKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function headerMatches(cell, expected) {
    const a = headerKey(cell);
    const b = headerKey(expected);
    if (!a || !b) return false;
    return a === b || a.includes(b) || b.includes(a);
  }

  function findHeaderRow(rows, required) {
    let best = 0;
    let score = -1;
    const req = (required || []).map(headerKey).filter(Boolean);
    (rows || []).slice(0, 50).forEach((row, index) => {
      // IMPORTANTE: ignora células vazias. Antes, name.includes('') fazia
      // linhas de observação com colunas vazias serem confundidas com cabeçalho.
      const headers = (row || []).map(headerKey).filter(Boolean);
      const current = req.filter((name) => headers.some((h) => h === name || h.includes(name) || name.includes(h))).length;
      if (current > score) {
        score = current;
        best = index;
      }
    });
    return best;
  }

  function extractPeriodFromRows(rows, tipo) {
    const dates = [];
    if (!Array.isArray(rows) || !rows.length) return null;

    if (tipo === 'despesas') {
      const first = rows[0] || [];
      first.forEach((cell) => {
        const iso = toIsoDate(cell);
        if (iso) dates.push(iso);
      });
    } else if (tipo === 'financeiro_contas_receber' || tipo === 'financeiro_contas_pagar') {
      const hrow = findHeaderRow(rows, ['Vencimento', 'Valor']);
      const header = rows[hrow] || [];
      const idxData = header.findIndex((h) => ['vencimento', 'data vencimento', 'dt vencimento'].some((alias) => headerMatches(h, alias)));
      if (idxData >= 0) rows.slice(hrow + 1).forEach((row) => { const iso = toIsoDate(row?.[idxData]); if (iso) dates.push(iso); });
    } else if (tipo === 'uber_corridas') {
      const hrow = findHeaderRow(rows, ['NOME', 'Data da solicitação (local)', 'Endereço de partida']);
      const header = rows[hrow] || [];
      const idxData = header.findIndex((h) => ['data da solicitação local', 'data da solicitacao local', 'data solicitacao local', 'data'].some((alias) => headerMatches(h, alias)));
      if (idxData >= 0) {
        rows.slice(hrow + 1).forEach((row) => {
          const iso = toIsoDate(row?.[idxData]);
          if (iso) dates.push(iso);
        });
      }
    } else {
      const hrow = findHeaderRow(rows, ['Data']);
      const header = rows[hrow] || [];
      const idxData = header.findIndex((h) => ['data', 'data n.f.', 'data nf', 'data da nf', 'data nota'].some((alias) => headerMatches(h, alias)));
      if (idxData >= 0) {
        rows.slice(hrow + 1).forEach((row) => {
          const iso = toIsoDate(row?.[idxData]);
          if (iso) dates.push(iso);
        });
      }
    }

    const unique = [...new Set(dates)].sort();
    if (!unique.length) return null;
    return {
      inicio: unique[0],
      fim: unique[unique.length - 1],
      totalDatas: unique.length,
    };
  }

  async function detectFilePeriod(file, tipo) {
    try {
      if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return null;
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const preferred = workbook.SheetNames.find((name) => normalizeHeader(name).includes('resultado')) || workbook.SheetNames[0];
      const sheet = workbook.Sheets[preferred];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      return extractPeriodFromRows(rows, tipo);
    } catch (err) {
      console.warn('[RELATORIOS] Não foi possível detectar período:', err);
      return null;
    }
  }

  async function readSpreadsheetAsObjects(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const allObjects = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['HOTEL', 'CIDADE']);
      const header = (rows[headerRow] || []).map(normalizeHeader);
      const hasHotel = header.includes('hotel') || header.includes('nome hotel') || header.includes('nome_hotel');
      const hasCity = header.includes('cidade') || header.includes('ciudad');
      const hasDailyRate = header.some((h) => ['valor', 'diaria', 'diaria r$', 'r$ por dia', 'vlr diaria', 'valor diaria', 'valor diario'].includes(h));

      // Para cadastro de hotéis, só importa abas que realmente tenham estrutura de hotel.
      // Isso evita ler abas auxiliares/observações como a "Página2".
      if (!hasHotel || (!hasCity && !hasDailyRate)) continue;

      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const dataRows = rows.slice(headerRow + 1);

      dataRows.forEach((row) => {
        const obj = { __aba: sheetName };
        headers.forEach((header, index) => {
          if (!header) return;
          obj[header] = row?.[index] ?? '';
        });
        if (Object.values(obj).some((value) => String(value ?? '').trim() !== '')) {
          allObjects.push(obj);
        }
      });
    }

    return allObjects;
  }


  function pickValue(row, keys) {
    const normalizedMap = new Map(Object.keys(row || {}).map((key) => [normalizeHeader(key), row[key]]));
    for (const key of keys) {
      const value = normalizedMap.get(normalizeHeader(key));
      if (value !== undefined && value !== null && String(value).trim() !== '') return value;
    }
    return null;
  }

  function normalizeNumberBr(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = String(value).trim().replace(/\s/g, '');
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    const number = Number(normalized.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number : null;
  }


  const COLAB_RH_ALIASES = {
    cpf: ['CPF', 'Cpf'],
    nome: ['Nome', 'NOME', 'Funcionário', 'Funcionario', 'Colaborador'],
    situacao: ['Situação', 'Situacao', 'STATUS', 'Status'],
    admissao: ['Admissão', 'Admissao', 'Data de Admissão', 'Data de Admissao', 'Dt Admissao'],
    desligamento: ['Desligamento', 'Data de Desligamento', 'Dt Desligamento'],
    salario: ['Salário', 'Salario'],
    conta_bancaria: ['C. Banc. Despesas', 'C Banc. Despesas', 'C Banc Despesas', 'Conta Bancária', 'Conta Bancaria'],
    empresa: ['Empresa'],
    coordenacao: ['Coordenação', 'Coordenacao'],
    supervisao: ['Supervisão', 'Supervisao'],
    tipo: ['Tipo'],
    cep: ['CEP', 'Cep'],
    estado: ['Estado', 'UF'],
    cidade: ['Cidade'],
    bairro: ['Bairro'],
    endereco: ['Endereço', 'Endereco'],
    complemento: ['Complemento'],
    data_nascimento: ['Data de Nascimento', 'Nascimento', 'Dt Nascimento'],
    cargo: ['Cargo', 'Função', 'Funcao'],
    whatsapp: ['Whatsapp', 'WhatsApp', 'Celular', 'Telefone', 'Fone'],
    email_pessoal: ['E-mail Pessoal', 'Email Pessoal'],
    email_empresa: ['E-mail da Empresa', 'Email da Empresa', 'E-mail Empresa', 'Email Empresa']
  };

  function normalizeCpfColabRh(value) {
    if (value === null || value === undefined || value === '') return null;
    const digits = String(value).replace(/\D/g, '');
    if (!digits) return null;
    return digits.length < 11 ? digits.padStart(11, '0') : digits.slice(-11);
  }

  function normalizePhoneColabRh(value) {
    if (value === null || value === undefined || value === '') return null;
    const digits = String(value).replace(/\D/g, '').replace(/^0+/, '');
    return digits || null;
  }

  function normalizeTextColabRh(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text || null;
  }

  function computeAtivoColabRh(situacao, desligamento) {
    if (desligamento) return false;
    const s = normalizeHeader(situacao || '');
    if (!s) return true;
    return !['nao ativo', 'nao ativa', 'inativo', 'inativa', 'deslig', 'demit'].some((status) => s.includes(status));
  }

  function pickRowValueByIndex(row, headerIndexes, aliases) {
    for (const alias of aliases || []) {
      const idx = headerIndexes.get(headerKey(alias));
      if (idx !== undefined) {
        const value = row?.[idx];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
    return null;
  }

  function mapColaboradorRhRow(row, headerIndexes, dataReferencia, importacaoId) {
    const get = (campo) => pickRowValueByIndex(row, headerIndexes, COLAB_RH_ALIASES[campo] || []);
    const situacao = normalizeTextColabRh(get('situacao'));
    const desligamento = toIsoDate(get('desligamento'));
    const admissao = toIsoDate(get('admissao'));

    return {
      importacao_id: importacaoId,
      data_referencia: dataReferencia,
      cpf: normalizeCpfColabRh(get('cpf')),
      nome: normalizeTextColabRh(get('nome')),
      situacao,
      admissao,
      desligamento,
      salario: normalizeNumberBr(get('salario')),
      conta_bancaria: normalizeTextColabRh(get('conta_bancaria')),
      empresa: normalizeTextColabRh(get('empresa')),
      coordenacao: normalizeTextColabRh(get('coordenacao')),
      supervisao: normalizeTextColabRh(get('supervisao')),
      tipo: normalizeTextColabRh(get('tipo')),
      cep: normalizeTextColabRh(get('cep')),
      estado: normalizeTextColabRh(get('estado')),
      cidade: normalizeTextColabRh(get('cidade')),
      bairro: normalizeTextColabRh(get('bairro')),
      endereco: normalizeTextColabRh(get('endereco')),
      complemento: normalizeTextColabRh(get('complemento')),
      data_nascimento: toIsoDate(get('data_nascimento')),
      cargo: normalizeTextColabRh(get('cargo')),
      whatsapp: normalizePhoneColabRh(get('whatsapp')),
      email_pessoal: normalizeTextColabRh(get('email_pessoal')),
      email_empresa: normalizeTextColabRh(get('email_empresa')),
      ativo: computeAtivoColabRh(situacao, desligamento)
    };
  }

  async function readColaboradoresRhFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
    if (!rows?.length) throw new Error('A planilha de funcionários está vazia.');

    const headerRow = findHeaderRow(rows, ['CPF', 'Nome', 'Admissão']);
    const header = rows[headerRow] || [];
    const headerIndexes = new Map();
    header.forEach((h, index) => {
      const key = headerKey(h);
      if (key) headerIndexes.set(key, index);
    });

    const obrigatorios = [
      ['CPF', COLAB_RH_ALIASES.cpf],
      ['Nome', COLAB_RH_ALIASES.nome],
      ['Admissão', COLAB_RH_ALIASES.admissao],
      ['Whatsapp', COLAB_RH_ALIASES.whatsapp]
    ];
    const faltantes = obrigatorios
      .filter(([, aliases]) => !aliases.some((alias) => headerIndexes.has(headerKey(alias))))
      .map(([label]) => label);

    if (faltantes.length) {
      throw new Error(`Cabeçalho(s) obrigatório(s) ausente(s) na planilha de funcionários: ${faltantes.join(', ')}`);
    }

    return rows
      .slice(headerRow + 1)
      .filter((row) => (row || []).some((cell) => cell !== null && cell !== undefined && String(cell).trim() !== ''));
  }

  async function insertBatchesSupabase_(supabase, table, rows, batchSize = 300, queryBuilder = 'insert') {
    for (let i = 0; i < rows.length; i += batchSize) {
      const chunk = rows.slice(i, i + batchSize);
      const query = queryBuilder === 'upsert'
        ? supabase.from(table).upsert(chunk, { onConflict: 'cpf' })
        : supabase.from(table).insert(chunk);
      const { error } = await query;
      if (error) throw new Error(error.message || `Falha ao gravar ${table}.`);
    }
  }

  function mapColaboradorSnapshotToHistorico(row) {
    const { conta_bancaria, ...rest } = row;
    return {
      ...rest,
      conta_bancaria_despesas: conta_bancaria ?? null
    };
  }

  async function limparHistoricoColaboradoresPorDatas(supabase, datas = []) {
    for (const data of datas) {
      if (!data) continue;
      const { error } = await supabase
        .from('historico_colaboradores')
        .delete()
        .eq('data_referencia', data);
      if (error) throw new Error(error.message || 'Falha ao limpar histórico de colaboradores.');
    }
  }

  function mapColaboradorSnapshotToCurrent(row) {
    return {
      cpf: row.cpf,
      nome: row.nome,
      situacao: row.situacao,
      admissao: row.admissao,
      desligamento: row.desligamento,
      salario: row.salario == null ? null : String(row.salario),
      conta_bancaria_despesas: row.conta_bancaria,
      empresa: row.empresa,
      coordenacao: row.coordenacao,
      supervisao: row.supervisao,
      tipo: row.tipo,
      cep: row.cep,
      estado: row.estado,
      cidade: row.cidade,
      bairro: row.bairro,
      endereco: row.endereco,
      complemento: row.complemento,
      data_nascimento: row.data_nascimento,
      cargo: row.cargo,
      whatsapp: row.whatsapp,
      email_pessoal: row.email_pessoal,
      email_empresa: row.email_empresa,
      updated_at: new Date().toISOString()
    };
  }

  async function importarColaboradoresRhDaPlanilha(file, opts) {
    const supabase = opts.supabase;
    const rawRows = await readColaboradoresRhFromFile(file);
    const dataReferencia = new Date().toISOString().slice(0, 10);
    const user = opts.user || opts.auth?.user || null;

    const { data: importacao, error: impError } = await supabase
      .from('colaborador_importacoes')
      .insert({
        data_referencia: dataReferencia,
        arquivo_nome: file.name,
        origem: 'importar_relatorios',
        importado_por: user?.id || null,
        status: 'processando',
        total_linhas: rawRows.length,
        observacoes: 'Importação automática pela Central de Importação'
      })
      .select()
      .single();

    if (impError) throw new Error(impError.message || 'Falha ao criar importação de colaboradores.');

    try {
      const XLSX = await loadXlsx();
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      const headerRow = findHeaderRow(rows, ['CPF', 'Nome', 'Admissão']);
      const header = rows[headerRow] || [];
      const headerIndexes = new Map();
      header.forEach((h, index) => {
        const key = headerKey(h);
        if (key) headerIndexes.set(key, index);
      });

      const mapped = rows
        .slice(headerRow + 1)
        .map((row) => mapColaboradorRhRow(row, headerIndexes, dataReferencia, importacao.id))
        .filter((row) => row.nome);

      if (!mapped.length) throw new Error('Nenhum funcionário válido encontrado para importar.');

      const datasHistorico = [...new Set(mapped.map((row) => row.data_referencia).filter(Boolean))];
      await limparHistoricoColaboradoresPorDatas(supabase, datasHistorico);
      await insertBatchesSupabase_(supabase, 'historico_colaboradores', mapped.map(mapColaboradorSnapshotToHistorico), 300, 'insert');
      await insertBatchesSupabase_(supabase, 'colaborador_snapshot', mapped, 300, 'insert');

      const currentRows = mapped
        .filter((row) => row.cpf)
        .map(mapColaboradorSnapshotToCurrent);

      if (currentRows.length) {
        await insertBatchesSupabase_(supabase, 'colaboradores', currentRows, 300, 'upsert');
      }

      const ativos = mapped.filter((row) => row.ativo).length;
      const inativos = mapped.length - ativos;
      const coordenacoes = new Set(mapped.map((row) => row.coordenacao).filter(Boolean)).size;

      const { error: updError } = await supabase
        .from('colaborador_importacoes')
        .update({
          status: 'processado',
          total_linhas: mapped.length,
          observacoes: `Importação automática concluída. Ativos: ${ativos}. Inativos: ${inativos}.`
        })
        .eq('id', importacao.id);

      if (updError) throw new Error(updError.message || 'Falha ao finalizar importação de colaboradores.');

      return {
        importacao_id: importacao.id,
        data_referencia: dataReferencia,
        total_linhas: mapped.length,
        importados: mapped.length,
        ativos,
        inativos,
        coordenacoes,
        base_atualizada: currentRows.length
      };
    } catch (err) {
      await supabase
        .from('colaborador_importacoes')
        .update({
          status: 'erro',
          observacoes: `Erro na importação automática: ${err?.message || err}`
        })
        .eq('id', importacao.id);
      throw err;
    }
  }


  function financeiroHash(parts) {
    const base = (parts || []).map((value) => normalizeHeader(value)).join('|');
    let hash = 0x811c9dc5;
    for (let i = 0; i < base.length; i += 1) {
      hash ^= base.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return `fin_${(hash >>> 0).toString(16)}_${base.length}`;
  }

  function financeiroRowValue(row, aliases) {
    return pickValue(row, aliases);
  }

  async function readFinanceiroObjectsFromFile(file, requiredHeaders) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const allObjects = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, requiredHeaders);
      const headerRaw = rows[headerRow] || [];
      const header = headerRaw.map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const headerScore = (requiredHeaders || []).filter((name) => headerRaw.some((h) => headerMatches(h, name))).length;
      if (headerScore < Math.min(4, requiredHeaders.length)) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const obj = { __aba: sheetName };
        header.forEach((name, index) => {
          if (!name) return;
          obj[name] = row?.[index] ?? '';
        });
        const hasData = Object.entries(obj).some(([key, value]) => key !== '__aba' && String(value ?? '').trim() !== '');
        if (hasData) allObjects.push(obj);
      });
    }

    return allObjects;
  }

  function normalizeFinanceStatus(value) {
    return normalizeText(value) || 'A Vencer';
  }

  function buildFinanceiroReceberPayload(row, fileName) {
    const situacao = normalizeFinanceStatus(financeiroRowValue(row, ['Situação', 'Situacao', 'Status']));
    const codigo = normalizeText(financeiroRowValue(row, ['Código', 'Codigo', 'Cod', 'Cód.']));
    const fatura = normalizeText(financeiroRowValue(row, ['Fatura', 'Nº Fatura', 'Numero Fatura']));
    const cliente = normalizeText(financeiroRowValue(row, ['Cliente', 'Razão Social', 'Razao Social']));
    const conta = normalizeText(financeiroRowValue(row, ['Conta', 'Conta Bancária', 'Conta Bancaria']));
    const emissao_nf = toIsoDate(financeiroRowValue(row, ['Emissão N.F', 'Emissao N.F', 'Emissão NF', 'Emissao NF', 'Data NF']));
    const vencimento = toIsoDate(financeiroRowValue(row, ['Vencimento', 'Data Vencimento', 'Dt. Vencimento']));
    const recebimento = toIsoDate(financeiroRowValue(row, ['Recebimento', 'Data Recebimento', 'Dt. Recebimento']));
    const numero_nf = normalizeText(financeiroRowValue(row, ['N.F.', 'NF', 'Nº NF', 'Numero NF', 'Nota Fiscal']));
    const valor = normalizeNumberBr(financeiroRowValue(row, ['Valor', 'Valor Título', 'Valor Titulo', 'Valor Bruto'])) || 0;
    const desconto = normalizeNumberBr(financeiroRowValue(row, ['Desconto', 'Descontos'])) || 0;
    const juros = normalizeNumberBr(financeiroRowValue(row, ['Juros', 'Juro'])) || 0;
    const valor_pago = normalizeNumberBr(financeiroRowValue(row, ['Valor Pago', 'V. Pago', 'Pago'])) || 0;
    if (!codigo && !fatura && !cliente && !vencimento && !valor) return null;
    return { unique_hash: financeiroHash(['receber', codigo, fatura, cliente, vencimento, valor]), situacao, codigo, fatura, cliente, conta, emissao_nf, vencimento, recebimento, numero_nf, valor, desconto, juros, valor_pago, arquivo_origem: fileName, raw: row, updated_at: new Date().toISOString() };
  }

  function buildFinanceiroPagarPayload(row, fileName) {
    const empresa = normalizeText(financeiroRowValue(row, ['Empresa']));
    const situacao = normalizeFinanceStatus(financeiroRowValue(row, ['Situação', 'Situacao', 'Status']));
    const cod_grupo = normalizeText(financeiroRowValue(row, ['COD/Grupo', 'Cod/Grupo', 'Código', 'Codigo', 'Grupo']));
    const data_lancamento = toIsoDate(financeiroRowValue(row, ['Data', 'Data Lançamento', 'Data Lancamento']));
    const coordenacao = normalizeText(financeiroRowValue(row, ['Coordenação', 'Coordenacao']));
    const supervisao = normalizeText(financeiroRowValue(row, ['Supervisão', 'Supervisao']));
    const favorecido = normalizeText(financeiroRowValue(row, ['Favorecido', 'Fornecedor', 'Nome']));
    const cnpj_cpf = normalizeText(financeiroRowValue(row, ['CNPJ/CPF', 'CNPJ', 'CPF']));
    const identificacao = normalizeText(financeiroRowValue(row, ['Identificação', 'Identificacao']));
    const categoria = normalizeText(financeiroRowValue(row, ['Categoria']));
    const doc = normalizeText(financeiroRowValue(row, ['Doc', 'Documento', 'Nº Doc', 'Numero Doc']));
    const vencimento = toIsoDate(financeiroRowValue(row, ['Vencimento', 'Data Vencimento', 'Dt. Vencimento']));
    const parcela = normalizeText(financeiroRowValue(row, ['Parcela']));
    const valor_pago = normalizeNumberBr(financeiroRowValue(row, ['V. Pago', 'Valor Pago', 'Pago'])) || 0;
    const valor = normalizeNumberBr(financeiroRowValue(row, ['Valor', 'Valor Título', 'Valor Titulo'])) || 0;
    const usuario = normalizeText(financeiroRowValue(row, ['Usuário', 'Usuario']));
    const data_cadastro = toIsoDate(financeiroRowValue(row, ['Data de Cadastro', 'Cadastro']));
    if (!empresa && !cod_grupo && !favorecido && !doc && !vencimento && !valor) return null;
    return { unique_hash: financeiroHash(['pagar', empresa, cod_grupo, favorecido, doc, vencimento, parcela, valor]), empresa, situacao, cod_grupo, data_lancamento, coordenacao, supervisao, favorecido, cnpj_cpf, identificacao, categoria, doc, vencimento, parcela, valor_pago, valor, usuario, data_cadastro, arquivo_origem: fileName, raw: row, updated_at: new Date().toISOString() };
  }

  async function upsertFinanceiroRows(tableName, payloads, opts) {
    const supabase = opts.supabase;
    let total = 0;
    for (let i = 0; i < payloads.length; i += 500) {
      const chunk = payloads.slice(i, i + 500);
      const { error, data } = await supabase.from(tableName).upsert(chunk, { onConflict: 'unique_hash' }).select('id');
      if (error) throw error;
      total += data?.length || chunk.length;
    }
    return total;
  }

  async function importarFinanceiroReceberDaPlanilha(file, opts) {
    const rows = await readFinanceiroObjectsFromFile(file, ['Situação', 'Código', 'Fatura', 'Cliente', 'Vencimento', 'Valor']);
    const payloads = rows.map((row) => buildFinanceiroReceberPayload(row, file.name)).filter(Boolean);
    if (!payloads.length) throw new Error('Não encontrei linhas válidas de Contas a Receber na planilha.');
    const importados = await upsertFinanceiroRows('financeiro_contas_receber', payloads, opts);
    const periodDates = payloads.map((row) => row.vencimento).filter(Boolean).sort();
    return { importados, total_linhas: rows.length, periodo_inicio: periodDates[0] || null, periodo_fim: periodDates[periodDates.length - 1] || null, valor_total: payloads.reduce((sum, row) => sum + Number(row.valor || 0), 0) };
  }

  async function importarFinanceiroPagarDaPlanilha(file, opts) {
    const rows = await readFinanceiroObjectsFromFile(file, ['Empresa', 'Situação', 'COD/Grupo', 'Favorecido', 'Vencimento', 'Valor']);
    const payloads = rows.map((row) => buildFinanceiroPagarPayload(row, file.name)).filter(Boolean);
    if (!payloads.length) throw new Error('Não encontrei linhas válidas de Contas a Pagar na planilha.');
    const importados = await upsertFinanceiroRows('financeiro_contas_pagar', payloads, opts);
    const periodDates = payloads.map((row) => row.vencimento).filter(Boolean).sort();
    return { importados, total_linhas: rows.length, periodo_inicio: periodDates[0] || null, periodo_fim: periodDates[periodDates.length - 1] || null, valor_total: payloads.reduce((sum, row) => sum + Number(row.valor || 0), 0) };
  }


  function normalizeText(value) {
    if (value === null || value === undefined) return null;
    const s = String(value).trim();
    return s || null;
  }

  function normalizeKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function normalizePlate(value) {
    return String(value || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .slice(0, 7);
  }

  function extractPlateFromText(value) {
    const text = String(value || '').toUpperCase();
    const mercosul = text.match(/\b[A-Z]{3}[0-9][A-Z][0-9]{2}\b/);
    if (mercosul) return normalizePlate(mercosul[0]);
    const antigo = text.match(/\b[A-Z]{3}[0-9]{4}\b/);
    if (antigo) return normalizePlate(antigo[0]);
    return '';
  }

  function normalizeInteger(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    const n = Number(String(value).replace(/[^0-9-]/g, ''));
    return Number.isFinite(n) ? Math.trunc(n) : null;
  }

  function normalizeDateTimeExcel(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
      const parsed = window.XLSX.SSF.parse_date_code(value);
      if (!parsed) return null;
      const mm = String(parsed.m).padStart(2, '0');
      const dd = String(parsed.d).padStart(2, '0');
      const hh = String(parsed.H || 0).padStart(2, '0');
      const mi = String(parsed.M || 0).padStart(2, '0');
      const ss = String(Math.floor(parsed.S || 0)).padStart(2, '0');
      return `${parsed.y}-${mm}-${dd}T${hh}:${mi}:${ss}`;
    }
    const iso = toIsoDate(value);
    if (iso) {
      const s = String(value).trim();
      const t = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (t) return `${iso}T${String(t[1]).padStart(2, '0')}:${t[2]}:${t[3] || '00'}`;
      return `${iso}T00:00:00`;
    }
    return null;
  }

  function hasAnyHeader(row, aliases = []) {
    if (!row || typeof row !== 'object') return false;
    const keys = Object.keys(row);
    const normalized = new Set(keys.map(normalizeKey));
    return aliases.some((alias) => keys.includes(alias) || normalized.has(normalizeKey(alias)));
  }

  function parseTimeText(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}:${String(value.getSeconds()).padStart(2, '0')}`;
    }
    if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
      const parsed = window.XLSX.SSF.parse_date_code(value);
      if (parsed) return `${String(parsed.H || 0).padStart(2, '0')}:${String(parsed.M || 0).padStart(2, '0')}:${String(Math.floor(parsed.S || 0)).padStart(2, '0')}`;
    }
    const s = String(value).trim();
    const m = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    return m ? `${String(m[1]).padStart(2, '0')}:${m[2]}:${m[3] || '00'}` : (s || null);
  }


  function excelSerialToDate(serial) {
    const n = Number(serial);
    if (!Number.isFinite(n)) return null;
    // Excel serial date, with 1899-12-30 base used by SheetJS/Excel interop.
    const utcValue = (n - 25569) * 86400;
    const dateInfo = new Date(Math.round(utcValue * 1000));
    if (Number.isNaN(dateInfo.getTime())) return null;
    return dateInfo;
  }

  function inferUberMonthFromFileName(fileName) {
    const text = normalizeHeader(fileName || '');
    const map = { jan: 1, fev: 2, feb: 2, mar: 3, abr: 4, apr: 4, mai: 5, may: 5, jun: 6, jul: 7, ago: 8, aug: 8, set: 9, sep: 9, out: 10, oct: 10, nov: 11, dez: 12, dec: 12 };
    const monthKey = Object.keys(map).find((key) => text.includes(key));
    return monthKey ? map[monthKey] : null;
  }

  function parseUberStringDate(value, fileName) {
    const s = String(value || '').trim();
    if (!s) return null;
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:\s+.*)?$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      const year = Number(m[3]);
      const monthHint = inferUberMonthFromFileName(fileName);

      // Relatórios Uber normalmente vêm em MM/DD/YYYY.
      // Quando o arquivo tem mês no nome, usamos isso para desfazer ambiguidade.
      if (monthHint && a === monthHint) return makeIsoDate(year, a, b);
      if (monthHint && b === monthHint) return makeIsoDate(year, b, a);

      if (a <= 12 && b > 12) return makeIsoDate(year, a, b); // MM/DD/YYYY
      if (b <= 12 && a > 12) return makeIsoDate(year, b, a); // DD/MM/YYYY

      // Na dúvida, prioriza padrão Uber/EUA para evitar mês 13 em datas como 03/13/2026.
      return makeIsoDate(year, a, b) || makeIsoDate(year, b, a);
    }

    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?:\s+.*)?$/);
    if (m) return makeIsoDate(m[1], m[2], m[3]);

    return toIsoDate(value);
  }

  function toIsoDateUber(value, fileName) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
      const date = excelSerialToDate(value);
      return date ? date.toISOString().slice(0, 10) : null;
    }
    return parseUberStringDate(value, fileName);
  }

  function toTimestampUber(value, fileName) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
    if (typeof value === 'number') {
      const date = excelSerialToDate(value);
      return date ? date.toISOString() : null;
    }
    const iso = parseUberStringDate(value, fileName);
    return iso ? `${iso}T00:00:00Z` : null;
  }

  function normalizeUberTime(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
    }
    return String(value).trim() || null;
  }

  function buildUberImportHash(row) {
    const parts = [
      row.data_solicitacao_local || '',
      row.hora_solicitacao_local || '',
      row.nome || '',
      row.endereco_partida || '',
      row.endereco_destino || '',
      row.preco_liquido ?? '',
    ].map((v) => normalizeHeader(String(v)));
    return parts.join('|').slice(0, 500);
  }

  async function readUberCorridasFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['NOME', 'Endereço de partida', 'Endereço de destino', 'Preço líquido do parceiro (moeda local)']);
      const rawHeader = rows[headerRow] || [];
      const normalizedHeader = rawHeader.map(normalizeHeader);
      const hasUberStructure = normalizedHeader.includes('nome')
        && normalizedHeader.some((h) => h.includes('endereco de partida'))
        && normalizedHeader.some((h) => h.includes('endereco de destino'))
        && normalizedHeader.some((h) => h.includes('preco liquido'));
      if (!hasUberStructure) continue;

      const headers = rawHeader.map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      rows.slice(headerRow + 1).forEach((row) => {
        const obj = {};
        headers.forEach((header, index) => {
          if (!header) return;
          obj[header] = row?.[index] ?? '';
        });

        const nome = String(pickValue(obj, ['NOME', 'Nome', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
        const enderecoPartida = String(pickValue(obj, ['Endereço de partida', 'Endereco de partida', 'Partida']) || '').trim();
        const enderecoDestino = String(pickValue(obj, ['Endereço de destino', 'Endereco de destino', 'Destino']) || '').trim();
        if (!nome || (!enderecoPartida && !enderecoDestino)) return;

        const registro = {
          data_hora_transacao_utc: toTimestampUber(pickValue(obj, ['Registro de data e hora da transação (UTC)', 'Registro de data e hora da transacao UTC']), file.name),
          hora_solicitacao_utc: normalizeUberTime(pickValue(obj, ['Hora da solicitação (UTC)', 'Hora da solicitacao UTC'])),
          data_solicitacao_local: toIsoDateUber(pickValue(obj, ['Data da solicitação (local)', 'Data da solicitacao local']), file.name),
          hora_solicitacao_local: normalizeUberTime(pickValue(obj, ['Hora da solicitação (local)', 'Hora da solicitacao local'])),
          data_chegada_utc: toIsoDateUber(pickValue(obj, ['Data de chegada (UTC)', 'Data chegada UTC']), file.name),
          hora_chegada_utc: normalizeUberTime(pickValue(obj, ['Hora de chegada (UTC)', 'Hora chegada UTC'])),
          data_chegada_local: toIsoDateUber(pickValue(obj, ['Data de chegada (local)', 'Data chegada local']), file.name),
          hora_chegada_local: normalizeUberTime(pickValue(obj, ['Hora de chegada (local)', 'Hora chegada local'])),
          nome,
          coord: String(pickValue(obj, ['Coord', 'Coordenação', 'Coordenacao']) || '').trim() || null,
          supervisao: String(pickValue(obj, ['Superv', 'Supervisão', 'Supervisao']) || '').trim() || null,
          grupo: String(pickValue(obj, ['Grupo']) || '').trim() || null,
          servico: String(pickValue(obj, ['Serviço', 'Servico']) || '').trim() || null,
          programa: String(pickValue(obj, ['Programa']) || '').trim() || null,
          cidade: String(pickValue(obj, ['Cidade']) || '').trim() || null,
          pais: String(pickValue(obj, ['País', 'Pais']) || '').trim() || null,
          distancia_mi: normalizeNumberBr(pickValue(obj, ['Distância (mi)', 'Distancia (mi)', 'Distância', 'Distancia'])),
          duracao_min: normalizeNumberBr(pickValue(obj, ['Duração (min)', 'Duracao (min)', 'Duração', 'Duracao'])),
          endereco_partida: enderecoPartida || null,
          endereco_destino: enderecoDestino || null,
          detalhamento_despesa: String(pickValue(obj, ['Detalhamento da despesa', 'Detalhamento']) || '').trim() || null,
          preco_liquido: normalizeNumberBr(pickValue(obj, ['Preço líquido do parceiro (moeda local)', 'Preco liquido do parceiro moeda local', 'Preço líquido', 'Preco liquido', 'Valor'])) || 0,
          arquivo_nome: file.name,
          status_validacao: 'ATENCAO',
        };
        registro.import_hash = buildUberImportHash(registro);
        mapped.push(registro);
      });
    }

    return mapped;
  }

  async function importarUberCorridasDaPlanilha(file, opts) {
    const corridas = await readUberCorridasFromFile(file);
    if (!corridas.length) {
      throw new Error('A planilha Uber não possui linhas válidas. Cabeçalhos esperados: NOME, Data da solicitação (local), Endereço de partida, Endereço de destino e Preço líquido do parceiro.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < corridas.length; i += batchSize) {
      const batch = corridas.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('conferencia_uber_corridas')
        .upsert(batch, { onConflict: 'import_hash' });
      if (error) throw new Error(error.message || 'Falha ao gravar corridas Uber no Supabase. Confira se rodou o SQL da Conferência Uber.');
      total += batch.length;
    }

    const periodos = corridas.map((r) => r.data_solicitacao_local).filter(Boolean).sort();
    const colaboradores = new Set(corridas.map((r) => normalizeHeader(r.nome)).filter(Boolean)).size;
    const valorTotal = corridas.reduce((sum, r) => sum + Number(r.preco_liquido || 0), 0);
    return {
      total_linhas: corridas.length,
      importados: total,
      colaboradores,
      valor_total: Math.round(valorTotal * 100) / 100,
      periodo_inicio: periodos[0] || null,
      periodo_fim: periodos[periodos.length - 1] || null,
    };
  }

  async function readPontosEmbarqueFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name) === 'dados') || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });

    const mapped = [];
    const seen = new Set();

    rows.forEach((row) => {
      const tipoLocal = String(pickValue(row, ['Tipo do Local', 'Tipo Local', 'Tipo']) || '').trim();
      const nomeLocal = String(pickValue(row, ['Local', 'Nome Local', 'Ponto', 'Ponto de Embarque']) || '').trim();
      const uf = String(pickValue(row, ['UF', 'Estado']) || '').trim().toUpperCase().slice(0, 2);
      const cidade = String(pickValue(row, ['Cidade', 'Município', 'Municipio']) || '').trim();
      const latitude = normalizeNumberBr(pickValue(row, ['Latitude', 'Lat']));
      const longitude = normalizeNumberBr(pickValue(row, ['Longitude', 'Lng', 'Long']));
      const supervisao = String(pickValue(row, ['Supervisão', 'Supervisao']) || '').trim();
      const coordenacao = String(pickValue(row, ['Coordenação', 'Coordenacao']) || '').trim();

      if (!nomeLocal || !cidade || !uf) return;
      const key = `${nomeLocal.toUpperCase()}|${cidade.toUpperCase()}|${uf}`;
      if (seen.has(key)) return;
      seen.add(key);

      mapped.push({
        tipo_local: tipoLocal || null,
        nome_local: nomeLocal,
        uf,
        cidade,
        latitude,
        longitude,
        supervisao: supervisao || null,
        coordenacao: coordenacao || null,
        origem: 'importar_relatorios',
        ativo: true,
      });
    });

    return mapped;
  }

  async function importarPontosEmbarqueDaPlanilha(file, opts) {
    const pontos = await readPontosEmbarqueFromFile(file);
    if (!pontos.length) {
      throw new Error('A planilha de pontos de embarque não possui linhas válidas. Cabeçalhos esperados: Tipo do Local, Local, UF, Cidade, Latitude, Longitude, Supervisão e Coordenação.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < pontos.length; i += batchSize) {
      const batch = pontos.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_pontos_embarque')
        .upsert(batch, { onConflict: 'nome_local,cidade,uf' });
      if (error) throw new Error(error.message || 'Falha ao gravar pontos de embarque no Supabase.');
      total += batch.length;
    }

    const cidades = new Set(pontos.map((ponto) => `${ponto.cidade}/${ponto.uf}`)).size;
    const supervisoes = new Set(pontos.map((ponto) => ponto.supervisao).filter(Boolean)).size;
    return { total_linhas: pontos.length, importados: total, cidades, supervisoes };
  }


  function colaboradorNomeChave(nome) {
    return String(nome || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, ' ')
      .trim()
      .toUpperCase();
  }

  async function readColaboradoresBaseFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
    const mapped = [];
    const seen = new Set();

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
      if (!rows?.length) continue;

      rows.forEach((row) => {
        const nome = String(pickValue(row, ['Nome', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
        const nomeChave = colaboradorNomeChave(nome);
        const latitude = normalizeNumberBr(pickValue(row, ['Latitude', 'Lat']));
        const longitude = normalizeNumberBr(pickValue(row, ['Longitude', 'Lng', 'Long']));
        const telefone = String(pickValue(row, ['Telefone', 'Telefono', 'Whatsapp', 'WhatsApp']) || '').trim();
        const email = String(pickValue(row, ['Email', 'E-mail', 'E-mail Pessoal', 'Email Pessoal']) || '').trim();
        const rua = String(pickValue(row, ['Rua', 'Endereço', 'Endereco', 'Logradouro']) || '').trim();
        const bairro = String(pickValue(row, ['Bairro']) || '').trim();
        const cidade = String(pickValue(row, ['Cidade', 'Município', 'Municipio']) || '').trim();
        const uf = String(pickValue(row, ['UF', 'Estado']) || '').trim().toUpperCase().slice(0, 2);
        const pais = String(pickValue(row, ['Pais', 'País']) || 'Brasil').trim() || 'Brasil';
        const tipoRaw = String(pickValue(row, ['Tipo', 'Tipo Mão de Obra', 'Tipo Mao de Obra', 'Mão de Obra', 'Mao de Obra']) || '').trim();
        const tipoNorm = tipoRaw
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase();
        const tipoMaoObra = tipoNorm.includes('diar') ? 'diarista' : 'efetivo';
        const valorDiaria = normalizeNumberBr(pickValue(row, ['Diária', 'Diaria', 'Valor Diária', 'Valor Diaria']));
        const valorAlimentacao = normalizeNumberBr(pickValue(row, ['Alimentação', 'Alimentacao', 'Almoço', 'Almoco']));

        if (!nome || !nomeChave) return;
        if (!Number.isFinite(Number(latitude)) || !Number.isFinite(Number(longitude))) return;
        if (seen.has(nomeChave)) return;
        seen.add(nomeChave);

        mapped.push({
          nome,
          nome_chave: nomeChave,
          latitude,
          longitude,
          telefone: telefone || null,
          email: email || null,
          rua: rua || null,
          bairro: bairro || null,
          cidade_base: cidade || null,
          uf_base: uf || null,
          pais: pais || 'Brasil',
          // A planilha de GPS dos colaboradores não possui coluna de tipo.
          // Para respeitar o CHECK do Supabase, grava sempre em minúsculo: efetivo ou diarista.
          // Depois o tipo real pode ser enriquecido pelo cadastro/base de colaboradores.
          tipo_mao_obra: tipoMaoObra,
          valor_diaria: valorDiaria,
          valor_alimentacao: valorAlimentacao ?? 30,
          origem: 'importar_relatorios_endereco_colaborador',
          ativo: true,
        });
      });
    }

    return mapped;
  }

  async function importarColaboradoresBaseDaPlanilha(file, opts) {
    const colaboradores = await readColaboradoresBaseFromFile(file);
    if (!colaboradores.length) {
      throw new Error('A planilha de endereço dos colaboradores não possui linhas válidas. Cabeçalhos esperados: Nome, Latitude, Longitude, Telefono/Telefone, Email, Rua, Bairro, Cidade, UF e Pais.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < colaboradores.length; i += batchSize) {
      const batch = colaboradores.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_colaborador_base')
        .upsert(batch, { onConflict: 'nome_chave' });
      if (error) throw new Error(error.message || 'Falha ao gravar endereços dos colaboradores no Supabase.');
      total += batch.length;
    }

    const cidades = new Set(colaboradores.map((c) => `${c.cidade_base || ''}/${c.uf_base || ''}`).filter((v) => v !== '/')).size;
    const ufs = new Set(colaboradores.map((c) => c.uf_base).filter(Boolean)).size;
    return { total_linhas: colaboradores.length, importados: total, cidades, ufs };
  }


  function auditoriaImportHash(row) {
    const base = [
      pickValue(row, ['Classificador']),
      pickValue(row, ['O.S', 'OS']),
      pickValue(row, ['Placa']),
      pickValue(row, ['Data Resultado', 'Data da Class.', 'Data da Classificacao', 'Data da Classificação']),
      pickValue(row, ['Motivo da recusa', 'Motivo Recusa']),
      pickValue(row, ['Resultado']),
    ].map((v) => colaboradorNomeChave(v)).join('|');
    return base || String(Date.now());
  }

  function inferAuditoriaImpacto(resultado, motivoRecusa, diferenca, descontoKg) {
    const res = normalizeHeader(resultado || '');
    const motivo = normalizeHeader(motivoRecusa || '');
    const diff = Math.abs(Number(diferenca || 0));
    const desconto = Math.abs(Number(descontoKg || 0));
    if (res.includes('produto padrao') || res.includes('padrão')) return { impacto: 0, severidade: 'baixa', tipo: 'Produto padrão' };
    if (res.includes('desconto') || desconto > 0) {
      const impacto = Math.min(35, Math.max(8, 8 + diff * 2 + Math.min(desconto / 1500, 10)));
      return { impacto: Math.round(impacto * 100) / 100, severidade: impacto >= 18 ? 'alta' : 'media', tipo: 'Desconto' };
    }
    if (motivo) return { impacto: 6, severidade: 'media', tipo: 'Apontamento' };
    return { impacto: 0, severidade: 'baixa', tipo: 'Auditoria' };
  }

  async function readAuditoriasOperacionalFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const preferred = workbook.SheetNames.find((name) => normalizeHeader(name).includes('unificada'))
      || workbook.SheetNames.find((name) => normalizeHeader(name).includes('descritiva'))
      || workbook.SheetNames[0];
    const sheet = workbook.Sheets[preferred];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    const mapped = [];
    const seen = new Set();

    rows.forEach((row) => {
      const nome = String(pickValue(row, ['Classificador', 'Colaborador', 'Funcionário', 'Funcionario']) || '').trim();
      const nomeChave = colaboradorNomeChave(nome);
      if (!nome || !nomeChave) return;

      const resultado = String(pickValue(row, ['Resultado']) || '').trim();
      const motivo = String(pickValue(row, ['Motivo da recusa', 'Motivo Recusa']) || '').trim();
      const diferenca = normalizeNumberBr(pickValue(row, ['Diferença', 'Diferenca']));
      const descontoKg = normalizeNumberBr(pickValue(row, ['Desconto Kg', 'Desconto'])) || 0;
      const impacto = inferAuditoriaImpacto(resultado, motivo, diferenca, descontoKg);
      const importHash = auditoriaImportHash(row);
      if (seen.has(importHash)) return;
      seen.add(importHash);

      mapped.push({
        import_hash: importHash,
        nome_colaborador: nome,
        nome_chave: nomeChave,
        tipo_funcionario: String(pickValue(row, ['Tipo Funcionario', 'Tipo Funcionário']) || '').trim() || null,
        data_evento: toIsoDate(pickValue(row, ['Data Resultado', 'Data Abertura', 'Data da Class.', 'Data da Classificacao', 'Data da Classificação'])),
        data_classificacao: toIsoDate(pickValue(row, ['Data da Class.', 'Data da Classificacao', 'Data da Classificação'])),
        referencia: String(pickValue(row, ['Referência', 'Referencia']) || '').trim() || null,
        uf_destino: String(pickValue(row, ['UF Dest.', 'UF Dest', 'UF Destino']) || '').trim().toUpperCase().slice(0, 2) || null,
        cidade_destino: String(pickValue(row, ['Cid. Dest.', 'Cid Dest', 'Cidade Destino']) || '').trim() || null,
        destino: String(pickValue(row, ['Destino']) || '').trim() || null,
        placa: String(pickValue(row, ['Placa']) || '').trim() || null,
        os: String(pickValue(row, ['O.S', 'OS']) || '').trim() || null,
        contrato: String(pickValue(row, ['Contrato']) || '').trim() || null,
        nf: String(pickValue(row, ['N.F.', 'NF']) || '').trim() || null,
        produto: String(pickValue(row, ['Produto']) || '').trim() || null,
        servico: String(pickValue(row, ['Serviço', 'Servico']) || '').trim() || null,
        peso_kg: normalizeNumberBr(pickValue(row, ['Peso (Kg)', 'Peso Kg', 'Peso'])),
        cliente_nacional: String(pickValue(row, ['Cli. Nacional', 'Cliente Nacional']) || '').trim() || null,
        cliente_regional: String(pickValue(row, ['Cli. Regional', 'Cliente Regional']) || '').trim() || null,
        cliente_final: String(pickValue(row, ['Cli. Final', 'Cliente Final']) || '').trim() || null,
        estado_embarque: String(pickValue(row, ['Est. Embarq', 'Estado Embarque']) || '').trim().toUpperCase().slice(0, 2) || null,
        cidade_embarque: String(pickValue(row, ['Cid. Embarq', 'Cidade Embarque']) || '').trim() || null,
        local_embarque: String(pickValue(row, ['Local Embarque']) || '').trim() || null,
        coordenacao: String(pickValue(row, ['Coordenação', 'Coordenacao']) || '').trim() || null,
        supervisao: String(pickValue(row, ['Supervisão', 'Supervisao']) || '').trim() || null,
        auditor: String(pickValue(row, ['Auditor']) || '').trim() || null,
        motivo_recusa: motivo || null,
        resultado_origem: String(pickValue(row, ['Result. Origem', 'Resultado Origem']) || '').trim() || null,
        resultado_recusa: String(pickValue(row, ['Result. Recusa', 'Resultado Recusa']) || '').trim() || null,
        resultado_auditoria: String(pickValue(row, ['Result. Auditoria', 'Resultado Auditoria']) || '').trim() || null,
        resultado: resultado || null,
        diferenca,
        desconto_kg: descontoKg,
        tipo_evento: impacto.tipo,
        severidade: impacto.severidade,
        score_impacto: impacto.impacto,
        descricao: [resultado, motivo].filter(Boolean).join(' · ') || null,
        origem: 'importar_relatorios_auditoria',
        ativo: true,
      });
    });

    return mapped;
  }

  async function importarAuditoriasOperacionalDaPlanilha(file, opts) {
    const auditorias = await readAuditoriasOperacionalFromFile(file);
    if (!auditorias.length) {
      throw new Error('A planilha de auditorias não possui linhas válidas. Cabeçalhos esperados: Classificador, Data Resultado, Resultado e campos de embarque/auditoria.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < auditorias.length; i += batchSize) {
      const batch = auditorias.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_auditoria_colaborador')
        .upsert(batch, { onConflict: 'import_hash' });
      if (error) throw new Error(error.message || 'Falha ao gravar auditorias no Supabase.');
      total += batch.length;
    }

    const colaboradores = new Set(auditorias.map((a) => a.nome_chave).filter(Boolean)).size;
    const descontos = auditorias.filter((a) => normalizeHeader(a.resultado || '').includes('desconto') || Number(a.desconto_kg || 0) > 0).length;
    const padrao = auditorias.filter((a) => normalizeHeader(a.resultado || '').includes('padrao')).length;
    return { total_linhas: auditorias.length, importados: total, colaboradores, descontos, produto_padrao: padrao };
  }


  const PATRIMONIO_COL = {
    patrimonioCodigo: ['Patrimônio', 'Patrimonio'],
    coordenacao: ['Coordenação', 'Coordenacao'],
    supervisao: ['Supervisão', 'Supervisao'],
    funcionario: ['Funcionário', 'Funcionario'],
    identificacao: ['Identificação', 'Identificacao'],
    categoria: ['Categoria'],
    marca: ['Marca'],
    modelo: ['Modelo'],
    dataAquisicao: ['Data de Aquisição', 'Data de Aquisicao'],
    dataRegistro: ['Data de Registro'],
    situacao: ['Situação', 'Situacao'],
    ultimaLeitura: ['Ultima Leitura', 'Última Leitura'],
    diasSemLeitura: ['Dias sem Leitura']
  };

  function mapPatrimonioRow(row, importacaoId, dataUpload = null) {
    const patrimonioCodigo = normalizeText(pickValue(row, PATRIMONIO_COL.patrimonioCodigo));
    return {
      importacao_id: importacaoId,
      data_upload: dataUpload || null,
      patrimonio_codigo: patrimonioCodigo ? String(patrimonioCodigo).trim().toUpperCase() : null,
      coordenacao: normalizeText(pickValue(row, PATRIMONIO_COL.coordenacao)),
      supervisao: normalizeText(pickValue(row, PATRIMONIO_COL.supervisao)),
      funcionario: normalizeText(pickValue(row, PATRIMONIO_COL.funcionario)),
      identificacao: normalizeText(pickValue(row, PATRIMONIO_COL.identificacao)),
      categoria: normalizeText(pickValue(row, PATRIMONIO_COL.categoria)),
      marca: normalizeText(pickValue(row, PATRIMONIO_COL.marca)),
      modelo: normalizeText(pickValue(row, PATRIMONIO_COL.modelo)),
      data_aquisicao: normalizeDateTimeExcel(pickValue(row, PATRIMONIO_COL.dataAquisicao)),
      data_registro: normalizeDateTimeExcel(pickValue(row, PATRIMONIO_COL.dataRegistro)),
      situacao: normalizeText(pickValue(row, PATRIMONIO_COL.situacao)),
      ultima_leitura: normalizeDateTimeExcel(pickValue(row, PATRIMONIO_COL.ultimaLeitura)),
      dias_sem_leitura: normalizeInteger(pickValue(row, PATRIMONIO_COL.diasSemLeitura)),
      hash_linha: patrimonioCodigo ? String(patrimonioCodigo).trim().toUpperCase() : null,
    };
  }

  async function readPatrimoniosFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const sheetName = workbook.SheetNames.find((name) => normalizeHeader(name).includes('patrimonio')) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true });
    if (!rows.length) throw new Error('A planilha de patrimônios está vazia.');
    const first = rows[0] || {};
    const missing = [];
    if (!hasAnyHeader(first, PATRIMONIO_COL.patrimonioCodigo)) missing.push('Patrimônio');
    if (!hasAnyHeader(first, PATRIMONIO_COL.funcionario)) missing.push('Funcionário');
    if (!hasAnyHeader(first, PATRIMONIO_COL.situacao)) missing.push('Situação');
    if (missing.length) throw new Error(`Planilha de patrimônios inválida. Cabeçalho(s) ausente(s): ${missing.join(', ')}.`);
    return { rows, sheetName };
  }

  async function importarPatrimoniosDaPlanilha(file, opts) {
    const { rows, sheetName } = await readPatrimoniosFromFile(file);
    const user = opts.user || opts.auth?.user || null;
    const userMeta = user?.user_metadata || {};
    const userName = userMeta.full_name || userMeta.name || user?.email || null;
    const dataUpload = new Date().toISOString();

    const { data: importacao, error: impError } = await opts.supabase
      .from('patrimonios_importacoes')
      .insert({
        nome_arquivo: file.name,
        data_upload: dataUpload,
        origem: 'importar_relatorios',
        status: 'processando',
        total_linhas: rows.length,
        total_importadas: 0,
        total_erros: 0,
        observacoes: `Importado pela Central de Importação · Aba: ${sheetName}`,
        criado_por: user?.id || null,
        criado_por_nome: userName,
      })
      .select('id')
      .single();
    if (impError) throw new Error(impError.message || 'Falha ao criar importação de patrimônios.');

    const mappedRaw = rows.map((row) => mapPatrimonioRow(row, importacao.id, dataUpload)).filter((row) => row.patrimonio_codigo);
    const unique = new Map();
    mappedRaw.forEach((row) => unique.set(row.patrimonio_codigo, row));
    const mapped = Array.from(unique.values());

    if (!mapped.length) throw new Error('Nenhuma linha válida encontrada na planilha de patrimônios.');

    const { error: limparError } = await opts.supabase.rpc('limpar_patrimonios_snapshot');
    if (limparError) throw new Error(limparError.message || 'Falha ao limpar snapshot de patrimônios.');

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      const { error } = await opts.supabase.from('patrimonios_snapshot').upsert(batch, { onConflict: 'patrimonio_codigo' });
      if (error) throw new Error(error.message || 'Falha ao gravar patrimônios no Supabase.');
      total += batch.length;
    }

    for (let i = 0; i < mapped.length; i += batchSize) {
      const batch = mapped.slice(i, i + batchSize);
      const { error } = await opts.supabase.from('patrimonios_historico_leituras').insert(batch);
      if (error) throw new Error(error.message || 'Falha ao gravar histórico de patrimônios no Supabase.');
    }

    let frotaPatrimonioSync = null;
    try {
      const { data: syncData, error: syncError } = await opts.supabase.rpc('sincronizar_frotas_veiculos_patrimonios');
      if (syncError) console.warn('[RELATORIOS] Falha ao associar patrimônios aos veículos:', syncError);
      else frotaPatrimonioSync = syncData || null;
    } catch (syncErr) {
      console.warn('[RELATORIOS] Falha ao associar patrimônios aos veículos:', syncErr);
    }

    const { error: updError } = await opts.supabase
      .from('patrimonios_importacoes')
      .update({
        status: 'concluido',
        total_importadas: total,
        total_erros: Math.max(rows.length - total, 0),
        observacoes: `Central de Importação · Aba: ${sheetName}`,
      })
      .eq('id', importacao.id);
    if (updError) throw new Error(updError.message || 'Falha ao concluir importação de patrimônios.');

    const veiculos = mapped.filter((r) => normalizeHeader(r.categoria).includes('veiculo') || extractPlateFromText(r.identificacao)).length;
    return { total_linhas: rows.length, importados: total, veiculos, aba: sheetName, frotas_associadas: frotaPatrimonioSync };
  }

  function buildFrotasExcessoHash(row) {
    return [row.data_evento || '', row.hora_evento || '', row.placa || '', row.velocidade || '', row.latitude || '', row.longitude || '']
      .map((v) => normalizeHeader(String(v)))
      .join('|')
      .slice(0, 500);
  }

  async function loadPatrimonioVeiculosMap(opts) {
    const map = new Map();
    const pageSize = 1000;
    let from = 0;
    while (from < 10000) {
      const { data, error } = await opts.supabase
        .from('patrimonios_snapshot')
        .select('id,patrimonio_codigo,coordenacao,supervisao,funcionario,identificacao,categoria,situacao,ultima_leitura')
        .range(from, from + pageSize - 1);
      if (error) {
        console.warn('[RELATORIOS] Não foi possível carregar patrimônios para cruzamento:', error);
        break;
      }
      const rows = Array.isArray(data) ? data : [];
      rows.forEach((r) => {
        const plate = extractPlateFromText(r.identificacao);
        if (!plate) return;
        const categoria = normalizeHeader(r.categoria);
        const situacao = normalizeHeader(r.situacao);
        if (categoria && !categoria.includes('veiculo')) return;
        if (situacao && !situacao.includes('ativo')) return;
        map.set(plate, r);
      });
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return map;
  }

  async function readFrotasExcessoFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['Data', 'Hora', 'Alerta', 'Placa', 'Velocidade']);
      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const normalized = headers.map(normalizeHeader);
      const hasStructure = normalized.includes('data') && normalized.includes('hora') && normalized.includes('placa') && normalized.includes('velocidade');
      if (!hasStructure) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const obj = {};
        headers.forEach((header, index) => { obj[header] = row?.[index] ?? ''; });
        const placa = normalizePlate(pickValue(obj, ['Placa', 'Plate']));
        const dataEvento = toIsoDate(pickValue(obj, ['Data', 'Date']));
        const velocidade = normalizeNumberBr(pickValue(obj, ['Velocidade', 'Speed']));
        if (!placa || !dataEvento || !velocidade) return;

        const registro = {
          data_evento: dataEvento,
          hora_evento: parseTimeText(pickValue(obj, ['Hora', 'Time'])),
          alerta: normalizeText(pickValue(obj, ['Alerta', 'Alert'])) || 'Excesso de velocidade',
          ativo_rastreador: normalizeText(pickValue(obj, ['Ativo', 'Veículo', 'Veiculo', 'Vehicle'])),
          placa,
          motorista_planilha: normalizeText(pickValue(obj, ['Motorista', 'Condutor', 'Driver'])),
          velocidade,
          endereco: normalizeText(pickValue(obj, ['Endereco', 'Endereço', 'Address'])),
          latitude: normalizeNumberBr(pickValue(obj, ['Latitude', 'Lat'])),
          longitude: normalizeNumberBr(pickValue(obj, ['Longitude', 'Long', 'Lng'])),
          mapa_url: normalizeText(pickValue(obj, ['Ver mapa', 'Mapa', 'Map'])),
          arquivo_nome: file.name,
          origem: 'importar_relatorios',
          status_notificacao: 'PENDENTE',
        };
        registro.import_hash = buildFrotasExcessoHash(registro);
        mapped.push(registro);
      });
    }

    return mapped;
  }

  async function importarFrotasExcessoVelocidadeDaPlanilha(file, opts) {
    const registros = await readFrotasExcessoFromFile(file);
    if (!registros.length) {
      throw new Error('A planilha de excesso de velocidade não possui linhas válidas. Cabeçalhos esperados: Data, Hora, Alerta, Ativo, Placa, Motorista, Velocidade, Endereço, Latitude e Longitude.');
    }

    const patrimonioMap = await loadPatrimonioVeiculosMap(opts);
    const cruzados = registros.map((r) => {
      const pat = patrimonioMap.get(r.placa);
      return {
        ...r,
        patrimonio_id: pat?.id || null,
        patrimonio_codigo: pat?.patrimonio_codigo || null,
        patrimonio_funcionario: pat?.funcionario || null,
        patrimonio_identificacao: pat?.identificacao || null,
        coordenacao: pat?.coordenacao || null,
        supervisao: pat?.supervisao || null,
        status_cruzamento: pat?.funcionario ? 'MOTORISTA_IDENTIFICADO' : 'PENDENTE_CONFERENCIA',
      };
    });

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < cruzados.length; i += batchSize) {
      const batch = cruzados.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('frotas_excesso_velocidade')
        .upsert(batch, { onConflict: 'import_hash' });
      if (error) throw new Error(error.message || 'Falha ao gravar excessos de velocidade. Rode o SQL do módulo Frotas antes.');
      total += batch.length;
    }

    const identificados = cruzados.filter((r) => r.patrimonio_funcionario).length;
    const placas = new Set(cruzados.map((r) => r.placa).filter(Boolean)).size;
    const motoristas = new Set(cruzados.map((r) => normalizeHeader(r.patrimonio_funcionario || r.motorista_planilha || '')).filter(Boolean)).size;
    const periodos = cruzados.map((r) => r.data_evento).filter(Boolean).sort();
    return {
      total_linhas: cruzados.length,
      importados: total,
      placas,
      motoristas,
      identificados,
      pendentes: total - identificados,
      periodo_inicio: periodos[0] || null,
      periodo_fim: periodos[periodos.length - 1] || null,
    };
  }


  function pickHeaderIndex(headers, names) {
    for (const name of names || []) {
      const exact = (headers || []).findIndex((h) => headerKey(h) === headerKey(name));
      if (exact >= 0) return exact;
    }
    for (const name of names || []) {
      const fuzzy = (headers || []).findIndex((h) => headerMatches(h, name));
      if (fuzzy >= 0) return fuzzy;
    }
    return -1;
  }

  async function readResultadoDiarioRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];
    const dates = [];
    const diagnostics = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['Data', 'Coordenação', 'Toneladas']);
      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const iOs = pickHeaderIndex(headers, ['O.S.', 'OS', 'Ordem de Serviço']);
      const iContrato = pickHeaderIndex(headers, ['Contrato']);
      const iProduto = pickHeaderIndex(headers, ['Produto']);
      const iData = pickHeaderIndex(headers, ['Data', 'Dt Data']);
      const iFuncionario = pickHeaderIndex(headers, ['Funcionário', 'Funcionario', 'Classificador']);
      const iCoordenacao = pickHeaderIndex(headers, ['Coordenação', 'Coordenacao', 'Regional']);
      const iSupervisao = pickHeaderIndex(headers, ['Supervisão', 'Supervisao']);
      const iCliNac = pickHeaderIndex(headers, ['Cliente Nacional', 'Cli. Nacional']);
      const iCliReg = pickHeaderIndex(headers, ['Cliente Regional', 'Cli. Regional']);
      const iCliFinal = pickHeaderIndex(headers, ['Cliente Final', 'Cli. Final']);
      const iLocal = pickHeaderIndex(headers, ['Local de Embarque', 'Local Embarque']);
      const iDestino = pickHeaderIndex(headers, ['Destino']);
      const iCargas = pickHeaderIndex(headers, ['Cargas', 'Carga']);
      const iTon = pickHeaderIndex(headers, ['Toneladas', 'Tons', 'Volume Classificado', 'Peso Toneladas']);
      const iValorTon = pickHeaderIndex(headers, ['R$/Ton', 'Valor Ton', 'Valor/Ton']);
      const iCadencia = pickHeaderIndex(headers, ['Cadência', 'Cadencia']);
      const iTonsCad = pickHeaderIndex(headers, ['Tons Cadência', 'Tons Cadencia']);
      const iEmbarcado = pickHeaderIndex(headers, ['Embarcado', 'Volume Embarcado']);
      const iValorEmbarcado = pickHeaderIndex(headers, ['Valor Embarcado']);
      const iValorAfla = pickHeaderIndex(headers, ['Valor Afla']);
      const iTotalAfla = pickHeaderIndex(headers, ['Total Afla']);
      const iValorVomitoxina = pickHeaderIndex(headers, ['Valor Vomitoxina']);
      const iTotalVomitoxina = pickHeaderIndex(headers, ['Total Vomitoxina']);
      const iValorFalling = pickHeaderIndex(headers, ['Valor Falling Number']);
      const iTotalFalling = pickHeaderIndex(headers, ['Total Falling Number']);
      const iValorIntacta = pickHeaderIndex(headers, ['Valor Intacta']);
      const iTotalIntacta = pickHeaderIndex(headers, ['Total Intacta']);
      const iValorGmo = pickHeaderIndex(headers, ['Valor GMO']);
      const iTotalGmo = pickHeaderIndex(headers, ['Total GMO']);
      const iTotalEmbTeste = pickHeaderIndex(headers, ['Total Embarcado + Teste', 'Total Embarcado Mais Teste', 'Total Embarcado']);
      const iRemanescente = pickHeaderIndex(headers, ['Remanescente']);
      const iMotivoNhe = pickHeaderIndex(headers, ['Motivo NHE']);
      const iObsNhe = pickHeaderIndex(headers, ['Observações NHE', 'Observacoes NHE']);
      const iSituacao = pickHeaderIndex(headers, ['Situação', 'Situacao']);
      const iObs = pickHeaderIndex(headers, ['Observações', 'Observacoes']);

      diagnostics.push({ sheetName, headerRow: headerRow + 1, headers: headers.slice(0, 40), indexes: { iData, iCoordenacao, iTon, iEmbarcado, iTotalEmbTeste, iCargas } });
      if (iData < 0 || iCoordenacao < 0 || iTon < 0 || iEmbarcado < 0) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const data = toIsoDate(row?.[iData]);
        const coordenacao = normalizeText(row?.[iCoordenacao]);
        if (!data || !coordenacao) return;
        const tons = iTon >= 0 ? normalizeNumberBr(row?.[iTon]) : null;
        const embarcadoBase = iEmbarcado >= 0 ? normalizeNumberBr(row?.[iEmbarcado]) : null;
        const totalEmbTeste = iTotalEmbTeste >= 0 ? normalizeNumberBr(row?.[iTotalEmbTeste]) : null;
        const cargas = iCargas >= 0 ? normalizeNumberBr(row?.[iCargas]) : null;
        const hasMetric = [tons, embarcadoBase, totalEmbTeste, cargas].some((v) => v !== null);
        if (!hasMetric) return;
        dates.push(data);
        mapped.push({
          file_name: file.name,
          os: iOs >= 0 ? normalizeText(row?.[iOs]) : null,
          contrato: iContrato >= 0 ? normalizeText(row?.[iContrato]) : null,
          produto: iProduto >= 0 ? normalizeText(row?.[iProduto]) : null,
          data,
          funcionario: iFuncionario >= 0 ? normalizeText(row?.[iFuncionario]) : null,
          coordenacao,
          supervisao: iSupervisao >= 0 ? normalizeText(row?.[iSupervisao]) : null,
          cliente_nacional: iCliNac >= 0 ? normalizeText(row?.[iCliNac]) : null,
          cliente_regional: iCliReg >= 0 ? normalizeText(row?.[iCliReg]) : null,
          cliente_final: iCliFinal >= 0 ? normalizeText(row?.[iCliFinal]) : null,
          local_embarque: iLocal >= 0 ? normalizeText(row?.[iLocal]) : null,
          destino: iDestino >= 0 ? normalizeText(row?.[iDestino]) : null,
          cargas: cargas || 0,
          toneladas: tons || 0,
          valor_ton: iValorTon >= 0 ? normalizeNumberBr(row?.[iValorTon]) || 0 : 0,
          cadencia: iCadencia >= 0 ? normalizeNumberBr(row?.[iCadencia]) || 0 : 0,
          tons_cadencia: iTonsCad >= 0 ? normalizeNumberBr(row?.[iTonsCad]) || 0 : 0,
          // Regra oficial do DRE:
          // Toneladas = Tons sem cadência / Volume Classificado
          // Embarcado = Tons com cadência / Volume Embarcado + NHE + cad
          // Total Embarcado + Teste fica salvo apenas para auditoria, não alimenta o DRE.
          embarcado: embarcadoBase ?? 0,
          valor_embarcado: iValorEmbarcado >= 0 ? normalizeNumberBr(row?.[iValorEmbarcado]) || 0 : 0,
          valor_afla: iValorAfla >= 0 ? normalizeNumberBr(row?.[iValorAfla]) || 0 : 0,
          total_afla: iTotalAfla >= 0 ? normalizeNumberBr(row?.[iTotalAfla]) || 0 : 0,
          valor_vomitoxina: iValorVomitoxina >= 0 ? normalizeNumberBr(row?.[iValorVomitoxina]) || 0 : 0,
          total_vomitoxina: iTotalVomitoxina >= 0 ? normalizeNumberBr(row?.[iTotalVomitoxina]) || 0 : 0,
          valor_falling_number: iValorFalling >= 0 ? normalizeNumberBr(row?.[iValorFalling]) || 0 : 0,
          total_falling_number: iTotalFalling >= 0 ? normalizeNumberBr(row?.[iTotalFalling]) || 0 : 0,
          valor_intacta: iValorIntacta >= 0 ? normalizeNumberBr(row?.[iValorIntacta]) || 0 : 0,
          total_intacta: iTotalIntacta >= 0 ? normalizeNumberBr(row?.[iTotalIntacta]) || 0 : 0,
          valor_gmo: iValorGmo >= 0 ? normalizeNumberBr(row?.[iValorGmo]) || 0 : 0,
          total_gmo: iTotalGmo >= 0 ? normalizeNumberBr(row?.[iTotalGmo]) || 0 : 0,
          total_embarcado_mais_teste: totalEmbTeste || 0,
          remanescente: iRemanescente >= 0 ? normalizeNumberBr(row?.[iRemanescente]) || 0 : 0,
          motivo_nhe: iMotivoNhe >= 0 ? normalizeText(row?.[iMotivoNhe]) : null,
          observacoes_nhe: iObsNhe >= 0 ? normalizeText(row?.[iObsNhe]) : null,
          situacao: iSituacao >= 0 ? normalizeText(row?.[iSituacao]) : null,
          observacoes: iObs >= 0 ? normalizeText(row?.[iObs]) : null,
        });
      });
    }

    const uniqueDates = [...new Set(dates)].sort();
    return {
      rows: mapped,
      period: uniqueDates.length ? { inicio: uniqueDates[0], fim: uniqueDates[uniqueDates.length - 1], totalDatas: uniqueDates.length } : null,
      diagnostics,
    };
  }

  async function importarResultadoDiarioDaPlanilha(file, opts, periodFromEntry = null) {
    const { rows, period, diagnostics } = await readResultadoDiarioRowsFromFile(file);
    const finalPeriod = period || periodFromEntry;
    if (!rows.length) {
      const detail = (diagnostics || []).map((d) => `${d.sheetName} linha ${d.headerRow}: ${d.headers.join(' | ')}`).join(' || ');
      throw new Error(`A planilha de Resultado Diário não possui linhas válidas. Cabeçalhos esperados: Data, Coordenação, Toneladas e Embarcado. Detectado: ${detail || 'nenhum cabeçalho'}`);
    }

    if (finalPeriod?.inicio && finalPeriod?.fim) {
      const { error: delError } = await opts.supabase
        .from('relatorio_resultado_diario')
        .delete()
        .gte('data', finalPeriod.inicio)
        .lte('data', finalPeriod.fim);
      if (delError) throw new Error(delError.message || 'Falha ao limpar período anterior do Resultado Diário.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await opts.supabase.from('relatorio_resultado_diario').insert(batch);
      if (error) throw new Error(error.message || 'Falha ao gravar Resultado Diário no Supabase.');
      total += batch.length;
    }

    const regionais = new Set(rows.map((r) => normalizeHeader(r.coordenacao)).filter(Boolean)).size;
    const totalTons = rows.reduce((acc, r) => acc + Number(r.toneladas || 0), 0);
    const totalEmbarcado = rows.reduce((acc, r) => acc + Number(r.embarcado || 0), 0);
    const totalCargas = rows.reduce((acc, r) => acc + Number(r.cargas || 0), 0);
    return {
      total_linhas: rows.length,
      importados: total,
      regionais,
      toneladas: totalTons,
      embarcado: totalEmbarcado,
      cargas: totalCargas,
      periodo_inicio: finalPeriod?.inicio || null,
      periodo_fim: finalPeriod?.fim || null,
    };
  }


  async function readProducaoDiariaRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];
    const dates = [];
    const diagnostics = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['Data', 'Funcionário', 'Tons']);
      const headers = (rows[headerRow] || []).map((h, index) => String(h || `COLUNA_${index + 1}`).trim());
      const iData = pickHeaderIndex(headers, ['Data', 'Data Produção', 'Data Producao', 'Data Referência', 'Data Referencia']);
      const iCoord = pickHeaderIndex(headers, ['Coordenação', 'Coordenacao', 'Regional']);
      const iSupervisao = pickHeaderIndex(headers, ['Supervisão', 'Supervisao']);
      const iFuncionario = pickHeaderIndex(headers, ['Funcionário', 'Funcionario', 'Colaborador', 'Nome']);
      const iTipo = pickHeaderIndex(headers, ['Tipo']);
      const iOs = pickHeaderIndex(headers, ['O.S.', 'O.S', 'OS', 'Ordem de Serviço', 'Ordem de Servico']);
      const iCliente = pickHeaderIndex(headers, ['Cliente']);
      const iServico = pickHeaderIndex(headers, ['Serviço', 'Servico']);
      const iCidade = pickHeaderIndex(headers, ['Cidade']);
      const iLocal = pickHeaderIndex(headers, ['Local de Embarque', 'Local Embarque', 'Embarque']);
      const iCheckin = pickHeaderIndex(headers, ['Check-in', 'Checkin', 'Entrada']);
      const iCheckout = pickHeaderIndex(headers, ['Check-out', 'Checkout', 'Saída', 'Saida']);
      const iCargas = pickHeaderIndex(headers, ['Cargas', 'Carga']);
      const iTons = pickHeaderIndex(headers, ['Tons', 'Toneladas', 'Tonelada']);

      diagnostics.push({ sheetName, headerRow: headerRow + 1, headers: headers.slice(0, 40), indexes: { iData, iFuncionario, iTons, iCargas, iOs } });
      if (iData < 0 || iFuncionario < 0 || (iTons < 0 && iCargas < 0)) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const data = toIsoDate(row?.[iData]) || parseDataFromSheetName(sheetName);
        const funcionario = iFuncionario >= 0 ? normalizeText(row?.[iFuncionario]) : null;
        if (!data || !funcionario) return;
        const tons = iTons >= 0 ? normalizeNumberBr(row?.[iTons]) : null;
        const cargas = iCargas >= 0 ? normalizeNumberBr(row?.[iCargas]) : null;
        if (tons === null && cargas === null) return;
        dates.push(data);
        mapped.push({
          data_referencia: data,
          data,
          coordenacao: iCoord >= 0 ? normalizeText(row?.[iCoord]) : null,
          supervisao: iSupervisao >= 0 ? normalizeText(row?.[iSupervisao]) : null,
          funcionario,
          tipo: iTipo >= 0 ? normalizeText(row?.[iTipo]) : null,
          os: iOs >= 0 ? normalizeText(row?.[iOs]) : null,
          cliente: iCliente >= 0 ? normalizeText(row?.[iCliente]) : null,
          servico: iServico >= 0 ? normalizeText(row?.[iServico]) : null,
          cidade: iCidade >= 0 ? normalizeText(row?.[iCidade]) : null,
          local_embarque: iLocal >= 0 ? normalizeText(row?.[iLocal]) : null,
          checkin: iCheckin >= 0 ? normalizeText(row?.[iCheckin]) : null,
          checkout: iCheckout >= 0 ? normalizeText(row?.[iCheckout]) : null,
          cargas: cargas ?? 0,
          tons: tons ?? 0,
        });
      });
    }

    const uniqueDates = [...new Set(dates)].sort();
    return {
      rows: mapped,
      period: uniqueDates.length ? { inicio: uniqueDates[0], fim: uniqueDates[uniqueDates.length - 1], totalDatas: uniqueDates.length } : null,
      diagnostics,
    };
  }

  async function detectarProducaoDiariaPorConteudo(file, detected) {
    if (!['outros', 'producao'].includes(detected?.tipo)) return detected;
    try {
      const res = await readProducaoDiariaRowsFromFile(file);
      if (res?.rows?.length) return { tipo: 'producao', titulo: 'Produção Diária' };
    } catch (_) {}
    return detected;
  }

  async function detectarHoteisPorConteudo(file, detected) {
    if (detected?.tipo !== 'outros') return detected;
    try {
      const linhas = await readSpreadsheetAsObjects(file);
      if (linhas.length) return { tipo: 'hoteis', titulo: 'Banco de Hotéis' };
    } catch (_) {}
    return detected;
  }

  async function readHospedagemDiariasRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const mapped = [];
    const dates = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['DATA', 'HOTEL', 'FUNCIONÁRIO']);
      const headers = (rows[headerRow] || []).map((h, i) => String(h || `COLUNA_${i + 1}`).trim());

      const iData = pickHeaderIndex(headers, ['DATA', 'Data', 'Data Hospedagem']);
      const iHotel = pickHeaderIndex(headers, ['HOTEL', 'Hotel', 'Nome Hotel']);
      const iSituacao = pickHeaderIndex(headers, ['SITUAÇÃO', 'Situação', 'SITUACAO', 'Situacao', 'Situação Pgto', 'Status Pgto']);

      // Exige DATA + HOTEL + SITUAÇÃO — distingue do cadastro de hotéis
      if (iData < 0 || iHotel < 0 || iSituacao < 0) continue;

      const iFuncionario = pickHeaderIndex(headers, ['FUNCIONÁRIO', 'Funcionário', 'Funcionario', 'FUNCIONARIO']);
      // Segunda ocorrência de FUNCIONÁRIO = status (STAY / CHECKOUT)
      const normFunc = headerKey('funcionario');
      let iStatus = -1;
      let funcCount = 0;
      for (let ci = 0; ci < headers.length; ci++) {
        if (headerKey(headers[ci]) === normFunc) {
          funcCount++;
          if (funcCount === 2) { iStatus = ci; break; }
        }
      }

      const iRegional    = pickHeaderIndex(headers, ['REGIONAL', 'Regional']);
      const iCidade      = pickHeaderIndex(headers, ['CIDADE', 'Cidade']);
      const iLocalizacao = pickHeaderIndex(headers, ['LOCALIZAÇÃO', 'Localização', 'LOCALIZACAO', 'Localizacao', 'Link Maps']);
      const iTipoDiaria  = pickHeaderIndex(headers, ['DIÁRIA', 'Diária', 'DIARIA', 'Diaria', 'Tipo Diária', 'Tipo Quarto']);
      const iValor       = pickHeaderIndex(headers, ['VALOR', 'Valor', 'Valor Diária', 'Valor Diaria', 'Vlr Diaria']);
      const iLocal       = pickHeaderIndex(headers, ['LOCAL', 'Local', 'Local Trabalho', 'Local de Trabalho']);
      const iCliente     = pickHeaderIndex(headers, ['CLIENTE', 'Cliente']);
      const iSaldo       = pickHeaderIndex(headers, ['SALDO', 'Saldo']);
      const iNfs         = pickHeaderIndex(headers, ['NFS', 'NF', 'Nota Fiscal', 'N.F.S', 'NF-e']);
      const iObservacao  = pickHeaderIndex(headers, ['OBSERVAÇÃO', 'Observação', 'OBSERVACAO', 'Observacao', 'OBS', 'Obs']);

      rows.slice(headerRow + 1).forEach((row) => {
        const data       = toIsoDate(row?.[iData]);
        const hotel      = String(row?.[iHotel] || '').trim();
        const funcionario = iFuncionario >= 0 ? String(row?.[iFuncionario] || '').trim() : '';
        if (!data || !hotel || !funcionario) return;

        dates.push(data);
        mapped.push({
          data,
          regional:      iRegional    >= 0 ? String(row?.[iRegional]    || '').trim() : null,
          cidade:        iCidade      >= 0 ? String(row?.[iCidade]      || '').trim() : null,
          funcionario,
          status:        iStatus      >= 0 ? String(row?.[iStatus]      || '').trim().toUpperCase() : null,
          hotel,
          localizacao:   iLocalizacao >= 0 ? String(row?.[iLocalizacao] || '').trim() : null,
          tipo_diaria:   iTipoDiaria  >= 0 ? String(row?.[iTipoDiaria]  || '').trim().toUpperCase() : null,
          valor_diaria:  iValor       >= 0 ? normalizeNumberBr(row?.[iValor])  : null,
          local_trabalho: iLocal      >= 0 ? String(row?.[iLocal]       || '').trim() : null,
          cliente:       iCliente     >= 0 ? String(row?.[iCliente]     || '').trim() : null,
          saldo:         iSaldo       >= 0 ? normalizeNumberBr(row?.[iSaldo])  : null,
          situacao_pgto: iSituacao    >= 0 ? String(row?.[iSituacao]    || '').trim() : null,
          nfs:           iNfs         >= 0 ? String(row?.[iNfs]         || '').trim() : null,
          observacao:    iObservacao  >= 0 ? String(row?.[iObservacao]  || '').trim() : null,
        });
      });
    }

    const uniqueDates = [...new Set(dates)].sort();
    return {
      rows: mapped,
      period: uniqueDates.length ? { inicio: uniqueDates[0], fim: uniqueDates[uniqueDates.length - 1] } : null,
    };
  }

  async function detectarHospedagemDiariasPorConteudo(file, detected) {
    if (detected?.tipo !== 'outros') return detected;
    try {
      const res = await readHospedagemDiariasRowsFromFile(file);
      if (res?.rows?.length) return { tipo: 'hospedagem_diarias', titulo: 'Diárias de Hospedagem · Produção' };
    } catch (_) {}
    return detected;
  }

  async function importarProducaoDiariaDaPlanilha(file, opts) {
    const { rows, period, diagnostics } = await readProducaoDiariaRowsFromFile(file);
    if (!rows.length) {
      const detail = (diagnostics || []).map((d) => `${d.sheetName} linha ${d.headerRow}: ${d.headers.join(' | ')}`).join(' || ');
      throw new Error(`A planilha de Produção Diária não possui linhas válidas. Cabeçalhos esperados: Data, Funcionário e Tons ou Cargas. Detectado: ${detail || 'nenhum cabeçalho'}`);
    }

    if (period?.inicio && period?.fim) {
      const { error: delError } = await opts.supabase
        .from('producao_snapshot')
        .delete()
        .gte('data', period.inicio)
        .lte('data', period.fim);
      if (delError) throw new Error(delError.message || 'Falha ao limpar período anterior da Produção Diária.');
    }

    const user = opts.user || opts.auth?.user || null;
    const { data: importacao, error: impError } = await opts.supabase
      .from('producao_importacoes')
      .insert({
        data_referencia: period?.fim || rows[0]?.data || null,
        arquivo_nome: file.name,
        origem: 'importar_relatorios_producao_diaria',
        importado_por: user?.id || null,
        status: 'processando',
        total_linhas: rows.length,
        observacoes: `Importado pelo menu Importar Relatórios${period?.inicio ? ` · ${period.inicio} a ${period.fim}` : ''}`,
      })
      .select()
      .single();
    if (impError) throw new Error(impError.message || 'Falha ao criar importação da Produção Diária.');

    const batchSize = 500;
    let total = 0;
    try {
      const withImport = rows.map((row) => ({ ...row, importacao_id: importacao.id }));
      for (let i = 0; i < withImport.length; i += batchSize) {
        const batch = withImport.slice(i, i + batchSize);
        const { error } = await opts.supabase.from('producao_snapshot').insert(batch);
        if (error) throw new Error(error.message || 'Falha ao gravar Produção Diária no Supabase.');
        total += batch.length;
      }
      await opts.supabase.from('producao_importacoes').update({ status: 'processado', total_linhas: total }).eq('id', importacao.id);
    } catch (err) {
      await opts.supabase.from('producao_importacoes').update({ status: 'erro' }).eq('id', importacao.id);
      throw err;
    }

    const colaboradores = new Set(rows.map((r) => normalizeHeader(r.funcionario)).filter(Boolean)).size;
    const totalTons = rows.reduce((acc, r) => acc + Number(r.tons || 0), 0);
    const totalCargas = rows.reduce((acc, r) => acc + Number(r.cargas || 0), 0);
    return {
      total_linhas: rows.length,
      importados: total,
      colaboradores,
      toneladas: totalTons,
      cargas: totalCargas,
      periodo_inicio: period?.inicio || null,
      periodo_fim: period?.fim || null,
      total_datas: period?.totalDatas || null,
    };
  }


  async function readOperacionalOsRowsFromFile(file) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const preferred = workbook.SheetNames.find((name) => {
      const key = normalizeHeader(name);
      return key.includes('os') || key.includes('lista');
    }) || workbook.SheetNames[0];
    const sheet = workbook.Sheets[preferred];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: true });
    const mapped = [];
    const datas = [];

    rows.forEach((row) => {
      const numero = String(pickValue(row, ['O.S.', 'O.S', 'OS', 'O S', 'Ordem de Serviço', 'Ordem de Servico']) || '').trim();
      if (!numero) return;
      const embarque = String(pickValue(row, ['Embarque', 'Ponto 1', 'Ponto1', 'Local Embarque', 'Local de Embarque']) || '').trim();
      const dataOs = toIsoDate(pickValue(row, ['Data', 'Data OS', 'Data O.S.', 'Data O.S'])) || null;
      if (dataOs) datas.push(dataOs);
      mapped.push({
        numero_os: numero,
        situacao: normalizeText(pickValue(row, ['Situação', 'Situacao'])),
        financeiro: normalizeText(pickValue(row, ['Financeiro'])),
        data_os: dataOs,
        servico: normalizeText(pickValue(row, ['Serviço', 'Servico'])),
        cliente: normalizeText(pickValue(row, ['Cliente'])),
        embarque: embarque || null,
        destino: normalizeText(pickValue(row, ['Destino'])),
        supervisao: normalizeText(pickValue(row, ['Supervisão', 'Supervisao', 'Regional'])),
        contrato: normalizeText(pickValue(row, ['Contrato'])),
        produto: normalizeText(pickValue(row, ['Produto'])),
        lote: normalizeNumberBr(pickValue(row, ['Lote'])) || 0,
        embarcado: normalizeNumberBr(pickValue(row, ['Embarcado'])) || 0,
        remanescente: normalizeNumberBr(pickValue(row, ['Remanescente'])) || 0,
        raw: row,
        updated_at: new Date().toISOString(),
      });
    });

    const uniqueDates = [...new Set(datas)].sort();
    return {
      rows: mapped,
      period: uniqueDates.length ? { inicio: uniqueDates[0], fim: uniqueDates[uniqueDates.length - 1], totalDatas: uniqueDates.length } : null,
    };
  }

  async function importarOperacionalOsDaPlanilha(file, opts) {
    const result = await readOperacionalOsRowsFromFile(file);
    const rows = result.rows || [];
    if (!rows.length) {
      throw new Error('A planilha de O.S. não possui linhas válidas. Cabeçalhos esperados: O.S., Data, Serviço, Cliente, Embarque, Destino, Supervisão, Contrato, Produto, Lote, Embarcado e Remanescente.');
    }

    const batchSize = 500;
    let total = 0;
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      const { error } = await opts.supabase
        .from('operacional_os')
        .upsert(batch, { onConflict: 'numero_os' });
      if (error) throw new Error(error.message || 'Falha ao gravar lista de O.S. no Supabase. Confira se rodou o SQL operacional_os.');
      total += batch.length;
    }

    const supervisoes = new Set(rows.map((r) => normalizeHeader(r.supervisao)).filter(Boolean)).size;
    const remanescenteZero = rows.filter((r) => Number(r.remanescente || 0) === 0).length;
    const ate555 = rows.filter((r) => Number(r.remanescente || 0) > 0 && Number(r.remanescente || 0) <= 555000).length;
    const ate300 = rows.filter((r) => Number(r.remanescente || 0) > 0 && Number(r.remanescente || 0) <= 300000).length;

    opts.cache?.invalidateCacheByPrefix?.('os:');
    opts.cache?.bumpPainelCache?.('importacao_operacional_os');

    return {
      total_linhas: rows.length,
      importados: total,
      supervisoes,
      remanescente_zero: remanescenteZero,
      ate_555: ate555,
      ate_300: ate300,
      periodo_inicio: result.period?.inicio || null,
      periodo_fim: result.period?.fim || null,
      total_datas: result.period?.totalDatas || null,
    };
  }

  async function importarHoteisDaPlanilha(file, opts) {
    const linhas = await readSpreadsheetAsObjects(file);
    if (!linhas.length) {
      throw new Error('A planilha de hotéis não possui linhas válidas para importar.');
    }

    const { data, error } = await opts.supabase.rpc('hospedagem_importar_hoteis_json', {
      p_linhas: linhas,
    });

    if (error) {
      throw new Error(error.message || 'Falha ao importar hotéis para o módulo Hospedagem.');
    }

    const resumo = Array.isArray(data) ? data[0] : data;
    return resumo || { total_linhas: linhas.length, inseridos: 0, atualizados: 0, ignorados: 0 };
  }

  function formatPeriod(period) {
    if (!period?.inicio || !period?.fim) return 'período não detectado';
    const br = (iso) => String(iso).slice(0, 10).split('-').reverse().join('/');
    return period.inicio === period.fim ? br(period.inicio) : `${br(period.inicio)} a ${br(period.fim)}`;
  }

  async function checkExistingPeriod({ tipo, period, opts }) {
    if (!period?.inicio || !period?.fim) return { exists: false, total: 0, items: [] };
    const { data: sessionData } = await opts.supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;
    const response = await fetch('/api/relatorios/inteligente/check', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ tipo, periodo_inicio: period.inicio, periodo_fim: period.fim }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) throw new Error(payload?.error || 'Falha ao verificar duplicidade.');
    return payload;
  }

  async function registerSmartImport(payload, opts) {
    const { data: sessionData } = await opts.supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;
    const response = await fetch('/api/relatorios/inteligente/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || result?.error) throw new Error(result?.error || 'Falha ao registrar importação inteligente.');
    return result;
  }

  function detectRelatorio(fileName) {
    const rawName = String(fileName || '').toLowerCase();
    const n = rawName
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/ç/g, 'c');

    if ((n.includes('excesso') || n.includes('excesos') || n.includes('velocidade') || n.includes('velocidad')) && !n.includes('patrimonio') && !n.includes('patrimônio')) {
      return { tipo: 'frotas_excesso_velocidade', titulo: 'Excesso de Velocidade - Frotas' };
    }

    if (n.includes('uber') || n.includes('corridas')) {
      return { tipo: 'uber_corridas', titulo: 'Relatório Uber' };
    }

    if (
      (n.includes('funcionario') || n.includes('funcionarios') || n.includes('funcionário') || n.includes('funcionários') || n.includes('colaboradores') || n.includes('colaborador')) &&
      !(n.includes('endereco') || n.includes('endereço') || n.includes('gps') || n.includes('auditoria') || n.includes('auditorias'))
    ) {
      return { tipo: 'colaboradores_rh', titulo: 'Base de Funcionários / Colaboradores' };
    }

    if ((n.includes('auditoria') || n.includes('auditorias')) && (n.includes('relatorio') || n.includes('relatório') || n.includes('lista') || n.includes('auditoria'))) {
      return { tipo: 'auditorias_operacional', titulo: 'Auditorias Operacionais por Colaborador' };
    }
    if (n.includes('lista de oss') || n.includes('lista-de-oss') || n.includes('lista_de_oss') || n.includes('lista de os') || n.includes('lista-de-os') || n.includes('lista_de_os') || n.includes('ordem de servico') || n.includes('ordem de serviço') || n.includes('relatorio os') || n.includes('relatório os') || n.includes('operacional os') || n.includes('o.s')) {
      return { tipo: 'operacional_os', titulo: 'Lista de O.S. Operacional' };
    }


    if ((n.includes('endereco') || n.includes('endereço') || n.includes('gps')) && (n.includes('colaborador') || n.includes('colaboradores'))) {
      return { tipo: 'colaboradores_operacional', titulo: 'Endereços dos Colaboradores Operacional' };
    }

    if ((n.includes('mapa') && n.includes('g1000')) || n.includes('ponto-embarque') || n.includes('pontos-embarque') || n.includes('pontos_de_embarque') || n.includes('pontos de embarque')) {
      return { tipo: 'pontos_embarque', titulo: 'Pontos de Embarque Operacional' };
    }

    if (
      (n.includes('movimento') && n.includes('diario')) ||
      (n.includes('mapa') && n.includes('embarque')) ||
      (n.includes('embarque') && n.includes('laudo')) ||
      n.includes('mapa_embarque') ||
      n.includes('mapa-de-embarque')
    ) {
      return { tipo: 'logistica_mapa_embarque', titulo: 'Logística · Mapa de Embarque' };
    }

    if ((n.includes('producao') || n.includes('produção')) && (n.includes('diaria') || n.includes('diária') || n.includes('diario') || n.includes('diário'))) {
      return { tipo: 'producao', titulo: 'Produção Diária' };
    }

    if (n.includes('hotel') || n.includes('hoteis') || n.includes('hotéis') || n.includes('hospedagem') || n.includes('hospedagens')) {
      return { tipo: 'hoteis', titulo: 'Banco de Hotéis' };
    }

    if ((n.includes('contas') || n.includes('conta')) && n.includes('receber')) {
      return { tipo: 'financeiro_contas_receber', titulo: 'Financeiro · Contas a Receber' };
    }
    if ((n.includes('contas') || n.includes('conta') || n.includes('lista')) && n.includes('pagar')) {
      return { tipo: 'financeiro_contas_pagar', titulo: 'Financeiro · Contas a Pagar' };
    }

    if (n.includes('nota') || n.includes('fiscal') || n.includes('nfse') || n.includes('nfe')) {
      return { tipo: 'notas_fiscais', titulo: 'Notas Fiscais' };
    }
    if (n.includes('despesa')) {
      return { tipo: 'despesas', titulo: 'Relatório de Despesas' };
    }
    if ((n.includes('resultado') && (n.includes('diario') || n.includes('diário'))) || n.includes('resultado-diario')) {
      return { tipo: 'resultado-diario', titulo: 'Relatório Resultado Diário' };
    }
    if (n.includes('gavilon')) {
      return { tipo: 'resultado-diario-gavilon', titulo: 'Relatório Resultado Diário Gavilon' };
    }
    if (n.includes('resultado')) {
      return { tipo: 'resultado-diario', titulo: 'Relatório Resultado Diário' };
    }
    if (n.includes('producao') || n.includes('produção')) {
      return { tipo: 'producao', titulo: 'Produção Diária' };
    }
    if (n.includes('patrimonio') || n.includes('patrimônio')) {
      return { tipo: 'patrimonios', titulo: 'Relatório de Patrimônios' };
    }
    if (n.includes('caixa') || n.includes('fornecedor')) {
      return { tipo: 'caixa_fornecedor', titulo: 'Caixa Fornecedor' };
    }
    if (n.includes('carga')) {
      return { tipo: 'cargas', titulo: 'Relatório de Cargas' };
    }
    if (n.includes('faturado') || n.includes('faturamento')) {
      return { tipo: 'servicos_faturados', titulo: 'Serviços Faturados' };
    }

    return { tipo: 'outros', titulo: 'Outros Relatórios' };
  }

  function isAllowedFile(file) {
    const name = String(file?.name || '').toLowerCase();
    if (!/\.(xlsx|xls|csv)$/i.test(name)) return false;
    return Number(file?.size || 0) <= MAX_ENTERPRISE_SIZE;
  }

  function buildStoragePath(file) {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const safe = sanitizeFileName(file.name);
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    return `relatorios/${yyyy}/${mm}/${dd}/${unique}-${safe}`;
  }

  function setButton(btn, mode, label) {
    btn.classList.remove('is-error', 'is-success');
    if (mode) btn.classList.add(mode);
    btn.innerHTML = label;
  }

  async function requestSignedUpload({ file, path, opts }) {
    const supabase = opts.supabase;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;

    const response = await fetch('/api/upload/signed-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        bucket: BUCKET,
        path,
        filename: file.name,
        contentType: file.type || 'application/octet-stream',
        size: file.size || 0,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || payload?.message || 'Falha ao gerar URL assinada para upload.');
    }

    return payload;
  }

  async function uploadFileWithSignedUrl({ file, path, opts }) {
    const supabase = opts.supabase;
    const signed = await requestSignedUpload({ file, path, opts });

    if (signed?.token) {
      const { error } = await supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, signed.token, file, {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (error) throw error;
      return;
    }

    if (signed?.signedUrl || signed?.url) {
      const uploadUrl = signed.signedUrl || signed.url;
      const response = await fetch(uploadUrl, {
        method: signed.method || 'PUT',
        headers: {
          'Content-Type': file.type || 'application/octet-stream',
          ...(signed.headers || {}),
        },
        body: file,
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || `Falha no upload assinado. HTTP ${response.status}`);
      }
      return;
    }

    throw new Error('Resposta inválida ao gerar URL assinada.');
  }


  function setProgress(bar, percent) {
    if (!bar) return;
    const value = Math.max(0, Math.min(100, Number(percent || 0)));
    bar.style.width = `${value.toFixed(1)}%`;
  }

  async function putToSignedUrl({ signed, blob, contentType }) {
    if (!signed?.signedUrl && !signed?.url) {
      throw new Error('URL assinada inválida.');
    }

    const uploadUrl = signed.signedUrl || signed.url;
    const response = await fetch(uploadUrl, {
      method: signed.method || 'PUT',
      headers: {
        'Content-Type': contentType || 'application/octet-stream',
        ...(signed.headers || {}),
      },
      body: blob,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(text || `Falha no upload assinado. HTTP ${response.status}`);
    }
  }

  async function uploadBlobWithSignedUrl({ blob, path, fileName, contentType, opts }) {
    const signed = await requestSignedUpload({
      file: {
        name: fileName || path.split('/').pop() || 'arquivo.bin',
        size: blob.size || 0,
        type: contentType || blob.type || 'application/octet-stream',
      },
      path,
      opts,
    });

    if (signed?.token && opts.supabase?.storage?.from) {
      const { error } = await opts.supabase.storage
        .from(BUCKET)
        .uploadToSignedUrl(path, signed.token, blob, {
          contentType: contentType || blob.type || 'application/octet-stream',
          upsert: false,
        });
      if (error) throw error;
      return;
    }

    await putToSignedUrl({
      signed,
      blob,
      contentType: contentType || blob.type || 'application/octet-stream',
    });
  }


  async function completeChunkedUpload({ file, path, chunks, opts, bar, status }) {
    const supabase = opts.supabase;
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token || null;

    status.textContent = 'Finalizando arquivo enterprise...';
    setProgress(bar, 92);

    const response = await fetch('/api/upload/complete-chunked', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        bucket: BUCKET,
        finalPath: path,
        filename: file.name,
        contentType: file.type || 'application/vnd.ms-excel',
        size: file.size || 0,
        chunks,
        deleteChunks: true,
      }),
    });

    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload?.error) {
      throw new Error(payload?.error || payload?.message || 'Falha ao finalizar upload enterprise.');
    }
    return payload;
  }

  async function uploadFileEnterpriseChunked({ file, path, opts, bar, status }) {
    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    const chunks = [];
    const chunkRoot = `${path}.chunks`;
    const manifestPath = `${path}.manifest.json`;

    status.textContent = `Upload enterprise: preparando ${totalChunks} partes...`;
    setProgress(bar, 5);

    for (let index = 0; index < totalChunks; index++) {
      const start = index * CHUNK_SIZE;
      const end = Math.min(file.size, start + CHUNK_SIZE);
      const chunk = file.slice(start, end);
      const chunkPath = `${chunkRoot}/part-${String(index + 1).padStart(5, '0')}.bin`;

      status.textContent = `Enviando parte ${index + 1}/${totalChunks}...`;
      await uploadBlobWithSignedUrl({
        blob: chunk,
        path: chunkPath,
        fileName: `${sanitizeFileName(file.name)}.part-${index + 1}`,
        contentType: 'application/octet-stream',
        opts,
      });

      chunks.push({ index, path: chunkPath, size: chunk.size });
      setProgress(bar, 8 + ((index + 1) / totalChunks) * 82);
    }

    const manifest = {
      version: 3,
      mode: 'chunked',
      strategy: 'no-worker-merge',
      bucket: BUCKET,
      original_name: file.name,
      original_path: path,
      original_size: file.size,
      content_type: file.type || 'application/vnd.ms-excel',
      chunk_size: CHUNK_SIZE,
      total_chunks: totalChunks,
      chunks,
      created_at: new Date().toISOString(),
    };

    status.textContent = 'Upload enterprise concluído. Registrando índice dos chunks...';
    setProgress(bar, 96);
    return { mode: 'chunked', storagePath: path, manifest };
  }

  async function uploadFileSmart({ file, path, opts, bar, status }) {
    if (isEnterpriseUpload(file)) {
      return uploadFileEnterpriseChunked({ file, path, opts, bar, status });
    }

    await uploadFileWithSignedUrl({ file, path, opts });
    return { mode: 'single', storagePath: path, manifest: null };
  }

  async function uploadAndRegister({ file, item, bar, status, entry }, opts) {
    const supabase = opts.supabase;
    let detected = entry?.detected || detectRelatorio(file.name);
    detected = await detectarProducaoDiariaPorConteudo(file, detected);
    detected = await detectarHoteisPorConteudo(file, detected);
    if (entry) entry.detected = detected;
    const path = buildStoragePath(file);
    const user = opts.user || opts.auth?.user || null;
    const userMeta = user?.user_metadata || {};
    const userName = userMeta.full_name || userMeta.name || user?.email || null;

    status.textContent = isEnterpriseUpload(file) ? 'Iniciando upload enterprise...' : 'Gerando upload seguro...';
    setProgress(bar, 12);

    const uploadResult = await uploadFileSmart({ file, path, opts, bar, status });
    const finalStoragePath = uploadResult.storagePath || path;

    setProgress(bar, 72);
    status.textContent = 'Registrando importação...';

    let publicUrl = null;
    try {
      const { data } = supabase.storage.from(BUCKET).getPublicUrl(finalStoragePath);
      publicUrl = data?.publicUrl || null;
    } catch (_) {
      publicUrl = null;
    }

    let hoteisResumo = null;
    let pontosResumo = null;
    let colaboradoresResumo = null;
    let colaboradoresRhResumo = null;
    let auditoriasResumo = null;
    let uberResumo = null;
    let patrimoniosResumo = null;
    let frotasExcessoResumo = null;
    let resultadoDiarioResumo = null;
    let producaoDiariaResumo = null;
    let financeiroReceberResumo = null;
    let financeiroPagarResumo = null;
    if (detected.tipo === 'hoteis') {
      status.textContent = 'Importando hotéis no módulo Hospedagem...';
      setProgress(bar, 82);
      hoteisResumo = await importarHoteisDaPlanilha(file, opts);
    }
    if (detected.tipo === 'pontos_embarque') {
      status.textContent = 'Importando pontos no módulo Operacional...';
      setProgress(bar, 82);
      pontosResumo = await importarPontosEmbarqueDaPlanilha(file, opts);
    }
    if (detected.tipo === 'colaboradores_operacional') {
      status.textContent = 'Importando endereços dos colaboradores no módulo Operacional...';
      setProgress(bar, 82);
      colaboradoresResumo = await importarColaboradoresBaseDaPlanilha(file, opts);
    }
    if (detected.tipo === 'colaboradores_rh') {
      status.textContent = 'Importando base de funcionários no RH...';
      setProgress(bar, 82);
      colaboradoresRhResumo = await importarColaboradoresRhDaPlanilha(file, opts);
    }
    if (detected.tipo === 'auditorias_operacional') {
      status.textContent = 'Importando histórico de auditorias no módulo Operacional...';
      setProgress(bar, 82);
      auditoriasResumo = await importarAuditoriasOperacionalDaPlanilha(file, opts);
    }
    if (detected.tipo === 'uber_corridas') {
      status.textContent = 'Importando corridas Uber na Conferência...';
      setProgress(bar, 82);
      uberResumo = await importarUberCorridasDaPlanilha(file, opts);
    }
    if (detected.tipo === 'patrimonios') {
      status.textContent = 'Importando leitura de patrimônios para cruzamento de frota...';
      setProgress(bar, 82);
      patrimoniosResumo = await importarPatrimoniosDaPlanilha(file, opts);
    }
    if (detected.tipo === 'frotas_excesso_velocidade') {
      status.textContent = 'Importando excessos de velocidade e cruzando com patrimônios...';
      setProgress(bar, 82);
      frotasExcessoResumo = await importarFrotasExcessoVelocidadeDaPlanilha(file, opts);
    }
    if (detected.tipo === 'resultado-diario') {
      status.textContent = 'Consolidando Resultado Diário no banco para acelerar o DRE...';
      setProgress(bar, 82);
      resultadoDiarioResumo = await importarResultadoDiarioDaPlanilha(file, opts, entry?.period || null);
      if (resultadoDiarioResumo?.periodo_inicio) entry.period = { inicio: resultadoDiarioResumo.periodo_inicio, fim: resultadoDiarioResumo.periodo_fim, totalDatas: null };
    }
    if (detected.tipo === 'producao') {
      status.textContent = 'Consolidando Produção Diária no banco para pagamentos do Financeiro...';
      setProgress(bar, 82);
      producaoDiariaResumo = await importarProducaoDiariaDaPlanilha(file, opts);
      if (producaoDiariaResumo?.periodo_inicio) entry.period = { inicio: producaoDiariaResumo.periodo_inicio, fim: producaoDiariaResumo.periodo_fim, totalDatas: producaoDiariaResumo.total_datas || null };
    }
    if (detected.tipo === 'financeiro_contas_receber') {
      status.textContent = 'Importando Contas a Receber no módulo Financeiro...';
      setProgress(bar, 82);
      financeiroReceberResumo = await importarFinanceiroReceberDaPlanilha(file, opts);
      if (financeiroReceberResumo?.periodo_inicio) entry.period = { inicio: financeiroReceberResumo.periodo_inicio, fim: financeiroReceberResumo.periodo_fim, totalDatas: null };
    }
    if (detected.tipo === 'financeiro_contas_pagar') {
      status.textContent = 'Importando Contas a Pagar no módulo Financeiro...';
      setProgress(bar, 82);
      financeiroPagarResumo = await importarFinanceiroPagarDaPlanilha(file, opts);
      if (financeiroPagarResumo?.periodo_inicio) entry.period = { inicio: financeiroPagarResumo.periodo_inicio, fim: financeiroPagarResumo.periodo_fim, totalDatas: null };
    }

    const importMode = opts.importMode || 'auto';
    const period = ['hoteis', 'pontos_embarque', 'colaboradores_operacional', 'colaboradores_rh', 'auditorias_operacional', 'patrimonios'].includes(detected.tipo)
      ? null
      : (resultadoDiarioResumo?.periodo_inicio
        ? { inicio: resultadoDiarioResumo.periodo_inicio, fim: resultadoDiarioResumo.periodo_fim, totalDatas: null }
        : (producaoDiariaResumo?.periodo_inicio
          ? { inicio: producaoDiariaResumo.periodo_inicio, fim: producaoDiariaResumo.periodo_fim, totalDatas: producaoDiariaResumo.total_datas || null }
          : (financeiroReceberResumo?.periodo_inicio
            ? { inicio: financeiroReceberResumo.periodo_inicio, fim: financeiroReceberResumo.periodo_fim, totalDatas: null }
            : (financeiroPagarResumo?.periodo_inicio
              ? { inicio: financeiroPagarResumo.periodo_inicio, fim: financeiroPagarResumo.periodo_fim, totalDatas: null }
              : (frotasExcessoResumo?.periodo_inicio ? { inicio: frotasExcessoResumo.periodo_inicio, fim: frotasExcessoResumo.periodo_fim, totalDatas: null } : (entry?.period || await detectFilePeriod(file, detected.tipo)))))));
    let check = { exists: false, total: 0, items: [] };

    if (period?.inicio && period?.fim) {
      status.textContent = 'Verificando período existente...';
      check = await checkExistingPeriod({ tipo: detected.tipo, period, opts });
    }

    const effectiveMode = importMode === 'auto'
      ? (check.exists ? 'replace' : 'append')
      : importMode;

    status.textContent = detected.tipo === 'hoteis'
      ? 'Registrando upload da planilha de hotéis...'
      : (detected.tipo === 'pontos_embarque'
        ? 'Registrando upload dos pontos de embarque...'
        : (detected.tipo === 'logistica_mapa_embarque'
          ? 'Registrando Mapa de Embarque para Logística...'
          : (detected.tipo === 'colaboradores_operacional'
          ? 'Registrando upload dos endereços dos colaboradores...'
          : (detected.tipo === 'colaboradores_rh'
            ? 'Registrando upload da base de funcionários...'
            : (detected.tipo === 'auditorias_operacional'
            ? 'Registrando upload das auditorias operacionais...'
            : (detected.tipo === 'uber_corridas'
              ? 'Registrando upload do relatório Uber...'
              : (effectiveMode === 'replace'
            ? 'Registrando substituição inteligente...'
            : 'Registrando complemento inteligente...')))))));

    const observacoesPayload = uploadResult.mode === 'chunked'
      ? {
          upload_mode: 'chunked',
          pipeline: 'browser-chunks-no-worker-merge',
          original_path: path,
          total_chunks: uploadResult.manifest?.total_chunks || 0,
          original_size: file.size,
          manifest: uploadResult.manifest,
        }
      : {
          upload_mode: 'single',
          pipeline: 'signed-url',
        };

    const payload = {
      mode: effectiveMode,
      check,
      importacao: {
        tipo_relatorio: detected.tipo,
        titulo_relatorio: detected.titulo,
        arquivo_nome_original: file.name,
        arquivo_nome_storage: finalStoragePath.split('/').pop(),
        storage_bucket: BUCKET,
        storage_path: finalStoragePath,
        tamanho_bytes: file.size || 0,
        mime_type: file.type || null,
        status: 'enviado',
        observacoes: JSON.stringify({
          ...observacoesPayload,
          import_mode_requested: importMode,
          import_mode_effective: effectiveMode,
          periodo: period || null,
          hoteis_importacao: hoteisResumo || null,
          pontos_embarque_importacao: pontosResumo || null,
          colaboradores_operacional_importacao: colaboradoresResumo || null,
          colaboradores_rh_importacao: colaboradoresRhResumo || null,
          auditorias_operacional_importacao: auditoriasResumo || null,
          uber_corridas_importacao: uberResumo || null,
          patrimonios_importacao: patrimoniosResumo || null,
          frotas_excesso_velocidade_importacao: frotasExcessoResumo || null,
          resultado_diario_importacao: resultadoDiarioResumo || null,
          producao_diaria_importacao: producaoDiariaResumo || null,
          financeiro_contas_receber_importacao: financeiroReceberResumo || null,
          financeiro_contas_pagar_importacao: financeiroPagarResumo || null,
          replaced_count: effectiveMode === 'replace' ? Number(check.total || 0) : 0,
        }),
        importado_por: user?.id || null,
        importado_por_nome: userName,
        nome_arquivo: file.name,
        tipo: detected.tipo,
        path: finalStoragePath,
        url: publicUrl,
        usuario_id: user?.id || null,
        usuario_nome: userName,
        usuario_email: user?.email || null,
        periodo_inicio: period?.inicio || null,
        periodo_fim: period?.fim || null,
        modo_importacao: effectiveMode,
        substitui_importacoes: effectiveMode === 'replace' ? (check.items || []).map((x) => x.id) : [],
        total_periodo_registros: period?.totalDatas || null,
      }
    };

    const result = await registerSmartImport(payload, opts);
    if (detected.tipo === 'hoteis' && hoteisResumo) {
      status.textContent = `Hotéis: ${hoteisResumo.inseridos || 0} novos · ${hoteisResumo.atualizados || 0} atualizados · ${hoteisResumo.ignorados || 0} ignorados`;
    } else if (detected.tipo === 'pontos_embarque' && pontosResumo) {
      status.textContent = `Pontos: ${pontosResumo.importados || 0} importados · ${pontosResumo.cidades || 0} cidades · ${pontosResumo.supervisoes || 0} supervisões`;
    } else if (detected.tipo === 'logistica_mapa_embarque') {
      status.textContent = `Mapa de Embarque importado · disponível para Logística${period?.inicio ? ` · ${formatPeriod(period)}` : ''}`;
    } else if (detected.tipo === 'colaboradores_operacional' && colaboradoresResumo) {
      status.textContent = `Colaboradores: ${colaboradoresResumo.importados || 0} endereços importados · ${colaboradoresResumo.cidades || 0} cidades · ${colaboradoresResumo.ufs || 0} UFs`;
    } else if (detected.tipo === 'colaboradores_rh' && colaboradoresRhResumo) {
      status.textContent = `Funcionários: ${colaboradoresRhResumo.importados || 0} importados · ${colaboradoresRhResumo.ativos || 0} ativos · base atualizada`;
    } else if (detected.tipo === 'auditorias_operacional' && auditoriasResumo) {
      status.textContent = `Auditorias: ${auditoriasResumo.importados || 0} registros · ${auditoriasResumo.colaboradores || 0} colaboradores · ${auditoriasResumo.descontos || 0} descontos`;
    } else if (detected.tipo === 'uber_corridas' && uberResumo) {
      status.textContent = `Uber: ${uberResumo.importados || 0} corridas · ${uberResumo.colaboradores || 0} colaboradores · ${MONEY_FMT.format(uberResumo.valor_total || 0)}`;
    } else if (detected.tipo === 'patrimonios' && patrimoniosResumo) {
      status.textContent = `Patrimônios: ${patrimoniosResumo.importados || 0} atualizados · ${patrimoniosResumo.veiculos || 0} veículos · ${Number(patrimoniosResumo.frotas_associadas?.veiculos_atualizados || 0)} motorista(s) associados em Frotas`;
    } else if (detected.tipo === 'frotas_excesso_velocidade' && frotasExcessoResumo) {
      status.textContent = `Frotas: ${frotasExcessoResumo.importados || 0} excessos · ${frotasExcessoResumo.identificados || 0} identificados · ${frotasExcessoResumo.pendentes || 0} pendentes`;
    } else if (detected.tipo === 'resultado-diario' && resultadoDiarioResumo) {
      status.textContent = `Resultado Diário: ${resultadoDiarioResumo.importados || 0} linhas consolidadas · ${Number(resultadoDiarioResumo.toneladas || 0).toLocaleString('pt-BR')} tons · DRE rápido`;
    } else if (detected.tipo === 'producao' && producaoDiariaResumo) {
      status.textContent = `Produção Diária: ${producaoDiariaResumo.importados || 0} linhas · ${producaoDiariaResumo.colaboradores || 0} colaboradores · Financeiro liberado`;
    } else if (detected.tipo === 'financeiro_contas_receber' && financeiroReceberResumo) {
      status.textContent = `Financeiro Receber: ${financeiroReceberResumo.importados || 0} títulos atualizados · ${formatPeriod({ inicio: financeiroReceberResumo.periodo_inicio, fim: financeiroReceberResumo.periodo_fim })} · ${MONEY_FMT.format(financeiroReceberResumo.valor_total || 0)}`;
    } else if (detected.tipo === 'financeiro_contas_pagar' && financeiroPagarResumo) {
      status.textContent = `Financeiro Pagar: ${financeiroPagarResumo.importados || 0} títulos atualizados · ${formatPeriod({ inicio: financeiroPagarResumo.periodo_inicio, fim: financeiroPagarResumo.periodo_fim })} · ${MONEY_FMT.format(financeiroPagarResumo.valor_total || 0)}`;
    } else if (result?.mode === 'replace' && result?.replaced_count) {
      status.textContent = `Importado · substituiu ${result.replaced_count} versão(ões)`;
    }

    setProgress(bar, 100);
    if (!(detected.tipo === 'hoteis' && hoteisResumo) && !(detected.tipo === 'pontos_embarque' && pontosResumo) && detected.tipo !== 'logistica_mapa_embarque' && !(detected.tipo === 'colaboradores_operacional' && colaboradoresResumo) && !(detected.tipo === 'colaboradores_rh' && colaboradoresRhResumo) && !(detected.tipo === 'auditorias_operacional' && auditoriasResumo) && !(detected.tipo === 'uber_corridas' && uberResumo) && !(detected.tipo === 'patrimonios' && patrimoniosResumo) && !(detected.tipo === 'frotas_excesso_velocidade' && frotasExcessoResumo) && !(detected.tipo === 'resultado-diario' && resultadoDiarioResumo) && !(detected.tipo === 'producao' && producaoDiariaResumo) && !(detected.tipo === 'financeiro_contas_receber' && financeiroReceberResumo) && !(detected.tipo === 'financeiro_contas_pagar' && financeiroPagarResumo)) status.textContent = 'Importado';
    item.classList.add('is-success');
  }

  function openHome(container, opts = {}) {
    state.files = [];
    state.running = false;
    state.imported = 0;
    state.errors = 0;

    container.innerHTML = `
      ${styles}
      <section class="relatorios-importacao">
        <div class="relatorios-grid">
          <div class="import-card">
            <div class="import-head">
              <div>
                <h2 class="import-title">Central de importação</h2>
                <p class="import-subtitle">Selecione os arquivos, revise a lista e finalize no botão Concluir Importação.</p>
              </div>
              <span class="tag">XLSX · XLS · CSV</span>
            </div>

            <div class="dropzone" id="dropzone" role="button" tabindex="0">
              <input type="file" id="fileInput" multiple hidden accept=".xlsx,.xls,.csv" />
              <div>
                <div class="dropzone-main">Arraste arquivos aqui ou clique para selecionar</div>
                <div class="dropzone-hint">A importação só será enviada após confirmar no botão abaixo.</div>
              </div>
            </div>

            <div class="import-intelligence">
              <div class="import-intelligence-row">
                <div class="import-field">
                  <label for="modoImportacao">Modo de importação</label>
                  <select id="modoImportacao">
                    <option value="auto">Automático inteligente</option>
                    <option value="replace">Substituir período detectado</option>
                    <option value="append">Complementar dados existentes</option>
                  </select>
                </div>
                <div class="import-intelligence-note" id="intelligenceNote">
                  No automático, se o período já existir no banco, o painel substitui a versão anterior; planilhas de hotéis vão para Hospedagem, Mapa G1000 e Endereço Colaborador vão para Operacional, Patrimônios atualiza a leitura e Excesso de Velocidade vai para Frotas com cruzamento automático por placa.
                </div>
              </div>
            </div>

            <div class="file-list" id="fileList">
              <div class="file-empty">Nenhum arquivo selecionado.</div>
            </div>

            <div class="import-actions">
              <div class="import-summary" id="importSummary">0 arquivos prontos para importação.</div>
              <button class="btn-importar" id="btnConcluirImportacao" type="button" disabled>Concluir Importação</button>
            </div>

            <div class="import-log" id="importLog"></div>
          </div>
        </div>
      </section>
    `;

    const drop = container.querySelector('#dropzone');
    const input = container.querySelector('#fileInput');
    const list = container.querySelector('#fileList');
    const btn = container.querySelector('#btnConcluirImportacao');
    const modeSelect = container.querySelector('#modoImportacao');
    const summary = container.querySelector('#importSummary');
    const log = container.querySelector('#importLog');

    function updateSummary() {
      const count = state.files.length;
      const invalid = state.files.filter((entry) => !entry.valid).length;
      const valid = count - invalid;
      const pending = state.files.filter((entry) => entry.valid && entry.status === 'pendente').length;

      if (!count) {
        summary.textContent = '0 arquivos prontos para importação.';
      } else if (invalid) {
        summary.textContent = `${valid} arquivo(s) pronto(s) · ${invalid} arquivo(s) inválido(s).`;
      } else {
        summary.textContent = `${pending} arquivo(s) pronto(s) para importação.`;
      }

      btn.disabled = state.running || pending === 0;
    }

    function renderFiles() {
      if (!state.files.length) {
        list.innerHTML = '<div class="file-empty">Nenhum arquivo selecionado.</div>';
        updateSummary();
        return;
      }

      list.innerHTML = '';
      state.files.forEach((entry, index) => {
        const detected = entry.detected || detectRelatorio(entry.file.name);
        const item = document.createElement('div');
        item.className = 'file-item';
        if (isEnterpriseUpload(entry.file)) item.classList.add('is-enterprise');
        if (!entry.valid) item.classList.add('is-error');
        if (entry.status === 'importado') item.classList.add('is-success');
        if (entry.status === 'erro') item.classList.add('is-error');

        item.innerHTML = `
          <div>
            <div class="file-name">
              <span>📄</span>
              <span title="${entry.file.name.replace(/"/g, '&quot;')}">${entry.file.name}</span>
            </div>
            <div class="file-meta">${detected.titulo} · ${humanSize(entry.file.size)} <span class="upload-mode">${uploadModeLabel(entry.file)}</span>${entry.period ? `<span class="file-period">${formatPeriod(entry.period)}</span>` : ''}</div>
          </div>
          <div class="file-right">
            <div class="file-status-row">
              <span class="file-status">${entry.valid ? (entry.message || 'Pendente') : 'Formato inválido'}</span>
              <button class="file-remove" type="button" data-index="${index}" ${state.running ? 'disabled' : ''}>Remover</button>
            </div>
            <div class="progress"><div class="progress-bar" style="width:${entry.status === 'importado' ? '100' : entry.status === 'erro' ? '100' : '0'}%"></div></div>
          </div>
        `;

        entry.elements = {
          item,
          bar: item.querySelector('.progress-bar'),
          status: item.querySelector('.file-status'),
        };

        list.appendChild(item);
      });

      list.querySelectorAll('.file-remove').forEach((button) => {
        button.addEventListener('click', () => {
          const index = Number(button.dataset.index);
          state.files.splice(index, 1);
          renderFiles();
        });
      });

      updateSummary();
    }

    async function addFiles(fileList) {
      const incoming = Array.from(fileList || []);
      if (!incoming.length || state.running) return;

      const existingKey = new Set(state.files.map((entry) => `${entry.file.name}_${entry.file.size}`));

      incoming.forEach((file) => {
        const key = `${file.name}_${file.size}`;
        if (existingKey.has(key)) return;
        existingKey.add(key);

        const valid = isAllowedFile(file);
        const detected = detectRelatorio(file.name);
        const entry = {
          file,
          valid,
          period: null,
          status: valid ? 'pendente' : 'erro',
          message: valid ? 'Detectando período...' : 'Use XLSX, XLS ou CSV até 1GB',
          detected,
          elements: null,
        };
        state.files.push(entry);

        if (valid) {
          if (detected.tipo === 'hoteis') {
            entry.message = 'Pendente · importará cadastro de hotéis';
          } else if (detected.tipo === 'pontos_embarque') {
            entry.message = 'Pendente · importará pontos de embarque operacional';
          } else if (detected.tipo === 'logistica_mapa_embarque') {
            entry.message = 'Pendente · atualizará Mapa de Embarque para Logística/Laudos';
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period
                ? `Período: ${formatPeriod(period)} · atualizará Mapa de Embarque`
                : 'Pendente · Mapa de Embarque sem período detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'colaboradores_operacional') {
            entry.message = 'Pendente · importará endereços dos colaboradores no Operacional';
          } else if (detected.tipo === 'colaboradores_rh') {
            entry.message = 'Pendente · atualizará base de funcionários/colaboradores no RH';
          } else if (detected.tipo === 'auditorias_operacional') {
            entry.message = 'Pendente · importará auditorias no Operacional';
          } else if (detected.tipo === 'uber_corridas') {
            entry.message = 'Pendente · importará corridas Uber na Conferência';
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará corridas Uber` : 'Pendente · Uber sem período detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'patrimonios') {
            entry.message = 'Pendente · atualizará leitura de patrimônios';
          } else if (detected.tipo === 'frotas_excesso_velocidade') {
            entry.message = 'Pendente · cruzará excesso de velocidade com patrimônio';
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará Frotas` : 'Pendente · Frotas sem período detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'producao') {
            entry.message = 'Pendente · consolidará Produção Diária para pagamentos do Financeiro';
            readProducaoDiariaRowsFromFile(file).then((res) => {
              const period = res?.period || null;
              entry.period = period;
              const total = Number(res?.rows?.length || 0);
              entry.message = period
                ? `Período: ${formatPeriod(period)} · ${total.toLocaleString('pt-BR')} linhas · consolidará Produção Diária`
                : 'Pendente · Produção Diária sem período detectado';
              renderFiles();
            }).catch((err) => {
              entry.period = null;
              entry.message = `Pendente · não foi possível pré-validar Produção Diária (${err?.message || 'erro de leitura'})`;
              renderFiles();
            });
          } else if (detected.tipo === 'resultado-diario') {
            entry.message = 'Pendente · consolidará produção para DRE rápido';
            // Usa o próprio leitor do Resultado Diário para detectar o período.
            // Assim a mesma regra que importa também valida Data/Coordenação/Toneladas.
            readResultadoDiarioRowsFromFile(file).then((res) => {
              const period = res?.period || null;
              entry.period = period;
              const total = Number(res?.rows?.length || 0);
              entry.message = period
                ? `Período: ${formatPeriod(period)} · ${total.toLocaleString('pt-BR')} linhas · consolidará Resultado Diário`
                : 'Pendente · Resultado Diário sem período detectado';
              renderFiles();
            }).catch((err) => {
              entry.period = null;
              entry.message = `Pendente · não foi possível pré-validar Resultado Diário (${err?.message || 'erro de leitura'})`;
              renderFiles();
            });
          } else if (detected.tipo === 'financeiro_contas_receber') {
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará Contas a Receber no Financeiro` : 'Pendente · Contas a Receber sem vencimento detectado';
              renderFiles();
            });
          } else if (detected.tipo === 'financeiro_contas_pagar') {
            detectFilePeriod(file, detected.tipo).then((period) => {
              entry.period = period;
              entry.message = period ? `Período: ${formatPeriod(period)} · importará Contas a Pagar no Financeiro` : 'Pendente · Contas a Pagar sem vencimento detectado';
              renderFiles();
            });
          } else {
            detectarHoteisPorConteudo(file, detected).then((newDetected) => {
              if (newDetected.tipo === 'hoteis') {
                entry.detected = newDetected;
                entry.message = 'Pendente · importará cadastro de hotéis';
                renderFiles();
              } else {
                detectFilePeriod(file, detected.tipo).then((period) => {
                  entry.period = period;
                  entry.message = period ? `Período: ${formatPeriod(period)}` : 'Pendente · período não detectado';
                  renderFiles();
                });
              }
            });
          }
        }
      });

      log.classList.remove('is-visible');
      log.innerHTML = '';
      renderFiles();
      input.value = '';
    }

    drop.addEventListener('click', () => input.click());
    drop.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });
    drop.addEventListener('dragover', (event) => {
      event.preventDefault();
      drop.classList.add('is-dragging');
    });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-dragging'));
    drop.addEventListener('drop', (event) => {
      event.preventDefault();
      drop.classList.remove('is-dragging');
      addFiles(event.dataTransfer.files);
    });
    input.addEventListener('change', () => addFiles(input.files));

    btn.addEventListener('click', async () => {
      const queue = state.files.filter((entry) => entry.valid && entry.status === 'pendente');
      if (!queue.length || state.running) return;

      state.running = true;
      state.imported = 0;
      state.errors = 0;
      setButton(btn, null, '<span class="spinner"></span>Importando...');
      updateSummary();
      renderFiles();

      for (const entry of queue) {
        const { item, bar, status } = entry.elements || {};
        try {
          entry.status = 'processando';
          entry.message = 'Processando...';
          if (status) status.textContent = 'Processando...';
          if (bar) bar.style.width = '12%';

          await uploadAndRegister({ file: entry.file, item, bar, status, entry }, { ...opts, importMode: modeSelect?.value || 'auto' });

          entry.status = 'importado';
          entry.message = 'Importado';
          state.imported += 1;
        } catch (err) {
          console.error('[RELATORIOS] Erro ao importar:', err);
          entry.status = 'erro';
          entry.message = err?.message || 'Erro ao importar';
          state.errors += 1;

          if (item) item.classList.add('is-error');
          if (bar) bar.style.width = '100%';
          if (status) status.textContent = entry.message;
        }
      }

      state.running = false;
      if (state.imported > 0) {
        opts.cache?.bumpPainelCache?.('importacao_relatorios');
      }
      updateSummary();

      if (state.errors) {
        setButton(btn, 'is-error', 'Revisar e tentar novamente');
        btn.disabled = !state.files.some((entry) => entry.valid && entry.status === 'pendente');
        log.innerHTML = `<strong>Importação parcial:</strong> ${state.imported} arquivo(s) importado(s) e ${state.errors} com erro.`;
      } else {
        setButton(btn, 'is-success', 'Importação concluída');
        btn.disabled = true;
        log.innerHTML = `<strong>Importação concluída:</strong> ${state.imported} arquivo(s) enviado(s) com sucesso.`;
      }

      log.classList.add('is-visible');
    });

    renderFiles();
  }

  window.RELATORIOS = { openHome };
})();
