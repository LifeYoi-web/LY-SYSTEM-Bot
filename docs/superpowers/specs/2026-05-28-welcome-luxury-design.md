# Welcome Luxury Upgrade — Design

Date: 2026-05-28
Status: Approved ("سوي كل شيء")

## Goal
Turn the bare welcome embed (just orange-colored description + thumbnail) into a premium experience:
a rich Discord embed *plus* a freshly rendered branded PNG card per member, optional link-button row,
optional welcome DM, and an auto-cleaning @mention. Goodbye gets the matching polish.

## Approach (Tier B from the brainstorm)
Embed + rendered card image. The card is the "wow" differentiator versus a plain rich embed.

## Schema (additive on `GuildSettings`, `db push` safe)
```
welcomeUseCard            Boolean @default(true)
welcomeCardBg             String? // base64 data URL (cap ~1.5 MB binary)
welcomeButtons            Json    @default("[]") // [{ label, url, emoji? }]
welcomeDmEnabled          Boolean @default(false)
welcomeDmMessage          String?
welcomeMentionDeleteSeconds Int   @default(0)
goodbyeUseCard            Boolean @default(false)
```

## Card renderer (`src/bot/welcomeCard.ts`)
- `@napi-rs/canvas` (precompiled native binary — installs cleanly on Railway/nixpacks).
- Cairo variable font (OFL, ~600 KB) bundled at `assets/fonts/Cairo-Variable.ttf`; registered once.
- 1200 × 400 PNG. Layout (RTL): orange accent strip on the right, circular avatar with orange ring,
  Cairo Bold name + "أهلًا وسهلًا" / "وداعًا" + "العضو رقم #N · server".
- Custom background: optional, fed by base64 data URL or http URL; cover-fit + a 45% dark overlay
  so foreground text remains legible regardless of the user's image.
- Default background: programmatic gradient + faint orange diagonal stripes.
- Failures (font load, avatar load, custom bg load) downgrade gracefully — never throws.

## Bot events
- `guildMemberAdd`: rich embed (title, description with new placeholders, avatar thumbnail, three
  fields: member mention / #N / account age, server-iconed footer with member count, server banner
  as `setImage` when present *or* the rendered card as `attachment://welcome.png`); optional link
  button row; optional welcome DM; optional mention auto-delete (`setTimeout(...).unref()`).
- `guildMemberRemove`: matching grey embed + fields (account age, current count); optional goodbye
  card.

## Template (`src/bot/welcome.ts`)
Adds `{position}` `{accountAge}` `{createdAt}` placeholders. `parseWelcomeButtons` defensively
validates the configured buttons (label/url required, http(s) URL, max 5).

## API (`/api/settings` PUT)
Validates every new field: bool toggles, message length (≤2000), DM message length, mention-delete
seconds in 0..60, card-bg as `data:image/*` ≤ ~1.5 MB binary, buttons array (≤5, each with
label ≤80 + http(s) URL). `express.json` body limit raised to 4 MB to fit the base64 background.

## Dashboard (`Welcome.tsx`)
Card toggle, custom background uploader (FileReader → data URL, client-side ≤1.5 MB check) with
preview, configurable button list, DM toggle + message, mention auto-delete seconds, goodbye card
toggle, live embed preview with badges + button mockups + a card-render notice. Goodbye still uses
the welcome channel.

## Tests
- `renderTemplate` extended placeholders, `formatAccountAge` thresholds (days/months/years),
  `parseWelcomeButtons` (well-formed only, max 5, returns [] on bad input).
- `renderWelcomeCard` produces a valid PNG buffer (magic bytes check) for both `welcome` and
  `goodbye` variants — also smoke-tests font registration + canvas init.
