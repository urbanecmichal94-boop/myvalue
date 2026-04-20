-- Sdílená cache historických měsíčních cen (tržní data, ne uživatelská)
-- Bez RLS — data jsou veřejná a neosobní

create table price_history (
  ticker      text          not null,
  month       text          not null,  -- 'YYYY-MM'
  price       numeric(18,8) not null,
  currency    text          not null default 'USD',
  updated_at  timestamptz   not null default now(),
  primary key (ticker, month)
);

-- Tržní data nejsou citlivá — RLS nepotřebujeme
alter table price_history disable row level security;

create index idx_price_history_ticker on price_history(ticker);
create index idx_price_history_month  on price_history(month);
