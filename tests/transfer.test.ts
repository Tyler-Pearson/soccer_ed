import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { buildBackupFolderName, createBackupAtParent, getTransferPaths, restoreBackupFromBundle, uniqueNamedDir } from '../src/main/transfer'

const tempRoots: string[] = []

afterEach(async () => {
  await Promise.all(tempRoots.map(dir => fs.rm(dir, { recursive: true, force: true })))
  tempRoots.length = 0
})

describe('transfer service', () => {
  test('builds deterministic backup folder names', () => {
    expect(buildBackupFolderName(Date.UTC(2026, 1, 25, 21, 45, 7))).toBe('SoccerTechniqueBackup_20260225_214507')
  })

  test('uniqueNamedDir picks next available suffix', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'soccer-ed-transfer-'))
    tempRoots.push(root)

    await fs.mkdir(path.join(root, 'SoccerTechniqueLibrary'))
    await fs.mkdir(path.join(root, 'SoccerTechniqueLibrary-2'))

    const next = await uniqueNamedDir(root, 'SoccerTechniqueLibrary')
    expect(path.basename(next)).toBe('SoccerTechniqueLibrary-3')
  })

  test('createBackupAtParent writes manifest, db copy and library copy', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'soccer-ed-transfer-'))
    tempRoots.push(root)

    const parent = path.join(root, 'backup-parent')
    const libRoot = path.join(root, 'library-src')
    await fs.mkdir(parent, { recursive: true })
    await fs.mkdir(path.join(libRoot, 'players'), { recursive: true })
    await fs.writeFile(path.join(libRoot, 'players', 'sample.txt'), 'hello', 'utf-8')

    const fakeDb = {
      getSetting: (key: string) => (key === 'libraryRoot' ? libRoot : null),
      db: {
        backup: async (dest: string) => {
          await fs.writeFile(dest, 'db-bytes', 'utf-8')
        }
      }
    } as any

    const backupPath = await createBackupAtParent(fakeDb, parent, '0.1.0-test')
    const paths = getTransferPaths(backupPath)

    const manifest = JSON.parse(await fs.readFile(paths.manifestPath, 'utf-8'))
    expect(manifest.version).toBe(1)
    expect(manifest.appVersion).toBe('0.1.0-test')
    expect(manifest.libraryIncluded).toBe(true)

    const dbBytes = await fs.readFile(paths.dbPath, 'utf-8')
    expect(dbBytes).toBe('db-bytes')

    const libBytes = await fs.readFile(path.join(paths.libraryPath, 'players', 'sample.txt'), 'utf-8')
    expect(libBytes).toBe('hello')
  })

  test('restoreBackupFromBundle copies library and updates libraryRoot setting', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'soccer-ed-transfer-'))
    tempRoots.push(root)

    const bundleDir = path.join(root, 'bundle')
    const targetParent = path.join(root, 'target-parent')
    await fs.mkdir(path.join(bundleDir, 'db'), { recursive: true })
    await fs.mkdir(path.join(bundleDir, 'library', 'players'), { recursive: true })
    await fs.writeFile(path.join(bundleDir, 'manifest.json'), JSON.stringify({ version: 1 }), 'utf-8')
    await fs.writeFile(path.join(bundleDir, 'db', 'soccer-technique.db'), 'backup-db', 'utf-8')
    await fs.writeFile(path.join(bundleDir, 'library', 'players', 'clip.txt'), 'clip-bytes', 'utf-8')

    let storedRoot = ''
    const fakeDb = {
      setSetting: (key: string, value: string) => {
        if (key === 'libraryRoot') storedRoot = value
      }
    } as any

    const restoreDb = vi.fn()
    const result = await restoreBackupFromBundle(fakeDb, bundleDir, targetParent, { restoreDb })

    expect(restoreDb).toHaveBeenCalledOnce()
    expect(storedRoot).toBe(result.restoredLibraryRoot)
    expect(result.restoredLibraryRoot.startsWith(targetParent)).toBe(true)

    const copied = await fs.readFile(path.join(result.restoredLibraryRoot, 'players', 'clip.txt'), 'utf-8')
    expect(copied).toBe('clip-bytes')
  })
})
