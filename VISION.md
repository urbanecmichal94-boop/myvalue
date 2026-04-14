# Myvaly — Produktová vize

> Název: **Myvaly** (zkratka z "my value"), maskot = mýval.

---

## Co je Myvaly

Modulární osobní finanční tracker zaměřený primárně na CZ/SK trh, s výhledem na EU a USA. Uživatel si sestaví dashboard z modulů, které potřebuje.

---

## Moduly (roadmapa)

| Modul | Stav | Popis |
|---|---|---|
| **A) Portfolio** | ✅ Hotovo (základy) | Akcie, ETF, zlato, crypto, ostatní — online trackování cen |
| **B) Cashflow** | ✅ Hotovo (základy) | Příjmy, výdaje, frekvence, rezerva v měsících/dnech |
| **C) Nemovitosti** | ⏳ Plánováno | Hodnoty nemovitostí, cashflow, hypotéky |
| **D) Makro/Mikro ekonomika** | ⏳ Plánováno | Inflace, HDP, nezaměstnanost, nájmy, úrokové swapy |
| **E) Mini aplikace** | ⏳ Plánováno | Hypoteční kalkulačka, výpočet mezd atd. |

---

## Dashboard

- Upravovatelný — uživatel si volí které widgety (z modulů) vidí a v jakém pořadí
- Každý modul přispívá svými widgety do dashboardu
- Technicky: systém registrace widgetů + uložené preference per uživatel

---

## Regiony a lokalizace

Aplikace bude regionálně přizpůsobitelná:

- **Primární trh:** CZ + SK
- **Výhled:** EU, USA
- Region ovlivňuje: jaké makro indikátory se zobrazují, měna, daňové výpočty, presety kategorií

### i18n — klíčový technický požadavek

**Žádné hardcoded texty v kódu.** Každý viditelný string musí být parametr odkazující na jazykový soubor.

```
// ŠPATNĚ
<button>Přidat položku</button>

// SPRÁVNĚ
<button>{t('cashflow.addItem')}</button>
```

Technologie: `next-intl`. Default locale: `cs`.

---

## Uživatelé a přístup

- Registrace/přihlášení přes Supabase Auth (email + heslo, OAuth)
- Členství/plány: v budoucnu různé úrovně přístupu k modulům
- Data uložená per-user v Supabase PostgreSQL (Row Level Security)
- Ceny aktiv: server-side cache → jeden request na Yahoo/CoinGecko sdílený mezi všemi uživateli

---

## Bezpečnost

- Supabase RLS — každý uživatel vidí jen svá data na úrovni DB
- Next.js middleware — ochrana tras, ověření session
- Ceny fetchované server-side (žádné API klíče v prohlížeči)
- HTTPS, Vercel/Railway hosting

---

## Aktuální technický dluh (priorita před dalšími moduly)

### 1. i18n — NEJVYŠŠÍ PRIORITA
V kódu jsou stovky hardcoded českých stringů. Čím déle přidáváme funkce bez i18n, tím dražší bude přechod.

**Plán:**
1. Nainstalovat `next-intl`
2. Vytvořit `messages/cs.json` se všemi texty
3. Nahradit hardcoded stringy za `t('klic')`
4. Cashflow presety (kategorie) přesunout do lokalizovatelného obsahu

### 2. Auth + backend
Přechod z localStorage na Supabase:
1. Nastavit Supabase projekt + `.env`
2. Přidat auth (přihlašovací stránka, middleware)
3. Migrovat storage vrstvu (localStorage → async Supabase volání)

### 3. Modulární dashboard
Až bude auth hotový, implementovat systém widgetů.

---

## Co teď NEDĚLAT

- Nepřidávat nové moduly (C, D, E) dokud není i18n a auth hotové
- Nepsat další české hardcoded texty
- Neřešit membership/plány dokud není základní auth

---

## Spuštění projektu

```bash
cd portfolio-tracker
npm run dev
# http://localhost:3000
```

*Poslední aktualizace: 2026-03-31*
