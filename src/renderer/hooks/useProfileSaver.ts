// useProfileSaver — the per-session "persist my localStorage change to YAML" hook.
//
// The one-liner every panel needs after a character-scoped localStorage write:
// call the returned `saveProfile()` and `scheduleProfileSave` (../profile)
// debounces a YAML flush for that character (2.5s). It resolves the session's
// identity (account / character / game / useLich) from `useSessions()` by
// character name, so it must run under a CharacterProvider — inside a
// GameWindow's tree. Its returned function has a STABLE identity on purpose
// (sessions are read through a ref): panels put it in effect deps, and a
// callback that churned on every vital tick would re-fire all of them.

import { profileKey } from '../../shared/profileKey'
import { useCallback, useEffect, useRef } from 'react'
import { useCharacter } from '../CharacterContext'
import { useSessions, type SessionRecord } from '../SessionsContext'
import { scheduleProfileSave } from '../profile'

// Returns a stable `saveProfile()` callback bound to the current character's
// session info. Call it after any per-character localStorage write so the
// debounced YAML save fires within 2.5s — crash-resilient even before the
// graceful-shutdown defense kicks in.
//
// Why a ref: useSessions().sessions changes on every status update (vital tick,
// rt tick, etc.) which would re-create the returned callback on every render
// and force any useEffect that depends on it to re-fire. Using a ref keeps the
// returned function identity stable so dep arrays don't churn.
export function useProfileSaver(): () => void {
  const character = useCharacter()
  const { sessions } = useSessions()
  const sessionsRef = useRef<SessionRecord[]>(sessions)
  useEffect(() => { sessionsRef.current = sessions }, [sessions])

  return useCallback(() => {
    // `character` is the profile key (DESIGN §56.7.3), so match on the key.
    const s = sessionsRef.current.find(s => profileKey(s.character, s.game).toLowerCase() === character.toLowerCase())
    if (s) scheduleProfileSave(s.account, character, s.game, s.useLich)
  }, [character])
}
