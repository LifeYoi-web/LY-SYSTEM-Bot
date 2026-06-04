# Welcome Card Styles Gallery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single hard-coded welcome card into a gallery of 9 selectable art styles (classic + 8 approved concepts), selectable per-guild from the dashboard, applied to welcome AND goodbye cards.

**Architecture:** `src/bot/welcomeCard.ts` becomes a folder (`welcomeCard/index.ts` registry + `helpers.ts` + `styles/<key>.ts` × 9). Import path `'../welcomeCard'` stays valid (folder index). Additive schema column `welcomeCardStyle` (default `"classic"`). API whitelists the value; dashboard shows a thumbnail gallery. Unknown style → classic fallback at render time.

**Tech Stack:** discord.js v14 + TypeScript (CommonJS), @napi-rs/canvas, Prisma v7, Express, Vite + React, Vitest.

**Source art:** the 8 approved preview scripts live at `welcome-previews/<key>.js` (standalone node scripts, already rendered + owner-approved). They are the porting source of truth and get deleted in the final task.

**Spec:** `docs/superpowers/specs/2026-06-04-welcome-card-styles-design.md`

---

## Style table (used by several tasks)

| key | export name | labelAr | truncate(username) |
|-----|-------------|---------|--------------------|
| `classic` | `drawClassic` | الكلاسيكي | 22 |
| `neon-hud` | `drawNeonHud` | النيون السيبراني | 18 |
| `calligraphy-gold` | `drawCalligraphyGold` | حبر وذهب | 20 |
| `aurora-glass` | `drawAuroraGlass` | زجاج الشفق | 20 |
| `islamic-star` | `drawIslamicStar` | النجمة الثمانية | 20 |
| `vip-ticket` | `drawVipTicket` | تذكرة VIP | 16 |
| `constellation` | `drawConstellation` | سماء الانضمام | 20 |
| `synthwave` | `drawSynthwave` | الغروب الرقمي | 18 |
| `liquid-gold` | `drawLiquidGold` | الذهب السائل | 20 |

Goodbye variant rule (every style): greeting becomes `وداعًا`, subtitle drops the member number and shows only the server name; the art stays identical.

---

### Task 1: Additive schema + editable-settings + SPA type

**Files:**
- Modify: `prisma/schema.prisma` (GuildSettings, after `welcomeCardBg` ~line 33)
- Modify: `src/db/settingsCache.ts` (EditableSettings union, ~line 28)
- Modify: `web/src/lib/types.ts` (Settings interface, ~line 90)

- [ ] **Step 1: Add the column to the schema**

In `prisma/schema.prisma`, directly under the `welcomeCardBg` line inside `model GuildSettings`:

```prisma
  welcomeCardStyle          String  @default("classic") // welcome card art style key (see WELCOME_CARD_STYLES)
```

- [ ] **Step 2: Regenerate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" — `GuildSettings` type now has `welcomeCardStyle: string`.

- [ ] **Step 3: Allow the dashboard to write it**

In `src/db/settingsCache.ts`, add to the `Pick<GuildSettings, ...>` union after `'welcomeCardBg'`:

```ts
    | 'welcomeCardStyle'
```

- [ ] **Step 4: Add it to the SPA Settings type**

In `web/src/lib/types.ts`, after `welcomeCardBg: string | null;`:

