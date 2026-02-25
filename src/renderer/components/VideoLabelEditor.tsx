import type { RefObject } from 'react'
import type { Skill } from '@shared/types'

export interface LabelState {
  skillId: string | null
  starred: number
  notes: string
}

interface VideoLabelEditorProps {
  skills: Skill[]
  value: LabelState
  onChange: (next: LabelState) => void
  onCreateSkill: () => Promise<string | null>
  notesRef?: RefObject<HTMLTextAreaElement>
}

export function VideoLabelEditor({ skills, value, onChange, onCreateSkill, notesRef }: VideoLabelEditorProps): JSX.Element {
  const options = [{ id: '__new', name: '+ New Skill...' }, { id: '__unassigned', name: 'Unassigned' }, ...skills.map(s => ({ id: s.id, name: s.name }))]

  return (
    <div className="label-editor">
      <label className="field">
        <span>Skill</span>
        <select
          className="select"
          value={value.skillId ?? '__unassigned'}
          onChange={async e => {
            const selected = e.target.value
            if (selected === '__new') {
              const createdId = await onCreateSkill()
              if (!createdId) return
              onChange({ ...value, skillId: createdId })
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
