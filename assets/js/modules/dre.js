(function () {
  const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];
  const BUCKET_DEFAULT = 'relatorios-uploads';
  const INDIVIDUAL_EXCLUDED = ['AGROTRADER','LOG1000','PARAGUAI'];
  const IGNORED = ['NULL'];
  const POOL = ['GERAL','AGROTRADER','LOG1000'];
  const ALIASES = { TERMINAISINATIVO: 'MARINGA E TERMINAIS' };

  const MONEY_ROWS = new Set([
    'NOTAS FISCAIS','DESCONTOS CONCEDIDOS+ACRÉSCIMOS','TOTAL DE IMPOSTOS','RECEITA LÍQUIDA',
    'TOTAL DE DESPESAS OPERACIONAIS','DESP COM VEICULOS+COMBUSTIVEIS','TOTAL DESPESAS PESSOAL',
    'LUCRO BRUTO','DESP ADM + COMERCIAL','LUCRO OPERACIONAL (EBTIDA)','DESPESAS FINANCEIRAS',
    'LUCRO LÍQUIDO','EMPRESTIMOS TERCEIROS','ANTECIPAÇÕES A FORNECEDORES','INVESTIMENTOS','RESULTADO FINAL',
    'TOTAL DESPESAS','TOTAL CUSTOS','CUSTO POR TONELADA','RECEITA POR TONELADA','MARGEM POR TONELADA',
    'CUSTO POR TONELADA DO VOLUME CLASSIFICADO','CUSTO POR TONELADA DO VOLUME TOTAL','RESULTADO POR TONELADA'
  ]);
  const PERCENT_ROWS = new Set(['MARGEM BRUTA','MARGEM EBTIDA','EFICIÊNCIA OPERACIONAL']);
  const VOLUME_ROWS = new Set(['VOLUME CLASSIFICADO (SEM CADÊNCIA)','VOLUME EMBARCADO + NHE + CAD','CARGAS']);

  const styles = `
    <style>
      .dre-wrap{--bg:#020617;--panel:#0d0d18;--card:rgba(15,23,42,.78);--line:rgba(148,163,184,.18);--green:#22c55e;--green2:#166534;--text:#e2e2f0;--muted:#6b7280;color:var(--text)}
      .dre-hero{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:end;margin-bottom:18px;padding:20px;border:1px solid rgba(34,197,94,.22);border-radius:26px;background:radial-gradient(circle at 10% 0%,rgba(34,197,94,.22),transparent 30%),radial-gradient(circle at 90% 0%,rgba(20,184,166,.16),transparent 26%),linear-gradient(145deg,rgba(15,23,42,.96),rgba(2,6,23,.82));box-shadow:0 22px 70px rgba(0,0,0,.24)}
      .dre-kicker{font-size:12px;color:#bbf7d0;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.dre-hero h2{margin:6px 0 4px;font-size:30px;letter-spacing:-.045em}.dre-hero p{margin:0;color:var(--muted);max-width:760px;line-height:1.5}
      .dre-controls{display:flex;gap:10px;flex-wrap:wrap;align-items:center;justify-content:flex-end}.dre-controls select,.dre-controls button{height:42px;border-radius:14px;border:1px solid rgba(255,255,255,0.08);background:#0d0d18;color:#e2e2f0;padding:0 12px;font-weight:850;color-scheme:dark}.dre-controls button{cursor:pointer}.dre-controls button.primary{background:linear-gradient(135deg,#166534,#22c55e);color:#052e16;border:0}.dre-controls button:disabled{opacity:.5;cursor:not-allowed}.dre-tabs{display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap}.dre-tab{border:1px solid var(--line);background:#0d0d18;color:#cbd5e1;border-radius:999px;padding:10px 15px;cursor:pointer;font-weight:900}.dre-tab.active{background:#166534;color:#fff;border-color:#22c55e}
      .dre-status{display:none;margin:0 0 14px;padding:12px 14px;border-radius:16px;border:1px solid var(--line);background:rgba(15,23,42,.72);color:var(--muted)}.dre-status.show{display:block}.dre-status strong{color:var(--text)}
      .dre-cards{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px;margin-bottom:14px}.dre-card{padding:15px;border-radius:22px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(15,23,42,.86),rgba(2,6,23,.62))}.dre-card span{display:block;color:var(--muted);font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.035em}.dre-card strong{display:block;margin-top:8px;font-size:20px;letter-spacing:-.03em}.dre-card small{display:block;margin-top:5px;color:#6b7280}.dre-card.positive strong{color:#86efac}.dre-card.negative strong{color:#fca5a5}
      .dre-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:14px;margin-bottom:14px}.dre-chart{border:1px solid var(--line);border-radius:22px;background:rgba(15,23,42,.78);padding:15px;min-height:260px}.dre-chart h3{margin:0 0 6px;font-size:15px}.dre-chart p{margin:0 0 12px;color:var(--muted);font-size:12px}.dre-bars{display:grid;grid-template-columns:repeat(12,1fr);gap:7px;align-items:end;height:170px;border-bottom:1px solid rgba(148,163,184,.2);padding-top:10px}.dre-bar-wrap{height:100%;display:flex;align-items:end;position:relative}.dre-bar{width:100%;min-height:3px;border-radius:12px 12px 0 0;background:linear-gradient(180deg,#22c55e,#166534)}.dre-bar.negative{background:linear-gradient(180deg,#fca5a5,#dc2626)}.dre-chart-labels{display:grid;grid-template-columns:repeat(12,1fr);gap:7px;margin-top:8px;font-size:10px;color:#6b7280;text-align:center}.dre-volume-row{display:grid;grid-template-columns:96px 1fr;gap:10px;align-items:center;margin:12px 0}.dre-volume-row strong{font-size:12px}.dre-track{height:14px;border-radius:999px;background:#020617;overflow:hidden;border:1px solid rgba(148,163,184,.22)}.dre-fill{height:100%;border-radius:999px;background:linear-gradient(90deg,#166534,#22c55e)}.dre-fill.secondary{background:linear-gradient(90deg,#0f766e,#67e8f9)}
      .dre-report{border:1px solid var(--line);border-radius:24px;overflow:hidden;background:#fff;color:#10101e}.dre-report-head{display:flex;justify-content:space-between;gap:16px;align-items:center;padding:18px 20px;background:linear-gradient(135deg,#052e16,#166534);color:#fff}.dre-report-head h3{margin:0;font-size:20px}.dre-report-head p{margin:4px 0 0;color:#dcfce7;font-size:12px}.dre-table-wrap{overflow:auto;background:#fff}.dre-table{width:100%;border-collapse:collapse;font-size:12px;min-width:1180px}.dre-table th{background:#b7e3c6;color:#052e16;text-align:center;font-weight:900;padding:10px;border:1px solid #b7cfc0}.dre-table td{padding:9px 10px;border:1px solid #d1d5db;text-align:right;white-space:nowrap}.dre-table td:first-child{text-align:left;font-weight:900;color:#10101e}.dre-table tr:nth-child(even) td{background:#f0fdf4}.dre-table tr.highlight td{background:#dcfce7!important;font-weight:900}.dre-table tr.result td{background:#bbf7d0!important;font-weight:900}.dre-table .neg{color:#dc2626}.dre-extra{display:grid;gap:12px;padding:14px;background:#fff}.dre-extra-box{border:1px solid #d1d5db;border-radius:16px;overflow:hidden}.dre-extra-box h4{margin:0;padding:10px 12px;background:#b7e3c6;color:#052e16}.dre-extra-box table{width:100%;border-collapse:collapse;font-size:12px}.dre-extra-box td,.dre-extra-box th{border:1px solid #d1d5db;padding:8px;text-align:right}.dre-extra-box td:first-child,.dre-extra-box th:first-child{text-align:left;font-weight:850}
      @media(max-width:1180px){.dre-cards{grid-template-columns:repeat(3,minmax(0,1fr))}.dre-grid{grid-template-columns:1fr}.dre-hero{grid-template-columns:1fr}.dre-controls{justify-content:flex-start}}@media(max-width:720px){.dre-cards{grid-template-columns:1fr}.dre-controls select,.dre-controls button{width:100%}}
    </style>`;

  const state = { tab:'geral', year:new Date().getFullYear(), regional:'', data:null, reports:[], busy:false };

  function norm(s){return String(s??'').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]/g,'');}
  function mapReg(s){const raw=String(s??'').trim(); return ALIASES[norm(raw)] || raw;}
  function isIgnored(r){return IGNORED.some(x=>norm(x)===norm(r));}
  function isExcluded(r){return INDIVIDUAL_EXCLUDED.some(x=>norm(x)===norm(r));}
  function isPool(r){return POOL.some(x=>norm(x)===norm(r));}
  function n(v){ if(v==null||v==='') return 0; if(typeof v==='number') return Number.isFinite(v)?v:0; const s=String(v).replace(/R\$\s*/gi,'').replace(/[^\d,.-]/g,''); const out=s.includes(',')&&s.includes('.')?s.replace(/\./g,'').replace(',','.'):s.replace(',','.'); const num=parseFloat(out); return Number.isFinite(num)?num:0; }
  function safe(s){return String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');}
  function avgNonZero(arr){ const vals=(arr||[]).map(n).filter(v=>v>0); return vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0; }
  function nomeKey(v){ return String(v || '').trim().toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' '); }
  function isSafristaTipo(tipo){ const t=norm(tipo); return t.includes('DIARISTA') || t.includes('INTERMITENTE') || t.includes('SAFRISTA'); }
  function isAtivoSituacao(situacao){ return !norm(situacao).includes('NAOATIVO') && !norm(situacao).includes('INATIVO'); }
    function fmtMoney(v){return n(v).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});} 
  function fmtNum(v){return n(v).toLocaleString('pt-BR',{maximumFractionDigits:2});}
  function fmtPct(v){return n(v).toLocaleString('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});}
  function total(arr){return (arr||[]).reduce((a,b)=>a+n(b),0);}
  function div(a,b){return n(b)?n(a)/n(b):0;}

  function monthFrom(value){
    if(value instanceof Date && !isNaN(value)) return {month:value.getMonth(), year:value.getFullYear()};
    if(typeof value==='number'){
      const d = new Date(Math.round((value - 25569) * 86400 * 1000));
      if(!isNaN(d)) return {month:d.getUTCMonth(), year:d.getUTCFullYear()};
    }
    const raw=String(value??'').trim();
    let m=raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/); if(m) return {month:+m[2]-1,year:+m[3]};
    m=raw.match(/^(\d{1,2})[\/\-.](\d{4})$/); if(m) return {month:+m[1]-1,year:+m[2]};
    const map={JAN:0,FEV:1,FEB:1,MAR:2,ABR:3,APR:3,MAI:4,MAY:4,JUN:5,JUL:6,AGO:7,AUG:7,SET:8,SEP:8,OUT:9,OCT:9,NOV:10,DEZ:11,DEC:11};
    m=raw.match(/^([A-Za-zÀ-ÿ]{3,})[\/\-. ]?(\d{4})?$/); if(m){const mo=map[norm(m[1]).slice(0,3)]; if(mo!=null) return {month:mo,year:m[2]?+m[2]:state.year};}
    const d=new Date(raw); return isNaN(d)?null:{month:d.getMonth(),year:d.getFullYear()};
  }

  function add(map, reg, key, mi, value){ if(!map[reg]) map[reg]={}; if(!map[reg][key]) map[reg][key]=Array(12).fill(0); map[reg][key][mi]+=n(value); }
  function addArr(map, reg, mi, value){ if(!map[reg]) map[reg]=Array(12).fill(0); map[reg][mi]+=n(value); }
  function getArr(map, reg){ return map?.[reg] || Array(12).fill(0); }
  function sumMapMonth(map, mi){ return Object.values(map||{}).reduce((a,arr)=>a+n(arr?.[mi]),0); }
  function sumTopic(base, reg, topics, mi){ const target=topics.map(norm); const obj=base[reg]||{}; return Object.entries(obj).reduce((acc,[tp,arr])=> target.includes(norm(tp)) ? acc+n(arr?.[mi]) : acc,0); }
  function sumTopicsAll(base, topics, mi){ return Object.keys(base||{}).reduce((acc,reg)=>acc+sumTopic(base,reg,topics,mi),0); }
  function geralTopic(geral, topics, mi){ return topics.reduce((a,tp)=>a+n(geral[tp]?.[mi]||geral[norm(tp)]?.[mi]),0); }
  function totalPatrimonioMes(desp, mi){
    return sumTopicsAll(desp?.base || {}, ['PATRIMONIO'], mi) + geralTopic(desp?.geral || {}, ['PATRIMONIO'], mi);
  }
  function investimentoRateadoPorAtivos(desp, reg, mi){
    const rateioInfo=desp?.ativosMedia || null;
    const mediaReg=n(rateioInfo?.porRegional?.[reg]?.[mi]);
    const totalMedia=n(rateioInfo?.total?.[mi]);
    if(mediaReg > 0 && totalMedia > 0){
      return totalPatrimonioMes(desp, mi) * (mediaReg / totalMedia);
    }
    // Fallback seguro: mantém a regra antiga quando ainda não há histórico mensal de ativos.
    return sumTopic(desp.base,reg,['PATRIMONIO'],mi)+rateio(desp.base,desp.geral,reg,['PATRIMONIO'],mi);
  }

  async function loadScript(src, globalName){ if(window[globalName]) return window[globalName]; await new Promise((res,rej)=>{const s=document.createElement('script');s.src=src;s.onload=res;s.onerror=rej;document.head.appendChild(s);}); return window[globalName]; }
  async function loadXlsx(){return loadScript('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js','XLSX');}
  async function loadHtml2Canvas(){return loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','html2canvas');}
  async function loadJsPdf(){await loadScript('https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js','jspdf'); return window.jspdf.jsPDF;}
  async function loadJsZip(){return loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js','JSZip');}

  function parseManifest(report){
    const raw=String(report?.observacoes||'').trim();
    if(!raw.startsWith('{')) return null;
    try{ const info=JSON.parse(raw); return info?.upload_mode==='chunked' ? (info.manifest || info) : null; }catch(_){ return null; }
  }
  async function fetchStorageBuffer(supabase, bucket, path){
    const {data,error}=await supabase.storage.from(bucket||BUCKET_DEFAULT).createSignedUrl(path, 600);
    if(error) throw error;
    const resp=await fetch(data.signedUrl);
    if(!resp.ok) throw new Error(`Falha ao baixar arquivo: ${path}`);
    return resp.arrayBuffer();
  }
  async function fetchReportBuffer(supabase, report){
    const manifest=parseManifest(report);
    const bucket=report.storage_bucket||BUCKET_DEFAULT;
    if(manifest?.chunks?.length){
      const parts=[...manifest.chunks].sort((a,b)=>Number(a.index||0)-Number(b.index||0));
      const buffers=[]; let size=0;
      for(const p of parts){ const buf=await fetchStorageBuffer(supabase, bucket, p.path); buffers.push(new Uint8Array(buf)); size+=buf.byteLength; }
      const merged=new Uint8Array(size); let offset=0;
      for(const b of buffers){ merged.set(b,offset); offset+=b.byteLength; }
      return merged.buffer;
    }
    const path=report.storage_path||report.path||report.arquivo_nome_storage;
    if(!path) throw new Error('Relatório sem caminho de storage.');
    return fetchStorageBuffer(supabase, bucket, path);
  }
  async function readWorkbook(supabase, report){
    const XLSX=await loadXlsx();
    const buf=await fetchReportBuffer(supabase, report);
    return XLSX.read(buf,{type:'array',cellDates:true});
  }
  function sheetRows(wb, names){
    const XLSX=window.XLSX;
    const wanted=(names||[]).map(norm);
    let name=wb.SheetNames.find(s=>wanted.includes(norm(s))) || wb.SheetNames[0];
    return XLSX.utils.sheet_to_json(wb.Sheets[name], {header:1, defval:null, raw:true});
  }
  function findHeaderRow(rows, required){
    const req=(required||[]).map(norm);
    let best=0, score=-1;
    rows.forEach((row,i)=>{ const headers=(row||[]).map(norm); const s=req.filter(r=>headers.includes(r)).length; if(s>score){score=s;best=i;} });
    return best;
  }
  function indexByHeaders(header){ const idx={}; (header||[]).forEach((h,i)=>{ const k=norm(h); if(k && idx[k]==null) idx[k]=i; }); return idx; }
  function col(idx, names){ for(const name of names){ const k=norm(name); if(idx[k]!=null) return idx[k]; } return -1; }

  function parseDespesas(rows){
    const out={base:{}, geral:{}, regionais:new Set()};
    if(!rows || rows.length<3) return out;
    const headerDates=rows[0]||[]; const headerTypes=rows[1]||[]; const columns=[]; let last=null;
    for(let c=1;c<headerTypes.length;c++){
      const m=monthFrom(headerDates[c]) || last; if(m) last=m;
      const tipo=String(headerTypes[c]||'').trim();
      if(!tipo || !m || m.year!==state.year) continue;
      if(/TOTAL/i.test(tipo) || /IMPOSTOS\s*PARCELADOS/i.test(tipo)) continue;
      columns.push({c,tipo,mi:m.month});
    }
    for(const row of rows.slice(2)){
      let reg=mapReg(row?.[0]);
      if(!reg || /TOTAL/i.test(reg) || isIgnored(reg)) continue;
      const isGeral=norm(reg)==='GERAL';
      if(!isGeral && !isExcluded(reg)) out.regionais.add(reg);
      for(const x of columns){
        if(isGeral){ const key=norm(x.tipo); if(!out.geral[key]) out.geral[key]=Array(12).fill(0); out.geral[key][x.mi]+=n(row[x.c]); }
        else add(out.base,reg,x.tipo,x.mi,row[x.c]);
      }
    }
    return out;
  }

  function parseNF(rows){
    const out={bruto:{}, descAcresc:{}, impostos:{}, regionais:new Set()};
    if(!rows?.length) return out;
    const hrow=findHeaderRow(rows,['Coordenação','Data','Valor Bruto']);
    const header=rows[hrow]||[]; const idx=indexByHeaders(header);
    const iReg=col(idx,['Coordenação','Coordenacao','Regional']);
    const iData=col(idx,['Data N.F.','Data da NF','Data NF','Data Nota','Data']);
    const iBruto=col(idx,['Valor Bruto','Valor Bruto da NF','Valor Bruto NF','Valor da N.F.','Valor NF','Valor']);
    const iDesc=col(idx,['Desconto','Descontos']);
    const iAcr=col(idx,['Acréscimo','Acrescimo','Acréscimos','Acrescimos']);
    const iImp=col(idx,['Imposto','Impostos','Total de Impostos']);
    if(iReg<0 || iData<0 || iBruto<0) return out;
    for(const row of rows.slice(hrow+1)){
      const reg=mapReg(row[iReg]); const m=monthFrom(row[iData]);
      if(!reg || !m || m.year!==state.year || isIgnored(reg)) continue;
      if(!isExcluded(reg)) out.regionais.add(reg);
      addArr(out.bruto,reg,m.month,row[iBruto]);
      addArr(out.descAcresc,reg,m.month,n(row[iAcr])-n(row[iDesc]));
      addArr(out.impostos,reg,m.month,row[iImp]);
    }
    return out;
  }

  function parseResultadoDiario(rows){
    const out={classificado:{}, embarcado:{}, cargas:{}, valorEmbarcado:{}, testes:{}, regionais:new Set()};
    if(!rows?.length) return out;
    const hrow=findHeaderRow(rows,['O.S.','Toneladas','Embarcado','Coordenação']);
    const header=rows[hrow]||[]; const idx=indexByHeaders(header);
    const iReg=col(idx,['Coordenação','Coordenacao','Regional']);
    const iData=col(idx,['Data']);
    const iTon=col(idx,['Toneladas']);
    const iEmb=col(idx,['Embarcado']);
    const iCargas=col(idx,['Cargas']);
    const iValorEmb=col(idx,['Valor Embarcado']);
    const testCols=['Total Afla','Total Vomitoxina','Total Falling Number','Total Intacta','Total GMO'].map(x=>col(idx,[x])).filter(i=>i>=0);
    if(iReg<0 || iData<0 || iTon<0 || iEmb<0) return out;
    for(const row of rows.slice(hrow+1)){
      const reg=mapReg(row[iReg]); const m=monthFrom(row[iData]);
      if(!reg || !m || m.year!==state.year || isIgnored(reg)) continue;
      if(!isExcluded(reg)) out.regionais.add(reg);
      addArr(out.classificado,reg,m.month,row[iTon]);
      addArr(out.embarcado,reg,m.month,row[iEmb]);
      addArr(out.cargas,reg,m.month,row[iCargas]);
      addArr(out.valorEmbarcado,reg,m.month,row[iValorEmb]);
      addArr(out.testes,reg,m.month,testCols.reduce((a,i)=>a+n(row[i]),0));
    }
    return out;
  }


  async function loadResultadoDiarioFromDb(supabase, year){
    const out={classificado:{}, embarcado:{}, cargas:{}, valorEmbarcado:{}, testes:{}, regionais:new Set(), totalRows:0};
    if(!supabase || !year) return out;

    const start=`${year}-01-01`;
    const end=`${year + 1}-01-01`;
    const pageSize=1000;
    let from=0;

    while(true){
      const {data,error}=await supabase
        .from('relatorio_resultado_diario')
        .select('data,coordenacao,cargas,toneladas,embarcado,valor_embarcado,total_afla,total_vomitoxina,total_falling_number,total_intacta,total_gmo')
        .gte('data', start)
        .lt('data', end)
        .range(from, from + pageSize - 1);

      if(error){
        console.warn('DRE: não foi possível carregar produção do banco relatorio_resultado_diario.', error);
        break;
      }

      const rows=data || [];
      out.totalRows += rows.length;

      for(const row of rows){
        const reg=mapReg(row.coordenacao);
        const m=monthFrom(row.data);
        if(!reg || !m || m.year!==year || isIgnored(reg)) continue;
        if(!isExcluded(reg)) out.regionais.add(reg);
        addArr(out.classificado,reg,m.month,row.toneladas);
        addArr(out.embarcado,reg,m.month,row.embarcado);
        addArr(out.cargas,reg,m.month,row.cargas);
        addArr(out.valorEmbarcado,reg,m.month,row.valor_embarcado);
        addArr(out.testes,reg,m.month,
          n(row.total_afla) +
          n(row.total_vomitoxina) +
          n(row.total_falling_number) +
          n(row.total_intacta) +
          n(row.total_gmo)
        );
      }

      if(rows.length < pageSize) break;
      from += pageSize;
    }

    return out;
  }


  async function loadProduzidoColaboradorFromDb(supabase, year){
    const out={porRegional:{}, geral:Array(12).fill(0), regionais:new Set(), totalProdRows:0, totalHistRows:0};
    if(!supabase || !year) return out;
    const start=`${year}-01-01`;
    const end=`${year + 1}-01-01`;

    let prodRows=[];
    try{
      const pageSize=1000;
      let from=0;
      while(true){
        const {data,error}=await supabase
          .from('relatorio_resultado_diario')
          .select('data,coordenacao,funcionario,cargas,toneladas')
          .gte('data', start)
          .lt('data', end)
          .range(from, from + pageSize - 1);
        if(error) throw error;
        const rows=data||[];
        prodRows.push(...rows);
        if(rows.length < pageSize) break;
        from += pageSize;
      }
    }catch(error){
      console.warn('DRE: não foi possível carregar produção diária para produção por colaborador.', error);
      return out;
    }

    let histRows=[];
    try{
      const pageSize=1000;
      let from=0;
      while(true){
        const {data,error}=await supabase
          .from('historico_colaboradores')
          .select('data_referencia,nome,situacao,coordenacao,tipo')
          .gte('data_referencia', start)
          .lt('data_referencia', end)
          .range(from, from + pageSize - 1);
        if(error) throw error;
        const rows=data||[];
        histRows.push(...rows);
        if(rows.length < pageSize) break;
        from += pageSize;
      }
    }catch(error){
      console.warn('DRE: não foi possível carregar histórico diário de colaboradores para produção por colaborador.', error);
      return out;
    }

    out.totalProdRows=prodRows.length;
    out.totalHistRows=histRows.length;

    const prodByDateReg={};
    const pessoasComProducaoByDateReg={};
    for(const p of prodRows){
      const date=p.data;
      const reg=mapReg(p.coordenacao);
      const m=monthFrom(date);
      // Produção por colaborador no DRE não deve considerar a coordenação GERAL.
      if(!date || !reg || !m || m.year!==year || isIgnored(reg) || isExcluded(reg) || norm(reg)==='GERAL' || isPool(reg)) continue;
      const key=`${date}|${reg}`;
      if(!prodByDateReg[key]) prodByDateReg[key]={date,reg,mi:m.month,tons:0};
      prodByDateReg[key].tons += n(p.toneladas);

      const pessoa=nomeKey(p.funcionario);
      const teveCarga = n(p.cargas) > 0 || n(p.toneladas) > 0;
      if(pessoa && teveCarga){
        if(!pessoasComProducaoByDateReg[key]) pessoasComProducaoByDateReg[key]=new Set();
        pessoasComProducaoByDateReg[key].add(pessoa);
      }
      out.regionais.add(reg);
    }

    // Regra oficial: todos os efetivos ativos entram no denominador;
    // diarista/intermitente/safrista entra somente se teve carga lançada no dia.
    // No DRE não filtra cargo.
    const ativosByDateReg={};
    for(const h of histRows){
      const date=h.data_referencia;
      const reg=mapReg(h.coordenacao);
      const nome=nomeKey(h.nome);
      if(!date || !reg || !nome || isIgnored(reg) || isExcluded(reg) || norm(reg)==='GERAL' || isPool(reg)) continue;
      if(!isAtivoSituacao(h.situacao)) continue;
      const m=monthFrom(date);
      if(!m || m.year!==year) continue;
      const key=`${date}|${reg}`;
      if(isSafristaTipo(h.tipo)){
        const pessoasComProd = pessoasComProducaoByDateReg[key] || new Set();
        if(!pessoasComProd.has(nome)) continue;
      }
      if(!ativosByDateReg[key]) ativosByDateReg[key]=new Set();
      ativosByDateReg[key].add(nome);
      out.regionais.add(reg);
    }

    const monthRegional={};
    const dailyGeral={};
    for(const key of Object.keys(prodByDateReg)){
      const st=prodByDateReg[key];
      const pessoas = ativosByDateReg[key] ? ativosByDateReg[key].size : 0;
      if(pessoas <= 0 || st.tons <= 0) continue;
      if(!monthRegional[st.reg]) monthRegional[st.reg]=Array.from({length:12},()=>({soma:0,cont:0}));
      monthRegional[st.reg][st.mi].soma += st.tons / pessoas;
      monthRegional[st.reg][st.mi].cont += 1;
      const dg=dailyGeral[st.date] || (dailyGeral[st.date]={mi:st.mi,tons:0,pessoas:0});
      dg.tons += st.tons;
      dg.pessoas += pessoas;
    }

    for(const reg of Object.keys(monthRegional)){
      out.porRegional[reg]=Array(12).fill(0);
      for(let mi=0; mi<12; mi++){
        const m=monthRegional[reg][mi];
        out.porRegional[reg][mi]=m.cont ? m.soma / m.cont : 0;
      }
    }

    const monthGeral=Array.from({length:12},()=>({soma:0,cont:0}));
    for(const d of Object.values(dailyGeral)){
      if(d.pessoas > 0 && d.tons > 0){
        monthGeral[d.mi].soma += d.tons / d.pessoas;
        monthGeral[d.mi].cont += 1;
      }
    }
    for(let mi=0; mi<12; mi++){
      out.geral[mi]=monthGeral[mi].cont ? monthGeral[mi].soma / monthGeral[mi].cont : 0;
    }
    return out;
  }

  async function loadMediaAtivosPorRegionalFromDb(supabase, year){
    const out={porRegional:{}, total:Array(12).fill(0), regionais:new Set(), totalHistRows:0};
    if(!supabase || !year) return out;
    const start=`${year}-01-01`;
    const end=`${year + 1}-01-01`;

    async function fetchRows(selectCols){
      const all=[];
      const pageSize=1000;
      let from=0;
      while(true){
        const {data,error}=await supabase
          .from('historico_colaboradores')
          .select(selectCols)
          .gte('data_referencia', start)
          .lt('data_referencia', end)
          .range(from, from + pageSize - 1);
        if(error) throw error;
        const rows=data||[];
        all.push(...rows);
        if(rows.length < pageSize) break;
        from += pageSize;
      }
      return all;
    }

    let histRows=[];
    try{
      histRows = await fetchRows('data_referencia,nome,situacao,coordenacao,origem');
    }catch(error){
      console.warn('DRE: não foi possível carregar histórico diário para rateio de investimentos por ativos.', error);
      return out;
    }

    out.totalHistRows = histRows.length;
    const daily={};
    for(const h of histRows){
      const date=h.data_referencia;
      const reg=mapReg(h.coordenacao);
      const nome=nomeKey(h.nome);
      if(!date || !reg || !nome || isIgnored(reg) || isExcluded(reg) || norm(reg)==='GERAL' || isPool(reg)) continue;
      if(!isAtivoSituacao(h.situacao)) continue;
      const m=monthFrom(date);
      if(!m || m.year!==year) continue;
      const key=`${date}|${reg}`;
      if(!daily[key]) daily[key]={reg,mi:m.month,nomes:new Set()};
      daily[key].nomes.add(nome);
      out.regionais.add(reg);
    }

    const monthRegional={};
    for(const st of Object.values(daily)){
      if(!monthRegional[st.reg]) monthRegional[st.reg]=Array.from({length:12},()=>({soma:0,cont:0}));
      monthRegional[st.reg][st.mi].soma += st.nomes.size;
      monthRegional[st.reg][st.mi].cont += 1;
    }

    for(const reg of Object.keys(monthRegional)){
      out.porRegional[reg]=Array(12).fill(0);
      for(let mi=0; mi<12; mi++){
        const item=monthRegional[reg][mi];
        out.porRegional[reg][mi]=item.cont ? item.soma / item.cont : 0;
        out.total[mi] += out.porRegional[reg][mi];
      }
    }

    return out;
  }

  function parseAntecipacoes(rows){
    const arr=Array(12).fill(0); if(!rows?.length) return arr;
    const hrow=findHeaderRow(rows,['Data','Credito']); const idx=indexByHeaders(rows[hrow]||[]);
    const iData=col(idx,['Data','Data da NF','Data Emissão']); const iCred=col(idx,['Credito','Crédito']);
    if(iData<0 || iCred<0) return arr;
    rows.slice(hrow+1).forEach(row=>{ const m=monthFrom(row[iData]); if(m && m.year===state.year) arr[m.month]+=n(row[iCred]); });
    return arr;
  }

  function rateio(base,geral,reg,topics,mi){
    const proprio=sumTopic(base,reg,topics,mi);
    if(!proprio) return 0;
    let totalSemPool=0;
    for(const r of Object.keys(base||{})){ if(!isPool(r)) totalSemPool+=sumTopic(base,r,topics,mi); }
    if(!totalSemPool) return 0;
    let pool=geralTopic(geral,topics,mi);
    for(const r of Object.keys(base||{})){ if(isPool(r)) pool+=sumTopic(base,r,topics,mi); }
    return pool ? (proprio/totalSemPool)*pool : 0;
  }

  function buildForRegional(reg, source){
    const {desp,nf,prod,antecipacoes}=source;
    const rows=[];
    const vals={notas:Array(12).fill(0),desc:Array(12).fill(0),imp:Array(12).fill(0),rec:Array(12).fill(0),despOp:Array(12).fill(0),veic:Array(12).fill(0),pessoal:Array(12).fill(0),lb:Array(12).fill(0),adm:Array(12).fill(0),ebtida:Array(12).fill(0),fin:Array(12).fill(0),ll:Array(12).fill(0),emp:Array(12).fill(0),antec:Array(12).fill(0),inv:Array(12).fill(0),res:Array(12).fill(0),mb:Array(12).fill(0),me:Array(12).fill(0)};
    for(let mi=0;mi<12;mi++){
      vals.notas[mi]=reg?n(getArr(nf.bruto,reg)[mi]):sumMapMonth(nf.bruto,mi);
      vals.desc[mi]=reg?n(getArr(nf.descAcresc,reg)[mi]):sumMapMonth(nf.descAcresc,mi);
      vals.imp[mi]=reg?n(getArr(nf.impostos,reg)[mi]):sumMapMonth(nf.impostos,mi);
      vals.rec[mi]=vals.notas[mi]+vals.desc[mi]-vals.imp[mi];
      if(reg){
        vals.despOp[mi]=sumTopic(desp.base,reg,['DESPESAS OPERACIONAIS'],mi)+rateio(desp.base,desp.geral,reg,['DESPESAS OPERACIONAIS'],mi);
        vals.veic[mi]=sumTopic(desp.base,reg,['COMBUSTIVEIS E LUBRIFICANTES','DESPESAS COM VEICULOS'],mi)+rateio(desp.base,desp.geral,reg,['COMBUSTIVEIS E LUBRIFICANTES','DESPESAS COM VEICULOS'],mi);
        vals.pessoal[mi]=sumTopic(desp.base,reg,['DESPESAS RH','FOLHA DE PAGAMENTO','IMPOSTOS SOBRE FOLHA'],mi)+rateio(desp.base,desp.geral,reg,['DESPESAS RH','FOLHA DE PAGAMENTO','IMPOSTOS SOBRE FOLHA'],mi);
        vals.adm[mi]=sumTopic(desp.base,reg,['DESPESAS ADMINISTRATIVAS','DESPESAS COMERCIAIS'],mi)+rateio(desp.base,desp.geral,reg,['DESPESAS ADMINISTRATIVAS','DESPESAS COMERCIAIS'],mi);
        vals.fin[mi]=rateio(desp.base,desp.geral,reg,['DESPESAS FINANCEIRAS'],mi);
        vals.inv[mi]=investimentoRateadoPorAtivos(desp,reg,mi);
      } else {
        vals.despOp[mi]=sumTopicsAll(desp.base,['DESPESAS OPERACIONAIS'],mi)+geralTopic(desp.geral,['DESPESAS OPERACIONAIS'],mi);
        vals.veic[mi]=sumTopicsAll(desp.base,['COMBUSTIVEIS E LUBRIFICANTES','DESPESAS COM VEICULOS'],mi)+geralTopic(desp.geral,['COMBUSTIVEIS E LUBRIFICANTES','DESPESAS COM VEICULOS'],mi);
        vals.pessoal[mi]=sumTopicsAll(desp.base,['DESPESAS RH','FOLHA DE PAGAMENTO','IMPOSTOS SOBRE FOLHA'],mi)+geralTopic(desp.geral,['DESPESAS RH','FOLHA DE PAGAMENTO','IMPOSTOS SOBRE FOLHA'],mi);
        vals.adm[mi]=sumTopicsAll(desp.base,['DESPESAS ADMINISTRATIVAS','DESPESAS COMERCIAIS'],mi)+geralTopic(desp.geral,['DESPESAS ADMINISTRATIVAS','DESPESAS COMERCIAIS'],mi);
        vals.fin[mi]=sumTopicsAll(desp.base,['DESPESAS FINANCEIRAS','RETIRADA SÓCIOS','RETIRADA SOCIOS'],mi)+geralTopic(desp.geral,['DESPESAS FINANCEIRAS','RETIRADA SÓCIOS','RETIRADA SOCIOS'],mi);
        vals.emp[mi]=sumTopicsAll(desp.base,['EMPRESTIMOS TERCEIROS'],mi)+geralTopic(desp.geral,['EMPRESTIMOS TERCEIROS'],mi);
        vals.antec[mi]=n(antecipacoes[mi]);
        vals.inv[mi]=sumTopicsAll(desp.base,['PATRIMONIO'],mi)+geralTopic(desp.geral,['PATRIMONIO'],mi);
      }
      vals.lb[mi]=vals.rec[mi]-vals.despOp[mi]-vals.veic[mi]-vals.pessoal[mi];
      vals.ebtida[mi]=vals.lb[mi]-vals.adm[mi];
      vals.ll[mi]=vals.ebtida[mi]-vals.fin[mi];
      vals.res[mi]=vals.ll[mi]-vals.emp[mi]-vals.antec[mi]-vals.inv[mi];
      vals.mb[mi]=div(vals.lb[mi],vals.rec[mi]); vals.me[mi]=div(vals.ebtida[mi],vals.rec[mi]);
    }
    const push=(label,arr)=>rows.push({label,values:arr,total:PERCENT_ROWS.has(label)?0:total(arr)});
    push('NOTAS FISCAIS',vals.notas); push('DESCONTOS CONCEDIDOS+ACRÉSCIMOS',vals.desc); push('TOTAL DE IMPOSTOS',vals.imp); push('RECEITA LÍQUIDA',vals.rec);
    push('TOTAL DE DESPESAS OPERACIONAIS',vals.despOp); push('DESP COM VEICULOS+COMBUSTIVEIS',vals.veic); push('TOTAL DESPESAS PESSOAL',vals.pessoal); push('LUCRO BRUTO',vals.lb);
    push('DESP ADM + COMERCIAL',vals.adm); push('LUCRO OPERACIONAL (EBTIDA)',vals.ebtida); push('DESPESAS FINANCEIRAS',vals.fin); push('LUCRO LÍQUIDO',vals.ll);
    if(!reg){ push('EMPRESTIMOS TERCEIROS',vals.emp); push('ANTECIPAÇÕES A FORNECEDORES',vals.antec); }
    push('INVESTIMENTOS',vals.inv); push('RESULTADO FINAL',vals.res); rows.push({label:'MARGEM BRUTA',values:vals.mb,total:div(total(vals.lb),total(vals.rec))}); rows.push({label:'MARGEM EBTIDA',values:vals.me,total:div(total(vals.ebtida),total(vals.rec))});

    const volClass=reg?getArr(prod.classificado,reg):Array.from({length:12},(_,mi)=>sumMapMonth(prod.classificado,mi));
    // Volume Total no DRE: coluna Embarcado do Resultado Diário, que consolida Class + CAD + FOB + CIF.
    const volTotal=reg?getArr(prod.embarcado,reg):Array.from({length:12},(_,mi)=>sumMapMonth(prod.embarcado,mi));
    const volEmb=volTotal; // compatibilidade com gráficos/exportações antigas
    const geralVolClass=Array.from({length:12},(_,mi)=>sumMapMonth(prod.classificado,mi));
    const geralVolTotal=Array.from({length:12},(_,mi)=>sumMapMonth(prod.embarcado,mi));
    const cargas=reg?getArr(prod.cargas,reg):Array.from({length:12},(_,mi)=>sumMapMonth(prod.cargas,mi));
    const prodColab=reg?getArr(prod.prodColab,reg):(prod.prodColabGeral || Array(12).fill(0));
    const prodColabGeral=prod.prodColabGeral || Array(12).fill(0);
    const totalDesp=vals.despOp.map((_,mi)=>vals.despOp[mi]+vals.veic[mi]+vals.pessoal[mi]+vals.adm[mi]+vals.fin[mi]+vals.inv[mi]);
    const cptEmb=totalDesp.map((v,mi)=>div(v,volTotal[mi]));
    const cptClass=totalDesp.map((v,mi)=>div(v,volClass[mi]));
    const receitaTon=vals.rec.map((v,mi)=>div(v,volTotal[mi]));
    const margemTon=vals.res.map((v,mi)=>div(v,volTotal[mi]));
    const resultadoTon=vals.res.map((v,mi)=>div(v,volTotal[mi]));
    const eficiencia=volTotal.map((v,mi)=>div(v,volClass[mi]));
    // Desempenho por colaborador: toneladas produzidas ÷ pessoas consideradas.
    // Regional = produzido da regional ÷ efetivos ativos + intermitentes/diaristas com produção.
    // Geral = produzido total da empresa ÷ efetivos ativos + intermitentes/diaristas com produção, sem coordenação GERAL.
    const desempenhoRegional=prodColab;
    const desempenhoGeral=prodColabGeral;
    return {main:rows, extras:{totalDesp,volClass,volEmb,volTotal,cargas,prodColab,prodColabGeral,cptEmb,cptClass,receitaTon,margemTon,resultadoTon,eficiencia,desempenhoRegional,desempenhoGeral}, vals};
  }

  function buildDre(){
    const src=state.reportsData;
    const regionais=[...new Set([...src.desp.regionais,...src.nf.regionais,...src.prod.regionais])]
      .map(mapReg)
      .filter(r => r && norm(r) !== 'GERAL' && !isExcluded(r) && !isIgnored(r))
      .sort((a,b)=>a.localeCompare(b,'pt-BR'));
    const regionalReports={}; regionais.forEach(r=>regionalReports[r]=buildForRegional(r,src));
    state.data={regionais, geral:buildForRegional('',src), regional:regionalReports};
    if(!state.regional && regionais.length) state.regional=regionais[0];
  }

  const STRICT_SINGLE_REPORT_TYPES = new Set(['despesas','notas_fiscais','caixa_fornecedor']);
  const VALID_DRE_TYPES = new Set(['despesas','notas_fiscais','resultado-diario','caixa_fornecedor']);

  function normalizeReportTipo(raw, row = null){
    const candidates = [
      row?.tipo,
      row?.tipo_relatorio,
      row?.titulo_relatorio,
      row?.nome_arquivo,
      row?.arquivo_nome_original,
      raw
    ].map(v => String(v || '').trim()).filter(Boolean);

    const clean = (v) => String(v || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g,'')
      .replace(/_/g,'-')
      .replace(/\s+/g,'-');

    for (const original of candidates) {
      const t = clean(original);

      // Igualdade / aliases controlados primeiro.
      if (['despesas','relatorio-de-despesas','despesas-por-regional'].includes(t)) return 'despesas';
      if (['notas-fiscais','nota-fiscal','nfs','nf','nfe','nfse','faturamento','relatorio-de-notas-fiscais'].includes(t)) return 'notas_fiscais';
      if (['resultado-diario','resultado-diario-gavilon','relatorio-resultado-diario','producao','producao-consolidada','relatorio-de-resultado-diario'].includes(t)) return 'resultado-diario';
      if (['caixa-fornecedor','caixa-fornecedores','antecipacoes','antecipacao-fornecedores','relatorio-caixa-fornecedor'].includes(t)) return 'caixa_fornecedor';

      // Fallback por nome do arquivo, mas restrito a padrões claros.
      if (/resultado.*diario|diario.*resultado|gavilon|producao|produção/.test(original.toLowerCase())) return 'resultado-diario';
      if (/notas?\s*fiscais?|nfe|nfse|faturamento/.test(original.toLowerCase())) return 'notas_fiscais';
      if (/despesas?|despesas?\s*por\s*regional/.test(original.toLowerCase())) return 'despesas';
      if (/caixa.*fornecedor|antecipac/.test(original.toLowerCase())) return 'caixa_fornecedor';
    }

    return clean(candidates[0] || 'outros');
  }

  function isActiveImport(row){
    const status = norm(row?.status || 'enviado');
    return !['SUBSTITUIDO','SUBSTITUÍDO','CANCELADO','ERRO','EXCLUIDO','EXCLUÍDO','REMOVIDO'].includes(status);
  }

  function parseObservacoesJson(row){
    const raw = String(row?.observacoes || '').trim();
    if(!raw || !raw.startsWith('{')) return {};
    try { return JSON.parse(raw) || {}; } catch(_) { return {}; }
  }

  function importMode(row){
    const obs = parseObservacoesJson(row);
    return String(
      row?.modo_importacao ||
      row?.modo ||
      row?.import_mode ||
      row?.modoImportacao ||
      obs?.modo_importacao ||
      obs?.modo ||
      obs?.import_mode ||
      obs?.modoImportacao ||
      ''
    ).trim().toLowerCase();
  }

  function reportTime(row){
    return Date.parse(row?.created_at || row?.updated_at || '') || 0;
  }

  function reportLabel(row){
    return row?.nome_arquivo || row?.arquivo_nome_original || row?.titulo_relatorio || row?.tipo || row?.id || 'sem nome';
  }

  function reportPeriodKey(row){
    const candidates = [
      row?.periodo_inicio,
      row?.periodo_fim,
      row?.data_referencia,
      row?.competencia
    ].filter(Boolean);

    for(const value of candidates){
      const m = monthFrom(value);
      if(m) return `${m.year}-${String(m.month + 1).padStart(2,'0')}`;
    }

    const path = String(row?.storage_path || row?.path || row?.arquivo_nome_storage || row?.nome_arquivo || '');
    const pathMatch = path.match(/(?:^|\D)(20\d{2})[\/_-](0?[1-9]|1[0-2])(?:\D|$)/);
    if(pathMatch) return `${pathMatch[1]}-${String(Number(pathMatch[2])).padStart(2,'0')}`;

    return `sem-periodo-${row?.id || reportLabel(row)}`;
  }

  function chooseReportsForDre(rows){
    const normalized = [];
    const ignored = [];

    for(const r of rows || []){
      if(!isActiveImport(r)){
        ignored.push({ ...r, dre_ignore_reason: 'status_inativo' });
        continue;
      }

      const tipo = normalizeReportTipo(null, r);
      if(!VALID_DRE_TYPES.has(tipo)){
        ignored.push({ ...r, tipo, dre_ignore_reason: 'tipo_fora_dre' });
        continue;
      }

      normalized.push({ ...r, tipo, import_mode: importMode(r) });
    }

    const byType = new Map();
    for(const r of normalized){
      if(!byType.has(r.tipo)) byType.set(r.tipo, []);
      byType.get(r.tipo).push(r);
    }

    const chosen = [];

    for(const [tipo, listRaw] of byType.entries()){
      const list = [...listRaw].sort((a,b) => reportTime(b) - reportTime(a));

      // Financeiro deve espelhar o script: 1 fonte ativa por tipo.
      // Isso evita multiplicar NF/despesas quando existem uploads antigos ainda ativos.
      if(STRICT_SINGLE_REPORT_TYPES.has(tipo)){
        chosen.push(list[0]);
        list.slice(1).forEach(r => ignored.push({
          ...r,
          dre_ignore_reason: `ignorado_por_blindagem_financeira_usando_mais_recente_${tipo}`
        }));
        continue;
      }

      // Resultado Diário é mensal. Para não zerar meses anteriores, o DRE precisa
      // considerar o último arquivo de cada competência/mês. Se o mesmo mês for
      // importado duas vezes, usa somente o mais recente desse mês.
      if(tipo === 'resultado-diario'){
        const byPeriod = new Map();
        for(const r of list){
          const key = reportPeriodKey(r);
          if(!byPeriod.has(key)) byPeriod.set(key, []);
          byPeriod.get(key).push(r);
        }

        for(const [periodKey, periodReports] of byPeriod.entries()){
          const ordered = [...periodReports].sort((a,b)=>reportTime(b)-reportTime(a));
          chosen.push(ordered[0]);
          ordered.slice(1).forEach(r => ignored.push({
            ...r,
            dre_ignore_reason: `resultado_diario_mes_${periodKey}_duplicado_usando_mais_recente`
          }));
        }
      }
    }

    chosen.sort((a,b)=>String(a.created_at||'').localeCompare(String(b.created_at||'')));

    return { chosen, ignored };
  }

  async function getLatestReports(supabase){
    const {data,error}=await supabase
      .from('relatorios_importacoes')
      .select('*')
      .order('created_at',{ascending:false})
      .limit(500);
    if(error) throw error;

    const { chosen, ignored } = chooseReportsForDre(data || []);
    state.sourceAudit = {
      used: chosen.map(r => ({
        id: r.id,
        tipo: r.tipo,
        nome: reportLabel(r),
        status: r.status,
        modo: r.import_mode || '',
        created_at: r.created_at
      })),
      ignored: ignored.map(r => ({
        id: r.id,
        tipo: r.tipo || normalizeReportTipo(null, r),
        nome: reportLabel(r),
        status: r.status,
        motivo: r.dre_ignore_reason || '',
        created_at: r.created_at
      }))
    };

    return chosen;
  }

  function mergeArrMap(target, source){
    for(const [reg, arr] of Object.entries(source || {})){
      if(!target[reg]) target[reg] = Array(12).fill(0);
      for(let i=0;i<12;i++) target[reg][i] += n(arr?.[i]);
    }
  }

  function mergeNestedTopicMap(target, source){
    for(const [reg, topics] of Object.entries(source || {})){
      if(!target[reg]) target[reg] = {};
      for(const [topic, arr] of Object.entries(topics || {})){
        if(!target[reg][topic]) target[reg][topic] = Array(12).fill(0);
        for(let i=0;i<12;i++) target[reg][topic][i] += n(arr?.[i]);
      }
    }
  }

  function mergeSet(target, source){
    for(const item of source || []) target.add(item);
  }

  function mergeDespesas(target, source){
    if(!source) return target;
    mergeNestedTopicMap(target.base, source.base);
    for(const [topic, arr] of Object.entries(source.geral || {})){
      if(!target.geral[topic]) target.geral[topic] = Array(12).fill(0);
      for(let i=0;i<12;i++) target.geral[topic][i] += n(arr?.[i]);
    }
    mergeSet(target.regionais, source.regionais);
    return target;
  }

  function mergeNF(target, source){
    if(!source) return target;
    mergeArrMap(target.bruto, source.bruto);
    mergeArrMap(target.descAcresc, source.descAcresc);
    mergeArrMap(target.impostos, source.impostos);
    mergeSet(target.regionais, source.regionais);
    return target;
  }

  function mergeProducao(target, source){
    if(!source) return target;
    mergeArrMap(target.classificado, source.classificado);
    mergeArrMap(target.embarcado, source.embarcado);
    mergeArrMap(target.cargas, source.cargas);
    mergeArrMap(target.valorEmbarcado, source.valorEmbarcado);
    mergeArrMap(target.testes, source.testes);
    mergeSet(target.regionais, source.regionais);
    return target;
  }

  function setArrVal(map, reg, mi, val){
    if(!map[reg]) map[reg]=Array(12).fill(0);
    map[reg][mi]=n(val);
  }

  function getArrVal(map, reg, mi){
    return n(map?.[reg]?.[mi]);
  }

  // Resultado Diário é mensal. Regra oficial:
  // - Toneladas = Volume Classificado (sem cadência)
  // - Volume Total = Class + CAD + FOB + CIF
  // Se houver o mesmo mês em mais de uma fonte, usa a fonte mais completa
  // por regional+mês, sem somar duplicado.
  function mergeProducaoMelhorMes(target, source){
    if(!source) return target;
    const regs=new Set([
      ...Object.keys(target.classificado||{}),
      ...Object.keys(source.classificado||{}),
      ...Object.keys(target.embarcado||{}),
      ...Object.keys(source.embarcado||{})
    ]);
    for(const reg of regs){
      for(let mi=0;mi<12;mi++){
        const atualClass=getArrVal(target.classificado, reg, mi);
        const novoClass=getArrVal(source.classificado, reg, mi);
        const atualEmb=getArrVal(target.embarcado, reg, mi);
        const novoEmb=getArrVal(source.embarcado, reg, mi);
        const atualPontuacao=Math.abs(atualClass)+Math.abs(atualEmb);
        const novoPontuacao=Math.abs(novoClass)+Math.abs(novoEmb);
        if(novoPontuacao > atualPontuacao){
          setArrVal(target.classificado, reg, mi, novoClass);
          setArrVal(target.embarcado, reg, mi, novoEmb);
          setArrVal(target.cargas, reg, mi, getArrVal(source.cargas, reg, mi));
          setArrVal(target.valorEmbarcado, reg, mi, getArrVal(source.valorEmbarcado, reg, mi));
          setArrVal(target.testes, reg, mi, getArrVal(source.testes, reg, mi));
        }
      }
    }
    mergeSet(target.regionais, source.regionais);
    return target;
  }

  async function processReports(opts,setStatus){
    state.busy=true; setStatus('Buscando relatórios ativos importados...');
    state.reports=await getLatestReports(opts.supabase);
    const audit = state.sourceAudit || { used: [], ignored: [] };
    const usedTxt = audit.used.map(r => `${r.tipo}: ${r.nome}`).join(' · ');
    setStatus(`<strong>DRE blindada:</strong> usando ${audit.used.length} fonte(s). ${audit.ignored.length ? `${audit.ignored.length} importação(ões) antiga(s)/duplicada(s) ignorada(s).` : 'Nenhuma duplicidade detectada.'}<br><span style="font-size:11px;color:#6b7280">${safe(usedTxt)}</span>`);
    const src={
      desp:{base:{},geral:{},regionais:new Set(),ativosMedia:null},
      nf:{bruto:{},descAcresc:{},impostos:{},regionais:new Set()},
      prod:{classificado:{},embarcado:{},cargas:{},valorEmbarcado:{},testes:{},prodColab:{},prodColabGeral:Array(12).fill(0),regionais:new Set()},
      antecipacoes:Array(12).fill(0)
    };

    for(const report of state.reports){
      const nome=report.nome_arquivo||report.arquivo_nome_original||report.tipo;
      setStatus(`Processando ${nome}...`);
      let wb=null;
      try{
        wb=await readWorkbook(opts.supabase,report);
      }catch(err){
        console.warn('DRE: falha ao baixar/processar relatório. Ignorando fonte e continuando.', nome, err);
        if(!state.sourceAudit) state.sourceAudit = { used: [], ignored: [] };
        state.sourceAudit.ignored.push({tipo:report.tipo,nome,status:'falha_download',motivo:err?.message||String(err)});
        continue;
      }

      if(report.tipo==='despesas') {
        mergeDespesas(src.desp, parseDespesas(sheetRows(wb,['Despesas por Regional','Despesas','DESPESAS','Despesas_regionais'])));
      }

      if(report.tipo==='notas_fiscais') {
        mergeNF(src.nf, parseNF(sheetRows(wb,['Faturamento','Notas Fiscais','NF','NFe','NFSe'])));
      }

      if(report.tipo==='resultado-diario') {
        mergeProducaoMelhorMes(src.prod, parseResultadoDiario(sheetRows(wb,['Resultado Diário','Resultado Diario','Produção','Producao','Resultado'])));
      }

      if(report.tipo==='caixa_fornecedor') {
        const ant = parseAntecipacoes(sheetRows(wb,['Antecipações','Antecipacoes','Caixa Fornecedor']));
        for(let i=0;i<12;i++) src.antecipacoes[i] += n(ant[i]);
      }
    }

    setStatus('Conferindo produção consolidada no banco de dados...');
    const prodDb = await loadResultadoDiarioFromDb(opts.supabase, state.year);
    if(prodDb.totalRows > 0){
      // Mescla mensal segura: se abril foi importado no banco agora, entra no DRE;
      // se janeiro/fevereiro/março estão mais completos nos arquivos mensais antigos, mantém esses valores.
      mergeProducaoMelhorMes(src.prod, prodDb);
      if(!state.sourceAudit) state.sourceAudit = { used: [], ignored: [] };
      state.sourceAudit.used.push({
        tipo: 'resultado-diario-db',
        nome: `relatorio_resultado_diario (${prodDb.totalRows} linhas)`,
        status: 'fonte_mensal_segura',
        modo: 'merge_best_month',
        created_at: new Date().toISOString()
      });
    }

    setStatus('Calculando produzido por colaborador com histórico diário de ativos...');
    const prodColab = await loadProduzidoColaboradorFromDb(opts.supabase, state.year);
    if(prodColab.totalProdRows > 0 && prodColab.totalHistRows > 0){
      src.prod.prodColab = prodColab.porRegional;
      src.prod.prodColabGeral = prodColab.geral;
      mergeSet(src.prod.regionais, prodColab.regionais);
      if(!state.sourceAudit) state.sourceAudit = { used: [], ignored: [] };
      state.sourceAudit.used.push({
        tipo: 'historico-colaboradores-diario-db',
        nome: `historico_colaboradores (${prodColab.totalHistRows} linhas)`,
        status: 'produzido_por_colaborador',
        created_at: new Date().toISOString()
      });
    }

    setStatus('Calculando rateio de investimentos pela média mensal de colaboradores ativos por regional...');
    const ativosRateio = await loadMediaAtivosPorRegionalFromDb(opts.supabase, state.year);
    if(ativosRateio.totalHistRows > 0 && ativosRateio.total.some(v => n(v) > 0)){
      src.desp.ativosMedia = ativosRateio;
      mergeSet(src.desp.regionais, ativosRateio.regionais);
      if(!state.sourceAudit) state.sourceAudit = { used: [], ignored: [] };
      state.sourceAudit.used.push({
        tipo: 'rateio-investimentos-ativos-db',
        nome: `PATRIMONIO rateado pela média mensal de colaboradores ativos por regional (${ativosRateio.totalHistRows} linhas)`,
        status: 'rateio_por_ativos_regionais',
        created_at: new Date().toISOString()
      });
    }

    state.reportsData=src; buildDre(); state.busy=false;
  }

  function activeReport(){ return state.tab==='geral' ? state.data?.geral : state.data?.regional?.[state.regional]; }
  function cell(label,v){ const neg=n(v)<0?' class="neg"':''; let txt; if(PERCENT_ROWS.has(label)) txt=fmtPct(v); else if(MONEY_ROWS.has(label)) txt=fmtMoney(v); else txt=fmtNum(v); return `<td${neg}>${txt}</td>`; }
  function renderTable(report){
    if(!report) return '<div class="dre-status show">Sem dados para exibir.</div>';
    return `<div class="dre-table-wrap"><table class="dre-table"><thead><tr><th></th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL</th></tr></thead><tbody>${report.main.map(r=>{const cls=['RECEITA LÍQUIDA','LUCRO BRUTO','LUCRO OPERACIONAL (EBTIDA)','LUCRO LÍQUIDO','MARGEM BRUTA','MARGEM EBTIDA'].includes(r.label)?'highlight':r.label==='RESULTADO FINAL'?'result':'';return `<tr class="${cls}"><td>${safe(r.label)}</td>${r.values.map(v=>cell(r.label,v)).join('')}${cell(r.label,r.total)}</tr>`;}).join('')}</tbody></table></div>${renderExtras(report.extras, report)}`;
  }
  function renderExtras(ex, reportForTotals=null){
    if(!ex) return '';
    const report = reportForTotals || activeReport() || {};
    const vals = report.vals || {};
    const volumeTotal = ex.volTotal || ex.volEmb || Array(12).fill(0);
    const rows=[
      {label:'Receita Líquida', arr:vals.rec || Array(12).fill(0), type:'money', total:()=>total(vals.rec||[])},
      {label:'Total Custos', arr:ex.totalDesp, type:'money', total:()=>total(ex.totalDesp)},
      {label:'Resultado', arr:vals.res || Array(12).fill(0), type:'money', total:()=>total(vals.res||[])},
      {label:'Volume Classificado', arr:ex.volClass, type:'num', total:()=>total(ex.volClass)},
      {label:'Custo por tonelada do volume Classificado', arr:ex.cptClass, type:'money', total:()=>div(total(ex.totalDesp),total(ex.volClass))},
      {label:'Volume Total (Class+CAD+FOB+CIF)', arr:volumeTotal, type:'num', total:()=>total(volumeTotal)},
      {label:'Custo por Tonelada do Volume Total', arr:ex.cptEmb, type:'money', total:()=>div(total(ex.totalDesp),total(volumeTotal))}
    ];
    const prodRows=[
      {label:'Desempenho da Regional', arr:ex.desempenhoRegional || ex.prodColab || Array(12).fill(0), type:'num', total:()=>avgNonZero(ex.desempenhoRegional || ex.prodColab || [])},
      {label:'Desempenho Geral da Empresa', arr:ex.desempenhoGeral || ex.prodColabGeral || Array(12).fill(0), type:'num', total:()=>avgNonZero(ex.desempenhoGeral || ex.prodColabGeral || [])}
    ];
    const format=(type,v)=> type==='money'?fmtMoney(v):type==='pct'?fmtPct(v):fmtNum(v);
    const tableRows=(list)=>list.map(row=>`<tr><td>${safe(row.label)}</td>${(row.arr||Array(12).fill(0)).map(v=>`<td>${format(row.type,v)}</td>`).join('')}<td>${format(row.type,row.total())}</td></tr>`).join('');
    const head=`<thead><tr><th></th>${MESES.map(m=>`<th>${m}</th>`).join('')}<th>TOTAL / MÉDIA</th></tr></thead>`;
    return `<div class="dre-extra">
      <div class="dre-extra-box"><h4>INDICADORES OPERACIONAIS</h4><table>${head}<tbody>${tableRows(rows)}</tbody></table></div>
      <div class="dre-extra-box"><h4>PRODUÇÃO POR COLABORADOR</h4><table>${head}<tbody>${tableRows(prodRows)}</tbody></table></div>
    </div>`;
  }

  function renderCharts(container, report){
    if(!report){ container.querySelector('#dreCharts').innerHTML=''; return; }
    const res=report.main.find(r=>r.label==='RESULTADO FINAL')?.values||Array(12).fill(0);
    const max=Math.max(...res.map(v=>Math.abs(n(v))),1);
    const bars=res.map(v=>`<div class="dre-bar-wrap" title="${fmtMoney(v)}"><div class="dre-bar ${n(v)<0?'negative':''}" style="height:${Math.max(3,Math.abs(n(v))/max*100)}%"></div></div>`).join('');
    const volClass=report.extras?.volClass||[]; const volEmb=report.extras?.volEmb||[]; const tClass=total(volClass); const tEmb=total(volEmb); const maxVol=Math.max(tClass,tEmb,1);
    container.querySelector('#dreCharts').innerHTML=`
      <div class="dre-chart"><h3>Resultado final mês a mês</h3><p>Visão rápida de lucro/prejuízo mensal.</p><div class="dre-bars">${bars}</div><div class="dre-chart-labels">${MESES.map(m=>`<span>${m.slice(0,3)}</span>`).join('')}</div></div>
      <div class="dre-chart"><h3>Eficiência operacional</h3><p>Toneladas = volume classificado · Volume Total = Class + CAD + FOB + CIF.</p><div class="dre-volume-row"><strong>Classificado</strong><div class="dre-track"><div class="dre-fill secondary" style="width:${Math.min(100,tClass/maxVol*100)}%"></div></div></div><div class="dre-volume-row"><strong>Total</strong><div class="dre-track"><div class="dre-fill" style="width:${Math.min(100,tEmb/maxVol*100)}%"></div></div></div><div class="dre-cards" style="grid-template-columns:repeat(2,1fr);margin:16px 0 0"><div class="dre-card"><span>Volume classificado</span><strong>${fmtNum(tClass)}</strong></div><div class="dre-card"><span>Volume total</span><strong>${fmtNum(tEmb)}</strong><small>${fmtPct(div(tEmb,tClass))} de desempenho</small></div></div></div>`;
  }

  function renderReport(container){
    const report=activeReport();
    const title=state.tab==='geral'?'DRE Geral':`DRE Regional - ${state.regional||''}`;
    const rec=report?.main.find(r=>r.label==='RECEITA LÍQUIDA')?.total||0;
    const res=report?.main.find(r=>r.label==='RESULTADO FINAL')?.total||0;
    const eb=report?.main.find(r=>r.label==='LUCRO OPERACIONAL (EBTIDA)')?.total||0;
    const volEmb=total(report?.extras?.volTotal||report?.extras?.volEmb||[]); const volClass=total(report?.extras?.volClass||[]);
    const totalCustos=total(report?.extras?.totalDesp||[]);
    const cpt=div(totalCustos,volEmb);
    container.querySelector('#dreCards').innerHTML=`<div class="dre-card"><span>Receita Líquida</span><strong>${fmtMoney(rec)}</strong></div><div class="dre-card"><span>Total Custos</span><strong>${fmtMoney(totalCustos)}</strong></div><div class="dre-card ${res>=0?'positive':'negative'}"><span>Resultado</span><strong>${fmtMoney(res)}</strong></div><div class="dre-card"><span>Volume Total</span><strong>${fmtNum(volEmb)}</strong><small>Classificado: ${fmtNum(volClass)}</small></div><div class="dre-card"><span>Custo / Ton Volume Total</span><strong>${fmtMoney(cpt)}</strong><small>Desempenho: ${fmtPct(div(volEmb,volClass))}</small></div>`;
    renderCharts(container,report);
    container.querySelector('#dreReport').innerHTML=renderReportHtml(title, `Ano ${state.year} · Toneladas = Volume Classificado · Volume Total = Class + CAD + FOB + CIF`, report);
    const sel=container.querySelector('#regionalSelect');
    sel.innerHTML=(state.data?.regionais||[]).map(r=>`<option value="${safe(r)}" ${r===state.regional?'selected':''}>${safe(r)}</option>`).join('');
    sel.disabled=state.tab!=='regional';
  }

  function dreFileName(name){
    return String(name || 'GERAL')
      .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
      .replace(/[^a-zA-Z0-9_-]+/g,'_')
      .replace(/^_+|_+$/g,'') || 'regional';
  }

  function renderReportHtml(title, subtitle, report){
    return `<div class="dre-report-head"><div><h3>${safe(title)}</h3><p>${safe(subtitle)}</p></div><strong>Grão 1000</strong></div>${renderTable(report)}`;
  }

  function createPdfReadyNode(node){
    const clone=node.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('dre-pdf-ready');

    const holder=document.createElement('div');
    holder.className='dre-pdf-holder';
    holder.style.position='fixed';
    holder.style.left='-20000px';
    holder.style.top='0';
    holder.style.width='1750px';
    holder.style.background='#ffffff';
    holder.style.zIndex='-1';

    const style=document.createElement('style');
    style.textContent=`
      .dre-pdf-holder, .dre-pdf-holder *{box-sizing:border-box!important}
      .dre-pdf-holder .dre-report{width:1750px!important;max-width:1750px!important;border-radius:0!important;overflow:visible!important;border:1px solid #d1d5db!important}
      .dre-pdf-holder .dre-report-head{padding:10px 14px!important}
      .dre-pdf-holder .dre-report-head h3{font-size:18px!important;line-height:1.1!important}
      .dre-pdf-holder .dre-report-head p{font-size:11px!important;line-height:1.1!important;margin-top:3px!important}
      .dre-pdf-holder .dre-table-wrap{overflow:visible!important}
      .dre-pdf-holder .dre-table{min-width:0!important;width:100%!important;font-size:10.2px!important;table-layout:fixed!important}
      .dre-pdf-holder .dre-table th,.dre-pdf-holder .dre-table td{padding:5px 6px!important;line-height:1.08!important;white-space:nowrap!important}
      .dre-pdf-holder .dre-table th:first-child,.dre-pdf-holder .dre-table td:first-child{width:260px!important;white-space:normal!important}
      .dre-pdf-holder .dre-extra{gap:7px!important;padding:7px!important;display:grid!important;grid-template-columns:1fr!important}
      .dre-pdf-holder .dre-extra-box{border-radius:0!important}
      .dre-pdf-holder .dre-extra-box h4{font-size:11px!important;line-height:1!important;padding:6px 8px!important}
      .dre-pdf-holder .dre-extra-box table{font-size:9.4px!important;table-layout:fixed!important}
      .dre-pdf-holder .dre-extra-box td,.dre-pdf-holder .dre-extra-box th{padding:4px 5px!important;line-height:1.05!important;white-space:nowrap!important}
      .dre-pdf-holder .dre-extra-box td:first-child,.dre-pdf-holder .dre-extra-box th:first-child{width:260px!important;white-space:normal!important}
    `;
    holder.appendChild(style);
    holder.appendChild(clone);
    document.body.appendChild(holder);
    return { holder, clone };
  }

  async function reportNodeToPdfBlob(node){
    const html2canvas=await loadHtml2Canvas();
    const JsPDF=await loadJsPdf();
    const {holder, clone}=createPdfReadyNode(node);

    try{
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const canvas=await html2canvas(clone,{
        backgroundColor:'#ffffff',
        scale:2,
        useCORS:true,
        windowWidth:1750,
        scrollX:0,
        scrollY:0
      });
      const img=canvas.toDataURL('image/png');
      const pdf=new JsPDF('l','mm','a4');
      const pageW=297;
      const pageH=210;
      const margin=4;
      const maxW=pageW-(margin*2);
      const maxH=pageH-(margin*2);
      const ratio=Math.min(maxW/canvas.width, maxH/canvas.height);
      const w=canvas.width*ratio;
      const h=canvas.height*ratio;
      const x=(pageW-w)/2;
      const y=(pageH-h)/2;
      pdf.addImage(img,'PNG',x,y,w,h,undefined,'FAST');
      return pdf.output('blob');
    } finally {
      holder.remove();
    }
  }

  async function exportImage(){ const node=document.querySelector('#dreReport'); if(!node) return; const html2canvas=await loadHtml2Canvas(); const canvas=await html2canvas(node,{backgroundColor:'#ffffff',scale:2}); const a=document.createElement('a'); a.download=`${state.tab==='geral'?'DRE_Geral':'DRE_'+dreFileName(state.regional)}_${state.year}.png`; a.href=canvas.toDataURL('image/png'); a.click(); }
  async function exportPdf(){ const node=document.querySelector('#dreReport'); if(!node) return; const blob=await reportNodeToPdfBlob(node); const a=document.createElement('a'); a.download=`${state.tab==='geral'?'DRE_Geral':'DRE_'+dreFileName(state.regional)}_${state.year}.pdf`; a.href=URL.createObjectURL(blob); a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1500); }

  async function exportAllRegionalPdfs(){
    if(!state.data?.regional) return;
    const regions=(state.data.regionais||[]).filter(r => r && norm(r) !== 'GERAL' && !isExcluded(r) && state.data.regional[r]);
    if(!regions.length) return;

    const btn=document.querySelector('#exportAllPdfs');
    const oldTxt=btn ? btn.textContent : '';
    if(btn){ btn.disabled=true; btn.textContent='Gerando ZIP...'; }

    const JSZip=await loadJsZip();
    const zip=new JSZip();
    const hidden=document.createElement('div');
    hidden.style.position='fixed';
    hidden.style.left='-10000px';
    hidden.style.top='0';
    hidden.style.width='1400px';
    hidden.style.background='#fff';
    hidden.className='dre-wrap';
    document.body.appendChild(hidden);

    try{
      for(const reg of regions){
        const report=state.data.regional[reg];
        const article=document.createElement('article');
        article.className='dre-report';
        article.innerHTML=renderReportHtml(`DRE Regional - ${reg}`, `Ano ${state.year} · Despesas GERAL rateadas · Toneladas = Volume Classificado · Volume Total = Class + CAD + FOB + CIF`, report);
        hidden.innerHTML='';
        hidden.appendChild(article);
        const blob=await reportNodeToPdfBlob(article);
        zip.file(`DRE_${dreFileName(reg)}_${state.year}.pdf`, blob);
      }
      const zipBlob=await zip.generateAsync({type:'blob'});
      const a=document.createElement('a');
      a.download=`DRE_Regionais_${state.year}.zip`;
      a.href=URL.createObjectURL(zipBlob);
      a.click();
      setTimeout(()=>URL.revokeObjectURL(a.href),1500);
    } finally {
      hidden.remove();
      if(btn){ btn.disabled=false; btn.textContent=oldTxt || 'PDFs Regionais'; }
    }
  }

  function openHome(container, opts={}){
    state.year=new Date().getFullYear(); state.tab='geral'; state.data=null; state.reports=[];
    container.innerHTML=`${styles}<section class="dre-wrap"><div class="dre-hero"><div><div class="dre-kicker">Diretoria · DRE</div><h2>Dashboard DRE completo</h2><p>DRE geral e regional com indicadores operacionais do novo Resultado Diário: <b>Toneladas</b> como Volume Classificado e <b>Embarcado</b> como Volume Embarcado + NHE + cad.</p></div><div class="dre-controls"><select id="yearSelect">${[state.year-1,state.year,state.year+1].map(y=>`<option value="${y}" ${y===state.year?'selected':''}>${y}</option>`).join('')}</select><select id="regionalSelect" disabled></select><button id="refreshDre" class="primary">Processar DRE</button><button id="exportPdf" disabled>PDF</button><button id="exportAllPdfs" disabled>PDFs Regionais</button><button id="exportImg" disabled>Imagem</button></div></div><div class="dre-tabs"><button class="dre-tab active" data-tab="geral">DRE Geral</button><button class="dre-tab" data-tab="regional">DRE Regional</button></div><div class="dre-status show" id="dreStatus"><strong>Aguardando processamento.</strong> Clique em Processar DRE para carregar os últimos relatórios importados.</div><div id="dreCards" class="dre-cards"></div><div id="dreCharts" class="dre-grid"></div><article class="dre-report" id="dreReport"><div class="dre-report-head"><div><h3>DRE</h3><p>Sem dados processados.</p></div></div></article></section>`;
    const status=container.querySelector('#dreStatus'); const setStatus=(txt)=>{status.classList.add('show');status.innerHTML=txt.includes('<')?txt:`<strong>Status:</strong> ${safe(txt)}`;};
    container.querySelector('#yearSelect').addEventListener('change',e=>{state.year=Number(e.target.value)||state.year;});
    container.querySelector('#regionalSelect').addEventListener('change',e=>{state.regional=e.target.value; renderReport(container);});
    container.querySelectorAll('.dre-tab').forEach(btn=>btn.addEventListener('click',()=>{state.tab=btn.dataset.tab; container.querySelectorAll('.dre-tab').forEach(b=>b.classList.toggle('active',b===btn)); if(state.data) renderReport(container);}));
    container.querySelector('#refreshDre').addEventListener('click',async()=>{try{container.querySelector('#refreshDre').disabled=true; await processReports(opts,setStatus); status.classList.remove('show'); container.querySelector('#exportPdf').disabled=false; container.querySelector('#exportAllPdfs').disabled=false; container.querySelector('#exportImg').disabled=false; renderReport(container);}catch(err){console.error(err);setStatus(`<strong>Erro:</strong> ${safe(err?.message||'Falha ao processar DRE.')}`);}finally{container.querySelector('#refreshDre').disabled=false;}});
    container.querySelector('#exportPdf').addEventListener('click',exportPdf); container.querySelector('#exportAllPdfs').addEventListener('click',exportAllRegionalPdfs); container.querySelector('#exportImg').addEventListener('click',exportImage);
  }
  window.DRE={openHome};
})();
