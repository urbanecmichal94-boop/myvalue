export function makeFmtKc(suffixM: string, suffixTis: string, suffixKc: string) {
  return function fmtKc(n: number) {
    const abs = Math.abs(n)
    const sign = n < 0 ? '−' : ''
    if (abs >= 1_000_000) return sign + (abs / 1_000_000).toLocaleString('cs-CZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + suffixM
    if (abs >= 1_000)     return sign + Math.round(abs / 1_000).toLocaleString('cs-CZ') + ' ' + suffixTis
    return sign + Math.round(abs).toLocaleString('cs-CZ') + ' ' + suffixKc
  }
}

export function makeFmtKcFull(suffixKc: string) {
  return (n: number) => Math.round(n).toLocaleString('cs-CZ') + ' ' + suffixKc
}
