import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

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

// Tipos suportados e seus media types
const MIME_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) return json({ error: "ANTHROPIC_API_KEY não configurada" }, 500);

    const body = await req.json();

    // Aceita base64 direto ou URL pública
    const { base64, url, tipo, instrucao } = body;

    if (!base64 && !url) return json({ error: "Envie 'base64' ou 'url' do arquivo" }, 400);
    if (!tipo) return json({ error: "Informe o 'tipo' do arquivo (jpg, png, pdf, etc)" }, 400);

    const mediaType = MIME_TYPES[tipo.toLowerCase()];
    if (!mediaType) return json({ error: `Tipo '${tipo}' não suportado` }, 400);

    const prompt = instrucao || "Extraia todo o texto deste documento. Retorne apenas o texto extraído, sem comentários adicionais.";

    // Monta o bloco de conteúdo conforme o tipo
    let contentBlock: unknown;

    if (mediaType === "application/pdf") {
      contentBlock = {
        type: "document",
        source: base64
          ? { type: "base64", media_type: mediaType, data: base64 }
          : { type: "url", url },
      };
    } else {
      contentBlock = {
        type: "image",
        source: base64
          ? { type: "base64", media_type: mediaType, data: base64 }
          : { type: "url", url },
      };
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-beta": "pdfs-2024-09-25",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: [contentBlock, { type: "text", text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.json();
      return json({ error: "Erro na API Claude", detalhe: err }, 502);
    }

    const result = await response.json();
    const texto = result.content?.[0]?.text ?? "";

    return json({ texto, tokens: result.usage });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
