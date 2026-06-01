import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import * as XLSX from 'https://cdn.sheetjs.com/xlsx-0.20.2/package/xlsx.mjs';

const RECEBER_COLUMNS = {
  situacao: ['situação', 'situacao'],
  codigo: ['código', 'codigo'],
  fatura: ['fatura'],
  cliente: ['cliente'],
  conta: ['conta'],
  emissao_nf: ['emissão n.f', 'emissao n.f', 'emissão nf', 'emissao nf'],
  vencimento: ['vencimento'],
  recebimento: ['recebimento'],
  numero_nf: ['n.f.', 'nf', 'n.f'],
  valor: ['valor'],
  desconto: ['desconto'],
  juros: ['juros'],
  valor_pago: ['valor pago']
};

const PAGAR_COLUMNS = {
  empresa: ['empresa'],
  situacao: ['situação', 'situacao'],
  cod_grupo: ['cod/grupo', 'código/grupo', 'codigo/grupo'],
  data_lancamento: ['data'],
  coordenacao: ['coordenação', 'coordenacao'],
  supervisao: ['supervisão', 'supervisao'],
  favorecido: ['favorecido'],
  cnpj_cpf: ['cnpj/cpf'],
  identificacao: ['identificação', 'identificacao'],
  categoria: ['categoria'],
  doc: ['doc'],
  vencimento: ['vencimento'],
  parcela: ['parcela'],
  valor_pago: ['v. pago', 'valor pago'],
  valor: ['valor'],
  usuario: ['usuário', 'usuario'],
  data_cadastro: ['data de cadastro']
};

const state = {
  fluxo: [],
  receber: [],
  pagar: [],
  financeiroPagamentos: [],
  pagamentosSetorFilter: 'todos',
  currentDate: new Date().toISOString().slice(0, 10),
  filters: {
    inicio: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10),
    fim: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  },
  detSort: { col: null, dir: 1 },
  detFilter: { tipo: '', situacao: '', favorecido: '', doc: '' }
};

function esc(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).slice(0, 10).split('-');
  return y && m && d ? `${d}/${m}/${y}` : String(value);
}

function brDateTime(value) {
  if (!value) return '-';
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return String(value || '-');
  return dt.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function origemPagamentoLabel(value) {
  const raw = String(value || '').trim();
  const key = normalize(raw);
  if (key.includes('compra')) return 'Compras';
  if (key.includes('hotel') || key.includes('hosped')) return 'Hospedagem';
  if (key.includes('auditoria')) return 'Auditoria';
  if (key === 'rh' || key.includes('recursos humanos')) return 'RH';
  if (key.includes('logistica')) return 'Logística';
  if (key.includes('frota')) return 'Frotas';
  return raw || '-';
}

function statusPagamentoClass(value) {
  const key = normalize(value || '');
  if (key.includes('pago') || key.includes('concluido') || key.includes('finalizado')) return 'pago';
  if (key.includes('recus') || key.includes('cancel')) return 'danger';
  if (key.includes('pend')) return 'pendente';
  return 'neutral';
}

function parseConteudoPagamento(row) {
  const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
  const linhas = String(descricaoBase || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^tipo\s*:/i.test(line))
    .filter((line) => !/^forma\s*:/i.test(line))
    .filter((line) => !/^dados\s*:/i.test(line));

  const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
  const forma = row.forma_pagamento ? `Forma: ${row.forma_pagamento}` : '';
  const fornecedor = row.fornecedor || row.favorecido || row.beneficiario || '';
  const contato = row.contato || row.contato_fornecedor || '';

  const partes = [...linhas];
  if (fornecedor && !partes.some((p) => normalize(p).startsWith('fornecedor:'))) partes.push(`Fornecedor: ${fornecedor}`);
  if (contato && !partes.some((p) => normalize(p).startsWith('contato:'))) partes.push(`Contato: ${contato}`);
  if (forma) partes.push(forma);
  if (dados) partes.push(`Dados: ${dados}`);
  if (!partes.length) partes.push(`Solicitação de ${origemPagamentoLabel(row.origem || row.setor || row.modulo_origem)}`);
  return partes.join('\n');
}

function pagamentoUrl(row) {
  const value = row.dados_pagamento || row.boleto_url || row.link_pagamento || row.comprovante_url || '';
  return /^https?:\/\//i.test(String(value)) ? String(value) : '';
}

function ensureHttps(url) {
  const s = String(url || '').trim();
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function isBoleto(row) { return /boleto/i.test(row.forma_pagamento || ''); }
function isPix(row) { return /^pix$/i.test((row.forma_pagamento || '').trim()); }

// Builds a valid PIX BR Code (EMV) payload for use in QR Codes.
// CRC-16/CCITT-FALSE: poly=0x1021, init=0xFFFF, no reflection.
function buildPixPayload(key, name, city, valor) {
  const f = (id, v) => { const s = String(v); return id + s.length.toString().padStart(2, '0') + s; };
  const toAscii = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7E]/g, ' ').replace(/\s+/g, ' ').trim();
  const mai = f('00', 'BR.GOV.BCB.PIX') + f('01', key.trim());
  let p = f('00', '01') + f('26', mai) + f('52', '0000') + f('53', '986');
  const v = parseFloat(valor); if (v > 0) p += f('54', v.toFixed(2));
  p += f('58', 'BR') + f('59', (toAscii(name) || 'Pagamento').slice(0, 25)) + f('60', (toAscii(city) || 'BRASIL').slice(0, 15)) + f('62', f('05', '***')) + '6304';
  let crc = 0xFFFF;
  for (let i = 0; i < p.length; i++) { crc ^= p.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) { crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1); crc &= 0xFFFF; } }
  return p + crc.toString(16).toUpperCase().padStart(4, '0');
}

function safeStorageFileName(name) {
  return String(name || 'comprovante')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .slice(0, 120);
}

async function uploadComprovantePagamento(file, row) {
  if (!file) throw new Error('Anexe o comprovante do pagamento.');
  const ano = new Date().getFullYear();
  const origem = safeStorageFileName(origemPagamentoLabel(row?.origem || row?.setor || row?.modulo_origem || 'financeiro')).toLowerCase();
  const path = `financeiro/comprovantes/${ano}/${origem}/${Date.now()}_${safeStorageFileName(file.name)}`;
  const { error } = await supabase.storage
    .from('notas-fiscais')
    .upload(path, file, { upsert: false, contentType: file.type || 'application/octet-stream' });
  if (error) throw new Error(`Falha ao enviar comprovante: ${error.message}`);
  const { data } = supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl || path;
}

function isMissingColumnError(error) {
  const msg = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return error?.code === 'PGRST204' || msg.includes('schema cache') || msg.includes('could not find') || msg.includes('column');
}



function nextDateISO(value) {
  const iso = String(value || '').slice(0, 10);
  const dt = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(dt.getTime())) return iso;
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10);
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const text = String(value)
    .replace(/R\$/gi, '')
    .replace(/\s/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDateISO(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed || !parsed.y || !parsed.m || !parsed.d) return null;
    if (parsed.y < 2020 || parsed.y > 2100) return null;
    return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    let [, d, m, y] = br;
    if (y.length === 2) y = `20${y}`;
    const year = Number(y);
    if (year < 2020 || year > 2100) return null;
    return `${String(year).padStart(4, '0')}-${String(Number(m)).padStart(2, '0')}-${String(Number(d)).padStart(2, '0')}`;
  }
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return null;
  const year = dt.getFullYear();
  if (year < 2020 || year > 2100) return null;
  return dt.toISOString().slice(0, 10);
}

function hashText(value) {
  let hash = 0;
  const text = normalize(value);
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return `fin_${Math.abs(hash)}_${text.length}`;
}

function pick(row, map, key) {
  const aliases = map[key] || [key];
  const rowKeys = Object.keys(row || {});
  const found = rowKeys.find((rk) => aliases.some((alias) => normalize(rk) === normalize(alias)));
  return found ? row[found] : null;
}

async function upsertChunk(table, rows, onConflict = 'unique_hash') {
  const chunkSize = 450;
  let saved = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
    saved += chunk.length;
  }
  return saved;
}

function rowToObjectsFromMatrix(matrix) {
  const rows = matrix || [];
  const headerCandidates = [
    'situacao', 'data', 'conta', 'funcionario', 'cpf', 'data de nascimento', 'valor', 'descricao',
    'categoria', 'status', 'data de solicitacao', 'coordenacao', 'supervisao', 'fornecedor', 'cidade',
    'codigo', 'fatura', 'cliente', 'vencimento', 'valor pago', 'favorecido', 'doc'
  ];

  let headerIndex = 0;
  let bestScore = -1;
  rows.slice(0, 15).forEach((row, idx) => {
    const normalizedCells = (row || []).map((cell) => normalize(cell));
    const score = normalizedCells.filter((cell) => headerCandidates.includes(cell)).length;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = idx;
    }
  });

  const headers = (rows[headerIndex] || []).map((header, idx) => String(header || `Coluna ${idx + 1}`).trim() || `Coluna ${idx + 1}`);
  return rows.slice(headerIndex + 1).map((row) => {
    const obj = {};
    headers.forEach((header, idx) => { obj[header] = row?.[idx] ?? ''; });
    return obj;
  }).filter((row) => Object.values(row).some((value) => String(value ?? '').trim() !== ''));
}

function readWorkbookRows(file) {
  return file.arrayBuffer().then((buffer) => {
    const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];
    const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: true });
    return rowToObjectsFromMatrix(matrix);
  });
}


const PAGAMENTO_VALOR_ALMOCO = 30;
const PAGAMENTO_IFOOD_CNPJ = '29.666.679/0001-34';
const ALELO_SERIE_DIGITOS = 15;

function onlyDigits(value) {
  return String(value ?? '').replace(/\D/g, '');
}

