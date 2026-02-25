import { useEffect, useMemo, useRef, useState } from 'react'
import type { Skill, Video } from '@shared/types'
import { VideoLabelEditor, type LabelState } from './VideoLabelEditor'

interface TriageModalProps {
  open: boolean
  importedVideos: Video[]
  skills: Skill[]
  onClose: () => void
  onCreateSkill: () => Promise<string | null>
  onSaveAll: (updates: Array<{ id: string; skillId: string | null; starred: number; notes: string }>) => Promise<void>
}

export function TriageModal({ open, importedVideos, skills, onClose, onCreateSkill, onSaveAll }: TriageModalProps): JSX.Element | null {
  const [index, setIndex] = useState(0)
  const [lastUsedSkillId, setLastUsedSkillId] = useState<string | null>(null)
  const [edits, setEdits] = useState<Record<string, LabelState>>({})
  const notesRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!open) return
    setIndex(0)
    setLastUsedSkillId(null)
    setEdits({})
  }, [open, importedVideos])

  const selected = importedVideos[index]

  useEffect(() => {
    if (!open || !selected) return
    setEdits(prev => {
      if (prev[selected.id]) return prev
      const defaultSkillId = lastUsedSkillId
      return {
        ...prev,
        [selected.id]: {
          skillId: defaultSkillId,
          starred: selected.starred,
          notes: selected.notes
        }
      }
    })
  }, [open, selected, lastUsedSkillId])

  const value = selected
    ? edits[selected.id] ?? {
        skillId: null,
        starred: selected.starred,
        notes: selected.notes
      }
    : null

  const skillHotkeyList = useMemo(() => [null, ...skills.slice(0, 8).map(s => s.id)], [skills])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const isTyping = target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)

      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault()
        setIndex(i => Math.min(importedVideos.length - 1, i + 1))
        return
      }

      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault()
        setIndex(i => Math.max(0, i - 1))
        return
      }

      if (e.key.toLowerCase() === 's' && !isTyping && selected && value) {
        e.preventDefault()
        setEdits(prev => ({
          ...prev,
          [selected.id]: {
            ...value,
            starred: value.starred === 1 ? 0 : 1
          }
        }))
        return
      }

      if (e.key === 'Enter' && !isTyping) {
        notesRef.current?.focus()
        return
      }

      if (e.key === 'Escape') {
        notesRef.current?.blur()
        return
      }

      if (/^[1-9]$/.test(e.key) && selected && value) {
        const idx = Number(e.key) - 1
        const skillId = skillHotkeyList[idx]
        if (idx >= 0 && idx < skillHotkeyList.length) {
          e.preventDefault()
          setEdits(prev => ({
            ...prev,
            [selected.id]: {
              ...value,
              skillId
            }
          }))
          setLastUsedSkillId(skillId)
        }
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, importedVideos.length, selected, value, skillHotkeyList])

  if (!open) return null

  const taggedCount = Object.keys(edits).length

  return (
    <div className="modal-backdrop">
      <div className="triage-modal">
        <div className="triage-header">
          <h2>Session Triage</h2>
          <div className="triage-progress">Tagged {taggedCount} / {importedVideos.length}</div>
        </div>

        <div className="triage-body">
          <div className="triage-list">
            {importedVideos.map((video, i) => (
              <button
                key={video.id}
                className={`triage-row ${i === index ? 'active' : ''}`}
                type="button"
                onClick={() => setIndex(i)}
              >
                <span className="triage-name">{video.originalName}</span>
                <span className="triage-time">{new Date(video.recordedAt).toLocaleString()}</span>
              </button>
            ))}
          </div>

          <div className="triage-panel">
            {selected ? (
              <>
                <video className="video" controls src={window.soccerApi.videos.sourceUrl(selected.fileRelpath)} />
                {value && (
                  <VideoLabelEditor
                    value={value}
                    skills={skills}
                    notesRef={notesRef}
                    onCreateSkill={onCreateSkill}
                    onChange={next => {
                      setEdits(prev => ({ ...prev, [selected.id]: next }))
                      setLastUsedSkillId(next.skillId)
                    }}
                  />
                )}
              </>
            ) : (
              <div className="empty-line">No videos in this session.</div>
            )}
          </div>
        </div>

        <div className="modal-actions">
          <button className="btn btn-secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn"
            type="button"
            onClick={async () => {
              const updates = Object.entries(edits).map(([id, v]) => ({ id, ...v }))
              await onSaveAll(updates)
              onClose()
            }}
          >
            Finish Session
          </button>
        </div>
      </div>
    </div>
  )
}
