create table if not exists public.championships (
  id text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  data jsonb not null check (
    jsonb_typeof(data) = 'object' and data ->> 'id' = id
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.site_admins enable row level security;

drop policy if exists "Admins can view their own role" on public.site_admins;
create policy "Admins can view their own role"
  on public.site_admins for select
  to authenticated
  using (auth.uid() = user_id);

revoke all on public.site_admins from anon, authenticated, public;
grant select on public.site_admins to authenticated;

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.site_admin_invite_codes (
  code_hash text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  used_at timestamptz,
  used_by uuid references auth.users (id) on delete set null
);

alter table public.site_admin_invite_codes enable row level security;
revoke all on public.site_admin_invite_codes from anon, authenticated, public;

insert into public.site_admin_invite_codes (code_hash)
values ('aef8818f72095d65cb6a2ee977327f81e2b3803976004bd96e6cf77fb0f53980')
on conflict (code_hash) do nothing;

do $$
begin
  if not exists (
    select 1 from auth.users
    where lower(email) = lower('m4t.valada0@gmail.com')
  ) then
    raise exception 'Create the Supabase Auth account for m4t.valada0@gmail.com before applying this schema.';
  end if;
end;
$$;

insert into public.site_admins (user_id)
select id
from auth.users
where lower(email) = lower('m4t.valada0@gmail.com')
on conflict (user_id) do nothing;

create or replace function public.claim_site_admin(p_code text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requesting_user uuid := auth.uid();
  claimed_code_hash text;
begin
  if requesting_user is null then
    raise exception 'Entre na sua conta antes de usar um código de administrador.'
      using errcode = '28000';
  end if;

  if exists (
    select 1
    from public.site_admins
    where user_id = requesting_user
  ) then
    return false;
  end if;

  if p_code is null or length(trim(p_code)) < 20 or length(trim(p_code)) > 128 then
    raise exception 'Código inválido ou já utilizado.'
      using errcode = '22023';
  end if;

  update public.site_admin_invite_codes
  set used_at = now(), used_by = requesting_user
  where code_hash = encode(extensions.digest(trim(p_code), 'sha256'), 'hex')
    and used_at is null
  returning code_hash into claimed_code_hash;

  if claimed_code_hash is null then
    raise exception 'Código inválido ou já utilizado.'
      using errcode = '22023';
  end if;

  insert into public.site_admins (user_id)
  values (requesting_user)
  on conflict (user_id) do nothing;

  return true;
end;
$function$;

revoke all on function public.claim_site_admin(text) from public, anon;
grant execute on function public.claim_site_admin(text) to authenticated;

alter table public.championships enable row level security;

drop policy if exists "Users can read their own championships" on public.championships;
drop policy if exists "Anyone can read championships" on public.championships;
create policy "Anyone can read championships"
  on public.championships for select
  to anon, authenticated
  using (true);

drop policy if exists "Users can create their own championships" on public.championships;
drop policy if exists "Site admins can create championships" on public.championships;
create policy "Site admins can create championships"
  on public.championships for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.site_admins
      where user_id = auth.uid()
    )
  );

drop policy if exists "Users can update their own championships" on public.championships;
create policy "Users can update their own championships"
  on public.championships for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own championships" on public.championships;
create policy "Users can delete their own championships"
  on public.championships for delete
  to authenticated
  using (auth.uid() = user_id);

grant select on public.championships to anon, authenticated;
grant insert, update, delete on public.championships to authenticated;
revoke insert, update, delete on public.championships from anon, public;

create table if not exists public.championship_registrations (
  id uuid primary key default gen_random_uuid(),
  championship_id text not null references public.championships (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  team_name text not null check (length(trim(team_name)) between 1 and 60),
  player_one text,
  player_two text,
  created_at timestamptz not null default now()
);

alter table public.championship_registrations
  alter column player_one drop not null,
  alter column player_two drop not null;

alter table public.championship_registrations
  drop constraint if exists championship_registrations_championship_id_user_id_key;

create unique index if not exists championship_registrations_unique_team
  on public.championship_registrations (championship_id, lower(team_name));

alter table public.championship_registrations enable row level security;

drop policy if exists "Anyone can view championship registrations" on public.championship_registrations;
create policy "Anyone can view championship registrations"
  on public.championship_registrations for select
  to anon, authenticated
  using (true);

drop policy if exists "Logged in users can register" on public.championship_registrations;
create policy "Logged in users can register"
  on public.championship_registrations for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.championships c
      where c.id = championship_id
        and c.data ->> 'inscricoesAbertas' is distinct from 'false'
    )
  );

drop policy if exists "Users can cancel or organizers can reject registrations" on public.championship_registrations;
create policy "Users can cancel or organizers can reject registrations"
  on public.championship_registrations for delete
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1
      from public.championships c
      where c.id = championship_id
        and c.user_id = auth.uid()
    )
  );

grant select on public.championship_registrations to anon, authenticated;
grant insert, delete on public.championship_registrations to authenticated;
revoke insert, update, delete on public.championship_registrations from anon, public;
