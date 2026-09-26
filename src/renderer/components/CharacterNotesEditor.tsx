// CharacterNotesEditor — the launcher's "Edit profile — <name>" modal for the
// three LAUNCHER-OWNED profile fields: guild (from the canonical `GUILDS` list
// exported here), circle, and free-form notes.
//
// Controlled by the Launcher: it seeds the initial values, and `onSave`
// receives a patch that Launcher writes via `patchCharacterProfile` — the
// launcher-side read-modify-write, never a GameWindow save path. Empty fields
// go out as `undefined` so the YAML doesn't accumulate blanks; circle only
// survives as a real number. `onSave` is awaited behind a `busy` flag that
// also holds Esc / backdrop-close until the write settles. Portaled to
// `document.body`. `guildLabel()` is the display-side helper the Launcher's
// card pills use; the `.cne-*` markup is mirrored there too.
//
// v0.20.0: also the character's COLOUR (characterColors.ts) — which is NOT a
// profile field: it lives app-wide in _shared.yaml, keyed by account::character, so
// every window can paint that character's badge, tab and focus rings at once.
// Save writes it there directly (plus the shared-profile save) before handing
// the three profile fields to `onSave`. It counts toward `dirty` like the rest.
//
// B368: closing with an unsaved edit (✕, Cancel, backdrop, Esc) asks first —
// `dirty` compares the patch Save WOULD write against the same normalisation
// of the initial values, so it means exactly "Save would change something".

import { useId, useState, type KeyboardEvent } from 'react'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import { differs } from '../hooks/useUnsaved'
import { confirmDiscard } from '../confirm'
import ColorField from './ColorField'
import { characterColor, isPaintableColor, loadCharacterColors, setCharacterColor } from '../characterColors'
import { normalizeColorInput } from '../colors'
import { scheduleSharedProfileSave } from '../profile'
import { monogramStyle, nameColorHex, nameInitials } from '../utils/nameColor'
import { createPortal } from 'react-dom'
import '../styles/character-notes-editor.css'

// Canonical guild list — keys match themes.ts so picking "Empath" here
// could later auto-apply the Empath guild theme if we wire that up. Ordered
// alphabetically by display label.
export const GUILDS: { key: string; label: string }[] = [
  { key: 'barbarian',   label: 'Barbarian'    },
  { key: 'bard',        label: 'Bard'         },
  { key: 'cleric',      label: 'Cleric'       },
  { key: 'commoner',    label: 'Commoner'     },
  { key: 'empath',      label: 'Empath'       },
  { key: 'moonmage',    label: 'Moon Mage'    },
  { key: 'necromancer', label: 'Necromancer'  },
  { key: 'paladin',     label: 'Paladin'      },
  { key: 'ranger',      label: 'Ranger'       },
  { key: 'thief',       label: 'Thief'        },
  { key: 'trader',      label: 'Trader'       },
  { key: 'warriormage', label: 'Warrior Mage' },
]

export function guildLabel(key: string | undefined): string | null {
  if (!key) return null
  return GUILDS.find(g => g.key === key)?.label ?? null
}

type ProfilePatch = { guild: string | undefined; circle: number | undefined; notes: string | undefined }

// The form fields → what gets written. Empty string → undefined for guild and
// notes so the YAML doesn't accumulate empty fields. Circle parses as a
// number; non-numeric or empty stays undefined. Shared by Save and the dirty
// check, so the two can't disagree about what counts as a change.
function toPatch(guild: string, circle: string, notes: string): ProfilePatch {
  const circleNum = circle.trim() === '' ? undefined : Number(circle)
  return {
    guild:  guild.trim() === '' ? undefined : guild,
    circle: typeof circleNum === 'number' && !Number.isNaN(circleNum) ? circleNum : undefined,
    notes:  notes.trim() === '' ? undefined : notes,
  }
}

interface Props {
  characterName: string
  /** account::character::game — what the colour is keyed by. */
  characterId: string
  initialGuild: string | undefined
  initialCircle: number | undefined
  initialNotes: string | undefined
  onSave: (patch: ProfilePatch) => Promise<void>
  onCancel: () => void
}

