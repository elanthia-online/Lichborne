// Profile Transfer modal — the Export / Import UI for moving one character's
// setup (by `TRANSFER_CATEGORIES`) to a `.lb.yaml` file and onto other
// characters. The logic lives in profileTransfer.ts; this file is the form.
//
// Rendered by App, which passes the live `sessions` (so the modal can tell an
// ACTIVE target — any open session, focused or backgrounded — from an
// inactive one) and `reloadSession`, which remounts an active target after a
// live import. Export: pick ANY source profile (works disconnected — it reads
// the YAML via `buildProfileExport`; an active source's pending saves are
// flushed first so the file reflects the latest edits), tick categories,
// write into the Exports folder. Import: choose a file from that folder (or
// Browse…), tick categories, pick a merge strategy for rules (Append skips
// duplicates / Replace overwrites per type — Display, Layout, View Prefs and
// Theme always overwrite), and fan out to any number of target characters.
// Each target goes through `applyProfileImport(name, isActive, …)`, then
// `_shared.yaml` is flushed once because two categories (custom themes,
// named colors) merge into APP-WIDE stores rather than a character's profile.

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import { createPortal } from 'react-dom'
import type { CharacterProfile } from '../profile-types'
import { flushPendingProfileSaves, exportSharedProfile } from '../profile'
import {
  TRANSFER_CATEGORIES, buildProfileExport, serializeExport, parseProfileExport,
  presentCategories, applyProfileImport, defaultExportFilename,
  type TransferCategoryId, type ProfileExportFile, type MergeStrategy, type TargetResult,
} from '../profileTransfer'
import '../styles/profile-transfer.css'

// App passes the live sessions so the modal can tell active targets apart and
// remount them after a live import. Kept loose — only character + characterId
// are used.
export interface TransferSession { character: string; characterId: string }

interface Props {
  sessions: TransferSession[]
  reloadSession: (characterId: string) => void
  onClose: () => void
}

interface ProfileRow { name: string; account: string; game: string }

const CAT_LABEL: Record<TransferCategoryId, string> =
  Object.fromEntries(TRANSFER_CATEGORIES.map(c => [c.id, c.label])) as Record<TransferCategoryId, string>

