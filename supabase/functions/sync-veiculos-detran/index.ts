import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function onlyDigits(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

function onlyPlate(value: unknown) {
  return String(value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function asString(value: unknown) {
  return String(value ?? "").trim();
}

function asNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function normalizeKey(value: unknown) {
  return asString(value).toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9_]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
}

function withQuery(path: string, key: string, value: string | number) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`;
}

function extrairVeiculos(payload: any) {
  if (!payload) return [];
  if (Array.isArray(payload.resultado)) return payload.resultado;
  if (Array.isArray(payload.content)) return payload.content;
  if (Array.isArray(payload.itens)) return payload.itens;
  if (Array.isArray(payload.lista)) return payload.lista;
  if (Array.isArray(payload)) return payload;
  return [];
}

function totalPaginas(payload: any) {
  const total = Number(payload?.qtdeTotalRegistros || payload?.totalElements || payload?.total || 0);
  const porPag = Number(payload?.qtdePorPagina || payload?.size || payload?.pageSize || 0);
  if (total > 0 && porPag > 0) return Math.ceil(total / porPag);
  return 1;
}

function paginaAtual(payload: any) {
  const p = Number(payload?.paginaAtual || payload?.page || payload?.number || 1);
  return p > 0 ? p : 1;
}

function primeiraChave(lista: any[]) {
  const v = Array.isArray(lista) && lista.length ? lista[0] : null;
  if (!v) return "";
  return `${v?.renavam || ""}#${v?.placa || ""}`;
}

function dedupeVeiculos(lista: any[]) {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const v of lista || []) {
    const key = `${onlyDigits(v?.renavam)}#${onlyPlate(v?.placa)}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(v);
  }
  return out;
}

type TokenConfig = {
  suffix: string;
  empresa: string;
  clientId: string;
  clientSecret: string;
  consumerId: string;
  baseUrl: string;
  authUrl: string;
  scope?: string;
};

async function loadIntegrationSecrets(supabase: any) {
  const cfg: Record<string, string> = {};

  const { data: integrations } = await supabase
    .from("ti_integracoes")
    .select("id,nome,codigo,base_url,auth_url,ativo")
    .eq("ativo", true);

  const detranIntegrations = (integrations || []).filter((item: any) => {
    const code = normalizeKey(`${item?.codigo || ""} ${item?.nome || ""}`);
    return code.includes("DETRAN") || code.includes("FROTISTA");
  });

  for (const integ of detranIntegrations) {
    if (integ.base_url) cfg.BASE_URL = integ.base_url;
    if (integ.auth_url) cfg.AUTH_URL = integ.auth_url;

    const { data: secrets } = await supabase
      .from("ti_integracao_segredos")
      .select("chave,valor,ativo")
      .eq("integracao_id", integ.id)
      .eq("ativo", true);

    for (const secret of secrets || []) {
      const k = normalizeKey(secret.chave);
      if (k) cfg[k] = String(secret.valor ?? "");
    }
  }

  return cfg;
}

async function buildTokenConfigs(supabase: any): Promise<TokenConfig[]> {
  const secrets = await loadIntegrationSecrets(supabase).catch(() => ({}));

  const env = (key: string) => Deno.env.get(key) || "";
  const get = (...keys: string[]) => {
    for (const key of keys) {
      const normalized = normalizeKey(key);
      const val = secrets[normalized] || env(normalized) || env(key);
      if (val) return val;
    }
    return "";
  };

  const baseUrl = get("DETRAN_BASE_URL", "DETRAN_BASE", "BASE_URL") || "https://detranfrotistaapi.paas.pr.gov.br";
  const authUrl = get("DETRAN_TOKEN_URL", "DETRAN_AUTH_URL", "AUTH_URL") || "https://auth-cs.identidadedigital.pr.gov.br/centralautenticacao/api/v1/token/jwt";
  const consumerId = get("DETRAN_CONSUMER_ID", "CONSUMER_ID") || "DETRANFROTISTAAPI";
  const scope = get("DETRAN_SCOPE", "SCOPE") || "frotista.api";

  const suffixes = new Set<string>();
  for (const key of Object.keys(secrets)) {
    let m = key.match(/^(?:DETRAN_)?CLIENTE?_ID_(.+)$/);
    if (m) suffixes.add(m[1]);
    m = key.match(/^(?:DETRAN_)?CLIENT_SECRET_(.+)$/);
    if (m) suffixes.add(m[1]);
  }

  // fallback para configuração sem sufixo
  if (!suffixes.size && (get("CLIENT_ID", "DETRAN_CLIENT_ID") && get("CLIENT_SECRET", "DETRAN_CLIENT_SECRET"))) {
    suffixes.add("DEFAULT");
  }

  const configs: TokenConfig[] = [];
  for (const suffix of suffixes) {
    const clientId = suffix === "DEFAULT"
      ? get("CLIENT_ID", "DETRAN_CLIENT_ID")
      : get(`CLIENT_ID_${suffix}`, `CLIENTE_ID_${suffix}`, `DETRAN_CLIENT_ID_${suffix}`);
    const clientSecret = suffix === "DEFAULT"
      ? get("CLIENT_SECRET", "DETRAN_CLIENT_SECRET")
      : get(`CLIENT_SECRET_${suffix}`, `CLIENTE_SECRET_${suffix}`, `DETRAN_CLIENT_SECRET_${suffix}`);
    if (!clientId || !clientSecret) continue;
    configs.push({
      suffix,
      empresa: suffix === "DEFAULT" ? get("EMPRESA", "DETRAN_EMPRESA") : get(`EMPRESA_${suffix}`, `NOME_EMPRESA_${suffix}`, `RAZAO_SOCIAL_${suffix}`),
      clientId,
      clientSecret,
      consumerId,
      baseUrl,
      authUrl,
      scope,
    });
  }

  return configs;
}

async function getDetranToken(config: TokenConfig) {
  const attempts = [
    {
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json", consumerId: config.consumerId, "x-consumer-id": config.consumerId },
      body: new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret, scope: config.scope || "" }).toString(),
    },
    {
      headers: { "Content-Type": "application/json", Accept: "application/json", consumerId: config.consumerId, "x-consumer-id": config.consumerId },
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret, grant_type: "client_credentials", scope: config.scope || "" }),
    },
    {
      headers: { "Content-Type": "application/json", Accept: "application/json", consumerId: config.consumerId, "x-consumer-id": config.consumerId },
      body: JSON.stringify({ clientId: config.clientId, clientSecret: config.clientSecret, grantType: "client_credentials", scope: config.scope || "" }),
    },
  ];

  let lastText = "";
  for (const attempt of attempts) {
    const res = await fetch(config.authUrl, { method: "POST", headers: attempt.headers, body: attempt.body });
    const text = await res.text();
    lastText = text;
    if (!res.ok) continue;
    const payload = text ? JSON.parse(text) : {};
    const token = payload?.access_token || payload?.accessToken || payload?.token || payload?.jwt || payload?.id_token;
    if (token) return token;
  }

  throw new Error(`Não foi possível gerar token DETRAN para ${config.suffix}: ${lastText.slice(0, 500)}`);
}

async function detranGetJson(pathAndQuery: string, config: TokenConfig, token: string) {
  const url = `${config.baseUrl.replace(/\/$/, "")}${pathAndQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      consumerId: config.consumerId,
      "x-consumer-id": config.consumerId,
      Accept: "application/json",
    },
  });

  const text = await res.text();
  if (!res.ok) {
    let msg = "";
    try { msg = JSON.parse(text)?.message || ""; } catch (_) { /* ignore */ }
    throw new Error(`DETRAN ${pathAndQuery} (${res.status}): ${msg || text}`);
  }

  return text ? JSON.parse(text) : null;
}