```ts
  welcomeCardStyle: string;
```

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit`
Expected: clean.

```bash
git add prisma/schema.prisma src/db/settingsCache.ts web/src/lib/types.ts
git commit -m "feat(welcome): additive welcomeCardStyle column + editable settings type"
```

---

### Task 2: Refactor renderer into a registry folder (classic only)

**Files:**
- Create: `src/bot/welcomeCard/helpers.ts`
- Create: `src/bot/welcomeCard/styles/classic.ts`
- Create: `src/bot/welcomeCard/index.ts`
- Delete: `src/bot/welcomeCard.ts`
- Test: `tests/welcome-premium.test.ts` (existing — must stay green unchanged)

`require('../welcomeCard')` in `guildMemberAdd.ts`/`guildMemberRemove.ts` resolves to the new folder index — those files are NOT touched in this task.

- [ ] **Step 1: Write `src/bot/welcomeCard/helpers.ts`**

```ts
import { GlobalFonts, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { join } from 'path';
import { logger } from '../../shared/logger';

export const WIDTH = 1200;
export const HEIGHT = 400;
export const ORANGE = '#f57c00';
export const BG_DARK = '#0f1115';
export const BG_LIGHT = '#1a1f2a';
export const MUTED = '#9aa0aa';

let fontsLoaded = false;

/** Register Cairo (variable font, all weights) once per process. Safe to call repeatedly. */
export function ensureFonts(): void {
  if (fontsLoaded) return;
  const path = join(__dirname, '..', '..', '..', 'assets', 'fonts', 'Cairo-Variable.ttf');
  try {
    GlobalFonts.registerFromPath(path, 'Cairo');
    fontsLoaded = true;
  } catch (err) {
    logger.warning(`welcomeCard: Cairo font registration failed (${err}) — falling back to system fonts`);
    fontsLoaded = true; // don't keep retrying
  }
}

export interface WelcomeCardData {
  username: string;
  avatarUrl: string;
  position: number; // 1-based member position
  serverName: string;
  /** Optional base64 data URL or http URL for a custom background. Honored by the classic style only. */
  customBg?: string | null;
  variant?: 'welcome' | 'goodbye';
  /** Style key from WELCOME_CARD_STYLES. Unknown/missing → classic. */
  style?: string | null;
}

/** A style's draw function paints the full 1200×400 card onto the provided context. */
export type StyleDraw = (ctx: SKRSContext2D, d: WelcomeCardData) => Promise<void>;

export function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Load the member avatar; null on any failure (callers draw a placeholder). */
export async function loadAvatar(url: string): Promise<Image | null> {
  try {
    return await loadImage(url);
  } catch {
    return null;
  }
}

/**
 * Draw the avatar image (or a deliberate placeholder with the member's initial)
 * clipped to a circle at (cx, cy) with radius r. Rings/frames are the style's job.
 */
export function drawCircularAvatarInto(
  ctx: SKRSContext2D,
  img: Image | null,
  username: string,
  cx: number,
  cy: number,
  r: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
  } else {
    const g = ctx.createRadialGradient(cx, cy - r * 0.4, r * 0.2, cx, cy, r * 1.4);
    g.addColorStop(0, '#2a2f3a');
    g.addColorStop(1, '#11141a');
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${Math.round(r * 0.9)}px Cairo`;
    ctx.fillText((username.trim()[0] ?? 'L').toUpperCase(), cx, cy);
    ctx.textBaseline = 'alphabetic';
  }
  ctx.restore();
}

/** Rounded-rect path (does not fill/stroke). */
export function roundRectPath(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Deterministic LCG — particle/star layouts stay identical across renders. */
export function makeRng(seed = 1337): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}
```

- [ ] **Step 2: Write `src/bot/welcomeCard/styles/classic.ts`**

Port of the current card — same visual output, customBg honored here ONLY:

```ts
import { loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { logger } from '../../../shared/logger';
import {
  WIDTH, HEIGHT, ORANGE, BG_DARK, BG_LIGHT, MUTED,
  truncate, loadAvatar, drawCircularAvatarInto, type WelcomeCardData,
} from '../helpers';

export async function drawClassic(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  await drawBackground(ctx, d.customBg ?? null);
  drawAccentStrip(ctx);
  await drawAvatar(ctx, d);
  drawText(ctx, d);
}

async function drawBackground(ctx: SKRSContext2D, customBg: string | null): Promise<void> {
  if (customBg) {
    try {
      const img = await loadCustomBackground(customBg);
      const ratio = Math.max(WIDTH / img.width, HEIGHT / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
      ctx.fillStyle = 'rgba(15, 17, 21, 0.45)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      return;
    } catch (err) {
      logger.warning(`welcomeCard: custom background load failed (${err}) — using default`);
    }
  }
  const g = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  g.addColorStop(0, BG_DARK);
  g.addColorStop(1, BG_LIGHT);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.fillStyle = 'rgba(245, 124, 0, 0.05)';
  for (let i = -HEIGHT; i < WIDTH; i += 48) {
    ctx.save();
    ctx.translate(i, 0);
    ctx.rotate(-Math.PI / 6);
    ctx.fillRect(0, -HEIGHT, 14, HEIGHT * 3);
    ctx.restore();
  }
}

async function loadCustomBackground(src: string) {
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',');
    if (comma < 0) throw new Error('invalid data url');
    return loadImage(Buffer.from(src.slice(comma + 1), 'base64'));
  }
  return loadImage(src);
}

function drawAccentStrip(ctx: SKRSContext2D): void {
  ctx.fillStyle = ORANGE;
  ctx.fillRect(WIDTH - 14, 0, 14, HEIGHT);
}

async function drawAvatar(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const size = 220;
  const cx = WIDTH - 280 + size / 2;
  const cy = HEIGHT / 2;
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 8, 0, Math.PI * 2);
  ctx.fillStyle = ORANGE;
  ctx.fill();
  const img = await loadAvatar(d.avatarUrl);
  drawCircularAvatarInto(ctx, img, d.username, cx, cy, size / 2);
}

function drawText(ctx: SKRSContext2D, d: WelcomeCardData): void {
  const right = WIDTH - 320;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = MUTED;
  ctx.font = '38px Cairo';
  ctx.fillText(d.variant === 'goodbye' ? 'وداعًا' : 'أهلًا وسهلًا', right, 110);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px Cairo';
  ctx.fillText(truncate(d.username, 22), right, 210);
  ctx.fillStyle = ORANGE;
  ctx.font = '30px Cairo';
  const sub =
    d.variant === 'goodbye'
      ? truncate(d.serverName, 36)
      : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 42);
  ctx.fillText(sub, right, 280);
  ctx.fillStyle = ORANGE;
  ctx.fillRect(right - 200, 300, 200, 3);
}
```

Note: the classic placeholder branch (avatar load failure) now shows the member initial instead of a plain dark square — a strict upgrade, existing tests only assert PNG validity.

- [ ] **Step 3: Write `src/bot/welcomeCard/index.ts` (classic registered; 8 art styles land in Task 4)**

```ts
import { createCanvas } from '@napi-rs/canvas';
import { ensureFonts, WIDTH, HEIGHT, type StyleDraw, type WelcomeCardData } from './helpers';
import { drawClassic } from './styles/classic';

export type { WelcomeCardData } from './helpers';

const REGISTRY: Record<string, { labelAr: string; draw: StyleDraw }> = {
  classic: { labelAr: 'الكلاسيكي', draw: drawClassic },
};

/** Dashboard/API source of truth for selectable card styles. */
export const WELCOME_CARD_STYLES = Object.entries(REGISTRY).map(([key, v]) => ({
  key,
  labelAr: v.labelAr,
}));
export const WELCOME_CARD_STYLE_KEYS = Object.keys(REGISTRY);

/** Render a branded welcome (or goodbye) card to a PNG buffer. Unknown styles fall back to classic. */
export async function renderWelcomeCard(d: WelcomeCardData): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const entry = REGISTRY[d.style ?? 'classic'] ?? REGISTRY.classic;
  await entry.draw(ctx, d);
  return canvas.toBuffer('image/png');
}
```

- [ ] **Step 4: Delete the old file**

```bash
git rm src/bot/welcomeCard.ts
```

- [ ] **Step 5: Verify existing tests stay green + typecheck**

Run: `npx tsc --noEmit && npx vitest run tests/welcome-premium.test.ts tests/welcome.test.ts`
Expected: PASS (both files) — the import `'../src/bot/welcomeCard'` now resolves to the folder index.

- [ ] **Step 6: Commit**

```bash
git add src/bot/welcomeCard
git commit -m "refactor(welcome): card renderer becomes style registry (classic ported, API unchanged)"
```

---

### Task 3 (a–h, parallelizable): Port the 8 art styles

**Each style is one independent sub-task — no shared file edits.** Sub-task `<key>` touches ONLY:
- Create: `src/bot/welcomeCard/styles/<key>.ts`
- Scratch (deleted before commit): `scratch-render-<key>.ts`, `scratch-<key>-welcome.png`, `scratch-<key>-goodbye.png`

**Porting contract (applies to all 8):**

1. **Source of truth:** read `welcome-previews/<key>.js` — the owner-approved render. Transplant its art **faithfully**: background, decorations, composition, palette, exact effect parameters.
2. **Module shape:** mirror `styles/classic.ts` — import ONLY from `'../helpers'` and `'@napi-rs/canvas'` (types), export exactly one `export async function <exportName>(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void>` per the style table. No canvas creation, no font registration, no fs/path, no PNG writing — the module paints onto the given ctx only.
3. **Real avatar:** replace the preview's synthetic avatar block with `const img = await loadAvatar(d.avatarUrl)` and draw it inside the style's frame. Circular frames: `drawCircularAvatarInto(ctx, img, d.username, cx, cy, r)`. Non-circular frames (synthwave rounded-square; islamic-star star-clip): keep the frame, clip as the preview does, `ctx.drawImage(img, ...)` cover-fit when img exists, else reproduce the placeholder look (gradient + member initial via the same visual language as `drawCircularAvatarInto`).
4. **Dynamic data:** username → `truncate(d.username, N)` (N from the style table); `#1234` → `d.position`; `LY SYSTEM` → `d.serverName`; greeting/subtitle per variant rule (goodbye: `وداعًا` + server name only).
5. **Determinism:** replace the preview's local RNG with `makeRng(<same seed>)` from helpers.
6. **Stability:** never throw on missing avatar; no network beyond `loadAvatar`.

**Per-style verification loop (mandatory):**

- [ ] **Step 1: Port the module** per the contract above.

- [ ] **Step 2: Write the scratch runner** `scratch-render-<key>.ts` at repo root (example for `neon-hud`; substitute the export/key):

```ts
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import { ensureFonts, WIDTH, HEIGHT } from './src/bot/welcomeCard/helpers';
import { drawNeonHud } from './src/bot/welcomeCard/styles/neon-hud';

async function main() {
  ensureFonts();
  for (const variant of ['welcome', 'goodbye'] as const) {
    const canvas = createCanvas(WIDTH, HEIGHT);
    await drawNeonHud(canvas.getContext('2d'), {
      username: 'LifeYoi',
      avatarUrl: 'https://example.invalid/a.png', // forces the placeholder branch
      position: 1234,
      serverName: 'LY SYSTEM',
      variant,
    });
    writeFileSync(`scratch-neon-hud-${variant}.png`, canvas.toBuffer('image/png'));
  }
}
main();
```

- [ ] **Step 3: Render** — Run: `npx ts-node scratch-render-<key>.ts`. Expected: two PNGs written.

- [ ] **Step 4: View BOTH PNGs with the Read tool** and compare against `welcome-previews/<key>.png` (the approved look). Check: art faithful to the approved preview; goodbye variant coherent (وداعًا, no member number); placeholder avatar looks deliberate; no clipped text. Iterate (minimum 1 fix cycle if anything is off) until faithful.

- [ ] **Step 5: Clean scratch + typecheck**

```bash
rm scratch-render-<key>.ts scratch-<key>-welcome.png scratch-<key>-goodbye.png
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/bot/welcomeCard/styles/<key>.ts
git commit -m "feat(welcome): <key> card style"
```

---

### Task 4: Wire the 8 styles into the registry + style test suite

**Files:**
- Modify: `src/bot/welcomeCard/index.ts`
- Create: `tests/welcome-styles.test.ts`
- Modify: `src/bot/events/guildMemberAdd.ts:145-152`
- Modify: `src/bot/events/guildMemberRemove.ts:68-75`

- [ ] **Step 1: Write the failing test** `tests/welcome-styles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { renderWelcomeCard, WELCOME_CARD_STYLES, WELCOME_CARD_STYLE_KEYS } from '../src/bot/welcomeCard';

const EXPECTED_KEYS = [
  'classic', 'neon-hud', 'calligraphy-gold', 'aurora-glass', 'islamic-star',
  'vip-ticket', 'constellation', 'synthwave', 'liquid-gold',
];

const base = {
  username: 'أحمد LY',
  avatarUrl: 'https://example.invalid/avatar.png', // load fails -> placeholder branch
  position: 1234,
  serverName: 'LY SYSTEM',
};

describe('welcome card style registry', () => {
  it('declares classic + the 8 art styles with Arabic labels', () => {
    expect(WELCOME_CARD_STYLE_KEYS.sort()).toEqual([...EXPECTED_KEYS].sort());
    for (const s of WELCOME_CARD_STYLES) expect(s.labelAr.length).toBeGreaterThan(0);
  });

  for (const key of EXPECTED_KEYS) {
    for (const variant of ['welcome', 'goodbye'] as const) {
      it(`renders ${key} / ${variant} as a valid PNG`, async () => {
        const buf = await renderWelcomeCard({ ...base, variant, style: key });
        expect(buf.length).toBeGreaterThan(2000);
        expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
      }, 20000);
    }
  }

  it('falls back to classic for an unknown style', async () => {
    const buf = await renderWelcomeCard({ ...base, style: 'comic-sans' });
    expect(buf.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  }, 20000);
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/welcome-styles.test.ts`
Expected: FAIL — registry only declares `classic`.

- [ ] **Step 3: Register all 8 in `src/bot/welcomeCard/index.ts`**

Add the imports and registry entries (names from the style table):

```ts
import { drawNeonHud } from './styles/neon-hud';
import { drawCalligraphyGold } from './styles/calligraphy-gold';
import { drawAuroraGlass } from './styles/aurora-glass';
import { drawIslamicStar } from './styles/islamic-star';
import { drawVipTicket } from './styles/vip-ticket';
import { drawConstellation } from './styles/constellation';
import { drawSynthwave } from './styles/synthwave';
import { drawLiquidGold } from './styles/liquid-gold';

const REGISTRY: Record<string, { labelAr: string; draw: StyleDraw }> = {
  classic: { labelAr: 'الكلاسيكي', draw: drawClassic },
  'neon-hud': { labelAr: 'النيون السيبراني', draw: drawNeonHud },
  'calligraphy-gold': { labelAr: 'حبر وذهب', draw: drawCalligraphyGold },
  'aurora-glass': { labelAr: 'زجاج الشفق', draw: drawAuroraGlass },
  'islamic-star': { labelAr: 'النجمة الثمانية', draw: drawIslamicStar },
  'vip-ticket': { labelAr: 'تذكرة VIP', draw: drawVipTicket },
  constellation: { labelAr: 'سماء الانضمام', draw: drawConstellation },
  synthwave: { labelAr: 'الغروب الرقمي', draw: drawSynthwave },
  'liquid-gold': { labelAr: 'الذهب السائل', draw: drawLiquidGold },
};
```

- [ ] **Step 4: Pass the style at both call sites**

`src/bot/events/guildMemberAdd.ts` — inside the `renderWelcomeCard({...})` call add:

```ts
        style: settings.welcomeCardStyle,
```

`src/bot/events/guildMemberRemove.ts` — same addition in its `renderWelcomeCard({...})` call.

- [ ] **Step 5: Run the suite**

Run: `npx tsc --noEmit && npx vitest run tests/welcome-styles.test.ts tests/welcome-premium.test.ts`
Expected: PASS — 19 render assertions + registry + fallback.

- [ ] **Step 6: Commit**

```bash
git add src/bot/welcomeCard/index.ts tests/welcome-styles.test.ts src/bot/events/guildMemberAdd.ts src/bot/events/guildMemberRemove.ts
git commit -m "feat(welcome): 9-style registry wired to welcome/goodbye flows"
```

---

### Task 5: API whitelist for `welcomeCardStyle`

**Files:**
- Modify: `src/api/routes/settings.ts`
- Test: `tests/settings.test.ts`

- [ ] **Step 1: Write the failing tests** — append inside `describe('settings router', ...)` in `tests/settings.test.ts`:

```ts
  it('PUT / accepts a valid welcomeCardStyle', async () => {
    await request(app()).put('/api/settings').send({ welcomeCardStyle: 'vip-ticket' }).expect(200);
    expect(updateSettings).toHaveBeenCalledWith('g1', { welcomeCardStyle: 'vip-ticket' });
  });

  it('PUT / 400s on an unknown welcomeCardStyle', async () => {
    await request(app()).put('/api/settings').send({ welcomeCardStyle: 'comic-sans' }).expect(400);
  });
```

- [ ] **Step 2: Run to confirm the accept-case fails**

Run: `npx vitest run tests/settings.test.ts`
Expected: FAIL — `welcomeCardStyle` is silently dropped today (updateSettings called with `{}`).

- [ ] **Step 3: Implement in `src/api/routes/settings.ts`**

Add the import at the top:

```ts
import { WELCOME_CARD_STYLE_KEYS } from '../../bot/welcomeCard';
```

Add after the `welcomeCardBg` block (~line 93):

```ts
    if (b.welcomeCardStyle !== undefined) {
      const v = String(b.welcomeCardStyle);
      if (!WELCOME_CARD_STYLE_KEYS.includes(v)) {
        return res.status(400).json({ error: `welcomeCardStyle must be one of ${WELCOME_CARD_STYLE_KEYS.join(', ')}` });
      }
      data.welcomeCardStyle = v;
    }
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/settings.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/routes/settings.ts tests/settings.test.ts
git commit -m "feat(api): whitelist welcomeCardStyle in settings route"
```

---

### Task 6: Dashboard gallery picker + thumbnails

**Files:**
- Create: `web/public/welcome-styles/<key>.png` × 9 (8 copied + 1 rendered classic)
- Modify: `web/src/pages/Welcome.tsx`

- [ ] **Step 1: Copy the 8 approved thumbnails**

```powershell
New-Item -ItemType Directory -Force web/public/welcome-styles
Copy-Item welcome-previews/*.png web/public/welcome-styles/
```

- [ ] **Step 2: Render `classic.png`** — scratch runner `scratch-classic-thumb.ts` at repo root:

```ts
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import { ensureFonts, WIDTH, HEIGHT } from './src/bot/welcomeCard/helpers';
import { drawClassic } from './src/bot/welcomeCard/styles/classic';

async function main() {
  ensureFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  await drawClassic(canvas.getContext('2d'), {
    username: 'LifeYoi',
    avatarUrl: 'https://example.invalid/a.png',
    position: 1234,
    serverName: 'LY SYSTEM',
    variant: 'welcome',
  });
  writeFileSync('web/public/welcome-styles/classic.png', canvas.toBuffer('image/png'));
}
main();
```

Run: `npx ts-node scratch-classic-thumb.ts` then `rm scratch-classic-thumb.ts`
Expected: `web/public/welcome-styles/` contains exactly 9 PNGs.

- [ ] **Step 3: Add the gallery to `web/src/pages/Welcome.tsx`**

(a) Constant near `PLACEHOLDERS` (top of file) — keys MUST match the registry:

```tsx
const CARD_STYLES: { key: string; label: string }[] = [
  { key: 'classic', label: 'الكلاسيكي' },
  { key: 'neon-hud', label: 'النيون السيبراني' },
  { key: 'calligraphy-gold', label: 'حبر وذهب' },
  { key: 'aurora-glass', label: 'زجاج الشفق' },
  { key: 'islamic-star', label: 'النجمة الثمانية' },
  { key: 'vip-ticket', label: 'تذكرة VIP' },
  { key: 'constellation', label: 'سماء الانضمام' },
  { key: 'synthwave', label: 'الغروب الرقمي' },
  { key: 'liquid-gold', label: 'الذهب السائل' },
];
```

(b) In `submit()`, add to the `save.mutate({...})` payload after `welcomeCardBg`:

```tsx
        welcomeCardStyle: d.welcomeCardStyle,
```

(c) Insert the gallery field directly AFTER the «بطاقة صورة (PNG)» toggle-row (line ~111) and BEFORE the custom-bg field:

```tsx
            {d.welcomeUseCard && (
              <div className="field">
                <label>ستايل البطاقة</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                  {CARD_STYLES.map((s) => {
                    const active = (d.welcomeCardStyle || 'classic') === s.key;
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => set('welcomeCardStyle', s.key)}
                        style={{
                          padding: 0, cursor: 'pointer', textAlign: 'start', background: 'var(--bg-2)',
                          border: active ? '2px solid var(--accent)' : '1px solid var(--line, #2a2f3a)',
                          borderRadius: 10, overflow: 'hidden',
                          boxShadow: active ? '0 0 0 3px var(--accent-soft)' : 'none',
                        }}
                      >
                        <img src={`/welcome-styles/${s.key}.png`} alt={s.label} style={{ display: 'block', width: '100%', aspectRatio: '3 / 1', objectFit: 'cover' }} />
                        <div style={{ padding: '6px 8px', fontSize: 12, fontWeight: active ? 700 : 400, color: active ? 'var(--accent)' : undefined }}>{s.label}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="hint">الخلفية المخصّصة أدناه تعمل مع الستايل «الكلاسيكي» فقط — بقية الستايلات فنّها هو الخلفية.</div>
              </div>
            )}
```

(d) Update the custom-bg helper line (the `tr-sub` showing «سيُستخدم التدرّج...») to reflect style awareness:

```tsx
                <div className="tr-sub" style={{ flex: 1 }}>{d.welcomeCardBg ? 'خلفية مخصّصة محفوظة (تُطبَّق على الكلاسيكي فقط)' : 'تُستخدم خلفية الستايل المختار'}</div>
```

- [ ] **Step 4: Build the SPA to verify**

Run: `npm --prefix web run build`
Expected: clean Vite build (TS + bundle).

- [ ] **Step 5: Commit**

```bash
git add web/public/welcome-styles web/src/pages/Welcome.tsx
git commit -m "feat(dashboard): welcome card style gallery picker with live thumbnails"
```

---

### Task 7: Cleanup, full verification, deploy

**Files:**
- Delete: `welcome-previews/` (entire folder — scripts + PNGs; thumbnails now live in `web/public/welcome-styles/`)

- [ ] **Step 1: Remove the scratch folder**

```powershell
Remove-Item -Recurse -Force welcome-previews
```

- [ ] **Step 2: Full build** (loader gotcha: commands/events only exist compiled)

Run: `npm run build`
Expected: prisma generate → tsc → web build, all clean.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: ALL suites pass (≥ 269 tests + the new welcome-styles/settings additions).

- [ ] **Step 4: Commit + push (Railway auto-deploys)**

Commit ONLY plan/feature files — the user's unrelated working-tree changes (`.gitignore`, `no bg.png`) stay untouched:

```bash
git add docs/superpowers/plans/2026-06-04-welcome-card-styles.md
git commit -m "feat(welcome): 9-style welcome card gallery (8 new art styles + dashboard picker)"
git push origin main
```

- [ ] **Step 5: Post-deploy check** — Railway runs `npm start` → `prisma db push` adds the column with default `classic` (zero visual change until a style is picked). Verify the dashboard welcome page shows the gallery.

---

## Self-review notes

- **Spec coverage:** schema (T1), registry+helpers+classic (T2), 8 styles (T3), fallback+variants+call sites (T4), API whitelist (T5), gallery+thumbnails+hint (T6), cleanup+deploy (T7). Goodbye-variant rule encoded in the porting contract + tested per style in T4.
- **Type consistency:** `WelcomeCardData.style?: string | null` matches `settings.welcomeCardStyle: string` (Prisma non-null with default) — assignable. `WELCOME_CARD_STYLE_KEYS` exported in T2, consumed in T5. Export names in T3/T4 match the style table.
- **Parallel safety:** T3 sub-tasks touch only their own new file; registry wiring is serialized in T4.
