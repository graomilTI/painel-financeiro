import { initProtectedPage } from './pageInit.js';
import { toPanelUrl } from './paths.js';
import { supabase } from './supabaseClient.js';

const esc=(v)=>String(v??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
const brDate=(v)=>{const [y,m,d]=String(v||'').slice(0,10).split('-');return y&&m&&d?`${d}/${m}/${y}`:'-'};
function setMsg(msg,err=false){const el=document.getElementById('admPatFeedback'); if(el){el.textContent=msg||''; el.classList.toggle('err',!!err)}}
async function loadComprasPat(){
  const body=document.getElementById('admPatComprasBody');
  const {data,error}=await supabase.from('compras_patrimonios_cadastro').select('*, compras_itens(*)').order('created_at',{ascending:false}).limit(300);
  if(error){body.innerHTML=`<tr><td colspan="6" class="adm-pat-empty">${esc(error.message)}</td></tr>`;return;}
  if(!data?.length){body.innerHTML='<tr><td colspan="6" class="adm-pat-empty">Nenhum patrimônio vindo de compras.</td></tr>';return;}
  body.innerHTML=data.map(r=>`<tr><td>${esc(r.numero_patrimonio||'-')}</td><td>${esc(r.material||r.compras_itens?.material||'-')}</td><td>${esc(r.marca||r.compras_itens?.marca||'-')}</td><td>${esc(r.coordenacao||'-')}</td><td>${esc(r.status||'-')}</td><td><button class="btn btn-small btn-primary" data-ok="${esc(r.id)}" type="button">OK</button></td></tr>`).join('');
  body.querySelectorAll('[data-ok]').forEach(btn=>btn.onclick=async()=>{const {error}=await supabase.from('compras_patrimonios_cadastro').update({status:'ok', conferido_em:new Date().toISOString()}).eq('id',btn.dataset.ok); if(error){setMsg(error.message,true);return;} setMsg('Registro conferido.'); await loadComprasPat();});
}
function styles(){return `<style>.adm-pat-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:18px}.adm-pat-table{width:100%;border-collapse:collapse;min-width:820px}.adm-pat-table th,.adm-pat-table td{padding:12px;border-bottom:1px solid var(--line);text-align:left}.adm-pat-table th{font-size:12px;color:var(--muted);text-transform:uppercase}.adm-pat-empty{text-align:center;color:var(--muted)}.adm-pat-feedback{font-weight:800}.adm-pat-feedback.err{color:#fecaca}</style>`}
initProtectedPage('Patrimônio ADM', async (content) => {
  content.innerHTML = `${styles()}
    <section class="base-page"><div class="section-heading"><div><h2>Patrimônio ADM</h2><p class="section-subtitle">Central do módulo de patrimônios, incluindo os itens comprados que aguardam validação patrimonial.</p></div><div class="inline-nav"><a href="${toPanelUrl('adm-patrimonio')}" class="active">Painel de Patrimônios</a><a href="${toPanelUrl('patrimonio-relatorios')}">Relatórios</a><a href="${toPanelUrl('importar-patrimonios')}">Importar arquivo</a></div></div>
      <div class="grid-cards"><article class="card"><h3>Relatórios PDF / ZIP</h3><p class="muted">Página operacional para gerar Patrimônios, Equipamentos e Status Grãomil.</p><p class="mt-16"><a href="${toPanelUrl('patrimonio-relatorios')}" class="base-button primary" style="display:inline-flex;width:auto;text-decoration:none;">Abrir relatórios</a></p></article><article class="card"><h3>Importação diária</h3><p class="muted">A rotina de upload permanece em RELATÓRIOS.</p><p class="mt-16"><a href="${toPanelUrl('importar-patrimonios')}" class="base-button secondary" style="display:inline-flex;width:auto;text-decoration:none;">Ir para importação</a></p></article><article class="card"><h3>Compras patrimoniais</h3><p class="muted">Itens comprados como Patrimônio chegam aqui com Nº, material, marca e coordenação para conferência.</p></article></div>
      <article class="card mt-16"><div class="section-head"><div><h3>Registros vindos de Compras</h3><p class="muted">Clique em OK quando o registro estiver correto.</p></div><button class="btn btn-secondary" id="admPatRefresh" type="button">Atualizar</button></div><div class="adm-pat-table-wrap"><table class="adm-pat-table"><thead><tr><th>Nº</th><th>Material</th><th>Marca</th><th>Coordenação</th><th>Status</th><th>Ação</th></tr></thead><tbody id="admPatComprasBody"></tbody></table></div><div class="form-actions"><span id="admPatFeedback" class="adm-pat-feedback"></span></div></article>
    </section>`;
  document.getElementById('admPatRefresh').onclick=loadComprasPat; await loadComprasPat();
});
