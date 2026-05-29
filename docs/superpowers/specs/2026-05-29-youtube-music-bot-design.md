# YouTube Music Bot — Design

**Date:** 2026-05-29
**Status:** Approved (pending implementation)

## Context

The owner asked for the bot to play music from YouTube in voice channels. The hard
constraint is hosting: the main bot runs on **Railway**, whose datacenter IPs are
frequently bot-blocked by YouTube ("Sign in to confirm you're not a bot"), making a
YouTube music bot that extracts audio from the Railway process unreliable. Streaming
audio also adds continuous CPU (Opus/ffmpeg) + bandwidth to the single process that
also serves the dashboard.

**Decision:** run the audio muscle on **separate hosting** via **Lavalink** (the
industry-standard standalone audio node), on a VPS with a non-blocked IP. The
LY-SYSTEM bot stays on Railway and controls Lavalink remotely. YouTube extraction and
RTP audio egress happen from the VPS, not Railway. One bot, one token, music commands
live in the existing bot.

Scope for v1: **full** Discord-side feature (no dashboard panel).

## Architecture

```
[Discord] ←(voice RTP + YouTube fetch from VPS IP)→ [Lavalink v4 on VPS]
                                                          ↑ WebSocket (control)
[LY-SYSTEM bot on Railway] ──(lavalink-client)────────────┘
```

- discord.js `raw` events (VOICE_STATE/SERVER_UPDATE) are forwarded to the Lavalink
  client; Lavalink opens the Discord voice connection and pulls YouTube from the VPS.
- Lavalink client library: **`lavalink-client`** (TS-native, v4, built-in queue).
- A **singleton** `LavalinkManager` lives in the bot (mirrors `src/bot/client.ts`),
  initialized on `ready`. When `LAVALINK_*` env is absent the manager is `null` and
  every music command replies "music not configured" — the feature is **disabled
  safely** and never affects boot (protects the boot/502 invariant in `tests/boot.test.ts`).

## Components (bot side)

- `src/bot/music/manager.ts` — build + hold the `LavalinkManager` (or null), wire node
  + player events: `trackStart` → post now-playing; `queueEnd` → start 5-min idle timer
  then disconnect; errors logged via `logger`. Exposes `getMusicManager()` /
  `initMusicManager(client, config)`.
- `src/bot/music/player.ts` — pure-ish helpers: `formatDuration(ms)`, `buildNowPlaying`
  (embed + control buttons), `queuePage(tracks, page)`, voice-precondition checks
  ("member in a voice channel", "same channel as bot"), volume/loop coercion.
- `src/bot/music/buttons.ts` — handle `mu:` buttons (pause/resume, skip, stop, loop, shuffle).
- `src/bot/commands/music/*.ts` — slash commands: play, skip, stop, pause, resume,
  queue, nowplaying, volume, loop, shuffle, seek, disconnect.
- `src/bot/events/raw.ts` — `raw` event → `getMusicManager()?.sendRawData(d)`.
- `src/bot/events/ready.ts` (edit) — call `getMusicManager()?.init({ id, username })`.
- `src/index.ts` (edit) — `initMusicManager(client, config)` before login; non-blocking,
  never throws on an unreachable node.
- `src/shared/config.ts` + `.env.example` — optional `LAVALINK_HOST`, `LAVALINK_PORT`,
  `LAVALINK_PASSWORD`, `LAVALINK_SECURE`.
- `package.json` — add `lavalink-client`.
- `GuildVoiceStates` intent is already enabled (temp-voice) — no new gateway intent.

## Commands

`/play <url|query>` (incl. playlists) · `/skip` · `/stop` · `/pause` · `/resume` ·
`/queue` · `/nowplaying` · `/volume <0-150>` · `/loop <off|track|queue>` · `/shuffle` ·
`/seek <time>` · `/disconnect`. Now-playing message carries control buttons (`mu:`).
v1 has no DJ-role restriction (own server); anyone in the bot's voice channel controls.

## Error handling & gating

- Manager null → ephemeral "🎵 الموسيقى غير مفعّلة".
- Member not in voice / not same channel → clear Arabic message.
- Node disconnected / no search results → graceful message; all Lavalink calls in try/catch + `logger`.
- Idle auto-disconnect after 5 min; default volume 100; `selfDeaf` on.

## What the owner runs (ops — files provided in `lavalink/`)

1. VPS with a non-blocked IP + Java 17+ (or Docker via provided `docker-compose.yml`).
2. Lavalink v4 + `youtube-source` plugin (configured in `application.yml`; YouTube
   OAuth/cookies recommended for reliability — documented in `lavalink/README.md`).
3. Open the port behind a password; set `LAVALINK_HOST/PORT/PASSWORD(/SECURE)` in Railway.

## Testing

Vitest on pure logic only (project convention): `formatDuration`, now-playing embed
shape, queue pagination, volume bounds, loop-mode cycling, voice preconditions. discord.js
+ Lavalink are mocked; no live node needed. Boot must succeed with no `LAVALINK_*` set.

## Risks

- YouTube can still rate-limit even a residential/VPS IP; mitigated by OAuth/cookies on
  the Lavalink side. Lavalink isolates this from the bot.
- ToS: streaming YouTube audio violates YouTube ToS (Discord shut down Rythm/Groovy);
  accepted for a private/own server at the owner's discretion.
- Operational: requires the owner to run + maintain a VPS/Lavalink. Until then the
  feature ships dormant.
