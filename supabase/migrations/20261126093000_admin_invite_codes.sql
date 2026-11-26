begin;

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

commit;
