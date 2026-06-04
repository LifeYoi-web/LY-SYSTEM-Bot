import { type SKRSContext2D } from '@napi-rs/canvas';
import {
  WIDTH,
  HEIGHT,
  ORANGE,
  truncate,
  loadAvatar,
  drawCircularAvatarInto,
  makeRng,
  type WelcomeCardData,
} from '../helpers';

// Constellation — "a star joined our sky" cosmic welcome card.
// Faithful port of welcome-previews/constellation.js (1200x400 night-sky scene:
// nebula clouds, ~140 stars + cross flares, a shooting star, a ringed avatar planet
// on the right, and a constellation crown above the RTL text block).

const W = WIDTH;
const H = HEIGHT;

// Avatar planet geometry (shared by the framing + the avatar draw).
const CX = 970;
const CY = H / 2;
const R = 118; // planet radius
const RING_RX = 200;
const RING_RY = 64;
const TILT = (-20 * Math.PI) / 180;

export async function drawConstellation(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const rng = makeRng(1337);
  const range = (a: number, b: number) => a + (b - a) * rng();

  drawNightSky(ctx);
  drawNebulae(ctx);
  drawStars(ctx, range);
  drawShootingStar(ctx);
  await drawPlanet(ctx, d);
  drawText(ctx, d);
}

// =====================================================================
// 1. NIGHT SKY BACKGROUND
// =====================================================================
function drawNightSky(ctx: SKRSContext2D): void {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#05060e');
  sky.addColorStop(0.55, '#090c1c');
  sky.addColorStop(1, '#0d1226');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  // cool horizon glow at the very bottom
  const horizon = ctx.createLinearGradient(0, H - 130, 0, H);
  horizon.addColorStop(0, 'rgba(70,110,180,0)');
  horizon.addColorStop(1, 'rgba(80,130,210,0.20)');
  ctx.fillStyle = horizon;
  ctx.fillRect(0, H - 130, W, 130);
}

// faint nebula clouds for depth (cool violet-blue + a warm orange whisper)
function nebula(ctx: SKRSContext2D, x: number, y: number, rx: number, ry: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.scale(1, ry / rx);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawNebulae(ctx: SKRSContext2D): void {
  nebula(ctx, 330, 150, 360, 230, 'rgba(60,80,170,0.16)');
  nebula(ctx, 150, 330, 300, 200, 'rgba(90,70,150,0.10)');
  nebula(ctx, 640, 250, 280, 180, 'rgba(80,100,190,0.08)');
}

// =====================================================================
// 2. STARS (~140), with ~8 cross flares
// =====================================================================
interface Star {
  x: number;
  y: number;
  r: number;
  a: number;
}

function drawStarDot(ctx: SKRSContext2D, x: number, y: number, r: number, a: number): void {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.fill();
}

function drawStars(ctx: SKRSContext2D, range: (a: number, b: number) => number): void {
  const stars: Star[] = [];
  for (let i = 0; i < 140; i++) {
    stars.push({
      x: range(0, W),
      y: range(0, H),
      r: range(0.4, 1.8),
      a: range(0.15, 0.9),
    });
  }
  for (const s of stars) drawStarDot(ctx, s.x, s.y, s.r, s.a);

  // 8 cross flares on the brightest-ish stars
  ctx.save();
  const flareStars = stars.slice().sort((p, q) => q.a - p.a).slice(0, 8);
  for (const s of flareStars) {
    const len = range(6, 14);
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.7, s.a)})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(s.x - len, s.y);
    ctx.lineTo(s.x + len, s.y);
    ctx.moveTo(s.x, s.y - len);
    ctx.lineTo(s.x, s.y + len);
    ctx.stroke();
  }
  ctx.restore();
}

