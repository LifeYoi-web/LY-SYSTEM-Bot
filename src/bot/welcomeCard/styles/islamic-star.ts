import { type SKRSContext2D } from '@napi-rs/canvas';
import { WIDTH, HEIGHT, truncate, loadAvatar, makeRng, type WelcomeCardData } from '../helpers';

// Geometric Heritage — 8-fold Islamic star lattice, museum luxury.
// Ported faithfully from welcome-previews/islamic-star.js (owner-approved look).

const W = WIDTH;
const H = HEIGHT;

const GOLD = '#d4af37';
const GOLD_BRIGHT = '#f0d98c';
const ORANGE_C = '#f57c00';
const BG = '#0a0e1a';
const WHITE = '#ffffff';

/** Geometric Heritage: deep midnight bg, gold star-and-cross tessellation, 8-point avatar frame. */
export async function drawIslamicStar(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  // Deterministic RNG seed (preview used no RNG → default 1337). Kept for contract parity.
  makeRng(1337);

  drawBackground(ctx);
  drawTessellation(ctx);
  drawInnerFrame(ctx);
  drawCornerOrnaments(ctx);
  await drawAvatar(ctx, d);
  drawText(ctx, d);
}

// ----------------------------------------------------------------------------
// 1. Deep midnight background with a soft radial vignette + subtle warm core
// ----------------------------------------------------------------------------
function drawBackground(ctx: SKRSContext2D): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // museum spotlight toward upper-center-left (text side) so text pops
  const g = ctx.createRadialGradient(430, 130, 40, 430, 190, 820);
  g.addColorStop(0, 'rgba(38, 47, 72, 0.7)');
  g.addColorStop(0.45, 'rgba(20, 27, 46, 0.4)');
  g.addColorStop(1, 'rgba(10, 14, 26, 0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // edge vignette for museum framing
  const v = ctx.createRadialGradient(W / 2, H / 2 - 20, 220, W / 2, H / 2, 740);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.58)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  // a touch heavier grounding shadow along the bottom edge
  const floor = ctx.createLinearGradient(0, H - 90, 0, H);
  floor.addColorStop(0, 'rgba(0,0,0,0)');
  floor.addColorStop(1, 'rgba(0,0,0,0.4)');
  ctx.fillStyle = floor;
  ctx.fillRect(0, H - 90, W, 90);
}

// ----------------------------------------------------------------------------
// 2. Islamic star-and-cross tessellation in thin gold lines.
// ----------------------------------------------------------------------------
function eightPointStarPath(ctx: SKRSContext2D, cx: number, cy: number, r: number): void {
  ctx.beginPath();
  const outer = r;
  const inner = r * 0.414; // tan(22.5deg) ~ ratio that yields crisp 8-point star
  for (let i = 0; i < 16; i++) {
    const ang = (Math.PI / 8) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? outer : inner;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function drawTessellation(ctx: SKRSContext2D): void {
  ctx.save();
  const cell = 140;
  const r = cell * 0.5; // star reaches the cell edge so points kiss neighbours

  // Pass A: the 8-pointed stars on the grid nodes.
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.085)';
  ctx.lineWidth = 1;
  for (let row = -1; row * cell - cell / 2 < H + cell; row++) {
    for (let col = -1; col * cell - cell / 2 < W + cell; col++) {
      const cx = col * cell;
      const cy = row * cell;
      eightPointStarPath(ctx, cx, cy, r);
      ctx.stroke();
    }
  }

  // Pass B: the "cross" — a rotated square in each cell centre.
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.06)';
  for (let row = -1; row * cell - cell / 2 < H + cell; row++) {
    for (let col = -1; col * cell - cell / 2 < W + cell; col++) {
      const mx = col * cell + cell / 2;
      const my = row * cell + cell / 2;
      const s = cell * 0.235;
      ctx.beginPath();
      ctx.moveTo(mx, my - s);
      ctx.lineTo(mx + s, my);
      ctx.lineTo(mx, my + s);
      ctx.lineTo(mx - s, my);
      ctx.closePath();
      ctx.stroke();
    }
  }
  ctx.restore();
}

