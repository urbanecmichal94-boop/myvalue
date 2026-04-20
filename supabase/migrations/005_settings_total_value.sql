-- Přidat sloupce pro filtrování sekcí na dashboardu
alter table settings
  add column if not exists total_value_section_ids uuid[] not null default '{}';

-- Přidat cash_accounts a cash_balance_history pokud ještě nebyly vytvořeny
-- (migrace 004_cash.sql musí být spuštěna před touto)
