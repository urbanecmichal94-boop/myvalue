import type { Currency } from './index'

// ─── Základní typy ────────────────────────────────────────────────────────────

export type CashflowFrequency = 'monthly' | 'annual' | 'quarterly' | 'weekly'
export type CashflowNodeType  = 'expense' | 'income'

export interface CashflowCategory {
  id: string
  name: string
  parent_id: string | null   // null = top-level
  type: CashflowNodeType
  is_preset: boolean
  item_suggestions?: string[] // nabídka názvů při přidávání položek
  order: number
  created_at: string
}

export interface CashflowItem {
  id: string
  category_id: string
  name: string
  currency: Currency
  frequency: CashflowFrequency
  due_date?: string           // YYYY-MM-DD (volitelné datum splatnosti)
  notes?: string
  created_at: string
}

export interface CashflowItemHistory {
  id: string
  item_id: string
  amount: number
  valid_from: string          // YYYY-MM-DD — od kdy platí tato částka
  notes?: string
  created_at: string
}

// ─── Popisky ─────────────────────────────────────────────────────────────────

export const FREQUENCY_LABELS: Record<CashflowFrequency, string> = {
  monthly:   'Měsíčně',
  annual:    'Ročně',
  quarterly: 'Čtvrtletně',
  weekly:    'Týdně',
}

// Koeficient pro převod na měsíční ekvivalent
export const FREQUENCY_TO_MONTHLY: Record<CashflowFrequency, number> = {
  monthly:   1,
  annual:    1 / 12,
  quarterly: 1 / 3,
  weekly:    52 / 12,
}

// ─── Preset struktura ─────────────────────────────────────────────────────────

interface PresetChildDef {
  name: string
  itemSuggestions?: string[]
}

interface PresetCategoryDef {
  name: string
  type: CashflowNodeType
  itemSuggestions?: string[]  // položky jdou přímo sem (Bydlení)
  children?: PresetChildDef[] // nebo přes podkategorie (Fixní, Variabilní)
}

export const CASHFLOW_PRESETS: PresetCategoryDef[] = [
  // ── Fixní výdaje ───────────────────────────────────────────────────────────
  {
    name: 'Fixní výdaje',
    type: 'expense',
    children: [
      {
        name: 'Pojistky',
        itemSuggestions: ['Povinné ručení', 'Havarijní pojištění', 'Životní pojistka', 'Úrazové pojištění', 'Cestovní pojištění (roční)'],
      },
      {
        name: 'Auto',
        itemSuggestions: ['Dálniční známka', 'Leasing / splátka', 'STK & servis', 'Parkování (měsíční)'],
      },
      {
        name: 'Předplatná & Streaming',
        itemSuggestions: ['Spotify', 'Netflix', 'Apple TV', 'Disney+', 'HBO Max', 'YouTube Premium', 'Amazon Prime', 'Microsoft 365', 'ChatGPT', 'Claude', 'Rozhlas + TV poplatek'],
      },
      {
        name: 'Mobilní & Internet',
        itemSuggestions: ['Mobilní tarif', 'Mobilní tarif 2 (partner/dítě)', 'Internet doma'],
      },
      {
        name: 'Zdraví & Sport',
        itemSuggestions: ['Gym členství', 'Permanentka', 'Pravidelné léky', 'Bazén / sauna', 'Masáže (pravidelné)'],
      },
      {
        name: 'Vzdělávání',
        itemSuggestions: ['Škola / Školka', 'Kurzy & vzdělávání', 'Jazyková škola', 'Online platforma (Udemy, roční)', 'Audiolibrix'],
      },
      {
        name: 'Děti',
        itemSuggestions: ['Kroužky', 'Kapesné', 'Obědy ve škole'],
      },
      {
        name: 'Finanční závazky',
        itemSuggestions: ['Stavební spoření', 'Penzijní připojištění', 'Splátka půjčky / úvěru'],
      },
      {
        name: 'Mazlíčci',
        itemSuggestions: ['Krmivo (pravidelné)', 'Pojistka mazlíčka', 'Veterinář (pravidelný)'],
      },
    ],
  },

  // ── Bydlení — položky jdou přímo pod tuto kategorii (2 úrovně) ────────────
  {
    name: 'Bydlení',
    type: 'expense',
    itemSuggestions: [
      'Nájem', 'Hypotéka', 'Elektřina', 'Plyn', 'Vodné & stočné',
      'Teplo / dálkové vytápění', 'Fond oprav', 'Odvoz odpadu',
      'Poplatky SVJ', 'Daň z nemovitosti', 'Pojištění domácnosti',
    ],
  },

  // ── Variabilní výdaje ──────────────────────────────────────────────────────
  {
    name: 'Variabilní výdaje',
    type: 'expense',
    children: [
      {
        name: 'Jídlo & Drogerie',
        itemSuggestions: ['Jídlo (supermarket)', 'Drogerie & Hygiena'],
      },
      {
        name: 'Doprava',
        itemSuggestions: ['Benzín / Nafta', 'Mýtné', 'Mytí auta', 'Ad-hoc parkování'],
      },
      {
        name: 'Zdraví',
        itemSuggestions: ['Zubař', 'Lékař', 'Léky (nepravidelné)'],
      },
      {
        name: 'Volný čas',
        itemSuggestions: ['Restaurace & Kavárny', 'Kultura & Zábava', 'Sportovní vstupy', 'Cestování'],
      },
      {
        name: 'Osobní',
        itemSuggestions: ['Oblečení', 'Elektronika', 'Dárky & Ostatní', 'Tabak'],
      },
      {
        name: 'Domácnost',
        itemSuggestions: ['Opravy & Údržba', 'Vybavení domácnosti'],
      },
    ],
  },

  // ── Příjmy ─────────────────────────────────────────────────────────────────
  {
    name: 'Příjmy',
    type: 'income',
    children: [
      {
        name: 'Zaměstnání',
        itemSuggestions: ['Čistá mzda', 'Bonus / 13. plat'],
      },
      {
        name: 'OSVČ & Freelance',
        itemSuggestions: ['Fakturace', 'Vedlejší příjem'],
      },
      {
        name: 'Pronájem',
        itemSuggestions: ['Příjem z pronájmu'],
      },
      {
        name: 'Dividendy',
        itemSuggestions: ['Dividendy (manuálně)'],
      },
      {
        name: 'Ostatní příjmy',
        itemSuggestions: ['Vrácení přeplatku daní', 'Prodej věcí', 'Rodičovský příspěvek', 'Stipendium'],
      },
    ],
  },
]

// ─── Runtime lookup: návrhy vždy z kódu, ne z DB ─────────────────────────────

const _suggestionsMap = new Map<string, string[]>()
for (const preset of CASHFLOW_PRESETS) {
  if (preset.itemSuggestions?.length) _suggestionsMap.set(preset.name, preset.itemSuggestions)
  for (const child of preset.children ?? []) {
    if (child.itemSuggestions?.length) _suggestionsMap.set(child.name, child.itemSuggestions)
  }
}

/** Vrátí aktuální návrhy položek pro preset kategorii podle jména. */
export function getPresetSuggestions(name: string): string[] | undefined {
  const s = _suggestionsMap.get(name)
  return s && s.length > 0 ? s : undefined
}
