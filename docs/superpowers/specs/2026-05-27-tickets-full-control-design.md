# Tickets — Full Control (Tier A) — Design

Date: 2026-05-27
Status: Approved (user said "ارفعه يالله")

## Goal
Upgrade the basic single-type / delete-on-close ticket system into a "pragmatic full-control"
system: multiple ticket types, claim, transcript-on-close + DM + immediate delete, reopen,
slash commands, and dashboard close/view.

## Close behavior (decided)
**Transcript then immediate delete.** On close: render an HTML transcript → store it in the DB +
post it (as a file) to the transcript/log channel + DM it to the opener → delete the channel.
**Reopen** creates a *new* channel reusing the same `Ticket` row and number.

## Schema (additive — `db push` safe)
- `TicketConfig` += `transcriptChannelId String?`, `dmOnOpen Boolean @default(true)`, `dmOnClose Boolean @default(true)`.
  Existing `categoryId/supportRoleId/openMessage` act as the **default type** when no `TicketType` rows exist (backward compatible).
- `Ticket` += `typeId String?`, `claimedBy String?`, `closedBy String?`.
- `TicketType` (new): `id, guildId, label, emoji?, categoryId?, supportRoleId?, openMessage?, pingSupport(=true), position(=0), enabled(=true), createdAt`.
- `TicketTranscript` (new): `id, guildId, ticketId, number, html, closedBy?, createdAt`.

## Bot (`src/bot/tickets.ts`)
Pure/testable helpers: `slugifyTicketName`, `resolveType(cfg, types, typeId?)`, `isTicketStaff(member, cfg, types)`,
`renderTranscriptHtml(data)`, `buildTicketPanel(cfg, types)` (select menu when ≥1 enabled type, single button otherwise).
Side-effecting: `openTicket(guild, prisma, userId, typeId?)`, `setClaim(...)`, `addUserToTicket/removeUserFromTicket`,
`renameTicket`, `closeTicket(guild, prisma, channelId, closedBy, reason?)` (transcript→store→send→DM→delete),
`reopenTicket(guild, prisma, ticketId, byUserId)`. Best-effort DM via `client.users.fetch().send().catch()`.

## Interactions (`events/interactionCreate.ts`)
- StringSelectMenu `ticket:type` → open the chosen type.
- Buttons: `ticket:open` (default type), `ticket:claim` / `ticket:unclaim` (staff; toggles the row),
  `ticket:close` → ephemeral confirm → `ticket:close:confirm` / `ticket:close:cancel`,
  `ticket:reopen:<ticketId>` (staff; on the transcript message).

## Slash command (`commands/community/ticket.ts`)
`/ticket` subcommands: `claim`, `unclaim`, `close [reason]`, `rename <name>`, `add <user>`, `remove <user>`,
`reopen <number>`, `panel [channel]`. Authorization at runtime via `isTicketStaff` (honors the support role,
not just Discord perms). `close` is also allowed for the ticket opener.

## API (`api/routes/tickets.ts`)
- `GET /` → `{ config, types, tickets(open), closed(+transcriptId) }`.
- `PUT /config` (+ transcriptChannelId, dmOnOpen, dmOnClose).
- `POST /types`, `PUT /types/:id`, `DELETE /types/:id` (invalidate types cache).
- `POST /panel` (channelId).
- `POST /:id/close`, `POST /:id/reopen` (staff id from `req.session.user.id`).
- `GET /transcripts/:id` → serves stored HTML (`text/html`).

## DB cache (`db/community.ts`)
`getTicketTypes(guildId)` (cached list, `orderBy position`) + `invalidateTicketTypes(guildId)` — same pattern as highlights.

## Dashboard (`web` — `pages/Tickets.tsx`, `lib/community.ts`)
Types CRUD (label, emoji, category, support role, message, enabled, order); config (transcript channel + DM toggles);
panel post; open list (number/type/opener/claimer/age + Close + channel link); closed list (View transcript + Reopen).

## Defaults
One open ticket per user total; claim is label-only; close has a confirm step; transcript dest = `transcriptChannelId`
falling back to `logChannelId`; DM on open + close default on.

## Tests (Vitest)
Pure: `renderTranscriptHtml` (escaping/content), `slugifyTicketName`, `resolveType`, `isTicketStaff`,
`buildTicketPanel` (button vs select). Route: config validation, types CRUD, panel validation, transcript serve
(content-type + 404), close/reopen 404.
