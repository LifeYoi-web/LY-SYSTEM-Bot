import { GlobalFonts, createCanvas, loadImage, type SKRSContext2D } from '@napi-rs/canvas';
import { join } from 'path';
import { logger } from '../shared/logger';

const ORANGE = '#f57c00';
const BG_DARK = '#0f1115';
const BG_LIGHT = '#1a1f2a';
const MUTED = '#9aa0aa';

const WIDTH = 1200;
const HEIGHT = 400;

let fontsLoaded = false;

/** Register Cairo (variable font, all weights) once per process. Safe to call repeatedly. */
function ensureFonts(): void {
  if (fontsLoaded) return;
  const path = join(__dirname, '..', '..', 'assets', 'fonts', 'Cairo-Variable.ttf');
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
  /** Optional base64 data URL or http URL for a custom background. Falls back to the default gradient. */
  customBg?: string | null;
  variant?: 'welcome' | 'goodbye';
}

/** Render a branded welcome (or goodbye) card to a PNG buffer. Never throws. */
export async function renderWelcomeCard(d: WelcomeCardData): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');

  await drawBackground(ctx, d.customBg ?? null);
  drawAccentStrip(ctx);
  await drawAvatar(ctx, d.avatarUrl);
  drawText(ctx, d);

  return canvas.toBuffer('image/png');
}

async function drawBackground(ctx: SKRSContext2D, customBg: string | null): Promise<void> {
  if (customBg) {
    try {
      const img = await loadCustomBackground(customBg);
      // cover-fit the custom image
      const ratio = Math.max(WIDTH / img.width, HEIGHT / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      const x = (WIDTH - w) / 2;
      const y = (HEIGHT - h) / 2;
      ctx.drawImage(img, x, y, w, h);
      // dark overlay so text stays legible regardless of the user's image
      ctx.fillStyle = 'rgba(15, 17, 21, 0.45)';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      return;
    } catch (err) {
      logger.warning(`welcomeCard: custom background load failed (${err}) — using default`);
    }
  }
  // Default: diagonal dark gradient + faint orange diagonal stripes
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
    const buf = Buffer.from(src.slice(comma + 1), 'base64');
    return loadImage(buf);
  }
  return loadImage(src);
}

function drawAccentStrip(ctx: SKRSContext2D): void {
  // Orange bar on the right edge (the design is RTL).
  ctx.fillStyle = ORANGE;
  ctx.fillRect(WIDTH - 14, 0, 14, HEIGHT);
}

async function drawAvatar(ctx: SKRSContext2D, avatarUrl: string): Promise<void> {
  const size = 220;
  const x = WIDTH - 280;
  const y = (HEIGHT - size) / 2;
  const cx = x + size / 2;
  const cy = y + size / 2;
  // Orange ring
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2 + 8, 0, Math.PI * 2);
  ctx.fillStyle = ORANGE;
  ctx.fill();
  // Clip to circle and draw the avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, size / 2, 0, Math.PI * 2);
  ctx.clip();
  try {
    const img = await loadImage(avatarUrl);
    ctx.drawImage(img, x, y, size, size);
  } catch {
    // Placeholder: dark fill with an initial-ish swatch
    ctx.fillStyle = BG_LIGHT;
    ctx.fillRect(x, y, size, size);
  }
  ctx.restore();
}

function drawText(ctx: SKRSContext2D, d: WelcomeCardData): void {
  const right = WIDTH - 320;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  // Title — "أهلًا وسهلًا" or "وداعًا"
  ctx.fillStyle = MUTED;
  ctx.font = '38px Cairo';
  ctx.fillText(d.variant === 'goodbye' ? 'وداعًا' : 'أهلًا وسهلًا', right, 110);
  // Member name (truncate so we never overflow the avatar)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px Cairo';
  ctx.fillText(truncate(d.username, 22), right, 210);
  // Subtitle — "العضو رقم #N · {server}" or just the server name for goodbye
  ctx.fillStyle = ORANGE;
  ctx.font = '30px Cairo';
  const sub =
    d.variant === 'goodbye'
      ? truncate(d.serverName, 36)
      : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 42);
  ctx.fillText(sub, right, 280);
  // Footer decoration: thin orange underline aligned to the right
  ctx.fillStyle = ORANGE;
  ctx.fillRect(right - 200, 300, 200, 3);
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
