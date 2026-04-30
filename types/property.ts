// ─── Typy pro modul Nemovitosti ───────────────────────────────────────────────

export type PropertyType = 'byt' | 'dum' | 'pozemek' | 'komercni' | 'garaz' | 'jine'

export type PropertyPurpose = 'own' | 'rental'

export const PROPERTY_PURPOSE_LABELS: Record<PropertyPurpose, string> = {
  own:    'Vlastní bydlení',
  rental: 'Investiční / pronájem',
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  byt:      'Byt',
  dum:      'Dům',
  pozemek:  'Pozemek',
  komercni: 'Komerční',
  garaz:    'Garáž',
  jine:     'Jiné',
}

export const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] =
  (Object.entries(PROPERTY_TYPE_LABELS) as [PropertyType, string][]).map(([value, label]) => ({ value, label }))

// ─── Hypotéka ─────────────────────────────────────────────────────────────────

export interface PropertyMortgage {
  principal:             number   // původní výše hypotéky (Kč)
  interestRate:          number   // % p.a.
  startDate:             string   // YYYY-MM-DD — podpis smlouvy
  termYears:             number   // splatnost v letech
  drawdownStartDate?:    string   // YYYY-MM-DD — první čerpání (od kdy teče úrok)
  drawdownCompleteDate?: string   // YYYY-MM-DD — dočerpání (od kdy běží plná anuita)
  fixationEndDate?:      string   // YYYY-MM-DD — konec fixace
}

// ─── Ocenění ─────────────────────────────────────────────────────────────────

export interface PropertyValuation {
  id:    string
  date:  string   // YYYY-MM-DD
  value: number   // Kč
  note?: string
}

// ─── Záznam pronájmu ─────────────────────────────────────────────────────────

export interface RentalRecord {
  id:           string
  startDate:    string   // YYYY-MM-DD — od kdy platí tyto podmínky
  rentMonthly:  number   // hrubý nájem (Kč/měs)
  occupancyPct: number   // obsazenost 0–100
  opexMonthly:  number   // správa + údržba + pojištění (Kč/měs)
  note?:        string
}

// ─── Nemovitost ───────────────────────────────────────────────────────────────

export interface Property {
  id:           string
  name:         string
  address?:     string
  type:         PropertyType

  // Pořízení
  purchaseDate:  string   // YYYY-MM-DD
  purchasePrice: number   // Kč
  purchaseCosts: number   // Kč (daň z nabytí 4%, RK, notář...)

  // Aktuální hodnota
  currentValue:  number   // Kč — zadáno ručně
  lastValuedAt:  string   // YYYY-MM-DD

  // Hypotéka (volitelná)
  mortgage?: PropertyMortgage

  // Účel nemovitosti
  purpose:    PropertyPurpose  // 'own' | 'rental'
  isRental:   boolean          // computed from purpose for compatibility

  // Vlastní bydlení — porovnání s nájmem
  estimatedRent?:    number   // odhadovaný měsíční nájem při koupi (Kč/měs)
  rentIncreaseRate?: number   // roční nárůst nájmu % (default 4)

  // Pronájem (volitelný)
  rentalHistory:  RentalRecord[]   // záznamy pronájmu seřazené dle startDate
  // Zpětná kompatibilita — deprecated, přesunuto do rentalHistory
  rentMonthly?:   number
  occupancyPct?:  number
  opexMonthly?:   number

  // Historie ocenění
  valuationHistory: PropertyValuation[]

  notes?:    string
  createdAt: string
  updatedAt: string
}
