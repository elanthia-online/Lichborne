# Lichborne — Lich & DragonRealms Knowledge Base

> Internal reference document. Captures what we've learned about **Lich5 internals, the DragonRealms protocol, and the live installation** — the verified facts we mirror or depend on, so they aren't re-derived. Each fact cites its source `file:line`.
> Sources: Lich5 source tree (`C:\temp\lich-dev\lich-5`, live install `C:\Ruby4Lich5`), the DR `drinfomon` scripts, and captured game XML.
> This is the LICH/DR *fact* layer — how Lich and DR actually behave. Lichborne's own implementation (how we consume these facts) lives in CLAUDE.md and DESIGN.md; each Lichborne pitfall that came from a Lich/DR fact points back here.
> Updated: 2026-10-14 (the injuries dialog is a full snapshot; DR's announced Combat panel, not yet seen in the feed; earlier: a view of another room — Locate — and Lich's room-name rewrites, 2026-10-13).

---

## Table of Contents

1. [What Lich Is](#1-what-lich-is)
2. [Directory Layout](#2-directory-layout)
3. [lich.db3 — Schema Reference](#3-lichdb3--schema-reference)
4. [uservars — Vars Storage](#4-uservars--vars-storage)
5. [Ruby Marshal Format](#5-ruby-marshal-format)
6. [lich_settings — Feature Flags & Config](#6-lich_settings--feature-flags--config)
7. [session_summary_state — Multi-Session Tracking](#7-session_summary_state--multi-session-tracking)
8. [Script Profile YAML System](#8-script-profile-yaml-system)
9. [Script Control Commands](#9-script-control-commands)
10. [Connection & Frontend Modes](#10-connection--frontend-modes)
11. [IPC Architecture (Lich ↔ Client)](#11-ipc-architecture-lich--client)
12. [alias.db3](#12-aliasdb3)
13. [Live Installation Notes](#13-live-installation-notes)
14. [Integration Constraints for Lichborne](#14-integration-constraints-for-lichborne)
15. [Downstream / Upstream Hooks (Lich rewrites the stream)](#15-downstream--upstream-hooks-lich-rewrites-the-stream)
16. [DragonRealms Protocol & drinfomon Parse Reference](#16-dragonrealms-protocol--drinfomon-parse-reference)
17. [Lich Version Log](#17-lich-version-log)
18. [Lich on Linux & macOS — Install Layouts](#18-lich-on-linux--macos--install-layouts)
19. [Detachable Client — the Attach Protocol](#19-detachable-client--the-attach-protocol)

---

## 1. What Lich Is

Lich5 is a Ruby scripting proxy that sits between the game server and the client. It:

- Authenticates with SimuCo's SGE (Simutronics Game Entry) and proxies the game XML stream
- Provides a scripting runtime — scripts run as Ruby threads with full access to parsed game state
- Intercepts all upstream (client → server) and downstream (server → client) traffic via hooks
- Maintains persistent character state, variables, and settings in `lich.db3` (SQLite3)

**Process model:** Each Lich instance is a single OS process. Multiple characters require multiple Lich processes. Each process has its own PID and manages its own connection. The `session_summary_state` table in `lich.db3` is how processes announce themselves to each other (and to Lichborne).

**Frontend flag:** Lich is told which client protocol to speak via a command-line flag. Lichborne uses `--stormfront`, which makes Lich speak the StormFront XML protocol that the game server natively sends.

---

## 2. Directory Layout

```
{LichInstallDir}\
├── lich.rbw                    — Main entry point (Ruby script)
├── Gemfile                     — Ruby gem dependencies
├── data/
│   ├── lich.db3                — Primary SQLite database
│   ├── alias.db3               — Alias script database
│   ├── lich.db3.maint.lock     — Advisory OS file lock for VACUUM maintenance
│   ├── entry.yaml              — SGE account/character login registry
│   ├── entry.yaml.bak          — Backup of entry.yaml
│   ├── login_gui_settings.yml  — Lich GUI login preferences
│   ├── simu.pem                — Simutronics TLS certificate
│   ├── effect-list.xml         — Cached game effect definitions (versioned by timestamp)
│   ├── DR/                     — Per-character data dirs for DragonRealms Prime
│   └── DRT/                    — Per-character data dirs for DragonRealms Test
├── scripts/
│   ├── *.lic                   — Runnable Lich scripts (500+ in live install)
│   ├── custom/                 — User-customized script overrides
│   ├── profiles/               — YAML configuration files (see §8)
│   │   ├── base.yaml           — Universal defaults
│   │   ├── base-empty.yaml     — Empty baseline
│   │   ├── CharName-setup.yaml — Character-specific profile
│   │   └── ...                 — Other character profiles and include files
│   └── data/                   — Reference data files used by scripts
├── lib/                        — Core Lich library
├── maps/                       — Pre-loaded game world maps
├── logs/                       — Session and script output logs
├── backup/                     — Automated DB/config backups
└── temp/                       — Temporary working files
```

**Source layout** (`{LichSourceDir}/lib/`):
```
lib/
├── lich.rb                     — Core module: db init, db_mutex, maintenance helpers
├── init.rb                     — Startup initialization
├── global_defs.rb              — Global convenience methods and ;listall handling
├── common/
│   ├── vars.rb                 — Vars / uservars read/write/save
│   ├── uservars.rb             — UserVars (character-scoped alias for Vars)
│   ├── feature_flags.rb        — FeatureFlags module (lich_settings reads)
│   ├── setup_files.rb          — YAML profile loading and cascading merge
│   ├── db_store.rb             — Generic DB store utilities
│   └── settings/
│       ├── database_adapter.rb       — Generic settings DB adapter
│       └── session_database_adapter.rb — session_summary_state row adapter
├── dragonrealms/
│   └── drinfomon/
│       └── drskill.rb          — DRSkill.listall (skills, NOT scripts)
└── main/                       — CLI entry point and argument parsing
```

---

## 3. lich.db3 — Schema Reference

**Location:** `{LichDir}/data/lich.db3`
**Engine:** SQLite3, WAL journal mode
**Access:** Mutex-protected (`Lich.db_mutex`) for thread safety across scripts

All tables are created by `Lich.init_db` in `lib/lich.rb` lines 175–214.

### Tables

#### `uservars`
| Column | Type | Notes |
|--------|------|-------|
| `scope` | TEXT PK | `"GAME:CharacterName"` e.g. `"DR:Aldric"` |
| `hash` | BLOB | Ruby `Marshal.dump(Hash)` — string keys, any Marshal-safe values |

One row per character per game. See §4 for full details.

#### `lich_settings`
| Column | Type | Notes |
|--------|------|-------|
| `name` | TEXT PK | Key name. Feature flags use `feature_flag:` prefix. |
| `value` | TEXT | Always a plain string. Booleans stored as `"true"`/`"false"`. |

See §6 for known keys and the feature flag system.

#### `session_summary_state`
| Column | Type | Notes |
|--------|------|-------|
| `pid` | INTEGER PK | OS process ID of the Lich instance |
| `session_name` | TEXT | Character name (format `"DR:Sekmeht"` or just `"Sekmeht"`) |
| `role` | TEXT | Usually `"session"` |
| `state` | TEXT | `"starting"` / `"running"` / `"exited"` |
| `frontend` | TEXT | `"stormfront"` / `"wizard"` / `"wrayth"` etc. |
| `game_code` | TEXT | `"DR"` / `"DRT"` / `"GS"` etc. |
| `hidden` | INTEGER | `0` = visible, `1` = hidden from session list. DEFAULT 0. |
| `started_at` | INTEGER | Unix timestamp (seconds) |
| `last_heartbeat_at` | INTEGER | Unix timestamp; updated periodically while running |
| `os_seen_at` | INTEGER | Unix timestamp; when OS process was last confirmed alive |
| `os_seen` | INTEGER | `1` = process alive, `0` = gone |
| `os_name` | INTEGER | OS process name identifier |
| `last_utilization_at` | INTEGER | Unix timestamp of last resource utilization update |
| `metadata_json` | TEXT | JSON string with additional session metadata |

**Indexes:** `idx_session_summary_state_session_name` (on `session_name`), `idx_session_summary_state_heartbeat` (on `last_heartbeat_at`).

**Active session query for Lichborne:**
```sql
SELECT * FROM session_summary_state
WHERE COALESCE(state, '') != 'exited'
  AND last_heartbeat_at > (strftime('%s', 'now') - 60)
ORDER BY pid ASC;
```

The table **always exists** even when the `session_summary_store_and_reporting` feature flag is off — it is created in `init_db` unconditionally. The flag controls whether rows are inserted, not whether the table exists.

#### `script_setting`
| Column | Type | Notes |
|--------|------|-------|
| `script` | TEXT | Script name |
| `name` | TEXT | Setting key |
| `value` | BLOB | Ruby Marshal BLOB |
PK: `(script, name)`. Per-script private settings. Not user-facing; do not surface in Lichborne.

#### `script_auto_settings`
| Column | Type | Notes |
|--------|------|-------|
| `script` | TEXT | Script name |
| `scope` | TEXT | Scope identifier (usually character name) |
| `hash` | BLOB | Ruby Marshal BLOB (Hash) |
PK: `(script, scope)`. Auto-saved script settings. Not user-facing.

#### `simu_game_entry`
| Column | Type | Notes |
|--------|------|-------|
| `character` | TEXT | Character name |
| `game_code` | TEXT | Game code |
| `data` | BLOB | Ruby Marshal BLOB |
PK: `(character, game_code)`. SGE authentication blobs. Do not read or expose.

#### `enable_inventory_boxes`
| Column | Type | Notes |
|--------|------|-------|
| `player_id` | INTEGER PK | Player ID |
Tracks inventory box feature opt-in per player. Not useful for Lichborne.

#### `trusted_scripts`
| Column | Type |
|--------|------|
| `name` | TEXT |
Only created on Ruby < 2.0.3. Ignore.

---

## 4. uservars — Vars Storage

**Source:** `lib/common/vars.rb`

### Scope Key

```
"#{XMLData.game}:#{XMLData.name}"
```

Examples: `"DR:Aldric"`, `"DRT:AltChar"`, `"GS:GsChar"`

### Key Normalization

All keys are normalized to strings via `key.to_s` before storage. Accessing `Vars[:weapon]` and `Vars["weapon"]` return the same value. This means the BLOB always contains a Hash with string keys — **no symbol keys**.

### Read/Write Lifecycle

- **Read:** Triggered lazily on first access via `@@load` proc. Fetches BLOB, calls `Marshal.load(h)`, normalizes all keys to strings, stores in `@@vars` Hash. Thread-safe via `Lich.db_mutex`.
- **Write:** Background thread calls `@@save` every **300 seconds** (5 minutes). Computes `MD5` of `@@vars.to_s`; only writes if changed. Uses `Marshal.dump(@@vars)` → `SQLite3::Blob`.
- **Force save:** `Vars.save` triggers immediate write. Scripts call this after critical changes.

### What Types Are Actually Stored

In practice, scripts store:
- **Strings** — the most common type (`$weapon`, `$buddy`, `$target`, `$hometown`)
- **Integers** — thresholds, counts, room IDs (`health_threshold: 65`, `safe_room: 2562`)
- **Booleans** — feature toggles (`skip_repair: false`, `depart_on_death: false`)
- **Floats** — rare, sometimes percentages
- **Arrays of strings** — buddy lists, skill lists (`hunting_buddies: ["Friend1", "Friend2"]`)
- **Hashes** — nested config (`stances: { sling: [...] }`)
- **nil** — deleted keys

Custom Ruby objects are never stored in `uservars` by well-behaved scripts.

---

## 5. Ruby Marshal Format

Ruby Marshal version 4.8 (`\x04\x08` header). All `uservars` BLOBs start with these two bytes.

### Type Codes (relevant to uservars)

| Byte | Code | Type | Notes |
|------|------|------|-------|
| `0x30` | `0` | nil | No payload |
| `0x54` | `T` | true | No payload |
| `0x46` | `F` | false | No payload |
| `0x69` | `i` | Integer | Variable-length encoding (see below) |
| `0x66` | `f` | Float | Length-prefixed string representation e.g. `"65.0"` |
| `0x22` | `"` | String | Length + raw bytes (UTF-8) |
| `0x49` | `I` | IVAR (instance vars) | Wraps a string with encoding annotation — treat as string |
| `0x5b` | `[` | Array | 4-byte count followed by N elements |
| `0x7b` | `{` | Hash | 4-byte count followed by N key-value pairs |
| `0x7d` | `}` | Hash w/ default | Same as Hash but followed by one extra default value to discard |
| `0x3a` | `:` | Symbol | Length + bytes; stored in symbol cache |
| `0x3b` | `;` | Symbol link | Index into symbol cache (subsequent refs to same symbol) |
| `0x40` | `@` | Object link | Index into object cache (for shared object references) |
| `0x6c` | `l` | Bignum | Sign byte (`+`/`-`) + word count + 16-bit little-endian words |
| `0x6f` | `o` | Object | Class symbol + ivar count + key/value pairs |
| `0x75` | `u` | UserDefined | Class symbol + raw byte length + raw bytes (e.g. Ruby `Time`) |
| `0x55` | `U` | MarshalObject | Class symbol + marshal_load data value |
| `0x65` | `e` | Extended | Module symbol (discard) + actual object |
| `0x43` | `C` | Subclass | Class name symbol (discard) + wrapped object |
| `0x2f` | `/` | Regexp | Source bytes + flags byte |
| `0x64` | `d` | Data | Ruby 3.2+ immutable value object; same structure as `o` |

### Integer Encoding

The prefix byte must be read as a **signed** C `char` (i.e. if `b > 127`, interpret as `b - 256`). Let `sb = b > 127 ? b - 256 : b`:

- `sb == 0` → value is 0
- `sb > 4` → value is `sb - 5` (range 0..122)
- `sb < -4` → value is `sb + 5` (range -123..-1)
- `sb == 1..4` → read `sb` bytes little-endian, unsigned
- `sb == -1..-4` → read `-sb` bytes little-endian, sign-extended from -1

**Common mistake:** treating the prefix byte as unsigned before comparing — this breaks all negative integers and integers > 122.

### Ruby Time Binary Format (`0x75` UserDefined, class = `"Time"`, 8 bytes)

Ruby's `Time#_dump` stores two 32-bit words in **little-endian** order (LSB first, regardless of platform):

```
bytes[0..3] → word1 (read as: data[0] | data[1]<<8 | data[2]<<16 | data[3]<<24)
bytes[4..7] → word2 (read as: data[4] | data[5]<<8 | data[6]<<16 | data[7]<<24)
```

**New format** (bit 31 of word1 set = 1):
- bit 31: always 1 (new format marker)
- bit 30: 1 = UTC, 0 = local
- bits 29–14 (16 bits): `year - 1900`
- bits 13–10 (4 bits): month (0-based, 0=January)
- bits 9–5 (5 bits): day of month
- bits 4–0 (5 bits): hour
- word2 bits 31–26 (6 bits): minute
- word2 bits 25–20 (6 bits): second
- word2 bits 19–0 (20 bits): microseconds

**Old format** (bit 31 = 0, Ruby 1.8):
- word1: seconds since Unix epoch (big-endian in this case)
- word2: microseconds

### String Encoding

After `\x22` (or inside `\x49` IVAR wrapper):
- Next: Marshal-encoded length (integer encoding above)
- Then: raw bytes

For `\x49` (IVAR): after the string bytes, a count of instance variables follows. The only one that appears in practice is `@encoding` → `"UTF-8"`. Treat the same as a plain string and discard the IVAR annotations.

### Symbol Caching

The first occurrence of a symbol is `\x3a` + length + bytes. Subsequent uses of the same symbol are `\x3b` + index (0-based index into the order they were first seen). Since `uservars` uses string keys (not symbols), symbol codes appear only inside nested hashes that scripts may store — handle them for completeness.

### Object Link Table (`\x40` `@`) — the registration rules that MUST match Ruby exactly

Marshal has TWO back-reference tables: the **symbol** table (above, `\x3b`) and the **object** table (`\x40` `@`, index into every non-trivial object in first-seen order). A decoder MUST register objects into the object table in the EXACT set and order Ruby's `marshal.c` does (`r_entry` call sites), or every later `@` link resolves to the wrong (but plausible, same-typed) object — corruption that VARIES per blob and substitutes a sibling value, never an error. This bit Lichborne as **B202** (moonwatch's `UserVars.sun` decoded with one var's value under another's key; had silently corrupted link-heavy blobs since v0.5.0). The non-obvious rules:

- **`\x49` `I` (IVAR wrapper) gets NO object-table slot of its own** — Ruby registers the INNER value (the wrapped String), not the wrapper. A decoder that pushes a placeholder for the `I` AND lets the inner string self-register adds ONE extra slot, shifting every subsequent `@N` by one.
- **`\x75` `U` (UserDefined, e.g. `Time`) and `\x6f` `o` (Object) register BEFORE reading their payload**, not after (so a self-referential object can link to itself).
- **Trivial immediates do NOT register**: `nil` / `true` / `false` / `Integer` / `Symbol` (symbols use their own table). Strings, Arrays, Hashes, Floats, Bignums, Objects, UserDefined, Regexps DO.
- **The tell for a desync bug:** decoded output where a repeated/shared/frozen value shows up under the wrong key, differing per blob — that's an object-table offset, not bad data. Verify a Marshal decoder by re-dumping REAL link-heavy blobs (all of `uservars`), not synthetic cases (which rarely have enough repeated objects to exercise `@` links).

Reference: Lichborne's decoder is `src/main/lichbridge/marshalParser.ts` (mirrors `r_entry`); the authority is Ruby's `marshal.c`.

### The Outer Shape of a uservars BLOB

```
\x04\x08              — Marshal version header
\x7b                  — Hash type
<integer>             — Number of key-value pairs
  \x22 <len> <bytes>  — String key (e.g. "weapon")
  <value>             — Any of the above types
  ...
```

Keys are always `\x22` (String) due to Lich's `normalize_key` normalization. No symbol keys in the outer hash.

---

## 6. lich_settings — Feature Flags & Config

**Source:** `lib/common/feature_flags.rb`

### Feature Flag Storage

Feature flags are stored in `lich_settings` with the prefix `feature_flag:`:

```sql
SELECT name, value FROM lich_settings WHERE name LIKE 'feature_flag:%';
```

Strip the prefix to get the flag name. Interpret value as truthy if it matches `/\A(?:1|true|on|yes)\z/i`.

**`DEFAULTS = {}.freeze`** — all flags default to `false` if not in the table. No flag is on by default.

### Known lich_settings Keys

| Key | Type | Notes |
|-----|------|-------|
| `db_maint_last_at` | ISO8601 string | Timestamp of last VACUUM maintenance |
| `db_maint_last_note` | string | Human-readable VACUUM result summary |
| `feature_flag:session_summary_store_and_reporting` | boolean string | Controls whether `session_summary_state` rows are written. OFF by default. |
| `feature_flag:log_enabled` | boolean string | Script logging |
| `feature_flag:display_inline_exp` | boolean string | Show inline exp gains (DR-specific) |
| `feature_flag:display_lichid` | boolean string | Show Lich room IDs in output |
| `feature_flag:display_uid` | boolean string | Show SimuCo UIDs |
| `feature_flag:display_exits` | boolean string | Show exit information |
| `feature_flag:debug_messaging` | boolean string | Debug output |
| `feature_flag:win32_launch_method` | string | Windows launch method |
| `feature_flag:did_trusted_defaults` | boolean string | Whether trusted script defaults were initialized |

**Important:** Because `DEFAULTS` is empty, any key absent from the table evaluates to `false`. Lichborne should treat missing rows as `false` — same as Lich does.

### Reading lich_settings from Lichborne

```typescript
// Get all settings in one query
const rows = db.prepare('SELECT name, value FROM lich_settings ORDER BY name ASC').all()

// Separate feature flags from other settings
const featureFlags = rows.filter(r => r.name.startsWith('feature_flag:'))
  .map(r => ({ name: r.name.slice('feature_flag:'.length), value: r.value }))
const otherSettings = rows.filter(r => !r.name.startsWith('feature_flag:'))
```

---

## 7. session_summary_state — Multi-Session Tracking

**Source:** `lib/common/settings/session_database_adapter.rb`

### When Rows Exist

Only when the `session_summary_store_and_reporting` feature flag is explicitly enabled (off by default). In the live installation this table is almost certainly empty. The table schema is always created — only row writes are gated.

### Active Session Query for Lichborne

```sql
SELECT pid, session_name, game_code, frontend, state, started_at, last_heartbeat_at
FROM session_summary_state
WHERE COALESCE(state, '') != 'exited'
  AND last_heartbeat_at > (CAST(strftime('%s', 'now') AS INTEGER) - 60)
ORDER BY started_at ASC;
```

The 60-second heartbeat window ensures stale rows from crashed sessions don't show as active.

### session_name Format

The `session_name` column contains the character identifier. Format varies — may be `"DR:Aldric"` or just `"Aldric"`. Strip any `GAME:` prefix before displaying. Map to `game_code` column for the game label.

### Lichborne Usage

- Query on every connection and on Lich Dashboard open
- Show multi-session badge in Dashboard header if > 1 active row
- Show toolbar dot badge on "Lich" button as secondary signal
- If table is empty or all rows expired: show nothing — no error, no notice

---

## 8. Script Profile YAML System

**Source:** `lib/common/setup_files.rb`
**Location:** `{LichDir}/scripts/profiles/`

### File Naming Convention

| Pattern | Purpose |
|---------|---------|
| `base.yaml` | Universal defaults — all characters inherit these |
| `base-empty.yaml` | Empty baseline for comparison/reset |
| `include-{suffix}.yaml` | Shared include files, merged recursively |
| `{Character}-setup.yaml` | Primary character profile (loaded by `get_settings(['setup'])`) |
| `{Character}-{suffix}.yaml` | Character variant profiles (e.g. `CharName-back.yaml`, `CharName-Boxes.yaml`) |

### Load and Merge Order

`SetupFiles.get_settings(['setup'])` loads in this order and deep-merges:

1. `base.yaml` — universal defaults
2. `base-empty.yaml` — empty baseline
3. Resolved `include-*.yaml` files (recursive; circular refs protected)
4. `{Character}-setup.yaml` — character-specific overrides

**Merge rule:** Later files overwrite earlier ones. Exception: keys listed in `union_keys` (an array in any profile) are merged via array union (`(old + new).uniq`) instead of overwrite. This lets `base.yaml` and character profiles both contribute to `training_list` without clobbering each other.

### Key Format

YAML is loaded via `YAML.unsafe_load_file` then wrapped in `OpenStruct.new(...).to_h`. Properties are accessed as method calls (`settings.hometown`, `settings.training_list`). Scripts receive a **deep clone** — mutations to the returned object don't affect the cache.

### Well-Known Top-Level Keys

These appear in virtually every character setup file:

| Key | Type | Example |
|-----|------|---------|
| `hometown` | string | `"Crossing"` |
| `safe_room` | integer | `1234` (Lich room ID) |
| `health_threshold` | integer | `65` (percentage) |
| `repair_timer` | integer | `14400` (seconds) or `0` to disable |
| `skip_repair` | boolean | `false` |
| `depart_on_death` | boolean | `false` |
| `dump_junk` | boolean | `true` |
| `combat_teaching_skill` | string | `"Evasion"` |
| `hunting_buddies` | array of strings | `["Friend1", "Friend2"]` |
| `find_empty_room_first` | boolean | `true` |
| `training_list` | array of objects | See below |
| `union_keys` | array of strings | Keys to merge rather than overwrite |

### `training_list` Structure

Each element is a hash with:
```yaml
- skill:
  - Evasion
  start: 20
  scripts:
  - get2 2879
  - evasion 5
```
- `skill` — array of skill names for this training block
- `start` — minimum rank before this block activates
- `scripts` — array of script invocations to run (script name + args as a single string)

### Writing Profiles from Lichborne

- Read with `lich:read-profile` IPC (already implemented in Release B)
- Write with `lich:write-profile` IPC (new in Release D): parse as YAML before writing to validate, write to `{filename}.tmp`, then rename — never write directly so a crash mid-write doesn't corrupt the original
- Lich re-reads profiles when a script calls `get_settings()` — changes take effect on the next script start or on explicit reload. No live-reload mechanism exists.

---

## 9. Script Control Commands

These are commands Lichborne injects upstream (client → server) through the Lich socket to control scripts.

| Command | Effect | Response format |
|---------|--------|-----------------|
| `;listall` | List all running scripts | `--- Lich: no active scripts` OR `--- Lich: script1, script2 (paused), script3` |
| `;pause name` | Pause a running script | Free-form Lich message in main stream |
| `;resume name` | Resume a paused script | Free-form Lich message |
| `;kill name` | Kill a running script | Free-form Lich message |
| `;name args` | Start a script | Free-form Lich message or silence |

### `;listall` Response Parsing

The ONLY line Lichborne intercepts and suppresses from the main game window is the `--- Lich: ` response to `;listall`. The strict regex in `LichBridge.interceptLine()`:

```typescript
/^--- Lich: (?:no active scripts|((?:[a-zA-Z0-9_-]+(?:\s+\(paused\))?)(?:,\s*[a-zA-Z0-9_-]+(?:\s+\(paused\))?)*))\s*[\r\n]*$/
```

Free-form Lich messages like `--- Lich: no scripts to kill` do **not** match and pass through to the main window as normal text.

### Important: `DRSkill.listall` is Different

`DRSkill.listall` (in `drskill.rb`) lists the character's **trained skills** with ranks/mindstate. It outputs lines like:
```
DRSkill: Evasion: 500.45% [12/34]
```
This is unrelated to the script list. Do not confuse with `;listall`.

---

## 10. Connection & Frontend Modes

### How Lichborne Connects via Lich

1. Lichborne spawns Lich as a child process with `--stormfront` (or whatever `lichClientFlag` is set to)
2. Lich authenticates with SGE for the specified character
3. Lich opens a local TCP listener on `lichPort` (default 11024)
4. Lichborne connects to `127.0.0.1:lichPort` as if it were a StormFront client
5. Lich proxies the full XML game stream to Lichborne, with its own output injected as `--- Lich:` prefixed lines

### Port Assignments (from `_shared.yaml` / profile)

| Game | Default Port | Lich Flag |
|------|-------------|-----------|
| DR Prime | 11024 | `--dragonrealms` |
| DR Test | 11624 | `--test --dragonrealms` |
| DR Platinum | 11124 | `--platinum --dragonrealms` |
| DR The Fallen | 11324 | `--fallen` |

### How Lich Injects Output

Lich injects its own messages as lines beginning with `--- Lich: `. These are NOT XML — they are plain text lines that arrive in the game stream between XML tags. The StormFrontParser in Lichborne processes them as `stream-text` events on the `main` stream unless intercepted first by `LichBridge.interceptLine()`.

---

## 11. IPC Architecture (Lich ↔ Client)

### What Lich Sends to Lichborne

- The full DragonRealms StormFront XML stream (unchanged)
- Script output echoed to named streams via `<pushStream id="...">` / `popStream`
- The `LichScripts` stream — populated by the `script-watch.lic` script when running (clearStream + pushStream with script list)
- `--- Lich: ` prefixed lines for control responses
- `moonWindow`, `atmospherics`, and other game/script-driven streams

### What Lichborne Sends to Lich

- Game commands (typed by player, macros, triggers, alias expansions)
- `;listall`, `;pause`, `;kill`, `;resume`, `;scriptname args` for script control
- `QUIT` / `EXIT` commands for graceful shutdown

### No Direct IPC Channel

There is no dedicated JSON or structured IPC channel between Lichborne and Lich. All communication happens over the single TCP socket using the same text protocol the game uses. Lichborne injects plain-text commands upstream; Lich responds via plain-text `--- Lich:` lines downstream. The `;listall` polling pattern exploits this.

---

## 12. alias.db3

**Location:** `{LichDir}/data/alias.db3`
**Manager:** The `alias.lic` script

Contains command aliases — expansions from short input to longer command sequences. Managed entirely by `alias.lic`. Schema is not defined in Lich core source (`init_db` does not touch this file). Do not read or expose this in Lichborne — it is a script-private database, not a user configuration surface.

---

## 13. Live Installation Notes

**Install path:** Configured by the user in Lichborne's Advanced Settings (auto-detected from `C:\Ruby4Lich5` on Windows).
**Ruby path:** Set alongside the Lich path; typically the Ruby executable bundled with the Lich installer.

**Profile highlights:**
- `base.yaml` — large universal defaults file; all characters inherit from it
- `CharName-setup.yaml` — primary character profile; overrides base.yaml keys for that character
- Additional variant profiles (`CharName-back.yaml`, etc.) for alternate configurations

**`lich.db3` live state:** Actively written by Lich when connected. Always open by Lich while running — `better-sqlite3` must open read-only to avoid locking conflicts. SQLite WAL mode means concurrent reads are safe without blocking Lich's writes.

**`session_summary_state`:** Expected to be empty or have stale rows since the `session_summary_store_and_reporting` flag defaults to off.

**`data/DR/` and `data/DRT/`:** Per-character subdirectories for map data, cached state, and game-specific files. Not directly relevant to the Lich Dashboard.

---

## 14. Integration Constraints for Lichborne

### Read-Only SQLite Access

Open `lich.db3` with `better-sqlite3` in read-only mode:
```typescript
import Database from 'better-sqlite3'
const db = new Database(lichDbPath, { readonly: true, fileMustExist: true })
```

SQLite WAL mode allows concurrent reads without blocking Lich's writes. Never open the DB for writing — Lichborne is a consumer only.

### Variable Staleness

`uservars` is written every **5 minutes** if changed, or on `Vars.save` calls by scripts. A Variable Inspector opened mid-session may show values up to 5 minutes stale. Always show a staleness indicator and a Refresh button.

### Profile Write Safety

Write profiles atomically:
1. Write to `{filename}.tmp`
2. Parse the written content as YAML to validate
3. Rename `.tmp` → target filename

Lich re-reads profiles when scripts call `get_settings()`. Changes take effect on next script start — no live reload.

### Never Write uservars

Writing `uservars` from Lichborne would race with Lich's 5-minute save cycle and corrupt script state. The Variable Inspector is read-only by design.

### `;listall` Polling Frequency

The existing `useLichBridge` hook polls every 5 seconds. This is acceptable — the game server's roundtime mechanism means commands are rate-limited already, and `;listall` is lightweight. Do not poll more frequently.

### Lich Must Be Running

All Lich-specific features (Variable Inspector, Settings Viewer, Session Awareness) require `lich.db3` to exist at the configured path. If Lich is not installed or the path is wrong, surface a clear "Lich database not found — check your Lich path in Advanced Settings" message rather than errors or empty content.

---

## 15. Downstream / Upstream Hooks (Lich rewrites the stream)

Lich can transparently REWRITE the game stream in both directions via `DownstreamHook` (server→client) and `UpstreamHook` (client→server). A hook is a named Ruby proc; every line passes through every registered hook before it reaches the front-end (downstream) or the game (upstream). **This is invisible from Lichborne's side** — we see the post-hook stream — so when the parser is proven correct but data still goes missing, a Lich hook is the next suspect. Grep `DownstreamHook.add` / `UpstreamHook.add` in the Lich source.

### `inventory_boxes_off` — a DEFAULT downstream hook that can EAT hand tags

Lich installs this hook **by default** for stormfront-style front-ends (`lib/main/main.rb:639`, `DownstreamHook.add('inventory_boxes_off', inv_off_proc, persist: true)`). Its proc strips any line **starting** with `<container`/`<clearContainer`/`<exposeContainer` via:

```ruby
gsub(/<(?:container|clearContainer|exposeContainer)[^>]*>|<inv.+\/inv>/, '')
```

The `<inv.+\/inv>` alternative is **greedy** — it spans from the FIRST `<inv` to the LAST `/inv>` on the line, swallowing anything between two inv blocks. When the player's game-side "display all inventory and container windows" account flag is ON, a GET from a container emits a line where a `<right>`/`<left>` **hand tag sits between two inv blocks** → the hook eats the hand tag → the front-end's hand display goes stale (this was Lichborne **B169**; the `_flag` fix is #80).

**The disarm (what Wrayth does, and Lichborne mimics on Lich connections):** send `_flag Display Inventory Boxes 1` once at bootstrap. Lich's UPSTREAM hook (`main.rb:641`, matches `^(?:<c>)?_flag Display Inventory Boxes ([01])`) **consumes** the command (it NEVER reaches DR), `DownstreamHook.remove('inventory_boxes_off')`s the eater, and persists `player_id` in `enable_inventory_boxes` so `xmlparser.rb` auto-removes it at every future login. **Only send it on a LICH connection** — on direct-SGE there's no hook to disarm and the `_flag` would flip the player's real account flag at the game. The now-flowing container XML is harmless to absorb (container tags are silent, `<inv>` is capture-discarded).

### UpstreamHook runs BEFORE the `;command` check — injected commands are visible to scripts

Lich's `do_client` runs `UpstreamHook.run(client_string)` on every client line **before** it checks for a leading `;` (`lib/global_defs.rb`, the `do_client` path). So any command Lichborne injects over the socket — including a `;listall` poll — is seen **byte-for-byte, as if the player typed it**, by any script with an upstream hook (e.g. dr-scripts automap recording "last command → this room"). **There is NO side channel** — one socket, hooks first — so a "synthetic" injected command is impossible. This is why Lichborne's `;listall` auto-poll is gated on a Lich Scripts panel being OPEN (Lichborne #163): don't inject when nobody's watching, because the injection isn't invisible.

---

## 16. DragonRealms Protocol & drinfomon Parse Reference

The DR-specific state (skills, banking, combat, injuries) is parsed by Lich's `lib/dragonrealms/drinfomon/` modules and `lib/common/xmlparser.rb`. When Lichborne needs the same value, **mirror Lich's verified regex/constant VERBATIM** rather than inventing DR math — each `drinfomon` module ships a `_spec.rb` file whose cases are the verified inputs. `DRStats`/`DRSkill` etc. are **in-memory Ruby class vars with no client push**, so a front-end can't READ them — but running Lich's exact parse in the front-end produces the identical value, live, and works direct-SGE too.

### Coin ratios (banking) — `drbanking.rb:56-62`

```ruby
DENOMINATION_VALUES = { 'platinum' => 10_000, 'gold' => 1_000, 'silver' => 100, 'bronze' => 10, 'copper' => 1 }.freeze
```

To compare/sum money, convert every denomination to **copper** with these multipliers. Never guess the ratios. **Game-native deposit/withdraw messages** (script-independent, the port target for anything currently keying on a `DRBanking:` script line): `The clerk slides a small metal box across the counter into which you drop (?<amount>\d+) (?<denomination>\w+) (?<currency>Kronars|Lirums|Dokoras)` (`drbanking.rb:25`, `DEPOSIT_PORTION`); the withdraw form is `The clerk counts|You count out (?<amount>\d+) (?<denomination>…)` (`drbanking.rb:38`). Currency is per-province (Kronars / Lirums / Dokoras) but the denomination ratios are universal.

### Injuries — `xmlparser.rb:683-688` (the encoding B224 mirrored)

DR encodes each body part's state in the `<image name>` inside `<dialogData id='injuries'>`. Three DISTINCT states — a wound and a scar are NOT the same:

| `<image name>` | Meaning |
|---|---|
| `Injury<n>` | ACTIVE wound of rank `n` (1–3) |
| `Scar<n>` | the wound HEALED — Lich sets `wound = 0` and records a scar of rank `n` (scars persist through death/healing) |
| `Nsys<n>` | nerve/system damage of rank `n` |

A part with none of these markers is HEALTHY. **Derive healthy from the ABSENCE of `/^(injury|scar|nsys)(\d)/i`, never from `name === partId`** (the sentinel for an unhurt part varies). Reading any non-id name as a wound and scraping its digit for severity is exactly the B224 bug (a `Scar2` shown as a permanent "Moderate" wound while `HEAL` correctly reports no injuries).

**Receiving nothing is a normal reading (verified 2026-09-15), but the dialog is not purely change-driven (corrected 2026-11-01).** It is not part of the login burst, and DR sends it when a part's state changes, though not at once: see "The injuries dialog around a heal" in §17. A full captured DR-through-Lich session (the B165 corpus, `<playerID>` and `<app char=…>` included) contains **zero** injuries dialogs, against 25 `minivitals` and 3 `spellChoose`. A front-end that has received none therefore knows only "nothing has been reported", which for an unhurt character is the whole session.

- **Lichborne consequence (B422):** an empty part map reads as "No active wounds.", not "waiting for data" — a waiting state there would never resolve. The caveat lives in the panel's tooltip.
- **Answered by a capture around a heal (2026-11-01):** "all clear" is a full dialog of 15 healthy images, not an empty one. The image-less `dialogData id="injuries"` that follows each update holds only the health bar (`<skin>` + `<progressBar id="health2">`), so Lichborne's parser is right to emit no `injury-update` for it.

### The status prompt carries state that NO indicator tag reports (verified 2026-09-15)

With `set statusprompt` on, DR writes the character's current state as letters before the `>` in `<prompt>` — `SUP>` is stunned + unconscious + prone, and the letters track live (Binu: the `S` vanished the moment `<indicator id='IconSTUNNED' visible='n'/>` arrived, and the `U` went as soon as the waking message printed).

**UNCONSCIOUS exists only here.** There is no `IconUNCONSCIOUS`:

- Lich's `ICONMAP` (`lib/constants.rb:72-84`) lists 11 icons — kneeling, prone, sitting, standing, stunned, hidden, invisible, dead, webbed, joined, bleeding — and no unconscious.
- Genie handles 13 `case "IconX"` labels (those 11 plus poisoned and diseased); Frostbite's DR status indicator handles the same 11; Profanity accepts any `Icon[A-Z]+` generically, so it enumerates nothing.
- The word "unconscious" appears **zero** times across all three sibling clients. None of them surfaces this state, and none decodes the prompt letters.

**Consequences for a front-end:**
- The only way to show unconscious is to decode the prompt letter, which is what Lichborne does (B426) — and it is therefore blank for any player who has not enabled `statusprompt`.
- **Only `U` is confirmed.** The rest of the alphabet is unverified here: `H`, `R` and `s` appear in captures, and `J` is believed to be joined, but nothing has been tested. Don't map a letter on a guess — the game states it plainly or we don't claim it.
- The letters are a mirror of state DR reports elsewhere, so decoding one that ALSO has an indicator tag would duplicate a signal we already receive.

### Combat — position / balance / range / assess (mirrored in `combatExtract.ts`)

- **Assess:** `xmlparser.rb`'s `parse_assess_line` (upstream PR #1413) yields per-creature records — relation (facing/flank/behind/advancing) + range + status + creature id. The creature **id is identity; the small targeting NUMBER is a reusable slot** (a dead creature's slot recycles). Assess is on-demand/script-driven (no passive push); it's cleared by `clearStream 'assess'`.
- **Combat narration is ANONYMOUS** — attack/close/advance lines carry NO creature id (only assess/look/face do), so per-attack→creature attribution is impossible; don't fake it. Melee range = "engaged" is the honest all-attackers signal.
- **Posture** `(prone)/(sitting)` (PR #1442) and combat-position (PR #1400) land in the same parse.

### Room id in the subtitle — Lich rewrites `[Title] (uid)`

DR's `<streamWindow id='main' subtitle='…'>` carries the room title, and the room id can appear in TWO forms; Lich may REWRITE them based on feature flags:

- `[Whistling Wood, Barrows - 9479]` — id inside the brackets after ` - ` (Lich `display_lichid` injects the LICH id this way as bare digits).
- `[Arthelun Ruins, Courtyard] (56107)` — the StormFront-standard `[Title] (uid)`, DR's own room-id-flag display. With Lich's `display_uid` on, Lich rewrites this to a **`u`-prefixed** `(u12345)` (same game uid). `(**)` / `(unknown)` = no id.

Parse BOTH (regex `\]\s*\(u?(\d+)\)` for the parens form, `u?` optional). **Absence of an id must stay a no-op** — the flag is optional; never make a parsed room id load-bearing (Lichborne #65). The companion source is `<nav rm='X'/>` (some transitions send ONLY `<nav>`, no `<streamWindow>` — Lichborne #46).

### Native room-number / exits injection (5.18+)

Lich core now natively injects the room-number + obvious-exits display (`;display roomlinks`/`roommono`, upstream #1438), **replacing the retired dr-script `roomnumbers.lic`**. DR defaults to **mono + plain text** (not `<d>` command links). A tester seeing room-number/exit lines they didn't before is this, gated on the game room-number flag / `display_uid`/`display_lichid` — not a bug.

### Moon sidereal periods + phase math — the DR CLIENT's own constants

Mined from **moonwatch.lic v4.5.0** (`Moons.phase`, ~line 933), which took them from the **DR client's hard-coded `DR_MOONS`** — the script is explicit that these are the *client's* constants, **not** moonwatch's calibrated calendar, and that they are therefore identical on every instance (Prime / Platinum / Fallen / Test).

| Constant | Value | Source |
|---|---|---|
| Sidereal period, Katamba | **14 847** roisaen (60s each) | client `DR_MOONS` |
| Sidereal period, Xibar | **9 983** roisaen | client `DR_MOONS` |
| Sidereal period, Yavash | **16 171** roisaen | client `DR_MOONS` |
| Phase epoch skew | **80 895** roisaen (= `DR_EPOCH_SKEW_SECONDS` 4 853 700 / 60) | client |
| Days per year | **400** | DR calendar |

Phase, with **integer** division throughout, against the 8 names in cycle order (`new`, `waxing crescent`, `first quarter`, `waxing gibbous`, `full`, `waning gibbous`, `third quarter`, `waning crescent`):

```
min     = unixSeconds / 60
orbital = ((min % sidereal) * 360) / sidereal
doy     = ((min + 80895) / 360) % 400
angle   = (orbital + (doy * 360) / 400) % 360
index   = (angle * 8) / 360
```

**Verified** (ported to JS and sampled a 400-day year, 2026-07-28): all 8 buckets reachable for all three moons, each dwelling ~28h — matching the script's "roughly a real day".

Two caveats the script states itself: phase is **model-only** (DR broadcasts no passive phase event to self-correct against), and the wordings of the `observe <moon>` verb confirm it. As of v4.5.0 only 4 of 8 were mapped (*growing crescent* → waxing crescent, *nearly turned its full face* → waxing gibbous, *perfect circle* → full, *waned to a narrow crescent* → waning crescent). **moonwatch v4.5.4 (read 2026-10-04, `scripts/moonwatch.lic` changelog lines 64–95) maps 7 of 8 for every guild and 8 of 8 for Moon Mages**, validated against ~2,700 logged observe responses:
- v4.5.1: "beginning to wane, travels slowly through the sky" → waning gibbous; "moves across the skies" → third quarter.
- v4.5.2: "Waxing still, half of the … moon <M> looks down from above" → first quarter. The wording was there all along; the script's pattern had anchored on a leading "The".
- **A new moon does rise, but DR broadcasts no rise for it** (0 rises at the model's new across ~2,700 logged rises, against ~130 per other phase). So a rise-triggered observe never fires while new, and non-Moon-Mages get only "nowhere to be seen".
- A **Moon Mage** can still sense it: "…moon <M> turns up fruitless" (below the horizon, 40/42 = new, v4.5.3) and "<M> is hidden from you, but its energy is quite strong" (up, 45/45 = new, v4.5.4).

### Moonskin — Rakash change while Katamba is full

**Verified 2026-10-04** (Elanthipedia "Moonskin"; Mahtra's DRMoonWatch, github.com/MahtraDR/DRMoonWatch `index.html`; reproduced in `tmp-moon-harness/moonskin.ts`). Rakash take their moonskin form (claws, fangs, sharper senses) for exactly as long as **Katamba is full**: from the minute the phase math above first gives index 4 until the minute it leaves 4. With the client constants that reproduces Elanthipedia's observed Moonskin table **to the minute**: 2012-03-13 05:05Z → 03-14 08:34Z, and 03-22 13:10Z → 03-23 17:20Z (the table lists CDT). A window lasts about 27.5–28.2 hours and comes roughly every 8–9 days, so it is a pure function of time, with no feed and no Lich needed. DRMoonWatch labels the length "(~28h)", which is a fixed string, not a measurement. The repository carries **no license** (the GitHub API reports none), so Lichborne re-derives the algorithm from the client constants it already had rather than copying code. Consumed in DESIGN §52.11.

Separately, moonwatch's **synodic** cycle constants (its own OLS fits, used for rise/set timers — `cycle` / `visible` seconds per moon) are NOT client constants and carry per-character calibration offsets; **v4.2+ requires `;moonwatch reset` once per character after updating** or the timers drift. Lichborne consumes those timers via the `moonWindow` stream, so a tester who skipped the reset will see our moon positions drift too.

Consumed by Lichborne in DESIGN §34.9 **F64a**.

---

## 17. Lich Version Log

A running record of Lich releases we've reviewed: **what changed, whether it affects Lichborne, and why any fix matters** (esp. for tester support — a "Lich broke after updating" report usually maps to a specific release here). **Lichborne presents as `--stormfront` permanently** and the integration surface (force-mode loopback bind → one front-end → close listener; XML passthrough; `;eq`/Marshal vars; `;listall` poll) is version-agnostic — and the parser **degrades gracefully on any unknown tag** (the tokenizer strips every `<…>`, an unhandled tag is ignored, its inner text still shows). So a new Lich/DR *tag* can't break the client; only a whole-protocol swap away from XML could (a `$frontend`-mode problem, not a parser gap). **Backwards-compat rule (Sekmeht, 2026-07-20): stay compatible with at least the previous major Lich.**

### Lich 5.18.0 — verified 2026-07-16 (integration holds unchanged)

- **⚠️ Ruby 4.0 now REQUIRED** (was 2.6/3.2). Lich alerts and refuses to launch on older Ruby — which surfaces in Lichborne's launch-log error banner as a failed launch. **Tester support: a "Lich won't start after updating" report on 5.18+ ⇒ check the tester's Ruby version FIRST.**
- **Native room-number/exits injection** (#1438) — see §16; replaces `roomnumbers.lic`. Testers may just SEE new room-number/exit lines.
- **`inventory_boxes_off` hook now carries `persist: true`** (§15) — still installed for stormfront/GSL FEs; the `_flag Display Inventory Boxes 1` disarm is unchanged.
- **The `(u12345)` `display_uid` subtitle** (§16) — pre-existing (not a 5.18 regression), but re-confirmed here.
- Everything else we touch (force-mode bind model, `vars.rb` Marshal read + `;eq … Vars.save` write, `;listall` format, `<d>`/`<output class="mono">`/inline `<dialogData>` handling) verified **unchanged**.

### Lich 5.19.0 — a stormfront-BREAKING bug (5.19.0 ONLY)

- **#1443 rewrote the ARGV frontend-flag checks to `a == /regex/`, and `String == Regexp` is ALWAYS false in Ruby** — so `--stormfront` (which Lichborne passes) never matched → `$frontend` fell through to `'wizard'` → **GSL/Wizard-protocol tokens leaked into the client instead of XML** (a tester hit exactly this: raw protocol garbage / unformatted tokens instead of the normal feed). **This is Lich-side, on 5.19.0 only.**

### Lich 5.19.1 — verified 2026-07-21 (current; the fix + safe deltas)

- **#1456 FIXES the 5.19.0 GSL leak** (`==`→`=~`, `lib/main/argv_options.rb:283-290`: `a =~ /^--stormfront$/i` → `$frontend='stormfront'`). **Tester support: a tester on 5.19.x seeing raw protocol garbage is on 5.19.0 — have them update to 5.19.1+.** Lich-side bug, Lich-side fix; no Lichborne change.
- **#1452** — resilient ActiveSessions ownership + a shutdown watchdog (`shutdown_watchdog.rb`): hardens Lich's TEARDOWN so a hung `Vars.save`/socket-close can't leave the process holding port 11024. Mildly BENEFICIAL for us (faster port release on Lich exit); does not touch the force-mode FE listener.
- **#1449** — lowers the GAME socket's TCP keepalive idle 120s→30s (`lib/games.rb`); the commit states "No effect on the [FE] socket."
- **#1437** — bind-host keywords for `--detachable-client`/`--headless` (Lichborne uses neither; the FE listener still defaults to `127.0.0.1`).
- **GS-only / Lich-internal (never reaches a DR front-end):** GS creature XML/templates (#1425/#1427), GS climate/terrain (#1388), a `reserve` pushStream id (#1379), and the **REXML→Ox** parser migration (#1396 — Lich's own state parse; the FE still gets the raw XML passthrough). *If DR ever exposes `<roommeta weather>` (#1450 added GS-only weather codes), that'd be a STRUCTURED weather signal worth revisiting Lichborne's "no passive weather feed" conclusion — GS-only today.*

### Lich 5.20.0 — verified 2026-08-16 (no break; surfaced a Lichborne bug)

- **Integration surface holds.** `parse_assess_line` unchanged (#1485 only *additionally* feeds entries to Lich's own `Creature` tracker — the rule Lichborne mirrors verbatim is intact); `--stormfront` still `a =~ /^--stormfront$/i` → `$frontend='stormfront'` (the 5.19.0 `==` bug stays fixed); the map JSON keeps its shape and `map-*.json` is still written (#1495 dropped OTHER legacy mapdb formats, not JSON).
- **⚠️ DR now emits `<nav rm='NNNN'/>` on EVERY arrival** (#1491), matching GemStone — a bare `<nav/>` for a room with no UID. Lich adopted it as the authoritative DR room-UID source **instead of scraping the `streamWindow` subtitle**, and **stopped forcing the game's `ShowRoomID` flag**. Net effect for a front-end: the room UID is now reliably present on every move, where before it depended on the player having that flag on.
- **NEW opt-in title placements** (#1491 + #1500). Defaults are unchanged — nothing is embedded in the title unless the player opts in — but `;display roomid title` can now produce shapes no earlier Lich emitted:
  - `[Town Square - 1234] (230008)` — Lich's own id in the dash slot, the game's RealID in parens.
  - `[Town Square - 1234 - (u230008)]` — **the UID INSIDE the brackets**, which is the one that broke Lichborne's subtitle parser (the dash pattern needs digits at the end; this ends with `)`, and the parens pattern needs them after the `]`). Fixed in v0.19.1; all 8 shapes are covered.

### Lich 5.20.1 — verified 2026-09-14 (no break; one fix that HELPS Lichborne)

- **#1530 / #1532: `quiet:` output no longer strands the front-end in mono.** `Lich::Util.issue_command(…, quiet: true)` drops the matched range in a DownstreamHook, and that hook runs on the raw, unsplit socket chunk. DR can bundle the mono-closing `<output class=""/>` onto a chunk being discarded (Lich's example: after `spell active`), so every front-end was left in mono until some unrelated later mono tag. Now `preserve_quiet_state_tags` forwards just that tag, newline-terminated (`lib/util/util.rb`, `QUIET_STATE_TAGS`; today only the `<output class="…"/>` pattern).
  - **Lichborne impact:** the tag arrives on a line of its own. `StormFrontParser` toggles `monoMode` and emits nothing, so there is no spacer row: `isBlankLine` tests the raw line, and a tag-only line leaves no pending segments.
  - **On Lich < 5.20.1, Lichborne was exposed too:** `monoMode` only resets on another `<output>` tag or `parser.reset()`. **Tester support: "text went monospaced/columnar after a script ran" on older Lich ⇒ update to 5.20.1+.**
  - Corpus note (2026-09-14): 39 mono blocks in the Frostbite `mock.xml` capture, none containing a `<prompt>`, which suggests a prompt-time `monoMode` reset would be safe. That is one session's evidence, not proof.
- **#1502:** EAccess auth is now bounded by a timeout. Lichborne's own `SGEConnection` already bounds connect and read at 5s, so there is nothing to adopt.
- **#1517:** Linux WINE / Wrayth front-end detection, which only matters when Lich launches the front-end. The rest of the release is GemStone combat work.

### Lich 5.21.0 (+ unreleased main through f8ea1f20) — verified 2026-09-14 (integration holds unchanged)

**Integration surface, all unchanged:**
- `--stormfront` is still matched with `a =~ /^--stormfront$/i` → `$frontend='stormfront'` (`lib/main/argv_options.rb:277-351`).
- **Force-mode front-end listener:** every `main.rb` change sits in the path where LICH launches a front-end (`custom_launch` can now be an argv array; `FrontendLauncher.render_connection` substitutes `%host%`/`%port%`/`%key%`), not the listener Lichborne connects to. A stormfront-style front-end still sends exactly two lines, the login key then the client ID (`main.rb:837-842`), which is what `LichConnection` sends (`loginKey` + `CLIENT_ID`).
- The `inventory_boxes_off` hook and the `_flag Display Inventory Boxes 1` disarm are unchanged (`main.rb:793-835`).
- **Untouched:** `vars.rb`, and the `;listall` output (`script.rb` only gained `File.join` paths and pause enforcement).
- **`xmlparser.rb`:** the percWindow, assess and injuries branches are unchanged. The one edit makes DR hand tags evict that item from Lich's own worn/container model (`xmlparser.rb:1045-1059`), which is internal to Lich.
- **`drparser.rb`:** the PositionValue, BalanceValue and NameRaceGuild rules Lichborne mirrors are unchanged. What did change, none of it mirrored by Lichborne: INV LIST vs INV SEARCH scraping (`InventoryGetStart` split into `InventoryListStart` / `InventorySearchStart`); `DRSkill.clear_mind` now pins capped skills (rank ≥ 1750) to 34; three new `VOL_MAP` sizes (`colossal` / `gigantic` / `immense`).
- **Map JSON** is unchanged; `dijkstra(…, static_only: true)` is additive (#1577, `docs/static-map-routing.md`).
- **Capability registry:** moved from `front-end.rb` to `frontend.rb` plus per-front-end definition files in `lib/common/frontend/`. `saga` is still stormfront's capabilities plus `sentinel` (`frontend/saga.rb`), so the do-not-adopt decision below stands.

**New things a front-end can use:**
- **#1524, the Saga "extended feed" `inventoryManager`:** confirmed live on GS AND DR. See the subsection below.
- **#1558, a configurable front-end registry in `DATA_DIR/frontends.yml`** (schema v1, kept out of `entry.yaml`):
  - `builtins:` overrides a built-in front-end's `executable` / `arguments`.
  - `custom:` defines a new front-end, with a `command` template using `%host%` / `%port%` / `%key%`.
  - **Trap:** a custom front-end's id becomes `$frontend`, because `Frontend.client=` is a plain `$frontend =` (`frontend.rb:573-579`). A custom id like `lichborne` would therefore fail every script that checks `$frontend == 'stormfront'` by name. Lich's GUI "Custom" launch option deliberately keeps the stormfront protocol identity (`docs/saved-frontend-editing.md`), and so does overriding the `stormfront` built-in's executable.
  - On Windows the built-in stormfront launch passes Wrayth-style arguments: `/G<code>/Hlocalhost/P<port>/K<key>`.
- **#1570, an HTTPS web-login fallback for when eaccess.play.net:7910 is unreachable** (`lib/common/authentication/web_login.rb`; protocol notes in `docs/web-login-protocol-analysis.md`). It returns the same GAMEHOST/GAMEPORT/KEY shape as EAccess. Lich states these caveats itself:
  - There is no character-list endpoint; the list is scraped from `home.asp`, which is fragile.
  - Game codes differ from EAccess's (GS Prime is `GS4` here, `GS3` over EAccess).
  - DRX and DRF are enabled but unconfirmed live.
  - play.net's WAF returns 500 for any request without a browser-like User-Agent.
- **#1520, `--active-session-dir=PATH`:** points Lich's ActiveSessions coordination at a shared directory, and for that process implies the otherwise-off `active_sessions_api` feature flag. The coordination is a discovery file, `lich-active-sessions.json`, plus an ownership lock; the owning process binds an ephemeral port and publishes `{owner_pid, port, auth_token}`. Sessions register with a name and a role, and a detachable-client port sets the role (`main.rb:887-895`). This is groundwork for discovering running headless sessions; nobody has explored it for Lichborne's Attach mode yet.
- **Script-side only, no front-end effect:**
  - bounded `fput` (`max_resends` / `interrupt` / `failures: :symbol`, #1587) and `waitrt?(interrupt:, cap:)`
  - `Script#pause` enforced at every blocking checkpoint (#1537)
  - `Spell.results_regex` (#1590) and player-supplied custom prep/cast messages (#1528)
  - `Lich::Common::UserDefs`, extracted from DR CustomSubstitutions (#1605). This is scroll/creature name normalization, not display substitutions.

### Lich 5.22.0 (+ unreleased main through 536a373f) — verified 2026-10-26 (no break; the rich-stream stack has landed on main)

**Integration surface, all unchanged:**
- `--stormfront` still `a =~ /^--stormfront$/i` → `$frontend='stormfront'` (`lib/main/argv_options.rb:344-403`), and `--dragonrealms` / `--test` / `--platinum` / `--fallen` parse as before. #1745 only touched the flag Lich builds for a session IT spawns.
- **Force-mode handshake:** a stormfront front end still takes the generic proxy branch and sends two lines, the key then its client string (`main.rb:847-861`). What changed is what Lich does with the second line (below).
- `inventory_boxes_off` and the `_flag Display Inventory Boxes` upstream hook are unchanged (`main.rb:802-844`).
- `;e`/`;eq` still `command(/^(?:exec|e)(q)? (.+)$/)` (`lib/common/client_commands/builtins.rb:154`). #1628 moved `do_client`'s chain into an ordered registry; the matching is the same.
- `;listall` output is byte-for-byte the same (`builtins.rb:94-100`: `--- Lich: no active scripts` / `--- Lich: a, b (paused)`).
- **`vars.rb`:** the Marshal blob is unchanged. Two fixes: the checksum is now over the bytes written, and a failed save stays dirty and is retried (#1763). `;eq Vars[…]; Vars.save` behaves as before.
- **`xmlparser.rb`:** `parse_assess_line`'s regex and fields are unchanged; it gained an optional third argument, `link_nouns`, and a `noun:` field read from rich-stream assess links. The percWindow and injury rules are unchanged.
- **`drparser.rb`:** PositionValue, BalanceValue and NameRaceGuild are unchanged. Every DRParser pattern now runs against a link-stripped line (`match_line`, #1702), and several patterns gained a leading `^(?:<[^>]*>|\s)*` anchor so player speech and ESP can't trip them (#1827).
- **Map JSON** is unchanged: #1797 stopped `to_json` compacting the live list in place, and the saved file is the same rooms in id order.

**What a Lichborne session now receives (the rich-stream stack, #1700–#1733, merged after 5.22.0, unreleased):**
- **Lich replaces our client string** (#1724, `Frontend.proxy_handshake`). `LichConnection` sends Genie's `FE:WRAYTH /VERSION:1.0.1.22 /P:WIN_UNKNOWN /XML`; Lich sends the game `/FE:WRAYTH /VERSION:saga-0.10.4 /P:SAGA /XML` instead (#1700), so DragonRealms sends the Saga-identity ("rich") stream. `--keep-fe-string` or `Lich.keep_fe_string` forwards the front end's own string. Both strings are now logged (#1731).
- **Lich rewrites it back for us** (`games.rb` `process_downstream_hooks` → `rich_stream_rewrite`, around line 1210). For a client without the capabilities, which is every stormfront client that declares nothing: `<room>` → the legacy `roomName`/`roomDesc` lines plus a legacy `<compass>` (#1708, #1721); `<a exist>` links stripped, keeping a script's `<a href>`; doubled bold → one pair in room-object listings and none around creatures elsewhere (#1722). Scripts and XMLParser see the unrewritten stream.
- **So Lichborne on Lich main gets the legacy shape** (true when written; since v0.21.0 Lichborne can declare the capabilities (on by default where Lich supports it; **Legacy stream** in Lich Setup is the opt-out), and then gets the rich stream unrewritten, DESIGN §55.11), and v0.21.0's own `<room>` rebuild and link handling stay idle there. `<crtrStatus exist>` still arrives (it isn't a link), with the names unlinked, so the roster pairs by order as on the legacy stream.
- **FLAG DESCRIPTION OFF regresses on Lich main unless the player opts in.** DR's rich stream ignores the flag (a game bug), and Lich's rewrite carries the description into the legacy lines. Lich's fix (#1725, `Lich::Common::RoomDescriptionFilter`) is OFF by default: `;display descflag on`. **Tester support: "room descriptions came back though FLAG DESCRIPTION is off" on a Lich after 5.22.0 ⇒ `;display descflag on`.**

**The capability declaration (#1726, `docs/frontends/capability-declaration.md`):**
- A front end opts out of the rewrites with a control line Lich consumes: `SET_FRONTEND_CAPS room_element game_links double_bold`. On the primary connection, send it after the two handshake lines; on a detachable connection, straight after connecting. Lich sends no reply. Later declarations replace earlier ones. Unknown names are ignored and logged.
- Precedence: the client's declaration > `--frontend-caps=LIST` at launch > the catalog's set for the session's front end (only Saga has all three).
- `game_links` and `double_bold` act only on DragonRealms. A GSL (Wizard/Avalon) session ignores declarations.
- **A Lich without #1726 forwards the line to the GAME as a command.** Main still reads `LICH_VERSION = '5.22.0'` (`lib/version.rb`), so a version number can't tell main from the release. A feature test can: `lib/common/client_capabilities.rb` exists in the install only when the declaration is understood.

**Detachable clients (Attach mode):**
- **The attach-time push is now game-specific and correct for DR** (#1617, `lib/dragonrealms/detachable_client_init.rb`): vitals as the game sends them (`<progressBar id='health' value='87' text='health 87%'/>`, stamina labelled `fatigue`), the concentration bar, all 13 indicators with `'n'` for unseen, both hands (`Empty` if unseen), and a legacy compass. It waits for the first `<prompt>` (up to 10s). The old `value='0' text='health 100/'` shape (pitfall #135) only comes from older Lich. Still skipped for `--genie` and `--saga`; DR injuries are not sent.
- #1656 writes the detachable-client session file without `--login`.

**Tester support:**
- Lich now recommends **Ruby 4.0.9** for security fixes (#1825); 4.0 is still the minimum.
- `--sentinel` (#1677) turns on the `0x1F` origin marker for any front end. Lichborne never passes it, and must not: every line would gain a byte the parser's `^` rules don't expect.

### Unreleased main 536a373f → 4705150a — verified 2026-10-28 (no break; two changes to what a front end receives)

Three commits: #1856 (CI only), #1857 and #1858. The integration checklist (argv, handshake branch, hooks, `;listall`, `vars.rb`, the parse rules we mirror, map JSON) is untouched.

**#1858: the DR server now picks its stream by the EXACT client string.** Per the PR, DragonRealms sends the rich ("Saga") feed only for `/FE:WRAYTH /VERSION:1.0.1.28 /P:SAGA /XML`; GemStone sends it for either string. So `Frontend::CLIENT_STRING` is now that string (`lib/common/frontend.rb:515`, was `saga-0.10.4`), Saga's per-front-end override is gone (`frontend/saga.rb`), and `proxy_handshake` now replaces even a handshake that already says `/P:SAGA` (the "same platform, forward as sent" branch was removed, `frontend.rb:~670`). For Lichborne:
- **This answers DESIGN §55.6's open question** of which token selects the dialect: the whole string, version included. `/P:SAGA` with another version no longer gets the rich stream (the PR saw Saga's own `saga-0.10.5` sent unchanged before the fix).
- **Lich path: nothing changes.** Lich already replaced our `FE:WRAYTH /VERSION:1.0.1.22 /P:WIN_UNKNOWN /XML` and rewrites the rich stream back for us; it now replaces it with the new string.
- **Direct path: unaffected.** Lichborne sends `1.0.1.22 /P:WIN_UNKNOWN` (`ConnectionManager.ts:40`) and gets the legacy stream, as before. If a direct session is ever switched to the rich stream, the string must be `1.0.1.28` exactly, and the help text warns that DR may change it again (`lib/main/help_text.rb:257-262`).

**#1857: a line cut by a roundtime refusal is rejoined (DR).** DR sometimes puts `...wait N seconds.\r\n` into the middle of a line it is already sending, then sends the rest of that line (its remaining text, or just its line end as an empty line). Mahtra's data: 348 of 348 cuts in a month of logs were followed by their rest; none of 4,808 standalone refusals was followed by an empty line. `buffer_split_line` (`lib/games.rb:~288`, `SPLIT_REFUSAL = /\.\.\.wait \d+ seconds?\.\r\n\z/`) now emits the refusal at once as its own line and holds the text before it for exactly ONE line, then joins it to the next. It replaces #1149's `buffer_room_objs`, which only rejoined `room objs`/`room players` components (and dropped the refusal). The cleaned string is what the front end receives, so:
- **Lichborne on Lich main** now sees the refusal BEFORE the sentence it interrupted, and the sentence whole.
- **Lichborne on released Lich (≤5.22) and on a direct connection** still sees the cut: verified by replaying the PR's example through the real `StormFrontParser` (2026-10-28, `tmp-splitline/`): `…his greatsword...wait 1 seconds.` and ` lashing out at everything within reach!` arrive as two main lines. On a direct connection a cut room-objects component carries the refusal into the Room panel text (`…a rock...wait 1 seconds. and a stick.`); released Lich's `buffer_room_objs` already fixes that case. (That was before v0.21.0; Lichborne's parser now does the same rejoin, DESIGN §55.10.)

### Lich 5.23.0 — released 2026-10-27, verified 2026-10-28 (no break; the rich-stream rewrite is now in a release)

- **What it is:** the release commit `16bc7afd` (#1699) only bumps `LICH_VERSION` to `'5.23.0'` and the changelog. Every code change in it is in the two entries above (`4705150a` is an ancestor of `v5.23.0`), so nothing new needed reading. What changes is WHO gets it: until now the rich-stream work was on `main` only, and now every player who updates Lich has it.
- **What a Lichborne player on 5.23.0 receives:** Lich replaces our `FE:WRAYTH` client string with its own Saga string, now exactly `/FE:WRAYTH /VERSION:1.0.1.28 /P:SAGA /XML` (#1724, #1858; `lib/games.rb:1209`), takes DR's rich stream, and rewrites it back to the legacy shape because Lichborne declares no capabilities (#1708 `<room>` → legacy lines, #1721 legacy compass, #1722 links and doubled bold stripped). Lines cut by a roundtime refusal arrive rejoined (#1857, `lib/games.rb:182`).
- **Tester support, now for everyone who updates:**
  - **"My room descriptions came back"** after updating to 5.23.0 with FLAG DESCRIPTION OFF: DR's rich stream ignores the flag and Lich's filter is opt-in (#1725). Fix: type `FLAG` once after logging in, so Lichborne learns the setting and hides them itself on either stream; `;display descflag on` does it on Lich's side.
  - **Ruby 4.0.9 is recommended** for its security fixes (#1825); 4.0 is still the minimum.
- **The capability declaration is now available in a release.** `lib/common/client_capabilities.rb` ships in 5.23.0: `DECLARABLE = %i[room_element game_links double_bold]`, recognised by `DECLARATION = /\ASET_FRONTEND_CAPS(?:[ \t]+(?<names>[^\r\n]*?))?[ \t]*\r?\n?\z/` (lines 29, 34). A Lich older than 5.23.0 still forwards that line to the game as a command, so it must be gated. `LICH_VERSION >= 5.23.0` is now a valid gate as well as the file's presence (on `main` before the release the version still read 5.22.0, which is why the file check was proposed). Attach mode still can't check either, since the Lich may be on another machine.

### Lich 5.23.0 / main 89fa0fd7 — what a front end gets, declared or not (verified 2026-10-29)

Read for the v0.21.0 release-hardening review. Line numbers are origin/main 89fa0fd7 unless marked (local checkout 536a373f for the ones re-verified there).

- **Declarable capabilities and their effect** (`lib/common/client_capabilities.rb:9-11, 29`): `room_element` — Lich stops rewriting `<room>`; `game_links` — Lich stops stripping `<a exist>` (`Markup.strip_game_links`, `markup.rb:158-171`; `<a href>` and `<d cmd>` are kept either way); `double_bold` — Lich stops `strip_link_bold` / `collapse_double_bold` (`markup.rb:48, 199-222`). A client's `SET_FRONTEND_CAPS` line beats the session's `--frontend-caps=` flag (`:15-17`); the line is consumed at `main.rb:875-877` and never reaches the game on 5.23+; on 5.22.0 the client loop dispatched it to the game (v5.22.0 `main.rb:860-866`).
- **Undeclared `room_element`** → `RoomBlock.legacy_shape_with_compass` (`lib/common/room_block.rb:87-94`) rewrites EVERY `<room>` block — Locate and peer included — into the legacy lines and INJECTS a `<compass>` built from its exits (`:76-80`). Lichborne's own `roomBlockLegacyLines` mirrors `legacy_lines` (`:131`) but adds the compass for the player's OWN room only.
- **Lich injects a compass only for a `<room>` block.** An arrival DR sends as legacy components with no block (The Heavens; `xmlparser.rb:525-527`: "a Saga session also gets some moves as the legacy room components") gets no compass from Lich either — B549's reason.
- **`RoomDescriptionFilter`** (`room_block.rb:95-128`, `without_description(room_id:, room_exits:)`) empties the description for the character's OWN room only; `current_room?` = the name's room number equals `XMLData.room_id`, else (no number / `(**)`) the block's exits equal `XMLData.room_exits` from the `room exits` component. Opt-in: `;display descflag on` (`lich.rb:936-937`, `builtins.rb:298`). Applied BEFORE the per-client rewrite, so for every client (`games.rb:1234-1237`).
- **The rewrite runs once per capability set**, after hooks: `process_downstream_hooks` (`games.rb:1221-1257`) runs `RoomDescriptionFilter.observe` and `DownstreamHook.run` on the raw line, then groups clients by capability set and calls `rich_stream_rewrite` per set (`:1284-1294`). Scripts, XMLParser and hooks always see the stream as the game sent it (E12).
- **Regardless of declaration:** room-number display edits the first `]` INSIDE `<name>` (`modify_room_display`, `games.rb:1659-1669` — so a rich `<name>` can read `[Title - 1234] (230008)` or `[Title - 1234 - (u230008)]`; Lichborne's `parseInlineRoomName` handles both); "Room Number:" / "Room Exits:" lines and subtitles (stormfront has `room_window`, `frontend/wrayth.rb:5`); the `...wait N seconds.` rejoin (`buffer_split_line`, `games.rb:288-305`, everyone); `inventory_boxes_off` (`main/main.rb:802-844`).
- **`--keep-fe-string`** (`argv_options.rb:180-189`, `help_text.rb:263-267`) forwards the front end's own string — Lichborne's `FE:WRAYTH /VERSION:1.0.1.22` — and DR then sends LEGACY whatever is declared; `/richstream` reports it correctly. `--frontend-caps=LIST` (`argv_options.rb:115-118`) is the no-code-change test flag; unknown names are warned and ignored.
- **DR picks the rich stream for exactly** `/FE:WRAYTH /VERSION:1.0.1.28 /P:SAGA /XML` (`frontend.rb:516`, #1858; `help_text.rb:257-262`: another VERSION "may lose it"). Lich's own direct paths send the key, the string, then `<c>` twice 0.3 s apart (`main.rb:707-723, 787-800`); the Wizard/Frostbite handshake also sends `_injury 2`, `_flag Display Inventory Boxes 1`, `_flag Display Dialog Boxes 0` (`frontend.rb:739-754`). Whether DR accepts Lichborne's slashless string with `/P:SAGA`, and whether `\n\n` equals the two `<c>` lines, is unverified (DESIGN §55.6).
- **Exist ids** (`spec/fixtures/streams/MANIFEST.md`): a player's is "-1" + the 7-digit zero-padded playerID (so |id| ≥ 10,000,000). The fixtures also carry SMALL negative ids for fixed features (`-851` a door, `-11031/-11032` the moons, `-23767` a crack, `-42998` a trail, `-42696` a spell effect), short positive ids for features (`61479` signpost, `34336` construction) and nine-digit positives for instanced items. Live sessions on 2026-11-01 had EIGHT-digit item ids (4,460 distinct, none of nine) and 5–6 digit features, so don't key on the fixtures' length. Lich itself makes no fixed-vs-pickable distinction (`GameObj#type` is GS-oriented name data, `gameobj.rb:248-264`); inside `room players` it reads a leading `-` as a PC (`xmlparser.rb:1449-1452`), inside `room objs` a bold link is `new_npc` and a plain one `new_loot` (`:1362-1410`). B547's thresholds are Lichborne's inference from these.
- **The rich stream adds no new stream or component ids** (fixture tally: `assess`, `atmospherics`, `combat`, `group`, `percWindow`, `talk`, `whispers`, the `room *` / `exp *` components). `<room>`'s empty inner `<compass></compass>` is the one shape that fooled us (B549).
- **A declared client gets the creature's PRONOUNS in bold too** (a 2026-10-31 raw capture, `Logs/raw`): `<pushBold/>The <a exist="55635809" noun="sentinel">Shard sentinel</a><popBold/> strides in, <pushBold/><a exist="55635809" noun="sentinel">his</a><popBold/> steely grey eyes…` — every pronoun referring to the creature is its own single-bold link with the same id. Non-declaring clients never see any of it: `Markup.strip_link_bold` (`lib/common/markup.rb:199-203`, `LINK_BOLD` at `:48`, run first in `adapt_for_frontend` at `games.rb:1711` unless `double_bold` is declared) removes a single bold pair wrapping nothing but an optional article (a/an/the) and ONE game link, so the legacy line is plain for name and pronouns alike; room-object listings keep theirs because the game doubles the bold there and `collapse_double_bold` (`:218-222`) leaves one pair. Lichborne v0.21.0 declares `double_bold` and shows the line as sent (Sekmeht, 2026-10-31 — options were mirror Lich, drop only the pronoun bold, or leave it).
- **With `;display lichid` on, Lich sends an arrival's subtitle TWICE** (same capture): the game's own `<streamWindow id='main' subtitle=" - [Shard, Xibar's Crescent Road] (2010652)"/>` right after `<nav rm='2010652'/>`, then — on the line carrying the top-level `<compass>` — the rewritten `" - [Shard, Xibar's Crescent Road - 2522] (2010652)"` (both `main` and `room` windows) plus a `<output class="mono"/>Room Number: 2522` line (`modify_room_display`, `games.rb:1659-1669`). The dash number is Lich's id; the parens number is the game's uid and matches `<nav rm>`. Lichborne takes the parens both times (B559).
- **Unverified, wanted as captures** (`docs/xml-stream/saga-stream-deferred.md` + this review): E3 familiar views; RoomBrief / RoomNames off (0 sessions in the corpus); fog-hidden exits (22 blocks); a compass arriving before its `room exits` component (0 of 14 fixtures); a player id below 10,000,000; the `toggle expbrief` refusal seen 2026-10-17 under the OLD Saga string, not re-checked since #1858.

### Unreleased main 16bc7afd → 89fa0fd7 — verified 2026-10-29 (no break)

Five commits after the 5.23.0 release. The integration checklist (argv, the force-mode handshake branch, hooks, `;listall`, `vars.rb`, the parse rules we mirror, map JSON) is untouched; ProfanityFE had no new commits since `fba13dd`.

- **#2094 / #2098: the PID a detachable client reports is stored again.** Clients send `SET_FRONTEND_PID <pid>` so Lich can bring their window back to the front after a GTK script window (`Frontend.refocus`, `lib/common/frontend.rb:872`, used through `refocus_callback`). From 5.20.0 (#1459) the handler used `match?` and then read `Regexp.last_match(1)`, which `match?` never sets, so every PID was stored as 0. #2094 fixed it (`lib/global_defs.rb:2239`); #2098 records each client's PID on its socket (`SynchronizedSocket#declared_pid`) and re-applies the current primary's when the primary detaches, falling back to the PID of the front end Lich launched. Only the detachable handler reads this line; Lichborne sends none, so nothing changes for it. If attach mode ever wants GTK refocus, this is the line, and it would need the same gating as `SET_FRONTEND_CAPS`.
- **#2097: DRInfomon refreshes after a revival (on main; NOT in the released 5.23.0, corrected 2026-11-01).** A character who logs in dead skips `info` at startup, so `DRStats.guild` stayed nil all session. Lich main now watches for dead → alive and re-sends `info` and `exp all 0` through a short quiet ExecScript (`drinfomon_refresh`). Both commands are `quiet: true` (`drinfomon/startup.rb:31-32`), so the replies are removed before the front end sees them (`util.rb:173-199`): the player sees nothing, and Lichborne's own-`info` guild detection doesn't see them either.
- **#2096: DRBanking only moves balances on the game's own bank lines.** Every pattern is anchored to where the game's message starts (`The clerk `, after any markup, or a jar bank's two lead-ins), so speech or a whisper quoting a bank line no longer changes a recorded balance; the jar deposit line's copper balance is now read, and a jar money-changer's exchange no longer counts as a withdraw-all. Catch Me Up's banking totals read Lich's `DRBanking:` lines, so they become more accurate with no change on our side. If we ever parse the game's bank lines ourselves, anchor them the same way.
- **#2095:** a SlackBot token check (scripts only).

**Fixtures:** lich-5 `spec/fixtures/` now holds 24 DR captures, 14 of them newer than our first replay (room blocks: peer, Locate, no exits, arrival without the exits component; The Heavens; FLAG listings; login; creature shapes; stow; full inventory). Facts they show:
- **The Heavens** arrives as a `(**)` subtitle with no `<room>` block (`streams/dr_saga_no_room_heavens.xml`).
- **Peering into another room** ("You peer south and see ...") sends an ordinary `<room>` block for that room (`room_block/dr_saga_peer.xml`).
- **The 5.21 inventory feed** is one `<inventoryManager>` line of `<i id loc name long weight flags in_max/>` items, `loc` like `worn,player` or `in,<container id>`, `name` comma-separated words (`inventory/dr_full_inventory.xml`).

**The capability line, operational facts** (`docs/frontends/capability-declaration.md`): on a detachable connection send it straight after connecting, since anything the game sends before Lich reads it is rewritten; on the primary connection send it after the two handshake lines. A later declaration replaces an earlier one, from the next server line. Lich sends no reply. The released 5.23.0 install has `lib/common/client_capabilities.rb` (checked on a real install, 2026-10-29), which is how Lichborne decides a Lich supports it (DESIGN §55.11).

### The Saga extended feed: `inventoryManager` (5.21.0, #1524)

A Simutronics server feature built for Saga, "confirmed live on both GemStone and DragonRealms" (`lib/common/inventory.rb:8-9`). One request returns the player's **whole nested item tree**: every container's contents, weights, container load and closed/locked state. The ordinary stream only shows hands, worn items and whatever container was just opened.

- **Request:** `_inventory manager <id>`, where `<id>` is a request id the client mints (`inventory.rb:907`).
- **Pagination:** a large tree is split. The response carries `<continuation root=… last=…>` markers, and each branch is fetched with `_inventory manager <id> continue <room> <root> <last>`. Lich keeps at most 4 in flight, matching Saga.
- **Response:** a single line of **attributes only, with no text nodes**, so a front-end that strips tags displays nothing. A real 418-item DR capture (`spec/fixtures/inventory/dr_full_inventory.xml`, 49KB, one line) starts:
  `<inventoryManager id='…' room='230007'><i id='40236126' loc='worn,player' name="a,leather,lootpouch" long="a punka leather lootpouch" weight='10' in_max='1700'/>…</inventoryManager>`
- **Fields:**
  - `loc`: one of `worn,player` / `in,<id>` / `on,<id>` / `righthand,player` / `lefthand,player` / `room` / `atfeet,player`.
  - `name`: comma-separated name parts ending in the noun.
  - `long`: the full description, which may contain `$_…$_` highlight markers.
  - `weight` and `in_max` are in **tenths of a pound** (`in_max='1700'` = 170 lb); `in_max='99990'` means no weight limit.
  - Optional: `in_encum` (container load) and `flags='closed,locked'`.
- **Edge cases:** a locked container reports zero children, so don't read that as empty. `state='stale'` on the envelope marks an interrupted exchange.
- **Passive capture:** Lich's `Inventory.observe` taps every downstream line without modifying it (`games.rb:937-940`), so whenever any script calls `Inventory.refresh`, the same line reaches the front-end too.
- **Unverified for Lichborne:** whether the server honours `_inventory manager` on a direct-SGE session that identifies as Wrayth. Settle it with one live test before building on it.

### ⚠️ Lich room `id` and game `uid` are DIFFERENT NUMBER SPACES

The single most useful fact from the 5.20 review, and the one most likely to be re-derived painfully.

A room in Lich's `map-*.json` carries **both**:

```
{ "id": 1, "uid": [1040049], "title": ["[[Muspar'i, Street of Metalsmiths]]"], … }
```

- **`id`** is **LICH's own** room id — the key its map, `;go2`, and `display_lichid` use.
- **`uid`** is the **GAME's** room id — what `<nav rm>` carries, what the `[Title] (230008)` subtitle marker shows, and what `display_uid` renders as `(u230008)`. A room may have several (merged/aliased rooms), so it is an ARRAY.

Measured on a real DR map (18,779 rooms, 2026-08-16):

| | range | count |
|---|---|---|
| `id` | 1 – 52,274 | 18,779 rooms |
| `uid` | 0 – 9,798,920 | 15,520 rooms have one |
| **overlap** | — | **471 of 15,521 (~3%)** |

**They are not interchangeable, and a lookup keyed by one will silently miss ~97% of the other.** That is exactly what Lichborne did: it indexed the map by `id` and looked up with the value from `<nav rm>` (a game uid), so the fast path resolved 3% of rooms and fell through to fragile title+desc matching for the rest. Fixed in v0.19.1 by indexing **both** and trying uid → id.

**The `- NNNN` dash slot is genuinely ambiguous** and cannot be disambiguated from the text: DR's native room-number display puts the GAME number there, while Lich's `display_lichid` puts its OWN id in the same position. Any consumer must be prepared for either — which is why trying both indexes is the correct design rather than a workaround.

### Room prose in `map-*.json` (measured 2026-10-02)

Measured on `map-1790653415.json` (18,950 rooms), for the Tableau's scene classifier:

- **`title`** is an ARRAY of `[[…]]`-wrapped strings. Nearly every room has one; 11 have more than one.
- **`description`** is an ARRAY too. 18,945 rooms have one, and **1,313 carry more than one version**. Which one the game shows at a given moment is not recorded here. In play the Tableau classifies the description the game actually sent; only the tuning harness reads `description[0]`.
- **`location`** (the area name, e.g. "Horse Clan") is present on 14,769 rooms.
- **A room title often doesn't name its town; `location` does** (verified 2026-10-04 for the Tableau's towns). Titles start with a place name before the first comma, but districts and buildings use their own ("[Undershard, …]" is Shard, "[Crossing Temple, …]" the Crossing, "[Theren Keep, …]" Therenborough). Two `location` names that read wrong: **"Horse Clan" is Zaldi Taipa**, and **"Dragonspine Fortress" is Chyolvea Tayeu'a**. Grouping rooms by title prefix and taking the town most of each prefix's rooms sit in (at least two rooms and 60%) places 184 prefixes covering 3,948 rooms (`tools/gen-place-data.mjs`; the rest are wilderness or ambiguous).
- **Room prose is full of scene words used figuratively**, and that is the main thing a word-based reader has to handle. Of 144 prose uses of "falls", most are the verb ("the ground falls away", "light falls on", "accidental falls") rather than a waterfall; "sea" appears in colours ("sea-green") and crowds ("a sea of faces"); "keep" is mostly "keep watch". A real waterfall almost always says so in the room's TITLE.

### The `--saga` frontend — DECISION: do NOT adopt

Saga is a **sibling front-end, NOT a new XML dialect**. In Lich's capability registry (`lib/common/front-end.rb`), `saga = stormfront's exact caps + one extra: sentinel`. The `sentinel` cap makes Lich prefix **every** downstream line with `\x1f` (0x1F) — a whole-stream "came through Lich" marker for Saga's detachable/cloud-profile-sync architecture, NOT a per-line Lich-vs-game discriminator. Adopting saga would give Lichborne the SAME content it already gets as stormfront, plus a sentinel byte to strip from every line (and re-audit every `^`-anchored parser rule against). Zero functional gain. Revisit only if a future Lich feature becomes saga/`sentinel`-GATED (nothing is today), or if Saga ever ships local config files worth importing (today it's cloud-only).

---

---

## 18. Lich on Linux & macOS — Install Layouts

Verified 2026-07-26 against the official install docs (the lich-5 wiki's
[Documentation for Installing and Upgrading Lich](https://github.com/elanthia-online/lich-5/wiki/Documentation-for-Installing-and-Upgrading-Lich),
which delegates Linux/Mac to the GS wiki: `Lich:Software/Installation` for Fedora + Debian/Chromebook,
`Lich:Software/Mac_Installation` for macOS). Lich itself is first-class cross-platform — platform
branches for `:windows | :macos | :linux` live in `lib/common/front-end.rb` (detect_platform, ~line 338).
These are the facts Lichborne's per-platform discovery (DESIGN §41.3) is built on.

| | Lich location | Ruby | Launch |
|---|---|---|---|
| **Windows** | `C:\Ruby4Lich5\Lich5\` | Ruby4Lich5 one-click installer (`C:\Ruby4Lich5\<ver>\bin\`) | `rubyw.exe lich.rbw` |
| **Fedora** | `~/Lich5` (zip extract; the wiki's launch line writes `~/lich5` — same page, both casings) | **system Ruby** via dnf (3.3/3.4 on Fedora 41–43) | `ruby ~/lich5/lich.rbw` |
| **Debian / Chromebook** | `~/Lich5` | **rbenv**, Ruby **4.0.5** pinned (`rbenv install 4.0.5; rbenv global 4.0.5`) | same |
| **macOS** | **`~/Desktop/Lich5`** (the guide literally drags the folder to the Desktop) | **rbenv via Homebrew**, Ruby 4.0.5; GTK3 via `brew install gtk+3` (+ gobject-introspection, adwaita-icon-theme) | `ruby ~/Desktop/Lich5/lich.rbw` |

Facts that matter for a front-end integrating with these installs:

- **rbenv's `ruby` only resolves through shell PATH** (`~/.rbenv/shims/ruby`). A GUI app launched
  from Finder/the dock gets the bare system PATH — so a client must store/probe the explicit shim
  path, never spawn bare `ruby`. (This is why Lichborne's discovery probes
  `~/.rbenv/shims/ruby` → `~/.rbenv/versions/<ver>/bin/ruby` → Homebrew prefixes → `/usr/bin/ruby`.)
- **The Fedora wiki page is version-stale**: it blesses system Ruby 3.3/3.4 for "Lich 5.7.0+", but
  Lich **5.18+ hard-requires Ruby 4.0** (see §17) and refuses to launch otherwise. A "Lich won't
  start on Fedora" report ⇒ check `ruby -v` first. Lichborne warns at setup time (DESIGN §41.3).
- **No rubyw on Linux/Mac** — plain `ruby` is the correct GUI-safe spawn; the Windows
  rubyw/GUI-subsystem concern (CLAUDE.md launch section) does not exist there. GTK scripts are
  native on Linux and Homebrew-supported on Mac.
- **The Mac guide frames Avalon as the front end** (Simu's legacy Mac client) — Lich presents to it
  exactly as to any FE; a client connecting `--stormfront` on loopback :11024 needs nothing
  Mac-specific. On Linux the wiki's front-end options are Profanity (terminal) or Warlock 3.
- **`;lich5-update --update`** is the universal in-place upgrade on every platform — install paths
  stay stable across Lich versions, so stored client paths survive upgrades.
- **lich.db3 lives at `<lich_dir>/data/lich.db3` on every platform** (DATA_DIR in
  `lib/constants.rb` is install-dir-relative) — the same derivation-from-lichPath works everywhere.


### 18.1 Lich reads scripts with the process LOCALE encoding (verified 2026-07-30)

`Lich::Common::Script#initialize` reads a `.lic` and walks its lines with a
regex ([script.rb:956-957](file:///c:/temp/lich-dev/lich-5/lib/common/script.rb) —
`for line in data` / `if line =~ /^([\d_\w]+):$/`). The read uses Ruby's
`Encoding.default_external`, which Ruby derives from the **locale environment**
(`LANG` / `LC_ALL`) at interpreter start.

Consequence for any front-end that SPAWNS Lich: if the child has no locale set,
`default_external` is **US-ASCII**, and the first non-ASCII byte in a script —
including one inside a comment — raises:

```
--- Lich: error: invalid byte sequence in US-ASCII
    .../lib/common/script.rb:957:in 'block in Lich::Common::Script#initialize'
```

This is a LAUNCH-ENVIRONMENT fact, not a Lich bug and not a script bug. The same
script runs correctly from a terminal (a login shell exports `LANG`) and under
Qt-based front-ends (Qt calls `setlocale()` during app startup, so its spawned
Ruby inherits a locale). A macOS app launched from Finder/the dock exports
neither — the same environment hole that removes the shell `PATH`.

Windows is unaffected: Ruby there derives its default external encoding from the
active code page and has no `LANG` convention.

Lichborne's handling: `spawnEnv()` in
[LichConnection.ts](src/main/connection/LichConnection.ts) defaults
`LANG=en_US.UTF-8` for the Lich child on non-Windows platforms, and only when
neither `LANG` nor `LC_ALL` is already set (B250, v0.18.3).

## Elanthia's sun and moons — the verified model (v0.18.4)

Mined from `moonwatch.lic` v4.5.0 (read 2026-07-31,
`C:/Ruby4Lich5/Lich5/scripts/moonwatch.lic`) and cross-checked by evaluating its
own Ruby `DRTime` module. Recorded so none of it is re-derived.

**The DR day.** 60s = 1 roisan, 30 roisaen = 1 anlas, 12 anlaen = 1 day, so a DR
day is **21,600 real seconds (6 real hours)** and a DR year is 400 days
(100 real days). Calendar anchor: `CALENDAR_EPOCH = 1_688_607_948`,
`CALIBRATION_YEAR = 446` — at that Unix second it was year 446, day 0, midnight.
Everything else is arithmetic from there, which is why Lichborne can compute the
whole calendar with no game command.

**Daylight is seasonal and NOT symmetric.** Day length swings from **120 rois at
the winter solstice** through **180 at the equinoxes** to **240 at the summer
solstice**. Sunrise and sunset are stored in two INDEPENDENT 400-entry empirical
tables (the modal observed rois across ~1900 logged events over ~1.2 DR years) —
`rise + set` is 360 on only **332 of 400 days**, so sunset cannot be derived as
`ROIS_PER_DAY - rise`. The cosine that Elanthipedia documents
(`90 + 29.51*cos(2*pi*d/400)`) matches only ~69% of days and is kept in the
script purely as a fallback; the game's curve is close to but not truly
sinusoidal. **Do not approximate the sun — the tables are the model.**

**Moon periods are fractional.** `Moons::CONSTANTS` holds OLS-fit periods in
seconds — katamba cycle 21,088.611 / visible 10,602; xibar 20,848.143 / 10,482;
yavash 21,129.564 / 10,624 — replacing pre-v4.2 rounded integers precisely so
predicted phase stops drifting. The game fires moon events on **60-second server
tick boundaries**, and the script quantizes its prediction to the nearest tick.

**The stream format floors.** `moonWindow` carries `[k]+(N)` where
`N = (seconds / 60).to_i` — an integer FLOOR. So the displayed value becomes N
at the instant `seconds` hits `60N + 59`, i.e. when the true remaining is
`N + 59/60`, very nearly `N+1`. Anchoring interpolation at N rather than at the
top of that bucket runs a client a constant minute fast.

**`XMLData.server_time` is prompt-driven.** Lich sets it from
`<prompt time=...>` (`xmlparser.rb:549`) and does not advance it between
prompts, so an idle character's script computes against a frozen clock. This
affects Genie and Frostbite identically; it is not a Lichborne behaviour.

## DR protocol — mid-sentence stream chunking (v0.18.4)

When you view another room (shadewatch mirror, arena view, distant gaze) DR
splits a SINGLE sentence across consecutive `pushStream`/`popStream` blocks on
ONE physical line, with no newline between the fragments:

```
...shatters into a thousand<popStream/><pushStream id="familiar"/> small projectiles!
```

A front-end must therefore treat the stream boundary as a text boundary, NOT a
line boundary. How the siblings cope: **Profanity** flushes on both open and
close, but its flush writes characters to a window, so consecutive flushes
append to the same line; **Frostbite** caches across chunks while inside a
stream (`onProcess` withholds until the stream closes) and re-joins the block
with `aggregateXml`; **Genie** switches output window on push and restores on
pop. See CLAUDE.md pitfall #120 for what this cost Lichborne.

## DR protocol — shop output rides the `shopWindow` stream (v0.19.3, B306)

DR's SHOP command family — the surface list (`shop` → *"The following items contain
goods for sale:"*), `shop window`, and `shop <item>` — is sent **inside
`<pushStream id="shopWindow"/>` … `<popStream/>`**, with a `<streamWindow
id='shopWindow' title='Shopping' …/>` declaration (the "Shopping" title on a
discovered panel is DR's, not ours). There is **no outside-the-block copy** to
main — a client that only displays watched streams shows nothing at all for
`shop` (that was B306's symptom).

Verified against the sibling clients rather than a capture: Frostbite handles
`id == "shopWindow"` explicitly and writes it into the main text
(`gui/xml/xmlparserthread.cpp`, `writeTextLines(toString(e))`); Profanity lists
`shopWindow` in its known-stream regex alongside `death|logons|thoughts|familiar|
assess|ooc|combat|moonWindow|atmospherics` — the streams it renders in main when
no dedicated window is configured (`lib/game_text_processor.rb`). Lichborne
treats it the same way via `STREAM_FALLBACK['shopWindow'] = 'main'`, and it stays
discoverable as a panel.

## DR commands — directed SAY and WHISPER syntax (v0.20.1)

Captured by Sekmeht from the game's own `SAY` help (typing `say` with no
message), verbatim:

```
Usage:
  SAY message                        Will say a message for all of the room to hear
  " message                          Will say a message for all of the room to hear
  ' message                          Will say a message for all of the room to hear
  NOTE:  SAY, ', and " are interchangeable
  SAY /EMOTE message                 Will say a message for all of the room to hear with emotion
  SAY @PERSON message                Will say a message for all of the room to hear but directed to
                                       PERSON
  SAY /EMOTE @PERSON message         Will say a message for all of the room to hear but directed to
                                       PERSON with emotion
  SAY @PERSON /EMOTE message         Will say a message for all of the room to hear but directed to
                                       PERSON with emotion
  SAY /SETEMOTE EMOTE                Will set a default emote.  If you speak without specifying an emote
                                       you will use your default emote.
  SAY /SETEMOTE CLEAR                Will clear your default emote.
  SAY /HELP EMOTE                    Displays a list of valid emotes
  SAY /HELP EXAMPLES                 Display some examples for using SAY
```

What a client needs from it:

- **Directed speech is `@PERSON`**, and it is still heard by the whole room
  (it is not private). The emote may come before or after the target.
- **`SAY`, `'` and `"` are one command.** Anything that recognises a say line
  must accept all three.
- **`/SETEMOTE` and `/HELP` are sub-commands, not emotes.** A `/word` after SAY
  is an emote UNLESS it is one of those two.
- **WHISPER** (Sekmeht): `whisper PERSON message` — the target is a bare first
  word, no `@`. Private to that person.
- The game's reply to directed speech is **"You say to Agan, …"**, the shape the
  SceneParser's say capturer already reads for its `target` (conversation
  gravity, DESIGN §35.7).

Not yet verified in-game: whether `' @Agan hi` (a space after the apostrophe)
parses the same as `'@Agan hi`. The help's "interchangeable" suggests it does.

Lichborne use: the Living Tableau's right-click Say to… / Whisper to…
(`directedLine` in `src/renderer/utils/sayTo.ts`, DESIGN §50.3).

## DR protocol — `<crtrStatus>`, the id-keyed creature feed (v0.20.2)

Verified against Agan's and Sekmeht's raw captures (2026-10-02) and Lich's own
handling (lich-5 `f8ea1f20`, added in #1485, 2026-08-02, shipped in Lich 5.20).

**The shape.** Right after every `<component id='room objs'>` refresh, DR sends
one self-closing tag per creature in the room:

```
<component id='room objs'>You also see <pushBold/>a rock troll<popBold/> which appears dead,
  <pushBold/>a rock troll<popBold/>, a sharp pine sapling, <pushBold/>a rock troll<popBold/> that is sleeping,
  <pushBold/>a black-backed jackal<popBold/> and some junk.</component>
<crtrStatus exist="138802997" hostile="1" disengaged="1" dead="1" sleeping="1"/>
<crtrStatus exist="138815260" hostile="1"/>
<crtrStatus exist="138830744" hostile="1" sleeping="1" prone="1"/>
<crtrStatus exist="138836619" hostile="1" disengaged="1"/>
<prompt time="1790924675">R&gt;</prompt>
```

- `exist` is the creature's id: the same id assess shows in `look #ID`.
- **DR takes `#ID` as a target** for `look`, `face` and `get` (`get #ID`
  confirmed by Mahtra/Destahd, 2026-10-16). Targeting by id can't pick the
  wrong one of several identical things; the v0.21.0 link menus rely on it.
- **Every tag is a full snapshot** of that creature's flags; an absent flag is
  off. Another `room players` component can sit between the tags and the prompt.
- **The tags come in the same order as the bold names** in the room list. Lich
  pairs them by position at the next prompt, **only when the counts match
  exactly** (all or nothing), and backfills names authoritatively from assess
  (`lib/common/xmlparser.rb:70-76`, `:481-512`, `:675-688`).
- **A refresh is a complete roster.** A creature missing from the next batch has
  left: decayed ("The rock troll dissolves into a pile of chalk."), skinned, or
  walked off. Lich rebuilds its room roster from each batch (`clear_room` on the
  room objs component, `:457-464`).
- Lich's code allows for a later **lone** batch of tags with no room-list refresh
  before it (`:678`); none has been seen in a capture.

**The flags** (Lich's vocabulary, `lib/common/creature/creature_base.rb:104-147`):

| Kind | Flags |
|---|---|
| Classification | `hostile`, `disengaged`, `dead`, `sympathetic`, `ascended`, `inferior`, `AscensionBoss`, `MiniBoss`, `challenging`, `rider`, `mount` |
| Transient status | `immobile`, `webbed`, `sleeping`, `disoriented`, `stunned`, `rooted`, `calmed`, `kneeling`, `prone`, `sitting`, `flying`, `hovering`, `hidden` |

What the captures show about them:

- **`dead="1"` names exactly which creature died**, by id, in the same batch as
  the kill message ("A rock troll collapses with a heavy thud."). Whirlwind
  killing three at once marks each. Dead creatures also carry `disengaged` and
  `sleeping`.
- **`disengaged` means not engaged with YOU.** Trolls fighting Sekmeht carry it
  in Agan's feed; the ones on Agan don't. A creature arriving starts
  `disengaged` and loses it at the next refresh after it closes on you. It only
  updates when the room list does (kills, arrivals, loot drops).
- **Unconscious is not dead.** A troll hit by Mental Blast ("collapses as if
  dead") is `sleeping prone` with no `dead`, listed as "that is sleeping". A
  troll with a mangled leg is `prone` alone ("that is lying down").
- **On walking into a room** (Sekmeht's capture, 2026-10-02) the room list
  arrives TWICE: once with the room's other components, then again after the
  room text, this time followed by the tags. Then, before the prompt, Lich
  re-sends the room title with its own room number added
  (`[Whistling Wood, Barrows - 9477] (2212242)`), the same room under a
  decorated title.
- **`look` sends neither** the room-list component nor any tags, only the room
  text. A roster refresh comes from the game, not from looking.

## DR game text — the Vitality ladder (health words) (v0.20.2)

The word GROUP shows for each member, and the word your own combat status leads
with (`[You're battered, badly balanced …]`), is a 10% step of the health bar.
Sekmeht's table:

| Health | Word |
|---|---|
| over 100% | invigorated |
| 100% | (none; GROUP says Healthy) |
| 90–99% | bruised |
| 80–89% | hurt |
| 70–79% | battered |
| 60–69% | beat up |
| 50–59% | very beat up |
| 40–49% | badly hurt |
| 30–39% | very badly hurt |
| 20–29% | smashed up |
| 10–19% | terribly wounded (the source table reads "10%-9%", an evident typo) |
| 1–9% | near death |
| under 1% | in death's grasp |

**Cross-checked against real logs** where textsubs.lic appends a percentage to
the status line: bruised 90–99, hurt 80–89, battered 70–79, beat up 60–69 and
badly hurt 40–49 all landed inside their bands. GROUP prints the same words,
capitalised ("Beat up.", "Very beat up."), and both views agree at the same
moment (Agan "Beat up" in his own list and in Sekmeht's).

The GROUP list itself:

```
Members of your group:
  Sekmeht: Healthy.
  You (Leader): Very beat up.
There are 2 members in your group.
```

It rides the `group` stream (a clear, then the lines). A member line is an
indented single word and a colon (Lich's `GroupMembers`, drparser.rb:25), and
the count line closes the list.

## DR game text — facing, range and defence lines (v0.20.2)

Verbatim from captures (Agan and Sekmeht, 2026-09-29 to 2026-10-02).

**Turning to face** (by FACE, or on its own after a kill). The reply never
carries an id; the `FACE #ID` that caused it does.

```
You turn to face a rock troll.
You turn to face a rock troll, leaving the rock troll on your flank at melee!
You turn to face a rock troll, leaving the black-backed jackal on your flank at missile range!
You are too closely engaged and will have to retreat first.
```

**Range narration** (both sides of a fight; creatures use the same wording):

```
You begin to advance on Sekmeht.          Agan begins to advance on you!
You close to pole weapon range on X.      X closes to pole weapon range on you!
You close to melee range on X.            X closes to melee range on you!
You are already advancing on X.           The X is still a distance away from you and is closing steadily.
You are already at melee with X.          X stops you from advancing any farther!
You retreat back to pole range.           Sekmeht retreats from you.
You retreat from combat.                  You notice Sekmeht as he stealthily closes to melee range on you.
```

Retreat is one band per command (melee → pole → missile) and never ends the
fight; only an assess that lists no one does.

**Defending.** The defence is recognisable by its shape, whatever the gear:

```
* A black-backed jackal bites at you.  You block solidly with a small demonscale shield sealed with protective wax.
* A golden jackal claws at you.  You dodge.
* A rock troll feints high at you.  You evade.
* Awkwardly, an ice archon chops an icy sword at you.  You counter some of the sword with a flame-bladed zweihander …
  (a parry: knock aside / counter / fend off / turn aside / beat off / deflect /
   slap away / repulse, then some / most / little of the …)
An ice archon attempts to stomp on your left leg, and you raise your weapon to deflect part of the foot …
An ice archon attempts to stomp on your right hand, but you manage to get out of the way in time.
… <pushBold/>The claw lands a good hit (2/23) that scratches you …<popBold/>
```

**Balance words** run from the worst: completely **im**balanced, hopelessly
**un**balanced, extremely **im**balanced, very badly balanced, badly balanced,
somewhat off balance, off balance, slightly off balance, solidly, nimbly,
adeptly, incredibly balanced (Lich's `DR_BALANCE_VALUES` order; the
im/un forms seen in logs).

**Emotes vs notices.** A player's emote is `(Name verbs …)`. The game's own
notices also use parentheses, e.g. `(Roundtime: 30 seconds.)` after GO PATH, so
"a capitalised word in parentheses" is not enough to mean an emote.

## DR stream inventory — routing decisions grounded in the sibling clients (v0.19.3 sweep)

Every `<pushStream id="…">` DR is known to emit, cross-checked against Frostbite's
`gui/xml/xmlparserthread.cpp` id branches and Profanity's known-stream regex
(`lib/game_text_processor.rb`), with Lichborne's routing decision for each. The three
classes: **fallback** (narrative text shown in main when no panel watches it),
**state** (clear-and-rewrite tables — never spilled to main), **native-dup** (DR also
sends an outside-the-block copy to main — a fallback would double-print, B136).

| DR id | Class | Lichborne | Grounding |
|---|---|---|---|
| `thoughts` (+ `thought`) | fallback | alias `thought`→`thoughts`, fallback `main` | Profanity main-list; Frostbite Thoughts window |
| `death` / `logons` | fallback | aliased to `deaths` / `arrivals`, fallback `main` | Profanity main-list |
| `familiar`, `combat`, `atmospherics`, `assess` | fallback | fallback `main` | Profanity main-list; Frostbite |
| `shopWindow` | fallback | fallback `main` (B306) | Frostbite `writeTextLines()`; Profanity main-list; report's blank output = no native copy |
| `talk` / `whispers` | native-dup | alias → `conversation`, **no** fallback | B136 (verified capture: speech emitted twice) |
| `ooc` | native-dup | **no** fallback | Frostbite comment on its ooc branch: *"ignore speech in ooc stream; duplicated from whisper stream"* |
| `percWindow` / `inv` / `group` / `moonWindow` / `room` | state | no fallback (state streams) | clear+rewrite shape, observed |
| `chatter` | **undecided** | discoverable only | Frostbite routes it into Thoughts; Lich never emits it; no capture — see BUGS pending follow-ups |
| `speech`, `whisper` (singular) | — | not streams | These are `<preset id>` ids in Frostbite (`parseTalk`), not pushStream ids — nothing to route |

Two facts worth keeping: (1) pushStream ids reach the renderer with their case
preserved (`normalizeStreamId` only rewrites the alias table's keys), so a fallback key
must match DR's casing exactly (`shopWindow`, `percWindow`); (2) the routing rule for an
UNWATCHED stream with no table entry is "buffer invisibly", which is correct only for the
state and native-dup classes — a narrative stream left undecided is a silent-loss bug.
## DR protocol — the `percWindow` active-spell readout (v0.19.5)

Verified against a live capture (Sekmeht, 2026-09-05). DR pushes the player's
active spells/effects as a **clear-and-rewrite block**:

```
<clearStream id="percWindow"/>
<pushStream id="percWindow"/>Noumena (29 roisaen)
Finesse (28 roisaen)
Nonchalance (7 roisaen)
Turmar Illumination (2 roisaen)
Membrach's Greed (2 roisaen)
Last Gift of Vithwok IV (1 roisan)
Blur (1 roisan)
Trabe Chalice (intact, fading)
<popStream/><prompt time="1788634151">&gt;</prompt>
```

**Facts that matter to a front-end:**

1. **One line per effect, `<Name> (<status>)`.** The name may contain spaces,
   apostrophes and roman numerals (`Last Gift of Vithwok IV`, `Membrach's
   Greed`), so a name pattern must not assume a single word.
2. **The unit is the roisan, and DR writes the SINGULAR at 1** — `(1 roisan)`,
   `(29 roisaen)`. A plural-only regex silently drops every effect in its final
   minute, which is exactly the minute that matters.
3. **1 roisan = 60 seconds = 1 real minute** (Elanthipedia; the constants live
   in [elanthianTime.ts](src/shared/elanthianTime.ts) as `ROISAN_SECONDS`).
   The reading is a **duration**, NOT a server absolute time — so anchoring it
   on the local clock at receipt is correct and immune to clock skew, unlike
   `roundTime`/`castTime`, which ARE absolute and must be anchored on the
   `<prompt time>` (§16, pitfall #87 / B192).
4. **The value is whole minutes.** There is no sub-minute precision anywhere in
   this readout, so a seconds-resolution countdown built from it is invented.
   **The consequence is load-bearing and easy to miss: a countdown a client
   DERIVES from this reading runs out before the effect does.** An effect
   reporting `(1 roisan)` has somewhere under two minutes left — Lichborne
   assumes DR floors, so 60–119 seconds, and that assumption is NOT verified
   (rounding would give 30–89 instead). Either way the conclusion is the same:
   your own timer reaching zero is **not evidence that the effect ended**, only
   that the time you were told has elapsed. The one signal that settles it is
   fact 6's — the effect no longer appearing in the block. Any front-end
   feature that acts on "this spell is gone" must key on absence, not on its own
   clock. (Lichborne shows the two as separate states, "expired" then "ended" —
   DESIGN §34.9 item 4.)
5. **The parenthetical is not always a timer, and the variants are NOT
   interchangeable.** The authoritative catalogue is Lich's own parser
   ([xmlparser.rb](file:///c:/Ruby4Lich5/Lich5/lib/common/xmlparser.rb), the
   `@dr_active_spell_tracking` branch), whose comments list the real lines:

   | Line | Meaning | Lich's reading |
   |---|---|---|
   | `Landslide (4 roisaen)` | 4 minutes | 4 |
   | `Khri Sagacity  (1 roisan)` | 1 minute — note the SINGULAR | 1 |
   | `Stellar Collector  (0%, 4 anlaen)` | **anlaen**: 1 anlas = 30 roisaen | 120 |
   | `Cure Disease  (Fading)` | lapsing right now | **0** |
   | `Hydra Hex  (Indefinite)` | no expiry | 1000 |
   | `Persistence of Mana  (OM)` | Osrel Meraud — no expiry | 1000 |
   | `Osrel Meraud  (94%)` | a charge PERCENTAGE, not a time | — |
   | `<barb ability>  (…)` | "inexact duration verbiage" catch-all | 1000 |

   **`Fading` is the OPPOSITE of "no timer"** — reading it as a quiet untimed
   note shows the most urgent thing on screen as background information.
   **The anchoring matters:** Lich's duration group sits immediately after the
   `(`, so `(Fading)` is the fading state while `(intact, fading)` is NOT — it
   falls to the catch-all and is long-lived. A substring match on "fading"
   therefore mis-flags every Trabe Chalice as expiring.
   Note also the **double space** before several parentheticals.
   Lich captures the NAME as `^[^(]+` (up to the first paren); anchoring on the
   LAST paren group instead is more robust for a name that contains one.
6. **It is a STATE stream with no main duplicate.** The block is cleared and
   rewritten wholesale (so the current block is the complete truth, and an
   effect that drops simply stops being listed), and DR does NOT emit an
   outside-the-block copy — so unlike speech (pitfall #49) there is nothing to
   deduplicate, and unlike a narrative stream it must NOT be given a
   `STREAM_FALLBACK` entry or every tick re-spams the game window.
7. **The repaint CADENCE is not yet established.** The capture shows two
   identical blocks separated by a prompt, which hints at a repaint per prompt
   rather than only on change — but this has not been measured. Anything whose
   cost scales with the repaint rate should be written to be correct either way
   (Lichborne's Spell Monitor gates its state commits on a real delta for
   exactly this reason — DESIGN §34.9 item 4).
   **As of v0.19.6 there is an instrument for this and no capture is needed:**
   the Spell Monitor's feed strip prints the observed median gap between
   repaints (`updated 3s ago · every ~6s`). A screenshot of that strip, noting
   whether the character was idle or actively prompting, is enough to settle
   the question — record the answer HERE when someone supplies one, since it is
   a DR protocol fact rather than a Lichborne one.
8. **No verified command forces a repaint.** Unlike `TIME`/`WEATHER` for the
   Moons readout, no command is known to make DR re-emit `percWindow` on
   demand; do not assume one exists without checking.

Lichborne aliases `percWindow` → `spells` (`streamAliases.ts`) and parses it in
`parseSpellLine` / `deriveSpellState` ([experiences.ts](src/renderer/experiences.ts)).

### `base-spells.yaml` — the spell/ability reference (verified 2026-09-05)

`scripts/data/base-spells.yaml` in a Lich install is a usable reference for
labelling percWindow entries. Facts worth not re-deriving:

- **Effect names in percWindow match the YAML keys VERBATIM** — apostrophes and
  roman numerals included (`Membrach's Greed`, `Last Gift of Vithwok IV`);
  verified 8/8 against a real capture. This is what makes any lookup viable.
- Three **badge-able sections**, with **zero name collisions between them**, so
  one flat map is safe: `spell_data` (378, keyed on `skill`), `barb_abilities`
  (37, `type`) and `battle_cries` (14, `type`).
- **`skill`**: Utility, Augmentation, Targeted Magic, Debilitation, Warding,
  cantrip. **`type`**: form, berserk, meditation, roar, scream. Every one of
  those eleven has a **distinct first letter**, so single-letter labels need no
  disambiguation. Metamagic (below) is the twelfth and needs a non-initial,
  since M is already Meditation.
- **33 entries are `metamagic: true` with NO `skill`** — a real category with
  its own `abbrev` and `guild`, not malformed data.
- **`See the Wind` has `Skill:` with a CAPITAL S** — a typo in Lich's own file.
  A case-exact read drops that spell silently; tolerate both spellings.
- **14 `skill` values carry trailing comments** (`Augmentation # Also Utility`),
  so the file must be read with a real YAML parser, not a line scrape.
- **`abbrev` covers 366 of 378 spells**; 12 have none, and 14 contain spaces
  (the cantrips are `C AE S`), so "abbrev is a short token" is not universal.
- **Thief Khri are ABSENT from this file entirely**, yet they DO appear in
  percWindow (`Khri Sagacity (1 roisan)` is one of Lich's own examples). Any
  feature keyed on this data must degrade silently for Thieves.
- `khri_preps` and `rituals` are message-string lists, not named abilities.
- Guild spread: Warrior Mage 70, Moon Mage 57, Cleric 48, Necromancer 40,
  Ranger 34, Empath 33, Bard 32, Paladin 29, Trader 27.

Lichborne snapshots this at build time via `tools/gen-spell-data.mjs` rather
than reading a Lich install at runtime, because the Spell Monitor must work on a
direct connection (Principle #2). Re-run it when Lich publishes new spells.

---



## DR protocol — a view of another room (Locate) and Lich's room-name rewrites (v0.20.5)

**A Moon Mage's Locate prints the located person's room on main in LOOK form**, with no `<nav>`, no `<streamWindow>` subtitle and no room components. From ProfanityFE's real capture (`spec/fixtures/room_pipeline/dr_locate_after_move.xml`, from `DR-Fidon/2026/10/2026-10-07_13-09-45.xml`):

```
<spell>None</spell>You gesture.
<resource picture="0"/><style id="roomName" />[Willow Walk, Willow Tree] (84081)
<style id=""/><preset id='roomDesc'>The massive weeping willow tree …</preset>
Also here: Quilsilgas.
Obvious paths: <d>north</d>, <d>east</d>, <d>west</d>.
<compass><dir value="n"/><dir value="e"/><dir value="w"/></compass><castTime value='…'/>
<prompt time="…">&gt;</prompt>
```

A real move, by contrast, sends `<nav rm>` and a subtitle BEFORE the roomName (every DR room fixture in Profanity's suite, and their 15 real logs). With DR's showroomid on, the roomName's `] (NNN)` id equals the `<nav rm>` id on arrival. A familiar's view instead arrives inside `<pushStream id="familiar" ifClosedStyle="watching"/>`.

**Lich rewrites the roomName for its `;display` options, using the PLAYER's room, not the room the line names** (lich-5 `lib/games.rb`, checked at `0bd852bc`, 2026-10-06):
- `process_room_information` (~line 1166) matches any roomName line, optionally inside the familiar push, calls `modify_room_display` when `display_lichid`, `display_uid` or `hide_uid_flag` is on, and arms `@room_number_after_ready`.
- DR's `modify_room_display` (line 1553): with the title placement (`display_roomid_location` title/both) it strips the game's `] (NNN)` when `suppress_game_realid?` (`display_uid` or `hide_uid_flag`, line 1639) and inserts ` - <room_number_display>` before `]`. `room_number_display` (line 1608) is `Map.current.id` and/or `(u#{XMLData.room_id})`: the player's current room. So `[Name - 2072 - (u230007)]` carries the same ids for any room; only the NAME tells a view apart.
- At the next line containing `<prompt `, `process_room_display` (DR, ~line 1580) prepends, for room-window front-ends (`--stormfront` is one), a `<streamWindow id='main' … subtitle=" - [<XMLData.room_title> - <room_number>]…"/>` (and a `room` one). That happens after ANY room view, a Locate included, and names the player's room. The view's `<compass>` typically shares that prompt line, so it comes AFTER this subtitle.

Lichborne's handling: DESIGN §54.2.


---

## DR protocol — the injuries dialog is a full snapshot (verified 2026-10-14)

From Sekmeht's raw-XML captures in combat (the first captures to include the dialog). Each update lists **all 15 body parts**, in this order: head, neck, rightArm, leftArm, rightLeg, leftLeg, rightHand, leftHand, chest, abdomen, back, rightEye, leftEye, rightFoot, nsys. A healthy part's `name` is its own id; a wounded one's is `Injury<n>` (`Scar<n>`, `Nsys<n>` per Lich's parser, see CLAUDE.md pitfall #97):

```
<dialogData id="injuries"><image id="head" name="head" height="0" width="0"/>…<image id="chest" name="Injury1" height="0" width="0"/>…<image id="nsys" name="nsys" height="0" width="0"/></dialogData>
<dialogData id="injuries"><skin id="healthSkin" name="healthBar2" controls="health2" …/><progressBar id="health2" value="100" text="HEALTH 100%" customText="t" …/></dialogData>
```

- **Every update is complete**, so replacing the whole injury map on each one (what Lichborne does) is correct, and a part healing is reported by its name returning to its id. This settles one of the two open questions in pitfall #97; the other (whether an empty dialog can ever arrive) is still unseen.
- A **second** `injuries` dialog follows with a `health2` progress bar (the health bar Wrayth draws under its body diagram). Lichborne's `<progressBar>` handler ignores ids it doesn't know, so it can't reach the vitals.
- The dialog arrives when injuries change. Captures show none during long stretches without injury changes (and none in a whole login burst, B422), so an empty injury map is the normal state for an unhurt character.

## DR's Combat panel — announced 2026-10-14, not yet seen in the feed

GM Auchand announced work on DR's Combat panel, which "has been largely non-functional in DR": creatures and NPCs on it, with "some limited status icons that indicate the creature's current range". Two raw-XML captures in combat that day (Sekmeht, mid-session, through Lich as `--stormfront`) showed **nothing new**:

- the only dialogs were `minivitals` and `injuries`; no combat `<openDialog>`/`<dialogData>`;
- `<crtrStatus>` carried only `hostile` and `disengaged` (no range attribute);
- the `combat` stream was still attack narration, and range still arrived only as text without ids ("The ice archon closes to pole weapon range on you!").

A player watching his own feed (Mahtra) reported the same. Two untested explanations:

1. **Dialog layouts arrive in the login burst** (`<openDialog>`), so a session already logged in when the change rolled out would never receive a new panel's setup. A capture from a fresh login settles it.
2. **A version gate.** DR receives the client's own id line: for a Stormfront-style front end, Lich relays the client's login key and version line unchanged and substitutes its own string (`Frontend::CLIENT_STRING`, `/FE:WRAYTH /VERSION:1.0.1.28 /P:WIN_UNKNOWN /XML`, lich-5 `lib/common/frontend.rb:515`) only for its GSL and Frostbite paths and its `--without-frontend` mode (`lib/main/main.rb:702-790`). Lichborne sends `/FE:WRAYTH /VERSION:1.0.1.22` (`LichConnection.ts`, `ConnectionManager.ts` `CLIENT_ID`). If DR sends the panel only to newer clients, Lichborne wouldn't get it.

Tracked in BUGS.md, Pending Tester Follow-ups.

## 19. Detachable Client — the Attach Protocol

How a front-end connects to a Lich that is **already running and logged in**.
Verified against lich-5 source while merging PR #2 (attach mode, v0.19.4); see
DESIGN §48 for what Lichborne does with it.

### Starting an attachable Lich

`--headless PORT` is sugar that normalizes to
`--without-frontend --detachable-client=PORT`
([lib/main/arg_normalization.rb:16-18](file:///c:/temp/lich-dev/lich-5/lib/main/arg_normalization.rb#L16)).
`--headless auto` → `--detachable-client=0` (OS-assigned port);
`--headless HOST:PORT` is accepted. **Bare `--headless` with no port is
REJECTED** (line 21) — an unattached fully headless login has nowhere to go.

The hard constraint: **only an attachably-started Lich can be attached to.** A
normally-launched Lich accepts its single front-end and closes the listener (the
force-mode model in CLAUDE.md's Lich-launch section), so there is nothing
listening afterwards. This is not something a client can work around.

### The listener takes a BARE TCP connection — no auth, no handshake

`detachable_client_thread`
([lib/main/main.rb:836-878](file:///c:/temp/lich-dev/lich-5/lib/main/main.rb#L836))
loops on `server.accept`, and the entire path from accept to live client is:

```ruby
accepted_socket, = server.accept
client = SynchronizedSocket.new(accepted_socket, role: :detachable)
client.sync = true
detachable_client_register(client)
Thread.new(client) { |c| handle_detachable_client(c) }
```

There is **no authentication step, no login key, and no `FE:` capability line**
between accept and register. A client that sends anything on connect has it
dispatched to the game as a command — which is why Lichborne's `AttachConnection`
deliberately sends *nothing* on attach (verified by harness: zero unprompted
bytes). Multiple front-ends may attach at once, and a detachable client dropping
does **not** end the session.

Lich also writes a **session descriptor file** per character when detachable —
`Frontend.create_session_file(char_name, host, port)` (main.rb ~858). That is the
natural source for auto-discovering attach targets instead of typing host/port;
Lichborne does not read it yet (recorded as future work in DESIGN §48.7).

### On accept, Lich pushes a state resync — and its vitals shape is DR-specific

`detachable_client_send_init`
([lib/global_defs.rb:2306](file:///c:/temp/lich-dev/lich-5/lib/global_defs.rb#L2306))
pushes vitals, prepared spell, indicators and the compass, then the live stream
follows. **Every `progressBar` in it hardcodes `value='0'`** and carries the real
numbers only in `text`:

```ruby
init_str = "<progressBar id='mana' value='0' text='mana #{XMLData.mana}/#{XMLData.max_mana}'/>"
```

**In DragonRealms that text is `health 100/`, not `health 100/100`.** Lich derives
both numbers by scanning DR's own bar text —
`@health, @max_health = attributes['text'].scan(/-?\d+/).collect { |n| n.to_i }`
([lib/common/xmlparser.rb:743](file:///c:/temp/lich-dev/lich-5/lib/common/xmlparser.rb#L743))
— and **DR sends a percentage** (`text='mana 86%'`, captured live), so the scan
finds ONE number, `max_health` stays nil, and it interpolates to the empty
string. GemStone sends `health 100/100`, so a `(\d+)/(\d+)` pair regex parses GS
and silently never matches DR. Consequence for any front-end: read the FIRST
number and treat a missing/zero max as 100 (DR's vitals *are* percentages).

A **`--genie`-flavoured** headless Lich sends no init at all (Lich skips it for
genie sessions) and suppresses stream tags, since genie is registered without the
`streams` capability. Plain `--headless` is the shape to recommend.

### A user-exit from an attached client kills the WHOLE session

`dispatch_detachable_client`
([lib/main/user_exit_dispatch.rb:52-62](file:///c:/temp/lich-dev/lich-5/lib/main/user_exit_dispatch.rb#L52))
tests the client string against `ShutdownIntent.user_exit_command?` and, on a
match, calls `run_orderly_user_shutdown(source: :detachable_frontend, …)`. So
`exit` typed at an attached front-end is a full orderly shutdown of the entire
Lich session, not a detach of that one client.

This dictates the disconnect semantics: **a front-end that wants "close my window,
leave the session running" must half-close the socket and never send QUIT.** The
distinction is invisible to the user unless the client explains it, which is why
it is called out in Lichborne's release notes and User Guide.

### DR clips the `room objs` component; `--stormfront` vs `--saga` (verified 2026-11-01)

From two Capture XML sessions (Sekmeht, Agan) and Lich 6868b5d2:

- In a crowded room DR sends a **clipped** `<component id='room objs'>` (it ended at the 30th item with "some junk and some other stuff."), while the main-text "You also see" line in the same burst is complete. `<crtrStatus>` tags cover every creature, including ones only the main-text line names. A front end that names creatures from the component alone leaves them unnamed.
- `--stormfront` sets `$frontend` (session-wide: mono, room-number display, subtitle edits). The rich-stream rewrites (`room_element`, `game_links`, `double_bold`) follow each CLIENT's `SET_FRONTEND_CAPS` declaration first ([client_capabilities.rb](file:///c:/temp/lich-dev/lich-5/lib/common/client_capabilities.rb)); the handshake string is the Saga one whatever the flag (`frontend.rb` `CLIENT_STRING`). The `saga` front-end definition ([frontend/saga.rb:12](file:///c:/temp/lich-dev/lich-5/lib/common/frontend/saga.rb#L12)) is Wrayth's set plus `sentinel` (a `` prefix on every line) and the three declarable capabilities, so `--saga` buys nothing a declaring client lacks.

### Lich's own log shows the handshake; DR sent no `<room>` block to either Empath (verified 2026-11-01)

- Lich writes `info:` lines to `{Lich}/temp/debug-<date>-<time>.log` for each session: `client string from front end: FE:WRAYTH /VERSION:1.0.1.22 /P:WIN_UNKNOWN /XML` (Lichborne's), `client string sent to game: /FE:WRAYTH /VERSION:1.0.1.28 /P:SAGA /XML (Lich's, in place of the front end's)` (`frontend.rb:631-674`, `log_client_string`), and `client declared capabilities [room_element game_links double_bold]` (`client_capabilities.rb`, `log`). Three lines answer "did Lich get our declaration and what did the game see" with no capture needed.
- With the declaration received, `rich_stream_rewrite` (`games.rb:1285`) never converts `<room>`; yet zero `<room>` elements reached Lichborne across two Empath sessions (~35 room views, including `look`), while `<a exist>` links (600+ per capture) and doubled bold did. The room views arrived as `roomName` style + `roomDesc` preset + a `<compass>` line. `xmlparser.rb:525-527` says only that "not every room arrives as one: a Saga session also gets some moves as the legacy room components". The cause is unexplained (a per-account game-side setting is a guess); the parser handles both shapes, so nothing breaks.
- An Empath's `touch` forges a link whose report is pushed to the `familiar` stream ("Elleara's injuries include…"), and DR sends the patient's wounds as a separate `dialogData id="injuries-<their id>"` inside an `openDialog` titled "<name>'s Injuries" (its images carry a `transfer <name> <part>` cmd). Your own dialog is the exact id `injuries`.

### The injuries dialog around a heal (verified 2026-11-01, Agan, 7 minutes at a vela'tohr plant)

- **The dialog is also re-sent about once a minute with nothing changed** (46 in 46 minutes on two characters, 2026-11-01, on the minute for each session). Those repeats are why a panel can catch up with no action from the player.
- **Each update lists all 15 parts, so replacing the map is correct.** 10 image dialogs arrived in the session; the parser's event matched the raw images in all 10.
- **The update lags the heal by up to about 10 seconds.** The game's text and the dialog are separate. Abdomen: healed text at 11:30:48.8, dialog without it at 11:30:53.9. Right arm: text at 11:31:33.2, the dialog in that same burst still listed it, cleared at 11:31:43.3. Left leg: 11:32:18.3 to 11:32:23.4. The right eye went the other way: the dialog cleared it 127 ms BEFORE the text.
- **The dialog is also re-sent with nothing changed:** identical copies at 11:29:22 and 11:30:23, and all-healthy copies at 11:33:03, 11:33:13, 11:34:13 and 11:35:13. What drives that beat wasn't established (the plant's effect ended at 11:33:48, and the last two came after it).
- **`health` can list scars the dialog leaves out.** `health` at 11:32:08 listed "nearly invisible scars along the right arm" and at 11:32:59 "tiny scars across the left leg", while the dialogs either side marked those parts healthy (name = the part's id). No `Scar<n>` image appeared in this session, so a scar display can't be built from this dialog alone. Whether `Scar<n>` is sent for heavier scars wasn't tested.
- **Minor wounds read `Injury1` whatever `health` calls them:** "minor abrasions" and "tiny scratches" both.

### What a lost game connection looks like from the front end (Lich 5.23.0, seen 2026-11-01)

- Both Lichs logged `connection error: Errno::ECONNRESET` and `shutdown requested reason=connection_reset source=game_reader` at 11:40:11, and `getaddrinfo: No such host` for discord.com at 11:40:22, so the machine's own network was failing, not Lich or Lichborne.
- **The front-end socket stays open while Lich drains its scripts.** Lich runs `best-effort shutdown cleanup` first, which took 11.6 s on Sekmeht, whose Lich exited at 11:40:23. The front end sees no disconnect until then; the only sign is `--- Lich: X has exited.` lines.
- **A QUIT sent during that drain logs an error line.** `ShutdownCoordinator.request` keeps the FIRST reason, so `run` raises `orderly user exit requires reason=:user_exit` (`orderly_shutdown.rb:103`), reaching the front end as `--- Lich: error: client_thread: …` (`main.rb:898`). It is harmless: cleanup carries on. Agan's Lich took 54.6 s to exit because of slow scripts and `stopping scripts`.

### Front-end facts from the 2026-11-01 Lich audit (main 6868b5d2, installed 5.23.0)

- **Lich mode needs the front end to answer the game's first bytes.** A proxied front end's handshake isn't followed by anything from Lich (`main.rb:~847-861`; its own paths send `<c>` twice), and `start_wrap_thread` sends `look` after 6 s with no data if autostart hasn't happened (`games.rb:573-581`). Hence `[(unknown script)]>look` in the session log at every login. Genie sends a blank line 1 s after its first row (`Genie4 Core/Game.cs:1031-1034`), and `do_client` forwards a blank line to the game (`global_defs.rb:2301-2325`).
- **A QUIT is not immediate since 5.19.2.** `client_thread` matches it (`ShutdownIntent.user_exit_command?`, `main.rb:884-886`) and runs the orderly shutdown first: script drain (20 s poll bound plus inline `before_dying` hooks, `shutdown_script_drain.rb:13-16`), `Vars.save`, then the QUIT to the game, then up to 10 s waiting for EOF (`orderly_shutdown.rb:115-120`). The front-end socket closes last, so that close is the real "the account is free".
- **Lich's room subtitle arrives after the compass** when `;display lichid` or `uid` is on, for the room you're already in, and `(**)` marks a room with no uid (`room_number_display`, `process_room_display`, `games.rb:~1680-1700`).
- **Lich's mono output can open and close on one line:** `<output class="mono"/>Room Number: 2522<output class=""/>` (`room_styled`, `games.rb:~88`).
- **Lich's cut-line rejoin runs first** (`clean_serverstring`, `games.rb:1604`), and its atmospherics filter can prepend a `<popStream>` to a whole refusal (`games.rb:~217`).
- **A percWindow refresh can have no pushStream:** the clear, then plain rows, sometimes after other lines, up to the prompt. ProfanityFE's `rich_perc_refresh_spec.rb` says it depends on the Lich build; lich-5's `dr_legacy_hide_whisper` fixture has it too; 0 of 2,832 clears in the 2026-11-01 captures.
- **Attach `auto` reads the file, not the process:** a headless Lich started before an update still runs the old code, and v5.22.0's `handle_detachable_client` has no capability branch (`global_defs.rb:2183-2193`), so the line would reach the game (B587).
- **`TIME` and `WEATHER` replies, verbatim (Agan, 2026-11-01):** `It has been 458 years, 60 days since the Victory of Lanival the Redeemer.` / `It is the 2nd month of Ka'len the Sea Drake in the year of the Amber Phoenix.` / `It is currently spring and it is early morning.` / `You're positive it's 6 roisaen after the Anlas of Hodierna's Blessing.` Then `You glance up at the sky.` + `The sky is very cloudy.` outdoors, or `That's a bit hard to do while inside.` Both can interleave with a running script's lines.
- **DR's glance wording today:** `You glance down to see a steel spike in your right hand and nothing in your left hand.`
- **The speakers in a thought:** `[General] Your mind hears Chauntille thinking, "…"` and LNet's `[DRPrime]-DR:Rairk: "…"`. `[Name] "…"` appears in mock.xml but in none of these captures.

### Delivery stalls and a VPN (measured 2026-11-01)

- **The measurement needs no rebuild:** every `<prompt time="N">` carries the game server's clock, and a Capture XML line carries its receipt time, stamped in main before the parser. Receipt minus server time, relative to the session's minimum, is how late the line came. `time` is whole seconds, so up to about 1 s of it is rounding. `tmp-v0210-rich/lag3.cjs <Character>` reports it per capture session.
- **With NordVPN's NordLynx tunnel connected:** stalls over 2 s, worst 3.4–4 s, spaced at about 20, 40 or 60 s: Squabbles 41 in 22 min, Vinari 36 in 24 min, Sekmeht 16 and Agan 10 in the same 7 min. About 4 s of silence, then a backlog arriving together. Agan's 10 all lined up with Sekmeht's within 250 ms (7 within 3 ms). Two separate Lich processes and sockets, so neither Lich nor any one command is the cause.
- **With the tunnel off:** zero stalls in 10.5 minutes on both characters, with their scripts running, worst 1.2 s. `health`, `exp` and `look` got their first line back in about 90–230 ms, from the send stamps.
- **The player's view:** a command seems to hang while other text keeps coming. In the case captured, lines made over about 3 s arrived within half a second, then the command's reply. The reply wasn't slow on its own; it was behind the queue.
- **Not proven:** this is one session each way, not a repeat with the tunnel back on, and the cause inside the tunnel or NordVPN's software is unknown. Parse time is ruled out (microseconds, and the stamp is before the parser). Only NordLynx on Windows was seen; other VPNs are untested.
