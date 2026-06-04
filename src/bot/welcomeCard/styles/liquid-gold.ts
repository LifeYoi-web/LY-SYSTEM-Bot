import { type SKRSContext2D } from '@napi-rs/canvas';
import {
  WIDTH,
  HEIGHT,
  truncate,
  loadAvatar,
  drawCircularAvatarInto,
  makeRng,
  type WelcomeCardData,
} from '../helpers';

// Liquid Gold — metallic ribbons on black, perfume-ad luxury.
// Faithful port of welcome-previews/liquid-gold.js onto a provided context.

type Pt = [number, number];
type Edge = [Pt, Pt, Pt, Pt]; // start, c1, c2, end

/** The original preview's deterministic seed, so re-renders stay stable. */
const SEED = 20260604;

// avatar geometry (matches the preview)
const AV_X = 992;
const AV_Y = 198;
const AV_R = 104;

export async function drawLiquidGold(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const rnd = makeRng(SEED);

  drawBackground(ctx);

  // 2. RIBBON A — flowing band that passes BEHIND the avatar (drawn first)
  // main mid ribbon, sweeping up-right and dipping behind the avatar
  ribbon(
    ctx,
    [
      [-80, 150],
      [300, 60],
      [720, 175],
      [1300, 70],
    ],
    [
      [-80, 196],
      [300, 110],
      [720, 226],
      [1300, 122],
    ],
    150,
    226,
    0.6,
    true,
  );

  // a slimmer top ribbon, clearly separated above the main one
  ribbon(
    ctx,
    [
      [-80, 58],
      [360, 96],
      [840, 28],
      [1300, 92],
    ],
    [
      [-80, 78],
      [360, 118],
      [840, 50],
      [1300, 116],
    ],
    58,
    118,
    0.5,
    false,
  );

  // particles in the upper band (behind avatar)
  particles(ctx, rnd, 26, 36, 250);

  // 3. AVATAR — gold ring + warm glow, real avatar (or deliberate placeholder)
  await drawAvatar(ctx, d);

  // 4. RIBBON B — clearly crosses IN FRONT of the avatar's lower quarter
  ribbon(
    ctx,
    [
      [-80, 300],
      [300, 252],
      [780, 236],
      [1300, 300],
    ],
    [
      [-80, 348],
      [300, 302],
      [780, 296],
      [1300, 352],
    ],
    300,
    352,
    0.62,
    true,
  );

  // faint gold caustic pooling under the avatar to tie it to the liquid theme
  ctx.save();
  const pool = ctx.createRadialGradient(AV_X, AV_Y + 110, 4, AV_X, AV_Y + 110, 130);
  pool.addColorStop(0, 'rgba(249, 217, 118, 0.20)');
  pool.addColorStop(1, 'rgba(249, 217, 118, 0)');
  ctx.fillStyle = pool;
  ctx.beginPath();
  ctx.ellipse(AV_X, AV_Y + 112, 120, 26, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // particles riding the lower ribbon (in front)
  particles(ctx, rnd, 20, 268, 372);

  // 5. TEXT — RTL, right-aligned column placed in the clear black gap
  drawText(ctx, d);

  // 6. film grain
  drawGrain(ctx, rnd);
}

// ---------------------------------------------------------------------------
// 1. BACKGROUND — near-black with a warm vignette
// ---------------------------------------------------------------------------
function drawBackground(ctx: SKRSContext2D): void {
  ctx.fillStyle = '#070707';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const warm = ctx.createRadialGradient(960, 175, 30, 960, 200, 720);
  warm.addColorStop(0, 'rgba(125, 80, 14, 0.42)');
  warm.addColorStop(0.42, 'rgba(70, 45, 6, 0.15)');
  warm.addColorStop(1, 'rgba(7, 7, 7, 0)');
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const vig = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 180, WIDTH / 2, HEIGHT / 2, 780);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

// ---------------------------------------------------------------------------
// ribbon helpers
// ---------------------------------------------------------------------------
// Build the closed ribbon path from a top edge + bottom edge (each: start,c1,c2,end).
function ribbonPath(ctx: SKRSContext2D, top: Edge, bot: Edge): void {
  ctx.beginPath();
  ctx.moveTo(top[0][0], top[0][1]);
  ctx.bezierCurveTo(top[1][0], top[1][1], top[2][0], top[2][1], top[3][0], top[3][1]);
  ctx.lineTo(bot[3][0], bot[3][1]);
  ctx.bezierCurveTo(bot[2][0], bot[2][1], bot[1][0], bot[1][1], bot[0][0], bot[0][1]);
  ctx.closePath();
}

// A liquid-metal ribbon: cross-width gold gradient + bright sheen line.
// orange = true folds LY orange in as the hot stop on this ribbon.
function ribbon(
  ctx: SKRSContext2D,
  top: Edge,
  bot: Edge,
  fillY0: number,
  fillY1: number,
  sheenAlpha: number,
  orange: boolean,
): void {
  ctx.save();
  ribbonPath(ctx, top, bot);

  const g = ctx.createLinearGradient(0, fillY0, 0, fillY1);
  g.addColorStop(0.0, '#2c1d00');
  g.addColorStop(0.14, '#7a5000');
  g.addColorStop(0.34, '#e8c463');
  g.addColorStop(0.46, '#fff6cf'); // bright sheen core
  g.addColorStop(0.5, '#ffffff');
  g.addColorStop(0.56, '#f9d976');
  g.addColorStop(orange ? 0.7 : 0.72, orange ? '#f57c00' : '#c98a14'); // hot stop
  g.addColorStop(0.86, '#6e4700');
  g.addColorStop(1.0, '#2c1d00');
  ctx.fillStyle = g;
  ctx.fill();

  // sheen highlight curve near the top quarter of the band
  const t = 0.26;
  const L = (a: number, b: number) => a + (b - a) * t;
  ctx.beginPath();
  ctx.moveTo(L(top[0][0], bot[0][0]), L(top[0][1], bot[0][1]));
  ctx.bezierCurveTo(
    L(top[1][0], bot[1][0]),
    L(top[1][1], bot[1][1]),
    L(top[2][0], bot[2][0]),
    L(top[2][1], bot[2][1]),
    L(top[3][0], bot[3][0]),
    L(top[3][1], bot[3][1]),
  );
  ctx.strokeStyle = `rgba(255, 250, 226, ${sheenAlpha})`;
  ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(255, 232, 165, 0.55)';
  ctx.shadowBlur = 9;
  ctx.stroke();

  // a second, lower faint sheen for a rolled-metal feel
  const t2 = 0.74;
  const L2 = (a: number, b: number) => a + (b - a) * t2;
  ctx.beginPath();
  ctx.moveTo(L2(top[0][0], bot[0][0]), L2(top[0][1], bot[0][1]));
  ctx.bezierCurveTo(
    L2(top[1][0], bot[1][0]),
    L2(top[1][1], bot[1][1]),
    L2(top[2][0], bot[2][0]),
    L2(top[2][1], bot[2][1]),
    L2(top[3][0], bot[3][0]),
    L2(top[3][1], bot[3][1]),
  );
  ctx.strokeStyle = 'rgba(60, 38, 0, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.shadowBlur = 0;
  ctx.stroke();
  ctx.restore();
}

// gold particles within a vertical band
function particles(
  ctx: SKRSContext2D,
  rnd: () => number,
  count: number,
  yMin: number,
  yMax: number,
): void {
  for (let i = 0; i < count; i++) {
    const x = rnd() * WIDTH;
    const y = yMin + rnd() * (yMax - yMin);
    const r = 0.6 + rnd() * 2.0;
    const a = 0.22 + rnd() * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 224, 150, ${a})`;
    ctx.shadowColor = 'rgba(255, 200, 90, 0.9)';
    ctx.shadowBlur = 7 + rnd() * 6;
    ctx.fill();
  }
  ctx.shadowBlur = 0;
}

// ---------------------------------------------------------------------------
// 3. AVATAR — warm glow, gold ring, real image (or deliberate placeholder)
// ---------------------------------------------------------------------------
async function drawAvatar(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  // warm glow halo behind the disc
  ctx.save();
  ctx.beginPath();
  ctx.arc(AV_X, AV_Y, AV_R + 6, 0, Math.PI * 2);
  ctx.shadowColor = 'rgba(245, 200, 90, 0.9)';
  ctx.shadowBlur = 50;
  ctx.fillStyle = 'rgba(245, 180, 60, 0.12)';
  ctx.fill();
  ctx.restore();

  // gold ring
  ctx.save();
  const ring = ctx.createLinearGradient(AV_X - AV_R, AV_Y - AV_R, AV_X + AV_R, AV_Y + AV_R);
  ring.addColorStop(0, '#7a5000');
  ring.addColorStop(0.32, '#f9d976');
  ring.addColorStop(0.5, '#fff6cf');
  ring.addColorStop(0.68, '#f57c00');
  ring.addColorStop(1, '#5c3a00');
  ctx.beginPath();
  ctx.arc(AV_X, AV_Y, AV_R + 5, 0, Math.PI * 2);
  ctx.lineWidth = 6;
  ctx.strokeStyle = ring;
  ctx.shadowColor = 'rgba(255, 210, 110, 0.65)';
  ctx.shadowBlur = 16;
  ctx.stroke();
  ctx.restore();

  // avatar disc — real image cover-fit, or the preview's luxe placeholder
  const img = await loadAvatar(d.avatarUrl);
  if (img) {
    drawCircularAvatarInto(ctx, img, d.username, AV_X, AV_Y, AV_R);
    // warm gold rim-light from the bottom-right, on top of the photo,
    // hinting at the surrounding gold (kept from the preview)
    ctx.save();
    ctx.beginPath();
    ctx.arc(AV_X, AV_Y, AV_R, 0, Math.PI * 2);
    ctx.clip();
    const rim = ctx.createRadialGradient(AV_X + 55, AV_Y + 60, 8, AV_X + 55, AV_Y + 60, 150);
    rim.addColorStop(0, 'rgba(245, 180, 70, 0.22)');
    rim.addColorStop(1, 'rgba(245, 180, 70, 0)');
    ctx.fillStyle = rim;
    ctx.fillRect(AV_X - AV_R, AV_Y - AV_R, AV_R * 2, AV_R * 2);
    ctx.restore();
    return;
  }

  // ---- deliberate placeholder (faithful to the preview synthetic avatar) ----
  ctx.save();
  ctx.beginPath();
  ctx.arc(AV_X, AV_Y, AV_R, 0, Math.PI * 2);
  ctx.clip();

  const disc = ctx.createRadialGradient(AV_X - 28, AV_Y - 38, 18, AV_X, AV_Y, AV_R + 28);
  disc.addColorStop(0, '#39404e');
  disc.addColorStop(0.7, '#191d26');
  disc.addColorStop(1, '#0d1016');
  ctx.fillStyle = disc;
  ctx.fillRect(AV_X - AV_R, AV_Y - AV_R, AV_R * 2, AV_R * 2);

  // warm gold rim-light from the bottom-right
  const rim = ctx.createRadialGradient(AV_X + 55, AV_Y + 60, 8, AV_X + 55, AV_Y + 60, 150);
  rim.addColorStop(0, 'rgba(245, 180, 70, 0.22)');
  rim.addColorStop(1, 'rgba(245, 180, 70, 0)');
  ctx.fillStyle = rim;
  ctx.fillRect(AV_X - AV_R, AV_Y - AV_R, AV_R * 2, AV_R * 2);

  // faint inner geometric texture
  ctx.strokeStyle = 'rgba(245, 200, 110, 0.1)';
  ctx.lineWidth = 1;
  for (let rr = 24; rr < AV_R; rr += 17) {
    ctx.beginPath();
    ctx.arc(AV_X, AV_Y, rr, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let k = 0; k < 12; k++) {
    const ang = (k / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(AV_X, AV_Y);
    ctx.lineTo(AV_X + Math.cos(ang) * AV_R, AV_Y + Math.sin(ang) * AV_R);
    ctx.stroke();
  }

  // soft top-left sheen
  const sheen = ctx.createRadialGradient(AV_X - 42, AV_Y - 52, 5, AV_X - 42, AV_Y - 52, 125);
  sheen.addColorStop(0, 'rgba(255,255,255,0.12)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(AV_X - AV_R, AV_Y - AV_R, AV_R * 2, AV_R * 2);

  // bold white initial (member's first letter)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 100px Cairo';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 12;
  ctx.fillText((d.username.trim()[0] ?? 'L').toUpperCase(), AV_X, AV_Y + 4);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 5. TEXT — RTL, right-aligned column placed in the clear black gap
// ---------------------------------------------------------------------------
function drawText(ctx: SKRSContext2D, d: WelcomeCardData): void {
  const TX = 800; // right edge of the text column

  // soft dark plate behind text to guarantee contrast over any ribbon spill
  ctx.save();
  const plate = ctx.createLinearGradient(TX - 430, 0, TX + 40, 0);
  plate.addColorStop(0, 'rgba(7,7,7,0)');
  plate.addColorStop(0.25, 'rgba(7,7,7,0.45)');
  plate.addColorStop(1, 'rgba(7,7,7,0.55)');
  ctx.fillStyle = plate;
  ctx.fillRect(TX - 430, 140, 470, 200);
  ctx.restore();

  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  // kicker label + gold rule (branding — stays literal LY SYSTEM)
  ctx.save();
  ctx.font = 'bold 19px Cairo';
  ctx.fillStyle = 'rgba(248, 206, 128, 0.85)';
  ctx.fillText('· LY SYSTEM ·', TX, 162);
  const rule = ctx.createLinearGradient(TX - 150, 0, TX, 0);
  rule.addColorStop(0, 'rgba(245,124,0,0)');
  rule.addColorStop(1, '#f9d976');
  ctx.strokeStyle = rule;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(TX - 150, 174);
  ctx.lineTo(TX, 174);
  ctx.stroke();
  ctx.restore();

  // greeting in gold, skewed italic — "أهلًا وسهلًا" or "وداعًا"
  ctx.save();
  ctx.transform(1, 0, -0.08, 1, 0, 0);
  const greetGrad = ctx.createLinearGradient(TX - 360, 0, TX, 0);
  greetGrad.addColorStop(0, '#f57c00');
  greetGrad.addColorStop(0.5, '#f9d976');
  greetGrad.addColorStop(1, '#fff6cf');
  ctx.fillStyle = greetGrad;
  ctx.font = 'bold 56px Cairo';
  ctx.shadowColor = 'rgba(255, 200, 90, 0.5)';
  ctx.shadowBlur = 16;
  const greetY = 236;
  ctx.fillText(d.variant === 'goodbye' ? 'وداعًا' : 'أهلًا وسهلًا', TX + 0.08 * greetY, greetY);
  ctx.restore();

  // username — white hero
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 74px Cairo';
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 14;
  ctx.fillText(truncate(d.username, 20), TX, 308);
  ctx.restore();

  // subtitle — muted white. Welcome: "العضو رقم #N · {server}"; goodbye: server only.
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.font = '600 25px Cairo';
  const sub =
    d.variant === 'goodbye'
      ? truncate(d.serverName, 36)
      : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 42);
  ctx.fillText(sub, TX, 344);
  ctx.restore();
}

// ---------------------------------------------------------------------------
// 6. film grain
// ---------------------------------------------------------------------------
function drawGrain(ctx: SKRSContext2D, rnd: () => number): void {
  ctx.save();
  for (let i = 0; i < 1100; i++) {
    const x = rnd() * WIDTH;
    const y = rnd() * HEIGHT;
    const a = rnd() * 0.045;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(x, y, 1, 1);
  }
  ctx.restore();
}
