-- Tabela de registros de entrega de EPI por colaborador
-- Alimentada automaticamente pelo módulo Compras ADM ao enviar EPIs ao Financeiro
-- Consumida pelo módulo RH > EPI

create table if not exists rh_epi_registros (
  id                bigserial primary key,
  created_at        timestamptz not null default now(),
  data_entrega      date,
  colaborador_id    text,
  colaborador_nome  text,
  epi               text not null,
  ca                text,
  quantidade        integer not null default 1,
  compra_item_id    bigint references compras_itens(id) on delete set null,
  status            text not null default 'pendente' check (status in ('pendente','ok')),
  observacao        text,
  anexo_url         text,
  confirmado_em     timestamptz
);

-- Adiciona coluna CA em compras_itens se não existir
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_name='compras_itens' and column_name='ca'
  ) then
    alter table compras_itens add column ca text;
  end if;
end$$;

-- RLS: acesso para perfis autorizados
alter table rh_epi_registros enable row level security;

create policy "rh_epi_select" on rh_epi_registros
  for select using (true);

create policy "rh_epi_insert" on rh_epi_registros
  for insert with check (true);

create policy "rh_epi_update" on rh_epi_registros
  for update using (true);

-- Índices úteis
create index if not exists rh_epi_colaborador_idx on rh_epi_registros (colaborador_id);
create index if not exists rh_epi_status_idx on rh_epi_registros (status);
create index if not exists rh_epi_data_idx on rh_epi_registros (data_entrega desc);
