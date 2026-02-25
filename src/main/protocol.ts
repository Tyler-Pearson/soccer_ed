import { net, protocol } from 'electron'
import { pathToFileURL } from 'node:url'
import type { AppDb } from './db'
import { getLibraryRootOrThrow, resolveAbsVideoPath } from './library'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'soccer',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: false
    }
  }
])

export function registerVideoProtocol(db: AppDb): void {
  protocol.handle('soccer', async request => {
    const url = new URL(request.url)
    if (url.hostname !== 'video') {
      return new Response('Not found', { status: 404 })
    }

    const rel = decodeURIComponent(url.pathname.replace(/^\//, ''))
    const libraryRoot = getLibraryRootOrThrow(db)
    const absolute = resolveAbsVideoPath(libraryRoot, rel)
    return net.fetch(pathToFileURL(absolute).toString(), {
      headers: request.headers,
      method: request.method
    })
  })
}

export function buildVideoSourceUrl(fileRelpath: string): string {
  return `soccer://video/${encodeURIComponent(fileRelpath)}`
}
