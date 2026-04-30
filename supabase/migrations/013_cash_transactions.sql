-- Přidat typ obálky k cash účtům
alter table cash_accounts
  add column if not exists envelope_type text not null default 'general';

-- Přidat typ transakce k historii zůstatků
-- 'balance' = absolutní snapshot (legacy + počáteční stav)
-- 'deposit'  = vklad (delta +)
-- 'withdrawal' = výběr (delta -)
alter table cash_balance_history
  add column if not exists type text not null default 'balance';
