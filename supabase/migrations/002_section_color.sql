-- Add optional custom color to sections
alter table sections add column if not exists color text;
