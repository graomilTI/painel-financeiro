import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOT_ID  = 171749;
const FLOW_ID = 8965976;
const BC_BASE = "https://backend.botconversa.com.br/api/v1/webhook";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Gera candidatos E.164 a partir do telefone armazenado (BR)
 * Mesma lógica do script Google Apps do BotConversa
 */
function gerarCandidatos(raw: string): string[] {
  const digits = raw.replace(/\D/g, "").replace(/^0+/, "");
  if (!digits) return [];

  let d = digits.startsWith("55") ? digits.slice(2) : digits;

  const set = new Set<string>();

  if (d.length === 10) {
    const ddd = d.slice(0, 2), num8 = d.slice(2);
    set.add(`+55${ddd}${num8}`);
    set.add(`+55${ddd}9${num8}`);
  }
  if (d.length === 11) {
    const ddd = d.slice(0, 2), num9 = d.slice(2);
    set.add(`+55${ddd}${num9}`);
    if (num9.startsWith("9")) set.add(`+55${ddd}${num9.slice(1)}`);
  }
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    set.add("+" + digits);
  }

  // Adiciona sem + também
  const result: string[] = [];
  for (const e of set) {
    result.push(e);
    result.push(e.replace("+", ""));
  }
  return [...new Set(result)];
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { colaboradores } = await req.json() as {
      colaboradores: Array<{ nome: string; telefone: string }>;
    };

    if (!Array.isArray(colaboradores) || !colaboradores.length) {
      return json({ ok: false, error: "Nenhum colaborador informado." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // API key
    const { data: seg } = await supabase
      .from("ti_integracao_segredos")
      .select("valor")
      .eq("chave", "BOTCONVERSA_API_KEY")
      .single();

    const apiKey = seg?.valor;
    if (!apiKey) return json({ ok: false, error: "BOTCONVERSA_API_KEY não encontrada." }, 500);

    const bcHeaders = { "API-KEY": apiKey, "Accept": "application/json", "Content-Type": "application/json" };

    // Cache de subscriber_ids
    const allPhones = colaboradores.flatMap(c => gerarCandidatos(c.telefone));
    const { data: bcContatos } = await supabase
      .from("botconversa_contatos")
      .select("telefone, subscriber_id")
      .in("telefone", allPhones);
    const subscriberMap = new Map<string, string>();
    for (const c of (bcContatos || [])) {
      if (c.subscriber_id) subscriberMap.set(c.telefone, c.subscriber_id);
    }

    const results: Array<{
      nome: string; telefone: string; subscriber_id?: string;
      ok: boolean; status_http?: number; detalhe?: string;
    }> = [];
    const filaInserts: unknown[] = [];

    for (const { nome, telefone } of colaboradores) {
      const candidatos = gerarCandidatos(telefone);

      // 1. Busca subscriber_id no cache
      let subscriberId: string | undefined;
      for (const c of candidatos) {
        if (subscriberMap.get(c)) { subscriberId = subscriberMap.get(c); break; }
      }

      // 2. Busca no BotConversa por get_by_phone
      if (!subscriberId) {
        for (const phone of candidatos) {
          const url = `${BC_BASE}/subscriber/get_by_phone/${encodeURIComponent(phone)}/`;
          const r = await fetch(url, { method: "GET", headers: bcHeaders });
          if (r.status === 200) {
            const d = await r.json().catch(() => ({}));
            if (d?.id) { subscriberId = String(d.id); break; }
          }
        }
      }

      if (!subscriberId) {
        const detalhe = `Subscriber não encontrado para nenhum dos telefones: ${candidatos.slice(0, 4).join(", ")}`;
        results.push({ nome, telefone, ok: false, detalhe });
        filaInserts.push({ tipo: "flow", nome, telefone, flow_id: String(FLOW_ID), status: "erro", erro: detalhe, origem: "btg-logistica" });
        continue;
      }

      // 3. Salva subscriber_id no cache
      try {
        await supabase.from("botconversa_contatos").upsert(
          candidatos.map(t => ({ telefone: t, nome, subscriber_id: subscriberId, ativo: true, updated_at: new Date().toISOString() })),
          { onConflict: "telefone", ignoreDuplicates: false }
        );
      } catch (_) {}

      // 4. Envia fluxo
      const sendUrl = `${BC_BASE}/subscriber/${subscriberId}/send_flow/`;
      const flowRes = await fetch(sendUrl, {
        method: "POST",
        headers: bcHeaders,
        body: JSON.stringify({ flow_id: FLOW_ID, flow: String(FLOW_ID), bot_id: BOT_ID }),
      });
      const flowData = await flowRes.json().catch(() => ({}));
      const ok = flowRes.status >= 200 && flowRes.status < 300;

      results.push({
        nome, telefone, subscriber_id: subscriberId,
        ok, status_http: flowRes.status,
        detalhe: ok ? undefined : JSON.stringify(flowData),
      });

      filaInserts.push({
        tipo: "flow", nome, telefone, subscriber_id: subscriberId,
        flow_id: String(FLOW_ID),
        status: ok ? "enviado" : "erro",
        erro: ok ? null : JSON.stringify(flowData),
        origem: "btg-logistica",
      });
    }

    if (filaInserts.length) {
      try { await supabase.from("botconversa_fila").insert(filaInserts); } catch (_) {}
    }

    return json({ ok: true, total: results.length, enviados: results.filter(r => r.ok).length, results });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
