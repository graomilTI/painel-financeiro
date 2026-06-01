-- Frotas · Veículos: base de placa/RENAVAM para integração com DETRAN
create table if not exists public.frotas_veiculos (
  id uuid primary key default gen_random_uuid(),
  placa text not null unique,
  renavam text,
  nome text,
  empresa text,
  cnpj text,
  marca text,
  modelo text,
  cor text,
  ano integer,
  tipo text,
  coordenacao text,
  supervisao text,
  motorista_atual text,
  hodometro numeric default 0,
  valor_mensal numeric default 0,
  dia_vencimento integer,
  valor_km numeric default 0,
  status text not null default 'ATIVO',
  detran_confirmado boolean not null default false,
  detran_status text not null default 'PENDENTE',
  detran_mensagem text,
  detran_ultima_consulta_em timestamptz,
  detran_raw jsonb not null default '{}'::jsonb,
  origem_importacao text not null default 'painel',
  arquivo_nome text,
  raw jsonb not null default '{}'::jsonb,
  import_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.frotas_veiculos add column if not exists detran_confirmado boolean not null default false;
alter table public.frotas_veiculos add column if not exists detran_status text not null default 'PENDENTE';
alter table public.frotas_veiculos add column if not exists detran_mensagem text;
alter table public.frotas_veiculos add column if not exists detran_ultima_consulta_em timestamptz;
alter table public.frotas_veiculos add column if not exists detran_raw jsonb not null default '{}'::jsonb;
alter table public.frotas_veiculos add column if not exists arquivo_nome text;
alter table public.frotas_veiculos add column if not exists raw jsonb not null default '{}'::jsonb;
alter table public.frotas_veiculos add column if not exists import_hash text;

create index if not exists idx_frotas_veiculos_placa on public.frotas_veiculos (placa);
create index if not exists idx_frotas_veiculos_renavam on public.frotas_veiculos (renavam);
create index if not exists idx_frotas_veiculos_detran_status on public.frotas_veiculos (detran_status);

insert into public.app_modulos (codigo, nome, categoria, rota, ordem, ativo)
values
  ('frotas_veiculos', 'Veículos', 'FROTAS', 'frotas-veiculos', 62, true),
  ('frotas_multas', 'Multas', 'FROTAS', 'frotas-multas', 63, true)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  rota = excluded.rota,
  ativo = true,
  updated_at = now();

insert into public.modules (code, name, area, active)
values
  ('frotas_veiculos', 'Veículos', 'FROTAS', true),
  ('frotas_multas', 'Multas', 'FROTAS', true)
on conflict (code) do update set
  name = excluded.name,
  area = excluded.area,
  active = true;
