import fs from 'node:fs'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Player, Session, Skill, Video, VideoWithSkillName } from '@shared/types'
import { makeId, nowMs, shortId, slugify } from './utils'

export interface AppDb {
  db: Database.Database
  init(): void
  seedDemoIfEmpty(): void
  getSetting(key: string): string | null
  setSetting(key: string, value: string): void
  players: {
    list(): Player[]
    getById(id: string): Player | null
    create(name: string): Player
    update(id: string, name: string): Player
    delete(id: string): void
  }
  skills: {
    list(playerId: string): Skill[]
    create(playerId: string, name: string): Skill
    update(id: string, name: string): Skill
    getById(id: string): Skill | null
    delete(id: string): void
  }
  sessions: {
    create(playerId: string, notes: string): Session
    list(playerId: string): Session[]
  }
  videos: {
    list(playerId: string, skillFilter: 'all' | 'unassigned' | string, sortDirection: 'asc' | 'desc'): VideoWithSkillName[]
    create(row: Video): Video
    getById(id: string): Video | null
    update(
      id: string,
      patch: Partial<Pick<Video, 'skillId' | 'starred' | 'notes' | 'fileRelpath' | 'displayName' | 'recordedAt' | 'sortKey'>>
    ): Video
    delete(id: string): void
  }
}

function makePlayerStorageKey(name: string, id: string): string {
  const base = slugify(name) || 'player'
  return `${base}-${shortId(id).slice(0, 4)}`
}

function mapPlayer(row: any): Player {
  return { id: row.id, name: row.name, storageKey: row.storage_key, createdAt: row.created_at }
}

function mapSkill(row: any): Skill {
  return {
    id: row.id,
    playerId: row.player_id,
    name: row.name,
    slug: row.slug,
    createdAt: row.created_at
  }
}

function mapSession(row: any): Session {
  return {
    id: row.id,
    playerId: row.player_id,
    startedAt: row.started_at,
    notes: row.notes ?? ''
  }
}

function mapVideo(row: any): Video {
  return {
    id: row.id,
    playerId: row.player_id,
    skillId: row.skill_id,
    sessionId: row.session_id,
    fileRelpath: row.file_relpath,
    originalName: row.original_name,
    displayName: row.display_name ?? row.original_name,
    recordedAt: row.recorded_at,
    importedAt: row.imported_at,
    starred: row.starred,
    notes: row.notes ?? '',
    sortKey: row.sort_key
  }
}

