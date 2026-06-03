# Welcome Card Styles — Design (2026-06-04)

## Goal

Turn the single hard-coded welcome card into a gallery of **9 selectable art styles** (classic + 8 new), selectable per-guild from the dashboard, applied to both welcome and goodbye cards.

## Background

- Current renderer: `src/bot/welcomeCard.ts` — 1200×400 PNG via `@napi-rs/canvas`, Cairo font, RTL layout, LY orange `#f57c00`.
- 8 new concepts were prototyped as **real renders** (scratch scripts in `welcome-previews/`) and approved by the owner — all eight:

| key | Arabic label | essence |
|-----|--------------|---------|
| `neon-hud` | النيون السيبراني | sci-fi HUD: dashed targeting rings, side telemetry column, chromatic-aberration name |
| `calligraphy-gold` | حبر وذهب | giant translucent gold Arabic watermark on black, gold dust, double gold avatar ring |
| `aurora-glass` | زجاج الشفق | glassmorphism panel over orange/magenta/indigo aurora blobs, RANK pill, status dot |
| `islamic-star` | النجمة الثمانية | 8-fold Islamic star lattice, avatar in 8-pointed gold star frame, corner ornaments |
| `vip-ticket` | تذكرة VIP | the card IS a ticket: perforation, stub with barcode, VERIFIED stamp, ghost VIP watermark |
| `constellation` | سماء الانضمام | avatar as ringed planet (ring passes behind+in front), star crown over name, shooting star |
| `synthwave` | الغروب الرقمي | sliced retro sun on neon perspective grid, chrome name, 80s palette |
| `liquid-gold` | الذهب السائل | metallic gold ribbons flowing behind + in front of avatar on black, gold particles |

## Decisions (locked, owner-approved)

1. **All 8 + classic.** Default stays `classic` — zero visual change for existing deployments until the owner picks a style.
2. **`customBg` applies ONLY to `classic`.** Art styles ignore it (their background *is* the art). Dashboard copy states this explicitly.
3. **Schema change is additive only:** `GuildSettings.welcomeCardStyle String @default("classic")` — safe with `prisma db push`.
4. **Unknown/invalid style value falls back to `classic` at render time** — never throws, never blocks a welcome message.
5. **Both variants supported by every style:** goodbye swaps greeting to «وداعًا» and drops the member-position line (mirrors current classic behavior).

## Architecture

### Bot (renderer)

- `src/bot/welcomeCard.ts` moves to `src/bot/welcomeCard/index.ts` and becomes the **public API + registry** — existing `require('../welcomeCard')`-style imports resolve to the folder index unchanged, and we avoid file/folder shadowing:
  - `renderWelcomeCard(data)` — same signature, `WelcomeCardData` gains optional `style?: string`.
  - `WELCOME_CARD_STYLES: { key, labelAr }[]` — single source of truth for render dispatch, API whitelist, and dashboard gallery.
- Style modules: `src/bot/welcomeCard/styles/<key>.ts` — internal TS modules (normal exports; the CommonJS `module.exports` contract applies only to commands/events). Each exports an async `draw(ctx, data, helpers)`.
- Shared helpers module (`src/bot/welcomeCard/helpers.ts`): Cairo font registration, circular real-avatar draw (loads `avatarUrl`, falls back to a deliberate placeholder on failure), `truncate`, common constants (W/H, palette).
- Porting rule: keep each preview's art **as approved**; replace the synthetic avatar with the real avatar slot; parameterize username/server/position/variant; enforce per-style name truncation so long names never collide with the art.
- Call sites (welcome + goodbye flows) pass `settings.welcomeCardStyle` through; no other behavior change.

### API

- Settings route accepts `welcomeCardStyle`, validated against the `WELCOME_CARD_STYLES` whitelist; invalid value → 400. Settings-cache invalidation follows the existing write path.

### Dashboard

- Welcome page gains a «ستايل البطاقة» **gallery picker**: grid of 9 thumbnails (static PNGs in `web/public/welcome-styles/<key>.png` — the approved previews + one classic render), orange selection ring, saved with the rest of the welcome settings.
- Hint under the customBg uploader: «الخلفية المخصصة تعمل مع الستايل الكلاسيكي فقط».

## Tests (Vitest, TDD)

- **Registry render smoke:** every declared style renders a non-empty PNG buffer for BOTH `welcome` and `goodbye` variants, with the avatar load failing (placeholder path) — no network in tests, never throws.
- **Fallback:** unknown style key renders the classic buffer.
- **API:** `welcomeCardStyle` whitelist — accepts every registry key, rejects junk.
- Existing welcome tests stay green (classic default unchanged).

## Cleanup

- After porting: delete `welcome-previews/*.js` scratch scripts; copy the 8 approved PNGs to `web/public/welcome-styles/` (plus a rendered `classic.png`), then remove `welcome-previews/`.

## Risks / notes

- Render cost: pure canvas, same order of work as the current card (one render per join) — no perf concern.
- Arabic shaping verified in-engine (all 8 previews rendered correct connected letterforms).
- Schema is additive — complies with the repo's `db push --accept-data-loss` constraint.
