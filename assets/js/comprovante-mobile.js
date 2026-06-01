import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = 'https://xyzpnuumdqhegxakkyws.supabase.co';
const SUPABASE_ANON = 'sb_publishable_YDjKfceWqANbNVMaHte2Kw_Dy4_i471';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON, { auth: { persistSession: true, autoRefreshToken: true } });

const BRL   = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const money = (v) => BRL.format(Number(v) || 0);
const esc   = (v) => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

let sharedFile     = null;
let uploadedUrl    = null;
let selectedRow    = null;
let pendingPayments = [];
let ocrMatches     = [];

// ─── Auth ────────────────────────────────────────────────────────────────────
async function checkAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) { window.location.replace('/painel/login.html'); return null; }
  return session;
}

// ─── Upload ──────────────────────────────────────────────────────────────────
async function uploadFile(file) {
  const ano  = new Date().getFullYear();
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `financeiro/comprovantes/${ano}/mobile/${Date.now()}_${safe}`;
  const { error } = await supabase.storage.from('notas-fiscais').upload(path, file, { upsert: false, contentType: file.type || 'image/jpeg' });
  if (error) throw new Error(`Falha no upload: ${error.message}`);
  const { data } = supabase.storage.from('notas-fiscais').getPublicUrl(path);
  return data?.publicUrl || path;
}

