-- Hotovostní účty uživatele (spořicí účet, hotovost, ...)
create table cash_accounts (
  id          uuid          primary key default uuid_generate_v4(),
  user_id     uuid          not null references auth.users(id) on delete cascade,
  section_id  uuid          not null references sections(id) on delete cascade,
  name        text          not null,
  currency    currency_code not null default 'CZK',
  note        text,
  created_at  timestamptz   not null default now()
);

-- Historie zůstatků — každý záznam = ruční zadání nového stavu
create table cash_balance_history (
  id          uuid          primary key default uuid_generate_v4(),
  user_id     uuid          not null references auth.users(id) on delete cascade,
  account_id  uuid          not null references cash_accounts(id) on delete cascade,
  amount      numeric(18,2) not null,
  date        date          not null,
  note        text,
  created_at  timestamptz   not null default now()
);

create index idx_cash_accounts_user    on cash_accounts(user_id);
create index idx_cash_accounts_section on cash_accounts(section_id);
create index idx_cash_balance_account  on cash_balance_history(account_id);
create index idx_cash_balance_date     on cash_balance_history(date);

alter table cash_accounts         enable row level security;
alter table cash_balance_history  enable row level security;

create policy "cash_accounts: own rows" on cash_accounts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "cash_balance_history: own rows" on cash_balance_history
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
