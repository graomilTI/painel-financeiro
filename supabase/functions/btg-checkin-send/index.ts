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

// Normaliza telefone para E.164: +55DDD9XXXXXXXX (14 chars com +)
function fmtPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (!d) return "";
  let digits = d;
  // Se já tem DDI 55 e 13 dígitos, usa; senão adiciona 55
  if (!(d.startsWith("55") && d.length >= 12)) {
    digits = "55" + d;
  }
  return "+" + digits;
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

    // Busca API key no banco
    const { data: seg } = await supabase
      .from("ti_integracao_segredos")
      .select("valor")
      .eq("chave", "BOTCONVERSA_API_KEY")
      .single();

    const apiKey = seg?.valor;
    if (!apiKey) return json({ ok: false, error: "BOTCONVERSA_API_KEY não encontrada." }, 500);

    const results: Array<{ nome: string; telefone: string; ok: boolean; detalhe?: string }> = [];
    const filaInserts: unknown[] = [];

    for (const { nome, telefone } of colaboradores) {
      const phone = fmtPhone(telefone);

      if (!phone || phone.length < 12) {
        results.push({ nome, telefone, ok: false, detalhe: "Telefone inválido após formatação." });
        continue;
      }

      const res = await fetch(
        `${BC_BASE}/webhook/whatsapp/${BOT_ID}/subscriber/run-flow/`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: apiKey },
          body: JSON.stringify({ phone, flow_id: FLOW_ID }),
        }
      );

      const data = await res.json().catch(() => ({}));
      const ok = res.ok && data?.ok !== false;

      results.push({
        nome,
        telefone: phone,
        ok,
        detalhe: ok ? undefined : JSON.stringify(data),
      });

      // Registra na fila como log
      filaInserts.push({
        tipo: "flow",
        nome,
        telefone: phone,
        flow_id: String(FLOW_ID),
        status: ok ? "enviado" : "erro",
        erro: ok ? null : JSON.stringify(data),
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
