export type ID = string

export interface Player {
  id: ID
  name: string
  storageKey: string
  createdAt: number
}

export interface Skill {
  id: ID
  playerId: ID
  name: string
  slug: string
  createdAt: number
}

export interface Session {
  id: ID
  playerId: ID
  startedAt: number
  notes: string
}

export interface Video {
  id: ID
  playerId: ID
  skillId: ID | null
  sessionId: ID | null
  fileRelpath: string
  originalName: string
  displayName: string
  recordedAt: number
  importedAt: number
  starred: number
  notes: string
  sortKey: number
}

export interface VideoWithSkillName extends Video {
  skillName: string | null
}

export interface SettingsMap {
  libraryRoot: string | null
}

export interface ImportBatchInput {
  playerId: ID
  sessionId: ID | null
  filePaths: string[]
}

export interface ImportBatchResult {
  imported: Video[]
  skipped: Array<{ path: string; reason: string }>
}

export interface VideoUpdateInput {
  id: ID
  skillId?: ID | null
  starred?: number
  notes?: string
  displayName?: string
  recordedAt?: number
}

export interface ListVideosInput {
  playerId: ID
  skillFilter: 'all' | 'unassigned' | ID
  sortDirection: 'asc' | 'desc'
}

export interface FilePickOptions {
  mode: 'files' | 'folder'
}

export interface SoccerApi {
  app: {
    getLibraryRoot(): Promise<string | null>
    chooseLibraryRoot(): Promise<string | null>
    createBackup(): Promise<string | null>
    restoreBackup(): Promise<{ restoredLibraryRoot: string; backupPath: string } | null>
  }
  players: {
    list(): Promise<Player[]>
    create(name: string): Promise<Player>
    update(id: ID, name: string): Promise<Player>
    delete(id: ID): Promise<void>
  }
  skills: {
    list(playerId: ID): Promise<Skill[]>
    create(playerId: ID, name: string): Promise<Skill>
    update(id: ID, name: string): Promise<Skill>
    delete(id: ID): Promise<void>
  }
  sessions: {
    create(playerId: ID, notes: string): Promise<Session>
    list(playerId: ID): Promise<Session[]>
    updateNotes(id: ID, notes: string): Promise<Session>
  }
  videos: {
    list(input: ListVideosInput): Promise<VideoWithSkillName[]>
    update(input: VideoUpdateInput): Promise<Video>
    delete(id: ID): Promise<void>
    importBatch(input: ImportBatchInput): Promise<ImportBatchResult>
    sourceUrl(fileRelpath: string): string
  }
  files: {
    pick(options: FilePickOptions): Promise<string[]>
  }
}
