import path from 'node:path'
import { randomUUID } from 'node:crypto'

export const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.avi',
  '.mkv',
  '.webm'
])

export function nowMs(): number {
  return Date.now()
}

export function makeId(): string {
  return randomUUID()
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'skill'
}

export function shortId(id: string): string {
  return id.replace(/-/g, '').slice(0, 8)
}

export function toDayString(timestamp: number): string {
  const d = new Date(timestamp)
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function toPosixRel(p: string): string {
  return p.split(path.sep).join('/')
}

export function sanitizeRelpath(input: string): string {
  const normalized = path.posix.normalize(input)
  if (normalized.startsWith('/') || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error('Invalid relative path')
  }
  return normalized
}
