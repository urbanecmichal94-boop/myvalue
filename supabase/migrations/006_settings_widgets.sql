-- Nové widgety přidané na dashboard
alter table settings
  add column if not exists show_allocation_chart boolean not null default true,
  add column if not exists show_reserve_widget   boolean not null default true;
