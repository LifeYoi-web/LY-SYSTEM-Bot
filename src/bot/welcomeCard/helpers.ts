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
