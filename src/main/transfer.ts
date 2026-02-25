import fs from 'node:fs/promises'
import path from 'node:path'
import type { AppDb } from './db'

interface BackupManifest {
  version: 1
  createdAt: number
  appVersion: string
  libraryIncluded: boolean
  sourceLibraryRoot: string | null
}

export interface RestoreResult {
  restoredLibraryRoot: string
  backupPath: string
}

const BACKUP_FOLDER_PREFIX = 'SoccerTechniqueBackup'
const RESTORE_LIBRARY_BASE = 'SoccerTechniqueLibrary'

function timestampToken(ts: number): string {
  const d = new Date(ts)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mi = String(d.getUTCMinutes()).padStart(2, '0')
  const ss = String(d.getUTCSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}_${hh}${mi}${ss}`
}

export function buildBackupFolderName(ts: number): string {
  return `${BACKUP_FOLDER_PREFIX}_${timestampToken(ts)}`
}

export async function uniqueNamedDir(parentDir: string, baseName: string): Promise<string> {
  let candidate = path.join(parentDir, baseName)
  let suffix = 2
  while (true) {
    try {
      const stat = await fs.stat(candidate)
      if (stat.isDirectory()) {
        candidate = path.join(parentDir, `${baseName}-${suffix}`)
        suffix += 1
        continue
      }
      candidate = path.join(parentDir, `${baseName}-${suffix}`)
      suffix += 1
    } catch {
      return candidate
    }
  }
}

export function getTransferPaths(bundleDir: string): { manifestPath: string; dbPath: string; libraryPath: string } {
  return {
    manifestPath: path.join(bundleDir, 'manifest.json'),
    dbPath: path.join(bundleDir, 'db', 'soccer-technique.db'),
    libraryPath: path.join(bundleDir, 'library')
  }
}

function tableColumns(dbLike: any, table: string): string[] {
  const rows = dbLike.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>
  return rows.map(row => row.name)
}

function importTableFromAttached(dbLike: any, table: string, attachedName: string): void {
  const mainCols = tableColumns(dbLike, table)
  const backupCols = (dbLike.prepare(`PRAGMA ${attachedName}.table_info(${table})`).all() as Array<{ name: string }>).map(r => r.name)
  const cols = mainCols.filter(col => backupCols.includes(col))
  if (cols.length === 0) return

  const columnsSql = cols.map(col => `"${col}"`).join(', ')
  dbLike.prepare(`DELETE FROM ${table}`).run()
  dbLike.prepare(`INSERT INTO ${table} (${columnsSql}) SELECT ${columnsSql} FROM ${attachedName}.${table}`).run()
}

function restoreDatabaseFromBackup(db: AppDb, backupDbPath: string): void {
  db.db.pragma('foreign_keys = OFF')
  const tx = db.db.transaction(() => {
    db.db.prepare('ATTACH DATABASE ? AS backupdb').run(backupDbPath)
    try {
      importTableFromAttached(db.db, 'players', 'backupdb')
      importTableFromAttached(db.db, 'skills', 'backupdb')
      importTableFromAttached(db.db, 'sessions', 'backupdb')
      importTableFromAttached(db.db, 'videos', 'backupdb')
      importTableFromAttached(db.db, 'settings', 'backupdb')
    } finally {
      db.db.prepare('DETACH DATABASE backupdb').run()
    }
  })

  tx()
  db.db.pragma('foreign_keys = ON')
}

export async function createBackupAtParent(db: AppDb, parentDir: string, appVersion: string): Promise<string> {
  const ts = Date.now()
  const bundleDir = await uniqueNamedDir(parentDir, buildBackupFolderName(ts))
  await fs.mkdir(bundleDir, { recursive: true })

  const { manifestPath, dbPath, libraryPath } = getTransferPaths(bundleDir)
  await fs.mkdir(path.dirname(dbPath), { recursive: true })

  const libraryRoot = db.getSetting('libraryRoot')
  await db.db.backup(dbPath)

  let libraryIncluded = false
  if (libraryRoot) {
    try {
      await fs.stat(libraryRoot)
      await fs.cp(libraryRoot, libraryPath, { recursive: true, force: false, errorOnExist: false })
      libraryIncluded = true
    } catch {
      libraryIncluded = false
    }
  }

  const manifest: BackupManifest = {
    version: 1,
    createdAt: ts,
    appVersion,
    libraryIncluded,
    sourceLibraryRoot: libraryRoot
  }
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8')

  return bundleDir
}

export async function restoreBackupFromBundle(
  db: AppDb,
  bundleDir: string,
  targetParentDir: string,
  options?: { restoreDb?: (db: AppDb, backupDbPath: string) => void }
): Promise<RestoreResult> {
  const { manifestPath, dbPath, libraryPath } = getTransferPaths(bundleDir)
  await fs.stat(manifestPath)
  await fs.stat(dbPath)

  const libraryRoot = await uniqueNamedDir(targetParentDir, RESTORE_LIBRARY_BASE)
  await fs.mkdir(libraryRoot, { recursive: true })

  try {
    const stat = await fs.stat(libraryPath)
    if (stat.isDirectory()) {
      await fs.cp(libraryPath, libraryRoot, { recursive: true, force: true, errorOnExist: false })
    }
  } catch {
    // no library folder present in backup
  }

  const restoreDb = options?.restoreDb ?? restoreDatabaseFromBackup
  restoreDb(db, dbPath)
  db.setSetting('libraryRoot', libraryRoot)

  return {
    restoredLibraryRoot: libraryRoot,
    backupPath: bundleDir
  }
}
