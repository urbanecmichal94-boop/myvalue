import { NextResponse } from 'next/server'
import { upsertMacroRows } from '@/lib/supabase'

// ČNB denní kurzy — veřejné, bez API klíče
// https://www.cnb.cz/cs/financni_trhy/devizovy_trh/kurzy_devizoveho_trhu/denni_kurz.txt
// ČNB ARAD (časové řady) — repo sazba
// https://www.cnb.cz/cnb/STAT.ARADY_PKG.VYSTUP?p_period=1&p_sort=2&p_des=50&p_sestuid=1765&p_uka=1&p_strid=AKLBM2T&p_od=202601&p_do=202604&p_lang=CS&p_format=2&p_decsep=.

export interface CnbData {
  eurCzk: number
  usdCzk: number
  repoRate: number    // Repo sazba ČNB (%)
  date: string        // YYYY-MM-DD
}

export async function GET() {
  try {
    // 1) Denní kurzy (EUR/CZK, USD/CZK) — správná URL s pomlčkami
    const ratesRes = await fetch(
      'https://www.cnb.cz/cs/financni-trhy/devizovy-trh/kurzy-devizoveho-trhu/kurzy-devizoveho-trhu/denni_kurz.txt',
      { next: { revalidate: 3600 } } // cache 1 hodina
    )

    let eurCzk = 0
    let usdCzk = 0
    let date   = new Date().toISOString().split('T')[0]

    if (ratesRes.ok) {
      const text = await ratesRes.text()
      const lines = text.trim().split('\n')
      // Řádek 0: "07.04.2026 #66", řádek 1: header, řádek 2+: data
      // Formát: země|měna|množství|kód|kurz
      for (const line of lines) {
        const parts = line.split('|')
        if (parts.length < 5) continue
        const code   = parts[3].trim()
        const amount = parseFloat(parts[2].trim())
        const rate   = parseFloat(parts[4].trim().replace(',', '.'))
        if (code === 'EUR') eurCzk = parseFloat((rate / amount).toFixed(4))
        if (code === 'USD') usdCzk = parseFloat((rate / amount).toFixed(4))
      }
      // Datum z prvního řádku
      if (lines[0]) {
        const match = lines[0].match(/(\d{2})\.(\d{2})\.(\d{4})/)
        if (match) date = `${match[3]}-${match[2]}-${match[1]}`
      }
    }

    // 2) Repo sazba ČNB — z veřejných dat ČNB (ARAD časové řady)
    // Formát: CSV, kód série AKLBM2T = 2T repo sazba
    let repoRate = 3.75 // fallback — aktuální hodnota k 7.4.2026
    try {
      const today = new Date()
      const yyyymm = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}`
      const repoRes = await fetch(
        `https://www.cnb.cz/cnb/STAT.ARADY_PKG.VYSTUP?p_period=1&p_sort=2&p_des=5&p_sestuid=1765&p_uka=1&p_strid=AKLBM2T&p_od=${yyyymm}&p_do=${yyyymm}&p_lang=CS&p_format=2&p_decsep=.`,
        { next: { revalidate: 86400 } } // cache 24 hodin
      )
      if (repoRes.ok) {
        const text = await repoRes.text()
        const lines = text.trim().split('\n').filter(l => l.trim() && !l.startsWith('"'))
        const last = lines[lines.length - 1]
        if (last) {
          const parts = last.split(';')
          const val = parseFloat(parts[parts.length - 1]?.replace(',', '.') ?? '')
          if (!isNaN(val)) repoRate = val
        }
      }
    } catch {
      // fallback zůstane
    }

    const data: CnbData = { eurCzk, usdCzk, repoRate, date }

    // Uložit do Supabase (tiše — neblokujeme odpověď)
    if (eurCzk > 0 && usdCzk > 0) {
      upsertMacroRows([
        { region: 'CZ', category: 'cnb', key: 'eurCzk',   value: eurCzk,   unit: 'CZK', date },
        { region: 'CZ', category: 'cnb', key: 'usdCzk',   value: usdCzk,   unit: 'CZK', date },
        { region: 'CZ', category: 'cnb', key: 'repoRate',  value: repoRate, unit: '%',   date },
      ]).catch(e => console.error('Supabase CNB upsert error:', e))
    }

    return NextResponse.json(data)
  } catch (err) {
    console.error('CNB macro fetch error:', err)
    return NextResponse.json({ error: 'Failed to fetch CNB data' }, { status: 500 })
  }
}
