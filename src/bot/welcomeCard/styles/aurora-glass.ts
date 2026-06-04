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

/**
 * Aurora Glass — glassmorphism welcome card over an aurora gradient mesh.
 * Deep-blue base, indigo/magenta/violet/orange aurora blobs, a frosted glass
 * panel with sheen + border, a ringed avatar overlapping the panel's right
 * edge, an RTL text block with a vertical orange accent bar, a glass "rank"
 * pill on the left, and a few sparkles.
 */
export async function drawAuroraGlass(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const W = WIDTH;
  const H = HEIGHT;
  const rnd = makeRng(1337);
  const goodbye = d.variant === 'goodbye';

  // ---------- helpers (local to this style) ----------
  function roundRect(
    c: SKRSContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r);
    c.lineTo(x + r, y + h);
    c.arcTo(x, y + h, x, y + h - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }

  function blob(c: SKRSContext2D, cx: number, cy: number, radius: number, color: string): void {
    const g = c.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, color + 'ff');
    g.addColorStop(0.45, color + '9c');
    g.addColorStop(0.75, color + '30');
    g.addColorStop(1, color + '00');
    c.fillStyle = g;
    c.fillRect(0, 0, W, H);
  }

  function sparkle(c: SKRSContext2D, x: number, y: number, size: number, alpha: number): void {
    c.save();
    c.translate(x, y);
    c.strokeStyle = `rgba(255,255,255,${alpha})`;
    c.lineCap = 'round';
    c.shadowColor = 'rgba(255,255,255,0.9)';
    c.shadowBlur = 8;
    // vertical
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(0, -size);
    c.lineTo(0, size);
    c.stroke();
    // horizontal
    c.beginPath();
    c.moveTo(-size, 0);
    c.lineTo(size, 0);
    c.stroke();
    c.restore();
  }

  // ---------- 1. deep blue base ----------
  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, '#0b1020');
  base.addColorStop(1, '#080b18');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);

  // ---------- 2. aurora blobs ----------
  // indigo center-left (lay down first as the deep field)
  blob(ctx, 330, H / 2 - 10, 560, '#4338ca');
  // magenta bottom-left
  blob(ctx, 120, H + 50, 540, '#c2407f');
  // a softer magenta-to-violet bridge so left isn't muddy
  blob(ctx, 460, H + 30, 360, '#7c3aed');
  // orange top-right
  blob(ctx, W - 110, -50, 600, '#f57c00');
  // small warm core to make the orange glow read as light, not paint
  blob(ctx, W - 60, -30, 260, '#ffb74d');

  // subtle grain for texture
  ctx.save();
  ctx.globalAlpha = 0.04;
  for (let i = 0; i < 2600; i++) {
    const gx = rnd() * W;
    const gy = rnd() * H;
    const v = Math.floor(rnd() * 255);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(gx, gy, 1, 1);
  }
  ctx.restore();

  // faint far stars
  for (let i = 0; i < 40; i++) {
    const sx = rnd() * W;
    const sy = rnd() * H;
    const a = 0.15 + rnd() * 0.4;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(sx, sy, rnd() * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- 3. frosted glass panel ----------
  const panelX = 70;
  const panelY = 70;
  const panelW = W * 0.7; // ~840
  const panelH = H - 140; // 260
  const radius = 28;

  // soft outer drop shadow under the panel
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 40;
  ctx.shadowOffsetY = 18;
  roundRect(ctx, panelX, panelY, panelW, panelH, radius);
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.restore();

  // glass body — frosted: a brighter milky fill + a diagonal sheen so the panel
  // clearly reads as a distinct glass surface above the aurora.
  roundRect(ctx, panelX, panelY, panelW, panelH, radius);
  ctx.save();
  ctx.clip();
  // base frost (cool, slightly blue-white) — this is the "blur" stand-in
  const frost = ctx.createLinearGradient(panelX, panelY, panelX, panelY + panelH);
  frost.addColorStop(0, 'rgba(232,238,255,0.16)');
  frost.addColorStop(0.5, 'rgba(220,228,248,0.09)');
  frost.addColorStop(1, 'rgba(210,220,245,0.11)');
  ctx.fillStyle = frost;
  ctx.fillRect(panelX, panelY, panelW, panelH);
  // soft diagonal light streak across the top-left for a glassy glint
  const sheen = ctx.createLinearGradient(
    panelX,
    panelY,
    panelX + panelW * 0.7,
    panelY + panelH,
  );
  sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
  sheen.addColorStop(0.25, 'rgba(255,255,255,0.0)');
  sheen.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(panelX, panelY, panelW, panelH);
  ctx.restore();

  // glass border
  roundRect(ctx, panelX, panelY, panelW, panelH, radius);
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 1px inner top-edge highlight line
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(panelX + radius, panelY + 1.5);
  ctx.lineTo(panelX + panelW - radius, panelY + 1.5);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();

  // ---------- 4. avatar overlapping the panel right edge ----------
  const avR = 88;
  const avCx = panelX + panelW; // sits on the right edge, half on / half off
  const avCy = panelY + panelH / 2;

  // soft drop shadow for avatar
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 12;
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR, 0, Math.PI * 2);
  ctx.fillStyle = '#11141a';
  ctx.fill();
  ctx.restore();

  // avatar (real image clipped to circle, or the deliberate placeholder)
  const img = await loadAvatar(d.avatarUrl);
  drawCircularAvatarInto(ctx, img, d.username, avCx, avCy, avR);

  // avatar white-alpha ring with a soft outward glow
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.35)';
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
  // thin orange accent ring just inside (brighter so it actually reads)
  ctx.beginPath();
  ctx.arc(avCx, avCy, avR - 6, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(245,124,0,0.6)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // little "online" status dot at the avatar's lower-right (Discord feel)
  const dotA = Math.PI * 0.32;
  const dotX = avCx + Math.cos(dotA) * avR;
  const dotY = avCy + Math.sin(dotA) * avR;
  ctx.beginPath();
  ctx.arc(dotX, dotY, 15, 0, Math.PI * 2);
  ctx.fillStyle = '#0b1020';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(dotX, dotY, 9, 0, Math.PI * 2);
  ctx.fillStyle = '#3ba55d';
  ctx.shadowColor = 'rgba(59,165,93,0.8)';
  ctx.shadowBlur = 8;
  ctx.fill();
  ctx.shadowBlur = 0;

  // ---------- 5. text on the glass (RTL) ----------
  const textRight = avCx - avR - 50; // right edge of text block, clear of avatar

  // vertical orange accent bar to the right of the text (anchors the RTL block).
  // Hugs the greeting->subtitle height so its visual weight matches the text.
  const barX = textRight + 26;
  const barTop = panelY + 64;
  const barBot = panelY + 198;
  const barGrad = ctx.createLinearGradient(0, barTop, 0, barBot);
  barGrad.addColorStop(0, 'rgba(255,183,77,0.95)');
  barGrad.addColorStop(1, 'rgba(245,124,0,0.6)');
  ctx.save();
  ctx.shadowColor = 'rgba(245,124,0,0.7)';
  ctx.shadowBlur = 14;
  roundRect(ctx, barX, barTop, 4, barBot - barTop, 2);
  ctx.fillStyle = barGrad;
  ctx.fill();
  ctx.restore();

  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  // greeting — muted white ("أهلًا وسهلًا" or "وداعًا")
  ctx.font = '600 34px Cairo';
  ctx.fillStyle = 'rgba(255,255,255,0.74)';
  ctx.fillText(goodbye ? 'وداعًا' : 'أهلًا وسهلًا', textRight, panelY + 92);

  // name — pure white bold
  ctx.font = 'bold 78px Cairo';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 14;
  ctx.fillText(truncate(d.username, 20), textRight, panelY + 170);
  ctx.shadowBlur = 0;

  // subtitle — light orange ("العضو رقم #N · {server}" or just the server name)
  ctx.font = '600 30px Cairo';
  ctx.fillStyle = '#ffb74d';
  const sub = goodbye
    ? truncate(d.serverName, 36)
    : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 42);
  ctx.fillText(sub, textRight, panelY + 224);

  // ---------- 6. left-side balance: a glass "rank" pill ----------
  // fills the dead zone on the left and reinforces the member position.
  if (!goodbye) {
    const pillX = panelX + 36;
    const pillY = panelY + panelH / 2 - 30;
    const pillW = 168;
    const pillH = 60;
    roundRect(ctx, pillX, pillY, pillW, pillH, 30);
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fill();
    ctx.restore();
    roundRect(ctx, pillX, pillY, pillW, pillH, 30);
    ctx.strokeStyle = 'rgba(255,255,255,0.24)';
    ctx.lineWidth = 1.25;
    ctx.stroke();
    // pill label (two stacked lines, vertically centered in the pill)
    ctx.textAlign = 'left';
    ctx.font = '700 15px Cairo';
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('RANK', pillX + 26, pillY + 25);
    ctx.font = 'bold 28px Cairo';
    ctx.fillStyle = '#ffb74d';
    ctx.fillText(`#${d.position}`, pillX + 26, pillY + 49);
    // tiny orange marker dot before the label to tie it to the brand
    ctx.beginPath();
    ctx.arc(pillX + 17, pillY + 20, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f57c00';
    ctx.fill();
  }

  // ---------- 7. glass sparkles ----------
  sparkle(ctx, panelX + panelW - 70, panelY + 46, 7, 0.9);
  sparkle(ctx, panelX + 30, panelY + 44, 5, 0.65);
  sparkle(ctx, panelX + 36 + 168 + 60, panelY + panelH - 44, 4, 0.55);
  sparkle(ctx, textRight - 250, panelY + 60, 3.5, 0.5);
}
