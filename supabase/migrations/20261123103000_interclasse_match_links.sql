begin;

create table if not exists public.interclasse_match_links (
  championship_id text not null references public.championships (id) on delete cascade,
  game_id text not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  api_score_id text unique,
  creation_state text not null check (
    creation_state in ('creating', 'ambiguous', 'failed', 'created')
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (championship_id, game_id)
);

alter table public.interclasse_match_links enable row level security;
revoke all on public.interclasse_match_links from anon, public;
grant select, insert, update on public.interclasse_match_links to authenticated;

drop policy if exists "Owners manage their Interclasse match links"
  on public.interclasse_match_links;
create policy "Owners manage their Interclasse match links"
  on public.interclasse_match_links
  for all
  to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1
      from public.championships c
      where c.id = championship_id
        and c.user_id = auth.uid()
    )
  )
  with check (
    auth.uid() = user_id
    and exists (
      select 1
      from public.championships c
      where c.id = championship_id
        and c.user_id = auth.uid()
    )
  );

commit;
