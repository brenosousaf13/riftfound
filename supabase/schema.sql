-- RIFTFOUND database schema
-- Execute no SQL Editor do Supabase depois de criar um projeto.

create extension if not exists pgcrypto;

create type public.card_condition as enum ('near_mint', 'excellent', 'good', 'played', 'damaged');
create type public.listing_status as enum ('active', 'reserved', 'sold', 'paused');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (username ~ '^[a-zA-Z0-9_]{3,24}$'),
  display_name text not null,
  avatar_url text,
  city text,
  state text,
  whatsapp text,
  bio text,
  reputation numeric(2,1) not null default 5.0 check (reputation between 0 and 5),
  completed_trades integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cards (
  id text primary key,
  name text not null,
  riftbound_id text not null,
  tcgplayer_id text,
  set_id text,
  set_label text,
  rarity text,
  card_type text,
  domains text[] not null default '{}',
  image_url text,
  payload jsonb not null default '{}',
  synced_at timestamptz not null default now()
);

create table public.delivery_locations (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  address text,
  city text,
  state text,
  available_days smallint[] not null default '{}', -- 0 domingo ... 6 sábado
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null references public.cards(id),
  price_cents integer not null check (price_cents >= 0),
  quantity integer not null default 1 check (quantity > 0),
  condition public.card_condition not null default 'near_mint',
  language text not null default 'pt-BR',
  status public.listing_status not null default 'active',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listing_delivery_locations (
  listing_id uuid not null references public.listings(id) on delete cascade,
  delivery_location_id uuid not null references public.delivery_locations(id) on delete cascade,
  primary key (listing_id, delivery_location_id)
);

create table public.want_items (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  card_id text not null references public.cards(id),
  quantity integer not null default 1 check (quantity > 0),
  max_price_cents integer check (max_price_cents is null or max_price_cents >= 0),
  condition public.card_condition,
  notes text,
  created_at timestamptz not null default now(),
  unique(profile_id, card_id)
);

create table public.saved_listings (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, listing_id)
);

create index listings_active_price_idx on public.listings (card_id, price_cents) where status = 'active';
create index listings_seller_idx on public.listings (seller_id, status);
create index cards_name_idx on public.cards using gin (to_tsvector('simple', name));
create index want_items_profile_idx on public.want_items (profile_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.cards enable row level security;
alter table public.delivery_locations enable row level security;
alter table public.listings enable row level security;
alter table public.listing_delivery_locations enable row level security;
alter table public.want_items enable row level security;
alter table public.saved_listings enable row level security;

create policy "profiles are public" on public.profiles for select using (true);
create policy "users edit own profile" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "cards are public" on public.cards for select using (true);
create policy "authenticated users cache cards" on public.cards for insert to authenticated with check (true);
create policy "authenticated users refresh cards" on public.cards for update to authenticated using (true) with check (true);
create policy "delivery locations are public" on public.delivery_locations for select using (true);
create policy "users manage own delivery locations" on public.delivery_locations for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "active listings are public" on public.listings for select using (status = 'active' or auth.uid() = seller_id);
create policy "users manage own listings" on public.listings for all using (auth.uid() = seller_id) with check (auth.uid() = seller_id);
create policy "listing delivery links are public" on public.listing_delivery_locations for select using (true);
create policy "sellers manage listing delivery links" on public.listing_delivery_locations for all using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid())) with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
create policy "want items are public" on public.want_items for select using (true);
create policy "users manage own wants" on public.want_items for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);
create policy "users manage own saved listings" on public.saved_listings for all using (auth.uid() = profile_id) with check (auth.uid() = profile_id);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
declare
  requested_username text;
begin
  requested_username := coalesce(nullif(new.raw_user_meta_data->>'username', ''), 'player_' || substr(new.id::text, 1, 8));
  if exists (select 1 from public.profiles where username = requested_username) then
    requested_username := left(requested_username, 15) || '_' || substr(new.id::text, 1, 8);
  end if;
  insert into public.profiles (id, username, display_name)
  values (new.id, requested_username, coalesce(new.raw_user_meta_data->>'display_name', 'Novo jogador'));
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();

create or replace view public.marketplace_listings as
select l.*, c.name, c.riftbound_id, c.set_label, c.rarity, c.card_type, c.domains, c.image_url, p.username, p.display_name, p.city, p.state, p.reputation
from public.listings l join public.cards c on c.id = l.card_id join public.profiles p on p.id = l.seller_id
where l.status = 'active' and l.quantity > 0;
