; Lichborne NSIS pre-install hook — v0.6.4 profile rescue.
;
; Why this exists:
; Pre-v0.6.4 builds wrote profile YAMLs to `<install-dir>\profiles\`. On every
; upgrade, electron-builder's NSIS template runs the PREVIOUS version's
; uninstaller, which `RMDir /r` the install directory — taking the profiles
; with it. v0.6.4 fixed the storage path to `app.getPath('userData')\profiles\`
; (= `%APPDATA%\lichborne\profiles\` on Windows), but the runtime migration in
; src/main/profiles.ts can only help users whose legacy directory still exists
; when the app boots — which it won't if the uninstaller has already wiped it.
;
; This hook plugs that gap. CRITICAL DETAILS:
;
; 1. `preInit` (NOT `customInit`). electron-builder's `customInit` macro is
;    inserted AFTER the previous version's uninstaller runs — by which point
;    `$INSTDIR\profiles\` is already gone. `preInit` runs in `.onInit` BEFORE
;    the uninstaller is invoked, giving us a chance to rescue files first.
;
; 2. `$INSTDIR` is NOT set at preInit time — that happens later, when
;    `findExistingInstallLocation` reads the registry. We do the registry
;    lookup ourselves to find the previous install directory. The install
;    location is stored at `Software\${UNINSTALL_APP_KEY}` (per-user installs)
;    by electron-builder; the empty-name value is the install path string.
;
; 3. Destination is `$APPDATA\lichborne\profiles\` (LOWERCASE). Electron's
;    `app.getName()` returns the package.json `name` field ("lichborne"),
;    not the `build.productName` field. Capitalizing here would create a
;    folder Electron never looks in. (Windows file systems are case-
;    insensitive in practice but the displayed case still matters for
;    explorers / shell.openPath.)
;
; Migration conditions:
;   a) Previous install location read from registry exists AND has YAMLs
;   b) userData destination does NOT already contain YAMLs (idempotent)
; If both hold, copy YAMLs + backups. CreateDirectory is recursive — creates
; `$APPDATA\lichborne\` too if missing. Each CopyFiles is gated by FileExists
; for that pattern since NSIS errors when source pattern matches nothing.

!macro preInit
  ; Read the previous install location from the registry. UNINSTALL_APP_KEY is
  ; defined by electron-builder's installer template; falls through silently
  ; if not present (no previous install).
  Var /GLOBAL LICHBORNE_LEGACY_DIR
  StrCpy $LICHBORNE_LEGACY_DIR ""
  ReadRegStr $LICHBORNE_LEGACY_DIR HKCU "Software\${UNINSTALL_APP_KEY}" ""
  ${If} $LICHBORNE_LEGACY_DIR == ""
    ReadRegStr $LICHBORNE_LEGACY_DIR HKLM "Software\${UNINSTALL_APP_KEY}" ""
  ${EndIf}
  ${If} $LICHBORNE_LEGACY_DIR != ""
    ${If} ${FileExists} "$LICHBORNE_LEGACY_DIR\profiles\*.yaml"
      ; CreateDirectory is recursive — creates `$APPDATA\lichborne\` first if
      ; needed, then `\profiles\`. Safe to call when the destination already
      ; exists (no-op).
      CreateDirectory "$APPDATA\lichborne\profiles"
      ${IfNot} ${FileExists} "$APPDATA\lichborne\profiles\*.yaml"
        DetailPrint "Rescuing legacy profiles from $LICHBORNE_LEGACY_DIR\profiles\ to %APPDATA%\lichborne\profiles\..."
        CopyFiles /SILENT "$LICHBORNE_LEGACY_DIR\profiles\*.yaml" "$APPDATA\lichborne\profiles"
        ${If} ${FileExists} "$LICHBORNE_LEGACY_DIR\profiles\*.bak"
          CopyFiles /SILENT "$LICHBORNE_LEGACY_DIR\profiles\*.bak" "$APPDATA\lichborne\profiles"
        ${EndIf}
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

; ---------------------------------------------------------------------------
; Desktop shortcut: opt-in checkbox, and never re-made when it is already right.
;
; Why this exists:
; electron-builder's own desktop-shortcut handling deleted and re-created
; `Lichborne.lnk` on every MANUAL upgrade (running a new setup.exe), so Windows
; dropped the new icon in the next free desktop slot and the player's
; arrangement was lost. The cause: with `allowToChangeInstallationDirectory`
; the template's `setIsTryToKeepShortcuts` turns keep-shortcuts OFF for any run
; without `--updated`, so the previous version's uninstaller runs without
; `--keep-shortcuts` and deletes both shortcuts, and `addDesktopLink` then
; makes a fresh one. Auto-updates pass `--updated` and were never affected.
;
; The fix has three parts:
;
; 1. package.json sets `createDesktopShortcut: false`, which defines
;    DO_NOT_CREATE_DESKTOP_SHORTCUT: the template neither creates the desktop
;    shortcut nor (in every uninstaller built from now on) deletes it.
;    Lichborne owns it here instead.
;
; 2. `customPageAfterChangeDir` adds a "Create a desktop shortcut" page
;    (checked by default) and then UNDEFINES `allowToChangeInstallationDirectory`.
;    The directory page that needed it is already compiled by then; the only
;    later use is `setIsTryToKeepShortcuts`, which now behaves as it does for a
;    one-click install: the old uninstaller gets `--keep-shortcuts` whenever the
;    new install goes to the SAME folder (`$appExe` already exists there). That
;    also protects the desktop shortcut from uninstallers ALREADY on players'
;    machines (v0.21.1 and earlier), which still delete it without that flag.
;    Installing to a different folder keeps the template's normal behaviour.
;
; 3. `customInstall` keeps an existing shortcut that already points at this
;    install untouched (same file, so Explorer keeps its position), points one
;    at a moved install in place, and creates one only when asked:
;      - the page was shown and the box is ticked, or
;      - a silent FRESH install without `--no-desktop-shortcut`.
;    It never creates one on an auto-update (`--updated`) or a silent upgrade:
;    a missing shortcut there means the player deleted it.
;    Unticking the box removes a shortcut that points at this install.
;    `customUnInstall` removes it on a real uninstall (not on an upgrade).
;
; Reading a shortcut's target uses IShellLinkW through the System plugin
; (no PowerShell dependency). If it can't be read, the shortcut is left alone.

Var LichborneLnkTarget
!ifndef BUILD_UNINSTALLER
  Var LichborneDesktopChoice   ; "1" = want a desktop shortcut, "0" = don't
  Var LichborneDesktopAsked    ; "1" once the player has seen the page
  Var LichborneDesktopCheckbox
  Var LichbornePrevDir         ; previous install folder, "" on a fresh install
!endif

; Sets $LichborneLnkTarget to the target path of the .lnk in _LNK, or "" when
; it can't be read. Preserves every register it uses.
!macro LichborneReadLnkTarget _LNK
  Push $R5
  Push $R6
  Push $R7
  Push $R8
  Push $R9
  StrCpy $LichborneLnkTarget ""
  StrCpy $R9 "${_LNK}"
  ; S_OK (0) or S_FALSE (1) both need a matching CoUninitialize.
  System::Call "ole32::CoInitializeEx(p 0, i 2) i .R5"
  ; CLSID_ShellLink, IID_IShellLinkW
  System::Call "ole32::CoCreateInstance(g '{00021401-0000-0000-C000-000000000046}', p 0, i 1, g '{000214F9-0000-0000-C000-000000000046}', *p .R6) i .R8"
  ${If} $R8 == 0
    ; IUnknown::QueryInterface(IID_IPersistFile)
    System::Call "$R6->0(g '{0000010b-0000-0000-C000-000000000046}', *p .R7) i .R8"
    ${If} $R8 == 0
      ; IPersistFile::Load(path, STGM_READ)
      System::Call "$R7->5(w R9, i 0) i .R8"
      ${If} $R8 == 0
        ; IShellLinkW::GetPath(buf, cch, NULL, 0)
        System::Call "$R6->3(w .R8, i ${NSIS_MAX_STRLEN}, p 0, i 0) i"
        StrCpy $LichborneLnkTarget $R8
      ${EndIf}
      System::Call "$R7->2()"
    ${EndIf}
    System::Call "$R6->2()"
  ${EndIf}
  ${If} $R5 == 0
  ${OrIf} $R5 == 1
    System::Call "ole32::CoUninitialize()"
  ${EndIf}
  Pop $R9
  Pop $R8
  Pop $R7
  Pop $R6
  Pop $R5
!macroend

!macro customInit
  ; Read before the old uninstaller runs (it deletes this key, even on an
  ; upgrade). electron-builder stores the folder in `InstallLocation`.
  ReadRegStr $LichbornePrevDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $LichbornePrevDir == ""
    ReadRegStr $LichbornePrevDir HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  StrCpy $LichborneDesktopAsked "0"
  StrCpy $LichborneDesktopChoice "1"
  ${If} ${isNoDesktopShortcut}
    StrCpy $LichborneDesktopChoice "0"
  ${EndIf}
!macroend

!macro customPageAfterChangeDir
  Page custom LichborneDesktopPageCreate LichborneDesktopPageLeave

  Function LichborneDesktopPageCreate
    ${If} ${isUpdated}
      Abort
    ${EndIf}
    !insertmacro MUI_HEADER_TEXT "Desktop shortcut" "Choose whether Lichborne puts a shortcut on your desktop."
    nsDialogs::Create 1018
    Pop $0
    ${If} $0 == error
      Abort
    ${EndIf}
    ${NSD_CreateCheckbox} 0 0 100% 12u "Create a &desktop shortcut"
    Pop $LichborneDesktopCheckbox
    ${If} $LichborneDesktopChoice == "1"
      ${NSD_Check} $LichborneDesktopCheckbox
    ${EndIf}
    ${NSD_CreateLabel} 0 20u 100% 36u "If you already have a Lichborne shortcut on your desktop, it stays where you put it. Untick this to remove it."
    Pop $0
    nsDialogs::Show
  FunctionEnd

  Function LichborneDesktopPageLeave
    StrCpy $LichborneDesktopAsked "1"
    ${NSD_GetState} $LichborneDesktopCheckbox $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $LichborneDesktopChoice "1"
    ${Else}
      StrCpy $LichborneDesktopChoice "0"
    ${EndIf}
  FunctionEnd

  ; See part 2 of the header comment. Must stay AFTER the directory page.
  !ifdef allowToChangeInstallationDirectory
    !undef allowToChangeInstallationDirectory
  !endif
!macroend

!macro customInstall
  ; The template's keep-shortcuts path only renames a shortcut whose NAME
  ; changed; with its desktop handling off, do that here too.
  ${If} $oldDesktopLink != $newDesktopLink
  ${AndIf} ${FileExists} "$oldDesktopLink"
  ${AndIfNot} ${FileExists} "$newDesktopLink"
    Rename "$oldDesktopLink" "$newDesktopLink"
  ${EndIf}

  ${If} ${FileExists} "$newDesktopLink"
    !insertmacro LichborneReadLnkTarget "$newDesktopLink"
    ${If} $LichborneDesktopAsked == "1"
    ${AndIf} $LichborneDesktopChoice == "0"
      ; Unticked: remove it, but only if it is ours.
      ${If} $LichborneLnkTarget == "$appExe"
      ${OrIf} $LichborneLnkTarget == "$LichbornePrevDir\${APP_EXECUTABLE_FILENAME}"
        DetailPrint "Removing the desktop shortcut."
        WinShell::UninstShortcut "$newDesktopLink"
        Delete "$newDesktopLink"
      ${EndIf}
    ${ElseIf} $LichborneLnkTarget == "$appExe"
      ; Already right: leave the file alone so Explorer keeps its position.
      DetailPrint "Desktop shortcut already points here; leaving it alone."
    ${ElseIf} $LichborneLnkTarget != ""
    ${AndIf} $LichbornePrevDir != ""
    ${AndIf} $LichborneLnkTarget == "$LichbornePrevDir\${APP_EXECUTABLE_FILENAME}"
      ; Points at the previous install folder: rewrite the same file in place.
      DetailPrint "Pointing the desktop shortcut at the new install folder."
      CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
    ${EndIf}
  ${ElseIf} $LichborneDesktopChoice == "1"
    ${IfNot} ${isUpdated}
      ${If} $LichborneDesktopAsked == "1"
      ${OrIf} $LichbornePrevDir == ""
        CreateShortCut "$newDesktopLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
        ClearErrors
        WinShell::SetLnkAUMI "$newDesktopLink" "${APP_ID}"
      ${EndIf}
    ${EndIf}
  ${EndIf}
  ; Part 2 sends a same-folder manual run down the template's keep-shortcuts
  ; path, which only renames the Start Menu shortcut. Keep "run setup again"
  ; able to repair a missing one, as it could before (never on an update).
  !ifndef DO_NOT_CREATE_START_MENU_SHORTCUT
    ${IfNot} ${isUpdated}
    ${AndIfNot} ${FileExists} "$newStartMenuLink"
      !ifdef MENU_FILENAME
        CreateDirectory "$SMPROGRAMS\${MENU_FILENAME}"
      !endif
      CreateShortCut "$newStartMenuLink" "$appExe" "" "$appExe" 0 "" "" "${APP_DESCRIPTION}"
      ClearErrors
      WinShell::SetLnkAUMI "$newStartMenuLink" "${APP_ID}"
    ${EndIf}
  !endif

  System::Call 'Shell32::SHChangeNotify(i 0x8000000, i 0, i 0, i 0)'
!macroend

!macro customUnInstall
  ; A real uninstall only: an upgrade always runs the old uninstaller with
  ; --updated, and the desktop shortcut must survive that.
  ${IfNot} ${isUpdated}
  ${AndIfNot} ${isKeepShortcuts}
  ${AndIf} ${FileExists} "$oldDesktopLink"
    !insertmacro LichborneReadLnkTarget "$oldDesktopLink"
    ${If} $LichborneLnkTarget == "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ${OrIf} $LichborneLnkTarget == ""
      WinShell::UninstShortcut "$oldDesktopLink"
      Delete "$oldDesktopLink"
    ${EndIf}
  ${EndIf}
!macroend
