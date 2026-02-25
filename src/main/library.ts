import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import type { AppDb } from './db'
import { VIDEO_EXTENSIONS, makeId, sanitizeRelpath, shortId, toDayString, toPosixRel } from './utils'

export function getLibraryRootOrThrow(db: AppDb): string {
  const root = db.getSetting('libraryRoot')
  if (!root) throw new Error('Library root is not configured')
  return root
}

async function* walkFiles(entry: string): AsyncGenerator<string> {
  const stat = await fsp.stat(entry)
  if (stat.isFile()) {
    yield entry
    return
  }

  if (stat.isDirectory()) {
    const items = await fsp.readdir(entry, { withFileTypes: true })
    for (const item of items) {
      const next = path.join(entry, item.name)
      if (item.isDirectory()) {
        yield* walkFiles(next)
      } else if (item.isFile()) {
        yield next
      }
    }
  }
}

export async function collectImportFiles(paths: string[]): Promise<string[]> {
  const found = new Set<string>()
  for (const entry of paths) {
    for await (const file of walkFiles(entry)) {
      const ext = path.extname(file).toLowerCase()
      if (VIDEO_EXTENSIONS.has(ext)) {
        found.add(path.resolve(file))
      }
    }
  }
  return [...found]
}

export function buildVideoRelpath(params: {
  playerFolder: string
  skillSlug: string
  recordedAt: number
  id: string
  ext: string
}): string {
  const day = toDayString(params.recordedAt)
  const ts = String(params.recordedAt)
  const filename = `${ts}_${shortId(params.id)}${params.ext}`
  const rel = path.posix.join('players', params.playerFolder, 'skills', params.skillSlug, day, filename)
  return sanitizeRelpath(rel)
}

export function resolveAbsVideoPath(libraryRoot: string, relpath: string): string {
  const safeRel = sanitizeRelpath(toPosixRel(relpath))
  const absolute = path.resolve(libraryRoot, safeRel)
  const normalizedRoot = path.resolve(libraryRoot)
  const rootWithSep = normalizedRoot.endsWith(path.sep) ? normalizedRoot : `${normalizedRoot}${path.sep}`
  if (!(absolute === normalizedRoot || absolute.startsWith(rootWithSep))) {
    throw new Error('Path escapes library root')
  }
  return absolute
}

export async function ensureParentDir(filePath: string): Promise<void> {
  await fsp.mkdir(path.dirname(filePath), { recursive: true })
}

export async function safeMoveFile(fromAbs: string, toAbs: string): Promise<void> {
  await ensureParentDir(toAbs)
  try {
    await fsp.rename(fromAbs, toAbs)
  } catch (error: any) {
    if (error?.code !== 'EXDEV') throw error
    await fsp.copyFile(fromAbs, toAbs)
    await fsp.unlink(fromAbs)
  }
}

export async function uniqueDestination(baseAbsPath: string): Promise<string> {
  if (!fs.existsSync(baseAbsPath)) return baseAbsPath
  const parsed = path.parse(baseAbsPath)
  let index = 1
  while (true) {
    const candidate = path.join(parsed.dir, `${parsed.name}_${index}${parsed.ext}`)
    if (!fs.existsSync(candidate)) return candidate
    index += 1
  }
}

export async function statRecordedAt(filePath: string): Promise<number> {
  const st = await fsp.stat(filePath)
  const birth = Number.isFinite(st.birthtimeMs) ? Math.floor(st.birthtimeMs) : 0
  const modified = Number.isFinite(st.mtimeMs) ? Math.floor(st.mtimeMs) : 0
  return birth > 0 ? birth : modified > 0 ? modified : Date.now()
}

export function newVideoId(): string {
  return makeId()
}
