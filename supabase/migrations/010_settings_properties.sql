alter table settings
  add column if not exists include_properties_in_dashboard boolean not null default true;
