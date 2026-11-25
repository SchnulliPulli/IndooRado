-- VeloVerse Online: Datenbankschema für Supabase (Postgres)
-- Einmal im Supabase-Dashboard unter "SQL Editor" ausführen. Kann gefahrlos erneut ausgeführt werden.

-- ---------- Profile und Rollen ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  display_name text not null default 'Fahrer' check (char_length(display_name) between 1 and 40),
  role text not null default 'user' check (role in ('user', 'admin', 'banned')),
  ftp int, weight_kg numeric(5,1),
  avatar jsonb not null default '{}'::jsonb,       -- Farben und Zubehör für die 3D-Figur der anderen
  level int not null default 1,
  public_profile boolean not null default true,     -- in Bestenlisten und Live-Liste sichtbar
  created_at timestamptz not null default now(),
  last_seen timestamptz
);

-- Neues Konto -> Profil anlegen
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name) values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1), 'Fahrer')) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Admin = Rolle admin UND mit zweitem Faktor angemeldet (aal2)
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') and coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2';
$$;
create or replace function public.is_banned() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'banned');
$$;

alter table public.profiles enable row level security;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (public_profile or id = auth.uid() or public.is_admin());
drop policy if exists "profiles update own" on public.profiles;
create policy "profiles update own" on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));
drop policy if exists "profiles admin" on public.profiles;
create policy "profiles admin" on public.profiles for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Fahrten (Zusammenfassung; Messreihen liegen im Storage) ----------
create table if not exists public.rides (
  id text not null, user_id uuid not null references auth.users on delete cascade default auth.uid(),
  started_at timestamptz not null, route_id text, route_name text, title text,
  distance_m int, duration_s int, ascent_m int, avg_w int, np_w int, tss numeric(6,1), xp int,
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists rides_route_idx on public.rides (route_id, duration_s);
alter table public.rides enable row level security;
drop policy if exists "rides own" on public.rides;
create policy "rides own" on public.rides for all using (user_id = auth.uid() and not public.is_banned()) with check (user_id = auth.uid() and not public.is_banned());
drop policy if exists "rides admin read" on public.rides;
create policy "rides admin read" on public.rides for select using (public.is_admin());

-- Bestenliste je Strecke (nur öffentliche Profile, ohne Einblick in fremde Fahrten)
create or replace function public.route_leaderboard(p_route text, p_limit int default 20)
returns table (display_name text, best_s int, rides bigint) language sql stable security definer set search_path = public as $$
  select p.display_name, min(r.duration_s)::int, count(*) from public.rides r join public.profiles p on p.id = r.user_id
  where r.route_id = p_route and p.public_profile and p.role <> 'banned' and r.duration_s > 0
  group by p.display_name order by 2 limit least(p_limit, 100);
$$;

-- ---------- Ankündigungen (vom Admin, auf der Startseite) ----------
create table if not exists public.announcements (
  id bigint generated always as identity primary key,
  title text not null, body text not null default '', level text not null default 'info' check (level in ('info', 'event', 'warn')),
  visible_from timestamptz not null default now(), visible_until timestamptz,
  created_by uuid references auth.users default auth.uid(), created_at timestamptz not null default now()
);
alter table public.announcements enable row level security;
drop policy if exists "ann read" on public.announcements;
create policy "ann read" on public.announcements for select using (visible_from <= now() and (visible_until is null or visible_until > now()) or public.is_admin());
drop policy if exists "ann admin" on public.announcements;
create policy "ann admin" on public.announcements for all using (public.is_admin()) with check (public.is_admin());

-- ---------- Admin-Statistik ----------
create or replace function public.admin_stats() returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'nur für Admins'; end if;
  return jsonb_build_object(
    'users', (select count(*) from public.profiles),
    'active7', (select count(*) from public.profiles where last_seen > now() - interval '7 days'),
    'rides', (select count(*) from public.rides),
    'rides7', (select count(*) from public.rides where started_at > now() - interval '7 days'),
    'km', (select coalesce(sum(distance_m), 0) / 1000 from public.rides),
    'banned', (select count(*) from public.profiles where role = 'banned'));
end $$;
-- Daten eines Nutzers löschen (das Auth-Konto selbst löscht nur der Service-Key, siehe docs/ONLINE.md)
create or replace function public.admin_wipe_user(p_user uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'nur für Admins'; end if;
  delete from public.rides where user_id = p_user;
  delete from storage.objects where bucket_id = 'vault' and (storage.foldername(name))[1] = p_user::text;
end $$;

-- ---------- Storage: Datenpaket und Fotos je Nutzer im eigenen Ordner ----------
insert into storage.buckets (id, name, public) values ('vault', 'vault', false) on conflict (id) do nothing;
drop policy if exists "vault own" on storage.objects;
create policy "vault own" on storage.objects for all
  using (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned())
  with check (bucket_id = 'vault' and (storage.foldername(name))[1] = auth.uid()::text and not public.is_banned());