// =====================================================================
// 3. SHOOTING STAR (~200px diagonal streak)
// =====================================================================
function drawShootingStar(ctx: SKRSContext2D): void {
  const x1 = 120;
  const y1 = 70;
  const x2 = x1 + 200 * Math.cos(Math.PI / 7);
  const y2 = y1 + 200 * Math.sin(Math.PI / 7);
  const g = ctx.createLinearGradient(x1, y1, x2, y2);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(255,255,255,0.9)');
  ctx.save();
  ctx.strokeStyle = g;
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // bright head
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x2, y2, 2.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// =====================================================================
// 4. AVATAR PLANET on the RIGHT, with tilted ring (back / front halves)
// =====================================================================
function ringGradient(ctx: SKRSContext2D, alphaMul?: number) {
  const a = alphaMul == null ? 1 : alphaMul;
  const g = ctx.createLinearGradient(CX - RING_RX, CY, CX + RING_RX, CY);
  g.addColorStop(0.0, `rgba(245,124,0,${0.06 * a})`);
  g.addColorStop(0.18, `rgba(245,124,0,${0.62 * a})`);
  g.addColorStop(0.42, `rgba(255,176,77,${1.0 * a})`);
  g.addColorStop(0.6, `rgba(255,212,155,${1.0 * a})`);
  g.addColorStop(0.82, `rgba(245,124,0,${0.7 * a})`);
  g.addColorStop(1.0, `rgba(245,150,40,${0.18 * a})`);
  return g;
}

// draw ring half: which = "back" (top arc) or "front" (bottom arc)
function drawRingHalf(ctx: SKRSContext2D, which: 'back' | 'front'): void {
  ctx.save();
  ctx.translate(CX, CY);
  ctx.rotate(TILT);

  // soft wide glow underlay
  ctx.strokeStyle = ringGradient(ctx, 0.5);
  ctx.lineWidth = 16;
  ctx.shadowColor = 'rgba(245,124,0,0.85)';
  ctx.shadowBlur = 26;
  ctx.beginPath();
  if (which === 'back') ctx.ellipse(0, 0, RING_RX, RING_RY, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, RING_RX, RING_RY, 0, 0, Math.PI);
  ctx.stroke();

  // crisp core band
  ctx.shadowBlur = 10;
  ctx.strokeStyle = ringGradient(ctx, 1);
  ctx.lineWidth = 7;
  ctx.beginPath();
  if (which === 'back') ctx.ellipse(0, 0, RING_RX, RING_RY, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, RING_RX, RING_RY, 0, 0, Math.PI);
  ctx.stroke();

  // thin bright highlight line on the inner edge for a premium double-band feel
  ctx.shadowBlur = 0;
  ctx.strokeStyle = `rgba(255,224,180,${which === 'front' ? 0.9 : 0.5})`;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  if (which === 'back') ctx.ellipse(0, 0, RING_RX - 11, RING_RY - 4, 0, Math.PI, Math.PI * 2);
  else ctx.ellipse(0, 0, RING_RX - 11, RING_RY - 4, 0, 0, Math.PI);
  ctx.stroke();

  ctx.restore();
}

async function drawPlanet(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  // 4a. back half of ring
  drawRingHalf(ctx, 'back');

  // 4b. planet glow halo
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R + 8, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(120,150,255,0.35)';
  ctx.shadowBlur = 30;
  ctx.fillStyle = 'rgba(20,26,46,0.9)';
  ctx.fill();
  ctx.restore();

  // 4c. avatar (real image, or the deliberate planet placeholder), clipped to circle
  const img = await loadAvatar(d.avatarUrl);
  if (img) {
    drawCircularAvatarInto(ctx, img, d.username, CX, CY, R);
  } else {
    drawPlanetPlaceholder(ctx, d);
  }

  // avatar rim: cool top-left highlight + warm orange bottom rim (catches the ring light)
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.lineWidth = 2;
  ctx.stroke();

  const rim = ctx.createLinearGradient(CX, CY - R, CX, CY + R);
  rim.addColorStop(0, 'rgba(180,200,255,0.0)');
  rim.addColorStop(0.7, 'rgba(245,124,0,0.0)');
  rim.addColorStop(1, 'rgba(255,170,70,0.55)');
  ctx.beginPath();
  ctx.arc(CX, CY, R - 1, 0, Math.PI * 2);
  ctx.strokeStyle = rim;
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();

  // 4d. front half of ring (passes in front at the bottom)
  drawRingHalf(ctx, 'front');
}

// Deliberate placeholder reproducing the preview planet look, in the helper's
// visual language (radial dark gradient + bold white member initial).
function drawPlanetPlaceholder(ctx: SKRSContext2D, d: WelcomeCardData): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(CX, CY, R, 0, Math.PI * 2);
  ctx.clip();

  const av = ctx.createRadialGradient(CX - 38, CY - 46, 16, CX + 6, CY + 10, R + 26);
  av.addColorStop(0, '#3e4759');
  av.addColorStop(0.5, '#262d3d');
  av.addColorStop(1, '#10141d');
  ctx.fillStyle = av;
  ctx.fillRect(CX - R, CY - R, R * 2, R * 2);

  // faint inner geometric texture (concentric rings)
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  for (let rr = 24; rr < R; rr += 22) {
    ctx.beginPath();
    ctx.arc(CX, CY, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // terminator shading: darken the lower-right to read as a lit sphere
  const term = ctx.createRadialGradient(CX - 50, CY - 55, 30, CX + 40, CY + 50, R + 10);
  term.addColorStop(0, 'rgba(0,0,0,0)');
  term.addColorStop(0.65, 'rgba(0,0,0,0)');
  term.addColorStop(1, 'rgba(0,0,0,0.38)');
  ctx.fillStyle = term;
  ctx.fillRect(CX - R, CY - R, R * 2, R * 2);

  // soft specular sheen upper-left to round out the sphere
  const spec = ctx.createRadialGradient(CX - 46, CY - 50, 4, CX - 46, CY - 50, 90);
  spec.addColorStop(0, 'rgba(190,205,255,0.20)');
  spec.addColorStop(1, 'rgba(190,205,255,0)');
  ctx.fillStyle = spec;
  ctx.fillRect(CX - R, CY - R, R * 2, R * 2);

  // bold white member initial
  ctx.save();
  ctx.shadowColor = 'rgba(120,150,255,0.35)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 100px Cairo';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText((d.username.trim()[0] ?? 'L').toUpperCase(), CX, CY + 4);
  ctx.restore();

  ctx.restore();
}

// =====================================================================
// 5. CONSTELLATION CROWN above the username
// =====================================================================
function drawCrown(ctx: SKRSContext2D, centerX: number, baseY: number): void {
  // abstract crown: a baseline of dots with three rising peaks
  const pts: Array<[number, number]> = [
    [centerX - 96, baseY + 10], // left base
    [centerX - 58, baseY - 22], // left peak
    [centerX - 30, baseY + 6], // valley
    [centerX, baseY - 38], // center crown peak (tallest)
    [centerX + 30, baseY + 6], // valley
    [centerX + 58, baseY - 22], // right peak
    [centerX + 96, baseY + 10], // right base
  ];
  ctx.save();
  // connecting lines
  ctx.strokeStyle = 'rgba(220,228,255,0.32)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
  // base connector linking the two feet for a closed crown silhouette
  ctx.strokeStyle = 'rgba(220,228,255,0.14)';
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  ctx.lineTo(pts[6][0], pts[6][1]);
  ctx.stroke();
  // dots — peaks brighter/bigger than valleys
  const big = new Set([1, 3, 5]);
  pts.forEach(([px, py], i) => {
    ctx.beginPath();
    ctx.shadowColor = 'rgba(255,255,255,0.85)';
    ctx.shadowBlur = big.has(i) ? 10 : 6;
    ctx.fillStyle = '#ffffff';
    ctx.arc(px, py, big.has(i) ? 3.0 : 2.0, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

// =====================================================================
// 6. TEXT BLOCK (left, RTL right-aligned)
// =====================================================================
function drawText(ctx: SKRSContext2D, d: WelcomeCardData): void {
  const textRight = 560; // right edge for the left-side text block

  drawCrown(ctx, textRight - 95, 110);

  // greeting (muted) — "أهلًا وسهلًا" or "وداعًا"
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(200,210,235,0.7)';
  ctx.font = '600 30px Cairo';
  ctx.fillText(d.variant === 'goodbye' ? 'وداعًا' : 'أهلًا وسهلًا', textRight, 180);
  ctx.restore();

  // name (white, soft glow)
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 72px Cairo';
  ctx.shadowColor = 'rgba(255,255,255,0.45)';
  ctx.shadowBlur = 18;
  ctx.fillText(truncate(d.username, 20), textRight, 250);
  ctx.restore();

  // subtitle (orange) — "العضو رقم #N · {server}" or just the server name for goodbye
  ctx.save();
  ctx.textAlign = 'right';
  ctx.fillStyle = ORANGE;
  ctx.font = '600 26px Cairo';
  const sub =
    d.variant === 'goodbye'
      ? truncate(d.serverName, 36)
      : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 42);
  ctx.fillText(sub, textRight, 295);
  ctx.restore();
}
