# Optional Welcome/Goodbye Embed — Design (2026-06-04)

## Goal

Make the embed wrapper optional for welcome and goodbye messages. When off, the bot sends
plain text + the card PNG as a bare attachment (full-width, no embed box) + the link buttons.

## Decisions (owner-approved)

- Two independent toggles: `welcomeEmbedEnabled`, `goodbyeEmbedEnabled` — both `Boolean @default(true)` on `GuildSettings` (additive; zero behavior change until toggled off).
- Embedless welcome composition: if the rendered template already contains the member mention (`{user}`), the text IS the content; otherwise prefix the mention. Card attaches as a normal file (no `attachment://` embed image). Buttons unchanged.
- Embedless goodbye composition: plain `goodbyeText` as content + optional card file; `allowedMentions: { parse: [] }` as today.
- **Mention-auto-delete fix:** in embed mode the feature clears the whole content (text lives in the embed). In embedless mode it must keep the text — new pure helper `stripMentionKeepName(content, userId, username)` replaces every `<@id>` with `**username**` so the sentence stays readable without pinging.

## Touch points

- `prisma/schema.prisma`: two additive booleans.
- `src/db/settingsCache.ts`: extend `EditableSettings`.
- `src/api/routes/settings.ts`: add both keys to the booleans pass-through loop (+ tests).
- `src/bot/welcome.ts`: `stripMentionKeepName` (TDD, pure).
- `src/bot/events/guildMemberAdd.ts` / `guildMemberRemove.ts`: branch on the toggles.
- `web/src/lib/types.ts` + `web/src/pages/Welcome.tsx`: two Switch rows + submit payload.

## Tests

- `stripMentionKeepName`: replaces single/multiple mentions, keeps other text, trims.
- Settings route: both booleans pass through `PUT /`.
- Existing welcome/card suites stay green.
