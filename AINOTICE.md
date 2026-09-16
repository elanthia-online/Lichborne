# Lichborne — AI Processing & Privacy Notice

This document explains **how Lichborne uses AI, what data is involved, and how your
private information is protected.** It covers only the AI-related parts of Lichborne.
It grows as AI features are added.

_Last updated: v0.17.2._

---

## The short version

- **AI is off by default and completely optional.** Nothing is sent anywhere until
  you turn a feature on, add your own API key, and accept a one-time disclosure.
- **Bring your own key (BYOK).** Lichborne uses **your** Anthropic (Claude) API key.
  There is no Lichborne server in the middle — requests go directly from your
  machine to Anthropic.
- **Credentials and account identifiers are scrubbed before anything is sent.** Your
  account **PIN / identification numbers**, **passwords**, and **account username**
  are removed from the text on its way to the AI.
- **AI advises and summarizes — it never plays the game.** It cannot send commands
  to DragonRealms, ever.

---

## What AI features exist today

| Feature | What it does | What it reads |
|---|---|---|
| **Catch Me Up** (`/ai catchup`) | Summarizes what you missed over a time window | Your session **log** for that character across the window (or, if logging is off, the text on your screen) |

As more AI features ship, they will be listed here with the same detail.

---

## What is sent, and when

Nothing is sent unless you actively invoke an AI feature (e.g. you type
`/ai catchup 2h`). At that point, for Catch Me Up:

- The relevant slice of **that one character's** game text for the window is
  gathered (in the main process), **de-duplicated**, and **redacted** (see below).
- That redacted text — plus a small factual summary of it (e.g. "3 ranks gained,
  2 deaths") — is sent to **Anthropic's API** (`https://api.anthropic.com`) using
  **your** API key, and the summary streams back.
- The state-readout streams that are pure noise (your inventory list, spell list,
  experience table, etc.) are **excluded** — they carry no events, only tables.
- If you've set a **Response voice** (Settings → AI — an optional persona like
  "a 90s TV news anchor"), that short text you typed is included in the request so
  the summary is written in that voice. It's your own words, not personal data,
  and it changes only *how* the summary reads — never what is sent about you.
- Which **model** you picked (Haiku, Sonnet, Opus, or Fable) determines where the
  request goes within Anthropic's API; the data sent is the same regardless.

Larger windows read more of your log and therefore send more text; the client warns
you when a window is large so you can use it sparingly. The header on every summary
states exactly what window and how much text it covered — the feature is never a
black box.

## What is NOT sent — PII & credentials

**Your private information is removed from the text before it leaves your machine
for the AI.** Specifically:

- **Passwords** are never part of the game text stream in the first place — logging
  in is handled by a separate, encrypted channel, and your saved password is stored
  **locally, encrypted by your operating system** (DPAPI on Windows, the Keychain
  on macOS, libsecret or KWallet on Linux), and is never included in anything sent
  to the AI. Any text that *looks* like a labelled password is additionally redacted
  as a safety net.
- **Your Simutronics account PIN / identification numbers** — the output of the
  in-game `PIN` command (Character Index Number, Player Identification Number,
  `PIN# …`) — is **redacted** before the text is sent.
- **Your account username** is **redacted** before the text is sent.
- **Card-length / long identifier numbers** are redacted defensively.

This redaction happens **only on the copy handed to the AI**. Your **session log on
disk stays completely pristine and untampered** — redaction never modifies your
saved logs or what you see on screen.

> **Honest limitation:** the redaction targets *known* sensitive shapes (the PIN
> output, labelled credentials, your account name, card-length numbers). If you were
> to type a secret as ordinary free text with no label, it is indistinguishable from
> normal prose and cannot be detected. Treat this as a strong safety net, not an
> absolute guarantee — and, as always, don't paste secrets into the game.

## Your API key

- Stored **on your machine only**, encrypted via the operating system (Electron's
  **safeStorage**: DPAPI on Windows, the Keychain on macOS, libsecret or KWallet on
  Linux). If your system has no secure storage available, the key is not saved at
  all — you'd enter it again each session rather than have it stored unencrypted.
- **Never leaves your machine except to authenticate directly with Anthropic** — it
  is not sent to any Lichborne server (there isn't one), and it never crosses into
  the display side of the app.

## What the AI can and cannot do

- It can **advise, summarize, compose, and decorate**.
- It **cannot issue game commands** — no AI output is ever sent to DragonRealms as a
  command. This keeps every AI feature within Simutronics' policies.

## Your data at Anthropic

Because this is **your** API key talking **directly** to Anthropic, the handling of
that request is governed by **your agreement with Anthropic** (their API terms and
privacy/usage policies), not by Lichborne. Lichborne adds no server, no logging of
your prompts, and no third party. See Anthropic's privacy and usage policies for how
they handle API traffic.

## Turning it off / removing your key

- `/ai off` disables all AI features instantly.
- Remove your key in **Settings → AI**; with no key, nothing can be sent.

---

_Questions or concerns about AI data handling? Raise them with the developer (see the
About dialog for the Discord/GitHub links)._
