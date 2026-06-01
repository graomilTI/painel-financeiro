(function () {
  const XLSX_CDN = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
  const BATCH_SIZE = 500;

  const ALIASES = {
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
    return loadScript(XLSX_CDN, 'XLSX');
  }

  function todayIsoLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function headerKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  function normalizeHeader(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  function findHeaderRow(rows, required) {
    let best = 0;
    let score = -1;
    const req = (required || []).map(headerKey).filter(Boolean);
    (rows || []).slice(0, 50).forEach((row, index) => {
      const headers = (row || []).map(headerKey).filter(Boolean);
      const current = req.filter((name) => headers.some((h) => h === name || h.includes(name) || name.includes(h))).length;
      if (current > score) {
        score = current;
        best = index;
      }
    });
    return best;
  }

  function buildHeaderIndex(header) {
    const map = new Map();
    (header || []).forEach((value, index) => {
      const key = headerKey(value);
      if (key && !map.has(key)) map.set(key, index);
    });
    return map;
  }

  function pick(row, headerIndex, aliases) {
    for (const alias of aliases || []) {
      const idx = headerIndex.get(headerKey(alias));
      if (idx !== undefined) {
        const value = row?.[idx];
        if (value !== undefined && value !== null && String(value).trim() !== '') return value;
      }
    }
    return null;
  }

  function normalizeText(value) {
    if (value === null || value === undefined) return null;
    const text = String(value).replace(/\s+/g, ' ').trim();
    return text || null;
  }

  function normalizeCpf(value) {
    const digits = String(value || '').replace(/\D/g, '');
    if (!digits) return null;
    return digits.length < 11 ? digits.padStart(11, '0') : digits.slice(-11);
  }

  function normalizePhone(value) {
    const digits = String(value || '').replace(/\D/g, '').replace(/^0+/, '');
    return digits || null;
  }

  function normalizeNumberBr(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    const raw = String(value).trim().replace(/\s/g, '');
    const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
    const number = Number(normalized.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(number) ? number : null;
  }

  function excelSerialToIsoDate(value) {
    const num = Number(value);
    if (!Number.isFinite(num) || num < 1) return null;
    if (window.XLSX?.SSF?.parse_date_code) {
      const parsed = window.XLSX.SSF.parse_date_code(num);
      if (parsed?.y && parsed?.m && parsed?.d) {
        return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
      }
    }
    const utc = Math.round((num - 25569) * 86400 * 1000);
    const d = new Date(utc);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  function toIsoDate(value) {
    if (value === null || value === undefined || value === '') return null;
    if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') return excelSerialToIsoDate(value);
    const s = String(value || '').trim();
    let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
    if (m) return `${m[3]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`;
    m = s.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (m) return `${m[1]}-${String(Number(m[2])).padStart(2, '0')}-${String(Number(m[3])).padStart(2, '0')}`;
    return null;
  }

  function computeAtivo(situacao, desligamento) {
    if (desligamento) return false;
    const s = normalizeHeader(situacao || '');
    if (!s) return true;
    return !['nao ativo', 'nao ativa', 'inativo', 'inativa', 'deslig', 'demit'].some((status) => s.includes(status));
  }

  function mapRow(row, headerIndex, dataReferencia, importacaoId) {
    const get = (campo) => pick(row, headerIndex, ALIASES[campo] || []);
    const nome = normalizeText(get('nome'));
    if (!nome) return null;

    const situacao = normalizeText(get('situacao'));
    const desligamento = toIsoDate(get('desligamento'));

    return {
      importacao_id: importacaoId || null,
      data_referencia: dataReferencia,
      cpf: normalizeCpf(get('cpf')),
      nome,
      situacao,
      ativo: computeAtivo(situacao, desligamento),
      admissao: toIsoDate(get('admissao')),
      desligamento,
      salario: normalizeNumberBr(get('salario')),
      conta_bancaria: normalizeText(get('conta_bancaria')),
      empresa: normalizeText(get('empresa')),
      coordenacao: normalizeText(get('coordenacao')),
      supervisao: normalizeText(get('supervisao')),
      tipo: normalizeText(get('tipo')),
      cep: normalizeText(get('cep')),
      estado: normalizeText(get('estado')),
      cidade: normalizeText(get('cidade')),
      bairro: normalizeText(get('bairro')),
      endereco: normalizeText(get('endereco')),
      complemento: normalizeText(get('complemento')),
      data_nascimento: toIsoDate(get('data_nascimento')),
      cargo: normalizeText(get('cargo')),
      whatsapp: normalizePhone(get('whatsapp')),
      email_pessoal: normalizeText(get('email_pessoal')),
      email_empresa: normalizeText(get('email_empresa')),
      payload: {}
    };
  }

  async function parseFile(file, options = {}) {
    const XLSX = await loadXlsx();
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });

    // Regra principal deste ajuste:
    // Relação/Relatório de Funcionários usa SEMPRE a data do envio/upload.
    // Não usa nome da aba e não usa nome do arquivo.
    const dataReferencia = options.dataReferencia || todayIsoLocal();
    const importacaoId = options.importacaoId || null;
    const registros = [];

    for (const sheetName of workbook.SheetNames || []) {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
      if (!rows?.length) continue;

      const headerRow = findHeaderRow(rows, ['Nome', 'CPF']);
      const header = rows[headerRow] || [];
      const headerIndex = buildHeaderIndex(header);
      const hasNome = [...(ALIASES.nome || [])].some((alias) => headerIndex.has(headerKey(alias)));
      if (!hasNome) continue;

      rows.slice(headerRow + 1).forEach((row) => {
        const mapped = mapRow(row, headerIndex, dataReferencia, importacaoId);
        if (mapped) registros.push(mapped);
      });
    }

    return {
      dataReferencia,
      total: registros.length,
      registros
    };
  }

  async function upsertHistorico(api, registros) {
    if (!api) throw new Error('Cliente Supabase/API não informado.');
    if (!Array.isArray(registros) || !registros.length) return { total: 0 };

    let total = 0;
    for (let i = 0; i < registros.length; i += BATCH_SIZE) {
      const lote = registros.slice(i, i + BATCH_SIZE);
      const { error } = await api
        .from('colaboradores_historico')
        .upsert(lote, { onConflict: 'data_referencia,chave_colaborador' });
      if (error) throw error;
      total += lote.length;
    }
    return { total };
  }

  async function importarArquivo({ file, api, dataReferencia, importacaoId } = {}) {
    if (!file) throw new Error('Arquivo não informado.');
    const parsed = await parseFile(file, { dataReferencia, importacaoId });
    const result = await upsertHistorico(api, parsed.registros);
    return {
      ok: true,
      dataReferencia: parsed.dataReferencia,
      lidos: parsed.total,
      gravados: result.total
    };
  }

  window.COLABORADORES_HISTORICO_IMPORTADOR = {
    todayIsoLocal,
    parseFile,
    upsertHistorico,
    importarArquivo
  };
})();
