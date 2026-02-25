import { useEffect, useMemo, useRef, useState } from 'react'
import type { Player, Skill, Video, VideoWithSkillName } from '@shared/types'
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
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc')
  const [error, setError] = useState<string>('')

  const [startSessionOpen, setStartSessionOpen] = useState(false)
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>({ playerId: '', notes: '', importPaths: [] })
  const [triageOpen, setTriageOpen] = useState(false)
  const [triageVideos, setTriageVideos] = useState<Video[]>([])

  const [retriageOpen, setRetriageOpen] = useState(false)
  const [retriageDraft, setRetriageDraft] = useState<LabelState | null>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)

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
  }, [selectedPlayerId])

  useEffect(() => {
    if (!selectedPlayerId) return
    refreshVideos(selectedPlayerId, skillFilter, sortDirection).catch(err => setError(err.message || 'Failed to load videos'))
  }, [selectedPlayerId, skillFilter, sortDirection])

  async function createSkillPrompt(): Promise<string | null> {
    if (!selectedPlayerId) return null
    const name = window.prompt('New skill name')
    if (!name || !name.trim()) return null
    const created = await window.soccerApi.skills.create(selectedPlayerId, name)
    await refreshSkills(selectedPlayerId)
    return created.id
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
      setTriageOpen(true)
      setStartSessionOpen(false)

      if (sessionDraft.playerId !== selectedPlayerId) {
        setSelectedPlayerId(sessionDraft.playerId)
      } else {
        await refreshVideos(sessionDraft.playerId, skillFilter, sortDirection)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to import videos')
    }
  }

  async function applyBatchUpdates(
    updates: Array<{ id: string; skillId: string | null; starred: number; notes: string }>
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
    const value = retriageDraft ?? {
      skillId: selectedVideo.skillId,
      notes: selectedVideo.notes,
      starred: selectedVideo.starred
    }
    await window.soccerApi.videos.update({
      id: selectedVideo.id,
      skillId: value.skillId,
      notes: value.notes,
      starred: value.starred
    })
    setRetriageOpen(false)
    setRetriageDraft(null)
    if (selectedPlayerId) {
      await refreshVideos(selectedPlayerId, skillFilter, sortDirection)
    }
  }

  if (!libraryRoot) {
    return (
      <div className="onboarding">
        <h1>Soccer Technique Tracker</h1>
        <p>Choose a local Library Root folder to store copied videos and metadata references.</p>
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
          onAddPlayer={async () => {
            const name = window.prompt('Player name')
            if (!name || !name.trim()) return
            await window.soccerApi.players.create(name)
            await refreshPlayers(false)
          }}
        />
        <div className="topbar-actions">
          <button className="btn" type="button" onClick={openStartSession} disabled={!selectedPlayerId}>
            New Session
          </button>
        </div>
      </header>

      <main className="layout">
        <aside className="sidebar">
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
          <button className="btn btn-secondary" type="button" onClick={createSkillPrompt} disabled={!selectedPlayerId}>
            + Add Skill
          </button>
        </aside>

        <section className="viewer">
          {selectedVideo ? (
            <>
              <video className="video" controls src={window.soccerApi.videos.sourceUrl(selectedVideo.fileRelpath)} />
              <div className="video-meta">
                <div><strong>{selectedVideo.originalName}</strong></div>
                <div>{new Date(selectedVideo.recordedAt).toLocaleString()}</div>
                <div>{selectedVideo.skillName ?? 'Unassigned'}</div>
                <div>{selectedVideo.notes || 'No notes'}</div>
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setRetriageDraft({
                    skillId: selectedVideo.skillId,
                    starred: selectedVideo.starred,
                    notes: selectedVideo.notes
                  })
                  setRetriageOpen(true)
                }}
              >
                Re-triage
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
                  <div className="video-row-title">{video.originalName}</div>
                  <div className="video-row-meta">{new Date(video.recordedAt).toLocaleString()}</div>
                  <div className="video-row-notes">{video.notes || 'No notes'}</div>
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
        onCreateSkill={createSkillPrompt}
        onClose={async () => {
          setTriageOpen(false)
          if (selectedPlayerId) {
            await refreshSkills(selectedPlayerId)
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
              onCreateSkill={createSkillPrompt}
              value={
                retriageDraft ?? {
                  skillId: selectedVideo.skillId,
                  starred: selectedVideo.starred,
                  notes: selectedVideo.notes
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

      {error && (
        <div className="toast" role="alert" onClick={() => setError('')}>
          {error}
        </div>
      )}
    </div>
  )
}
