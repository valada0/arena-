alter table public.championship_registrations
  alter column player_one drop not null,
  alter column player_two drop not null;

alter table public.championship_registrations
  drop constraint if exists championship_registrations_team_name_check;

alter table public.championship_registrations
  add constraint championship_registrations_team_name_check
  check (length(trim(team_name)) between 1 and 60);
