# Lichborne — Lich & DragonRealms Knowledge Base

> Internal reference document. Captures what we've learned about **Lich5 internals, the DragonRealms protocol, and the live installation** — the verified facts we mirror or depend on, so they aren't re-derived. Each fact cites its source `file:line`.
> Sources: Lich5 source tree (`C:\temp\lich-dev\lich-5`, live install `C:\Ruby4Lich5`), the DR `drinfomon` scripts, and captured game XML.
> This is the LICH/DR *fact* layer — how Lich and DR actually behave. Lichborne's own implementation (how we consume these facts) lives in CLAUDE.md and DESIGN.md; each Lichborne pitfall that came from a Lich/DR fact points back here.
> Updated: 2026-08-16 (added the Lich 5.20.0 entry and the **Lich `id` vs game `uid`** number-space reference in §17; verified against Lich 5.20.0).

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

**The dialog is CHANGE-DRIVEN, so receiving nothing is a normal reading (verified 2026-09-15).** DR pushes `<dialogData id='injuries'>` when a part's state changes — not on a schedule, and not as part of the login burst. A full captured DR-through-Lich session (the B165 corpus, `<playerID>` and `<app char=…>` included) contains **zero** injuries dialogs, against 25 `minivitals` and 3 `spellChoose`. A front-end that has received none therefore knows only "nothing has been reported", which for an unhurt character is the whole session.

- **Lichborne consequence (B422):** an empty part map reads as "No active wounds.", not "waiting for data" — a waiting state there would never resolve. The caveat lives in the panel's tooltip.
- **Still unverified, and the reason pitfall #97 wants one capture around a heal:** whether DR ever sends an EMPTY injuries dialog to mean "all clear". Lichborne's parser only emits `injury-update` for a dialog carrying at least one `<image>`, so today such a signal would be dropped.

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

Two caveats the script states itself: phase is **model-only** (DR broadcasts no passive phase event to self-correct against), and only **4 of 8** wordings are confirmed against the `observe <moon>` verb — *growing crescent* → waxing crescent, *nearly turned its full face* → waxing gibbous, *perfect circle* → full, *waned to a narrow crescent* → waning crescent. The other four are logged raw as they're seen.

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



---

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
