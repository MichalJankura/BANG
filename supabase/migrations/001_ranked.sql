-- BANG! online: ucty, ranked zapasy, XP, rating, hodnosti.
-- Spusti sa raz v Supabase SQL Editore (je idempotentna, opakovane spustenie nic nerozbije).
--
-- Bezpecnostny model:
--   * Prehliadac sa k databaze nikdy nepripaja. Vola ju len herny server so service_role klucom.
--   * RLS je zapnute na vsetkych tabulkach a nema ziadne politiky => anon/authenticated nevidia nic.
--   * Prava na tabulky su odobrate anon/authenticated; zapisy idu len cez SECURITY DEFINER funkcie,
--     ktore smie spustit iba service_role.

-- ---------- tabulky ----------

create table if not exists public.ranks (
  id        int primary key,
  name      text not null,
  name_en   text not null,
  police_rank text not null,
  min_xp    int  not null unique check (min_xp >= 0),
  icon_key  text not null
);

insert into public.ranks (id, name, name_en, police_rank, min_xp, icon_key) values
  (1,  'Zelenáč z prérie',        'Prairie Greenhorn',         'Strážmajster',     0,     'rank-01-prairie-greenhorn'),
  (2,  'Pomocník šerifa',         'Sheriff''s Helper',         'Nadstrážmajster',  150,   'rank-02-sheriffs-helper'),
  (3,  'Strážnik dostavníkov',    'Stagecoach Guard',          'Podpráporčík',     350,   'rank-03-stagecoach-guard'),
  (4,  'Stopár banditov',         'Outlaw Tracker',            'Práporčík',        650,   'rank-04-outlaw-tracker'),
  (5,  'Zástupca šerifa',         'Deputy Sheriff',            'Nadpráporčík',     1050,  'rank-05-deputy-sheriff'),
  (6,  'Pištoľník zákona',        'Lawman Gunslinger',         'Podporučík',       1600,  'rank-06-lawman-gunslinger'),
  (7,  'Lovec odmien',            'Bounty Hunter',             'Poručík',          2300,  'rank-07-bounty-hunter'),
  (8,  'Ostrý strelec',           'Sharpshooter',              'Nadporučík',       3200,  'rank-08-sharpshooter'),
  (9,  'Veliteľ posádky',         'Garrison Commander',        'Kapitán',          4300,  'rank-09-garrison-commander'),
  (10, 'Okresný maršal',          'County Marshal',            'Major',            5600,  'rank-10-county-marshal'),
  (11, 'Vrchný maršal',           'Chief Marshal',             'Podplukovník',     7200,  'rank-11-chief-marshal'),
  (12, 'Strážca Divokého západu', 'Guardian of the Wild West', 'Plukovník',        9200,  'rank-12-wild-west-guardian'),
  (13, 'Legenda pohraničia',      'Frontier Legend',           'Generál',          12000, 'rank-13-frontier-legend')
on conflict (id) do update set name = excluded.name, name_en = excluded.name_en, police_rank = excluded.police_rank,
  min_xp = excluded.min_xp, icon_key = excluded.icon_key;

create table if not exists public.players (
  id             uuid primary key default gen_random_uuid(),
  nickname       text not null check (char_length(nickname) between 3 and 16 and nickname = btrim(nickname) and nickname !~ '[[:cntrl:]]'),
  password_hash  text not null check (password_hash like 'scrypt$%'),
  preferred_role text not null default 'sheriff' check (preferred_role in ('sheriff', 'deputy', 'outlaw', 'renegade')),
  xp             int  not null default 0 check (xp >= 0),
  rating         int  not null default 1000 check (rating >= 0),
  rank_id        int  not null default 1 references public.ranks (id),
  games_played   int  not null default 0 check (games_played >= 0),
  games_won      int  not null default 0 check (games_won >= 0),
  created_at     timestamptz not null default now(),
  last_login_at  timestamptz
);
create unique index if not exists players_nickname_ci on public.players (lower(nickname));
create index if not exists players_xp_idx on public.players (xp desc);
create index if not exists players_rating_idx on public.players (rating desc);

