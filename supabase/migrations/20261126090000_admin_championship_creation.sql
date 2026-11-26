begin;

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

do $$
begin
  if not exists (
    select 1 from auth.users
    where lower(email) = lower('m4t.valada0@gmail.com')
  ) then
    raise exception 'Create the Supabase Auth account for m4t.valada0@gmail.com before applying this migration.';
  end if;
end;
$$;

insert into public.site_admins (user_id)
select id
from auth.users
where lower(email) = lower('m4t.valada0@gmail.com')
on conflict (user_id) do nothing;

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

commit;