// ----------------------------------------------------------------------------
// 3. Delicate corner ornaments — a quarter-star fan of radiating gold lines.
// ----------------------------------------------------------------------------
function cornerOrnament(ctx: SKRSContext2D, ox: number, oy: number, rotation: number): void {
  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(rotation);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
  ctx.lineWidth = 1.1;
  const rays = 5;
  const len = 46;
  for (let i = 0; i <= rays; i++) {
    const ang = (Math.PI / 2) * (i / rays); // 0..90deg fan
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * len, Math.sin(ang) * len);
    ctx.stroke();
  }
  // two concentric arcs binding the fan
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
  ctx.beginPath();
  ctx.arc(0, 0, len, 0, Math.PI / 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
  ctx.beginPath();
  ctx.arc(0, 0, len * 0.6, 0, Math.PI / 2);
  ctx.stroke();
  // a tiny gold dot at the pivot
  ctx.fillStyle = 'rgba(212, 175, 55, 0.7)';
  ctx.beginPath();
  ctx.arc(0, 0, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawCornerOrnaments(ctx: SKRSContext2D): void {
  const m = 26;
  cornerOrnament(ctx, m, m, 0); // top-left fan opens into card
  cornerOrnament(ctx, W - m, m, Math.PI / 2); // top-right
  cornerOrnament(ctx, W - m, H - m, Math.PI); // bottom-right
  cornerOrnament(ctx, m, H - m, -Math.PI / 2); // bottom-left
}

// thin gold frame inset, like a museum mat
function drawInnerFrame(ctx: SKRSContext2D): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.32)';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(16, 16, W - 32, H - 32);
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.14)';
  ctx.lineWidth = 1;
  ctx.strokeRect(22, 22, W - 44, H - 44);
  ctx.restore();
}

// ----------------------------------------------------------------------------
// 4. Avatar inside an 8-pointed star frame (two squares 45deg apart).
// ----------------------------------------------------------------------------
function drawSquare(ctx: SKRSContext2D, cx: number, cy: number, half: number, rot: number): void {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  ctx.beginPath();
  ctx.rect(-half, -half, half * 2, half * 2);
  ctx.restore();
}

async function drawAvatar(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const cx = W - 230;
  const cy = H / 2;
  const R = 118; // half-diagonal of star squares
  const avatarR = 82;

  // --- orange glow halo behind the whole emblem (soft radial, not a blob) ---
  ctx.save();
  const halo = ctx.createRadialGradient(cx, cy, avatarR, cx, cy, R + 36);
  halo.addColorStop(0, 'rgba(245, 124, 0, 0.22)');
  halo.addColorStop(0.55, 'rgba(245, 124, 0, 0.09)');
  halo.addColorStop(1, 'rgba(245, 124, 0, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(cx, cy, R + 36, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // --- the 8-pointed star frame: two squares rotated 45deg apart ---
  // square half-side so its corners reach radius R
  const half = R / Math.SQRT2;

  // glow underlay: stroke the squares with a wide orange glow first
  ctx.save();
  ctx.shadowColor = ORANGE_C;
  ctx.shadowBlur = 26;
  ctx.strokeStyle = 'rgba(245, 124, 0, 0.55)';
  ctx.lineWidth = 5;
  drawSquare(ctx, cx, cy, half, 0);
  ctx.stroke();
  drawSquare(ctx, cx, cy, half, Math.PI / 4);
  ctx.stroke();
  ctx.restore();

  // main gold star frame — substantial, with a soft gold glow
  ctx.save();
  ctx.shadowColor = 'rgba(240, 217, 140, 0.9)';
  ctx.shadowBlur = 12;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 3.4;
  ctx.lineJoin = 'miter';
  drawSquare(ctx, cx, cy, half, 0);
  ctx.stroke();
  drawSquare(ctx, cx, cy, half, Math.PI / 4);
  ctx.stroke();
  ctx.restore();

  // a second, brighter hairline inside for a crisp metallic gold edge
  ctx.save();
  ctx.strokeStyle = GOLD_BRIGHT;
  ctx.lineWidth = 1.1;
  drawSquare(ctx, cx, cy, half, 0);
  ctx.stroke();
  drawSquare(ctx, cx, cy, half, Math.PI / 4);
  ctx.stroke();
  ctx.restore();

  // woven filigree: thin gold spokes from each star point to the avatar ring
  ctx.save();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const ang = (Math.PI / 4) * i;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(ang) * (avatarR + 8), cy + Math.sin(ang) * (avatarR + 8));
    ctx.lineTo(cx + Math.cos(ang) * (R - 6), cy + Math.sin(ang) * (R - 6));
    ctx.stroke();
  }
  ctx.restore();

  // tiny gold dots at the 8 outer star points
  ctx.save();
  ctx.fillStyle = GOLD_BRIGHT;
  for (let i = 0; i < 8; i++) {
    const ang = (Math.PI / 4) * i;
    const px = cx + Math.cos(ang) * R;
    const py = cy + Math.sin(ang) * R;
    ctx.beginPath();
    ctx.arc(px, py, 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // thin gold ring hugging the avatar circle
  ctx.save();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, avatarR + 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // --- avatar clipped to a circle (real image cover-fit, else placeholder) ---
  const img = await loadAvatar(d.avatarUrl);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avatarR, 0, Math.PI * 2);
  ctx.clip();

  if (img) {
    // cover-fit the real avatar within the circle's bounding box
    ctx.drawImage(img, cx - avatarR, cy - avatarR, avatarR * 2, avatarR * 2);
  } else {
    // placeholder in the same visual language as the approved preview
    const ag = ctx.createRadialGradient(cx - 28, cy - 34, 14, cx, cy, avatarR + 18);
    ag.addColorStop(0, '#2a2f3a');
    ag.addColorStop(1, '#11141a');
    ctx.fillStyle = ag;
    ctx.fillRect(cx - avatarR, cy - avatarR, avatarR * 2, avatarR * 2);

    // faint inner geometric texture (mini 8-point star rings) to feel deliberate
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.10)';
    ctx.lineWidth = 1;
    eightPointStarPath(ctx, cx, cy, avatarR * 0.92);
    ctx.stroke();
    eightPointStarPath(ctx, cx, cy, avatarR * 0.58);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.beginPath();
    ctx.arc(cx, cy, avatarR * 0.74, 0, Math.PI * 2);
    ctx.stroke();

    // bold white initial
    ctx.fillStyle = WHITE;
    ctx.font = 'bold 100px Cairo';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 10;
    ctx.fillText((d.username.trim()[0] ?? 'L').toUpperCase(), cx, cy + 4);
  }
  ctx.restore();

  // subtle top-light sheen across the avatar glass
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avatarR, 0, Math.PI * 2);
  ctx.clip();
  const sheen = ctx.createLinearGradient(cx, cy - avatarR, cx, cy);
  sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(cx - avatarR, cy - avatarR, avatarR * 2, avatarR);
  ctx.restore();
}

