import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BC_BASE = "https://backend.botconversa.com.br/api/v1/webhook";

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

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
      colaboradores: Array<{ nome: string; telefone: string; os_numeros: string[] }>;
    };

    if (!Array.isArray(colaboradores) || !colaboradores.length) {
      return json({ ok: false, error: "Nenhum colaborador informado." }, 400);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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
      nome: string; telefone: string; os: string; subscriber_id?: string;
      ok: boolean; status_http?: number; detalhe?: string;
    }> = [];
    const filaInserts: unknown[] = [];

    for (const { nome, telefone, os_numeros } of colaboradores) {
      const candidatos = gerarCandidatos(telefone);

      let subscriberId: string | undefined;
      for (const c of candidatos) {
        if (subscriberMap.get(c)) { subscriberId = subscriberMap.get(c); break; }
      }

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
        const detalhe = `Subscriber não encontrado: ${candidatos.slice(0, 4).join(", ")}`;
        for (const os of os_numeros) {
          results.push({ nome, telefone, os, ok: false, detalhe });
          filaInserts.push({ tipo: "message", nome, telefone, status: "erro", erro: detalhe, origem: "btg-nhe" });
        }
        continue;
      }

      // Salva subscriber_id no cache
      try {
        await supabase.from("botconversa_contatos").upsert(
          candidatos.map(t => ({ telefone: t, nome, subscriber_id: subscriberId, ativo: true, updated_at: new Date().toISOString() })),
          { onConflict: "telefone", ignoreDuplicates: false }
        );
      } catch (_) {}

      // Envia uma mensagem por OS
      for (const os of os_numeros) {
        const mensagem = `Até o momento não foi identificado lançamento de cargas na OS ${os}. Caso encerre o embarque não se esqueça de lançar o FOB ZERO!`;

        const sendUrl = `${BC_BASE}/subscriber/${subscriberId}/send_message/`;
        const formData = new FormData();
        formData.append("type", "text");
        formData.append("value", mensagem);

        const sendRes = await fetch(sendUrl, {
          method: "POST",
          headers: { "API-KEY": apiKey },
          body: formData,
        });
        const ok = sendRes.status >= 200 && sendRes.status < 300;
        const detalhe = ok ? undefined : await sendRes.text().catch(() => String(sendRes.status));

        results.push({ nome, telefone, os, subscriber_id: subscriberId, ok, status_http: sendRes.status, detalhe });
        filaInserts.push({
          tipo: "message", nome, telefone, subscriber_id: subscriberId,
          status: ok ? "enviado" : "erro",
          erro: ok ? null : detalhe,
          origem: "btg-nhe",
        });
      }
    }

    if (filaInserts.length) {
      try { await supabase.from("botconversa_fila").insert(filaInserts); } catch (_) {}
    }

    return json({ ok: true, total: results.length, enviados: results.filter(r => r.ok).length, results });
  } catch (err) {
    return json({ ok: false, error: (err as Error).message }, 500);
  }
});
