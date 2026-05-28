# Temporary Voice Rooms (Join-to-Create) — Tier A — Design

Date: 2026-05-28
Status: Approved ("ارفعها طيب")

## Goal
A "Join to Create" voice hub: when a member joins the configured hub VC, the bot creates a private
temp voice channel, moves them into it, and gives them an in-channel control panel. The channel is
deleted when it empties.

## Prerequisite
Add `GatewayIntentBits.GuildVoiceStates` to `src/bot/client.ts` (non-privileged — no Dev Portal
toggle). Without it, `voiceStateUpdate` does not fire.

## Schema (additive — `db push` safe)
```
model TempVoiceConfig {
  guildId          String  @id
  enabled          Boolean @default(false)
  hubChannelId     String? // the "Join to Create" voice channel
  categoryId       String? // category to create temp channels under (optional)
  nameTemplate     String  @default("روم {user}") // {user} = display name
  defaultUserLimit Int     @default(0) // 0 = unlimited
  defaultLocked    Boolean @default(false)
}

model TempVoiceChannel {
  channelId String   @id
  guildId   String
  ownerId   String
  createdAt DateTime @default(now())

  @@index([guildId])
  @@index([ownerId])
}
```

## Bot (`src/bot/tempvoice.ts`)
- `applyTemplate(template, displayName)` (pure) → name string.
- `buildControlPanel(ownerId)` (pure) → embed + 3 rows (buttons / limit-select / kick-user-select).
- `createTempChannel(guild, prisma, cfg, member)` → create + permissions + post panel; if the user
  already owns a temp channel, move them there instead.
- `handleTempLeave(guild, prisma, channelId)` → if the channel emptied, delete it and remove the row.
- `reconcileTempVoice(client, prisma)` → on `ready`, prune temp channels whose Discord channel is
  empty or missing (avoids orphans across restarts).
- Action helpers: `renameTempChannel`, `setTempLimit`, `toggleLockTemp`, `kickFromTemp`, `claimTemp`.

## Event (`src/bot/events/voiceStateUpdate.ts`)
- `oldState.channelId !== newState.channelId` (channel changed). If `newState.channelId === hubChannelId`,
  call `createTempChannel`. If `oldState.channelId` is in `TempVoiceChannel`, call `handleTempLeave`.

## Control panel (posted inside the new voice channel's text chat)
- Row 1 (buttons): `tv:rename` · `tv:togglelock` · `tv:claim`
- Row 2 (string select): `tv:limit` — options 0/2/5/10/25
- Row 3 (user select): `tv:kick`
- Modal: `tv:rename:submit` (single text input "name")
- Authorization at runtime: most actions require `ownerId === interaction.user.id`; `tv:claim` is
  the inverse (owner is not currently in the channel).
- The temp channel is identified by `interaction.channelId` — no IDs embedded in custom IDs.

## API (`api/routes/tempvoice.ts`)
- `GET /` → `{ config }`.
- `PUT /config` → `{ enabled, hubChannelId, categoryId, nameTemplate, defaultUserLimit, defaultLocked }`.

## DB cache (`db/community.ts`)
`getTempVoiceConfig` / `updateTempVoiceConfig` via the existing `singleRowCache` factory.

## Dashboard
A new page `TempVoice.tsx`: enable toggle + hub channel (voice) + category + name template + default
limit + default-locked toggle + save. New nav entry under the community/engagement group.

## Tests (Vitest)
- Pure: `applyTemplate` (token replacement + truncation); `buildControlPanel` (returns the three
  expected custom IDs).
- Route: `GET /`, `PUT /config` happy path + validation (e.g., limit out of range).
