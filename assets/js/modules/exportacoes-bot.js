
<style id="bot-sync-layout-fix">
#btnSyncBotTop { margin-left: 12px; }
.bot-sync-card input, .bot-sync-card select { display:none !important; }
</style>


function xCorsHeaders(origin = "*") {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Requested-With, Accept, X-BC-Secret",
    "access-control-expose-headers": "content-type, content-disposition",
  };
}

function xJson(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...xCorsHeaders(),
      ...extraHeaders,
    },
  });
}

function xSafeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function xGetServiceKey(env) { return env.SUPABASE_SERVICE_KEY || env.SUPABASE_KEY || ""; }
function xGetAnonKey(env) { return env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || ""; }

async function xReadJsonBody(request) {
  if (["GET", "HEAD"].includes(request.method)) return null;
  const text = await request.text();
  return xSafeJsonParse(text);
}

async function xSupabaseRest(env, path, { method = "GET", service = true, body = null, headers = {} } = {}) {
  const key = service ? xGetServiceKey(env) : xGetAnonKey(env);
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      "apikey": key,
      "authorization": `Bearer ${key}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const parsed = xSafeJsonParse(text);
  if (!res.ok) throw new Error(parsed?.message || parsed?.error || text || "Erro no Supabase REST");
  return parsed;
}

function xGetBearerToken(request) {
  const auth = request.headers.get("authorization") || "";
  return auth.startsWith("Bearer ") ? auth.slice(7).trim() : null;
}

async function xRequireMaster(request, env) {
  const token = xGetBearerToken(request);
  if (!token) throw new Error("Authorization Bearer token ausente");

  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      "apikey": xGetAnonKey(env) || xGetServiceKey(env),
      "authorization": `Bearer ${token}`,
    },
  });

  const authUser = xSafeJsonParse(await res.text());
  if (!res.ok || !authUser?.id) throw new Error("Usuário autenticado inválido");

  const appUsers = await xSupabaseRest(env, `app_usuarios?select=id,auth_user_id,perfil_id,status,nome&auth_user_id=eq.${authUser.id}&limit=1`);
  const appUser = Array.isArray(appUsers) ? appUsers[0] : null;
  if (!appUser) throw new Error("Usuário não encontrado em app_usuarios");
  if (String(appUser.status || "").toLowerCase() !== "ativo") throw new Error("Usuário sem acesso ativo");

  const perfis = await xSupabaseRest(env, `app_perfis?select=id,codigo&ativo=is.true&id=eq.${appUser.perfil_id}&limit=1`);
  const perfil = Array.isArray(perfis) ? perfis[0] : null;
  if (!perfil || perfil.codigo !== "master") throw new Error("Acesso permitido somente para usuário master");

  return { authUser, appUser, perfil };
}

function xCsvEscape(v) {
  const s = String(v ?? "");
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function xToCsv(headers, rows) {
  const bom = "\ufeff";
  const lines = [headers.map(xCsvEscape).join(",")];
  for (const row of rows) lines.push(row.map(xCsvEscape).join(","));
  return bom + lines.join("\n");
}

function xBase64Utf8(text) {
  return btoa(unescape(encodeURIComponent(text)));
}

function xToday() {
  return new Date().toISOString().slice(0, 10);
}

async function xInsert(env, table, row) {
  const out = await xSupabaseRest(env, table, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: row,
  });
  return Array.isArray(out) ? out[0] : out;
}

async function xPatchById(env, table, id, patch) {
  const out = await xSupabaseRest(env, `${table}?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: patch,
  });
  return Array.isArray(out) ? out[0] : out;
}

async function xGetLatestColabReferenceDate(env) {
  const rows = await xSupabaseRest(
    env,
    "colaborador_importacoes?select=data_referencia,status&status=eq.processado&order=data_referencia.desc&limit=1"
  );
  return Array.isArray(rows) && rows[0]?.data_referencia ? rows[0].data_referencia : null;
}

