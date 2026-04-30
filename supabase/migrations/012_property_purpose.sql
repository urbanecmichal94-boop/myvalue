alter table properties
  add column if not exists purpose           text not null default 'rental',
  add column if not exists estimated_rent    numeric,
  add column if not exists rent_increase_rate numeric not null default 4;

-- Migrate existing data from is_rental boolean
update properties
  set purpose = case when is_rental then 'rental' else 'own' end
  where purpose = 'rental';