create table if not exists public.sessions (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  player_id  uuid not null references public.players (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index if not exists sessions_player_idx on public.sessions (player_id);
create index if not exists sessions_expires_idx on public.sessions (expires_at);

create table if not exists public.matches (
  id               uuid primary key,
  room_code        text,
  winning_faction  text not null check (winning_faction in ('sheriff_team', 'outlaws', 'renegade')),
  duration_seconds int  not null check (duration_seconds >= 0),
  player_count     int  not null check (player_count between 2 and 8),
  options          jsonb not null default '{}'::jsonb,
  ended_at         timestamptz not null default now()
);
create index if not exists matches_ended_idx on public.matches (ended_at desc);

create table if not exists public.match_participants (
  id                     uuid primary key default gen_random_uuid(),
  match_id               uuid not null references public.matches (id) on delete cascade,
  player_id              uuid not null references public.players (id) on delete cascade,
  assigned_role          text not null check (assigned_role in ('sheriff', 'deputy', 'outlaw', 'renegade')),
  team                   text not null check (team in ('sheriff_team', 'outlaws', 'renegade')),
  survived_seconds       int  not null default 0 check (survived_seconds >= 0),
  cards_played           int  not null default 0 check (cards_played >= 0),
  damage_dealt           int  not null default 0 check (damage_dealt >= 0),
  bang_hits              int  not null default 0 check (bang_hits >= 0),
  valid_bangs            int  not null default 0 check (valid_bangs >= 0),
  invalid_bangs          int  not null default 0 check (invalid_bangs >= 0),
  dodges_successful      int  not null default 0 check (dodges_successful >= 0),
  dynamite_kills_or_hits int  not null default 0 check (dynamite_kills_or_hits >= 0),
  dynamite_self_exploded boolean not null default false,
  abandoned              boolean not null default false,
  is_winner              boolean not null,
  xp_earned              int  not null check (xp_earned between 0 and 5000),
  xp_breakdown           jsonb not null default '{}'::jsonb,
  xp_before              int  not null,
  rating_before          int  not null,
  rating_delta           int  not null,
  rank_before            int  not null,
  rank_after             int  not null,
  unique (match_id, player_id)
);
create index if not exists participants_player_idx on public.match_participants (player_id);

-- ---------- RLS a prava ----------

alter table public.ranks              enable row level security;
alter table public.players            enable row level security;
alter table public.sessions           enable row level security;
alter table public.matches            enable row level security;
alter table public.match_participants enable row level security;

revoke all on public.ranks, public.players, public.sessions, public.matches, public.match_participants from public, anon, authenticated;

-- ---------- funkcie ----------

create or replace function public._profile(p_id uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', p.id, 'nickname', p.nickname, 'preferredRole', p.preferred_role,
    'xp', p.xp, 'rating', p.rating, 'rankId', p.rank_id,
    'gamesPlayed', p.games_played, 'gamesWon', p.games_won)
  from players p where p.id = p_id;
$$;

create or replace function public._rank_for(p_xp int) returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(id), 1) from ranks where min_xp <= p_xp;
$$;

-- Registracia. Vrati profil, alebo null ak prezyvka uz existuje.
create or replace function public.register_player(p_nickname text, p_hash text, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  insert into players (nickname, password_hash, preferred_role)
  values (p_nickname, p_hash, p_role)
  on conflict do nothing
  returning id into v_id;
  if v_id is null then return null; end if;
  return _profile(v_id);
end $$;

-- Pre overenie hesla na serveri: id a hash (null ak hrac neexistuje).
create or replace function public.login_lookup(p_nickname text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('id', id, 'hash', password_hash) from players where lower(nickname) = lower(p_nickname);
$$;

create or replace function public.create_session(p_player uuid, p_token_hash text, p_days int) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  delete from sessions where expires_at < now();
  insert into sessions (token_hash, player_id, expires_at)
  values (p_token_hash, p_player, now() + make_interval(days => least(greatest(p_days, 1), 90)));
  update players set last_login_at = now() where id = p_player;
  return _profile(p_player);
end $$;

create or replace function public.session_profile(p_token_hash text) returns jsonb
language sql stable security definer set search_path = public as $$
  select _profile(s.player_id) from sessions s where s.token_hash = p_token_hash and s.expires_at > now();
$$;

create or replace function public.delete_session(p_token_hash text) returns void
language sql security definer set search_path = public as $$
  delete from sessions where token_hash = p_token_hash;
$$;

create or replace function public.set_preferred_role(p_player uuid, p_role text) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update players set preferred_role = p_role where id = p_player;
  return _profile(p_player);
end $$;

-- Ulozi ranked zapas. Idempotentne podla match id. Rating (ELO) a hodnost sa pocitaju tu,
-- pod zamkom riadkov hracov. Vrati pre kazdeho hraca stav pred a po.
create or replace function public.record_match(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_match uuid := (p->>'match_id')::uuid;
  v_inserted uuid;
  v_parts jsonb := p->'participants';
  v_n int := jsonb_array_length(p->'participants');
  r record;
  v_opp numeric;
  v_e numeric;
  v_k int;
  v_delta int;
  v_xp int;
  v_new_xp int;
  v_new_rating int;
begin
  if v_n is null or v_n < 2 or v_n > 8 then raise exception 'invalid participants'; end if;
  if (select count(distinct x->>'player_id') from jsonb_array_elements(v_parts) x) <> v_n then
    raise exception 'duplicate participant';
  end if;

  insert into matches (id, room_code, winning_faction, duration_seconds, player_count, options)
  values (v_match, left(p->>'room_code', 8), p->>'winning_faction', greatest(0, (p->>'duration_seconds')::int), v_n,
          coalesce(p->'options', '{}'::jsonb))
  on conflict (id) do nothing
  returning id into v_inserted;

  if v_inserted is not null then
    -- zamok riadkov hracov v pevnom poradi (bez deadlockov medzi subeznymi zapasmi)
    perform 1 from players where id in (select (x->>'player_id')::uuid from jsonb_array_elements(v_parts) x)
      order by id for update;
    if (select count(*) from players where id in (select (x->>'player_id')::uuid from jsonb_array_elements(v_parts) x)) <> v_n then
      raise exception 'unknown player';
    end if;

    drop table if exists _mp;
    create temp table _mp on commit drop as
      select (x->>'player_id')::uuid as player_id, x->>'team' as team, x as j,
             pl.rating as rating, pl.xp as xp, pl.rank_id as rank_id
      from jsonb_array_elements(v_parts) x join players pl on pl.id = (x->>'player_id')::uuid;

    for r in select * from _mp loop
      select avg(o.rating) into v_opp from _mp o where o.team <> r.team;
      v_opp := coalesce(v_opp, 1000);
      v_e := 1 / (1 + power(10::numeric, (v_opp - r.rating) / 400));
      if (r.j->>'is_winner')::boolean then
        v_k := case when r.team = 'renegade' then 48 else 32 end;
        v_delta := round(v_k * (1 - v_e));
      else
        v_k := 16;
        v_delta := round(v_k * (0 - v_e));
      end if;
      v_new_rating := greatest(0, r.rating + v_delta);
      v_delta := v_new_rating - r.rating;
      v_xp := least(greatest((r.j->>'xp_earned')::int, 0), 5000);
      v_new_xp := r.xp + v_xp;

      insert into match_participants (
        match_id, player_id, assigned_role, team, survived_seconds, cards_played, damage_dealt, bang_hits,
        valid_bangs, invalid_bangs, dodges_successful, dynamite_kills_or_hits, dynamite_self_exploded,
        abandoned, is_winner, xp_earned, xp_breakdown, xp_before, rating_before, rating_delta, rank_before, rank_after)
      values (
        v_match, r.player_id, r.j->>'assigned_role', r.team,
        greatest(0, (r.j->>'survived_seconds')::int), greatest(0, (r.j->>'cards_played')::int),
        greatest(0, (r.j->>'damage_dealt')::int), greatest(0, (r.j->>'bang_hits')::int),
        greatest(0, (r.j->>'valid_bangs')::int), greatest(0, (r.j->>'invalid_bangs')::int),
        greatest(0, (r.j->>'dodges_successful')::int), greatest(0, (r.j->>'dynamite_kills_or_hits')::int),
        coalesce((r.j->>'dynamite_self_exploded')::boolean, false), coalesce((r.j->>'abandoned')::boolean, false),
        (r.j->>'is_winner')::boolean, v_xp, coalesce(r.j->'xp_breakdown', '{}'::jsonb),
        r.xp, r.rating, v_delta, r.rank_id, _rank_for(v_new_xp));

      update players set
        xp = v_new_xp,
        rating = v_new_rating,
        rank_id = _rank_for(v_new_xp),
        games_played = games_played + 1,
        games_won = games_won + case when (r.j->>'is_winner')::boolean then 1 else 0 end
      where id = r.player_id;
    end loop;
  end if;

  return jsonb_build_object('match_id', v_match, 'results', (
    select jsonb_agg(jsonb_build_object(
      'player_id', mp.player_id,
      'xp_before', mp.xp_before, 'xp_after', mp.xp_before + mp.xp_earned, 'xp_earned', mp.xp_earned,
      'rating_before', mp.rating_before, 'rating_after', mp.rating_before + mp.rating_delta, 'rating_delta', mp.rating_delta,
      'rank_before', mp.rank_before, 'rank_after', mp.rank_after, 'is_winner', mp.is_winner))
    from match_participants mp where mp.match_id = v_match));
end $$;

create or replace function public.leaderboard(p_limit int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x), '[]'::jsonb) from (
    select nickname, xp, rating, rank_id as "rankId", games_played as "gamesPlayed", games_won as "gamesWon"
    from players order by xp desc, rating desc limit least(greatest(p_limit, 1), 100)
  ) x;
$$;

-- Funkcie smie volat iba service_role (herny server).
do $$
declare f text;
begin
  foreach f in array array[
    'public._profile(uuid)', 'public._rank_for(int)', 'public.register_player(text,text,text)',
    'public.login_lookup(text)', 'public.create_session(uuid,text,int)', 'public.session_profile(text)',
    'public.delete_session(text)', 'public.set_preferred_role(uuid,text)', 'public.record_match(jsonb)',
    'public.leaderboard(int)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
