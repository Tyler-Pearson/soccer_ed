import type { RefObject } from 'react'
import type { Skill } from '@shared/types'

export interface LabelState {
  skillId: string | null
  starred: number
  notes: string
  displayName: string
  recordedAt: number
}

interface VideoLabelEditorProps {
  skills: Skill[]
  value: LabelState
  onChange: (next: LabelState) => void
  onCreateSkill: () => Promise<string | null>
  notesRef?: RefObject<HTMLTextAreaElement>
}

function toLocalInputValue(timestamp: number): string {
  const d = new Date(timestamp)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`
}

export function VideoLabelEditor({ skills, value, onChange, onCreateSkill, notesRef }: VideoLabelEditorProps): JSX.Element {
  const options = [{ id: '__new', name: '+ New Skill...' }, { id: '__unassigned', name: 'Unassigned' }, ...skills.map(s => ({ id: s.id, name: s.name }))]

  return (
    <div className="label-editor">
      <label className="field">
        <span>Display Name</span>
        <input
          className="input"
          value={value.displayName}
          onChange={e => onChange({ ...value, displayName: e.target.value })}
        />
      </label>

      <label className="field">
        <span>Recorded At</span>
        <input
          type="datetime-local"
          className="input"
          value={toLocalInputValue(value.recordedAt)}
          onChange={e => {
            const ts = new Date(e.target.value).getTime()
            if (!Number.isNaN(ts)) {
              onChange({ ...value, recordedAt: ts })
            }
          }}
        />
      </label>

      <label className="field">
        <span>Skill</span>
        <select
          className="select"
          value={value.skillId ?? '__unassigned'}
          onChange={e => {
            const selected = e.target.value
            if (selected === '__new') {
              void onCreateSkill().then(createdId => {
                if (!createdId) return
                onChange({ ...value, skillId: createdId })
              })
              return
            }
            onChange({ ...value, skillId: selected === '__unassigned' ? null : selected })
          }}
        >
          {options.map(option => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
      </label>

      <label className="field-inline">
        <input
          type="checkbox"
          checked={value.starred === 1}
          onChange={e => onChange({ ...value, starred: e.target.checked ? 1 : 0 })}
        />
        <span>Starred</span>
      </label>

      <label className="field">
        <span>Notes</span>
        <textarea
          ref={notesRef}
          className="textarea"
          placeholder="Quick note"
          rows={3}
          value={value.notes}
          onChange={e => onChange({ ...value, notes: e.target.value })}
        />
      </label>
    </div>
  )
}
