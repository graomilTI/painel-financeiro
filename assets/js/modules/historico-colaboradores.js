(function () {
  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      ...opts,
      headers: {
        "content-type": "application/json",
        ...(opts.headers || {}),
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "Erro na requisição.");
    return data;
  }

  function styles() {
    return `
      <style>
        .hc-wrap{padding:16px;color:#e2e2f0;font-family:Arial,sans-serif}
        .hc-card{background:#0d0d18;border:1px solid #15152a;border-radius:18px;padding:16px;box-shadow:0 8px 20px rgba(0,0,0,.25)}
        .hc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:12px}
        .hc-row{display:grid;gap:8px}
        .hc-row label{font-size:12px;color:#6b7280}
        .hc-row input,.hc-row select,.hc-row textarea{
          width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);
          background:#0d0d18;color:#e2e2f0;outline:none;color-scheme:dark;
        }
        .hc-btn{background:#166534;color:#fff;border:none;border-radius:12px;padding:10px 14px;font-weight:700;cursor:pointer}
        .hc-table-wrap{overflow:auto;border:1px solid #15152a;border-radius:14px}
        .hc-table{width:100%;border-collapse:collapse;font-size:12px}
        .hc-table th,.hc-table td{padding:10px;border-bottom:1px solid #15152a;text-align:left;vertical-align:top}
      </style>
    `;
  }

  function normalizeDateInput(d) {
    if (!d) return "";
    const dt = new Date();
    return dt.toISOString().slice(0, 10);
  }

  function toRowsFromTextarea(text) {
    const lines = String(text || "").split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    if (!lines.length) return [];
    try {
      return JSON.parse(text);
    } catch {
      return [];
    }
  }

  window.HISTORICO_COLABORADORES = {
    openHome(container) {
      container.innerHTML = `
        ${styles()}
        <div class="hc-wrap">
          <div class="hc-card">
            <div class="hc-grid">
              <div class="hc-row">
                <label>Data</label>
                <input id="hc_data" type="date" value="${new Date().toISOString().slice(0,10)}">
              </div>
              <div class="hc-row">
                <label>Nome</label>
                <input id="hc_nome" placeholder="Filtrar por nome">
              </div>
              <div class="hc-row">
                <label>Empresa</label>
                <input id="hc_empresa" placeholder="Filtrar por empresa">
              </div>
              <div class="hc-row">
                <label>Ações</label>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button class="hc-btn" id="hc_filtrar">Consultar histórico</button>
                </div>
              </div>
            </div>

            <div class="hc-row" style="margin-bottom:12px">
              <label>Snapshot manual (JSON array) — opcional para carga rápida pelo painel</label>
              <textarea id="hc_json" rows="10" placeholder='[{"CPF":"123","Nome":"Fulano","Empresa":"Araguaia","Whatsapp":"45999999999"}]'></textarea>
            </div>

            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
              <button class="hc-btn" id="hc_snapshot">Gravar snapshot</button>
            </div>

            <div class="hc-table-wrap">
              <table class="hc-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>CPF</th>
                    <th>Nome</th>
                    <th>Empresa</th>
                    <th>Cargo</th>
                    <th>WhatsApp</th>
                  </tr>
                </thead>
                <tbody id="hc_tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      `;

      const tbody = container.querySelector("#hc_tbody");

      async function load() {
        const data = container.querySelector("#hc_data").value;
        const nome = container.querySelector("#hc_nome").value.trim();
        const empresa = container.querySelector("#hc_empresa").value.trim();

        const qs = new URLSearchParams();
        if (data) qs.set("data", data);
        if (nome) qs.set("nome", nome);
        if (empresa) qs.set("empresa", empresa);

        const out = await api("/api/admin/colaboradores/historico?" + qs.toString());
        tbody.innerHTML = "";
        (out.items || []).forEach((r) => {
          const tr = document.createElement("tr");
          tr.innerHTML = `
            <td>${r.data_referencia || "-"}</td>
            <td>${r.cpf || "-"}</td>
            <td>${r.nome || "-"}</td>
            <td>${r.empresa || "-"}</td>
            <td>${r.cargo || "-"}</td>
            <td>${r.whatsapp || "-"}</td>
          `;
          tbody.appendChild(tr);
        });
      }

      container.querySelector("#hc_filtrar").onclick = () => load().catch(err => alert(err.message));

      container.querySelector("#hc_snapshot").onclick = async () => {
        const dataReferencia = container.querySelector("#hc_data").value;
        const text = container.querySelector("#hc_json").value;
        let rows = [];
        try {
          rows = JSON.parse(text);
        } catch {
          alert("JSON inválido.");
          return;
        }
        const out = await api("/api/admin/colaboradores/snapshot", {
          method: "POST",
          body: JSON.stringify({ data_referencia: dataReferencia, data: rows, origem: "painel" }),
        });
        alert(`Snapshot gravado. Total: ${out.total}`);
        load().catch(console.error);
      };

      load().catch(console.error);
    }
  };
})();