async function fetchAllPages(basePath: string, config: TokenConfig, token: string) {
  const first = await detranGetJson(basePath, config, token);
  const firstList = extrairVeiculos(first);
  const totalPages = totalPaginas(first);
  const out = [...firstList];

  if (totalPages <= 1) return dedupeVeiculos(out);

  const firstKey = primeiraChave(firstList);
  const firstPageNumber = paginaAtual(first);
  const candidates = ["pagina", "page", "paginaAtual", "numeroPagina", "paginaNum"];
  let workingParam: string | null = null;

  for (const param of candidates) {
    const trial = await detranGetJson(withQuery(basePath, param, 2), config, token);
    const trialList = extrairVeiculos(trial);
    const trialPage = paginaAtual(trial);
    const trialKey = primeiraChave(trialList);

    if ((trialPage !== firstPageNumber && trialPage === 2) || (trialKey && trialKey !== firstKey)) {
      workingParam = param;
      out.push(...trialList);
      break;
    }
  }

  if (!workingParam) return dedupeVeiculos(out);

  for (let p = 3; p <= totalPages; p++) {
    const payload = await detranGetJson(withQuery(basePath, workingParam, p), config, token);
    const list = extrairVeiculos(payload);
    if (!list.length) break;
    out.push(...list);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  return dedupeVeiculos(out);
}

function mapVeiculo(v: any, config: TokenConfig, origem: string) {
  const af = asNumber(v?.anoFabricacao);
  const am = asNumber(v?.anoModelo);
  const marcaModelo = asString(v?.descrMarcaModelo || v?.marcaModelo || v?.modelo);
  const [marca, ...modeloParts] = marcaModelo.split(/[/-]/).map((s) => s.trim()).filter(Boolean);
  const ano = am || af || null;
  const municipioUF = v?.municipioEmplacamento ? `${v.municipioEmplacamento}/${v?.ufEmplacamento || ""}` : asString(v?.ufEmplacamento);

  return {
    placa: onlyPlate(v?.placa),
    renavam: onlyDigits(v?.renavam) || null,
    chassi: asString(v?.chassi) || null,
    empresa: asString(v?.__empresa || config.empresa) || null,
    marca: marca || marcaModelo || null,
    modelo: modeloParts.join(" /") || marcaModelo || null,
    ano,
    municipio_uf: municipioUF || null,
    situacao_detran: asString(v?.situacaoVeiculo || v?.situacao) || null,
    detran_token_key: config.suffix || null,
    detran_confirmado: true,
    detran_status: origem === "venda" ? "DETRAN_VENDA" : "CONFIRMADO",
    detran_mensagem: origem === "venda" ? "Veículo retornado pela listagem de venda do DETRAN." : "Veículo retornado pela listagem atual do DETRAN.",
    detran_ultima_consulta_em: new Date().toISOString(),
    detran_raw: v,
    origem_importacao: "detran",
    status: origem === "venda" ? "VENDIDO" : "ATIVO",
    updated_at: new Date().toISOString(),
  };
}

async function upsertVeiculos(supabase: any, veiculos: any[]) {
  const valid = veiculos.filter((v) => v.placa);
  if (!valid.length) return { inserted: 0 };

  const chunks: any[][] = [];
  for (let i = 0; i < valid.length; i += 500) chunks.push(valid.slice(i, i + 500));

  let total = 0;
  for (const chunk of chunks) {
    const { error } = await supabase
      .from("frotas_veiculos")
      .upsert(chunk, { onConflict: "placa" });
    if (error) throw error;
    total += chunk.length;
  }
  return { inserted: total };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const mode = body?.mode || "listar_frota";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    if (["all", "listar_frota", "sync_frota", "detran_frota"].includes(mode)) {
      const configs = await buildTokenConfigs(supabase);
      if (!configs.length) {
        throw new Error("Nenhuma credencial DETRAN encontrada em TI > Integrações. Cadastre CLIENT_ID_XX e CLIENT_SECRET_XX ou CLIENT_ID/CLIENT_SECRET.");
      }

      const results: any[] = [];
      const allRows: any[] = [];

      for (const config of configs) {
        const token = await getDetranToken(config);
        const atuais = await fetchAllPages("/api/v1/consulta/listar-veiculos", config, token);
        const venda = body?.includeVenda === false ? [] : await fetchAllPages("/api/v1/consulta/listar-veiculos-venda", config, token).catch((err) => {
          results.push({ tokenKey: config.suffix, endpoint: "venda", ok: false, error: err.message });
          return [];
        });

        const atualRows = atuais.map((v) => mapVeiculo({ ...v, __empresa: config.empresa }, config, "atual"));
        const vendaRows = venda.map((v) => mapVeiculo({ ...v, __empresa: config.empresa }, config, "venda"));
        allRows.push(...atualRows, ...vendaRows);
        results.push({ tokenKey: config.suffix, empresa: config.empresa, ok: true, atual: atualRows.length, venda: vendaRows.length });
      }

      const { inserted } = await upsertVeiculos(supabase, allRows);
      return json({ ok: true, mode, total: inserted, results });
    }

    // Confirmação individual: não exige RENAVAM prévio; se a frota do DETRAN já estiver no banco, apenas atualiza o selo.
    const placa = onlyPlate(body?.placa);
    if (!placa && !body?.veiculo_id) throw new Error("Informe placa ou veiculo_id.");

    let query = supabase.from("frotas_veiculos").select("*");
    if (body?.veiculo_id) query = query.eq("id", body.veiculo_id);
    else query = query.eq("placa", placa);
    const { data: vehicle, error } = await query.single();
    if (error) throw error;

    const { error: updateError } = await supabase.from("frotas_veiculos").update({
      detran_confirmado: true,
      detran_status: "CONFIRMADO",
      detran_mensagem: "Veículo validado no painel. Use Sincronizar DETRAN para atualizar dados oficiais da frota.",
      detran_ultima_consulta_em: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", vehicle.id);
    if (updateError) throw updateError;

    return json({ ok: true, mode, updated: true, result: { placa: vehicle.placa, status: "CONFIRMADO" } });
  } catch (error) {
    return json({ ok: false, error: error?.message || "Erro interno" }, 500);
  }
});
