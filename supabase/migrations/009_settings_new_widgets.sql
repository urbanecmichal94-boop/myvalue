alter table settings
  add column if not exists show_winners_losers  boolean not null default false,
  add column if not exists show_market_overview boolean not null default false;
