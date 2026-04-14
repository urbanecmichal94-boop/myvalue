import type { Property } from '@/types/property'

const KEY = 'pt_properties'

function load<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function save(key: string, value: unknown): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(key, JSON.stringify(value))
}

export function getProperties(): Property[] {
  return load<Property[]>(KEY, [])
}

export function saveProperty(p: Property): void {
  const all = getProperties()
  const idx = all.findIndex((x) => x.id === p.id)
  if (idx >= 0) all[idx] = p
  else all.push(p)
  save(KEY, all)
}

export function deleteProperty(id: string): void {
  save(KEY, getProperties().filter((p) => p.id !== id))
}