// ─── OCR via Edge Function ────────────────────────────────────────────────────
async function runOcr(imageUrl, session) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/ocr-comprovante`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON,
    },
    body: JSON.stringify({ imageUrl }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error || `Erro OCR ${res.status}`);
  return body; // { extracted, matches }
}

// ─── Pagamentos pendentes (fallback sem OCR) ──────────────────────────────────
async function loadPendingPayments() {
  const { data, error } = await supabase
    .from('financeiro_pagamentos')
    .select('id,origem,setor,origem_setor,descricao,conteudo,valor,forma_pagamento,dados_pagamento,chave_pix,fornecedor,favorecido,favorecido_nome,favorecido_documento,status,created_at')
    .in('status', ['PENDENTE', 'pendente', 'Pendente'])
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return data || [];
}

// ─── Vincular comprovante ─────────────────────────────────────────────────────
async function linkComprovante(row, url) {
  if (String(row.id || '').startsWith('compra_')) {
    const rawId = String(row.id).replace('compra_', '');
    const { error } = await supabase.from('compras_itens').update({ status: 'aguardando_nf', comprovante_url: url }).eq('id', rawId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from('financeiro_pagamentos').update({ status: 'PAGO', pago_em: new Date().toISOString(), comprovante_url: url }).eq('id', row.id);
    if (error) throw new Error(error.message);
  }
}

// ─── Telas ────────────────────────────────────────────────────────────────────
function show(stepId) {
  document.querySelectorAll('.step').forEach((el) => el.classList.remove('active'));
  const el = document.getElementById(stepId);
  if (el) el.classList.add('active');
  window.scrollTo(0, 0);
}

function setFile(file) {
  if (!file) return;
  sharedFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = document.getElementById('preview-img');
    if (img) { img.src = e.target.result; img.style.display = 'block'; }
    const badge = document.getElementById('pdf-badge');
    if (badge) badge.style.display = file.type === 'application/pdf' ? 'block' : 'none';
  };
  reader.readAsDataURL(file);
  document.getElementById('file-name').textContent = file.name;
  show('step-preview');
}

// ─── Render: resultado OCR ────────────────────────────────────────────────────
function renderOcrResult(extracted, matches) {
  // Campos extraídos
  const fields = [
    extracted.valor   != null ? { label: 'Valor',      value: money(extracted.valor), highlight: true } : null,
    extracted.data              ? { label: 'Data',       value: extracted.data } : null,
    extracted.favorecido        ? { label: 'Favorecido', value: extracted.favorecido } : null,
    extracted.cnpj              ? { label: 'CNPJ',       value: extracted.cnpj } : null,
    extracted.cpf               ? { label: 'CPF',        value: extracted.cpf } : null,
    extracted.pixKey            ? { label: 'Chave PIX',  value: extracted.pixKey } : null,
    extracted.idTransacao       ? { label: 'ID transação', value: extracted.idTransacao } : null,
  ].filter(Boolean);

  document.getElementById('ocr-fields').innerHTML = fields.length
    ? fields.map((f) => `
        <div class="ocr-field">
          <span class="ocr-label">${esc(f.label)}</span>
          <span class="ocr-value${f.highlight ? ' ocr-value-hl' : ''}">${esc(f.value)}</span>
        </div>`).join('')
    : '<p class="ocr-warn">Não foi possível extrair dados do comprovante.</p>';

  // Lista de matches
  const list = document.getElementById('ocr-matches');
  if (!matches.length) {
    list.innerHTML = '<div class="empty-state">Nenhum pagamento correspondente encontrado.</div>';
    document.getElementById('btn-ocr-confirm').style.display = 'none';
    return;
  }

  list.innerHTML = matches.map((m) => {
    const row   = m.row;
    const valor = row.valor || 0;
    const orig  = row.origem_setor || row.origem || row.setor || 'Financeiro';
    const desc  = (String(row.descricao || row.conteudo || '')).split('\n')[0].slice(0, 60);
    const fav   = row.favorecido_nome || row.favorecido || row.fornecedor || '';
    const conf  = m.confidence;
    const confLabel = conf === 'alta' ? '✓ Alta' : conf === 'media' ? '~ Média' : '? Baixa';
    const confCls   = conf === 'alta' ? 'badge-alta' : conf === 'media' ? 'badge-media' : 'badge-baixa';
    return `<div class="pay-card" data-id="${esc(String(row.id))}" data-score="${m.score}">
      <div class="pay-card-top">
        <span class="pay-tag">${esc(orig)}</span>
        <span class="pay-value">${money(valor)}</span>
      </div>
      ${desc ? `<div class="pay-desc">${esc(desc)}</div>` : ''}
      ${fav  ? `<div class="pay-fav">${esc(fav)}</div>` : ''}
      <div class="match-bar">
        <span class="conf-badge ${confCls}">${confLabel}</span>
        <span class="match-reasons">${m.reasons.join(' · ')}</span>
      </div>
    </div>`;
  }).join('');

  // Seleciona automaticamente o primeiro se confiança for alta
  const first = matches[0];
  if (first.confidence === 'alta') {
    list.querySelector('.pay-card')?.classList.add('selected');
    selectedRow = first.row;
  }
  document.getElementById('btn-ocr-confirm').disabled = !selectedRow;

  list.querySelectorAll('.pay-card').forEach((card) => {
    card.addEventListener('click', () => {
      list.querySelectorAll('.pay-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedRow = (matches.find((m) => String(m.row.id) === card.dataset.id) || {}).row || null;
      document.getElementById('btn-ocr-confirm').disabled = !selectedRow;
    });
  });
}

// ─── Render: lista manual ────────────────────────────────────────────────────
function renderPaymentList(rows) {
  const list = document.getElementById('payment-list');
  if (!rows.length) { list.innerHTML = '<div class="empty-state">Nenhum pagamento pendente encontrado.</div>'; return; }
  list.innerHTML = rows.map((row) => {
    const valor = row.valor || 0;
    const orig  = row.origem_setor || row.origem || row.setor || 'Financeiro';
    const desc  = (String(row.descricao || row.conteudo || '')).split('\n')[0].slice(0, 60);
    const fav   = row.favorecido_nome || row.favorecido || row.fornecedor || '';
    return `<div class="pay-card" data-id="${esc(String(row.id))}">
      <div class="pay-card-top"><span class="pay-tag">${esc(orig)}</span><span class="pay-value">${money(valor)}</span></div>
      ${desc ? `<div class="pay-desc">${esc(desc)}</div>` : ''}
      ${fav  ? `<div class="pay-fav">${esc(fav)}</div>`  : ''}
    </div>`;
  }).join('');
  list.querySelectorAll('.pay-card').forEach((card) => {
    card.addEventListener('click', () => {
      list.querySelectorAll('.pay-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      selectedRow = rows.find((r) => String(r.id) === card.dataset.id) || null;
      document.getElementById('btn-confirm').disabled = !selectedRow;
    });
  });
}

// ─── Confirmar vínculo ────────────────────────────────────────────────────────
async function confirm(fromOcr = false) {
  if (!selectedRow || !uploadedUrl) return;
  show('step-loading');
  document.getElementById('loading-msg').textContent = 'Vinculando comprovante...';
  try {
    await linkComprovante(selectedRow, uploadedUrl);
    document.getElementById('success-value').textContent  = money(selectedRow.valor || selectedRow.valor_total || selectedRow.total || 0);
    document.getElementById('success-origin').textContent = selectedRow.origem || selectedRow.setor || 'Financeiro';
    show('step-success');
  } catch (err) {
    show(fromOcr ? 'step-ocr' : 'step-select');
    alert('Erro ao vincular: ' + err.message);
  }
}

// ─── Fluxo principal ──────────────────────────────────────────────────────────
async function init() {
  const session = await checkAuth();
  if (!session) return;

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/painel/sw.js', { scope: '/painel/' }).catch(() => {});
  }

  // Web Share Target
  if (new URLSearchParams(location.search).get('shared') === '1') {
    try {
      const cache = await caches.open('g1000-shared-file');
      const resp  = await cache.match('/g1000-shared-file');
      if (resp) {
        const blob = await resp.blob();
        const name = decodeURIComponent(resp.headers.get('X-File-Name') || 'comprovante.jpg');
        setFile(new File([blob], name, { type: blob.type }));
        await cache.delete('/g1000-shared-file');
        history.replaceState(null, '', '/painel/comprovante-mobile.html');
        return;
      }
    } catch {}
  }

  show('step-capture');

  // Captura
  const inputCamera  = document.getElementById('input-camera');
  const inputGallery = document.getElementById('input-gallery');
  document.getElementById('btn-camera').addEventListener('click',  () => inputCamera.click());
  document.getElementById('btn-gallery').addEventListener('click', () => inputGallery.click());
  inputCamera.addEventListener('change',  (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });
  inputGallery.addEventListener('change', (e) => { if (e.target.files[0]) setFile(e.target.files[0]); });

  // Refazer
  document.getElementById('btn-retry').addEventListener('click', () => {
    sharedFile = uploadedUrl = selectedRow = null; pendingPayments = []; ocrMatches = [];
    inputCamera.value = ''; inputGallery.value = '';
    show('step-capture');
  });

  // Continuar → upload → OCR → resultado
  document.getElementById('btn-continue').addEventListener('click', async () => {
    if (!sharedFile) return;
    show('step-loading');
    try {
      document.getElementById('loading-msg').textContent = 'Enviando comprovante...';
      uploadedUrl = await uploadFile(sharedFile);

      document.getElementById('loading-msg').textContent = 'Analisando com OCR...';
      const { extracted, matches } = await runOcr(uploadedUrl, session);
      ocrMatches = matches || [];
      renderOcrResult(extracted, ocrMatches);
      show('step-ocr');
    } catch (err) {
      // Fallback: OCR falhou → lista manual
      try {
        document.getElementById('loading-msg').textContent = 'Buscando pagamentos pendentes...';
        pendingPayments = await loadPendingPayments();
        renderPaymentList(pendingPayments);
        show('step-select');
      } catch (err2) {
        show('step-preview');
        alert('Erro: ' + (err2.message || err.message));
      }
    }
  });

  // Confirmar a partir do OCR
  document.getElementById('btn-ocr-confirm').addEventListener('click', () => confirm(true));

  // Ignorar OCR → lista manual
  document.getElementById('btn-ocr-skip').addEventListener('click', async () => {
    show('step-loading');
    document.getElementById('loading-msg').textContent = 'Buscando pagamentos pendentes...';
    try {
      if (ocrMatches.length) {
        // Reusa os matches já retornados pelo OCR como lista manual
        pendingPayments = ocrMatches.map((m) => m.row);
      } else {
        pendingPayments = await loadPendingPayments();
      }
      renderPaymentList(pendingPayments);
      show('step-select');
    } catch (err) { show('step-ocr'); alert(err.message); }
  });

  // Confirmar da lista manual
  document.getElementById('btn-confirm').addEventListener('click', () => confirm(false));

  // Salvar sem vincular
  document.getElementById('link-sem-vinculo')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (!uploadedUrl) return;
    document.getElementById('success-value').textContent  = '—';
    document.getElementById('success-origin').textContent = 'Salvo sem vínculo';
    show('step-success');
  });

  // Novo comprovante
  document.getElementById('btn-new').addEventListener('click', () => {
    sharedFile = uploadedUrl = selectedRow = null; pendingPayments = []; ocrMatches = [];
    inputCamera.value = ''; inputGallery.value = '';
    show('step-capture');
  });
}

init();
