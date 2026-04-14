-- ============================================================
-- Myvaly — Initial Schema
-- Spustit v Supabase SQL editoru (Database → SQL Editor)
-- ============================================================

-- ─── Extensions ──────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ─── Enums ───────────────────────────────────────────────────────────────────

create type asset_type as enum (
  'stock', 'etf', 'crypto', 'commodity',
  'real_estate', 'savings', 'pension', 'bond', 'p2p', 'custom'
);

create type section_template as enum (
  'stocks', 'crypto', 'commodity', 'real_estate',
  'savings', 'pension', 'bond', 'p2p', 'custom'
);

create type transaction_type as enum ('buy', 'sell', 'dividend', 'update');

create type currency_code as enum ('CZK', 'EUR', 'USD');

create type cashflow_frequency as enum ('monthly', 'annual', 'quarterly', 'weekly');

create type cashflow_node_type as enum ('income', 'expense');

create type property_type as enum ('byt', 'dum', 'pozemek', 'komercni', 'garaz', 'jine');

-- ─── Sections ────────────────────────────────────────────────────────────────

create table sections (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  template    section_template not null,
  created_at  timestamptz not null default now()
);

-- ─── Assets ──────────────────────────────────────────────────────────────────

create table assets (
  id                  uuid primary key default uuid_generate_v4(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  section_id          uuid not null references sections(id) on delete cascade,
  type                asset_type not null,
  name                text not null,
  ticker              text,
  currency            currency_code not null default 'CZK',
  commodity_unit      text,                 -- 'g' nebo 'oz'
  commodity_form      text,                 -- 'physical' | 'etf' | 'futures'
  notes               text,
  sector              text,
  industry            text,
  country             text,
  tradingview_symbol  text,
  created_at          timestamptz not null default now()
);

-- ─── Transactions ─────────────────────────────────────────────────────────────

create table transactions (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  asset_id    uuid not null references assets(id) on delete cascade,
  date        date not null,
  type        transaction_type not null,
  quantity    numeric not null default 0,
  price       numeric not null default 0,
  currency    currency_code not null default 'CZK',
  notes       text,
  created_at  timestamptz not null default now()
);

-- ─── Settings ────────────────────────────────────────────────────────────────

create table settings (
  user_id                   uuid primary key references auth.users(id) on delete cascade,
  display_currency          currency_code not null default 'CZK',
  show_portfolio_chart      boolean not null default true,
  show_performance_widget   boolean not null default true,
  performance_section_ids   uuid[] not null default '{}',
  column_config             jsonb not null default '[]',
  updated_at                timestamptz not null default now()
);

-- ─── Portfolio snapshots ──────────────────────────────────────────────────────

create table portfolio_snapshots (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  value       numeric not null,
  currency    currency_code not null,
  unique (user_id, date)
);

-- ─── Cashflow categories ──────────────────────────────────────────────────────

create table cashflow_categories (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  parent_id         uuid references cashflow_categories(id) on delete cascade,
  type              cashflow_node_type not null,
  is_preset         boolean not null default false,
  item_suggestions  text[],
  "order"           integer not null default 0,
  created_at        timestamptz not null default now()
);

-- ─── Cashflow items ───────────────────────────────────────────────────────────

create table cashflow_items (
  id           uuid primary key default uuid_generate_v4(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  category_id  uuid not null references cashflow_categories(id) on delete cascade,
  name         text not null,
  currency     currency_code not null default 'CZK',
  frequency    cashflow_frequency not null default 'monthly',
  due_date     date,
  notes        text,
  created_at   timestamptz not null default now()
);

-- ─── Cashflow item history ────────────────────────────────────────────────────

create table cashflow_item_history (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  item_id     uuid not null references cashflow_items(id) on delete cascade,
  amount      numeric not null,
  valid_from  date not null,
  notes       text,
  created_at  timestamptz not null default now()
);

-- ─── Properties ───────────────────────────────────────────────────────────────
-- Nested struktury (mortgage, valuations, rental_history) uloženy jako JSONB

create table properties (
  id                uuid primary key default uuid_generate_v4(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null,
  address           text,
  type              property_type not null default 'byt',
  purchase_date     date not null,
  purchase_price    numeric not null default 0,
  purchase_costs    numeric not null default 0,
  current_value     numeric not null default 0,
  last_valued_at    date not null,
  mortgage          jsonb,          -- PropertyMortgage | null
  is_rental         boolean not null default false,
  rental_history    jsonb not null default '[]',    -- RentalRecord[]
  valuation_history jsonb not null default '[]',    -- PropertyValuation[]
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ============================================================
-- Indexy
-- ============================================================

create index idx_sections_user       on sections(user_id);
create index idx_assets_user         on assets(user_id);
create index idx_assets_section      on assets(section_id);
create index idx_transactions_user   on transactions(user_id);
create index idx_transactions_asset  on transactions(asset_id);
create index idx_transactions_date   on transactions(date);
create index idx_cf_categories_user  on cashflow_categories(user_id);
create index idx_cf_categories_parent on cashflow_categories(parent_id);
create index idx_cf_items_user       on cashflow_items(user_id);
create index idx_cf_items_category   on cashflow_items(category_id);
create index idx_cf_history_item     on cashflow_item_history(item_id);
create index idx_snapshots_user_date on portfolio_snapshots(user_id, date);
create index idx_properties_user     on properties(user_id);

-- ============================================================
-- Row Level Security
-- ============================================================

alter table sections               enable row level security;
alter table assets                 enable row level security;
alter table transactions           enable row level security;
alter table settings               enable row level security;
alter table portfolio_snapshots    enable row level security;
alter table cashflow_categories    enable row level security;
alter table cashflow_items         enable row level security;
alter table cashflow_item_history  enable row level security;
alter table properties             enable row level security;

-- Makro: pro každou tabulku vytvoří 4 policy (select/insert/update/delete)
-- Každý uživatel vidí a mění jen svoje řádky

-- sections
create policy "sections: own rows" on sections
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- assets
create policy "assets: own rows" on assets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- transactions
create policy "transactions: own rows" on transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- settings
create policy "settings: own rows" on settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- portfolio_snapshots
create policy "snapshots: own rows" on portfolio_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cashflow_categories
create policy "cf_categories: own rows" on cashflow_categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cashflow_items
create policy "cf_items: own rows" on cashflow_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cashflow_item_history
create policy "cf_history: own rows" on cashflow_item_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- properties
create policy "properties: own rows" on properties
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Trigger: auto-create settings při registraci uživatele
-- ============================================================

create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure handle_new_user();
