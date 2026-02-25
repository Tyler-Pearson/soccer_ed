import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player, Session, Skill, Video, VideoWithSkillName } from '@shared/types'
import { PlayerPicker } from './components/PlayerPicker'
import { TriageModal } from './components/TriageModal'
import { VideoLabelEditor, type LabelState } from './components/VideoLabelEditor'

type SkillFilter = 'all' | 'unassigned' | string

interface SessionDraft {
  playerId: string
  notes: string
  importPaths: string[]
}

export default function App(): JSX.Element {
  const [libraryRoot, setLibraryRoot] = useState<string | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null)
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillFilter, setSkillFilter] = useState<SkillFilter>('all')
  const [videos, setVideos] = useState<VideoWithSkillName[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [error, setError] = useState<string>('')

  const [startSessionOpen, setStartSessionOpen] = useState(false)
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>({ playerId: '', notes: '', importPaths: [] })
  const [triageOpen, setTriageOpen] = useState(false)
  const [triageVideos, setTriageVideos] = useState<Video[]>([])
  const [triagePlayerId, setTriagePlayerId] = useState<string | null>(null)

  const [retriageOpen, setRetriageOpen] = useState(false)
  const [retriageDraft, setRetriageDraft] = useState<LabelState | null>(null)
  const [deleteVideoOpen, setDeleteVideoOpen] = useState(false)
  const notesRef = useRef<HTMLTextAreaElement>(null)

  const [playerModalOpen, setPlayerModalOpen] = useState(false)
  const [playerNameDraft, setPlayerNameDraft] = useState('')
  const [renamePlayerModalOpen, setRenamePlayerModalOpen] = useState(false)
  const [renamePlayerDraft, setRenamePlayerDraft] = useState('')

  const [skillModalOpen, setSkillModalOpen] = useState(false)
  const [skillModalPlayerId, setSkillModalPlayerId] = useState<string | null>(null)
  const [skillNameDraft, setSkillNameDraft] = useState('')
  const skillPromiseResolver = useRef<((id: string | null) => void) | null>(null)
  const [libraryModalOpen, setLibraryModalOpen] = useState(false)
  const [libraryConfirm, setLibraryConfirm] = useState(false)
  const [restoreConfirm, setRestoreConfirm] = useState(false)
  const [videoLoadError, setVideoLoadError] = useState(false)

  const selectedVideo = useMemo(() => videos.find(v => v.id === selectedVideoId) ?? null, [videos, selectedVideoId])

  async function refreshPlayers(preserveSelection = true): Promise<void> {
    const list = await window.soccerApi.players.list()
    setPlayers(list)

    if (!preserveSelection || !selectedPlayerId || !list.some(p => p.id === selectedPlayerId)) {
      setSelectedPlayerId(list[0]?.id ?? null)
    }
  }

  async function refreshSkills(playerId: string): Promise<void> {
    const list = await window.soccerApi.skills.list(playerId)
    setSkills(list)
  }

  async function refreshVideos(playerId: string, filter: SkillFilter, direction: 'asc' | 'desc'): Promise<void> {
    const list = await window.soccerApi.videos.list({
      playerId,
      skillFilter: filter,
      sortDirection: direction
    })
    setVideos(list)
    if (!list.some(v => v.id === selectedVideoId)) {
      setSelectedVideoId(list[0]?.id ?? null)
    }
  }

  async function refreshSessions(playerId: string): Promise<void> {
    const list = await window.soccerApi.sessions.list(playerId)
    setSessions(list)
  }

  useEffect(() => {
    const run = async (): Promise<void> => {
      const root = await window.soccerApi.app.getLibraryRoot()
      setLibraryRoot(root)
      await refreshPlayers(false)
    }
    run().catch(err => setError(err.message || 'Failed to initialize app'))
  }, [])

  useEffect(() => {
    if (!selectedPlayerId) return
    refreshSkills(selectedPlayerId).catch(err => setError(err.message || 'Failed to load skills'))
    refreshSessions(selectedPlayerId).catch(err => setError(err.message || 'Failed to load sessions'))
  }, [selectedPlayerId])

  useEffect(() => {
    if (!selectedPlayerId) return
    refreshVideos(selectedPlayerId, skillFilter, sortDirection).catch(err => setError(err.message || 'Failed to load videos'))
  }, [selectedPlayerId, skillFilter, sortDirection])

  useEffect(() => {
    setVideoLoadError(false)
  }, [selectedVideoId])

  async function createSkillForPlayer(playerId: string, name: string): Promise<string | null> {
    if (!name.trim()) return null
    const created = await window.soccerApi.skills.create(playerId, name)
    if (selectedPlayerId === playerId || triagePlayerId === playerId) {
      const list = await window.soccerApi.skills.list(playerId)
      setSkills(list)
    }
    return created.id
  }

  function requestNewSkill(playerId: string): Promise<string | null> {
    setSkillModalPlayerId(playerId)
    setSkillNameDraft('')
    setSkillModalOpen(true)
    return new Promise(resolve => {
      skillPromiseResolver.current = resolve
    })
  }

  async function openStartSession(): Promise<void> {
    if (!selectedPlayerId) return
    setSessionDraft({ playerId: selectedPlayerId, notes: '', importPaths: [] })
    setStartSessionOpen(true)
  }

  async function runImportAndTriage(): Promise<void> {
    try {
      if (!sessionDraft.playerId || sessionDraft.importPaths.length === 0) {
        setError('Select player and import at least one video file/folder')
        return
      }

      const session = await window.soccerApi.sessions.create(sessionDraft.playerId, sessionDraft.notes)
      const result = await window.soccerApi.videos.importBatch({
        playerId: sessionDraft.playerId,
        sessionId: session.id,
        filePaths: sessionDraft.importPaths
      })
      const triageSkills = await window.soccerApi.skills.list(sessionDraft.playerId)
      setSkills(triageSkills)

      if (result.skipped.length > 0) {
        const sample = result.skipped.slice(0, 3).map(item => `${item.path}: ${item.reason}`).join('\n')
        setError(`Some files were skipped:\n${sample}`)
      }

      setTriageVideos(result.imported)
      setTriagePlayerId(sessionDraft.playerId)
      setTriageOpen(true)
      setStartSessionOpen(false)

      if (sessionDraft.playerId !== selectedPlayerId) {
        setSelectedPlayerId(sessionDraft.playerId)
      } else {
        await refreshSessions(sessionDraft.playerId)
        await refreshVideos(sessionDraft.playerId, skillFilter, sortDirection)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import videos')
    }
  }

  async function applyBatchUpdates(
    updates: Array<{ id: string; skillId: string | null; starred: number; notes: string; displayName: string; recordedAt: number }>
  ): Promise<void> {
    for (const update of updates) {
      await window.soccerApi.videos.update(update)
    }

    if (selectedPlayerId) {
      await refreshVideos(selectedPlayerId, skillFilter, sortDirection)
    }
  }

  async function addPaths(mode: 'files' | 'folder'): Promise<void> {
    const picked = await window.soccerApi.files.pick({ mode })
    if (picked.length === 0) return
    setSessionDraft(prev => ({
      ...prev,
      importPaths: [...new Set([...prev.importPaths, ...picked])]
    }))
  }

  async function saveRetriage(): Promise<void> {
    if (!selectedVideo) return
    const value =
      retriageDraft ?? {
        skillId: selectedVideo.skillId,
        notes: selectedVideo.notes,
        starred: selectedVideo.starred,
        displayName: selectedVideo.displayName,
        recordedAt: selectedVideo.recordedAt
      }
    await window.soccerApi.videos.update({
      id: selectedVideo.id,
      skillId: value.skillId,
      notes: value.notes,
      starred: value.starred,
      displayName: value.displayName,
      recordedAt: value.recordedAt
    })
    setRetriageOpen(false)
    setRetriageDraft(null)
    if (selectedPlayerId) {
      await refreshVideos(selectedPlayerId, skillFilter, sortDirection)
    }
  }

  async function deleteSelectedVideo(): Promise<void> {
    if (!selectedVideo || !selectedPlayerId) return
    await window.soccerApi.videos.delete(selectedVideo.id)
    setDeleteVideoOpen(false)
    await refreshVideos(selectedPlayerId, skillFilter, sortDirection)
  }

  async function submitAddPlayer(): Promise<void> {
    if (!playerNameDraft.trim()) return
    const created = await window.soccerApi.players.create(playerNameDraft)
    const list = await window.soccerApi.players.list()
    setPlayers(list)
    setSelectedPlayerId(created.id)
    setPlayerModalOpen(false)
    setPlayerNameDraft('')
  }

  async function submitRenamePlayer(): Promise<void> {
    if (!selectedPlayerId || !renamePlayerDraft.trim()) return
    await window.soccerApi.players.update(selectedPlayerId, renamePlayerDraft.trim())
    await refreshPlayers(true)
    setRenamePlayerModalOpen(false)
    setRenamePlayerDraft('')
  }

  async function chooseNewLibraryRoot(): Promise<void> {
    if (!libraryConfirm) return
    const selected = await window.soccerApi.app.chooseLibraryRoot()
    if (selected) {
      setLibraryRoot(selected)
      setLibraryModalOpen(false)
      setLibraryConfirm(false)
    }
  }

  async function createTransferBackup(): Promise<void> {
    const backupPath = await window.soccerApi.app.createBackup()
    if (backupPath) {
      setError(`Backup created:\n${backupPath}`)
    }
  }

  async function restoreTransferBackup(): Promise<void> {
    if (!restoreConfirm) return
    const restored = await window.soccerApi.app.restoreBackup()
    if (restored) {
      setLibraryRoot(restored.restoredLibraryRoot)
      if (selectedPlayerId) {
        await refreshSkills(selectedPlayerId)
        await refreshSessions(selectedPlayerId)
        await refreshVideos(selectedPlayerId, skillFilter, sortDirection)
      }
      setError(`Restore complete:\nBackup: ${restored.backupPath}\nLibrary: ${restored.restoredLibraryRoot}`)
      setRestoreConfirm(false)
      setLibraryModalOpen(false)
    }
  }

  async function submitAddSkill(): Promise<void> {
    if (!skillModalPlayerId || !skillNameDraft.trim()) return
    try {
      const createdId = await createSkillForPlayer(skillModalPlayerId, skillNameDraft)
      setSkillModalOpen(false)
      setSkillNameDraft('')
      setSkillModalPlayerId(null)
      skillPromiseResolver.current?.(createdId)
      skillPromiseResolver.current = null
    } catch (err: any) {
      setError(err.message || 'Failed to create skill')
    }
  }

  function cancelAddSkill(): void {
    setSkillModalOpen(false)
    setSkillNameDraft('')
    setSkillModalPlayerId(null)
    skillPromiseResolver.current?.(null)
    skillPromiseResolver.current = null
  }

  if (!libraryRoot) {
    return (
      <div className="onboarding">
        <h1>Soccer Technique Tracker</h1>
        <p>Choose a local Library Root folder to store copied videos and metadata references.</p>
        <p>Pick a parent location. The app creates a nested <strong>SoccerTechniqueLibrary</strong> folder there.</p>
        <button
          className="btn"
          type="button"
          onClick={async () => {
            const selected = await window.soccerApi.app.chooseLibraryRoot()
            if (selected) setLibraryRoot(selected)
          }}
        >
          Choose Library Folder
        </button>
      </div>
    )
  }

  const latestSessionNote = sessions.find(session => session.notes.trim().length > 0)?.notes ?? ''

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-spacer" />
        <PlayerPicker
          players={players}
          selectedPlayerId={selectedPlayerId}
          onSelect={id => {
            setSelectedPlayerId(id)
            setSkillFilter('all')
          }}
          onAddPlayer={() => {
            setPlayerNameDraft('')
            setPlayerModalOpen(true)
          }}
        />
        <div className="topbar-actions">
          <button className="btn btn-secondary" type="button" onClick={() => setLibraryModalOpen(true)}>
            Storage
          </button>
          <button className="btn" type="button" onClick={openStartSession} disabled={!selectedPlayerId}>
            New Session
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
          <div className="sidebar-head">
            <div className="sidebar-head-label">Selected Player</div>
            <div className="sidebar-head-name">
              {players.find(player => player.id === selectedPlayerId)?.name ?? 'None'}
            </div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => {
                const currentName = players.find(player => player.id === selectedPlayerId)?.name ?? ''
                setRenamePlayerDraft(currentName)
                setRenamePlayerModalOpen(true)
              }}
              disabled={!selectedPlayerId}
            >
              Rename Player
            </button>
            {latestSessionNote ? <div className="session-note">Latest Session Note: {latestSessionNote}</div> : null}
          </div>
          <button
            className={`sidebar-item ${skillFilter === 'all' ? 'active' : ''}`}
            type="button"
            onClick={() => setSkillFilter('all')}
          >
            All Videos
          </button>
          <button
            className={`sidebar-item ${skillFilter === 'unassigned' ? 'active' : ''}`}
            type="button"
            onClick={() => setSkillFilter('unassigned')}
          >
            Unassigned
          </button>
          {skills.map(skill => (
            <button
              key={skill.id}
              className={`sidebar-item ${skillFilter === skill.id ? 'active' : ''}`}
              type="button"
              onClick={() => setSkillFilter(skill.id)}
            >
              {skill.name}
            </button>
          ))}
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              if (!selectedPlayerId) return
              void requestNewSkill(selectedPlayerId)
            }}
            disabled={!selectedPlayerId}
          >
            + Add Skill
          </button>
        </aside>

        <section className="viewer">
          {selectedVideo ? (
            <>
              <video
                className="video"
                controls
                src={window.soccerApi.videos.sourceUrl(selectedVideo.fileRelpath)}
                onLoadedData={() => setVideoLoadError(false)}
                onError={() => setVideoLoadError(true)}
              />
              <div className="video-meta">
                <div>
                  <strong>{selectedVideo.displayName}</strong>
                </div>
                <div>File: {selectedVideo.originalName}</div>
                <div>{new Date(selectedVideo.recordedAt).toLocaleString()}</div>
                <div>{selectedVideo.skillName ?? 'Unassigned'}</div>
                <div className={selectedVideo.notes ? 'video-note-strong' : 'video-note-empty'}>
                  {selectedVideo.notes || 'No notes'}
                </div>
                {videoLoadError ? (
                  <div className="video-note-error">
                    Video file could not be loaded. This record may still point to an older storage location.
                  </div>
                ) : null}
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setRetriageDraft({
                    skillId: selectedVideo.skillId,
                    starred: selectedVideo.starred,
                    notes: selectedVideo.notes,
                    displayName: selectedVideo.displayName,
                    recordedAt: selectedVideo.recordedAt
                  })
                  setRetriageOpen(true)
                }}
              >
                Re-triage
              </button>
              <button className="btn btn-danger" type="button" onClick={() => setDeleteVideoOpen(true)}>
                Delete Video
              </button>
            </>
          ) : (
            <div className="empty-line">No video selected.</div>
          )}
        </section>

        <section className="list-panel">
          <div className="list-toolbar">
            <div>Videos ({videos.length})</div>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={() => setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))}
            >
              Sort: {sortDirection === 'asc' ? 'Oldest → Newest' : 'Newest → Oldest'}
            </button>
          </div>

          <div className="video-list">
            {videos.map(video => (
              <button
                key={video.id}
                type="button"
                className={`video-row ${video.id === selectedVideoId ? 'active' : ''}`}
                onClick={() => setSelectedVideoId(video.id)}
              >
                <div className="video-icon">▶</div>
                <div className="video-row-main">
                  <div className="video-row-title">{video.displayName}</div>
                  <div className="video-row-meta">{new Date(video.recordedAt).toLocaleString()}</div>
                  <div className="video-row-meta">{video.originalName}</div>
                  <div className={video.notes ? 'video-row-notes' : 'video-row-notes-empty'}>
                    {video.notes || 'No notes'}
                  </div>
                </div>
                <div className="video-row-star">{video.starred ? '★' : '☆'}</div>
              </button>
            ))}
            {videos.length === 0 && <div className="empty-line">No videos in this view.</div>}
          </div>
        </section>
      </main>

      {startSessionOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>New Session</h2>
            <label className="field">
              <span>Player</span>
              <select
                className="select"
                value={sessionDraft.playerId}
                onChange={e => setSessionDraft(prev => ({ ...prev, playerId: e.target.value }))}
              >
                {players.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="field">
              <span>Session Notes (optional)</span>
              <textarea
                className="textarea"
                rows={3}
                value={sessionDraft.notes}
                onChange={e => setSessionDraft(prev => ({ ...prev, notes: e.target.value }))}
              />
            </label>

            <div className="import-actions">
              <button className="btn btn-secondary" type="button" onClick={() => addPaths('files')}>
                Add Files
              </button>
              <button className="btn btn-secondary" type="button" onClick={() => addPaths('folder')}>
                Add Folder
              </button>
              <span>{sessionDraft.importPaths.length} path(s) selected</span>
            </div>

            <div className="import-list">
              {sessionDraft.importPaths.map(p => (
                <div key={p} className="mono-line">
                  {p}
                </div>
              ))}
            </div>

            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setStartSessionOpen(false)}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={runImportAndTriage}>
                Start Triage
              </button>
            </div>
          </div>
        </div>
      )}

      <TriageModal
        open={triageOpen}
        importedVideos={triageVideos}
        skills={skills}
        sessionNotes={sessionDraft.notes}
        onCreateSkill={name => (triagePlayerId ? createSkillForPlayer(triagePlayerId, name) : Promise.resolve(null))}
        onClose={async () => {
          setTriageOpen(false)
          if (selectedPlayerId) {
            await refreshSkills(selectedPlayerId)
            await refreshSessions(selectedPlayerId)
            await refreshVideos(selectedPlayerId, skillFilter, sortDirection)
          }
        }}
        onSaveAll={applyBatchUpdates}
      />

      {retriageOpen && selectedVideo && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Re-triage</h2>
            <VideoLabelEditor
              skills={skills}
              notesRef={notesRef}
              onCreateSkill={name => createSkillForPlayer(selectedVideo.playerId, name)}
              value={
                retriageDraft ?? {
                  skillId: selectedVideo.skillId,
                  starred: selectedVideo.starred,
                  notes: selectedVideo.notes,
                  displayName: selectedVideo.displayName,
                  recordedAt: selectedVideo.recordedAt
                }
              }
              onChange={setRetriageDraft}
            />
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setRetriageOpen(false)
                  setRetriageDraft(null)
                }}
              >
                Cancel
              </button>
              <button className="btn" type="button" onClick={() => void saveRetriage()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteVideoOpen && selectedVideo && (
        <div className="modal-backdrop">
          <div className="modal small-modal">
            <h2>Delete Video</h2>
            <div>This permanently deletes the video file and metadata record.</div>
            <div className="field">
              <span>Video</span>
              <div className="mono-line">{selectedVideo.displayName}</div>
              <div className="mono-line">{selectedVideo.originalName}</div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setDeleteVideoOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" type="button" onClick={() => void deleteSelectedVideo()}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {playerModalOpen && (
        <div className="modal-backdrop">
          <div className="modal small-modal">
            <h2>Add Player</h2>
            <label className="field">
              <span>Player Name</span>
              <input className="input" value={playerNameDraft} onChange={e => setPlayerNameDraft(e.target.value)} autoFocus />
            </label>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setPlayerModalOpen(false)}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={() => void submitAddPlayer()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {renamePlayerModalOpen && (
        <div className="modal-backdrop">
          <div className="modal small-modal">
            <h2>Rename Player</h2>
            <label className="field">
              <span>Player Name</span>
              <input className="input" value={renamePlayerDraft} onChange={e => setRenamePlayerDraft(e.target.value)} autoFocus />
            </label>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={() => setRenamePlayerModalOpen(false)}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={() => void submitRenamePlayer()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {libraryModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <h2>Storage Location</h2>
            <div className="field">
              <span>Current Location</span>
              <div className="mono-line">{libraryRoot ?? 'Not set'}</div>
            </div>
            <div className="field">
              <span>
                Choose where local player/video data should live. The app will create a nested folder named
                <strong> SoccerTechniqueLibrary</strong>.
              </span>
            </div>
            <label className="field-inline">
              <input type="checkbox" checked={libraryConfirm} onChange={e => setLibraryConfirm(e.target.checked)} />
              <span>I understand this copies current library data to the newly selected location.</span>
            </label>
            <div className="modal-actions">
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => {
                  setLibraryModalOpen(false)
                  setLibraryConfirm(false)
                }}
              >
                Cancel
              </button>
              <button className="btn" type="button" disabled={!libraryConfirm} onClick={() => void chooseNewLibraryRoot()}>
                Choose Parent Folder
              </button>
            </div>
            <hr />
            <h3>Machine Transfer</h3>
            <div className="modal-actions left-actions">
              <button className="btn btn-secondary" type="button" onClick={() => void createTransferBackup()}>
                Create Backup Bundle
              </button>
            </div>
            <label className="field-inline">
              <input type="checkbox" checked={restoreConfirm} onChange={e => setRestoreConfirm(e.target.checked)} />
              <span>Restore overwrites app metadata (players/skills/videos) from a chosen backup.</span>
            </label>
            <div className="modal-actions left-actions">
              <button className="btn" type="button" disabled={!restoreConfirm} onClick={() => void restoreTransferBackup()}>
                Restore From Backup Bundle
              </button>
            </div>
          </div>
        </div>
      )}

      {skillModalOpen && (
        <div className="modal-backdrop">
          <div className="modal small-modal">
            <h2>Add Skill</h2>
            <label className="field">
              <span>Skill Name</span>
              <input className="input" value={skillNameDraft} onChange={e => setSkillNameDraft(e.target.value)} autoFocus />
            </label>
            <div className="modal-actions">
              <button className="btn btn-secondary" type="button" onClick={cancelAddSkill}>
                Cancel
              </button>
              <button className="btn" type="button" onClick={() => void submitAddSkill()}>
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="toast" role="alert" onClick={() => setError('')}>
          {error}
        </div>
      )}
    </div>
  )
}
