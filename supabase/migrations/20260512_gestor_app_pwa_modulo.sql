-- Opcional: registra o App Gestor como módulo liberável no cadastro de usuários.
insert into public.app_modulos (codigo, nome, categoria, icone, rota, ordem, ativo)
values ('gestor_app', 'App Gestor', 'GESTOR', 'Smartphone', 'gestor-app', 10, true)
on conflict (codigo) do update set
  nome = excluded.nome,
  categoria = excluded.categoria,
  icone = excluded.icone,
  rota = excluded.rota,
  ordem = excluded.ordem,
  ativo = excluded.ativo,
  updated_at = now();

insert into public.app_perfil_modulo (perfil_id, modulo_id, pode_ver, pode_criar, pode_editar, pode_excluir, pode_aprovar)
select p.id, m.id, true, true, true, false, false
from public.app_perfis p
cross join public.app_modulos m
where m.codigo = 'gestor_app'
  and upper(coalesce(p.codigo, p.nome)) in ('MASTER', 'ADMIN', 'ADM', 'GESTOR')
  and not exists (
    select 1
    from public.app_perfil_modulo apm
    where apm.perfil_id = p.id
      and apm.modulo_id = m.id
  );
