import fs from 'node:fs/promises'
import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import type { ImportBatchResult, ListVideosInput, Video, VideoUpdateInput } from '@shared/types'
import type { AppDb } from './db'
import {
  buildVideoRelpath,
  collectImportFiles,
  ensureParentDir,
  getLibraryRootOrThrow,
  newVideoId,
  resolveAbsVideoPath,
  safeMoveFile,
  statRecordedAt,
  uniqueDestination
} from './library'
import { buildVideoSourceUrl } from './protocol'
import { nowMs } from './utils'

function assertName(name: string, label: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error(`${label} is required`)
  return trimmed
}

export function registerIpc(db: AppDb): void {
  ipcMain.handle('app:getLibraryRoot', async () => db.getSetting('libraryRoot'))

  ipcMain.handle('app:chooseLibraryRoot', async () => {
    const res = await dialog.showOpenDialog({
      title: 'Choose Library Root Folder',
      properties: ['openDirectory', 'createDirectory']
    })
    if (res.canceled || res.filePaths.length === 0) return null
    const root = path.resolve(res.filePaths[0])
    db.setSetting('libraryRoot', root)
    return root
  })

  ipcMain.handle('files:pick', async (_evt, options: { mode: 'files' | 'folder' }) => {
    if (options.mode === 'folder') {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'multiSelections']
      })
      return result.canceled ? [] : result.filePaths
    }

    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        {
          name: 'Video Files',
          extensions: ['mp4', 'mov', 'm4v', 'avi', 'mkv', 'webm']
        }
      ]
    })
    return result.canceled ? [] : result.filePaths
  })

  ipcMain.handle('players:list', async () => db.players.list())
  ipcMain.handle('players:create', async (_evt, name: string) => db.players.create(assertName(name, 'Player name')))
  ipcMain.handle('players:update', async (_evt, id: string, name: string) => db.players.update(id, assertName(name, 'Player name')))
  ipcMain.handle('players:delete', async (_evt, id: string) => {
    db.players.delete(id)
  })

  ipcMain.handle('skills:list', async (_evt, playerId: string) => db.skills.list(playerId))
  ipcMain.handle('skills:create', async (_evt, playerId: string, name: string) => db.skills.create(playerId, assertName(name, 'Skill name')))
  ipcMain.handle('skills:update', async (_evt, id: string, name: string) => db.skills.update(id, assertName(name, 'Skill name')))
  ipcMain.handle('skills:delete', async (_evt, id: string) => {
    db.skills.delete(id)
  })

  ipcMain.handle('sessions:create', async (_evt, playerId: string, notes: string) => db.sessions.create(playerId, notes ?? ''))
  ipcMain.handle('sessions:list', async (_evt, playerId: string) => db.sessions.list(playerId))

  ipcMain.handle('videos:list', async (_evt, input: ListVideosInput) => {
    return db.videos.list(input.playerId, input.skillFilter, input.sortDirection)
  })

  ipcMain.handle('videos:sourceUrl', async (_evt, fileRelpath: string) => buildVideoSourceUrl(fileRelpath))

  ipcMain.handle('videos:delete', async (_evt, id: string) => {
    const row = db.videos.getById(id)
    if (!row) return

    const libraryRoot = getLibraryRootOrThrow(db)
    const abs = resolveAbsVideoPath(libraryRoot, row.fileRelpath)
    await fs.rm(abs, { force: true })
    db.videos.delete(id)
  })

  ipcMain.handle('videos:update', async (_evt, input: VideoUpdateInput) => {
    const current = db.videos.getById(input.id)
    if (!current) throw new Error('Video not found')

    let nextRelpath: string | undefined

    const changingSkill = Object.prototype.hasOwnProperty.call(input, 'skillId') && input.skillId !== current.skillId
    if (changingSkill) {
      const skill = input.skillId ? db.skills.getById(input.skillId) : null
      if (input.skillId && !skill) throw new Error('Skill not found')

      const libraryRoot = getLibraryRootOrThrow(db)
      const fromAbs = resolveAbsVideoPath(libraryRoot, current.fileRelpath)
      const skillSlug = skill?.slug ?? 'unassigned'
      const ext = path.extname(current.fileRelpath) || '.mp4'
      const baseRelpath = buildVideoRelpath({
        playerId: current.playerId,
        skillSlug,
        recordedAt: current.recordedAt,
        id: current.id,
        ext
      })
      const baseAbs = resolveAbsVideoPath(libraryRoot, baseRelpath)
      const toAbs = await uniqueDestination(baseAbs)
      await safeMoveFile(fromAbs, toAbs)
      nextRelpath = path.relative(libraryRoot, toAbs).split(path.sep).join('/')
    }

    return db.videos.update(input.id, {
      skillId: Object.prototype.hasOwnProperty.call(input, 'skillId') ? input.skillId ?? null : undefined,
      starred: Object.prototype.hasOwnProperty.call(input, 'starred') ? input.starred : undefined,
      notes: Object.prototype.hasOwnProperty.call(input, 'notes') ? input.notes ?? '' : undefined,
      fileRelpath: nextRelpath
    })
  })

  ipcMain.handle('videos:importBatch', async (_evt, input: { playerId: string; sessionId: string | null; filePaths: string[] }) => {
    const libraryRoot = getLibraryRootOrThrow(db)
    const files = await collectImportFiles(input.filePaths)

    const result: ImportBatchResult = { imported: [], skipped: [] }

    for (const src of files) {
      try {
        const id = newVideoId()
        const importedAt = nowMs()
        const recordedAt = await statRecordedAt(src)
        const ext = path.extname(src).toLowerCase() || '.mp4'
        const relpath = buildVideoRelpath({
          playerId: input.playerId,
          skillSlug: 'unassigned',
          recordedAt,
          id,
          ext
        })
        const absDest = resolveAbsVideoPath(libraryRoot, relpath)
        await ensureParentDir(absDest)
        await fs.copyFile(src, absDest)

        const row: Video = {
          id,
          playerId: input.playerId,
          skillId: null,
          sessionId: input.sessionId,
          fileRelpath: relpath,
          originalName: path.basename(src),
          recordedAt,
          importedAt,
          starred: 0,
          notes: '',
          sortKey: recordedAt
        }

        db.videos.create(row)
        result.imported.push(row)
      } catch (error: any) {
        result.skipped.push({ path: src, reason: error?.message ?? 'Unknown error' })
      }
    }

    return result
  })
}