async function loadProfileRows(): Promise<ProfileRow[]> {
  const names = await window.api.listCharacterProfiles()
  const rows = await Promise.all(names.map(async name => {
    const raw = await window.api.readCharacterProfile(name).catch(() => null)
    const p = (raw && typeof raw === 'object' ? raw : {}) as Partial<CharacterProfile>
    return { name: p.character ?? name, account: p.account ?? '', game: p.game ?? 'DR' } as ProfileRow
  }))
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

export default function ProfileTransferModal({ sessions, reloadSession, onClose }: Props) {
  useEscapeClose(onClose)
  const titleId = useId()
  // B397: open with focus INSIDE the dialog (the panel itself — the first field
  // is a <select>, where a stray arrow key would silently change the source).
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => { panelRef.current?.focus() }, [])
  const [mode, setMode] = useState<'export' | 'import'>('export')
  const [profiles, setProfiles] = useState<ProfileRow[]>([])

  // Active = has an open session (focused or backgrounded).
  const activeNames = useMemo(() => new Set(sessions.map(s => s.character)), [sessions])
  const charIdByName = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of sessions) m.set(s.character, s.characterId)
    return m
  }, [sessions])

  useEffect(() => { loadProfileRows().then(setProfiles) }, [])

  // ── Export state ──────────────────────────────────────────────────────────
  const [sourceChar, setSourceChar] = useState<string>('')
  const [fullFile, setFullFile] = useState<ProfileExportFile | null>(null)
  const [exportSel, setExportSel] = useState<Set<TransferCategoryId>>(new Set())
  const [exportDone, setExportDone] = useState<string | null>(null)
  const [exportErr, setExportErr] = useState<string>('')
  // B390: Export had no busy state, so a double-click wrote the file twice.
  // Mirrors Import's `importBusy`.
  const [exportBusy, setExportBusy] = useState(false)

  // Default the source to the first profile (or the first active session).
  useEffect(() => {
    if (sourceChar || profiles.length === 0) return
    const firstActive = profiles.find(p => activeNames.has(p.name))
    setSourceChar((firstActive ?? profiles[0]).name)
  }, [profiles, activeNames, sourceChar])

  // Build a full export (all categories) whenever the source changes so the
  // checklist can show real counts. Flush the source's pending saves first if
  // it's an active session, so the YAML we read reflects the latest edits.
  useEffect(() => {
    if (!sourceChar) { setFullFile(null); return }
    let cancelled = false
    ;(async () => {
      if (activeNames.has(sourceChar)) await flushPendingProfileSaves().catch(() => {})
      const all = new Set<TransferCategoryId>(TRANSFER_CATEGORIES.map(c => c.id))
      const file = await buildProfileExport(sourceChar, all)
      if (cancelled) return
      setFullFile(file)
      setExportSel(new Set(presentCategories(file).map(c => c.id)))
      setExportDone(null); setExportErr('')
    })()
    return () => { cancelled = true }
  }, [sourceChar, activeNames])

  const exportPresent = useMemo(() => (fullFile ? presentCategories(fullFile) : []), [fullFile])

  async function handleExport() {
    if (!fullFile || exportBusy) return
    setExportBusy(true)
    setExportErr('')
    // Filter the full file's categories down to the selected set.
    const categories: ProfileExportFile['categories'] = {}
    for (const c of exportPresent) {
      if (exportSel.has(c.id) && fullFile.categories[c.id]) categories[c.id] = fullFile.categories[c.id]
    }
    const file: ProfileExportFile = { ...fullFile, categories }
    try {
      const path = await window.api.profileTransferExport(defaultExportFilename(sourceChar), serializeExport(file))
      setExportDone(path)
    } catch (e) {
      setExportErr(`Export failed: ${String(e)}`)
    } finally {
      setExportBusy(false)
    }
  }

  // ── Import state ──────────────────────────────────────────────────────────
  const [exportsList, setExportsList] = useState<{ name: string; mtimeMs: number }[]>([])
  const [importFile, setImportFile] = useState<ProfileExportFile | null>(null)
  const [importFileName, setImportFileName] = useState<string>('')
  const [importSel, setImportSel] = useState<Set<TransferCategoryId>>(new Set())
  const [merge, setMerge] = useState<MergeStrategy>('append')
  const [targets, setTargets] = useState<Set<string>>(new Set())
  const [importErr, setImportErr] = useState<string>('')
  const [importBusy, setImportBusy] = useState(false)
  const [importResults, setImportResults] = useState<TargetResult[] | null>(null)

  useEffect(() => {
    if (mode === 'import') window.api.profileTransferListExports().then(setExportsList)
  }, [mode])

  function adoptParsed(text: string, name: string) {
    const parsed = parseProfileExport(text)
    if ('error' in parsed) { setImportErr(parsed.error); setImportFile(null); return }
    setImportErr('')
    setImportFile(parsed.file)
    setImportFileName(name)
    setImportSel(new Set(parsed.present.map(c => c.id)))
    setImportResults(null)
  }

  async function pickFromExports(filename: string) {
    const text = await window.api.profileTransferReadExport(filename)
    if (text === null) { setImportErr('Could not read that export file.'); return }
    adoptParsed(text, filename)
  }

  async function browseForFile() {
    const res = await window.api.profileTransferOpenImportDialog()
    if (!res) return
    adoptParsed(res.text, res.name)
  }

  const importPresent = useMemo(() => (importFile ? presentCategories(importFile) : []), [importFile])

  async function handleImport() {
    if (!importFile || targets.size === 0 || importSel.size === 0) return
    setImportBusy(true)
    const results: TargetResult[] = []
    for (const name of targets) {
      const isActive = activeNames.has(name)
      const r = await applyProfileImport(name, isActive, importFile, { merge, selected: importSel })
      results.push(r)
      if (isActive && !r.error) {
        const cid = charIdByName.get(name)
        if (cid) reloadSession(cid)
      }
    }
    // Persist _shared.yaml so any SHARED data an import touched survives to
    // disk — custom themes added to myThemes (Theme category) and custom
    // named colors merged into the palette (Named Colors category) are
    // app-wide, not per-character.
    await exportSharedProfile().catch(() => {})
    setImportResults(results)
    setImportBusy(false)
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  function toggle<T>(set: Set<T>, v: T): Set<T> {
    const next = new Set(set)
    if (next.has(v)) next.delete(v); else next.add(v)
    return next
  }

  const profilesByAccount = useMemo(() => {
    const m = new Map<string, ProfileRow[]>()
    for (const p of profiles) {
      const key = p.account || '(no account)'
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(p)
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [profiles])

  // ── Export view ──────────────────────────────────────────────────────────────

  function renderExport() {
    if (exportDone) {
      return (
        <div className="pt-done">
          <div className="pt-done-icon">✓</div>
          <div className="pt-done-title">Profile exported</div>
          <div className="pt-done-path">{exportDone}</div>
          <div className="pt-done-actions">
            <button type="button" className="ui-btn" onClick={() => window.api.profileTransferOpenExportsFolder()}>Show in folder</button>
            <button type="button" className="ui-btn" onClick={() => setExportDone(null)}>Export another</button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )
    }
    return (
      <>
        <div className="pt-field">
          <label className="pt-label">Source character</label>
          <select className="ui-field pt-select" value={sourceChar} onChange={e => setSourceChar(e.target.value)}>
            {profiles.map(p => (
              <option key={p.name} value={p.name}>
                {p.name} — {p.account || 'no account'} ({p.game}){activeNames.has(p.name) ? ' • connected' : ''}
              </option>
            ))}
          </select>
        </div>

        <div className="pt-section-head">
          <span>Include</span>
          <div className="pt-sel-actions">
            <button className="pt-link" onClick={() => setExportSel(new Set(exportPresent.map(c => c.id)))}>All</button>
            <span className="pt-dot">·</span>
            <button className="pt-link" onClick={() => setExportSel(new Set())}>None</button>
          </div>
        </div>

        {exportPresent.length === 0
          ? <div className="pt-empty">This character has nothing to export yet.</div>
          : <div className="pt-cat-list">
              {exportPresent.map(c => {
                const cat = TRANSFER_CATEGORIES.find(x => x.id === c.id)!
                return (
                  <label key={c.id} className="pt-cat-row">
                    <input type="checkbox" checked={exportSel.has(c.id)} onChange={() => setExportSel(s => toggle(s, c.id))} />
                    <div className="pt-cat-text">
                      <div className="pt-cat-name">{cat.label} <span className="pt-cat-count">{c.count}</span></div>
                      <div className="pt-cat-desc">{cat.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>
        }
        {exportErr && <div className="pt-error">{exportErr}</div>}
      </>
    )
  }

  // ── Import view ──────────────────────────────────────────────────────────────

  function renderImport() {
    if (importResults) {
      // One line per clash, de-duplicated across targets: an All-characters
      // clash is the same for every character the import went to (the global
      // merge runs once per target), and would otherwise repeat per row.
      const clashRows = [...new Set(importResults.flatMap(r => r.clashes.map(c =>
        `${c.kind} “${c.label}” (${c.where === 'global' ? 'All characters' : r.character} already has one)`)))]
      return (
        <div className="pt-done">
          <div className="pt-done-icon">✓</div>
          <div className="pt-done-title">Import complete</div>
          <div className="pt-results">
            {importResults.map(r => (
              <div key={r.character} className={`pt-result-row${r.error ? ' pt-result-row--err' : ''}`}>
                <span className="pt-result-name">{r.character}</span>
                {r.error
                  ? <span className="pt-result-detail">{r.error}</span>
                  : <span className="pt-result-detail">
                      {r.appliedCategories.map(id => CAT_LABEL[id]).join(', ') || 'nothing'}
                      {r.active ? ' • refreshed live' : ''}
                      {r.themeAppWideNote ? ' • theme added to your list (app-wide — pick it from the theme menu for connected characters)' : ''}
                    </span>
                }
              </div>
            ))}
          </div>
          {clashRows.length > 0 && (
            <div className="pt-clashes">
              <div className="pt-clashes-title">
                {clashRows.length} {clashRows.length === 1 ? 'rule was' : 'rules were'} not imported
              </div>
              <div className="pt-clashes-desc">
                Each one clashes with a rule you already have: same pattern (or key, or
                word) but set up differently. Yours were kept. To bring one over, change
                or delete yours, then import again.
              </div>
              <ul className="pt-clashes-list">
                {clashRows.map(c => <li key={c}>{c}</li>)}
              </ul>
            </div>
          )}
          <div className="pt-done-actions">
            <button type="button" className="ui-btn ui-btn--primary" onClick={onClose}>Close</button>
          </div>
        </div>
      )
    }

    return (
      <>
        <div className="pt-field">
          <label className="pt-label">Profile file <span className="pt-label-hint">(from the Exports folder)</span></label>
          <div className="pt-file-row">
            <select
              className="ui-field pt-select"
              value={importFileName && exportsList.some(e => e.name === importFileName) ? importFileName : ''}
              onChange={e => { if (e.target.value) pickFromExports(e.target.value) }}
            >
              <option value="">{exportsList.length ? 'Choose an export…' : 'No exports found'}</option>
              {exportsList.map(e => <option key={e.name} value={e.name}>{e.name}</option>)}
            </select>
            <button type="button" className="ui-btn" onClick={browseForFile}>Browse…</button>
          </div>
          {importFileName && importFile && (
            <div className="pt-file-chosen">Loaded <strong>{importFileName}</strong> (from {importFile.exportedBy})</div>
          )}
          {importErr && <div className="pt-error">{importErr}</div>}
        </div>

        {importFile && (
          <>
            <div className="pt-section-head">
              <span>Categories to import</span>
              <div className="pt-sel-actions">
                <button className="pt-link" onClick={() => setImportSel(new Set(importPresent.map(c => c.id)))}>All</button>
                <span className="pt-dot">·</span>
                <button className="pt-link" onClick={() => setImportSel(new Set())}>None</button>
              </div>
            </div>
            <div className="pt-cat-list">
              {importPresent.map(c => {
                const cat = TRANSFER_CATEGORIES.find(x => x.id === c.id)!
                return (
                  <label key={c.id} className="pt-cat-row">
                    <input type="checkbox" checked={importSel.has(c.id)} onChange={() => setImportSel(s => toggle(s, c.id))} />
                    <div className="pt-cat-text">
                      <div className="pt-cat-name">{cat.label} <span className="pt-cat-count">{c.count}</span></div>
                      <div className="pt-cat-desc">{cat.desc}</div>
                    </div>
                  </label>
                )
              })}
            </div>

            <div className="pt-merge">
              <span className="pt-merge-label">For rules (highlights, triggers, macros, aliases, groups, contacts):</span>
              <label className="pt-radio">
                <input type="radio" name="pt-merge" checked={merge === 'append'} onChange={() => setMerge('append')} />
                <span><strong>Append</strong> — add alongside existing, skip duplicates</span>
              </label>
              <label className="pt-radio">
                <input type="radio" name="pt-merge" checked={merge === 'replace'} onChange={() => setMerge('replace')} />
                <span><strong>Replace</strong> — overwrite each imported rule type</span>
              </label>
              <div className="pt-merge-note">Display, Layout, View Preferences and Theme are always overwritten when selected.</div>
            </div>

            <div className="pt-section-head">
              <span>Apply to characters</span>
              <div className="pt-sel-actions">
                <button className="pt-link" onClick={() => setTargets(new Set(profiles.map(p => p.name)))}>All</button>
                <span className="pt-dot">·</span>
                <button className="pt-link" onClick={() => setTargets(new Set())}>None</button>
              </div>
            </div>
            <div className="pt-target-list">
              {profilesByAccount.map(([account, rows]) => (
                <div key={account} className="pt-target-group">
                  <div className="pt-target-account">{account}</div>
                  {rows.map(p => {
                    const isSource = p.name === importFile.exportedBy
                    const isActive = activeNames.has(p.name)
                    return (
                      <label key={p.name} className="pt-target-row">
                        <input type="checkbox" checked={targets.has(p.name)} onChange={() => setTargets(s => toggle(s, p.name))} />
                        <span className="pt-target-name">{p.name}</span>
                        <span className="pt-target-game">{p.game}</span>
                        {isActive && <span className="pt-badge pt-badge--live">connected • refreshes live</span>}
                        {isSource && <span className="pt-badge">source</span>}
                      </label>
                    )
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </>
    )
  }

  // ── Footer ────────────────────────────────────────────────────────────────────

  function renderFooter() {
    if (mode === 'export') {
      if (exportDone) return null
      const can = !!fullFile && exportSel.size > 0 && !exportBusy
      // Rule 5 of the label guide: a disabled button says why.
      const why = exportBusy ? 'Writing the file…'
        : !fullFile ? (sourceChar ? 'Reading this character’s profile…' : 'Pick a source character')
        : exportSel.size === 0 ? 'Tick at least one category to export'
        : undefined
      return (
        <div className="ui-modal-foot">
          <span className="pt-footer-info">{exportSel.size} categor{exportSel.size === 1 ? 'y' : 'ies'} selected</span>
          <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
          <button type="button" className="ui-btn ui-btn--primary" disabled={!can} title={why} onClick={handleExport}>
            {exportBusy ? 'Exporting…' : 'Export'}
          </button>
        </div>
      )
    }
    if (importResults) return null
    const can = !!importFile && importSel.size > 0 && targets.size > 0 && !importBusy
    const why = importBusy ? 'Importing…'
      : !importFile ? 'Choose a profile file first'
      : importSel.size === 0 ? 'Tick at least one category to import'
      : targets.size === 0 ? 'Tick at least one character to apply it to'
      : undefined
    return (
      <div className="ui-modal-foot">
        <span className="pt-footer-info">
          {importFile ? `${importSel.size} categor${importSel.size === 1 ? 'y' : 'ies'} → ${targets.size} character${targets.size === 1 ? '' : 's'}` : 'Choose a file'}
        </span>
        <button type="button" className="ui-btn" onClick={onClose}>Cancel</button>
        <button type="button" className="ui-btn ui-btn--primary" disabled={!can} title={why} onClick={handleImport}>
          {importBusy ? 'Importing…' : 'Import'}
        </button>
      </div>
    )
  }

  const modal = (
    <div className="ui-modal-backdrop pt-backdrop" {...backdropHandlers(() => onClose())}>
      <div
        ref={panelRef}
        className="ui-modal pt-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="ui-modal-head">
          <span className="ui-modal-title" id={titleId}>Transfer</span>
          <div className="ui-tabs pt-tabs" role="tablist">
            {(['export', 'import'] as const).map(m => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={`ui-tab${mode === m ? ' ui-tab--active' : ''}`}
                onClick={() => setMode(m)}
              >
                {m === 'export' ? 'Export' : 'Import'}
              </button>
            ))}
          </div>
          <button type="button" className="ui-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>
        <div className="pt-body">
          {mode === 'export' ? renderExport() : renderImport()}
        </div>
        {renderFooter()}
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