// ----------------------------------------------------------------------------
// 5. Text block — RTL, right-aligned against the avatar emblem.
// ----------------------------------------------------------------------------
function drawText(ctx: SKRSContext2D, d: WelcomeCardData): void {
  const rightEdge = W - 400; // text right margin, clear of the emblem
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  const greeting = d.variant === 'goodbye' ? 'وداعًا' : 'أهلًا وسهلًا';
  const subtitle =
    d.variant === 'goodbye'
      ? truncate(d.serverName, 28)
      : `العضو رقم #${d.position} · ${truncate(d.serverName, 20)}`;

  // small decorative gold diamond + rule above the greeting
  ctx.save();
  ctx.fillStyle = GOLD;
  const dy = 96;
  const dx = rightEdge - 2;
  ctx.beginPath();
  ctx.moveTo(dx, dy - 6);
  ctx.lineTo(dx + 6, dy);
  ctx.lineTo(dx, dy + 6);
  ctx.lineTo(dx - 6, dy);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(rightEdge - 18, dy);
  ctx.lineTo(rightEdge - 188, dy);
  ctx.stroke();
  ctx.restore();

  // greeting — gold, with a faint glow
  ctx.save();
  ctx.fillStyle = GOLD_BRIGHT;
  ctx.font = '40px Cairo';
  ctx.shadowColor = 'rgba(212, 175, 55, 0.35)';
  ctx.shadowBlur = 12;
  ctx.fillText(greeting, rightEdge, 152);
  ctx.restore();

  // name — white bold, large
  ctx.save();
  ctx.fillStyle = WHITE;
  ctx.font = 'bold 78px Cairo';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 10;
  ctx.fillText(truncate(d.username, 20), rightEdge, 236);
  ctx.restore();

  // subtitle inside a thin gold-stroked pill
  drawSubtitlePill(ctx, rightEdge, 272, subtitle);
}

function drawSubtitlePill(ctx: SKRSContext2D, rightEdge: number, top: number, subtitle: string): void {
  ctx.font = '26px Cairo';
  const textW = ctx.measureText(subtitle).width;
  const padX = 24;
  const pillH = 46;
  const pillW = textW + padX * 2;
  const pillRight = rightEdge + 4;
  const pillLeft = pillRight - pillW;
  const r = pillH / 2;

  ctx.save();
  // pill body — very dark glass
  ctx.beginPath();
  ctx.moveTo(pillLeft + r, top);
  ctx.lineTo(pillRight - r, top);
  ctx.arc(pillRight - r, top + r, r, -Math.PI / 2, Math.PI / 2);
  ctx.lineTo(pillLeft + r, top + pillH);
  ctx.arc(pillLeft + r, top + r, r, Math.PI / 2, -Math.PI / 2);
  ctx.closePath();
  ctx.fillStyle = 'rgba(16, 22, 38, 0.7)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
  ctx.lineWidth = 1.3;
  ctx.stroke();
  ctx.restore();

  // subtitle text — muted gold, the #N stays inline (RTL handled by engine)
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c9b88a';
  ctx.font = '26px Cairo';
  ctx.fillText(subtitle, pillRight - padX, top + pillH / 2 + 1);
  ctx.restore();
}