function xNormalizeDate(v) {
  if (!v) return null;
  const s = String(v).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function xDistinctLatestByCpf(rows) {
  const byCpf = new Map();
  for (const row of rows || []) {
    const cpf = String(row.cpf || "").trim();
    if (!cpf) continue;
    const prev = byCpf.get(cpf);
    if (!prev) {
      byCpf.set(cpf, row);
      continue;
    }
    const prevDate = String(prev.data_referencia || "");
    const currDate = String(row.data_referencia || "");
    if (currDate > prevDate) byCpf.set(cpf, row);
  }
  return [...byCpf.values()].sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || "")));
}

async function xLoadColaboradores(env, filtros = {}) {
  const latestReference = await xGetLatestColabReferenceDate(env);
  if (!latestReference) {
    return {
      rows: [],
      debug: { latest_reference: null, total_base: 0, total_filtrado: 0, total_distinct: 0 }
    };
  }

  const parts = [
    "select=cpf,nome,situacao,admissao,desligamento,ativo,empresa,coordenacao,supervisao,tipo,cargo,whatsapp,email_pessoal,email_empresa,cidade,bairro,endereco,complemento,estado,cep,data_referencia",
    "admissao=not.is.null",
    `data_referencia=lte.${encodeURIComponent(latestReference)}`,
    "limit=10000",
    "order=data_referencia.desc"
  ];

  if (filtros.empresa) parts.push(`empresa=ilike.*${encodeURIComponent(filtros.empresa)}*`);
  if (filtros.nome) parts.push(`nome=ilike.*${encodeURIComponent(filtros.nome)}*`);

  const baseRows = await xSupabaseRest(env, `colaborador_snapshot?${parts.join("&")}`);
  const totalBase = Array.isArray(baseRows) ? baseRows.length : 0;

  const dataInicial = xNormalizeDate(filtros.data_admissao_inicial);
  const dataFinal = xNormalizeDate(filtros.data_admissao_final);

  let filtrados = (baseRows || []).filter((r) => {
    const adm = xNormalizeDate(r.admissao);
    if (!adm) return false;
    if (dataInicial && adm < dataInicial) return false;
    if (dataFinal && adm > dataFinal) return false;

    const situacaoFiltro = filtros.situacao || "Ativo";
    if (situacaoFiltro !== "Todos") {
      if (situacaoFiltro === "Ativo" && r.ativo !== true) return false;
      if (situacaoFiltro === "Não Ativo" && r.ativo !== false) return false;
      if (situacaoFiltro !== "Ativo" && situacaoFiltro !== "Não Ativo") {
        if (String(r.situacao || "") !== String(situacaoFiltro)) return false;
      }
    }
    return true;
  });

  const distinctRows = xDistinctLatestByCpf(filtrados);

  return {
    rows: distinctRows,
    debug: {
      latest_reference: latestReference,
      total_base: totalBase,
      total_filtrado: filtrados.length,
      total_distinct: distinctRows.length,
      data_inicial: dataInicial,
      data_final: dataFinal,
    }
  };
}

function mapCartoes(colabs, tipo) {
  const headers = ["Nome completo", "CPF", "Celular", "E-mail", "", "Cargo"];
  const rows = colabs.map(c => [
    c.nome || "",
    c.cpf || "",
    c.whatsapp || "",
    c.email_empresa || c.email_pessoal || "",
    c.empresa || "",
    c.cargo || ""
  ]);
  return { headers, rows, filename: `${tipo}_${xToday()}.csv` };
}

function mapUber(colabs) {
  const headers = ["first_name", "last_name", "email", "mobile_country_code", "mobile_number", "employee_id", "group"];
  const rows = colabs.map(c => {
    const nome = c.nome || "";
    const partes = nome.trim().split(/\s+/);
    let mobile = String(c.whatsapp || "").replace(/\D+/g, "");
    if (mobile.startsWith("55")) mobile = mobile.slice(2);
    return [
      partes[0] || nome,
      partes.slice(1).join(" "),
      c.email_empresa || c.email_pessoal || "",
      "55",
      mobile,
      c.cpf || "",
      c.empresa || ""
    ];
  });
  return { headers, rows, filename: `uber_empresas_${xToday()}.csv` };
}

