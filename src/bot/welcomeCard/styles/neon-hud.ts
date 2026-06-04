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

const ORANGE_BRIGHT = '#ff9d2e';
const CYAN = '#29d3e0';

/**
 * Cyber HUD — holographic sci-fi targeting interface.
 * Dark gradient + faint hex grid + perspective floor grid, a targeting-reticle
 * avatar assembly on the right, a left vertical data spine, chromatic-aberration
 * name, corner brackets and scanlines over everything.
 */
export async function drawNeonHud(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const isGoodbye = d.variant === 'goodbye';
  // Deterministic PRNG kept for parity with the preview (seed 1337).
  // The approved art does not actually consume it, but we honor the contract.
  const rnd = makeRng(1337);
  void rnd;

  // ---------- BACKGROUND ----------
  const bg = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  bg.addColorStop(0, '#070a12');
  bg.addColorStop(0.5, '#06080f');
  bg.addColorStop(1, '#04060c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // subtle radial vignette glow toward avatar (right side)
  const vg = ctx.createRadialGradient(900, 200, 40, 900, 200, 600);
  vg.addColorStop(0, 'rgba(245,124,0,0.10)');
  vg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ---------- FAINT HEX WATERMARK GRID (background texture) ----------
  const hexPath = (cx: number, cy: number, r: number): void => {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 6;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  };
  // scattered tiny hex field across the whole card (very faint depth texture)
  ctx.save();
  ctx.strokeStyle = 'rgba(245,124,0,0.035)';
  ctx.lineWidth = 1;
  const hr = 22;
  const hw = hr * Math.sqrt(3);
  for (let row = -1; row < 7; row++) {
    for (let col = -1; col < 18; col++) {
      const cx = col * hw + (row % 2 ? hw / 2 : 0);
      const cy = row * hr * 1.5;
      hexPath(cx, cy, hr - 3);
      ctx.stroke();
    }
  }
  ctx.restore();
  // big concentric hex behind avatar zone (subtle)
  ctx.save();
  ctx.strokeStyle = 'rgba(245,124,0,0.05)';
  ctx.lineWidth = 2;
  for (let ring = 0; ring < 3; ring++) {
    hexPath(150, 215, 110 + ring * 24);
    ctx.stroke();
  }
  ctx.restore();

  // ---------- PERSPECTIVE FLOOR GRID (lower third) ----------
  ctx.save();
  ctx.lineWidth = 1;
  const horizon = 260;
  const vpX = WIDTH / 2;
  // horizontal receding lines
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const y = horizon + (HEIGHT - horizon) * (t * t); // accelerate toward viewer
    ctx.strokeStyle = `rgba(140,190,255,${0.045 + t * 0.05})`;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  // vertical converging lines
  ctx.strokeStyle = 'rgba(140,190,255,0.055)';
  for (let i = -8; i <= 8; i++) {
    const xBottom = vpX + i * 120;
    ctx.beginPath();
    ctx.moveTo(vpX + i * 16, horizon);
    ctx.lineTo(xBottom, HEIGHT);
    ctx.stroke();
  }
  ctx.restore();

  // ---------- AVATAR HUD ASSEMBLY (RIGHT) ----------
  const avX = 945;
  const avY = 208;
  const avR = 90;

  // center targeting crosshair (thin lines through avatar with a gap) — drawn first
  ctx.save();
  ctx.strokeStyle = 'rgba(245,124,0,0.30)';
  ctx.lineWidth = 1;
  const xgap = avR + 30;
  const xext = 78;
  ctx.beginPath();
  ctx.moveTo(avX - xgap - xext, avY);
  ctx.lineTo(avX - xgap, avY);
  ctx.moveTo(avX + xgap, avY);
  ctx.lineTo(avX + xgap + xext, avY);
  ctx.moveTo(avX, avY - xgap - xext);
  ctx.lineTo(avX, avY - xgap);
  ctx.moveTo(avX, avY + xgap);
  ctx.lineTo(avX, avY + xgap + xext);
  ctx.stroke();
  ctx.restore();

  // orange tick marks every 30deg around outer ring
  ctx.save();
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 2;
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = 8;
  for (let deg = 0; deg < 360; deg += 30) {
    const a = (deg * Math.PI) / 180;
    const inner = avR + 30;
    const outer = avR + (deg % 90 === 0 ? 42 : 36);
    ctx.beginPath();
    ctx.moveTo(avX + inner * Math.cos(a), avY + inner * Math.sin(a));
    ctx.lineTo(avX + outer * Math.cos(a), avY + outer * Math.sin(a));
    ctx.stroke();
  }
  ctx.restore();

  // outer DASHED ring
  ctx.save();
  ctx.strokeStyle = 'rgba(245,124,0,0.85)';
  ctx.lineWidth = 2;
  ctx.setLineDash([10, 8]);
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 24, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // rotating-arc accent (two bright partial arcs)
  ctx.save();
  ctx.strokeStyle = ORANGE_BRIGHT;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.shadowColor = ORANGE_BRIGHT;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 12, -0.5, 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 12, Math.PI - 0.4, Math.PI + 0.7);
  ctx.stroke();
  ctx.restore();

  // solid glow ring (immediately around avatar)
  ctx.save();
  ctx.strokeStyle = ORANGE;
  ctx.lineWidth = 4;
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(avX, avY, avR + 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // ---- avatar disc (clipped) ----
  const img = await loadAvatar(d.avatarUrl);
  if (img) {
    // Real avatar: cover-fit into the circular clip.
    drawCircularAvatarInto(ctx, img, d.username, avX, avY, avR);
  } else {
    // Placeholder: reproduce the preview's holographic disc look in the same
    // visual language (radial #2a2f3a->#11141a, inner geometric texture, initial).
    ctx.save();
    ctx.beginPath();
    ctx.arc(avX, avY, avR, 0, Math.PI * 2);
    ctx.clip();

    // radial base gradient
    const ag = ctx.createRadialGradient(avX - 30, avY - 30, 10, avX, avY, avR);
    ag.addColorStop(0, '#2a2f3a');
    ag.addColorStop(1, '#11141a');
    ctx.fillStyle = ag;
    ctx.fillRect(avX - avR, avY - avR, avR * 2, avR * 2);

    // faint inner geometric texture (concentric + radial)
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    for (let r = 18; r < avR; r += 18) {
      ctx.beginPath();
      ctx.arc(avX, avY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (let deg = 0; deg < 360; deg += 45) {
      const a = (deg * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(avX, avY);
      ctx.lineTo(avX + avR * Math.cos(a), avY + avR * Math.sin(a));
      ctx.stroke();
    }

    // member initial
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 104px Cairo';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(41,211,224,0.5)';
    ctx.shadowBlur = 18;
    ctx.fillText((d.username.trim()[0] ?? 'L').toUpperCase(), avX, avY + 4);
    ctx.restore();
  }

  // ---------- TELEMETRY MICRO-TEXT near avatar ----------
  ctx.save();
  ctx.fillStyle = 'rgba(245,124,0,0.9)';
  ctx.font = '12px Cairo';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`ID-${d.position} // SYNC OK // LY-NET`, avX, avY + avR + 56);
  ctx.restore();

  // ---------- TEXT BLOCK (RIGHT-ALIGNED, LEFT OF AVATAR) ----------
  const textRight = avX - avR - 70; // right edge of text column
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  // greeting (small orange, above name)
  ctx.save();
  ctx.fillStyle = ORANGE;
  ctx.font = 'bold 30px Cairo';
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = 10;
  ctx.fillText(isGoodbye ? 'وداعًا' : 'أهلًا وسهلًا', textRight, 150);
  ctx.restore();

  // small decorative ">" prefix line / accent under greeting
  ctx.save();
  ctx.strokeStyle = 'rgba(245,124,0,0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(textRight - 230, 164);
  ctx.lineTo(textRight, 164);
  ctx.stroke();
  ctx.restore();

  // USERNAME with chromatic aberration
  const name = truncate(d.username, 18);
  const drawName = (x: number, y: number): void => {
    ctx.font = 'bold 76px Cairo';
    ctx.textAlign = 'right';
    // orange offset left
    ctx.fillStyle = 'rgba(245,124,0,0.9)';
    ctx.fillText(name, x - 3, y);
    // cyan offset right
    ctx.fillStyle = 'rgba(41,211,224,0.9)';
    ctx.fillText(name, x + 3, y);
    // white on top
    ctx.shadowColor = 'rgba(255,255,255,0.25)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(name, x, y);
    ctx.shadowBlur = 0;
  };
  ctx.save();
  drawName(textRight, 232);
  ctx.restore();

  // subtitle (muted gray, below name) — member number on welcome, server only on goodbye
  ctx.save();
  ctx.fillStyle = 'rgba(160,172,190,0.9)';
  ctx.font = '26px Cairo';
  const subtitle = isGoodbye
    ? truncate(d.serverName, 40)
    : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 40);
  ctx.fillText(subtitle, textRight, 280);
  ctx.restore();

  // ---------- LEFT DATA SPINE (vertical HUD readout, balances composition) ----------
  // faint scrim so readouts stay legible over the grid
  ctx.save();
  const scrim = ctx.createLinearGradient(40, 0, 230, 0);
  scrim.addColorStop(0, 'rgba(6,8,15,0.65)');
  scrim.addColorStop(1, 'rgba(6,8,15,0)');
  ctx.fillStyle = scrim;
  ctx.fillRect(40, 70, 200, 260);
  ctx.restore();

  ctx.save();
  const spineX = 70;
  // vertical guide line
  ctx.strokeStyle = 'rgba(245,124,0,0.5)';
  ctx.lineWidth = 2;
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(spineX, 70);
  ctx.lineTo(spineX, 330);
  ctx.stroke();
  ctx.restore();

  // node ticks + labels along the spine
  const spineX2 = 70;
  const rows: Array<{ y: number; label: string; val: string; lit: boolean }> = [
    { y: 96, label: 'STATUS', val: isGoodbye ? 'OFFLINE' : 'ONLINE', lit: true },
    { y: 150, label: 'ACCESS', val: isGoodbye ? 'REVOKED' : 'GRANTED', lit: true },
    { y: 204, label: 'RANK', val: `#${d.position}`, lit: true },
    { y: 258, label: 'UPLINK', val: 'LY-NET', lit: false },
    { y: 312, label: 'SIGNAL', val: '98.6%', lit: false },
  ];
  ctx.save();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  for (const r of rows) {
    // tick node
    ctx.fillStyle = r.lit ? ORANGE_BRIGHT : 'rgba(245,124,0,0.55)';
    ctx.shadowColor = ORANGE;
    ctx.shadowBlur = r.lit ? 10 : 0;
    ctx.beginPath();
    ctx.arc(spineX2, r.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    // short connector
    ctx.strokeStyle = 'rgba(245,124,0,0.4)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(spineX2 + 6, r.y);
    ctx.lineTo(spineX2 + 20, r.y);
    ctx.stroke();
    // label (tiny gray)
    ctx.fillStyle = 'rgba(150,162,180,0.8)';
    ctx.font = '11px Cairo';
    ctx.fillText(r.label, spineX2 + 26, r.y - 8);
    // value
    ctx.fillStyle = r.lit ? '#ffffff' : 'rgba(200,210,225,0.85)';
    ctx.font = 'bold 15px Cairo';
    ctx.fillText(r.val, spineX2 + 26, r.y + 8);
  }
  ctx.restore();

  // scattered telemetry micro-text (top + bottom strips) — branding stays literal
  ctx.save();
  ctx.fillStyle = 'rgba(245,124,0,0.55)';
  ctx.font = '11px Cairo';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('SYS://LY-SYSTEM.CORE', 64, 56);
  ctx.textAlign = 'right';
  ctx.fillText('SEC.LVL 0xF7 // OAUTH', WIDTH - 64, 56);
  ctx.textAlign = 'center';
  ctx.fillText('RENDER 1200x400 // v2  ::  BUILD 0x09FA', 430, HEIGHT - 40);
  ctx.restore();

  // small target tag above avatar ( [ NEW MEMBER ] / [ TARGET LOCKED ] )
  ctx.save();
  ctx.translate(avX, avY - avR - 62);
  ctx.fillStyle = 'rgba(245,124,0,0.9)';
  ctx.font = 'bold 13px Cairo';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tag = isGoodbye ? '[ TARGET LOST ]' : '[ TARGET LOCKED ]';
  const tw = ctx.measureText(tag).width;
  // bracket frame
  ctx.strokeStyle = 'rgba(245,124,0,0.6)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(-tw / 2 - 12, -13, tw + 24, 26);
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = 6;
  ctx.fillText(tag, 0, 1);
  ctx.restore();

  // ---------- 4 CORNER BRACKETS ----------
  const corner = (x: number, y: number, dx: number, dy: number, len: number): void => {
    ctx.beginPath();
    ctx.moveTo(x + dx * len, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + dy * len);
    ctx.stroke();
  };
  ctx.save();
  ctx.strokeStyle = 'rgba(245,124,0,0.6)';
  ctx.lineWidth = 3;
  ctx.shadowColor = ORANGE;
  ctx.shadowBlur = 6;
  const m = 26;
  const L = 46;
  corner(m, m, 1, 1, L); // top-left
  corner(WIDTH - m, m, -1, 1, L); // top-right
  corner(m, HEIGHT - m, 1, -1, L); // bottom-left
  corner(WIDTH - m, HEIGHT - m, -1, -1, L); // bottom-right
  ctx.restore();

  // ---------- SCANLINES (over everything) ----------
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.025)';
  for (let y = 0; y < HEIGHT; y += 4) {
    ctx.fillRect(0, y, WIDTH, 1);
  }
  ctx.restore();

  void CYAN; // palette parity with the approved preview
}
