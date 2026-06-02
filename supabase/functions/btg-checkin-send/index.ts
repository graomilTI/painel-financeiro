import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FLOW_ID = 8965976;
const BC_BASE = "https://backend.botconversa.com.br/api/v1";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

/**
 * Retorna dois formatos de telefone para tentar no BotConversa:
 *   - com13: 55DDD9XXXXXXXX  (13 dígitos — nosso padrão)
 *   - com12: 55DDXXXXXXXX    (12 dígitos — BotConversa remove o 9 de transição BR)
 */
function fmtPhones(raw: string): { com13: string; com12: string } {
  const d = raw.replace(/\D/g, "");
  // Garante DDI 55
  const base = (d.startsWith("55") && d.length >= 12) ? d : "55" + d;
  // com13 = formato padrão (com o 9 de transição)
  const com13 = base;
  // com12 = remove o 9 logo após o DDD de 2 dígitos: 55XX9XXXXXXXX → 55XXXXXXXXX
  // Estrutura: 55(2) + DDD(2) + 9 + 8dígitos = 13 → remove posição 4
  let com12 = base;
  if (base.length === 13 && base.charAt(4) === "9") {
    com12 = base.slice(0, 4) + base.slice(5); // remove o 9
  }
  return { com13, com12 };
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

    // subscriber_ids conhecidos (busca pelos dois formatos de telefone)
    const allPhones: string[] = [];
    for (const c of colaboradores) {
      const { com13, com12 } = fmtPhones(c.telefone);
      allPhones.push(com13, com12);
    }
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
      const { com13, com12 } = fmtPhones(telefone);
      const phoneUsado = com13;

      // 1. Subscriber_id do cache (tenta ambos os formatos)
      let subscriberId = subscriberMap.get(com13) ?? subscriberMap.get(com12);

      if (!subscriberId) {
        // 2. Tenta buscar/criar subscriber — testa GET e POST com dois formatos de header
        const nameParts = nome.trim().split(/\s+/);
        const attempts = [
          // GET por telefone (com12 e com13, com + e sem)
          { method: "GET", url: `${BC_BASE}/subscriber/?phone=%2B${com12}`, headers: { Authorization: apiKey } },
          { method: "GET", url: `${BC_BASE}/subscriber/?phone=%2B${com12}`, headers: { "Api-Key": apiKey } },
          { method: "GET", url: `${BC_BASE}/subscriber/?phone=${com13}`, headers: { Authorization: apiKey } },
          // POST sync
          { method: "POST", url: `${BC_BASE}/subscriber/`, headers: { Authorization: apiKey },
            body: JSON.stringify({ phone: com13, first_name: nameParts[0] ?? nome, last_name: nameParts.slice(1).join(" ") || "" }) },
          { method: "POST", url: `${BC_BASE}/subscriber/`, headers: { "Api-Key": apiKey },
            body: JSON.stringify({ phone: com13, first_name: nameParts[0] ?? nome, last_name: nameParts.slice(1).join(" ") || "" }) },
          { method: "POST", url: `${BC_BASE}/subscriber/`, headers: { Authorization: apiKey },
            body: JSON.stringify({ phone: "+" + com12, first_name: nameParts[0] ?? nome, last_name: nameParts.slice(1).join(" ") || "" }) },
        ];

        let syncLog = "";
        for (const att of attempts) {
          const r = await fetch(att.url, {
            method: att.method,
            headers: { "Content-Type": "application/json", ...att.headers },
            body: (att as { body?: string }).body,
          });
          const d = await r.json().catch(() => ({}));
          syncLog += `[${att.method} ${att.url.replace(BC_BASE,"")} ${r.status}] `;
          const id = d?.id ?? d?.subscriber_id ?? d?.results?.[0]?.id;
          if (id) { subscriberId = String(id); break; }
        }

        if (subscriberId) {
          try {
            await supabase.from("botconversa_contatos").upsert(
              [{ telefone: com13, nome, subscriber_id: subscriberId, ativo: true, updated_at: new Date().toISOString() },
               { telefone: com12, nome, subscriber_id: subscriberId, ativo: true, updated_at: new Date().toISOString() }],
              { onConflict: "telefone", ignoreDuplicates: false }
            );
          } catch (_) {}
        } else {
          const detalhe = `Subscriber não encontrado. Tentativas: ${syncLog}`;
          results.push({ nome, telefone: com12, ok: false, detalhe });
          filaInserts.push({ tipo: "flow", nome, telefone: phoneUsado, flow_id: String(FLOW_ID), status: "erro", erro: detalhe, origem: "btg-logistica" });
          continue;
        }
      }

      // 3. Dispara o fluxo
      const flowRes = await fetch(
        `${BC_BASE}/subscriber/${subscriberId}/run-flow/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: apiKey },
          body: JSON.stringify({ flow_id: FLOW_ID }),
        }
      );
      const flowData = await flowRes.json().catch(() => ({}));
      const ok = flowRes.ok;

      results.push({
        nome, telefone: com12, subscriber_id: subscriberId,
        ok, status_http: flowRes.status,
        detalhe: ok ? undefined : JSON.stringify(flowData),
      });

      filaInserts.push({
        tipo: "flow", nome, telefone: phoneUsado, subscriber_id: subscriberId,
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
