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
      .ex-wrap{padding:16px;color:#e2e2f0;font-family:Arial,sans-serif}
      .ex-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
      .ex-card{background:#0d0d18;border:1px solid #15152a;border-radius:18px;padding:16px}
      .ex-btn{background:#166534;color:#fff;border:none;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer}
      .ex-table{width:100%;border-collapse:collapse;font-size:12px}
      .ex-table th,.ex-table td{padding:8px;border-bottom:1px solid #15152a;text-align:left}
    </style>`;
  }

  async function gerar(tipo) {
    const mapa = {
      google: "/api/exportacoes/google-contacts",
      flash: "/api/exportacoes/cartoes/flash",
      ifood: "/api/exportacoes/cartoes/ifood",
      uber: "/api/exportacoes/uber"
    };
    return api(mapa[tipo], { method: "POST", body: JSON.stringify({}) });
  }

  async function carregarJobs(tbody) {
    const out = await api("/api/exportacoes/jobs");
    tbody.innerHTML = "";
    (out.items || []).forEach(j => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${j.created_at || "-"}</td>
        <td>${j.tipo || "-"}</td>
        <td>${j.status || "-"}</td>
        <td>${j.total_registros || 0}</td>
        <td>${j.arquivo_id ? `<a href="/api/exportacoes/download?id=${j.arquivo_id}" target="_blank">Baixar</a>` : "-"}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  window.EXPORTACOES_COLABORADORES = {
    openHome(container) {
      container.innerHTML = `
        ${styles()}
        <div class="ex-wrap">
          <div class="ex-grid">
            <div class="ex-card"><h3>Google Contacts</h3><button class="ex-btn" id="ex_google">Gerar</button></div>
            <div class="ex-card"><h3>Flash</h3><button class="ex-btn" id="ex_flash">Gerar</button></div>
            <div class="ex-card"><h3>iFood</h3><button class="ex-btn" id="ex_ifood">Gerar</button></div>
            <div class="ex-card"><h3>Uber</h3><button class="ex-btn" id="ex_uber">Gerar</button></div>
          </div>
          <div class="ex-card" style="margin-top:16px">
            <h3>Histórico de exportações</h3>
            <table class="ex-table">
              <thead><tr><th>Data</th><th>Tipo</th><th>Status</th><th>Total</th><th>Arquivo</th></tr></thead>
              <tbody id="ex_tbody"></tbody>
            </table>
          </div>
        </div>
      `;
      const tbody = container.querySelector("#ex_tbody");
      const bind = (id, tipo) => container.querySelector(id).onclick = async () => {
        await gerar(tipo);
        await carregarJobs(tbody);
      };
      bind("#ex_google", "google");
      bind("#ex_flash", "flash");
      bind("#ex_ifood", "ifood");
      bind("#ex_uber", "uber");
      carregarJobs(tbody).catch(console.error);
    }
  };
})();