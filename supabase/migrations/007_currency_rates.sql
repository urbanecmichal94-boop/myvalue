-- ============================================================
-- Myvaly — Monthly currency rates (shared across all users)
-- Spustit v Supabase SQL editoru (Database → SQL Editor)
-- ============================================================

create table if not exists currency_rates (
  month       date        primary key,  -- vždy 1. den měsíce (2026-04-01)
  rates       jsonb       not null,     -- { "USD": 1.08, "CAD": 1.47, ... } vůči EUR
  fetched_at  timestamptz not null default now()
);

-- Index pro řazení (nejnovější měsíc first)
create index if not exists currency_rates_month_idx on currency_rates (month desc);

-- Veřejné čtení — kurzy nejsou citlivá data
alter table currency_rates enable row level security;

create policy "Anyone can read currency rates"
  on currency_rates for select
  using (true);

-- Zápis pouze přes service_role (server-side API route)
create policy "Service role can insert currency rates"
  on currency_rates for insert
  with check (true);

create policy "Service role can update currency rates"
  on currency_rates for update
  using (true);
