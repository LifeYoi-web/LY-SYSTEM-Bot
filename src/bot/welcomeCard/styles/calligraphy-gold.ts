import { type SKRSContext2D } from '@napi-rs/canvas';
import {
  WIDTH,
  HEIGHT,
  ORANGE,
  truncate,
  loadAvatar,
  drawCircularAvatarInto,
  roundRectPath,
  makeRng,
  type WelcomeCardData,
} from '../helpers';

// Calligraphy Luxury — giant gold Arabic watermark on black.
// Five-star hotel wedding invitation vibe. Gold is the star; orange is a single accent.

const GOLD = '#e6b85c';
const GOLD_LIGHT = '#f9d976';
const GOLD_DARK = '#b8860b';

// Avatar geometry (right side).
const AV_X = 975;
const AV_Y = 200;
const AV_R = 104;

/** Calligraphy gold: black + warm vignette, giant translucent Arabic watermark, double gold frame, gold-dust, ringed avatar. */
export async function drawCalligraphyGold(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const greeting = d.variant === 'goodbye' ? 'وداعًا' : 'أهلًا وسهلًا';
  const subtitle =
    d.variant === 'goodbye'
      ? truncate(d.serverName, 36)
      : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 42);
  const rng = makeRng(1337);

  drawBackground(ctx, greeting);
  drawFrame(ctx);
  drawGoldDust(ctx, rng);
  drawHalo(ctx);
  await drawAvatar(ctx, d);
  drawText(ctx, d, greeting, subtitle);
}

function drawBackground(ctx: SKRSContext2D, greeting: string): void {
  // Pure black base
  ctx.fillStyle = '#050505';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Subtle warm center glow then darkened edges (vignette)
  const center = ctx.createRadialGradient(
    WIDTH * 0.62,
    HEIGHT * 0.5,
    60,
    WIDTH * 0.62,
    HEIGHT * 0.5,
    WIDTH * 0.75,
  );
  center.addColorStop(0, 'rgba(40,30,12,0.55)');
  center.addColorStop(0.5, 'rgba(15,12,6,0.25)');
  center.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = center;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const vignette = ctx.createRadialGradient(
    WIDTH * 0.5,
    HEIGHT * 0.5,
    HEIGHT * 0.35,
    WIDTH * 0.5,
    HEIGHT * 0.5,
    WIDTH * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.85)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Giant translucent gold watermark (diagonal). Reads as deliberate calligraphy.
  ctx.save();
  ctx.translate(WIDTH * 0.5, HEIGHT * 0.52);
  ctx.rotate(-0.09);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 260px Cairo';
  // Faint gold fill + an even fainter stroke outline for that engraved-calligraphy feel.
  ctx.fillStyle = 'rgba(230,184,92,0.06)';
  ctx.fillText(greeting, 0, 0);
  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(249,217,118,0.045)';
  ctx.strokeText(greeting, 0, 0);
  ctx.restore();
  ctx.textBaseline = 'alphabetic';
}

function drawFrame(ctx: SKRSContext2D): void {
  // Thin double gold frame (wedding-invitation border)
  ctx.save();
  ctx.strokeStyle = 'rgba(230,184,92,0.6)';
  ctx.lineWidth = 1.5;
  roundRectPath(ctx, 22, 22, WIDTH - 44, HEIGHT - 44, 10);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(230,184,92,0.28)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, 30, 30, WIDTH - 60, HEIGHT - 60, 8);
  ctx.stroke();
  ctx.restore();

  // Corner flourishes — small gold L-brackets at each inner corner.
  cornerBracket(ctx, 46, 46, 1, 1);
  cornerBracket(ctx, WIDTH - 46, 46, -1, 1);
  cornerBracket(ctx, 46, HEIGHT - 46, 1, -1);
  cornerBracket(ctx, WIDTH - 46, HEIGHT - 46, -1, -1);
}

function cornerBracket(ctx: SKRSContext2D, x: number, y: number, dx: number, dy: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(230,184,92,0.75)';
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(230,184,92,0.4)';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(x, y + dy * 26);
  ctx.lineTo(x, y);
  ctx.lineTo(x + dx * 26, y);
  ctx.stroke();
  // tiny diamond pip just inside the corner
  ctx.translate(x + dx * 13, y + dy * 13);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = 'rgba(230,184,92,0.6)';
  ctx.shadowBlur = 0;
  ctx.fillRect(-2.5, -2.5, 5, 5);
  ctx.restore();
}

