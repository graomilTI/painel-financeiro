(function () {
  async function api(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: { "content-type": "application/json", ...(opts.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro na requisição");
    return data;
  }

  function styles() {
    return `<style>
      .ab-wrap{padding:16px;color:#e2e2f0;font-family:Arial,sans-serif}
      .ab-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
      .ab-card{background:#0d0d18;border:1px solid #15152a;border-radius:18px;padding:16px}
      .ab-btn{background:#166534;color:#fff;border:none;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer}
      .ab-table{width:100%;border-collapse:collapse;font-size:12px}
      .ab-table th,.ab-table td{padding:8px;border-bottom:1px solid #15152a;text-align:left}
    </style>`;
  }

  async function carregar(tableId, rota) {
    const tbody = document.querySelector(tableId);
    const out = await api(rota);
    tbody.innerHTML = "";
    (out.items || []).forEach(j => {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${j.created_at || "-"}</td><td>${j.tipo || "-"}</td><td>${j.status || (j.sucesso ? "ok" : "erro")}</td><td>${j.total_processado || "-"}</td><td>${j.total_sucesso || "-"}</td><td>${j.total_erro || "-"}</td>`;
      tbody.appendChild(tr);
    });
  }

  window.AUTOMACOES_BOT = {
    openHome(container) {
      container.innerHTML = `
        ${styles()}
        <div class="ab-wrap">
          <div class="ab-grid">
            <div class="ab-card"><h3>Sincronizar contatos</h3><button class="ab-btn" id="ab_sync">Executar</button></div>
            <div class="ab-card"><h3>Aniversariantes</h3><button class="ab-btn" id="ab_birth">Enviar flow</button></div>
            <div class="ab-card"><h3>Notificar cartões</h3><button class="ab-btn" id="ab_cards">Notificar</button></div>
          </div>
          <div class="ab-card" style="margin-top:16px">
            <h3>Jobs BotConversa</h3>
            <table class="ab-table"><thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th>Total</th><th>Sucesso</th><th>Erro</th></tr></thead><tbody id="ab_jobs"></tbody></table>
          </div>
          <div class="ab-card" style="margin-top:16px">
            <h3>Logs recentes</h3>
            <table class="ab-table"><thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th>Total</th><th>Sucesso</th><th>Erro</th></tr></thead><tbody id="ab_logs"></tbody></table>
          </div>
        </div>
      `;
      const reload = async () => {
        await carregar("#ab_jobs", "/api/botconversa/jobs");
        await carregar("#ab_logs", "/api/botconversa/logs");
      };
      container.querySelector("#ab_sync").onclick = async () => { await api("/api/botconversa/sync-subscribers", { method: "POST", body: JSON.stringify({}) }); await reload(); };
      container.querySelector("#ab_birth").onclick = async () => { await api("/api/botconversa/send-birthday-flow", { method: "POST", body: JSON.stringify({}) }); await reload(); };
      container.querySelector("#ab_cards").onclick = async () => { await api("/api/botconversa/notificar-cartoes", { method: "POST", body: JSON.stringify({}) }); await reload(); };
      reload().catch(console.error);
    }
  };
})();