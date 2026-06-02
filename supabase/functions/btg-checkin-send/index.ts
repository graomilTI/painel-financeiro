import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BOT_ID  = "171749";
const FLOW_ID = 8965976;
const BC_BASE = "https://backend.botconversa.com.br/api/v1";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// Normaliza telefone: 55DDD9XXXXXXXX (13 dígitos, sem +)
function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) return d;
  return "55" + d;
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

    // Busca API key
    const { data: seg } = await supabase
      .from("ti_integracao_segredos")
      .select("valor")
      .eq("chave", "BOTCONVERSA_API_KEY")
      .single();

    const apiKey = seg?.valor;
    if (!apiKey) return json({ ok: false, error: "BOTCONVERSA_API_KEY não encontrada." }, 500);

    // Carrega subscriber_ids conhecidos de botconversa_contatos (pelo telefone)
    const phones = colaboradores.map(c => fmtPhone(c.telefone)).filter(Boolean);
    const { data: bcContatos } = await supabase
      .from("botconversa_contatos")
      .select("telefone, subscriber_id")
      .in("telefone", phones);

    const subscriberMap = new Map<string, string>();
    for (const c of (bcContatos || [])) {
      if (c.subscriber_id) subscriberMap.set(c.telefone, c.subscriber_id);
    }

    const results: Array<{
      nome: string; telefone: string; subscriber_id?: string; ok: boolean;
      status_http?: number; detalhe?: string;
    }> = [];
    const filaInserts: unknown[] = [];

    for (const { nome, telefone } of colaboradores) {
      const phone = fmtPhone(telefone);

      if (!phone || phone.length < 12) {
        results.push({ nome, telefone, ok: false, detalhe: "Telefone inválido." });
        continue;
      }

      // 1. Obtém subscriber_id — do cache ou sincronizando com BotConversa
      let subscriberId = subscriberMap.get(phone);

      if (!subscriberId) {
        const nameParts = nome.trim().split(/\s+/);
        const syncRes = await fetch(
          `${BC_BASE}/webhook/whatsapp/${BOT_ID}/subscriber/`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: apiKey },
            body: JSON.stringify({
              phone,
              first_name: nameParts[0] ?? nome,
              last_name: nameParts.slice(1).join(" ") || "",
            }),
          }
        );
        const syncData = await syncRes.json().catch(() => ({}));
        subscriberId = syncData?.id ? String(syncData.id) : undefined;

        // Atualiza botconversa_contatos com o subscriber_id encontrado
        if (subscriberId) {
          await supabase
            .from("botconversa_contatos")
            .update({ subscriber_id: subscriberId, updated_at: new Date().toISOString() })
            .eq("telefone", phone)
            .then(() => {});
        }
      }

      if (!subscriberId) {
        results.push({ nome, telefone: phone, ok: false, detalhe: "Subscriber não encontrado no BotConversa." });
        filaInserts.push({ tipo: "flow", nome, telefone: phone, flow_id: String(FLOW_ID), status: "erro", erro: "Subscriber não encontrado", origem: "btg-logistica" });
        continue;
      }

      // 2. Dispara o fluxo via subscriber_id
      const flowRes = await fetch(
        `${BC_BASE}/webhook/whatsapp/${BOT_ID}/subscriber/${subscriberId}/run-flow/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: apiKey },
          body: JSON.stringify({ flow_id: FLOW_ID }),
        }
      );

      const flowData = await flowRes.json().catch(() => ({}));
      const ok = flowRes.ok;

      results.push({
        nome, telefone: phone, subscriber_id: subscriberId,
        ok, status_http: flowRes.status,
        detalhe: ok ? undefined : JSON.stringify(flowData),
      });

      filaInserts.push({
        tipo: "flow", nome, telefone: phone,
        subscriber_id: subscriberId,
        flow_id: String(FLOW_ID),
        status: ok ? "enviado" : "erro",
        erro: ok ? null : JSON.stringify(flowData),
        origem: "btg-logistica",
      });
    }

    if (filaInserts.length) {
      try { await supabase.from("botconversa_fila").insert(filaInserts); } catch (_) {}
    }

    const totalOk = results.filter((r) => r.ok).length;
    return json({ ok: true, total: results.length, enviados: totalOk, results });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
