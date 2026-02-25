import { contextBridge, ipcRenderer } from 'electron'
import type { FilePickOptions, ImportBatchInput, ListVideosInput, SoccerApi, VideoUpdateInput } from '@shared/types'

const api: SoccerApi = {
  app: {
    getLibraryRoot: () => ipcRenderer.invoke('app:getLibraryRoot'),
    chooseLibraryRoot: () => ipcRenderer.invoke('app:chooseLibraryRoot'),
    createBackup: () => ipcRenderer.invoke('app:createBackup'),
    restoreBackup: () => ipcRenderer.invoke('app:restoreBackup')
  },

  players: {
    list: () => ipcRenderer.invoke('players:list'),
    create: (name: string) => ipcRenderer.invoke('players:create', name),
    update: (id: string, name: string) => ipcRenderer.invoke('players:update', id, name),
    delete: (id: string) => ipcRenderer.invoke('players:delete', id)
  },

  skills: {
    list: (playerId: string) => ipcRenderer.invoke('skills:list', playerId),
    create: (playerId: string, name: string) => ipcRenderer.invoke('skills:create', playerId, name),
    update: (id: string, name: string) => ipcRenderer.invoke('skills:update', id, name),
    delete: (id: string) => ipcRenderer.invoke('skills:delete', id)
  },

  sessions: {
    create: (playerId: string, notes: string) => ipcRenderer.invoke('sessions:create', playerId, notes),
    list: (playerId: string) => ipcRenderer.invoke('sessions:list', playerId)
  },

  videos: {
    list: (input: ListVideosInput) => ipcRenderer.invoke('videos:list', input),
    update: (input: VideoUpdateInput) => ipcRenderer.invoke('videos:update', input),
    delete: (id: string) => ipcRenderer.invoke('videos:delete', id),
    importBatch: (input: ImportBatchInput) => ipcRenderer.invoke('videos:importBatch', input),
    sourceUrl: (fileRelpath: string) => `soccer://video/${encodeURIComponent(fileRelpath)}`
  },

  files: {
    pick: (options: FilePickOptions) => ipcRenderer.invoke('files:pick', options)
  }
}

contextBridge.exposeInMainWorld('soccerApi', api)
