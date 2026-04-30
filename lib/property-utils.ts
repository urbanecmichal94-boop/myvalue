import type { Property } from '@/types/property'

function monthsSince(dateStr: string): number {
  const d = new Date(dateStr)
  const n = new Date()
  return (n.getFullYear() - d.getFullYear()) * 12 + (n.getMonth() - d.getMonth())
}

export function buildAmortization(
  principal: number, rate: number, termYears: number, startDate: string,
  drawdownStartDate?: string, drawdownCompleteDate?: string,
) {
  const r = rate / 100 / 12
  const n = termYears * 12
  const M = r === 0 ? principal / n : principal * r * Math.pow(1 + r, n) / (Math.pow(1 + r, n) - 1)

  const amortStart    = drawdownCompleteDate ?? startDate
  const elapsedAmort  = Math.min(Math.max(0, monthsSince(amortStart)), n)

  const preDrawdownMonths = drawdownStartDate && drawdownCompleteDate
    ? Math.max(0, monthsSince(drawdownStartDate) - monthsSince(drawdownCompleteDate))
    : 0
  const preDrawdownInterest = preDrawdownMonths * principal * r

  const startYear = new Date(amortStart).getFullYear()
  let balance     = principal
  let cumInterest = preDrawdownInterest
  let cumPrincipal = 0

  const points: { year: number; balance: number; cumInterest: number; cumPrincipal: number }[] = []
  points.push({ year: startYear, balance: Math.round(principal), cumInterest: Math.round(preDrawdownInterest), cumPrincipal: 0 })

  for (let y = 1; y <= termYears; y++) {
    for (let m = 0; m < 12; m++) {
      const interest = balance * r
      const princ    = Math.min(M - interest, balance)
      cumInterest   += interest
      cumPrincipal  += princ
      balance        = Math.max(0, balance - princ)
    }
    points.push({ year: startYear + y, balance: Math.round(balance), cumInterest: Math.round(cumInterest), cumPrincipal: Math.round(cumPrincipal) })
  }

  let curBal    = principal
  let curCumInt = preDrawdownInterest
  for (let m = 0; m < elapsedAmort; m++) {
    const interest = curBal * r
    curCumInt += interest
    curBal = Math.max(0, curBal - Math.min(M - interest, curBal))
  }

  return {
    points, M,
    currentBalance:      Math.round(curBal),
    currentCumInterest:  Math.round(curCumInt),
    preDrawdownInterest: Math.round(preDrawdownInterest),
    preDrawdownMonths,
    nowYear: startYear + elapsedAmort / 12,
    elapsed: elapsedAmort,
  }
}

/** Vrátí equity nemovitosti = aktuální hodnota − zůstatek hypotéky */
export function calcPropertyEquity(p: Property): number {
  if (!p.mortgage) return p.currentValue
  const amort = buildAmortization(
    p.mortgage.principal,
    p.mortgage.interestRate,
    p.mortgage.termYears,
    p.mortgage.startDate,
    p.mortgage.drawdownStartDate,
    p.mortgage.drawdownCompleteDate,
  )
  return Math.max(0, p.currentValue - amort.currentBalance)
}
