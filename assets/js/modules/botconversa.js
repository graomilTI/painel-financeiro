(function () {
  function el(tag, cls, html) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function fmtDateTime(v) {
    if (!v) return "-";
    try { return new Date(v).toLocaleString("pt-BR"); } catch { return v; }
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

  function card(title, body) {
    const c = el("div", "bc-card");
    c.appendChild(el("div", "bc-card-title", title));
    c.appendChild(body);
    return c;
  }

  function baseStyles() {
    const css = `
      .bc-wrap{padding:16px;color:#e2e2f0;font-family:Arial,sans-serif}
      .bc-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}
      .bc-card{background:#0d0d18;border:1px solid #15152a;border-radius:18px;padding:16px;box-shadow:0 8px 20px rgba(0,0,0,.25)}
      .bc-card-title{font-size:16px;font-weight:700;margin-bottom:12px}
      .bc-row{display:grid;gap:8px;margin-bottom:12px}
      .bc-row label{font-size:12px;color:#6b7280}
      .bc-row input,.bc-row textarea,.bc-row select{
        width:100%;padding:10px 12px;border-radius:12px;border:1px solid rgba(255,255,255,0.08);
        background:#0d0d18;color:#e2e2f0;outline:none;color-scheme:dark;
      }
      .bc-row textarea{min-height:110px;resize:vertical}
      .bc-btns{display:flex;gap:8px;flex-wrap:wrap}
      .bc-btn{
        background:#166534;color:#fff;border:none;border-radius:12px;padding:10px 14px;
        font-weight:700;cursor:pointer
      }
      .bc-btn.sec{background:#15152a}
      .bc-table-wrap{overflow:auto;border:1px solid #15152a;border-radius:14px}
      .bc-table{width:100%;border-collapse:collapse;font-size:12px}
      .bc-table th,.bc-table td{padding:10px;border-bottom:1px solid #15152a;text-align:left;vertical-align:top}
      .bc-mini{font-size:12px;color:#6b7280}
      .bc-alert{padding:10px 12px;border-radius:12px;background:#052e16;border:1px solid #166534;margin-bottom:12px}
      .bc-error{background:#3f0d0d;border-color:#7f1d1d}
      .bc-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
      .bc-tab{background:#15152a;color:#e2e2f0;border:none;padding:10px 14px;border-radius:999px;cursor:pointer}
      .bc-tab.active{background:#166534}
    `;
    return `<style>${css}</style>`;
  }

  function buildSendFlowView(state) {
    const wrap = el("div", "bc-grid");

    const body = el("div");
    body.innerHTML = `
      <div class="bc-row"><label>Empresa</label><input id="bc_empresa" placeholder="Ex.: Araguaia"></div>
      <div class="bc-row"><label>Nome</label><input id="bc_nome" placeholder="Nome do contato"></div>
      <div class="bc-row"><label>CPF</label><input id="bc_cpf" placeholder="Somente para log"></div>
      <div class="bc-row"><label>Telefone</label><input id="bc_telefone" placeholder="Ex.: 45999999999"></div>
      <div class="bc-row"><label>Flow ID</label><input id="bc_flow_id" placeholder="Ex.: 8777460"></div>
      <div class="bc-btns">
        <button class="bc-btn" id="bc_send_flow_btn">Enviar flow</button>
      </div>
      <div class="bc-mini" id="bc_send_flow_result">Pronto para enviar.</div>
    `;
    wrap.appendChild(card("Enviar Flow", body));

    body.querySelector("#bc_send_flow_btn").onclick = async () => {
      const payload = {
        empresa: body.querySelector("#bc_empresa").value.trim(),
        nome: body.querySelector("#bc_nome").value.trim(),
        cpf: body.querySelector("#bc_cpf").value.trim(),
        telefone: body.querySelector("#bc_telefone").value.trim(),
        flow_id: body.querySelector("#bc_flow_id").value.trim(),
      };
      const target = body.querySelector("#bc_send_flow_result");
      target.textContent = "Enviando...";
      try {
        const out = await api("/api/botconversa/send-flow", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        target.textContent = "Sucesso: " + JSON.stringify(out.data || out);
      } catch (err) {
        target.textContent = "Erro: " + err.message;
      }
    };

    return wrap;
  }

  function buildSendMessageView(state) {
    const wrap = el("div", "bc-grid");

    const body = el("div");
    body.innerHTML = `
      <div class="bc-row"><label>Empresa</label><input id="bcm_empresa" placeholder="Ex.: Araguaia"></div>
      <div class="bc-row"><label>Nome</label><input id="bcm_nome" placeholder="Nome do contato"></div>
      <div class="bc-row"><label>CPF</label><input id="bcm_cpf" placeholder="Somente para log"></div>
      <div class="bc-row"><label>Telefone</label><input id="bcm_telefone" placeholder="Ex.: 45999999999"></div>
      <div class="bc-row"><label>Mensagem</label><textarea id="bcm_mensagem" placeholder="Digite a mensagem"></textarea></div>
      <div class="bc-btns">
        <button class="bc-btn" id="bc_send_message_btn">Enviar mensagem</button>
      </div>
      <div class="bc-mini" id="bc_send_message_result">Pronto para enviar.</div>
    `;
    wrap.appendChild(card("Enviar Mensagem", body));

    body.querySelector("#bc_send_message_btn").onclick = async () => {
      const payload = {
        empresa: body.querySelector("#bcm_empresa").value.trim(),
        nome: body.querySelector("#bcm_nome").value.trim(),
        cpf: body.querySelector("#bcm_cpf").value.trim(),
        telefone: body.querySelector("#bcm_telefone").value.trim(),
        mensagem: body.querySelector("#bcm_mensagem").value.trim(),
      };
      const target = body.querySelector("#bc_send_message_result");
      target.textContent = "Enviando...";
      try {
        const out = await api("/api/botconversa/send-message", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        target.textContent = "Sucesso: " + JSON.stringify(out.data || out);
      } catch (err) {
        target.textContent = "Erro: " + err.message;
      }
    };

    return wrap;
  }

  function buildLogsView(state) {
    const wrap = el("div");

    const actions = el("div", "bc-btns");
    const btn = el("button", "bc-btn", "Atualizar logs");
    actions.appendChild(btn);
    wrap.appendChild(actions);

    const tableWrap = el("div", "bc-table-wrap");
    const table = el("table", "bc-table");
    table.innerHTML = `
      <thead>
        <tr>
          <th>Data</th>
          <th>Tipo</th>
          <th>Nome</th>
          <th>Telefone</th>
          <th>Sucesso</th>
          <th>Status HTTP</th>
          <th>Erro</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;
    tableWrap.appendChild(table);
    wrap.appendChild(tableWrap);

    async function load() {
      const out = await api("/api/botconversa/logs?limit=100");
      const tbody = table.querySelector("tbody");
      tbody.innerHTML = "";
      (out.items || []).forEach((r) => {
        const tr = el("tr");
        tr.innerHTML = `
          <td>${fmtDateTime(r.created_at)}</td>
          <td>${r.tipo || "-"}</td>
          <td>${r.nome || "-"}</td>
          <td>${r.telefone || "-"}</td>
          <td>${r.sucesso ? "Sim" : "Não"}</td>
          <td>${r.http_status || "-"}</td>
          <td>${r.erro || "-"}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    btn.onclick = load;
    load().catch(console.error);
    return wrap;
  }

  function renderTab(root, name) {
    const content = root.querySelector("[data-bc-content]");
    content.innerHTML = "";
    if (name === "flow") content.appendChild(buildSendFlowView({}));
    if (name === "message") content.appendChild(buildSendMessageView({}));
    if (name === "logs") content.appendChild(buildLogsView({}));

    root.querySelectorAll(".bc-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === name);
    });
  }

  window.BOTCONVERSA = {
    openHome(container) {
      container.innerHTML = `
        ${baseStyles()}
        <div class="bc-wrap">
          <div class="bc-tabs">
            <button class="bc-tab active" data-tab="flow">Enviar Flow</button>
            <button class="bc-tab" data-tab="message">Enviar Mensagem</button>
            <button class="bc-tab" data-tab="logs">Logs</button>
          </div>
          <div data-bc-content></div>
        </div>
      `;

      container.querySelectorAll(".bc-tab").forEach((btn) => {
        btn.onclick = () => renderTab(container, btn.dataset.tab);
      });

      renderTab(container, "flow");
    }
  };
})();