async function finalizeExport(env, job, tipo, spec, debug) {
  const csv = xToCsv(spec.headers, spec.rows);
  const contentBase64 = xBase64Utf8(csv);

  const arquivo = await xInsert(env, "exportacoes_arquivos", {
    job_id: job.id,
    tipo,
    filename: spec.filename,
    mime_type: "text/csv; charset=utf-8",
    content_base64: contentBase64,
    bytes_size: new TextEncoder().encode(csv).length
  });

  await xPatchById(env, "exportacoes_jobs", job.id, {
    status: "concluido",
    total_registros: spec.rows.length,
    arquivo_id: arquivo.id,
    finished_at: new Date().toISOString(),
    observacoes: JSON.stringify(debug || {})
  });

  return {
    job_id: job.id,
    arquivo_id: arquivo.id,
    filename: arquivo.filename,
    total: spec.rows.length,
    debug
  };
}

async function createExport(request, env, tipo) {
  const auth = await xRequireMaster(request, env);
  const body = await xReadJsonBody(request) || {};

  const job = await xInsert(env, "exportacoes_jobs", {
    tipo,
    status: "processando",
    filtros: body,
    created_by: auth.authUser.id
  });

  try {
    const loaded = await xLoadColaboradores(env, body);
    const colabs = loaded.rows;

    let spec;
    if (tipo === "flash") spec = mapCartoes(colabs, "flash");
    if (tipo === "ifood") spec = mapCartoes(colabs, "ifood");
    if (tipo === "uber") spec = mapUber(colabs);

    return xJson({ ok: true, ...(await finalizeExport(env, job, tipo, spec, loaded.debug)) });
  } catch (err) {
    await xPatchById(env, "exportacoes_jobs", job.id, {
      status: "erro",
      erro: String(err?.message || err),
      finished_at: new Date().toISOString()
    });
    throw err;
  }
}

async function getExportJobs(request, env) {
  await xRequireMaster(request, env);
  const rows = await xSupabaseRest(env, "exportacoes_jobs?select=*&order=created_at.desc&limit=100");
  return xJson({ ok: true, items: rows || [] });
}

async function downloadExport(request, env) {
  await xRequireMaster(request, env);

  const url = new URL(request.url);
  const id = String(url.searchParams.get("id") || "").trim();
  if (!id) return xJson({ ok: false, error: "id é obrigatório" }, 400);

  const rows = await xSupabaseRest(env, `exportacoes_arquivos?select=*&id=eq.${encodeURIComponent(id)}&limit=1`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) return xJson({ ok: false, error: "Arquivo não encontrado" }, 404);

  const bytes = Uint8Array.from(atob(row.content_base64), c => c.charCodeAt(0));
  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": row.mime_type || "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${row.filename}"`,
      ...xCorsHeaders(),
    }
  });
}

export async function handleExportacoesBotRoutes(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: xCorsHeaders() });
  }

  try {
    if (path === "/api/exportacoes/cartoes/flash" && request.method === "POST") return await createExport(request, env, "flash");
    if (path === "/api/exportacoes/cartoes/ifood" && request.method === "POST") return await createExport(request, env, "ifood");
    if (path === "/api/exportacoes/uber" && request.method === "POST") return await createExport(request, env, "uber");
    if (path === "/api/exportacoes/jobs" && request.method === "GET") return await getExportJobs(request, env);
    if (path === "/api/exportacoes/download" && request.method === "GET") return await downloadExport(request, env);
    return null;
  } catch (err) {
    return xJson({ ok: false, error: String(err?.message || err) }, 500);
  }
}

export default { handleExportacoesBotRoutes };


