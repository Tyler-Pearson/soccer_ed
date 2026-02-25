import { useMemo, useState } from 'react'
import type { Player } from '@shared/types'

interface PlayerPickerProps {
  players: Player[]
  selectedPlayerId: string | null
  onSelect: (playerId: string) => void
  onAddPlayer: () => void
}

export function PlayerPicker({ players, selectedPlayerId, onSelect, onAddPlayer }: PlayerPickerProps): JSX.Element {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return players
    return players.filter(player => player.name.toLowerCase().includes(q))
  }, [players, query])

  const selected = players.find(p => p.id === selectedPlayerId)

  return (
    <div className="picker-root">
      <button className="picker-trigger" onClick={() => setOpen(prev => !prev)} type="button">
        {selected?.name ?? 'Select player'}
      </button>
      {open && (
        <div className="picker-popover">
          <input
            className="input"
            autoFocus
            placeholder="Search player"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          <button
            className="btn btn-secondary"
            type="button"
            onClick={() => {
              setOpen(false)
              onAddPlayer()
            }}
          >
            + Add Player
          </button>
          <div className="picker-list">
            {filtered.map(player => (
              <button
                className={`picker-item ${player.id === selectedPlayerId ? 'active' : ''}`}
                key={player.id}
                type="button"
                onClick={() => {
                  onSelect(player.id)
                  setOpen(false)
                }}
              >
                {player.name}
              </button>
            ))}
            {filtered.length === 0 && <div className="empty-line">No players</div>}
          </div>
        </div>
      )}
    </div>
  )
}