export function createDb(userDataPath: string): AppDb {
  fs.mkdirSync(userDataPath, { recursive: true })
  const dbPath = path.join(userDataPath, 'soccer-technique.db')
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')

  const appDb: AppDb = {
    db,
    init() {
      db.exec(`
        CREATE TABLE IF NOT EXISTS players (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          storage_key TEXT,
          created_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS skills (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          name TEXT NOT NULL,
          slug TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          UNIQUE(player_id, slug),
          FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          started_at INTEGER NOT NULL,
          notes TEXT,
          FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS videos (
          id TEXT PRIMARY KEY,
          player_id TEXT NOT NULL,
          skill_id TEXT NULL,
          session_id TEXT NULL,
          file_relpath TEXT NOT NULL,
          original_name TEXT NOT NULL,
          display_name TEXT,
          recorded_at INTEGER NOT NULL,
          imported_at INTEGER NOT NULL,
          starred INTEGER NOT NULL DEFAULT 0,
          notes TEXT,
          sort_key INTEGER NOT NULL,
          FOREIGN KEY(player_id) REFERENCES players(id) ON DELETE CASCADE,
          FOREIGN KEY(skill_id) REFERENCES skills(id) ON DELETE SET NULL,
          FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE SET NULL
        );

        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_videos_player_id ON videos(player_id);
        CREATE INDEX IF NOT EXISTS idx_videos_skill_id ON videos(skill_id);
        CREATE INDEX IF NOT EXISTS idx_videos_recorded_at ON videos(recorded_at);
        CREATE INDEX IF NOT EXISTS idx_videos_starred ON videos(starred);
      `)

      const playerCols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>
      if (!playerCols.some(col => col.name === 'storage_key')) {
        db.exec('ALTER TABLE players ADD COLUMN storage_key TEXT')
      }

      const videoCols = db.prepare('PRAGMA table_info(videos)').all() as Array<{ name: string }>
      if (!videoCols.some(col => col.name === 'display_name')) {
        db.exec('ALTER TABLE videos ADD COLUMN display_name TEXT')
      }

      const missingPlayerKeys = db
        .prepare('SELECT id, name FROM players WHERE storage_key IS NULL OR storage_key = ""')
        .all() as Array<{ id: string; name: string }>
      const setPlayerKey = db.prepare('UPDATE players SET storage_key = ? WHERE id = ?')
      for (const row of missingPlayerKeys) {
        setPlayerKey.run(makePlayerStorageKey(row.name, row.id), row.id)
      }

      db.exec('UPDATE videos SET display_name = original_name WHERE display_name IS NULL OR display_name = ""')
    },

    seedDemoIfEmpty() {
      const row = db.prepare('SELECT COUNT(*) as count FROM players').get() as { count: number }
      if (row.count > 0) return

      const player = appDb.players.create('Demo Player')
      appDb.skills.create(player.id, 'First Touch')
      appDb.skills.create(player.id, 'Passing')
    },

    getSetting(key: string) {
      const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
      return row?.value ?? null
    },

    setSetting(key: string, value: string) {
      db.prepare(`
        INSERT INTO settings(key, value)
        VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(key, value)
    },

    players: {
      list() {
        const rows = db.prepare('SELECT * FROM players ORDER BY name COLLATE NOCASE ASC').all()
        return rows.map(mapPlayer)
      },

      getById(id: string) {
        const row = db.prepare('SELECT * FROM players WHERE id = ?').get(id)
        return row ? mapPlayer(row) : null
      },

      create(name: string) {
        const id = makeId()
        const createdAt = nowMs()
        const trimmed = name.trim()
        const storageKey = makePlayerStorageKey(trimmed, id)
        db.prepare('INSERT INTO players(id, name, storage_key, created_at) VALUES (?, ?, ?, ?)').run(
          id,
          trimmed,
          storageKey,
          createdAt
        )
        return { id, name: trimmed, storageKey, createdAt }
      },

      update(id: string, name: string) {
        db.prepare('UPDATE players SET name = ? WHERE id = ?').run(name.trim(), id)
        const row = db.prepare('SELECT * FROM players WHERE id = ?').get(id)
        if (!row) throw new Error('Player not found')
        return mapPlayer(row)
      },

      delete(id: string) {
        db.prepare('DELETE FROM players WHERE id = ?').run(id)
      }
    },

    skills: {
      list(playerId: string) {
        const rows = db
          .prepare('SELECT * FROM skills WHERE player_id = ? ORDER BY name COLLATE NOCASE ASC')
          .all(playerId)
        return rows.map(mapSkill)
      },

      create(playerId: string, name: string) {
        const trimmed = name.trim()
        if (!trimmed) throw new Error('Skill name is required')

        const base = slugify(trimmed)
        let slug = base
        let suffix = 1
        while (db.prepare('SELECT 1 FROM skills WHERE player_id = ? AND slug = ?').get(playerId, slug)) {
          suffix += 1
          slug = `${base}-${suffix}`
        }

        const id = makeId()
        const createdAt = nowMs()
        db.prepare('INSERT INTO skills(id, player_id, name, slug, created_at) VALUES (?, ?, ?, ?, ?)').run(
          id,
          playerId,
          trimmed,
          slug,
          createdAt
        )
        return { id, playerId, name: trimmed, slug, createdAt }
      },

      update(id: string, name: string) {
        const current = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as any
        if (!current) throw new Error('Skill not found')

        const trimmed = name.trim()
        if (!trimmed) throw new Error('Skill name is required')
        const base = slugify(trimmed)
        let slug = base
        let suffix = 1
        while (
          db
            .prepare('SELECT 1 FROM skills WHERE player_id = ? AND slug = ? AND id <> ?')
            .get(current.player_id, slug, id)
        ) {
          suffix += 1
          slug = `${base}-${suffix}`
        }

        db.prepare('UPDATE skills SET name = ?, slug = ? WHERE id = ?').run(trimmed, slug, id)
        const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id)
        if (!row) throw new Error('Skill not found')
        return mapSkill(row)
      },

      getById(id: string) {
        const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id)
        return row ? mapSkill(row) : null
      },

      delete(id: string) {
        db.prepare('DELETE FROM skills WHERE id = ?').run(id)
      }
    },

    sessions: {
      create(playerId: string, notes: string) {
        const id = makeId()
        const startedAt = nowMs()
        db.prepare('INSERT INTO sessions(id, player_id, started_at, notes) VALUES (?, ?, ?, ?)').run(
          id,
          playerId,
          startedAt,
          notes
        )
        return { id, playerId, startedAt, notes }
      },

      list(playerId: string) {
        const rows = db.prepare('SELECT * FROM sessions WHERE player_id = ? ORDER BY started_at DESC').all(playerId)
        return rows.map(mapSession)
      }
    },

    videos: {
      list(playerId: string, skillFilter: 'all' | 'unassigned' | string, sortDirection: 'asc' | 'desc') {
        const order = sortDirection === 'desc' ? 'DESC' : 'ASC'
        let query = `
          SELECT v.*, s.name as skill_name
          FROM videos v
          LEFT JOIN skills s ON s.id = v.skill_id
          WHERE v.player_id = ?
        `
        const params: any[] = [playerId]

        if (skillFilter === 'unassigned') {
          query += ' AND v.skill_id IS NULL'
        } else if (skillFilter !== 'all') {
          query += ' AND v.skill_id = ?'
          params.push(skillFilter)
        }

        query += ` ORDER BY v.sort_key ${order}, v.imported_at ${order}`

        const rows = db.prepare(query).all(...params)
        return rows.map((row: any) => ({ ...mapVideo(row), skillName: row.skill_name ?? null }))
      },

      create(row: Video) {
        db.prepare(`
          INSERT INTO videos(
            id, player_id, skill_id, session_id, file_relpath, original_name,
            display_name, recorded_at, imported_at, starred, notes, sort_key
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          row.id,
          row.playerId,
          row.skillId,
          row.sessionId,
          row.fileRelpath,
          row.originalName,
          row.displayName,
          row.recordedAt,
          row.importedAt,
          row.starred,
          row.notes,
          row.sortKey
        )
        return row
      },

      getById(id: string) {
        const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(id)
        return row ? mapVideo(row) : null
      },

      update(
        id: string,
        patch: Partial<Pick<Video, 'skillId' | 'starred' | 'notes' | 'fileRelpath' | 'displayName' | 'recordedAt' | 'sortKey'>>
      ) {
        const current = db.prepare('SELECT * FROM videos WHERE id = ?').get(id) as any
        if (!current) throw new Error('Video not found')

        const skillId = Object.prototype.hasOwnProperty.call(patch, 'skillId') ? patch.skillId ?? null : current.skill_id
        const starred = Object.prototype.hasOwnProperty.call(patch, 'starred') ? patch.starred ?? current.starred : current.starred
        const notes = Object.prototype.hasOwnProperty.call(patch, 'notes') ? patch.notes ?? '' : current.notes ?? ''
        const fileRelpath =
          Object.prototype.hasOwnProperty.call(patch, 'fileRelpath') && patch.fileRelpath
            ? patch.fileRelpath
            : current.file_relpath
        const displayName =
          Object.prototype.hasOwnProperty.call(patch, 'displayName') && patch.displayName
            ? patch.displayName.trim()
            : current.display_name ?? current.original_name
        const recordedAt =
          Object.prototype.hasOwnProperty.call(patch, 'recordedAt') && typeof patch.recordedAt === 'number'
            ? patch.recordedAt
            : current.recorded_at
        const sortKey =
          Object.prototype.hasOwnProperty.call(patch, 'sortKey') && typeof patch.sortKey === 'number'
            ? patch.sortKey
            : recordedAt

        db.prepare(
          'UPDATE videos SET skill_id = ?, starred = ?, notes = ?, file_relpath = ?, display_name = ?, recorded_at = ?, sort_key = ? WHERE id = ?'
        ).run(skillId, starred, notes, fileRelpath, displayName, recordedAt, sortKey, id)

        const row = db.prepare('SELECT * FROM videos WHERE id = ?').get(id)
        if (!row) throw new Error('Video not found')
        return mapVideo(row)
      },

      delete(id: string) {
        db.prepare('DELETE FROM videos WHERE id = ?').run(id)
      }
    }
  }

  appDb.init()
  appDb.seedDemoIfEmpty()
  return appDb
}