async function sincronizarBotConversa() {
  const btn =
    document.querySelector("#btnSyncBot") ||
    document.getElementById("btnSyncBot") ||
    document.querySelector('[data-action="sync-bot"]');

  const statusEl =
    document.querySelector("#statusSync") ||
    document.getElementById("statusSync") ||
    document.querySelector('[data-role="status-sync-bot"]');

  const btnTop = document.querySelector("#btnSyncBotTop");
  const oldText = btn ? btn.textContent : "Sincronizar contatos e tags";
  const oldTextTop = btnTop ? btnTop.textContent : "Sincronizar contatos e tags";

  let offset = 0;
  let totalSucesso = 0;
  let totalErro = 0;
  let totalProcessados = 0;
  let totalDisponivel = 0;
  let jobId = null;

  try {
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Sincronizando...";
    }
    if (btnTop) {
      btnTop.disabled = true;
      btnTop.textContent = "Sincronizando...";
    }

    atualizarStatusSync({
      statusEl,
      sucesso: 0,
      erro: 0,
      processados: 0,
      total: 0,
      textoExtra: "Iniciando sincronização..."
    });

    while (true) {
      const payload = {
        offset,
        max_process: 5
      };

      const authToken =
        window.AUTH_TOKEN ||
        localStorage.getItem("supabase_token") ||
        sessionStorage.getItem("supabase_token") ||
        localStorage.getItem("access_token") ||
        sessionStorage.getItem("access_token") ||
        "";

      const headers = { "Content-Type": "application/json" };
      if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

      const resp = await fetch("/api/botconversa/sync-subscribers", {
        method: "POST",
        headers,
        body: JSON.stringify(payload)
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || !data?.ok) {
        throw new Error(data?.error || "Falha ao sincronizar BotConversa");
      }

      if (!jobId) jobId = data.job_id || null;

      totalSucesso += Number(data.sucesso || 0);
      totalErro += Number(data.erro || 0);
      totalProcessados += Number(data.processados_nesta_execucao || 0);
      totalDisponivel = Number(data.total_disponivel || totalDisponivel || 0);

      atualizarStatusSync({
        statusEl,
        sucesso: totalSucesso,
        erro: totalErro,
        processados: totalProcessados,
        total: totalDisponivel
      });

      if (!data.has_more) {
        break;
      }

      offset = Number(data.next_offset || 0);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    atualizarStatusFinal({
      statusEl,
      sucesso: totalSucesso,
      erro: totalErro,
      processados: totalProcessados,
      total: totalDisponivel,
      jobId
    });
  } catch (err) {
    console.error(err);
    if (statusEl) {
      statusEl.textContent = err?.message || "Erro ao sincronizar BotConversa";
    }
    alert(err?.message || "Erro ao sincronizar BotConversa");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = oldText;
    }
    if (btnTop) {
      btnTop.disabled = false;
      btnTop.textContent = oldTextTop;
    }
  }
}

function atualizarStatusSync({ statusEl, sucesso = 0, erro = 0, processados = 0, total = 0, textoExtra = "" }) {
  if (!statusEl) return;
  const prefixo = textoExtra ? `${textoExtra} ` : "";
  statusEl.textContent = `${prefixo}Processando: ${processados}/${total} | Sucesso: ${sucesso} | Erro: ${erro}`;
}

function atualizarStatusFinal({ statusEl, sucesso = 0, erro = 0, processados = 0, total = 0, jobId = "" }) {
  if (!statusEl) return;
  statusEl.textContent = `Sincronização concluída. Total: ${processados}/${total} | Sucesso: ${sucesso} | Erro: ${erro}`;
}





function getBotSyncFiltros() {
  const pick = (ids) => {
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el && typeof el.value !== 'undefined') return String(el.value || '').trim();
    }
    return '';
  };

  return {
    data_admissao_inicial: pick(['sync-admissao-inicial', 'admissao-inicial-bot', 'bot-admissao-inicial']),
    data_admissao_final: pick(['sync-admissao-final', 'admissao-final-bot', 'bot-admissao-final']),
    situacao: pick(['sync-situacao', 'situacao-bot', 'bot-situacao']) || 'Todos',
    empresa: pick(['sync-empresa', 'empresa-bot', 'bot-empresa']),
    nome: pick(['sync-nome', 'nome-bot', 'bot-nome'])
  };
}



