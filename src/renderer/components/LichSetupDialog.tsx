import { useEffect, useId, useState } from 'react'
import { backdropHandlers } from "../utils/backdropClose"
import { useEscapeClose } from '../hooks/useEscapeClose'
import { createPortal } from 'react-dom'
import { type AdvancedSettings, loadAdvanced, saveAdvanced } from '../lichSettings'
import { exportSharedProfile } from '../profile'
import LichSetupFields from './LichSetupFields'
import '../styles/wizard.css'
import '../styles/login.css'

interface Props {
  onClose: () => void
  // B405: set when the dialog opens OVER another dialog (Settings). The
  // backdrop then stays transparent — it still catches the outside click — so
  // the screen isn't darkened twice. Opened from the launcher / Add Account
  // wizard / App menu it keeps the normal scrim.
  nested?: boolean
}

// A small dedicated dialog for pre-connect Lich configuration. Wraps the same
// LichSetupFields used by SettingsPanel (post-connect) so users can verify or
// fix paths/port/mode before any character connect is attempted. Writes through
// to localStorage + debounced _shared.yaml so the values are picked up by both
// the wizard and any concurrently-open Electron windows. Every edit saves as it
// is made, so the footer offers "Close", never "Cancel" — nothing is pending.
export default function LichSetupDialog({ onClose, nested = false }: Props) {
  const [adv, setAdv] = useState<AdvancedSettings>(loadAdvanced)
  const titleId = useId()

  useEffect(() => {
    saveAdvanced(adv)
    const t = setTimeout(() => exportSharedProfile().catch(console.error), 1000)
    return () => clearTimeout(t)
  }, [adv])

  // B341: Esc does what ✕ and Close do.
  useEscapeClose(onClose)

  return createPortal(
    <div className={`wiz-backdrop${nested ? ' wiz-backdrop--nested' : ''}`} {...backdropHandlers(() => onClose())}>
      {/* B328: no inline width — `.wiz-modal` supplies it, capped to the window. */}
      <div className="wiz-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="wiz-header">
          <span className="wiz-title" id={titleId}>Lich Setup</span>
          <button type="button" className="ui-close" onClick={onClose} title="Close" aria-label="Close">✕</button>
        </div>
        <div className="wiz-body">
          {/* login-form supplies the input/select/label styling that LichSetupFields
              relies on (background, border, label uppercase). Without it, browser
              defaults leak through and inputs render with white backgrounds. */}
          <div className="login-form advanced-panel">
            <LichSetupFields adv={adv} setAdv={setAdv} alwaysShowFields />
          </div>
        </div>
        <div className="ui-modal-foot wiz-footer">
          <button type="button" className="ui-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
