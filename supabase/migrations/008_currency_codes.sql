-- Rozšíření currency_code enumu o všechny podporované měny
-- ALTER TYPE ADD VALUE nelze v transakci — spustit samostatně

alter type currency_code add value if not exists 'GBP';
alter type currency_code add value if not exists 'CAD';
alter type currency_code add value if not exists 'CHF';
alter type currency_code add value if not exists 'AUD';
alter type currency_code add value if not exists 'JPY';
alter type currency_code add value if not exists 'HKD';
alter type currency_code add value if not exists 'NOK';
alter type currency_code add value if not exists 'SEK';
alter type currency_code add value if not exists 'DKK';
alter type currency_code add value if not exists 'SGD';
alter type currency_code add value if not exists 'PLN';