function drawGoldDust(ctx: SKRSContext2D, rng: () => number): void {
  const rand = (a: number, b: number) => a + rng() * (b - a);
  for (let i = 0; i < 120; i++) {
    // Bias density toward the avatar (gold dust settling around the ring)
    let x: number;
    let y: number;
    if (i % 3 !== 0) {
      const ang = rand(0, Math.PI * 2);
      const dist = rand(AV_R + 4, AV_R + 140) * Math.sqrt(rng());
      x = AV_X + Math.cos(ang) * dist;
      y = AV_Y + Math.sin(ang) * dist;
    } else {
      x = rand(48, WIDTH - 48);
      y = rand(40, HEIGHT - 40);
    }
    const r = rand(0.5, 2.5);
    const a = rand(0.1, 0.7);
    const tone = rng() < 0.5 ? GOLD_LIGHT : GOLD;
    ctx.beginPath();
    ctx.fillStyle = tone;
    ctx.globalAlpha = a;
    ctx.shadowColor = 'rgba(249,217,118,0.6)';
    ctx.shadowBlur = r * 3;
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
}

function drawHalo(ctx: SKRSContext2D): void {
  // Soft gold halo behind the avatar
  const halo = ctx.createRadialGradient(AV_X, AV_Y, AV_R * 0.6, AV_X, AV_Y, AV_R + 110);
  halo.addColorStop(0, 'rgba(230,184,92,0.16)');
  halo.addColorStop(0.5, 'rgba(230,184,92,0.05)');
  halo.addColorStop(1, 'rgba(230,184,92,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(AV_X - AV_R - 130, AV_Y - AV_R - 130, (AV_R + 130) * 2, (AV_R + 130) * 2);
}

async function drawAvatar(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const cx = AV_X;
  const cy = AV_Y;
  const r = AV_R;

  // Outer thin gold ring
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 22, 0, Math.PI * 2);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(230,184,92,0.55)';
  ctx.stroke();
  ctx.restore();

  // Thick inner ring with gold gradient + glow
  ctx.save();
  const ringGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  ringGrad.addColorStop(0, GOLD_LIGHT);
  ringGrad.addColorStop(0.5, GOLD);
  ringGrad.addColorStop(1, GOLD_DARK);
  ctx.beginPath();
  ctx.arc(cx, cy, r + 9, 0, Math.PI * 2);
  ctx.lineWidth = 7;
  ctx.strokeStyle = ringGrad;
  ctx.shadowColor = 'rgba(230,184,92,0.55)';
  ctx.shadowBlur = 28;
  ctx.stroke();
  ctx.restore();

  // Circular avatar (real image, or the deliberate placeholder with the member initial).
  const img = await loadAvatar(d.avatarUrl);
  drawCircularAvatarInto(ctx, img, d.username, cx, cy, r);
}

function drawText(
  ctx: SKRSContext2D,
  d: WelcomeCardData,
  greeting: string,
  subtitle: string,
): void {
  const textRight = 800; // right edge of text column (left of avatar)

  // Greeting (gold, large) — brighter gradient that catches the light on the right.
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 58px Cairo';
  const gGrad = ctx.createLinearGradient(textRight - 380, 0, textRight, 0);
  gGrad.addColorStop(0, GOLD);
  gGrad.addColorStop(0.45, GOLD_LIGHT);
  gGrad.addColorStop(0.7, '#fff0c2');
  gGrad.addColorStop(1, GOLD_LIGHT);
  ctx.fillStyle = gGrad;
  ctx.shadowColor = 'rgba(230,184,92,0.45)';
  ctx.shadowBlur = 22;
  ctx.fillText(greeting, textRight, 142);
  ctx.shadowBlur = 0;

  // Username (white bold) — the hero line.
  ctx.font = 'bold 84px Cairo';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 12;
  ctx.fillText(truncate(d.username, 20), textRight, 240);
  ctx.shadowBlur = 0;

  // Ornament: thin gold line broken by a rotated diamond (orange accent).
  const ornY = 278;
  const ornLeft = textRight - 330;
  const ornRight = textRight;
  const midX = (ornLeft + ornRight) / 2;
  const diamondHalf = 8;

  const ornGrad = ctx.createLinearGradient(ornLeft, 0, ornRight, 0);
  ornGrad.addColorStop(0, 'rgba(230,184,92,0.05)');
  ornGrad.addColorStop(0.5, 'rgba(230,184,92,0.85)');
  ornGrad.addColorStop(1, 'rgba(230,184,92,0.05)');
  ctx.strokeStyle = ornGrad;
  ctx.lineWidth = 1.5;
  // left segment
  ctx.beginPath();
  ctx.moveTo(ornLeft, ornY);
  ctx.lineTo(midX - diamondHalf - 7, ornY);
  ctx.stroke();
  // right segment
  ctx.beginPath();
  ctx.moveTo(midX + diamondHalf + 7, ornY);
  ctx.lineTo(ornRight, ornY);
  ctx.stroke();
  // small gold flanking pips
  ctx.fillStyle = 'rgba(230,184,92,0.8)';
  [midX - diamondHalf - 18, midX + diamondHalf + 18].forEach((px) => {
    ctx.beginPath();
    ctx.arc(px, ornY, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // center diamond (orange accent — the single brand touch)
  ctx.save();
  ctx.translate(midX, ornY);
  ctx.rotate(Math.PI / 4);
  ctx.fillStyle = ORANGE;
  ctx.shadowColor = 'rgba(245,124,0,0.85)';
  ctx.shadowBlur = 16;
  ctx.fillRect(-diamondHalf, -diamondHalf, diamondHalf * 2, diamondHalf * 2);
  // inner gold highlight on the diamond
  ctx.fillStyle = 'rgba(249,217,118,0.55)';
  ctx.shadowBlur = 0;
  ctx.fillRect(-diamondHalf * 0.4, -diamondHalf * 0.4, diamondHalf * 0.8, diamondHalf * 0.8);
  ctx.restore();
  ctx.shadowBlur = 0;

  // Subtitle (gold)
  ctx.font = '30px Cairo';
  ctx.fillStyle = GOLD;
  ctx.shadowColor = 'rgba(230,184,92,0.25)';
  ctx.shadowBlur = 8;
  ctx.fillText(subtitle, textRight, 328);
  ctx.shadowBlur = 0;
}