export default function CharacterNotesEditor({
  characterName,
  characterId,
  initialGuild,
  initialCircle,
  initialNotes,
  onSave,
  onCancel,
}: Props) {
  const [guild,  setGuild]  = useState(initialGuild ?? '')
  const [circle, setCircle] = useState<string>(initialCircle == null ? '' : String(initialCircle))
  const [notes,  setNotes]  = useState(initialNotes ?? '')
  const [busy,   setBusy]   = useState(false)
  // '' = no colour of your own (the automatic one shows instead).
  const [initialColor] = useState(() => characterColor(loadCharacterColors(), { characterId }) ?? '')
  const [color,  setColor]  = useState(initialColor)
  const titleId = useId()

  // The baseline, captured once at open. Save unmounts the editor on success
  // (Launcher clears `editingNotes`), so it never needs re-basing.
  const [baseline] = useState(() =>
    toPatch(initialGuild ?? '', initialCircle == null ? '' : String(initialCircle), initialNotes ?? ''))
  // What Save would store: typed text resolved the way the field resolves it on
  // blur, so Enter straight after typing `ember` or `3fb950` saves the link or
  // the hex, not the raw text (ColorField calls onEnter before its own onChange
  // has rendered).
  const resolvedColor = color.trim() ? normalizeColorInput(color.trim(), { link: true }).trim() : ''
  // A colour nothing can paint (a half-typed name) is refused rather than
  // stored: every surface's color-mix() would go invalid.
  const colorBad = resolvedColor !== '' && !isPaintableColor(resolvedColor)
  const dirty = differs(toPatch(guild, circle, notes), baseline) || resolvedColor !== initialColor

  // Every way out goes through here. While a save is in flight it does
  // nothing, like the disabled ✕.
  function requestClose() {
    if (busy) return
    confirmDiscard(dirty, onCancel, `${characterName}'s profile`)
  }

  // Esc to cancel (B341: through the shared topmost-dialog hook). Still
  // CONSUMED while busy rather than `enabled: false`, which would let the key
  // fall through and close the dialog underneath (the + window, when opened
  // from there).
  useEscapeClose(requestClose)

  async function handleSave() {
    if (busy || colorBad) return
    setBusy(true)
    try {
      await onSave(toPatch(guild, circle, notes))
      // AFTER the profile save: if that throws, the editor stays open and dirty,
      // and a Cancel then really does discard the colour too.
      if (resolvedColor !== initialColor) {
        setCharacterColor(characterId, resolvedColor || null)
        scheduleSharedProfileSave()
      }
    } finally {
      setBusy(false)
    }
  }

  // B389: Enter in a single-line field (the circle input, the guild select)
  // saves. The notes textarea is multi-line and keeps Enter for newlines.
  function onFieldKeyDown(e: KeyboardEvent<HTMLInputElement | HTMLSelectElement>) {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); void handleSave() }
  }

  return createPortal(
    <div className="cne-backdrop" {...backdropHandlers(requestClose, !busy)}>
      <div className="cne-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="cne-header">
          <span className="cne-title" id={titleId}>Edit profile — {characterName}</span>
          <button type="button" className="ui-close" onClick={requestClose} disabled={busy} title="Close" aria-label="Close">✕</button>
        </div>

        <div className="cne-body">
          <div className="cne-row">
            <label className="cne-label">
              Guild
              {/* B397: the first field takes focus on open. */}
              <select
                value={guild}
                onChange={e => setGuild(e.target.value)}
                onKeyDown={onFieldKeyDown}
                disabled={busy}
                className="cne-input"
                autoFocus
              >
                <option value="">— None —</option>
                {GUILDS.map(g => (
                  <option key={g.key} value={g.key}>{g.label}</option>
                ))}
              </select>
            </label>
            <label className="cne-label cne-label--circle">
              Circle
              <input
                type="number"
                value={circle}
                onChange={e => setCircle(e.target.value)}
                onKeyDown={onFieldKeyDown}
                min={0}
                max={500}
                disabled={busy}
                className="cne-input"
                placeholder="—"
              />
            </label>
          </div>

          <div className="cne-label">
            <span>Color</span>
            <div className="cne-color-row">
              {/* What the colour looks like on a badge — live, before saving. */}
              <span className="cne-color-mono" style={monogramStyle(characterName, !colorBad && resolvedColor ? resolvedColor : undefined)} aria-hidden="true">
                {nameInitials(characterName)}
              </span>
              <ColorField
                value={color}
                onChange={setColor}
                label={`${characterName}'s color`}
                none={{ value: '', label: 'Automatic' }}
                defaultSwatch={nameColorHex(characterName)}
                placeholder="Automatic"
                onEnter={() => void handleSave()}
                aboveDialogs
              />
            </div>
            {colorBad && (
              <span className="ui-hint cne-color-error" role="alert">
                “{color.trim()}” isn't a color. Pick one from the ▾ list, type a hex like #3fb950, or clear it for Automatic.
              </span>
            )}
            <span className="ui-hint">
              Marks {characterName} across Lichborne: toast badges, the character tab, Team Login, the Overview and the Living Tableau. Pick one of your named colors to keep it linked. Automatic uses a color from the name.
            </span>
          </div>

          <label className="cne-label cne-label--notes">
            Notes
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              disabled={busy}
              className="cne-input cne-textarea"
              rows={8}
              placeholder="Free-form notes about this character — script settings, gear, training plans, whatever you'd like to remember."
            />
          </label>
        </div>

        <div className="cne-footer">
          <button type="button" className="ui-btn" onClick={requestClose} disabled={busy}>
            Cancel
          </button>
          {/* B345: both labels are always rendered in one grid cell, so the
              button keeps the wider one's width and Save → Saving… never
              resizes it (character-notes-editor.css). */}
          <button type="button" className="ui-btn ui-btn--primary ui-btn--stable" onClick={handleSave} disabled={busy || colorBad}
            title={colorBad ? "Fix the color first, or clear it for Automatic" : undefined}>
            <span className={`ui-btn-label${busy ? ' ui-btn-label--off' : ''}`}>Save</span>
            <span className={`ui-btn-label${busy ? '' : ' ui-btn-label--off'}`} aria-hidden={!busy}>Saving…</span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
