
import { initProtectedPage } from './pageInit.js';
import { supabase } from './supabaseClient.js';
import { getCurrentUser } from './auth.js';

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function brDate(value) {
  if (!value) return '-';
  const [y, m, d] = String(value).split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

function defaultToday() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export function mountRequestModule(config) {
  initProtectedPage(config.pageTitle, (content, userContext) => {
    content.innerHTML = `
      <section class="hero-card">
        <div>
          <div class="eyebrow">Gestor</div>
          <h2>${escapeHtml(config.pageTitle)}</h2>
          <p>${escapeHtml(config.description || 'Módulo conectado ao Supabase.')}</p>
        </div>
        <div class="hero-badge-wrap">
          <span class="hero-badge">${escapeHtml(config.badge || 'SUPABASE')}</span>
        </div>
      </section>

      <section class="grid-cards mt-16">
        <article class="card">
          <h3>Total</h3>
          <p class="metric" id="${config.key}-stat-total">0</p>
          <p class="muted">Registros retornados na consulta atual.</p>
        </article>
        <article class="card">
          <h3>Abertos</h3>
          <p class="metric" id="${config.key}-stat-open">0</p>
          <p class="muted">Itens em tratamento.</p>
        </article>
        <article class="card">
          <h3>Fechados</h3>
          <p class="metric" id="${config.key}-stat-closed">0</p>
          <p class="muted">Itens concluídos ou encerrados.</p>
        </article>
      </section>

      <section class="card mt-16">
        <div class="section-head">
          <div>
            <h3 id="${config.key}-form-title">Novo registro</h3>
            <p class="muted">${escapeHtml(config.formHint || 'Preencha os dados abaixo.')}</p>
          </div>
          <button class="btn btn-secondary hidden" type="button" id="${config.key}-cancel-btn">Cancelar edição</button>
        </div>

        <form id="${config.key}-form" class="programacao-form">
          <input type="hidden" id="${config.key}-id" />
          <div class="form-grid">
            ${config.fields.map((field) => renderField(config.key, field)).join('')}
          </div>
          <div class="form-actions">
            <button class="btn btn-primary btn-inline" type="submit" id="${config.key}-save-btn">Salvar</button>
            <div class="feedback" id="${config.key}-feedback"></div>
          </div>
        </form>
      </section>

      <section class="card mt-16">
        <div class="section-head">
          <div>
            <h3>Filtros</h3>
            <p class="muted">Use os filtros para localizar registros com rapidez.</p>
          </div>
        </div>

        <form id="${config.key}-filters" class="filters-grid">
          <div class="field">
            <label for="${config.key}-filter-start">Data inicial</label>
            <input id="${config.key}-filter-start" type="date" />
          </div>
          <div class="field">
            <label for="${config.key}-filter-end">Data final</label>
            <input id="${config.key}-filter-end" type="date" />
          </div>
          <div class="field">
            <label for="${config.key}-filter-status">Status</label>
            <select id="${config.key}-filter-status">
              <option value="">Todos</option>
              ${(config.statusOptions || []).map((status) => `<option value="${escapeHtml(status.value)}">${escapeHtml(status.label)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label for="${config.key}-filter-search">Busca</label>
            <input id="${config.key}-filter-search" type="text" placeholder="Pesquisar..." />
          </div>
          <div class="filter-actions">
            <button class="btn btn-secondary" type="submit">Aplicar filtros</button>
            <button class="btn btn-ghost" type="button" id="${config.key}-clear-filters">Limpar</button>
          </div>
        </form>
      </section>

      <section class="card mt-16">
        <div class="section-head">
          <div>
            <h3>Registros</h3>
            <p class="muted">${escapeHtml(config.listHint || 'Clique em editar para alterar um registro.')}</p>
          </div>
          <button class="btn btn-secondary" type="button" id="${config.key}-refresh-btn">Atualizar lista</button>
        </div>

        <div class="table-wrap">
          <table class="programacao-table">
            <thead>
              <tr>
                ${config.columns.map((col) => `<th>${escapeHtml(col.label)}</th>`).join('')}
                <th class="th-actions">Ações</th>
              </tr>
            </thead>
            <tbody id="${config.key}-tbody">
              <tr><td colspan="${config.columns.length + 1}" class="table-empty">Carregando registros...</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    `;

    const state = { rows: [], editingId: null, currentUser: null };

    const form = document.getElementById(`${config.key}-form`);
    const tbody = document.getElementById(`${config.key}-tbody`);
    const filters = document.getElementById(`${config.key}-filters`);
    const feedback = document.getElementById(`${config.key}-feedback`);
    const saveBtn = document.getElementById(`${config.key}-save-btn`);
    const cancelBtn = document.getElementById(`${config.key}-cancel-btn`);
    const formTitle = document.getElementById(`${config.key}-form-title`);

    function resetForm() {
      state.editingId = null;
      form.reset();
      document.getElementById(`${config.key}-id`).value = '';
      formTitle.textContent = 'Novo registro';
      saveBtn.textContent = 'Salvar';
      cancelBtn.classList.add('hidden');
      feedback.textContent = '';
      config.fields.forEach((field) => {
        if (field.type === 'date' && field.defaultToday) {
          const input = document.getElementById(`${config.key}-${field.name}`);
          if (input) input.value = defaultToday();
        }
        if (field.defaultValue != null) {
          const input = document.getElementById(`${config.key}-${field.name}`);
          if (input) input.value = field.defaultValue;
        }
      });
    }

    function getFilterValues() {
      return {
        start: document.getElementById(`${config.key}-filter-start`).value,
        end: document.getElementById(`${config.key}-filter-end`).value,
        status: document.getElementById(`${config.key}-filter-status`).value,
        search: (document.getElementById(`${config.key}-filter-search`).value || '').trim().toLowerCase(),
      };
    }

    function updateStats(rows) {
      const total = rows.length;
      const openCount = rows.filter((row) => !['concluido', 'encerrado', 'cancelado'].includes(String(row.status || '').toLowerCase())).length;
      const closedCount = total - openCount;
      document.getElementById(`${config.key}-stat-total`).textContent = String(total);
      document.getElementById(`${config.key}-stat-open`).textContent = String(openCount);
      document.getElementById(`${config.key}-stat-closed`).textContent = String(closedCount);
    }

    function renderTable(rows) {
      if (!rows.length) {
        tbody.innerHTML = `<tr><td colspan="${config.columns.length + 1}" class="table-empty">Nenhum registro encontrado.</td></tr>`;
        return;
      }

      tbody.innerHTML = rows.map((row) => `
        <tr>
          ${config.columns.map((col) => `<td>${renderCell(row, col)}</td>`).join('')}
          <td>
            <div class="row-actions">
              <button class="btn btn-small btn-secondary" type="button" data-action="edit" data-id="${row.id}">Editar</button>
              <button class="btn btn-small btn-danger" type="button" data-action="delete" data-id="${row.id}">Excluir</button>
            </div>
          </td>
        </tr>
      `).join('');
    }

    async function loadRows() {
      const f = getFilterValues();
      tbody.innerHTML = `<tr><td colspan="${config.columns.length + 1}" class="table-empty">Carregando registros...</td></tr>`;

      let query = supabase.from(config.table).select('*').order(config.orderBy || 'created_at', { ascending: false });

      const dateField = config.dateField || 'data_solicitacao';
      if (f.start) query = query.gte(dateField, f.start);
      if (f.end) query = query.lte(dateField, f.end);
      if (f.status) query = query.eq('status', f.status);

      const { data, error } = await query;
      if (error) {
        tbody.innerHTML = `<tr><td colspan="${config.columns.length + 1}" class="table-empty">${escapeHtml(error.message)}</td></tr>`;
        return;
      }

      let rows = data || [];
      if (f.search) {
        rows = rows.filter((row) => {
          const full = config.searchFields.map((field) => String(row[field] || '')).join(' ').toLowerCase();
          return full.includes(f.search);
        });
      }

      state.rows = rows;
      updateStats(rows);
      renderTable(rows);
    }

    function fillForm(row) {
      state.editingId = row.id;
      document.getElementById(`${config.key}-id`).value = row.id;
      config.fields.forEach((field) => {
        const input = document.getElementById(`${config.key}-${field.name}`);
        if (!input) return;
        input.value = row[field.name] ?? '';
      });
      formTitle.textContent = 'Editando registro';
      saveBtn.textContent = 'Salvar alterações';
      cancelBtn.classList.remove('hidden');
      feedback.textContent = 'Modo edição ativo.';
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    async function handleSubmit(event) {
      event.preventDefault();
      feedback.textContent = 'Salvando...';
      saveBtn.disabled = true;

      const payload = {};
      config.fields.forEach((field) => {
        const input = document.getElementById(`${config.key}-${field.name}`);
        let value = input ? input.value : null;
        if (field.type === 'number' && value !== '') value = Number(value);
        if (field.type === 'checkbox') value = !!input.checked;
        if (value === '') value = null;
        payload[field.name] = value;
      });

      if (config.createdByField) payload[config.createdByField] = state.currentUser?.id || null;

      let result;
      if (state.editingId) {
        result = await supabase.from(config.table).update(payload).eq('id', state.editingId);
      } else {
        result = await supabase.from(config.table).insert(payload);
      }

      if (result.error) {
        feedback.textContent = result.error.message || 'Erro ao salvar.';
        saveBtn.disabled = false;
        return;
      }

      resetForm();
      feedback.textContent = 'Registro salvo com sucesso.';
      await loadRows();
      saveBtn.disabled = false;
    }

    async function handleDelete(id) {
      if (!window.confirm('Deseja excluir este registro?')) return;
      const { error } = await supabase.from(config.table).delete().eq('id', id);
      if (error) {
        window.alert(error.message || 'Erro ao excluir.');
        return;
      }
      if (state.editingId === id) resetForm();
      await loadRows();
    }

    filters.addEventListener('submit', async (event) => {
      event.preventDefault();
      await loadRows();
    });

    document.getElementById(`${config.key}-clear-filters`).addEventListener('click', async () => {
      document.getElementById(`${config.key}-filter-start`).value = '';
      document.getElementById(`${config.key}-filter-end`).value = '';
      document.getElementById(`${config.key}-filter-status`).value = '';
      document.getElementById(`${config.key}-filter-search`).value = '';
      await loadRows();
    });

    document.getElementById(`${config.key}-refresh-btn`).addEventListener('click', loadRows);
    cancelBtn.addEventListener('click', resetForm);
    form.addEventListener('submit', handleSubmit);
    tbody.addEventListener('click', async (event) => {
      const button = event.target.closest('button[data-action]');
      if (!button) return;
      const row = state.rows.find((item) => item.id === button.dataset.id);
      if (!row) return;
      if (button.dataset.action === 'edit') fillForm(row);
      if (button.dataset.action === 'delete') await handleDelete(button.dataset.id);
    });

    (async function boot() {
      state.currentUser = await getCurrentUser();
      resetForm();
      await loadRows();
    })();
  });
}

function renderField(key, field) {
  const id = `${key}-${field.name}`;
  const label = `<label for="${id}">${field.label}</label>`;

  if (field.type === 'select') {
    return `
      <div class="field ${field.span2 ? 'field-span-2' : ''}">
        ${label}
        <select id="${id}" ${field.required ? 'required' : ''}>
          ${(field.options || []).map((opt) => `<option value="${escapeHtml(opt.value)}">${escapeHtml(opt.label)}</option>`).join('')}
        </select>
      </div>
    `;
  }

  if (field.type === 'textarea') {
    return `
      <div class="field ${field.span2 ? 'field-span-2' : ''}">
        ${label}
        <textarea id="${id}" rows="${field.rows || 4}" placeholder="${escapeHtml(field.placeholder || '')}"></textarea>
      </div>
    `;
  }

  return `
    <div class="field ${field.span2 ? 'field-span-2' : ''}">
      ${label}
      <input id="${id}" type="${field.type || 'text'}" placeholder="${escapeHtml(field.placeholder || '')}" ${field.required ? 'required' : ''} />
    </div>
  `;
}

function renderCell(row, col) {
  const raw = row[col.field];
  if (col.type === 'date') return brDate(raw);
  if (col.type === 'status') return `<span class="status-pill status-${escapeHtml(String(raw || '').toLowerCase())}">${escapeHtml(col.statusLabel ? col.statusLabel(raw) : raw || '-')}</span>`;
  return escapeHtml(raw || '-');
}