function normalizeName(value) {
  return normalize(value).replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function normConta(value) {
  return normalize(value).toUpperCase().replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function dateRangeLabel(inicio, fim) {
  if (!inicio && !fim) return 'período não informado';
  if (inicio === fim) return brDate(inicio);
  return `${brDate(inicio)} a ${brDate(fim)}`;
}

function compactDate(value) {
  return String(value || '').replace(/\D/g, '');
}

function parseDateLoose(value) {
  return toDateISO(value);
}

function formatDateForXlsx(value) {
  return value ? brDate(value) : '';
}

function buildCpfToSerieMap(rows) {
  const map = new Map();
  rows.forEach((row) => {
    const cpf = onlyDigits(row.CPF ?? row.Cpf ?? row.cpf);
    const serie = row['N de Série'] ?? row['N de Serie'] ?? row['Nº de Série'] ?? row['Nº de Serie'] ?? row['Numero de Serie'] ?? row['Número de Série'] ?? '';
    if (cpf) map.set(cpf, String(serie || '').trim());
  });
  return map;
}

function getAny(row, names = []) {
  const keys = Object.keys(row || {});
  for (const name of names) {
    const found = keys.find((key) => normalize(key) === normalize(name));
    if (found) return row[found];
  }
  return null;
}

function makeAleloRows(extratoRows, fonteRows) {
  const mapCpfToSerie = buildCpfToSerieMap(fonteRows || []);
  const alelo = [];
  const ifood = [];
  const flash = [];
  const logs = [];

  (extratoRows || []).forEach((row, index) => {
    const conta = normConta(getAny(row, ['Conta']));
    const cpf = onlyDigits(getAny(row, ['CPF']));
    const valor = toNumber(getAny(row, ['Valor']));
    const obsCompleta = String(getAny(row, ['Descrição', 'Descricao', 'Observacao', 'Observação']) || '').trim();
    const obs = obsCompleta.slice(0, 30);
    const nome = String(getAny(row, ['Funcionário', 'Funcionario', 'Nome']) || '').trim();
    const nasc = getAny(row, ['Data de Nascimento', 'Nascimento']);
    const data = parseDateLoose(getAny(row, ['Data', 'Data de Solicitação', 'Data de Solicitacao']));
    const situacao = String(getAny(row, ['Situação', 'Situacao', 'Status']) || '').trim();
    const situacaoNorm = normalize(situacao);

    if (!conta && !nome && !cpf && !valor) return;
    if (situacaoNorm && !situacaoNorm.includes('aprovada') && !situacaoNorm.includes('aprovado')) {
      logs.push({ data: data || '', funcionario: nome || '-', status: 'IGNORADO', mensagem: `Linha ${index + 2}: situação não aprovada: ${situacao || '(vazio)'}.` });
      return;
    }
    if (!conta) {
      logs.push({ data: data || '', funcionario: nome || '-', status: 'ERRO', mensagem: `Linha ${index + 2}: conta de pagamento não informada.` });
      return;
    }
    if (!valor || valor <= 0) {
      logs.push({ data: data || '', funcionario: nome || '-', status: 'ERRO', mensagem: `Linha ${index + 2}: valor ausente ou inválido.` });
      return;
    }
    if (!cpf || cpf.length !== 11) logs.push({ data: data || '', funcionario: nome || '-', status: 'ATENÇÃO', mensagem: `Linha ${index + 2}: CPF inválido ou ausente para ${nome || 'linha sem nome'}.` });

    if (conta.includes('ALELO') && (conta.includes('BVGRAIN') || conta.includes('EXCELENCIA') || conta.includes('GRAOMIL'))) {
      let serie = onlyDigits(mapCpfToSerie.get(cpf) || '');
      if (serie.length < ALELO_SERIE_DIGITOS) serie = serie.padStart(ALELO_SERIE_DIGITOS, '0');
      if (serie.length > ALELO_SERIE_DIGITOS) serie = serie.slice(0, ALELO_SERIE_DIGITOS);
      if (!serie || /^0+$/.test(serie)) logs.push({ data: data || '', funcionario: nome || cpf, status: 'Alelo', mensagem: `Número de série não localizado para ${nome || cpf}.` });
      alelo.push({ serie: `'${serie}`, cpf: `'${cpf.padStart(11, '0').slice(0, 11)}`, valor, observacao: obs, nome, data });
      return;
    }

    if (conta.includes('IFOOD') && conta.includes('GRAOMIL')) {
      ifood.push({ cnpj: PAGAMENTO_IFOOD_CNPJ, nome, cpf, nascimento: nasc, email: '', celular: '', centro_custo: '', livre: valor, data, observacao: obsCompleta });
      return;
    }

    if (conta.includes('FLASH') && conta.includes('GRAOMIL')) {
      flash.push({ cpf, valor, nome, data, observacao: obsCompleta });
      return;
    }

    logs.push({ data: data || '', funcionario: nome || '-', status: 'ERRO', mensagem: `Linha ${index + 2}: conta não reconhecida para pagamento: ${conta}.` });
  });

  return { alelo, ifood, flash, logs };
}


function isSolicitacaoDespesasFile(rows) {
  const first = (rows || [])[0] || {};
  const keys = Object.keys(first).map((key) => normalize(key));
  return keys.includes('categoria') && keys.includes('funcionario') && keys.includes('data de solicitacao');
}

function buildSolicitacaoDespesasRows(solicitacaoRows, rhMap) {
  const flashMap = new Map();
  const ifoodMap = new Map();
  const conferencia = [];
  const logs = [];

  (solicitacaoRows || []).forEach((row, index) => {
    const categoria = String(getAny(row, ['Categoria']) || '').trim();
    const categoriaNorm = normalize(categoria);
    const status = String(getAny(row, ['Status']) || '').trim();
    const statusNorm = normalize(status);
    const funcionario = String(getAny(row, ['Funcionário', 'Funcionario', 'Colaborador', 'Nome']) || '').trim();
    const dataRef = parseDateLoose(getAny(row, ['Data de Solicitação', 'Data de Solicitacao', 'Data']));
    const valor = toNumber(getAny(row, ['Valor']));
    const coordenacao = String(getAny(row, ['Coordenação', 'Coordenacao']) || '').trim();
    const supervisao = String(getAny(row, ['Supervisão', 'Supervisao']) || '').trim();
    const cidade = String(getAny(row, ['Cidade']) || '').trim();
    const fornecedor = String(getAny(row, ['Fornecedor']) || '').trim();

    if (!funcionario && !valor) return;

    const isAdiantamento = categoriaNorm.includes('solicitacao de dinheiro') || categoriaNorm.includes('adiantamento');
    const isPendente = !statusNorm || statusNorm.includes('pendente') || statusNorm.includes('aberto') || statusNorm.includes('aguardando');

    if (!isAdiantamento) {
      logs.push({ data: dataRef || '', funcionario: funcionario || '-', status: 'IGNORADO', mensagem: `Linha ${index + 2}: categoria não entra em Adiantamentos: ${categoria || '(vazio)'}.` });
      return;
    }
    if (!isPendente) {
      logs.push({ data: dataRef || '', funcionario: funcionario || '-', status: 'IGNORADO', mensagem: `Linha ${index + 2}: status não pendente: ${status || '(vazio)'}.` });
      return;
    }
    if (!funcionario) {
      logs.push({ data: dataRef || '', funcionario: '-', status: 'ERRO', mensagem: `Linha ${index + 2}: colaborador não informado.` });
      return;
    }
    if (!valor || valor <= 0) {
      logs.push({ data: dataRef || '', funcionario, status: 'ERRO', mensagem: `Linha ${index + 2}: valor ausente ou inválido.` });
      return;
    }

    const rh = rhMap.get(normalizeName(funcionario));
    if (!rh) {
      logs.push({ data: dataRef || '', funcionario, status: 'ERRO', mensagem: 'Colaborador não localizado na base RH.' });
      conferencia.push({ data: dataRef || '', funcionario, cpf: '', destino: 'Pendente', tipo: categoria || 'Adiantamento', valor, composicao: fornecedor || cidade || 'Solicitação de Despesas', coordenacao, supervisao, banco: '', observacao: 'Colaborador não localizado na base RH.' });
      return;
    }
    if (!rh.cpf || rh.cpf.length !== 11) {
      logs.push({ data: dataRef || '', funcionario: rh.nome || funcionario, status: 'ERRO', mensagem: 'CPF ausente ou inválido na base RH.' });
      conferencia.push({ data: dataRef || '', funcionario: rh.nome || funcionario, cpf: rh.cpf || '', destino: 'Pendente', tipo: categoria || 'Adiantamento', valor, composicao: fornecedor || cidade || 'Solicitação de Despesas', coordenacao: rh.coordenacao || coordenacao, supervisao: rh.supervisao || supervisao, banco: rh.banco || '', observacao: 'CPF ausente ou inválido.' });
      return;
    }

    const bancoNorm = normalize(rh.banco).replace(/\s+/g, '');
    let destino = 'Pendente';
    if (bancoNorm.includes('graomilflash') || bancoNorm.includes('flash')) destino = 'Flash';
    if (bancoNorm.includes('graomilifood') || bancoNorm.includes('ifood')) destino = 'iFood';

    const confRow = {
      data: dataRef || '',
      funcionario: rh.nome || funcionario,
      cpf: rh.cpf,
      destino,
      tipo: categoria || 'Adiantamento',
      valor: roundNumber(valor),
      composicao: [fornecedor, cidade].filter(Boolean).join(' · ') || 'Solicitação de Despesas',
      coordenacao: rh.coordenacao || coordenacao,
      supervisao: rh.supervisao || supervisao,
      banco: rh.banco || '',
      observacao: destino === 'Pendente' ? `C. Banc. Despesas sem destino reconhecido: ${rh.banco || '(vazio)'}` : 'OK'
    };
    conferencia.push(confRow);

    if (destino === 'Flash') {
      const key = rh.cpf;
      if (!flashMap.has(key)) flashMap.set(key, { cpf: rh.cpf, nome: rh.nome, valor: 0 });
      flashMap.get(key).valor = roundNumber(flashMap.get(key).valor + valor);
    } else if (destino === 'iFood') {
      const key = rh.cpf;
      if (!ifoodMap.has(key)) {
        ifoodMap.set(key, {
          cnpj: PAGAMENTO_IFOOD_CNPJ,
          nome: rh.nome,
          cpf: rh.cpf,
          nascimento: rh.nascimento || '',
          email: rh.emailEmpresa || rh.emailPessoal || '',
          celular: onlyDigits(rh.whatsapp),
          centro_custo: rh.coordenacao || coordenacao || '',
          livre: 0
        });
      }
      ifoodMap.get(key).livre = roundNumber(ifoodMap.get(key).livre + valor);
    } else {
      logs.push({ data: dataRef || '', funcionario: rh.nome || funcionario, status: 'ERRO', mensagem: confRow.observacao });
    }
  });

  return {
    conferencia: conferencia.sort((a, b) => `${a.data}|${a.funcionario}`.localeCompare(`${b.data}|${b.funcionario}`, 'pt-BR')),
    flash: Array.from(flashMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    ifood: Array.from(ifoodMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    alelo: [],
    logs
  };
}

function mapProducaoDiariaFileRows(rows, origem = 'arquivo_producao_diaria') {
  return (rows || []).map((row) => ({
    data: getAny(row, ['Data', 'Data Produção', 'Data Producao', 'Data Referência', 'Data Referencia']),
    data_referencia: getAny(row, ['Data', 'Data Produção', 'Data Producao', 'Data Referência', 'Data Referencia']),
    funcionario: getAny(row, ['Funcionário', 'Funcionario', 'Colaborador', 'Nome']),
    tipo: getAny(row, ['Tipo']) || '',
    coordenacao: getAny(row, ['Coordenação', 'Coordenacao']) || '',
    supervisao: getAny(row, ['Supervisão', 'Supervisao']) || '',
    cliente: getAny(row, ['Cliente']) || '',
    os: getAny(row, ['O.S.', 'O.S', 'OS', 'Ordem de Serviço', 'Ordem de Servico']) || '',
    cargas: getAny(row, ['Cargas']) || '',
    toneladas: getAny(row, ['Tons', 'Toneladas']) || 0,
    origem
  })).map((row) => ({ ...row, data: parseDateLoose(row.data), data_referencia: parseDateLoose(row.data_referencia) }))
    .filter((row) => row.funcionario && (row.data || row.data_referencia));
}

function filterProducaoPeriodo(rows, inicio, fim) {
  return (rows || []).filter((row) => {
    const dataRef = parseDateLoose(row.data || row.data_referencia);
    return dataRef && dataRef >= inicio && dataRef <= fim;
  });
}

function buildLatestColaboradorMap(rows) {
  const map = new Map();
  (rows || []).forEach((row) => {
    const key = normalizeName(row.nome);
    if (!key || map.has(key)) return;
    map.set(key, {
      nome: row.nome,
      cpf: onlyDigits(row.cpf).padStart(11, '0').slice(0, 11),
      salario: toNumber(row.salario),
      banco: row.conta_bancaria || row['C. Banc. Despesas'] || '',
      empresa: row.empresa || '',
      coordenacao: row.coordenacao || '',
      supervisao: row.supervisao || '',
      tipoRh: row.tipo || '',
      nascimento: row.data_nascimento || row.nascimento || '',
      whatsapp: row.whatsapp || '',
      emailPessoal: row.email_pessoal || '',
      emailEmpresa: row.email_empresa || ''
    });
  });
  return map;
}

async function loadColaboradoresPagamento(dataReferencia = null) {
  const ref = dataReferencia || document.getElementById('alimFim')?.value || state.currentDate || new Date().toISOString().slice(0, 10);
  const pageSize = 1000;
  const rows = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('colaborador_snapshot')
      .select('nome,cpf,salario,conta_bancaria,empresa,coordenacao,supervisao,tipo,data_nascimento,whatsapp,email_pessoal,email_empresa,data_referencia,ativo')
      .lte('data_referencia', ref)
      .order('data_referencia', { ascending: false, nullsFirst: false })
      .range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;
    const page = data || [];
    rows.push(...page);
    if (page.length < pageSize) break;
    from += pageSize;
  }

  return buildLatestColaboradorMap(rows || []);
}

function mapProducaoSnapshotRows(rows, origem) {
  return (rows || []).map((row) => ({
    data: row.data || row.data_referencia,
    data_referencia: row.data_referencia || row.data,
    funcionario: row.funcionario,
    tipo: row.tipo || row.tipoRh || '',
    coordenacao: row.coordenacao,
    supervisao: row.supervisao,
    cliente: row.cliente || row.cliente_final || '',
    os: row.os || '',
    toneladas: row.toneladas ?? row.tons ?? 0,
    cargas: row.cargas,
    origem
  })).filter((row) => row.funcionario && (row.data || row.data_referencia));
}

async function loadProducaoPagamento(inicio, fim) {
  // Produção Diária já importada pelo menu Importar Relatórios.
  // Não usa Resultado Diário e não exige upload dentro do Financeiro.
  const fimExclusivo = nextDateISO(fim);
  const pageSize = 1000;
  const allRows = [];
  const diagnostics = [];

  async function fetchByColumn(columnName, origem) {
    const collected = [];
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from('producao_snapshot')
        .select('data,data_referencia,funcionario,tipo,coordenacao,supervisao,cliente,os,tons,cargas')
        .gte(columnName, inicio)
        .lt(columnName, fimExclusivo)
        .order(columnName, { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = data || [];
      collected.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    diagnostics.push(`${origem}: ${collected.length} registros brutos`);
    return mapProducaoSnapshotRows(collected, origem);
  }

  const byData = await fetchByColumn('data', 'producao_snapshot.data');
  allRows.push(...byData);

  const byReferencia = await fetchByColumn('data_referencia', 'producao_snapshot.data_referencia');
  allRows.push(...byReferencia);

  const seen = new Set();
  const unique = [];
  for (const row of allRows) {
    const dataRef = parseDateLoose(row.data || row.data_referencia);
    const key = `${dataRef}|${normalizeName(row.funcionario)}|${row.os || ''}|${row.cliente || ''}`;
    if (!dataRef || seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...row, data: dataRef, data_referencia: row.data_referencia || dataRef });
  }

  if (!unique.length) {
    let ultimaData = '-';
    try {
      const { data } = await supabase
        .from('producao_snapshot')
        .select('data,data_referencia')
        .order('data_referencia', { ascending: false, nullsFirst: false })
        .limit(1);
      const row = (data || [])[0];
      ultimaData = row ? `data: ${brDate(row.data)} | data_referencia: ${brDate(row.data_referencia)}` : '-';
    } catch (_) {}
    throw new Error(`Nenhuma Produção Diária importada localizada no período selecionado. Diagnóstico: ${diagnostics.join(' | ')}. Última referência disponível: ${ultimaData}.`);
  }

  return unique;
}

function apurarProducaoPagamentoRows(producaoRows, rhMap, modo = 'alimentacao') {
  const flashMap = new Map();
  const ifoodMap = new Map();
  const conferencia = [];
  const logs = [];
  const vistosDia = new Set();
  const isModoDiarias = modo === 'diarias';

  (producaoRows || []).forEach((row) => {
    const funcionario = String(row.funcionario || '').trim();
    const dataRef = parseDateLoose(row.data);
    if (!funcionario || !dataRef) return;

    const chaveDia = `${dataRef}|${normalizeName(funcionario)}`;
    if (vistosDia.has(chaveDia)) return;
    vistosDia.add(chaveDia);

    const rh = rhMap.get(normalizeName(funcionario));
    if (!rh) {
      logs.push({ data: dataRef, funcionario, status: 'ERRO', mensagem: 'Colaborador não localizado na base RH.' });
      conferencia.push({ data: dataRef, funcionario, cpf: '', destino: 'Pendente', tipo: row.tipo || '', valor: 0, observacao: 'Colaborador não localizado na base RH.' });
      return;
    }
    if (!rh.cpf || rh.cpf.length !== 11) {
      logs.push({ data: dataRef, funcionario, status: 'ERRO', mensagem: 'CPF ausente ou inválido na base RH.' });
      conferencia.push({ data: dataRef, funcionario: rh.nome || funcionario, cpf: rh.cpf || '', destino: 'Pendente', tipo: row.tipo || rh.tipoRh || '', valor: 0, observacao: 'CPF ausente ou inválido.' });
      return;
    }

    const tipoProd = String(rh.tipoRh || row.tipo || '').trim();
    const isDiarista = normalize(tipoProd).includes('diarista');

    let valor = 0;
    let composicao = '';

    if (isModoDiarias) {
      if (!isDiarista) return;
      if (!rh.salario || rh.salario <= 0) {
        logs.push({ data: dataRef, funcionario: rh.nome || funcionario, status: 'ERRO', mensagem: 'Contrato Diarista, mas salário/diária não encontrado no RH.' });
        conferencia.push({ data: dataRef, funcionario: rh.nome || funcionario, cpf: rh.cpf, destino: 'Pendente', tipo: tipoProd, valor: 0, observacao: 'Diarista sem valor de diária no RH.' });
        return;
      }
      valor = rh.salario;
      composicao = `Diária ${money(rh.salario)}`;
    } else {
      valor = PAGAMENTO_VALOR_ALMOCO;
      composicao = `Almoço ${money(PAGAMENTO_VALOR_ALMOCO)}`;
    }

    const bancoNorm = normalize(rh.banco).replace(/\s+/g, '');
    let destino = 'Pendente';
    if (bancoNorm.includes('graomilflash') || bancoNorm.includes('flash')) destino = 'Flash';
    if (bancoNorm.includes('graomilifood') || bancoNorm.includes('ifood')) destino = 'iFood';

    const confRow = {
      data: dataRef,
      funcionario: rh.nome || funcionario,
      cpf: rh.cpf,
      destino,
      tipo: tipoProd,
      valor: roundNumber(valor),
      composicao,
      coordenacao: rh.coordenacao || row.coordenacao || '',
      supervisao: rh.supervisao || row.supervisao || '',
      banco: rh.banco || '',
      observacao: destino === 'Pendente' ? `C. Banc. Despesas sem destino reconhecido: ${rh.banco || '(vazio)'}` : 'OK'
    };
    conferencia.push(confRow);

    if (destino === 'Flash') {
      const key = rh.cpf;
      if (!flashMap.has(key)) flashMap.set(key, { cpf: rh.cpf, nome: rh.nome, valor: 0 });
      flashMap.get(key).valor = roundNumber(flashMap.get(key).valor + valor);
    } else if (destino === 'iFood') {
      const key = rh.cpf;
      if (!ifoodMap.has(key)) {
        ifoodMap.set(key, {
          cnpj: PAGAMENTO_IFOOD_CNPJ,
          nome: rh.nome,
          cpf: rh.cpf,
          nascimento: rh.nascimento || '',
          email: rh.emailEmpresa || rh.emailPessoal || '',
          celular: onlyDigits(rh.whatsapp),
          centro_custo: rh.coordenacao || '',
          livre: 0
        });
      }
      ifoodMap.get(key).livre = roundNumber(ifoodMap.get(key).livre + valor);
    } else {
      logs.push({ data: dataRef, funcionario: rh.nome || funcionario, status: 'ERRO', mensagem: confRow.observacao });
    }
  });

  return {
    conferencia: conferencia.sort((a, b) => `${a.data}|${a.funcionario}`.localeCompare(`${b.data}|${b.funcionario}`, 'pt-BR')),
    flash: Array.from(flashMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    ifood: Array.from(ifoodMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    logs
  };
}

function apurarAlimentacaoRows(producaoRows, rhMap) {
  return apurarProducaoPagamentoRows(producaoRows, rhMap, 'alimentacao');
}

function apurarDiariasRows(producaoRows, rhMap) {
  return apurarProducaoPagamentoRows(producaoRows, rhMap, 'diarias');
}

function roundNumber(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}


function paymentStatusClass(value) {
  const s = normalize(value || 'OK');
  if (s === 'pago') return 'pago';
  if (s === 'pendente') return 'pendente';
  if (s.includes('erro')) return 'danger';
  return 'ok';
}

function makePaymentHash(row) {
  return hashText([
    row.data || '', row.funcionario || '', row.cpf || '', row.destino || '', row.tipo || '', row.valor || 0, row.composicao || ''
  ].join('|'));
}

function normalizePaymentRows(apuracao = {}, defaultStatus = 'OK') {
  const status = ['OK', 'PENDENTE'].includes(String(defaultStatus || '').toUpperCase()) ? String(defaultStatus).toUpperCase() : 'OK';
  const conferencia = (apuracao.conferencia || []).map((row) => ({
    ...row,
    unique_hash: row.unique_hash || makePaymentHash(row),
    status_pagamento: row.status_pagamento || (normalize(row.observacao).includes('ok') ? status : status)
  }));
  return { ...apuracao, conferencia };
}

function buildPaymentOutputs(conferencia = []) {
  const okRows = (conferencia || []).filter((row) => String(row.status_pagamento || 'OK').toUpperCase() === 'OK');
  const flashMap = new Map();
  const ifoodMap = new Map();
  const alelo = [];

  okRows.forEach((row) => {
    const destinoNorm = normalize(row.destino);
    const cpf = onlyDigits(row.cpf).padStart(11, '0').slice(0, 11);
    const valor = roundNumber(row.valor);
    if (!cpf || cpf.length !== 11 || !valor) return;
    if (destinoNorm.includes('flash')) {
      if (!flashMap.has(cpf)) flashMap.set(cpf, { cpf, nome: row.funcionario, valor: 0 });
      flashMap.get(cpf).valor = roundNumber(flashMap.get(cpf).valor + valor);
      return;
    }
    if (destinoNorm.includes('ifood')) {
      if (!ifoodMap.has(cpf)) {
        ifoodMap.set(cpf, {
          cnpj: PAGAMENTO_IFOOD_CNPJ,
          nome: row.funcionario,
          cpf,
          nascimento: row.nascimento || '',
          email: row.email || '',
          celular: row.celular || '',
          centro_custo: row.coordenacao || row.supervisao || '',
          livre: 0
        });
      }
      ifoodMap.get(cpf).livre = roundNumber(ifoodMap.get(cpf).livre + valor);
      return;
    }
    if (destinoNorm.includes('alelo')) {
      alelo.push({ serie: row.serie || '', cpf, valor, observacao: row.composicao || row.observacao || '', nome: row.funcionario });
    }
  });

  return {
    flash: Array.from(flashMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    ifood: Array.from(ifoodMap.values()).sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR')),
    alelo,
    okRows
  };
}

async function fetchAlreadyPaidMap(hashes = []) {
  const result = new Map();
  const clean = [...new Set((hashes || []).filter(Boolean))];
  if (!clean.length) return result;
  for (let i = 0; i < clean.length; i += 500) {
    const slice = clean.slice(i, i + 500);
    const { data, error } = await supabase
      .from('financeiro_pagamentos_linhas')
      .select('unique_hash,status,pago_em')
      .in('unique_hash', slice);
    if (error) {
      console.warn('[Financeiro] Tabela financeiro_pagamentos_linhas indisponível:', error.message);
      return result;
    }
    (data || []).forEach((row) => {
      if (String(row.status || '').toUpperCase() === 'PAGO') result.set(row.unique_hash, row);
    });
  }
  return result;
}

async function syncPaidStatus(apuracao = {}) {
  const rows = apuracao.conferencia || [];
  const paid = await fetchAlreadyPaidMap(rows.map((row) => row.unique_hash));
  if (!paid.size) return apuracao;
  return {
    ...apuracao,
    conferencia: rows.map((row) => paid.has(row.unique_hash) ? { ...row, status_pagamento: 'PAGO', observacao: 'PAGO - bloqueado para evitar duplicidade' } : row)
  };
}

function groupNotasFiscaisResumo(rows = [], execucaoId = null) {
  const map = new Map();
  rows.forEach((row) => {
    const regional = row.coordenacao || row.supervisao || 'Sem regional';
    const destino = row.destino || 'Pagamento';
    const key = `${regional}|${destino}`;
    if (!map.has(key)) map.set(key, { pagamento_execucao_id: execucaoId, data_pagamento: new Date().toISOString().slice(0, 10), regional, destino, valor_total: 0, quantidade: 0, modulo_origem: 'FINANCEIRO' });
    const item = map.get(key);
    item.valor_total = roundNumber(item.valor_total + Number(row.valor || 0));
    item.quantidade += 1;
  });
  return Array.from(map.values());
}

function worksheetFromObjects(rows, columns) {
  const data = [columns.map((c) => c.label)];
  rows.forEach((row) => data.push(columns.map((c) => c.format ? c.format(row[c.key], row) : row[c.key])));
  return XLSX.utils.aoa_to_sheet(data);
}

function downloadWorkbook(filename, sheets) {
  const wb = XLSX.utils.book_new();
  sheets.forEach((sheet) => {
    XLSX.utils.book_append_sheet(wb, sheet.ws, sheet.name.slice(0, 31));
  });
  XLSX.writeFile(wb, filename);
}

function downloadCsv(filename, rows, columns) {
  const sep = ';';
  const escCsv = (value) => {
    const text = String(value ?? '');
    return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [columns.map((c) => escCsv(c.label)).join(sep)];
  rows.forEach((row) => lines.push(columns.map((c) => escCsv(c.format ? c.format(row[c.key], row) : row[c.key])).join(sep)));
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function mapReceber(rows, fileName) {
  return rows.map((row) => {
    const payload = {
      situacao: pick(row, RECEBER_COLUMNS, 'situacao') || null,
      codigo: String(pick(row, RECEBER_COLUMNS, 'codigo') || '').trim() || null,
      fatura: String(pick(row, RECEBER_COLUMNS, 'fatura') || '').trim() || null,
      cliente: String(pick(row, RECEBER_COLUMNS, 'cliente') || '').trim() || null,
      conta: String(pick(row, RECEBER_COLUMNS, 'conta') || '').trim() || null,
      emissao_nf: toDateISO(pick(row, RECEBER_COLUMNS, 'emissao_nf')),
      vencimento: toDateISO(pick(row, RECEBER_COLUMNS, 'vencimento')),
      recebimento: toDateISO(pick(row, RECEBER_COLUMNS, 'recebimento')),
      numero_nf: String(pick(row, RECEBER_COLUMNS, 'numero_nf') || '').trim() || null,
      valor: toNumber(pick(row, RECEBER_COLUMNS, 'valor')),
      desconto: toNumber(pick(row, RECEBER_COLUMNS, 'desconto')),
      juros: toNumber(pick(row, RECEBER_COLUMNS, 'juros')),
      valor_pago: toNumber(pick(row, RECEBER_COLUMNS, 'valor_pago')),
      arquivo_origem: fileName,
      raw: row
    };
    payload.unique_hash = hashText([payload.codigo, payload.fatura, payload.cliente, payload.vencimento, payload.valor].join('|'));
    return payload;
  }).filter((row) => row.vencimento && (row.codigo || row.fatura || row.cliente) && row.valor !== 0);
}

function mapPagar(rows, fileName) {
  return rows.map((row) => {
    const payload = {
      empresa: String(pick(row, PAGAR_COLUMNS, 'empresa') || '').trim() || null,
      situacao: pick(row, PAGAR_COLUMNS, 'situacao') || null,
      cod_grupo: String(pick(row, PAGAR_COLUMNS, 'cod_grupo') || '').trim() || null,
      data_lancamento: toDateISO(pick(row, PAGAR_COLUMNS, 'data_lancamento')),
      coordenacao: String(pick(row, PAGAR_COLUMNS, 'coordenacao') || '').trim() || null,
      supervisao: String(pick(row, PAGAR_COLUMNS, 'supervisao') || '').trim() || null,
      favorecido: String(pick(row, PAGAR_COLUMNS, 'favorecido') || '').trim() || null,
      cnpj_cpf: String(pick(row, PAGAR_COLUMNS, 'cnpj_cpf') || '').trim() || null,
      identificacao: String(pick(row, PAGAR_COLUMNS, 'identificacao') || '').trim() || null,
      categoria: String(pick(row, PAGAR_COLUMNS, 'categoria') || '').trim() || null,
      doc: String(pick(row, PAGAR_COLUMNS, 'doc') || '').trim() || null,
      vencimento: toDateISO(pick(row, PAGAR_COLUMNS, 'vencimento')),
      parcela: String(pick(row, PAGAR_COLUMNS, 'parcela') || '').trim() || null,
      valor_pago: toNumber(pick(row, PAGAR_COLUMNS, 'valor_pago')),
      valor: toNumber(pick(row, PAGAR_COLUMNS, 'valor')),
      usuario: String(pick(row, PAGAR_COLUMNS, 'usuario') || '').trim() || null,
      data_cadastro: toDateISO(pick(row, PAGAR_COLUMNS, 'data_cadastro')),
      arquivo_origem: fileName,
      raw: row
    };
    payload.unique_hash = hashText([payload.empresa, payload.cod_grupo, payload.favorecido, payload.doc, payload.vencimento, payload.parcela, payload.valor].join('|'));
    return payload;
  }).filter((row) => row.vencimento && (row.favorecido || row.doc || row.cod_grupo) && row.valor !== 0);
}

function statusClass(value) {
  return normalize(value).includes('atencao') || normalize(value).includes('atenção') ? 'danger' : 'ok';
}

initProtectedPage('Financeiro', (content, userContext) => {
  content.innerHTML = `
    <style>
      .fin-wrap{display:grid;gap:20px}.fin-hero{border:1px solid rgba(148,163,184,.18);border-radius:24px;padding:22px;background:linear-gradient(135deg,rgba(15,23,42,.96),rgba(22,101,52,.28));box-shadow:0 20px 50px rgba(2,6,23,.22)}
      .fin-hero h2{margin:0 0 6px;font-size:28px;color:#f8fafc}.fin-hero p{margin:0;color:#cbd5e1}.fin-actions-row{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.fin-grid{display:grid;grid-template-columns:repeat(5,minmax(140px,1fr));gap:12px}.fin-kpi{border:1px solid rgba(148,163,184,.16);border-radius:20px;padding:16px;background:rgba(15,23,42,.86)}.fin-kpi span{display:block;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:.08em}.fin-kpi strong{display:block;margin-top:8px;color:#f8fafc;font-size:22px}.fin-kpi small{color:#6b7280}.fin-card{border:1px solid rgba(148,163,184,.13);border-radius:24px;background:rgba(8,15,26,.75);padding:20px 22px;box-shadow:0 20px 50px rgba(2,6,23,.22);backdrop-filter:blur(10px)}
      .fin-head{display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:18px;padding-bottom:16px;border-bottom:1px solid rgba(148,163,184,.1)}.fin-head h3{margin:0;color:#f8fafc;font-size:17px;font-weight:700;letter-spacing:-.01em}.fin-head p{margin:3px 0 0;color:#64748b;font-size:13px}.pay-grid{display:grid;grid-template-columns:repeat(2,minmax(280px,1fr));gap:14px}.pay-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(2,6,23,.34);padding:16px}.pay-card h4{margin:0 0 6px;color:#f8fafc;font-size:18px}.pay-card p{margin:0 0 14px;color:#6b7280}.pay-summary{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:10px;margin:14px 0}.pay-mini{border:1px solid rgba(148,163,184,.14);border-radius:16px;padding:12px;background:rgba(15,23,42,.7)}.pay-mini span{display:block;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.pay-mini strong{display:block;margin-top:5px;color:#f8fafc;font-size:18px}.pay-subtabs{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0}.pay-subtab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:7px 13px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s}.pay-subtab:hover{color:#e2e8f0;background:rgba(15,23,42,.85)}.pay-subtab.active{background:linear-gradient(135deg,#14532d,#166534);color:#fff;border-color:transparent;box-shadow:0 2px 8px rgba(22,101,52,.35)}.pay-table{display:none}.pay-table.active{display:block}@media(max-width:1100px){.pay-grid,.pay-summary{grid-template-columns:1fr 1fr}}@media(max-width:700px){.pay-grid,.pay-summary{grid-template-columns:1fr}}.fin-tabs{display:flex;gap:4px;flex-wrap:wrap}.fin-tab{border:1px solid rgba(148,163,184,.13);background:rgba(15,23,42,.5);color:#64748b;border-radius:10px;padding:8px 14px;cursor:pointer;font-size:13px;font-weight:600;transition:all .14s;letter-spacing:.01em}.fin-tab:hover{color:#e2e8f0;background:rgba(15,23,42,.85);border-color:rgba(148,163,184,.25)}.fin-tab.active{background:linear-gradient(135deg,#166534,#16a34a);color:#fff;border-color:transparent;font-weight:700;box-shadow:0 2px 10px rgba(22,101,52,.4)}.fin-panel{display:none}.fin-panel.active{display:block}.fin-form{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px}.fin-field{display:grid;gap:6px}.fin-field.full{grid-column:1/-1}.fin-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}.fin-field input,.fin-field select,.fin-field textarea{width:100%;border:1px solid rgba(148,163,184,.18);border-radius:11px;background:rgba(15,23,42,.8);color:#e2e2f0;padding:10px 13px;color-scheme:dark;transition:border-color .14s}.fin-field input:focus,.fin-field select:focus,.fin-field textarea:focus{outline:0;border-color:rgba(52,211,153,.45);box-shadow:0 0 0 3px rgba(52,211,153,.08)}.fin-field textarea{min-height:78px;resize:vertical}.fin-table-wrap{overflow:auto;border-radius:18px;border:1px solid rgba(148,163,184,.14)}.fin-table{width:100%;border-collapse:collapse;min-width:860px}.fin-table th,.fin-table td{padding:12px 14px;border-bottom:1px solid rgba(148,163,184,.08);text-align:left;color:#e2e8f0;font-size:14px}.fin-table th{background:rgba(8,15,26,.96);color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;position:sticky;top:0;z-index:1}.fin-table tbody tr:hover td{background:rgba(34,197,94,.05)}.fin-table tbody tr:nth-child(even) td{background:rgba(255,255,255,.015)}.fin-muted{display:block;color:#6b7280;font-size:12px;margin-top:3px}.fin-status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800}.fin-status.ok{background:rgba(34,197,94,.14);color:#86efac}.fin-status.danger{background:rgba(239,68,68,.14);color:#fecaca}.fin-status.neutral{background:rgba(148,163,184,.14);color:#cbd5e1}.fin-import-grid{display:grid;grid-template-columns:repeat(2,minmax(260px,1fr));gap:14px}.fin-drop{border:1px dashed rgba(34,197,94,.35);border-radius:16px;padding:18px;background:rgba(22,101,52,.08);transition:border-color .14s,background .14s}.fin-drop:hover{border-color:rgba(34,197,94,.55);background:rgba(22,101,52,.14)}.pay-upload{border:1px dashed rgba(34,197,94,.45);border-radius:18px;background:rgba(22,101,52,.08);padding:14px;min-height:78px;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;transition:.16s ease}.pay-upload:hover,.pay-upload.dragging{border-color:#22c55e;background:rgba(22,101,52,.18);transform:translateY(-1px)}.pay-upload input{display:none}.pay-upload strong{display:block;color:#e2e2f0;font-size:13px}.pay-upload span{display:block;color:#6b7280;font-size:12px;margin-top:4px;word-break:break-word}.pay-upload.has-file{border-style:solid;background:rgba(34,197,94,.14)}.fin-feedback{color:#6b7280;font-size:13px}.fin-feedback.ok{color:#86efac}.fin-feedback.err{color:#fecaca}.fin-empty{text-align:center;color:#6b7280;padding:24px!important}.fin-small{padding:8px 12px!important;font-size:13px!important}@media(max-width:1100px){.fin-grid{grid-template-columns:repeat(2,1fr)}.fin-form,.fin-import-grid{grid-template-columns:1fr}}@media(max-width:700px){.fin-grid{grid-template-columns:1fr}.fin-head{display:grid}}

      .pay-mode-switch{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}.pay-mode-btn{border:1px solid rgba(148,163,184,.15);background:rgba(15,23,42,.6);color:#6b7280;border-radius:12px;padding:11px 18px;font-weight:700;font-size:13px;cursor:pointer;transition:all .14s;letter-spacing:.02em}.pay-mode-btn:hover{color:#e2e8f0;background:rgba(15,23,42,.9)}.pay-mode-btn.active{background:linear-gradient(135deg,#166534,#16a34a);color:#fff;border-color:transparent;box-shadow:0 3px 12px rgba(22,101,52,.35)}.pay-mode-panel{display:none}.pay-mode-panel.active{display:block}.pay-toolbar{display:flex;align-items:end;justify-content:space-between;gap:14px;flex-wrap:wrap;margin:14px 0}.pay-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(150px,1fr));gap:12px;align-items:end}.pay-status-toggle{display:inline-flex;align-items:stretch;min-width:168px;overflow:hidden;border:2px solid rgba(226,232,240,.78);border-radius:999px;background:#020617;box-shadow:inset 0 0 0 1px rgba(15,23,42,.75)}.pay-status-btn{flex:1;border:0;background:transparent;color:#e2e2f0;padding:9px 14px;font-weight:900;font-size:12px;letter-spacing:.02em;cursor:pointer;transition:background .16s ease,color .16s ease,transform .16s ease}.pay-status-btn + .pay-status-btn{border-left:2px solid rgba(226,232,240,.78)}.pay-status-btn:hover{filter:brightness(1.06)}.pay-status-btn.active-ok{background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16}.pay-status-btn.active-pendente{background:linear-gradient(135deg,#dc2626,#ef4444);color:#fff7f7}.pay-status-btn.is-inactive{background:#0d0d18;color:#cbd5e1}.pay-status-paid{display:inline-flex;align-items:center;justify-content:center;min-width:168px;padding:9px 14px;border-radius:999px;border:2px solid rgba(59,130,246,.4);background:linear-gradient(135deg,rgba(29,78,216,.25),rgba(59,130,246,.2));color:#bfdbfe;font-size:12px;font-weight:900;letter-spacing:.04em}.pay-footer{position:sticky;bottom:12px;z-index:2;margin-top:16px;border:1px solid rgba(34,197,94,.24);border-radius:20px;background:rgba(2,6,23,.94);backdrop-filter:blur(12px);padding:14px;display:flex;align-items:center;justify-content:space-between;gap:14px;box-shadow:0 18px 45px rgba(2,6,23,.38)}.pay-footer strong{display:block;color:#f8fafc}.pay-footer span{display:block;color:#6b7280;font-size:12px;margin-top:3px}.btn-pay-final{border:0;border-radius:16px;background:linear-gradient(135deg,#16a34a,#22c55e);color:#052e16;font-weight:1000;padding:14px 28px;cursor:pointer}.btn-pay-final:disabled{opacity:.45;cursor:not-allowed}.pay-note{border:1px solid rgba(59,130,246,.24);background:rgba(37,99,235,.10);border-radius:16px;padding:12px;color:#bfdbfe;font-size:13px}.fin-status.pendente{background:rgba(245,158,11,.14);color:#fde68a}.fin-status.pago{background:rgba(59,130,246,.14);color:#bfdbfe}@media(max-width:900px){.pay-filter-grid{grid-template-columns:1fr 1fr}.pay-footer{position:static;display:grid}.btn-pay-final{width:100%}}@media(max-width:620px){.pay-filter-grid{grid-template-columns:1fr}.pay-status-toggle,.pay-status-paid{min-width:138px}}.pay-search-panel{margin:14px 0;display:grid;grid-template-columns:minmax(260px,1fr) auto;gap:10px;align-items:end}.pay-search-field{display:grid;gap:6px}.pay-search-field label{font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em}.pay-search-input{width:100%;border:1px solid rgba(148,163,184,.22);border-radius:14px;background:#0d0d18;color:#e2e2f0;padding:12px 14px;color-scheme:dark}.pay-search-count{color:#6b7280;font-size:12px;margin-top:4px}@media(max-width:620px){.pay-search-panel{grid-template-columns:1fr}}

      .fin-setor-filter{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.fin-setor-btn{border:1px solid rgba(148,163,184,.22);background:#08111f;color:#cbd5e1;border-radius:999px;padding:9px 14px;font-weight:900;cursor:pointer}.fin-setor-btn.active{background:#166534;color:#fff;border-color:#22c55e}.fin-setor-btn.fin-setor-pago{border-color:rgba(34,197,94,.4);color:#4ade80}.fin-setor-btn.fin-setor-pago.active{background:#14532d;color:#4ade80;border-color:#4ade80}.fin-text-block{white-space:pre-wrap;line-height:1.45}.fin-pay-actions{display:flex;gap:8px;flex-wrap:wrap}.fin-pay-actions a{text-decoration:none}

      .fin-pay-modal{position:fixed;inset:0;background:rgba(2,6,23,.72);z-index:9999;display:none;align-items:center;justify-content:center;padding:20px}.fin-pay-modal.open{display:flex}.fin-pay-modal-card{width:min(820px,100%);max-height:90vh;overflow:auto;border:1px solid rgba(148,163,184,.22);border-radius:22px;background:#15152a;color:#e2e2f0;padding:20px;box-shadow:0 24px 70px rgba(2,6,23,.45)}.fin-pay-preview{border:1px solid rgba(148,163,184,.16);border-radius:16px;background:rgba(15,23,42,.58);padding:14px}.mt-16{margin-top:16px}

      .cf-header{display:flex;align-items:center;flex-wrap:wrap;gap:10px;border:1px solid rgba(148,163,184,.12);border-radius:18px;padding:13px 18px;background:rgba(8,15,26,.72);backdrop-filter:blur(14px)}
      .cf-balance-block{display:flex;align-items:center;gap:12px;padding-right:14px;border-right:1px solid rgba(52,211,153,.15);flex-shrink:0}
      .cf-balance-label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#6ee7b7;display:block}
      .cf-balance-value{font-size:24px;font-weight:900;color:#f8fafc;line-height:1;display:block;white-space:nowrap;letter-spacing:-.02em}
      .cf-balance-sub{font-size:10px;color:#475569;display:block;margin-top:1px}
      .cf-right-block{display:flex;align-items:center;gap:8px;flex:1;flex-wrap:wrap;justify-content:space-between}
      .cf-kpi-row{display:flex;gap:5px;flex-wrap:wrap}
      .cf-kpi-pill{border:0!important;border-radius:10px!important;padding:8px 11px!important;background:rgba(15,23,42,.65)!important;transition:background .14s}
      .cf-kpi-pill:hover{background:rgba(15,23,42,.9)!important}
      .cf-kpi-pill span{display:block;color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700}
      .cf-kpi-pill strong{display:block;margin-top:2px;color:#f8fafc;font-size:15px;font-weight:900}
      .cf-kpi-pill small{display:none}
      .cf-kpi-pill.cf-receber strong{color:#86efac}
      .cf-kpi-pill.cf-pagar strong{color:#fca5a5}
      .cf-kpi-pill.cf-projected small.ok-label{color:#4ade80}
      .cf-kpi-pill.cf-projected small.danger-label{color:#f87171}
      .cf-actions-row{display:flex;gap:6px;flex-wrap:wrap}
      .cf-flow-mini{display:grid;grid-template-columns:repeat(3,1fr) 2fr;gap:12px;margin-bottom:18px;padding:16px;border:1px solid rgba(148,163,184,.1);border-radius:16px;background:rgba(8,15,26,.5);backdrop-filter:blur(8px)}
      .cf-flow-mini-item{display:flex;flex-direction:column;gap:4px}
      .cf-flow-mini-item .cf-fm-label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#64748b;font-weight:700}
      .cf-flow-mini-item .cf-fm-val{font-size:20px;font-weight:900;color:#f8fafc}
      .cf-flow-mini-item.cf-fm-receber .cf-fm-val{color:#86efac}
      .cf-flow-mini-item.cf-fm-pagar .cf-fm-val{color:#fca5a5}
      .cf-flow-mini-item.cf-fm-liquido .cf-fm-val{color:#93c5fd}
      .cf-flow-bar-wrap{display:flex;flex-direction:column;justify-content:center;gap:6px}
      .cf-flow-bar-label{font-size:10px;text-transform:uppercase;letter-spacing:.09em;color:#64748b;font-weight:700}
      .cf-flow-bar-track{height:8px;border-radius:999px;background:rgba(148,163,184,.1);overflow:hidden;display:flex}
      .cf-flow-bar-recv{height:100%;background:linear-gradient(90deg,#16a34a,#4ade80);transition:width .4s ease}
      .cf-flow-bar-pay{height:100%;background:linear-gradient(90deg,#dc2626,#f87171);transition:width .4s ease}
      @media(max-width:900px){.cf-balance-block{border-right:none;border-bottom:1px solid rgba(52,211,153,.12);padding-right:0;padding-bottom:10px;width:100%}.cf-flow-mini{grid-template-columns:repeat(2,1fr)}}
      @media(max-width:640px){.cf-flow-mini{grid-template-columns:1fr 1fr}}

      .dash-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.dash-kpi-card{border-radius:22px;padding:20px;display:flex;align-items:center;gap:16px;border:1px solid rgba(148,163,184,.16);transition:transform .18s,box-shadow .18s}.dash-kpi-card:hover{transform:translateY(-3px);box-shadow:0 24px 50px rgba(2,6,23,.3)}.dash-kpi-saldo{background:linear-gradient(135deg,rgba(6,78,59,.55),rgba(4,47,46,.4));border-color:rgba(52,211,153,.22)}.dash-kpi-receber{background:linear-gradient(135deg,rgba(76,29,149,.5),rgba(46,16,101,.4));border-color:rgba(167,139,250,.22)}.dash-kpi-pagar{background:linear-gradient(135deg,rgba(127,29,29,.5),rgba(69,10,10,.4));border-color:rgba(252,165,165,.22)}.dash-kpi-projetado{background:linear-gradient(135deg,rgba(120,53,15,.5),rgba(69,26,3,.4));border-color:rgba(253,186,116,.22)}.dash-kpi-icon-wrap{width:48px;height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0}.dash-kpi-saldo .dash-kpi-icon-wrap{background:rgba(52,211,153,.18)}.dash-kpi-receber .dash-kpi-icon-wrap{background:rgba(167,139,250,.18)}.dash-kpi-pagar .dash-kpi-icon-wrap{background:rgba(252,165,165,.18)}.dash-kpi-projetado .dash-kpi-icon-wrap{background:rgba(253,186,116,.18)}.dash-kpi-info{flex:1;min-width:0}.dash-kpi-label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;font-weight:700}.dash-kpi-value{display:block;font-size:22px;font-weight:900;color:#f8fafc;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-kpi-change{display:inline-flex;align-items:center;gap:4px;font-size:12px;font-weight:700;margin-top:5px;padding:3px 8px;border-radius:999px}.dash-kpi-change.up{background:rgba(34,197,94,.15);color:#86efac}.dash-kpi-change.down{background:rgba(239,68,68,.15);color:#fca5a5}.dash-kpi-change.neutral{background:rgba(148,163,184,.12);color:#6b7280}.dash-charts-row{display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:18px}.dash-chart-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:20px}.dash-chart-card h3{margin:0;color:#f8fafc;font-size:16px}.dash-chart-card p{margin:3px 0 14px;color:#64748b;font-size:12px}.dash-chart-inner{position:relative;height:220px}.dash-bottom-row{display:grid;grid-template-columns:1fr;gap:16px}.dash-transactions-card{border:1px solid rgba(148,163,184,.16);border-radius:22px;background:rgba(15,23,42,.82);padding:20px}.dash-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px}.dash-section-head h3{margin:0;color:#f8fafc;font-size:16px}.dash-tx-list{display:flex;flex-direction:column;gap:2px}.dash-tx-row{display:grid;grid-template-columns:36px 1fr auto auto;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;transition:background .14s}.dash-tx-row:hover{background:rgba(255,255,255,.04)}.dash-tx-icon{width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;flex-shrink:0}.dash-tx-icon.receber{background:rgba(52,211,153,.14);color:#34d399}.dash-tx-icon.pagar{background:rgba(252,165,165,.14);color:#f87171}.dash-tx-name{font-weight:600;color:#e2e8f0;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.dash-tx-sub{font-size:12px;color:#64748b;margin-top:1px}.dash-tx-date{font-size:12px;color:#64748b;text-align:right;white-space:nowrap}.dash-tx-value{font-weight:700;font-size:14px;text-align:right;white-space:nowrap}.dash-tx-value.receber{color:#86efac}.dash-tx-value.pagar{color:#fca5a5}.dash-loading{text-align:center;color:#64748b;padding:32px;font-size:14px}@media(max-width:1100px){.dash-kpi-grid{grid-template-columns:1fr 1fr}.dash-charts-row{grid-template-columns:1fr}}@media(max-width:640px){.dash-kpi-grid{grid-template-columns:1fr}}
      .spay-items{display:flex;flex-direction:column;gap:2px;margin-bottom:5px;font-size:13px;color:#e2e8f0}
      .spay-meta{font-size:13px;color:#e2e8f0;margin-top:3px;display:flex;align-items:baseline;gap:5px}
      .spay-meta-label{color:#64748b;font-size:10px;text-transform:uppercase;letter-spacing:.08em;font-weight:700;flex-shrink:0}
      .spay-link{color:#38bdf8;text-decoration:none;word-break:break-all}
      .spay-link:hover{text-decoration:underline}
      .spay-empty{color:#64748b;font-size:13px}
      .fin-btn-recusar{border:1px solid rgba(220,38,38,.3);background:rgba(220,38,38,.1);color:#fca5a5;border-radius:10px;padding:7px 12px;font-size:12px;font-weight:700;cursor:pointer;transition:all .14s;white-space:nowrap}
      .fin-btn-recusar:hover{background:rgba(220,38,38,.22);border-color:rgba(220,38,38,.5);color:#fecaca}
      .fin-det-filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px;align-items:center}
      .fin-det-filters select,.fin-det-filters input{border:1px solid rgba(148,163,184,.18);border-radius:10px;background:rgba(15,23,42,.8);color:#e5e7eb;padding:8px 12px;font-size:13px;color-scheme:dark;transition:border-color .14s;outline:0}
      .fin-det-filters select:focus,.fin-det-filters input:focus{border-color:rgba(52,211,153,.45);box-shadow:0 0 0 3px rgba(52,211,153,.08)}
      .det-th-sort{cursor:pointer;user-select:none;white-space:nowrap;transition:color .14s}
      .det-th-sort:hover{color:#e2e8f0!important}
      .det-th-active{color:#34d399!important}
      .det-sort-icon{margin-left:4px;opacity:.6;font-size:10px}
      .det-th-active .det-sort-icon{opacity:1;color:#34d399}
    </style>
    <section class="fin-wrap">
      <div class="cf-header">
        <div class="cf-balance-block">
          <div class="cf-balance-label">Saldo do dia</div>
          <div class="cf-balance-value" id="kpiSaldo">R$ 0,00</div>
          <div class="cf-balance-sub">Manual · hoje</div>
        </div>
        <div class="cf-right-block">
          <div class="cf-kpi-row">
            <article class="fin-kpi cf-kpi-pill cf-receber"><span>A Receber</span><strong id="kpiReceber">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill cf-pagar"><span>A Pagar</span><strong id="kpiPagar">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill"><span>Provisão</span><strong id="kpiProvisao">R$ 0,00</strong><small>–</small></article>
            <article class="fin-kpi cf-kpi-pill cf-projected"><span>Saldo Projetado</span><strong id="kpiProjetado">R$ 0,00</strong><small id="kpiStatus">OK</small></article>
          </div>
          <div class="cf-actions-row">
            <button class="btn btn-primary" id="btnReload" type="button">Atualizar fluxo</button>
            <button class="btn btn-secondary" data-tab-target="importar" type="button">Importar relatórios</button>
            <button class="btn btn-secondary" data-tab-target="config" type="button">Saldo e Provisão</button>
            <button class="btn btn-secondary" data-tab-target="despesas" type="button">Despesas</button>
            <button class="btn btn-secondary" data-tab-target="pagamentos" type="button">Pagamentos</button>
          </div>
        </div>
      </div>

      <article class="fin-card">
        <div class="fin-head">
          <div><h3>Fluxo de Caixa</h3><p>Selecione uma visão do módulo financeiro.</p></div>
          <div class="fin-tabs">
            <button class="fin-tab active" data-tab="dashboard" type="button">Dashboard</button>
            <button class="fin-tab" data-tab="fluxo" type="button">Fluxo</button>
            <button class="fin-tab" data-tab="importar" type="button">Importar</button>
            <button class="fin-tab" data-tab="config" type="button">Saldo e Provisão</button>
            <button class="fin-tab" data-tab="detalhes" type="button">Detalhes</button>
            <button class="fin-tab" data-tab="despesas" type="button">Despesas</button>
            <button class="fin-tab" data-tab="pagamentos" type="button">Pagamentos</button>
          </div>
        </div>

        <div class="fin-panel active" id="tab-dashboard">
          <div class="dash-kpi-grid">
            <div class="dash-kpi-card dash-kpi-saldo">
              <div class="dash-kpi-icon-wrap">💼</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">Saldo do Mês</span>
                <strong class="dash-kpi-value" id="dKpiSaldo">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiSaldoChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-receber">
              <div class="dash-kpi-icon-wrap">📈</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">A Receber (mês)</span>
                <strong class="dash-kpi-value" id="dKpiReceber">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiReceberChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-pagar">
              <div class="dash-kpi-icon-wrap">📉</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">A Pagar (mês)</span>
                <strong class="dash-kpi-value" id="dKpiPagar">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiPagarChange">–</span>
              </div>
            </div>
            <div class="dash-kpi-card dash-kpi-projetado">
              <div class="dash-kpi-icon-wrap">🎯</div>
              <div class="dash-kpi-info">
                <span class="dash-kpi-label">Saldo Projetado</span>
                <strong class="dash-kpi-value" id="dKpiProjetado">–</strong>
                <span class="dash-kpi-change neutral" id="dKpiProjetadoChange">–</span>
              </div>
            </div>
          </div>
          <div class="dash-charts-row">
            <div class="dash-chart-card">
              <h3>Despesas Diárias</h3>
              <p>Próximos 15 dias</p>
              <div class="dash-chart-inner"><canvas id="dashLineChart"></canvas></div>
            </div>
            <div class="dash-chart-card">
              <h3>Categorias de Despesas</h3>
              <p>Últimos 90 dias</p>
              <div class="dash-chart-inner"><canvas id="dashDonutChart"></canvas></div>
            </div>
          </div>
          <div class="dash-bottom-row">
            <div class="dash-transactions-card">
              <div class="dash-section-head">
                <h3>Vencimentos de Hoje</h3>
                <button class="btn btn-secondary fin-small" data-tab-target="fluxo" type="button">Ver todos</button>
              </div>
              <div id="dashTransactions" class="dash-tx-list"><div class="dash-loading">Carregando...</div></div>
            </div>
          </div>
        </div>

        <div class="fin-panel" id="tab-fluxo">
          <div class="cf-flow-mini" id="cfFlowMini" style="display:none">
            <div class="cf-flow-mini-item cf-fm-receber">
              <span class="cf-fm-label">Total Receber</span>
              <span class="cf-fm-val" id="cfFmReceber">R$ 0,00</span>
            </div>
            <div class="cf-flow-mini-item cf-fm-pagar">
              <span class="cf-fm-label">Total Pagar</span>
              <span class="cf-fm-val" id="cfFmPagar">R$ 0,00</span>
            </div>
            <div class="cf-flow-mini-item cf-fm-liquido">
              <span class="cf-fm-label">Fluxo Líquido</span>
              <span class="cf-fm-val" id="cfFmLiquido">R$ 0,00</span>
            </div>
            <div class="cf-flow-bar-wrap">
              <span class="cf-flow-bar-label">Receber vs Pagar</span>
              <div class="cf-flow-bar-track">
                <div class="cf-flow-bar-recv" id="cfBarRecv" style="width:50%"></div>
                <div class="cf-flow-bar-pay" id="cfBarPay" style="width:50%"></div>
              </div>
            </div>
          </div>
          <form class="fin-form" id="periodForm">
            <div class="fin-field"><label>Data inicial</label><input id="filterInicio" type="date" value="${esc(state.filters.inicio)}"></div>
            <div class="fin-field"><label>Data final</label><input id="filterFim" type="date" value="${esc(state.filters.fim)}"></div>
            <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Aplicar período</button></div>
          </form>
          <br>
          <div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data</th><th>Saldo do dia</th><th>Receber</th><th>Pagar</th><th>Provisão</th><th>Saldo projetado</th><th>Status</th><th>Ação</th></tr></thead><tbody id="fluxoTbody"><tr><td colspan="8" class="fin-empty">Carregando...</td></tr></tbody></table></div>
        </div>

        <div class="fin-panel" id="tab-importar">
          <div class="fin-import-grid">
            <div class="fin-drop">
              <h3>Contas a Receber</h3>
              <p class="fin-muted">Use o relatório com colunas Código, Fatura, Cliente, Vencimento, Valor e Valor Pago.</p><br>
              <input id="fileReceber" type="file" accept=".xlsx,.xls,.csv">
              <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportReceber" type="button">Importar receber</button><span id="fbReceber" class="fin-feedback"></span></div>
            </div>
            <div class="fin-drop">
              <h3>Contas a Pagar</h3>
              <p class="fin-muted">Use o relatório com colunas Empresa, COD/Grupo, Favorecido, Doc, Vencimento, Parcela e Valor.</p><br>
              <input id="filePagar" type="file" accept=".xlsx,.xls,.csv">
              <div class="fin-actions-row"><button class="btn btn-primary" id="btnImportPagar" type="button">Importar pagar</button><span id="fbPagar" class="fin-feedback"></span></div>
            </div>
          </div>
        </div>

        <div class="fin-panel" id="tab-config">
          <form class="fin-form" id="configForm">
            <div class="fin-field"><label>Data</label><input id="cfgData" type="date" value="${esc(state.currentDate)}" required></div>
            <div class="fin-field"><label>Saldo do dia</label><input id="cfgSaldo" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field"><label>Provisão automática</label><input id="cfgProvAuto" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field"><label>Ajuste manual provisão</label><input id="cfgProvManual" type="number" step="0.01" placeholder="0,00"></div>
            <div class="fin-field full"><label>Observações</label><textarea id="cfgObs" placeholder="Observações do financeiro"></textarea></div>
            <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" type="submit">Salvar ajustes</button></div>
            <div class="fin-field"><label>&nbsp;</label><span id="fbConfig" class="fin-feedback"></span></div>
          </form>
        </div>

        <div class="fin-panel" id="tab-detalhes">
          <div class="fin-head"><div><h3>Detalhes do dia selecionado</h3><p id="detalhesData">Selecione uma data no fluxo.</p></div></div>
          <div class="fin-det-filters">
            <select id="detFiltroTipo"><option value="">Tipo</option><option value="Receber">Receber</option><option value="Pagar">Pagar</option></select>
            <select id="detFiltroSituacao"><option value="">Situação</option><option value="Recebida">Recebida</option><option value="A vencer">A vencer</option><option value="Vencida">Vencida</option><option value="Paga">Paga</option></select>
            <input type="text" id="detFiltroFavorecido" placeholder="Favorecido...">
            <input type="text" id="detFiltroDoc" placeholder="Documento...">
          </div>
          <div class="fin-table-wrap"><table class="fin-table"><thead><tr>
            <th data-det-sort="tipo" class="det-th-sort">Tipo <span class="det-sort-icon">↕</span></th>
            <th data-det-sort="situacao" class="det-th-sort">Situação <span class="det-sort-icon">↕</span></th>
            <th data-det-sort="nome" class="det-th-sort">Nome/Favorecido <span class="det-sort-icon">↕</span></th>
            <th data-det-sort="doc" class="det-th-sort">Documento <span class="det-sort-icon">↕</span></th>
            <th data-det-sort="valor" class="det-th-sort">Valor <span class="det-sort-icon">↕</span></th>
            <th data-det-sort="vencimento" class="det-th-sort">Vencimento <span class="det-sort-icon">↕</span></th>
          </tr></thead><tbody id="detalhesTbody"><tr><td colspan="6" class="fin-empty">Nenhuma data selecionada.</td></tr></tbody></table></div>
        </div>


        <div class="fin-panel" id="tab-despesas">
          <div class="fin-head">
            <div><h3>Despesas</h3><p>Adiantamentos e pagamentos de diária/almoço ficam concentrados aqui.</p></div>
          </div>

          <div class="pay-mode-switch">
            <button class="pay-mode-btn active" data-pay-mode="adiantamentos" type="button">ADIANTAMENTOS</button>
            <button class="pay-mode-btn" data-pay-mode="pagamentos" type="button">DIÁRIAS E ALMOÇO</button>
          </div>

          <section class="pay-card pay-mode-panel active" id="pay-mode-adiantamentos">
            <h4>ADIANTAMENTOS</h4>
            <p>Suba a planilha de adiantamentos. O painel separa Flash/iFood e prepara a conferência para pagamento.</p>
            <div class="pay-filter-grid">
              <div class="fin-field"><label>Planilha de adiantamentos</label><label class="pay-upload" for="adiantFileExtrato" data-drop-for="adiantFileExtrato"><input id="adiantFileExtrato" type="file" accept=".xlsx,.xls,.csv"><span><strong>Arraste aqui ou clique para escolher</strong><span id="adiantFileExtratoName">Nenhum arquivo selecionado</span></span></label></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" id="btnGerarAdiantamentos" type="button">Gerar adiantamentos</button></div>
              <div class="fin-field"><label>Status padrão</label><select id="payDefaultStatus"><option value="OK" selected>OK</option><option value="PENDENTE">PENDENTE</option></select></div>
              <div class="fin-field"><label>&nbsp;</label><span id="fbAdiantamentos" class="fin-feedback"></span></div>
            </div>
          </section>

          <section class="pay-card pay-mode-panel" id="pay-mode-pagamentos">
            <h4>DIÁRIAS E ALMOÇO</h4>
            <p>Consulte a Produção Diária importada, gere alimentação ou diárias e marque cada linha como OK ou PENDENTE antes de pagar.</p>
            <div class="pay-filter-grid">
              <div class="fin-field"><label>Data inicial</label><input id="alimInicio" type="date" value="${esc(state.filters.inicio)}"></div>
              <div class="fin-field"><label>Data final</label><input id="alimFim" type="date" value="${esc(state.currentDate)}"></div>
              <div class="fin-field"><label>Tipo</label><select id="payTipoGeracao"><option value="alimentacao" selected>Alimentação</option><option value="diarias">Diárias</option></select></div>
              <div class="fin-field"><label>&nbsp;</label><button class="btn btn-primary" id="btnGerarPagamentoPeriodo" type="button">Consultar pagamentos</button></div>
              <div class="fin-field full"><span id="fbAlimentacao" class="fin-feedback"></span></div>
            </div>
          </section>

          <div class="pay-summary">
            <div class="pay-mini"><span>Tipo</span><strong id="payTipo">-</strong></div>
            <div class="pay-mini"><span>Período</span><strong id="payPeriodo">-</strong></div>
            <div class="pay-mini"><span>Registros OK</span><strong id="payRegistros">0</strong></div>
            <div class="pay-mini"><span>Total OK</span><strong id="payTotal">R$ 0,00</strong></div>
          </div>

          <div class="pay-note">Somente linhas marcadas como <strong>OK</strong> entram no botão <strong>PAGAR</strong>. Linhas <strong>PENDENTES</strong> permanecem para o financeiro resolver depois. Linhas <strong>PAGO</strong> são bloqueadas para evitar duplicidade.</div>

          <div class="pay-search-panel">
            <div class="pay-search-field">
              <label>Pesquisar colaborador para bloquear</label>
              <input id="payColaboradorFiltro" class="pay-search-input" type="search" placeholder="Digite nome, CPF, supervisão ou destino">
              <span id="payFiltroInfo" class="pay-search-count">Mostrando todos os colaboradores.</span>
            </div>
            <button class="btn btn-secondary" id="btnLimparPayFiltro" type="button">Limpar filtro</button>
          </div>

          <div class="pay-toolbar">
            <div class="pay-subtabs">
              <button class="pay-subtab active" data-pay-tab="conferencia" type="button">Conferência</button>
              <button class="pay-subtab" data-pay-tab="flash" type="button">Flash</button>
              <button class="pay-subtab" data-pay-tab="ifood" type="button">iFood</button>
              <button class="pay-subtab" data-pay-tab="alelo" type="button">Alelo</button>
              <button class="pay-subtab" data-pay-tab="logs" type="button">Pendências</button>
            </div>
            <div class="fin-actions-row">
              <button class="btn btn-secondary fin-small" id="btnExportFlash" type="button">Baixar Flash XLSX</button>
              <button class="btn btn-secondary fin-small" id="btnExportIfood" type="button">Baixar iFood XLSX</button>
              <button class="btn btn-secondary fin-small" id="btnExportAlelo" type="button">Baixar Alelo CSV</button>
              <button class="btn btn-secondary fin-small" id="btnExportConferencia" type="button">Baixar conferência XLSX</button>
            </div>
          </div>

          <div class="pay-table active" id="pay-conferencia"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Status</th><th>Data</th><th>Colaborador</th><th>CPF</th><th>Destino</th><th>Tipo</th><th>Valor</th><th>Composição</th><th>Supervisão</th><th>Observação</th></tr></thead><tbody id="payConferenciaTbody"><tr><td colspan="10" class="fin-empty">Gere um pagamento para conferir.</td></tr></tbody></table></div></div>
          <div class="pay-table" id="pay-flash"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>CPF</th><th>Nome</th><th>Valor</th></tr></thead><tbody id="payFlashTbody"><tr><td colspan="3" class="fin-empty">Nenhum arquivo Flash gerado.</td></tr></tbody></table></div></div>
          <div class="pay-table" id="pay-ifood"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>CNPJ</th><th>Nome</th><th>CPF</th><th>Nascimento</th><th>Email</th><th>Celular</th><th>Centro de custo</th><th>Livre</th></tr></thead><tbody id="payIfoodTbody"><tr><td colspan="8" class="fin-empty">Nenhum arquivo iFood gerado.</td></tr></tbody></table></div></div>
          <div class="pay-table" id="pay-alelo"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Número de Série</th><th>CPF</th><th>Valor da Carga</th><th>Observação</th><th>Nome</th></tr></thead><tbody id="payAleloTbody"><tr><td colspan="5" class="fin-empty">Nenhum arquivo Alelo gerado.</td></tr></tbody></table></div></div>
          <div class="pay-table" id="pay-logs"><div class="fin-table-wrap"><table class="fin-table"><thead><tr><th>Data/Linha</th><th>Colaborador</th><th>Status</th><th>Mensagem</th></tr></thead><tbody id="payLogsTbody"><tr><td colspan="4" class="fin-empty">Nenhuma pendência.</td></tr></tbody></table></div></div>

          <div class="pay-footer">
            <div><strong id="payFooterTotal">Total pronto para pagar: R$ 0,00</strong><span id="payFooterHint">Gere ou importe pagamentos para liberar o botão.</span></div>
            <button class="btn-pay-final" id="btnPagarBeneficios" type="button" disabled>PAGAR</button>
          </div>
        </div>

        <div class="fin-panel" id="tab-pagamentos">
          <div class="fin-head">
            <div>
              <h3>Pagamentos solicitados pelos setores</h3>
              <p>Fila de despesas enviadas por Compras, Hospedagem, RH e outros módulos para o financeiro realizar o pagamento.</p>
            </div>
            <button class="btn btn-secondary" id="btnReloadSetorPagamentos" type="button">Atualizar pagamentos</button>
          </div>

          <div class="fin-setor-filter" id="setorPagamentoFilter">
            <button class="fin-setor-btn active" data-setor-pay="todos" type="button">Todos</button>
            <button class="fin-setor-btn" data-setor-pay="COMPRAS" type="button">Compras</button>
            <button class="fin-setor-btn" data-setor-pay="HOSPEDAGEM" type="button">Hospedagem</button>
            <button class="fin-setor-btn" data-setor-pay="RH" type="button">RH</button>
            <button class="fin-setor-btn" data-setor-pay="AUDITORIA" type="button">Auditoria</button>
            <button class="fin-setor-btn" data-setor-pay="OUTROS" type="button">Outros</button>
            <button class="fin-setor-btn fin-setor-pago" data-setor-pay="PAGO" type="button">Pagos</button>
          </div>

          <div class="fin-table-wrap">
            <table class="fin-table">
              <thead>
                <tr>
                  <th>Setor</th>
                  <th>Data/Hora</th>
                  <th>Gestor</th>
                  <th>Coordenação</th>
                  <th>Conteúdo</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody id="setorPagamentosTbody">
                <tr><td colspan="8" class="fin-empty">Clique em Atualizar pagamentos.</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </article>
    </section>
  `;

  function setFeedback(id, text, type = '') {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text || '';
    el.className = `fin-feedback ${type}`.trim();
  }


  function tabFromHash() {
    const tab = String(window.location.hash || '').replace(/^#/, '').toLowerCase();
    return ['dashboard', 'fluxo', 'importar', 'config', 'detalhes', 'despesas', 'pagamentos'].includes(tab) ? tab : 'dashboard';
  }

  function setTab(tab) {
    document.querySelectorAll('.fin-tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tab));
    document.querySelectorAll('.fin-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`tab-${tab}`)?.classList.add('active');
    if (tab === 'pagamentos') loadSetorPagamentos();
    if (tab === 'dashboard') loadDashboardData();
  }


  function isRowPago(row) {
    const s = String(row.status || '').toUpperCase();
    return s === 'PAGO' || row.status === 'aguardando_nf';
  }

  function filteredSetorPagamentos() {
    const filter = state.pagamentosSetorFilter || 'todos';
    const all = state.financeiroPagamentos || [];
    if (filter === 'PAGO') return all.filter(isRowPago);
    const pendentes = all.filter((row) => !isRowPago(row));
    if (filter === 'todos') return pendentes;
    if (filter === 'OUTROS') {
      return pendentes.filter((row) => {
        const origem = normalize(row.origem || row.setor || row.modulo_origem);
        return !origem.includes('compra') && !origem.includes('hotel') && !origem.includes('hosped') && !origem.includes('auditoria') && origem !== 'rh' && !origem.includes('recursos humanos');
      });
    }
    return pendentes.filter((row) => {
      const origem = normalize(row.origem || row.setor || row.modulo_origem);
      return normalize(filter).split(' ').every((part) => origem.includes(part)) ||
        (filter === 'HOSPEDAGEM' && (origem.includes('hotel') || origem.includes('hosped'))) ||
        (filter === 'RH' && (origem === 'rh' || origem.includes('recursos humanos'))) ||
        (filter === 'AUDITORIA' && origem.includes('auditoria'));
    });
  }

  function getGestorCoordenacao(row) {
    const gestor = row._gestor || row.gestor || row.solicitante || '';
    const coordenacao = row._coordenacao || row.coordenacao || '';
    if (gestor || coordenacao) return { gestor, coordenacao };
    const texto = String(row.descricao || row.conteudo || '');
    const gMatch = texto.match(/gestor:\s*(.+)/i);
    const cMatch = texto.match(/coordena[çc][ãa]o:\s*(.+)/i);
    return { gestor: gMatch ? gMatch[1].trim() : '', coordenacao: cMatch ? cMatch[1].trim() : '' };
  }

  function isLinkDados(value) {
    const s = String(value || '').trim();
    return /^https?:\/\//i.test(s) || /^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s);
  }

  function renderConteudoHtml(row) {
    const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
    const linhas = String(descricaoBase)
      .split(/\n+/)
      .map((l) => l.trim())
      .filter(Boolean)
      .filter((l) => !/^gestor\s*:/i.test(l))
      .filter((l) => !/^coordena[çc][ãa]o\s*:/i.test(l))
      .filter((l) => !/^forma\s*:/i.test(l))
      .filter((l) => !/^dados\s*:/i.test(l))
      .filter((l) => !/^tipo\s*:/i.test(l));

    const forma = row.forma_pagamento || '';
    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';

    const parts = [];
    if (linhas.length) parts.push(`<div class="spay-items">${linhas.map((l) => esc(l)).join('<br>')}</div>`);
    if (forma) parts.push(`<div class="spay-meta"><span class="spay-meta-label">Forma:</span> ${esc(forma)}</div>`);
    if (dados) {
      const dadosHtml = isLinkDados(dados)
        ? `<a class="spay-link" href="${esc(ensureHttps(dados))}" target="_blank" rel="noopener">${esc(dados)}</a>`
        : esc(dados);
      parts.push(`<div class="spay-meta"><span class="spay-meta-label">Dados:</span> ${dadosHtml}</div>`);
    }
    if (!parts.length) return `<span class="spay-empty">—</span>`;
    return parts.join('');
  }

  function renderSetorPagamentos() {
    const tbody = document.getElementById('setorPagamentosTbody');
    if (!tbody) return;
    const rows = filteredSetorPagamentos();
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="fin-empty">Nenhum pagamento localizado para o filtro selecionado.</td></tr>';
      return;
    }
    tbody.innerHTML = rows.map((row) => {
      const status = row.status || row.situacao || 'PENDENTE';
      const dtRaw = row.created_at || row.data_solicitacao || row.solicitado_em || row.data_hora || row.data;
      const dt = dtRaw ? new Date(dtRaw) : null;
      const dtDate = dt && !isNaN(dt) ? dt.toLocaleDateString('pt-BR') : '-';
      const dtTime = dt && !isNaN(dt) ? dt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
      const { gestor, coordenacao } = getGestorCoordenacao(row);
      return `<tr>
        <td><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></td>
        <td style="white-space:nowrap">${dtDate}${dtTime ? `<br><small style="color:#6b7280">${dtTime}</small>` : ''}</td>
        <td>${esc(gestor) || '<span class="spay-empty">—</span>'}</td>
        <td>${esc(coordenacao) || '<span class="spay-empty">—</span>'}</td>
        <td>${renderConteudoHtml(row)}</td>
        <td style="white-space:nowrap">${money(row.valor || row.valor_total || row.total)}</td>
        <td><span class="fin-status ${statusPagamentoClass(status)}">${esc(status)}</span></td>
        <td>
          <div class="fin-pay-actions" style="flex-wrap:wrap;gap:4px">
            ${isRowPago(row)
              ? (row.comprovante_url
                  ? `<a class="btn btn-secondary fin-small" href="${esc(row.comprovante_url)}" target="_blank" rel="noopener">Comprovante</a>`
                  : `<span style="color:#4ade80;font-size:13px;font-weight:700">✓ Pago</span>`)
              : isBoleto(row)
                ? `<button class="btn btn-secondary fin-small" data-ok-setor="${esc(row.id)}" type="button">OK</button>`
                : `<button class="btn btn-primary fin-small" data-pagar-setor="${esc(row.id)}" type="button">PAGAR</button>`}
            ${isRowPago(row) ? '' : `<button class="btn fin-small fin-btn-recusar" data-recusar-setor="${esc(row.id)}" type="button">RECUSAR</button>`}
          </div>
        </td>
      </tr>`;
    }).join('');
    tbody.querySelectorAll('[data-pagar-setor]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalComprovantePagamento(btn.dataset.pagarSetor));
    });
    tbody.querySelectorAll('[data-ok-setor]').forEach((btn) => {
      btn.addEventListener('click', () => abrirModalCienteBoleto(btn.dataset.okSetor));
    });
    tbody.querySelectorAll('[data-recusar-setor]').forEach((btn) => {
      btn.addEventListener('click', () => recusarPagamento(btn.dataset.recusarSetor));
    });
  }


  function compraItemToPagamento(row) {
    const s = row.compras_solicitacoes || {};
    const quantidade = row.quantidade || row.unidade || 1;
    const partes = [
      `- ${quantidade} un ${row.material || '-'}`,
      row.tamanho ? `  Tamanho/Detalhe: ${row.tamanho}` : '',
      row.colaborador_nome ? `  Colaborador: ${row.colaborador_nome}` : ''
    ].filter(Boolean);
    return {
      ...row,
      id: `compra_${row.id}`,
      _source_table: 'compras_itens',
      origem: 'COMPRAS',
      origem_id: row.id,
      descricao: partes.join('\n'),
      conteudo: partes.join('\n'),
      fornecedor: row.fornecedor || row.favorecido || '',
      favorecido: row.fornecedor || row.favorecido || '',
      contato: row.contato || '',
      valor: row.valor_total || 0,
      status: row.status === 'aguardando_nf' ? 'AGUARDANDO NF' : 'PENDENTE',
      created_at: row.updated_at || row.created_at || s.created_at || s.data_solicitacao,
      data_solicitacao: s.data_solicitacao || row.created_at,
      dados_pagamento: row.dados_pagamento || '',
      forma_pagamento: row.forma_pagamento || '',
      comprovante_url: row.comprovante_url || '',
      _raw_compra_item_id: row.id,
      _compra_item_ids: [row.id],
      _gestor: s.solicitante || '',
      _coordenacao: s.coordenacao || ''
    };
  }

  function groupCompraPagamentos(rows = []) {
    const map = new Map();
    rows.forEach((row) => {
      const base = compraItemToPagamento(row);
      const key = [
        base.forma_pagamento || '',
        base.dados_pagamento || '',
        base._gestor || '',
        base._coordenacao || '',
        base.status || ''
      ].map((v) => normalize(v)).join('|');

      if (!map.has(key)) {
        map.set(key, {
          ...base,
          id: `compra_grp_${Math.abs(hashText(key).replace('fin_', '').split('_')[0] || Date.now())}`,
          origem_id: `grupo_${key}`,
          descricao: '',
          conteudo: '',
          valor: 0,
          _source_table: 'compras_itens_group',
          _compra_item_ids: [],
          _raw_compra_item_id: null
        });
      }

      const group = map.get(key);
      group.valor += Number(base.valor || 0);
      group._compra_item_ids.push(...(base._compra_item_ids || []));
      group.descricao += (group.descricao ? '\n' : '') + base.descricao;
      group.conteudo = group.descricao;
      if (new Date(base.created_at || 0).getTime() > new Date(group.created_at || 0).getTime()) {
        group.created_at = base.created_at;
      }
    });

    return [...map.values()];
  }


  async function loadSetorPagamentos() {
    const tbody = document.getElementById('setorPagamentosTbody');
    if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="fin-empty">Carregando pagamentos enviados pelos setores...</td></tr>';

    const [pagamentosRes, comprasRes] = await Promise.all([
      supabase
        .from('financeiro_pagamentos')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('compras_itens')
        .select('*, compras_solicitacoes(*)')
        .in('status', ['pendente_pagamento', 'aguardando_nf'])
        .order('updated_at', { ascending: false })
        .limit(500)
    ]);

    const pagamentos = pagamentosRes.error ? [] : (pagamentosRes.data || []);
    const comprasAgrupadas = comprasRes.error ? [] : groupCompraPagamentos(comprasRes.data || []);

    const financeKeys = new Set(
      pagamentos
        .filter((row) => normalize(row.origem || row.setor || row.modulo_origem).includes('compra'))
        .map((row) => `${normalize(row.forma_pagamento || '')}|${normalize(row.dados_pagamento || '')}`)
        .filter((key) => key !== '|')
    );

    const comprasSemDuplicar = comprasAgrupadas.filter((row) => {
      const key = `${normalize(row.forma_pagamento || '')}|${normalize(row.dados_pagamento || '')}`;
      return key === '|' || !financeKeys.has(key);
    });

    if (pagamentosRes.error && comprasRes.error) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="fin-empty">${esc(pagamentosRes.error.message)}<br>${esc(comprasRes.error.message)}<br>Execute a migration de pagamentos do financeiro no Supabase.</td></tr>`;
      return;
    }

    state.financeiroPagamentos = [...comprasSemDuplicar, ...pagamentos].sort((a, b) => {
      const da = new Date(a.created_at || a.data_solicitacao || 0).getTime();
      const db = new Date(b.created_at || b.data_solicitacao || 0).getTime();
      return db - da;
    });

    renderSetorPagamentos();
  }


  function getPagamentoRowById(id) {
    return (state.financeiroPagamentos || []).find((row) => String(row.id) === String(id));
  }

  function renderConteudoModal(row) {
    const descricaoBase = row.descricao || row.conteudo || row.observacao || row.detalhes || '';
    const linhas = String(descricaoBase).split(/\n+/).map((l) => l.trim()).filter(Boolean)
      .filter((l) => !/^tipo\s*:/i.test(l))
      .filter((l) => !/^forma\s*:/i.test(l))
      .filter((l) => !/^dados\s*:/i.test(l));
    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
    const forma = row.forma_pagamento || '';
    const fornecedor = row.fornecedor || row.favorecido || row.beneficiario || '';
    const contato = row.contato || row.contato_fornecedor || '';
    const parts = [];
    if (linhas.length) parts.push(linhas.map((l) => esc(l)).join('<br>'));
    if (fornecedor) parts.push(`Fornecedor: ${esc(fornecedor)}`);
    if (contato) parts.push(`Contato: ${esc(contato)}`);
    if (forma) parts.push(`Forma: <strong>${esc(forma)}</strong>`);
    if (dados) {
      const dadosDisplay = isLinkDados(dados)
        ? `<a href="${esc(ensureHttps(dados))}" target="_blank" rel="noopener" style="color:#34d399;word-break:break-all">${esc(dados)}</a>`
        : `<strong style="word-break:break-all">${esc(dados)}</strong>`;
      parts.push(`Dados: ${dadosDisplay}`);
    }
    return parts.join('<br>') || `Solicitação de ${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}`;
  }

  function abrirModalComprovantePagamento(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finPagamentoModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finPagamentoModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }

    const dados = row.dados_pagamento || row.link_pagamento || row.chave_pix || row.boleto_url || '';
    const pixPayload = isPix(row) && dados ? buildPixPayload(dados, row.favorecido || row.fornecedor || row.beneficiario || '', 'BRASIL', row.valor || row.valor_total || row.total) : '';
    const pixSection = isPix(row) && dados ? `
      <div style="text-align:center;margin:16px 0;padding:16px;background:rgba(52,211,153,.06);border:1px solid rgba(52,211,153,.18);border-radius:14px">
        <p style="color:#94a3b8;font-size:12px;text-transform:uppercase;letter-spacing:.06em;margin:0 0 12px">QR Code PIX</p>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(pixPayload)}" alt="QR Code PIX" style="width:200px;height:200px;border-radius:10px;background:#fff;padding:6px;display:block;margin:0 auto">
        <p style="color:#e2e8f0;font-size:13px;margin:10px 0 0;word-break:break-all">${esc(dados)}</p>
      </div>` : '';

    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div>
          <h3>Anexar comprovante</h3>
          <p>Após enviar, o comprovante retorna para o setor de origem.</p>
        </div>
        <button class="btn btn-secondary" id="finPayClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview" style="line-height:1.7;padding:14px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.5);color:#e2e8f0;font-size:14px">${renderConteudoModal(row)}</div>
      ${pixSection}
      <div class="fin-field full mt-16">
        <label>Comprovante de pagamento</label>
        <input id="finPayComprovante" type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx,.xls,.xlsx">
      </div>
      <div class="fin-actions-row mt-16">
        <button class="btn btn-primary" id="finPaySend" type="button">ENVIAR</button>
        <span id="finPayFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finPayClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#finPaySend').onclick = () => enviarComprovantePagamento(row);
  }

  function abrirModalCienteBoleto(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finBoletoModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finBoletoModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }
    const dados = row.dados_pagamento || row.link_pagamento || row.boleto_url || '';
    const dadosHtml = isLinkDados(dados)
      ? `<a href="${esc(ensureHttps(dados))}" target="_blank" rel="noopener" style="color:#34d399;word-break:break-all">${esc(dados)}</a>`
      : `<strong style="word-break:break-all">${esc(dados)}</strong>`;
    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div><h3>Boleto registrado</h3><p>Pagamento via boleto — será quitado na data de vencimento.</p></div>
        <button class="btn btn-secondary" id="finBoletoClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-pay-preview" style="line-height:1.7;padding:14px;border:1px solid rgba(148,163,184,.14);border-radius:12px;background:rgba(15,23,42,.5);color:#e2e8f0;font-size:14px">${renderConteudoModal(row)}</div>
      ${dados ? `<div style="margin-top:14px;padding:12px 14px;background:rgba(59,130,246,.1);border:1px solid rgba(59,130,246,.24);border-radius:12px;font-size:14px;color:#bfdbfe">Boleto: ${dadosHtml}</div>` : ''}
      <div class="fin-actions-row mt-16">
        <button class="btn btn-secondary" id="finBoletoOk" type="button">OK — Ciente</button>
        <span id="finBoletoFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finBoletoClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#finBoletoOk').onclick = () => modal.classList.remove('open');
  }

  async function updateComprasComprovante(row, comprovanteUrl) {
    const ids = (row._compra_item_ids || [])
      .map((id) => String(id || '').replace(/^compra_/, ''))
      .filter(Boolean);

    const forma = row.forma_pagamento || '';
    const dados = row.dados_pagamento || '';

    let q = supabase.from('compras_itens');
    if (ids.length) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).in('id', ids);
    } else if (dados) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).eq('dados_pagamento', dados).eq('status', 'pendente_pagamento');
      if (forma) q = q.eq('forma_pagamento', forma);
    } else if (row.origem_id) {
      q = q.update({ status: 'aguardando_nf', comprovante_url: comprovanteUrl }).eq('id', String(row.origem_id).replace(/^compra_/, ''));
    } else {
      return;
    }

    let { error } = await q;
    if (!error) return;

    if (isMissingColumnError(error)) {
      let retry = supabase.from('compras_itens');
      if (ids.length) retry = retry.update({ status: 'aguardando_nf' }).in('id', ids);
      else if (dados) {
        retry = retry.update({ status: 'aguardando_nf' }).eq('dados_pagamento', dados).eq('status', 'pendente_pagamento');
        if (forma) retry = retry.eq('forma_pagamento', forma);
      } else if (row.origem_id) retry = retry.update({ status: 'aguardando_nf' }).eq('id', String(row.origem_id).replace(/^compra_/, ''));
      const res = await retry;
      if (res.error) throw res.error;
      return;
    }

    throw error;
  }

  function recusarPagamento(id) {
    const row = getPagamentoRowById(id);
    if (!row) return;
    let modal = document.getElementById('finRecusaModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'finRecusaModal';
      modal.className = 'fin-pay-modal';
      document.body.appendChild(modal);
    }
    modal.innerHTML = `<div class="fin-pay-modal-card">
      <div class="fin-head">
        <div>
          <h3>Recusar pagamento</h3>
          <p>Informe o motivo da recusa para o setor.</p>
        </div>
        <button class="btn btn-secondary" id="finRecusaClose" type="button">Fechar</button>
      </div>
      <div class="pay-summary">
        <div class="pay-mini"><span>Setor</span><strong>${esc(origemPagamentoLabel(row.origem || row.setor || row.modulo_origem))}</strong></div>
        <div class="pay-mini"><span>Valor</span><strong>${money(row.valor || row.valor_total || row.total)}</strong></div>
      </div>
      <div class="fin-field full mt-16">
        <label>Motivo da recusa <span style="color:#f87171">*</span></label>
        <textarea id="finRecusaMotivo" rows="4" placeholder="Descreva o motivo para recusar este pagamento..." style="width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(148,163,184,.2);border-radius:10px;color:#e2e8f0;padding:10px 12px;font-size:14px;resize:vertical"></textarea>
      </div>
      <div class="fin-actions-row mt-16">
        <button class="btn fin-btn-recusar" id="finRecusaConfirm" type="button">CONFIRMAR RECUSA</button>
        <span id="finRecusaFeedback" class="fin-feedback"></span>
      </div>
    </div>`;
    modal.classList.add('open');
    modal.querySelector('#finRecusaClose').onclick = () => modal.classList.remove('open');
    modal.querySelector('#finRecusaConfirm').onclick = () => confirmarRecusa(row, modal);
  }

  async function confirmarRecusa(row, modal) {
    const motivoEl = modal.querySelector('#finRecusaMotivo');
    const fb = modal.querySelector('#finRecusaFeedback');
    const motivo = (motivoEl?.value || '').trim();
    if (!motivo) {
      if (fb) { fb.textContent = 'Informe o motivo da recusa.'; fb.style.color = '#f87171'; }
      motivoEl?.focus();
      return;
    }
    const confirmBtn = modal.querySelector('#finRecusaConfirm');
    if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.textContent = 'Recusando...'; }
    if (fb) { fb.textContent = ''; }
    try {
      const isCompra = String(row.id || '').startsWith('compra_') || row._source_table === 'compras_itens' || row._source_table === 'compras_itens_group';
      if (isCompra) {
        const ids = (row._compra_item_ids || []).map((id) => String(id || '').replace(/^compra_/, '')).filter(Boolean);
        let q = supabase.from('compras_itens');
        if (ids.length) {
          q = q.update({ status: 'recusado', motivo_recusa: motivo }).in('id', ids);
        } else {
          const rawId = String(row.origem_id || row.id || '').replace(/^compra_grp_|^compra_/, '');
          q = q.update({ status: 'recusado', motivo_recusa: motivo }).eq('id', rawId);
        }
        let { error } = await q;
        if (error && isMissingColumnError(error)) {
          let retry = supabase.from('compras_itens');
          if (ids.length) retry = retry.update({ status: 'recusado' }).in('id', ids);
          else {
            const rawId = String(row.origem_id || row.id || '').replace(/^compra_grp_|^compra_/, '');
            retry = retry.update({ status: 'recusado' }).eq('id', rawId);
          }
          const res = await retry;
          if (res.error) throw res.error;
        } else if (error) {
          throw error;
        }
      } else {
        const rawId = String(row.id || '');
        let { error } = await supabase.from('financeiro_pagamentos').update({ status: 'RECUSADO', motivo_recusa: motivo }).eq('id', rawId);
        if (error && isMissingColumnError(error)) {
          const res = await supabase.from('financeiro_pagamentos').update({ status: 'RECUSADO' }).eq('id', rawId);
          if (res.error) throw res.error;
        } else if (error) {
          throw error;
        }
      }
      modal.classList.remove('open');
      await loadSetorPagamentos();
    } catch (err) {
      if (fb) { fb.textContent = `Erro: ${err.message}`; fb.style.color = '#f87171'; }
      if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.textContent = 'CONFIRMAR RECUSA'; }
    }
  }

  async function enviarComprovantePagamento(row) {
    const fb = document.getElementById('finPayFeedback');
    const file = document.getElementById('finPayComprovante')?.files?.[0];
    try {
      if (fb) {
        fb.textContent = 'Enviando comprovante...';
        fb.className = 'fin-feedback';
      }
      const comprovanteUrl = await uploadComprovantePagamento(file, row);
      const isCompras = normalize(row.origem || row.setor || row.modulo_origem).includes('compra') || String(row.id).startsWith('compra_');

      if (String(row.id).startsWith('compra_grp_') || String(row.id).startsWith('compra_')) {
        await updateComprasComprovante(row, comprovanteUrl);
      } else {
        const payload = { status: 'PAGO', pago_em: new Date().toISOString(), comprovante_url: comprovanteUrl };
        let { error } = await supabase.from('financeiro_pagamentos').update(payload).eq('id', row.id);
        if (error && isMissingColumnError(error)) {
          const retry = await supabase.from('financeiro_pagamentos').update({ status: 'PAGO', comprovante_url: comprovanteUrl }).eq('id', row.id);
          error = retry.error;
        }
        if (error) throw error;
        if (isCompras) await updateComprasComprovante(row, comprovanteUrl);
      }

      document.getElementById('finPagamentoModal')?.classList.remove('open');
      await loadSetorPagamentos();
    } catch (error) {
      if (fb) {
        fb.textContent = error.message || 'Erro ao enviar comprovante.';
        fb.className = 'fin-feedback err';
      }
      alert(error.message || 'Erro ao enviar comprovante.');
    }
  }


  const dashCharts = { line: null, donut: null };

  async function loadDashboardData() {
    const hoje = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const hojeStr = `${hoje.getFullYear()}-${pad(hoje.getMonth() + 1)}-${pad(hoje.getDate())}`;
    const seisMesesAtras = new Date(hoje);
    seisMesesAtras.setMonth(seisMesesAtras.getMonth() - 5);
    const inicioPeriodo = `${seisMesesAtras.getFullYear()}-${String(seisMesesAtras.getMonth() + 1).padStart(2, '0')}-01`;
    const novDiasAtras = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const quinzeDias = new Date(hoje);
    quinzeDias.setDate(quinzeDias.getDate() + 14);
    const fimPeriodo = `${quinzeDias.getFullYear()}-${pad(quinzeDias.getMonth() + 1)}-${pad(quinzeDias.getDate())}`;

    const [fluxoRes, fluxoDiarioRes, categoriaRes, receberRes, pagarRes] = await Promise.all([
      supabase.from('financeiro_fluxo_caixa_diario')
        .select('data,contas_receber,contas_pagar,saldo_dia,saldo_projetado')
        .gte('data', inicioPeriodo)
        .order('data', { ascending: true }),
      supabase.from('financeiro_fluxo_caixa_diario')
        .select('data,contas_pagar,contas_receber')
        .gte('data', hojeStr)
        .lte('data', fimPeriodo)
        .order('data', { ascending: true }),
      supabase.from('financeiro_contas_pagar')
        .select('categoria,valor')
        .gte('vencimento', novDiasAtras),
      supabase.from('financeiro_contas_receber')
        .select('cliente,valor,vencimento,situacao')
        .eq('vencimento', hojeStr)
        .order('cliente'),
      supabase.from('financeiro_contas_pagar')
        .select('favorecido,valor,vencimento,situacao')
        .eq('vencimento', hojeStr)
        .order('favorecido')
    ]);

    renderDashboard({
      fluxo: fluxoRes.data || [],
      fluxoDiario: fluxoDiarioRes.data || [],
      categorias: (categoriaRes.data || []).filter((r) => r.categoria),
      receber: receberRes.data || [],
      pagar: pagarRes.data || [],
      hojeStr
    });
  }

  function renderDashboard({ fluxo, fluxoDiario, categorias, receber, pagar, hojeStr }) {
    const hoje = new Date();
    const byMonth = {};
    fluxo.forEach((row) => {
      const mes = String(row.data).slice(0, 7);
      if (!byMonth[mes]) byMonth[mes] = { receber: 0, pagar: 0, saldo: 0, projetado: 0 };
      byMonth[mes].receber += Number(row.contas_receber || 0);
      byMonth[mes].pagar += Number(row.contas_pagar || 0);
      byMonth[mes].saldo += Number(row.saldo_dia || 0);
      byMonth[mes].projetado = Math.max(byMonth[mes].projetado, Number(row.saldo_projetado || 0));
    });

    const meses = Object.keys(byMonth).sort();
    const mesAtualKey = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
    const mesAnteriorDate = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    const mesAnteriorKey = `${mesAnteriorDate.getFullYear()}-${String(mesAnteriorDate.getMonth() + 1).padStart(2, '0')}`;
    const atual = byMonth[mesAtualKey] || { receber: 0, pagar: 0, saldo: 0, projetado: 0 };
    const anterior = byMonth[mesAnteriorKey] || null;

    function setChange(id, curr, prev, invertido) {
      const el = document.getElementById(id);
      if (!el) return;
      if (!prev) { el.textContent = 'mês atual'; el.className = 'dash-kpi-change neutral'; return; }
      const pct = ((curr - prev) / Math.abs(prev)) * 100;
      const isGood = invertido ? pct < 0 : pct > 0;
      el.textContent = `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`;
      el.className = `dash-kpi-change ${isGood ? 'up' : 'down'}`;
    }

    const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = money(val); };
    setVal('dKpiSaldo', atual.saldo);
    setVal('dKpiReceber', atual.receber);
    setVal('dKpiPagar', atual.pagar);
    setVal('dKpiProjetado', atual.projetado);
    setChange('dKpiSaldoChange', atual.saldo, anterior?.saldo, false);
    setChange('dKpiReceberChange', atual.receber, anterior?.receber, false);
    setChange('dKpiPagarChange', atual.pagar, anterior?.pagar, true);
    setChange('dKpiProjetadoChange', atual.projetado, anterior?.projetado, false);

    const byDay = {};
    fluxoDiario.forEach((row) => {
      const dia = String(row.data).slice(0, 10);
      byDay[dia] = { pagar: Number(row.contas_pagar || 0), receber: Number(row.contas_receber || 0) };
    });
    const dias = Object.keys(byDay).sort();

    const diaLabels = dias.map((d) => {
      const [, mo, dy] = d.split('-');
      return `${dy}/${mo}`;
    });

    const lineCtx = document.getElementById('dashLineChart');
    if (lineCtx && typeof Chart !== 'undefined') {
      if (dashCharts.line) { dashCharts.line.destroy(); dashCharts.line = null; }
      dashCharts.line = new Chart(lineCtx, {
        type: 'line',
        data: {
          labels: diaLabels,
          datasets: [
            { label: 'A Receber', data: dias.map((d) => byDay[d].receber), borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,.1)', borderWidth: 2.5, pointBackgroundColor: '#34d399', pointRadius: 4, fill: true, tension: 0.35 },
            { label: 'A Pagar', data: dias.map((d) => byDay[d].pagar), borderColor: '#f87171', backgroundColor: 'rgba(248,113,113,.07)', borderWidth: 2.5, pointBackgroundColor: '#f87171', pointRadius: 4, fill: true, tension: 0.35 }
          ]
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: '#6b7280', font: { size: 12 }, usePointStyle: true } },
            tooltip: { backgroundColor: 'rgba(15,23,42,.95)', borderColor: 'rgba(148,163,184,.18)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#6b7280', callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } }
          },
          scales: {
            x: { grid: { color: 'rgba(148,163,184,.07)' }, ticks: { color: '#64748b', font: { size: 11 } } },
            y: { grid: { color: 'rgba(148,163,184,.07)' }, ticks: { color: '#64748b', font: { size: 11 }, callback: (v) => `R$ ${(v / 1000).toFixed(0)}k` } }
          }
        }
      });
    }

    const catMap = {};
    categorias.forEach((row) => { const cat = row.categoria || 'Outros'; catMap[cat] = (catMap[cat] || 0) + Number(row.valor || 0); });
    const catEntries = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
    const donutColors = ['#34d399', '#818cf8', '#f87171', '#fb923c', '#a78bfa', '#38bdf8', '#fbbf24'];

    const donutCtx = document.getElementById('dashDonutChart');
    if (donutCtx && typeof Chart !== 'undefined') {
      if (dashCharts.donut) { dashCharts.donut.destroy(); dashCharts.donut = null; }
      if (catEntries.length) {
        dashCharts.donut = new Chart(donutCtx, {
          type: 'doughnut',
          data: {
            labels: catEntries.map(([k]) => k),
            datasets: [{ data: catEntries.map(([, v]) => v), backgroundColor: donutColors, borderColor: 'rgba(15,23,42,.9)', borderWidth: 3, hoverOffset: 8 }]
          },
          options: {
            responsive: true, maintainAspectRatio: false, cutout: '62%',
            plugins: {
              legend: { position: 'bottom', labels: { color: '#6b7280', font: { size: 11 }, padding: 10, usePointStyle: true } },
              tooltip: { backgroundColor: 'rgba(15,23,42,.95)', borderColor: 'rgba(148,163,184,.18)', borderWidth: 1, titleColor: '#e2e8f0', bodyColor: '#6b7280', callbacks: { label: (ctx) => ` ${money(ctx.raw)}` } }
            }
          }
        });
      } else {
        const pEl = donutCtx.closest('.dash-chart-card')?.querySelector('p');
        if (pEl) pEl.textContent = 'Sem dados de categorias nos últimos 90 dias.';
      }
    }

    const txEl = document.getElementById('dashTransactions');
    if (!txEl) return;
    const combined = [
      ...receber.map((r) => ({ tipo: 'receber', nome: r.cliente, valor: Number(r.valor || 0), data: r.vencimento, situacao: r.situacao })),
      ...pagar.map((r) => ({ tipo: 'pagar', nome: r.favorecido, valor: Number(r.valor || 0), data: r.vencimento, situacao: r.situacao }))
    ].sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));

    if (!combined.length) {
      txEl.innerHTML = '<div class="dash-loading">Nenhum vencimento para hoje.</div>';
      return;
    }
    txEl.innerHTML = combined.map((tx) => `
      <div class="dash-tx-row">
        <div class="dash-tx-icon ${esc(tx.tipo)}">${tx.tipo === 'receber' ? '↑' : '↓'}</div>
        <div style="min-width:0">
          <div class="dash-tx-name">${esc(tx.nome || '-')}</div>
          <div class="dash-tx-sub">${esc(tx.situacao || (tx.tipo === 'receber' ? 'A Receber' : 'A Pagar'))}</div>
        </div>
        <div class="dash-tx-date">${brDate(tx.data)}</div>
        <div class="dash-tx-value ${esc(tx.tipo)}">${tx.tipo === 'pagar' ? '−' : '+'}${money(tx.valor)}</div>
      </div>
    `).join('');
  }

  async function loadFluxo() {
    const { data, error } = await supabase
      .from('financeiro_fluxo_caixa_diario')
      .select('*')
      .gte('data', state.filters.inicio)
      .lte('data', state.filters.fim)
      .order('data', { ascending: true });

    if (error) {
      document.getElementById('fluxoTbody').innerHTML = `<tr><td colspan="8" class="fin-empty">${esc(error.message)}<br>Execute a migration do módulo financeiro no Supabase.</td></tr>`;
      return;
    }
    state.fluxo = data || [];
    renderFluxo();
    updateKpis();
  }

  async function loadDetalhes(date) {
    state.currentDate = date;
    document.getElementById('detalhesData').textContent = `Data: ${brDate(date)}`;
    const [receberRes, pagarRes, saldoRes, provisaoRes] = await Promise.all([
      supabase.from('financeiro_contas_receber').select('*').eq('vencimento', date).order('cliente'),
      supabase.from('financeiro_contas_pagar').select('*').eq('vencimento', date).order('favorecido'),
      supabase.from('financeiro_saldos_dia').select('*').eq('data', date).maybeSingle(),
      supabase.from('financeiro_provisoes').select('*').eq('data', date).maybeSingle()
    ]);
    state.receber = receberRes.data || [];
    state.pagar = pagarRes.data || [];
    document.getElementById('cfgData').value = date;
    document.getElementById('cfgSaldo').value = saldoRes.data?.saldo_dia ?? '';
    document.getElementById('cfgObs').value = saldoRes.data?.observacoes || provisaoRes.data?.observacoes || '';
    document.getElementById('cfgProvAuto').value = provisaoRes.data?.valor_automatico ?? '';
    document.getElementById('cfgProvManual').value = provisaoRes.data?.ajuste_manual ?? '';
    renderDetalhes();
    setTab('detalhes');
  }

  function updateKpis() {
    const total = state.fluxo.reduce((acc, row) => {
      acc.saldo += Number(row.saldo_dia || 0);
      acc.receber += Number(row.contas_receber || 0);
      acc.pagar += Number(row.contas_pagar || 0);
      acc.provisao += Number(row.provisoes_dia || 0);
      acc.projetado += Number(row.saldo_projetado || 0);
      return acc;
    }, { saldo: 0, receber: 0, pagar: 0, provisao: 0, projetado: 0 });
    const hasAttention = state.fluxo.some((row) => statusClass(row.status) === 'danger') || total.projetado < 0;
    document.getElementById('kpiSaldo').textContent = money(total.saldo);
    document.getElementById('kpiReceber').textContent = money(total.receber);
    document.getElementById('kpiPagar').textContent = money(total.pagar);
    document.getElementById('kpiProvisao').textContent = money(total.provisao);
    document.getElementById('kpiProjetado').textContent = money(total.projetado);
    const statusEl = document.getElementById('kpiStatus');
    statusEl.textContent = state.fluxo.length ? (hasAttention ? 'ATENÇÃO' : 'OK') : 'SEM DADOS';
    statusEl.className = hasAttention ? 'danger-label' : 'ok-label';
    document.querySelectorAll('.fin-kpi small').forEach((el, idx) => {
      if (idx < 4) el.textContent = dateRangeLabel(state.filters.inicio, state.filters.fim);
    });
    const miniEl = document.getElementById('cfFlowMini');
    if (miniEl && state.fluxo.length) {
      miniEl.style.display = '';
      const liquido = total.receber - total.pagar;
      document.getElementById('cfFmReceber').textContent = money(total.receber);
      document.getElementById('cfFmPagar').textContent = money(total.pagar);
      document.getElementById('cfFmLiquido').textContent = money(liquido);
      const sumBar = total.receber + total.pagar;
      const recvPct = sumBar > 0 ? Math.round((total.receber / sumBar) * 100) : 50;
      const payPct = 100 - recvPct;
      document.getElementById('cfBarRecv').style.width = recvPct + '%';
      document.getElementById('cfBarPay').style.width = payPct + '%';
    }
  }

  function renderFluxo() {
    const tbody = document.getElementById('fluxoTbody');
    if (!state.fluxo.length) {
      tbody.innerHTML = `<tr><td colspan="8" class="fin-empty">Nenhum dia encontrado no período.</td></tr>`;
      return;
    }
    tbody.innerHTML = state.fluxo.map((row) => `
      <tr>
        <td><strong>${brDate(row.data)}</strong></td>
        <td>${money(row.saldo_dia)}</td>
        <td>${money(row.contas_receber)}</td>
        <td>${money(row.contas_pagar)}</td>
        <td>${money(row.provisoes_dia)}</td>
        <td><strong>${money(row.saldo_projetado)}</strong></td>
        <td><span class="fin-status ${statusClass(row.status)}">${esc(row.status || 'OK')}</span></td>
        <td><button class="btn btn-secondary fin-small" data-detail-date="${esc(row.data)}" type="button">Abrir</button></td>
      </tr>
    `).join('');
  }

  function renderDetalhes() {
    const tbody = document.getElementById('detalhesTbody');
    let rows = [
      ...state.receber.map((r) => ({ tipo: 'Receber', situacao: r.situacao, nome: r.cliente, doc: r.fatura || r.numero_nf || r.codigo, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento })),
      ...state.pagar.map((r) => ({ tipo: 'Pagar', situacao: r.situacao, nome: r.favorecido, doc: r.doc || r.cod_grupo || r.parcela, valor: Number(r.valor || 0) - Number(r.valor_pago || 0), vencimento: r.vencimento }))
    ];

    const { tipo, situacao, favorecido, doc } = state.detFilter;
    if (tipo) rows = rows.filter((r) => r.tipo === tipo);
    if (situacao) rows = rows.filter((r) => (r.situacao || '').toLowerCase() === situacao.toLowerCase());
    if (favorecido) rows = rows.filter((r) => (r.nome || '').toLowerCase().includes(favorecido.toLowerCase()));
    if (doc) rows = rows.filter((r) => (r.doc || '').toLowerCase().includes(doc.toLowerCase()));

    const { col, dir } = state.detSort;
    if (col) {
      rows = [...rows].sort((a, b) => {
        const av = col === 'valor' ? a[col] : (a[col] || '');
        const bv = col === 'valor' ? b[col] : (b[col] || '');
        return col === 'valor' ? (av - bv) * dir : String(av).localeCompare(String(bv)) * dir;
      });
    }

    document.querySelectorAll('.det-th-sort').forEach((th) => {
      const c = th.dataset.detSort;
      const icon = th.querySelector('.det-sort-icon');
      if (icon) icon.textContent = c === col ? (dir === 1 ? '▲' : '▼') : '↕';
      th.classList.toggle('det-th-active', c === col);
    });

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="fin-empty">Nenhum lançamento encontrado.</td></tr>`;
      return;
    }
    tbody.innerHTML = rows.map((r) => `
      <tr><td>${esc(r.tipo)}</td><td>${esc(r.situacao || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${esc(r.doc || '-')}</td><td>${money(r.valor)}</td><td>${brDate(r.vencimento)}</td></tr>
    `).join('');
  }

  async function importFile(kind) {
    const input = document.getElementById(kind === 'receber' ? 'fileReceber' : 'filePagar');
    const fb = kind === 'receber' ? 'fbReceber' : 'fbPagar';
    const file = input.files?.[0];
    if (!file) return setFeedback(fb, 'Selecione uma planilha primeiro.', 'err');
    try {
      setFeedback(fb, 'Lendo planilha...');
      const rows = await readWorkbookRows(file);
      const mapped = kind === 'receber' ? mapReceber(rows, file.name) : mapPagar(rows, file.name);
      if (!mapped.length) throw new Error('Nenhuma linha válida encontrada. Confira os cabeçalhos e as datas.');
      setFeedback(fb, `Importando ${mapped.length} linhas...`);
      const table = kind === 'receber' ? 'financeiro_contas_receber' : 'financeiro_contas_pagar';
      const saved = await upsertChunk(table, mapped);
      setFeedback(fb, `${saved} registros atualizados sem duplicar.`, 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback(fb, err.message || 'Erro ao importar.', 'err');
    }
  }

  async function saveConfig(event) {
    event.preventDefault();
    const date = document.getElementById('cfgData').value;
    const saldo = Number(document.getElementById('cfgSaldo').value || 0);
    const provAuto = Number(document.getElementById('cfgProvAuto').value || 0);
    const provManual = Number(document.getElementById('cfgProvManual').value || 0);
    const obs = document.getElementById('cfgObs').value.trim() || null;
    const responsavel = userContext?.user?.name || userContext?.user?.email || userContext?.email || null;
    try {
      setFeedback('fbConfig', 'Salvando...');
      const saldoRes = await supabase.from('financeiro_saldos_dia').upsert({ data: date, saldo_dia: saldo, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (saldoRes.error) throw saldoRes.error;
      const provRes = await supabase.from('financeiro_provisoes').upsert({ data: date, descricao: 'Provisão do dia', valor_automatico: provAuto, ajuste_manual: provManual, observacoes: obs, responsavel }, { onConflict: 'data' });
      if (provRes.error) throw provRes.error;
      setFeedback('fbConfig', 'Ajustes salvos.', 'ok');
      await loadFluxo();
    } catch (err) {
      setFeedback('fbConfig', err.message || 'Erro ao salvar.', 'err');
    }
  }



  state.pagamentos = { tipo: null, periodo: '', conferencia: [], flash: [], ifood: [], alelo: [], logs: [], modo: 'adiantamentos' };

  function paySetFeedback(id, text, type = '') {
    setFeedback(id, text, type);
  }

  function setPayTab(tab) {
    document.querySelectorAll('.pay-subtab').forEach((btn) => btn.classList.toggle('active', btn.dataset.payTab === tab));
    document.querySelectorAll('.pay-table').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`pay-${tab}`)?.classList.add('active');
  }

  function updatePaySummary() {
    const p = state.pagamentos;
    const outputs = buildPaymentOutputs(p.conferencia || []);
    const total = outputs.okRows.reduce((sum, row) => sum + Number(row.valor || 0), 0);
    const registros = outputs.okRows.length;
    if (document.getElementById('payTipo')) document.getElementById('payTipo').textContent = p.tipo || '-';
    if (document.getElementById('payPeriodo')) document.getElementById('payPeriodo').textContent = p.periodo || '-';
    if (document.getElementById('payRegistros')) document.getElementById('payRegistros').textContent = String(registros);
    if (document.getElementById('payTotal')) document.getElementById('payTotal').textContent = money(total);
    if (document.getElementById('payFooterTotal')) document.getElementById('payFooterTotal').textContent = `Total pronto para pagar: ${money(total)}`;
    if (document.getElementById('payFooterHint')) {
      const pendentes = (p.conferencia || []).filter((row) => String(row.status_pagamento || '').toUpperCase() === 'PENDENTE').length;
      const pagos = (p.conferencia || []).filter((row) => String(row.status_pagamento || '').toUpperCase() === 'PAGO').length;
      document.getElementById('payFooterHint').textContent = `${registros} OK · ${pendentes} pendente(s) · ${pagos} já pago(s)`;
    }
    if (document.getElementById('btnPagarBeneficios')) document.getElementById('btnPagarBeneficios').disabled = registros <= 0;
    state.pagamentos.flash = outputs.flash;
    state.pagamentos.ifood = outputs.ifood;
    state.pagamentos.alelo = outputs.alelo;
  }

  function getPayFilteredEntries() {
    const termo = normalize(document.getElementById('payColaboradorFiltro')?.value || '');
    const entries = (state.pagamentos.conferencia || []).map((row, idx) => ({ row, idx }));
    if (!termo) return { entries, termo };
    const filtered = entries.filter(({ row }) => normalize([
      row.funcionario,
      row.cpf,
      row.destino,
      row.tipo,
      row.composicao,
      row.supervisao,
      row.observacao
    ].filter(Boolean).join(' ')).includes(termo));
    return { entries: filtered, termo };
  }

  function renderPayTables() {
    const p = state.pagamentos;
    updatePaySummary();
    const filtered = getPayFilteredEntries();
    const entries = filtered.entries;
    const filtroInfo = document.getElementById('payFiltroInfo');
    if (filtroInfo) {
      filtroInfo.textContent = filtered.termo
        ? `${entries.length} de ${(p.conferencia || []).length} colaborador(es) encontrados.`
        : `Mostrando ${(p.conferencia || []).length} colaborador(es).`;
    }

    document.getElementById('payConferenciaTbody').innerHTML = entries.length ? entries.map(({ row: r, idx }) => {
      const st = String(r.status_pagamento || 'OK').toUpperCase();
      const statusCell = st === 'PAGO'
        ? `<span class="pay-status-paid">PAGO</span>`
        : `
          <div class="pay-status-toggle" role="group" aria-label="Status do pagamento de ${esc(r.funcionario || 'colaborador')}">
            <button class="pay-status-btn ${st === 'OK' ? 'active-ok' : 'is-inactive'}" type="button" data-pay-status-index="${idx}" data-pay-status-value="OK">OK</button>
            <button class="pay-status-btn ${st === 'PENDENTE' ? 'active-pendente' : 'is-inactive'}" type="button" data-pay-status-index="${idx}" data-pay-status-value="PENDENTE">PENDENTE</button>
          </div>`;
      return `<tr><td>${statusCell}</td><td>${brDate(r.data)}</td><td><strong>${esc(r.funcionario || '-')}</strong></td><td>${esc(r.cpf || '-')}</td><td>${esc(r.destino || '-')}</td><td>${esc(r.tipo || '-')}</td><td>${money(r.valor)}</td><td>${esc(r.composicao || '-')}</td><td>${esc(r.supervisao || '-')}</td><td>${esc(r.observacao || '-')}</td></tr>`;
    }).join('') : `<tr><td colspan="10" class="fin-empty">${filtered.termo ? 'Nenhum colaborador encontrado nesse filtro.' : 'Nenhuma conferência gerada.'}</td></tr>`;

    document.getElementById('payFlashTbody').innerHTML = p.flash?.length ? p.flash.map((r) => `
      <tr><td>${esc(r.cpf || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${money(r.valor)}</td></tr>
    `).join('') : `<tr><td colspan="3" class="fin-empty">Nenhum pagamento Flash OK.</td></tr>`;

    document.getElementById('payIfoodTbody').innerHTML = p.ifood?.length ? p.ifood.map((r) => `
      <tr><td>${esc(r.cnpj || '-')}</td><td><strong>${esc(r.nome || '-')}</strong></td><td>${esc(r.cpf || '-')}</td><td>${esc(formatDateForXlsx(r.nascimento) || '-')}</td><td>${esc(r.email || '-')}</td><td>${esc(r.celular || '-')}</td><td>${esc(r.centro_custo || '-')}</td><td>${money(r.livre ?? r.valor)}</td></tr>
    `).join('') : `<tr><td colspan="8" class="fin-empty">Nenhum pagamento iFood OK.</td></tr>`;

    document.getElementById('payAleloTbody').innerHTML = p.alelo?.length ? p.alelo.map((r) => `
      <tr><td>${esc(r.serie || '-')}</td><td>${esc(r.cpf || '-')}</td><td>${money(r.valor)}</td><td>${esc(r.observacao || '-')}</td><td>${esc(r.nome || '-')}</td></tr>
    `).join('') : `<tr><td colspan="5" class="fin-empty">Nenhum pagamento Alelo OK.</td></tr>`;

    document.getElementById('payLogsTbody').innerHTML = p.logs?.length ? p.logs.map((r) => `
      <tr><td>${esc(r.data ? brDate(r.data) : (r.linha ? `Linha ${r.linha}` : '-'))}</td><td><strong>${esc(r.funcionario || '-')}</strong></td><td><span class="fin-status ${paymentStatusClass(r.status || r.tipo)}">${esc(r.status || r.tipo || '-')}</span></td><td>${esc(r.mensagem || '-')}</td></tr>
    `).join('') : `<tr><td colspan="4" class="fin-empty">Nenhuma pendência.</td></tr>`;
    updatePaySummary();
  }

  async function gerarProducaoPagamento(modo) {
    const inicio = document.getElementById('alimInicio').value;
    const fim = document.getElementById('alimFim').value;
    const isDiarias = modo === 'diarias';
    const label = isDiarias ? 'Diárias' : 'Alimentação';
    if (!inicio || !fim) return paySetFeedback('fbAlimentacao', 'Informe data inicial e final.', 'err');
    if (inicio > fim) return paySetFeedback('fbAlimentacao', 'A data inicial não pode ser maior que a final.', 'err');
    try {
      paySetFeedback('fbAlimentacao', `Consultando Produção Diária importada e colaboradores para ${label.toLowerCase()}...`);
      const [rhMap, producao] = await Promise.all([loadColaboradoresPagamento(fim), loadProducaoPagamento(inicio, fim)]);
      let apuracao = isDiarias ? apurarDiariasRows(producao, rhMap) : apurarAlimentacaoRows(producao, rhMap);
      apuracao = await syncPaidStatus(normalizePaymentRows(apuracao, document.getElementById('payDefaultStatus')?.value || 'OK'));
      if (!apuracao.conferencia.length && apuracao.logs.length) {
        paySetFeedback('fbAlimentacao', `Produção localizada, mas sem colaboradores válidos. Verifique Pendências: ${apuracao.logs.length}.`, 'err');
      }
      if (!apuracao.conferencia.length && !apuracao.logs.length) {
        paySetFeedback('fbAlimentacao', isDiarias ? 'Nenhum colaborador com contrato Diarista localizado no período.' : 'Nenhuma alimentação gerada no período.', 'err');
      }
      state.pagamentos = { tipo: label, periodo: dateRangeLabel(inicio, fim), modo: 'pagamentos', ...apuracao };
      renderPayTables();
      setPayTab('conferencia');
      paySetFeedback('fbAlimentacao', `Gerado da Produção Diária importada: ${apuracao.conferencia.length} conferências, ${apuracao.flash.length} Flash, ${apuracao.ifood.length} iFood, ${apuracao.logs.length} pendências.`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAlimentacao', err.message || `Erro ao gerar ${label.toLowerCase()}.`, 'err');
    }
  }

  async function gerarAlimentacao() {
    return gerarProducaoPagamento('alimentacao');
  }

  async function gerarDiarias() {
    return gerarProducaoPagamento('diarias');
  }


  async function gerarAdiantamentos() {
    const extratoFile = document.getElementById('adiantFileExtrato').files?.[0];
    if (!extratoFile) return paySetFeedback('fbAdiantamentos', 'Selecione ou arraste a planilha Solicitações Caixa Operacional.', 'err');
    try {
      paySetFeedback('fbAdiantamentos', 'Lendo planilha de adiantamentos...');
      const extratoRows = await readWorkbookRows(extratoFile);

      if (isSolicitacaoDespesasFile(extratoRows)) {
        paySetFeedback('fbAdiantamentos', 'Formato antigo detectado. Lendo base de colaboradores...');
        const rhMap = await loadColaboradoresPagamento(state.currentDate);
        let apuracao = buildSolicitacaoDespesasRows(extratoRows, rhMap);
        apuracao = await syncPaidStatus(normalizePaymentRows(apuracao, document.getElementById('payDefaultStatus')?.value || 'OK'));
        state.pagamentos = { tipo: 'Adiantamentos', periodo: extratoFile.name, modo: 'adiantamentos', ...apuracao };
        renderPayTables();
        setPayTab('conferencia');
        paySetFeedback('fbAdiantamentos', `Gerado da Solicitação de Despesas: ${apuracao.conferencia.length} conferências, ${apuracao.flash.length} Flash, ${apuracao.ifood.length} iFood, ${apuracao.logs.length} pendências/ignorados.`, 'ok');
        return;
      }

      const apuracao = makeAleloRows(extratoRows, []);
      const conferencia = [
        ...apuracao.alelo.map((r) => ({ data: r.data || '', funcionario: r.nome, cpf: String(r.cpf || '').replace(/^'/, ''), destino: 'Alelo', tipo: 'Adiantamento', valor: r.valor, composicao: r.observacao || 'Adiantamento', supervisao: '', observacao: r.serie ? 'OK' : 'Sem série' })),
        ...apuracao.ifood.map((r) => ({ data: r.data || '', funcionario: r.nome, cpf: r.cpf, destino: 'iFood', tipo: 'Adiantamento', valor: r.livre, composicao: r.observacao || 'Adiantamento', supervisao: '', observacao: 'OK' })),
        ...apuracao.flash.map((r) => ({ data: r.data || '', funcionario: r.nome, cpf: r.cpf, destino: 'Flash', tipo: 'Adiantamento', valor: r.valor, composicao: r.observacao || 'Adiantamento', supervisao: '', observacao: 'OK' }))
      ];
      let mergedApuracao = await syncPaidStatus(normalizePaymentRows({ conferencia, flash: apuracao.flash, ifood: apuracao.ifood, alelo: apuracao.alelo, logs: apuracao.logs }, document.getElementById('payDefaultStatus')?.value || 'OK'));
      state.pagamentos = { tipo: 'Adiantamentos', periodo: extratoFile.name, modo: 'adiantamentos', ...mergedApuracao };
      renderPayTables();
      setPayTab('conferencia');
      paySetFeedback('fbAdiantamentos', `Gerado: ${apuracao.flash.length} Flash, ${apuracao.ifood.length} iFood, ${apuracao.alelo.length} Alelo, ${apuracao.logs.length} pendências/ignorados.`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAdiantamentos', err.message || 'Erro ao gerar adiantamentos.', 'err');
    }
  }


  function setPayMode(mode) {
    const clean = mode === 'pagamentos' ? 'pagamentos' : 'adiantamentos';
    state.pagamentos.modo = clean;
    document.querySelectorAll('.pay-mode-btn').forEach((btn) => btn.classList.toggle('active', btn.dataset.payMode === clean));
    document.querySelectorAll('.pay-mode-panel').forEach((panel) => panel.classList.remove('active'));
    document.getElementById(`pay-mode-${clean}`)?.classList.add('active');
  }

  async function gerarPagamentoPeriodo() {
    const modo = document.getElementById('payTipoGeracao')?.value || 'alimentacao';
    return gerarProducaoPagamento(modo);
  }

  async function salvarResumoNotasFiscais(rows, execucaoId = null) {
    const resumo = groupNotasFiscaisResumo(rows, execucaoId);
    if (!resumo.length) return;
    const { error } = await supabase.from('financeiro_notas_fiscais_resumo').upsert(resumo, {
      onConflict: 'data_pagamento,regional,destino,modulo_origem'
    });
    if (error) throw error;
  }

  async function registrarLinhasPagamento(rows, execucaoId, status = 'PAGO', apiRetorno = null) {
    const payload = (rows || []).map((row) => ({
      execucao_id: execucaoId,
      unique_hash: row.unique_hash || makePaymentHash(row),
      data: row.data || null,
      funcionario: row.funcionario || null,
      cpf: onlyDigits(row.cpf) || null,
      destino: row.destino || null,
      tipo: row.tipo || null,
      valor: Number(row.valor || 0),
      composicao: row.composicao || null,
      coordenacao: row.coordenacao || null,
      supervisao: row.supervisao || null,
      banco: row.banco || null,
      observacao: row.observacao || null,
      status,
      pago_em: status === 'PAGO' ? new Date().toISOString() : null,
      api_retorno: apiRetorno
    }));
    if (!payload.length) return;
    const { error } = await supabase.from('financeiro_pagamentos_linhas').upsert(payload, { onConflict: 'unique_hash' });
    if (error) throw error;
  }

  async function pagarBeneficios() {
    const outputs = buildPaymentOutputs(state.pagamentos.conferencia || []);
    const rows = outputs.okRows.filter((row) => ['flash', 'ifood'].some((destino) => normalize(row.destino).includes(destino)));
    if (!rows.length) return paySetFeedback('fbAlimentacao', 'Nenhuma linha OK de Flash/iFood para pagar.', 'err');

    try {
      document.getElementById('btnPagarBeneficios').disabled = true;
      paySetFeedback('fbAlimentacao', 'Conferindo duplicidades e enviando pagamento para Flash/iFood...');

      const paid = await fetchAlreadyPaidMap(rows.map((row) => row.unique_hash || makePaymentHash(row)));
      const elegiveis = rows.filter((row) => !paid.has(row.unique_hash || makePaymentHash(row)));
      if (!elegiveis.length) {
        paySetFeedback('fbAlimentacao', 'Todos os registros OK já constam como PAGO. Nenhum pagamento duplicado foi enviado.', 'ok');
        state.pagamentos.conferencia = state.pagamentos.conferencia.map((row) => paid.has(row.unique_hash) ? { ...row, status_pagamento: 'PAGO', observacao: 'PAGO - bloqueado para evitar duplicidade' } : row);
        renderPayTables();
        return;
      }

      const total = elegiveis.reduce((sum, row) => sum + Number(row.valor || 0), 0);
      const { data: execucao, error: execError } = await supabase.from('financeiro_pagamentos_execucoes').insert({
        tipo: state.pagamentos.tipo || 'Pagamento',
        periodo: state.pagamentos.periodo || null,
        status: 'PROCESSANDO',
        total_valor: roundNumber(total),
        total_linhas: elegiveis.length,
        responsavel: userContext?.user?.name || userContext?.user?.email || null
      }).select('id').single();
      if (execError) throw execError;

      const apiPayload = {
        execucao_id: execucao.id,
        tipo: state.pagamentos.tipo,
        periodo: state.pagamentos.periodo,
        flash: buildPaymentOutputs(elegiveis).flash,
        ifood: buildPaymentOutputs(elegiveis).ifood,
        linhas: elegiveis
      };

      const { data: apiData, error: apiError } = await supabase.functions.invoke('financeiro-pagar-beneficios', { body: apiPayload });
      if (apiError) throw new Error(apiError.message || 'Falha na API de pagamento Flash/iFood.');
      if (apiData?.ok === false) throw new Error(apiData?.error || 'API de pagamento retornou erro.');

      await registrarLinhasPagamento(elegiveis, execucao.id, 'PAGO', apiData || null);
      await salvarResumoNotasFiscais(elegiveis, execucao.id);
      await supabase.from('financeiro_pagamentos_execucoes').update({ status: 'PAGO', api_retorno: apiData || null }).eq('id', execucao.id);

      const paidHashes = new Set(elegiveis.map((row) => row.unique_hash || makePaymentHash(row)));
      state.pagamentos.conferencia = state.pagamentos.conferencia.map((row) => paidHashes.has(row.unique_hash || makePaymentHash(row)) ? { ...row, status_pagamento: 'PAGO', observacao: 'PAGO - bloqueado para evitar duplicidade' } : row);
      renderPayTables();
      setPayTab('conferencia');
      paySetFeedback('fbAlimentacao', `Pagamento enviado e registrado: ${elegiveis.length} linha(s), ${money(total)}. Resumo enviado para Notas Fiscais.`, 'ok');
    } catch (err) {
      console.error(err);
      paySetFeedback('fbAlimentacao', err.message || 'Erro ao pagar.', 'err');
      updatePaySummary();
    }
  }

  const flashCols = [{ key: 'cpf', label: 'CPF' }, { key: 'valor', label: 'Valor' }];
  const ifoodCols = [
    { key: 'cnpj', label: 'CNPJ' }, { key: 'nome', label: 'Nome' }, { key: 'cpf', label: 'CPF' },
    { key: 'nascimento', label: 'Data de nascimento', format: formatDateForXlsx }, { key: 'email', label: 'Email' },
    { key: 'celular', label: 'Celular' }, { key: 'centro_custo', label: 'Centro de custo' }, { key: 'convencao', label: 'Convenção Coletiva' },
    { key: 'grupo_entrega', label: 'Grupo de entrega' }, { key: 'matricula', label: 'Matricula' }, { key: 'filtro', label: 'Filtro para relatorio de recarga' },
    { key: 'refeicao', label: 'Refeição (Aderente ao PAT)' }, { key: 'alimentacao', label: 'Alimentação (Aderente ao PAT)' }, { key: 'livre', label: 'Livre' }
  ];
  const aleloCols = [{ key: 'serie', label: 'Numero de Serie' }, { key: 'cpf', label: 'CPF' }, { key: 'valor', label: 'Valor da Carga' }, { key: 'observacao', label: 'Observacao' }];
  const confCols = [
    { key: 'data', label: 'Data', format: formatDateForXlsx }, { key: 'funcionario', label: 'Colaborador' }, { key: 'cpf', label: 'CPF' },
    { key: 'destino', label: 'Destino' }, { key: 'tipo', label: 'Tipo' }, { key: 'valor', label: 'Valor' },
    { key: 'composicao', label: 'Composição' }, { key: 'coordenacao', label: 'Coordenação' }, { key: 'supervisao', label: 'Supervisão' },
    { key: 'banco', label: 'C. Banc. Despesas' }, { key: 'observacao', label: 'Observação' }
  ];

  function exportPagamento(kind) {
    const p = state.pagamentos;
    if (kind === 'flash') {
      if (!p.flash?.length) return alert('Nenhum registro Flash para exportar.');
      return downloadWorkbook(`PGTO_FLASH_${compactDate(p.periodo) || compactDate(new Date().toISOString())}.xlsx`, [{ name: 'PGTO_FLASH', ws: worksheetFromObjects(p.flash, flashCols) }]);
    }
    if (kind === 'ifood') {
      if (!p.ifood?.length) return alert('Nenhum registro iFood para exportar.');
      return downloadWorkbook(`PGTO_IFOOD_${compactDate(p.periodo) || compactDate(new Date().toISOString())}.xlsx`, [{ name: 'PGTO_IFOOD', ws: worksheetFromObjects(p.ifood, ifoodCols) }]);
    }
    if (kind === 'alelo') {
      if (!p.alelo?.length) return alert('Nenhum registro Alelo para exportar.');
      return downloadCsv(`PGTO_ALELO_${compactDate(new Date().toISOString())}.csv`, p.alelo, aleloCols);
    }
    if (!p.conferencia?.length) return alert('Nenhuma conferência para exportar.');
    return downloadWorkbook(`CONFERENCIA_PAGAMENTOS_${compactDate(new Date().toISOString())}.xlsx`, [
      { name: 'Conferencia', ws: worksheetFromObjects(p.conferencia, confCols) },
      { name: 'Flash', ws: worksheetFromObjects(p.flash || [], flashCols) },
      { name: 'iFood', ws: worksheetFromObjects(p.ifood || [], ifoodCols) },
      { name: 'Alelo', ws: worksheetFromObjects(p.alelo || [], aleloCols) }
    ]);
  }

  document.querySelectorAll('.fin-tab').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tab); if (btn.dataset.tab && btn.dataset.tab !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tab}`); }));
  document.querySelectorAll('[data-tab-target]').forEach((btn) => btn.addEventListener('click', () => { setTab(btn.dataset.tabTarget); if (btn.dataset.tabTarget && btn.dataset.tabTarget !== 'fluxo') history.replaceState(null, '', `#${btn.dataset.tabTarget}`); }));
  document.getElementById('btnReload').addEventListener('click', loadFluxo);
  document.getElementById('btnReloadSetorPagamentos')?.addEventListener('click', loadSetorPagamentos);
  document.querySelectorAll('[data-setor-pay]').forEach((btn) => btn.addEventListener('click', () => {
    state.pagamentosSetorFilter = btn.dataset.setorPay || 'todos';
    document.querySelectorAll('[data-setor-pay]').forEach((item) => item.classList.toggle('active', item === btn));
    renderSetorPagamentos();
  }));
  document.getElementById('btnImportReceber').addEventListener('click', () => importFile('receber'));
  document.getElementById('btnImportPagar').addEventListener('click', () => importFile('pagar'));
  document.getElementById('configForm').addEventListener('submit', saveConfig);

  document.querySelectorAll('.det-th-sort').forEach((th) => {
    th.style.cursor = 'pointer';
    th.addEventListener('click', () => {
      const col = th.dataset.detSort;
      if (state.detSort.col === col) { state.detSort.dir *= -1; } else { state.detSort.col = col; state.detSort.dir = 1; }
      renderDetalhes();
    });
  });
  document.getElementById('detFiltroTipo')?.addEventListener('change', (e) => { state.detFilter.tipo = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroSituacao')?.addEventListener('change', (e) => { state.detFilter.situacao = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroFavorecido')?.addEventListener('input', (e) => { state.detFilter.favorecido = e.target.value; renderDetalhes(); });
  document.getElementById('detFiltroDoc')?.addEventListener('input', (e) => { state.detFilter.doc = e.target.value; renderDetalhes(); });

  function setupPagamentoDropzone(inputId) {
    const input = document.getElementById(inputId);
    const zone = document.querySelector(`[data-drop-for="${inputId}"]`);
    const nameEl = document.getElementById(`${inputId}Name`);
    if (!input || !zone || !nameEl) return;

    const setFileLabel = () => {
      const file = input.files && input.files[0];
      nameEl.textContent = file ? file.name : 'Nenhum arquivo selecionado';
      zone.classList.toggle('has-file', !!file);
    };

    input.addEventListener('change', setFileLabel);

    ['dragenter', 'dragover'].forEach((evtName) => {
      zone.addEventListener(evtName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.add('dragging');
      });
    });

    ['dragleave', 'drop'].forEach((evtName) => {
      zone.addEventListener(evtName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        zone.classList.remove('dragging');
      });
    });

    zone.addEventListener('drop', (event) => {
      const file = event.dataTransfer?.files?.[0];
      if (!file) return;
      const ok = /\.(xlsx|xls|csv)$/i.test(file.name);
      if (!ok) {
        paySetFeedback('fbAdiantamentos', 'Arquivo inválido. Envie XLSX, XLS ou CSV.', 'err');
        return;
      }
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      setFileLabel();
      paySetFeedback('fbAdiantamentos', `${file.name} carregado.`, 'ok');
    });

    setFileLabel();
  }

  setupPagamentoDropzone('adiantFileExtrato');
  document.getElementById('btnGerarPagamentoPeriodo').addEventListener('click', gerarPagamentoPeriodo);
  document.getElementById('btnGerarAdiantamentos').addEventListener('click', gerarAdiantamentos);
  document.querySelectorAll('.pay-mode-btn').forEach((btn) => btn.addEventListener('click', () => setPayMode(btn.dataset.payMode)));
  document.getElementById('btnPagarBeneficios').addEventListener('click', pagarBeneficios);
  document.getElementById('payColaboradorFiltro')?.addEventListener('input', renderPayTables);
  document.getElementById('btnLimparPayFiltro')?.addEventListener('click', () => {
    const input = document.getElementById('payColaboradorFiltro');
    if (input) input.value = '';
    renderPayTables();
  });
  content.addEventListener('click', (event) => {
    const statusBtn = event.target.closest('[data-pay-status-index][data-pay-status-value]');
    if (!statusBtn) return;
    const idx = Number(statusBtn.dataset.payStatusIndex);
    const value = String(statusBtn.dataset.payStatusValue || '').toUpperCase();
    if (!Number.isInteger(idx) || !state.pagamentos.conferencia?.[idx]) return;
    if (!['OK', 'PENDENTE'].includes(value)) return;
    state.pagamentos.conferencia[idx].status_pagamento = value;
    renderPayTables();
  });
  document.querySelectorAll('.pay-subtab').forEach((btn) => btn.addEventListener('click', () => setPayTab(btn.dataset.payTab)));
  document.getElementById('btnExportFlash').addEventListener('click', () => exportPagamento('flash'));
  document.getElementById('btnExportIfood').addEventListener('click', () => exportPagamento('ifood'));
  document.getElementById('btnExportAlelo').addEventListener('click', () => exportPagamento('alelo'));
  document.getElementById('btnExportConferencia').addEventListener('click', () => exportPagamento('conferencia'));
  document.getElementById('periodForm').addEventListener('submit', (event) => {
    event.preventDefault();
    state.filters.inicio = document.getElementById('filterInicio').value;
    state.filters.fim = document.getElementById('filterFim').value;
    loadFluxo();
  });
  content.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-detail-date]');
    if (btn) loadDetalhes(btn.dataset.detailDate);
  });

  window.addEventListener('hashchange', () => setTab(tabFromHash()));
  setPayMode('adiantamentos');
  setTab(tabFromHash());
  loadFluxo();
});
