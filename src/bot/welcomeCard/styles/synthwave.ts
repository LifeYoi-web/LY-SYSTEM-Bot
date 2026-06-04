import { type SKRSContext2D } from '@napi-rs/canvas';
import {
  WIDTH,
  HEIGHT,
  truncate,
  loadAvatar,
  roundRectPath,
  makeRng,
  type WelcomeCardData,
} from '../helpers';

const HORIZON = 262;

/**
 * Synthwave Sunset — 1986 Miami arcade welcome card.
 * Purple-magenta sky, sliced neon sun, perspective grid floor, chrome name,
 * rounded-square neon avatar frame. Faithful port of welcome-previews/synthwave.js.
 */
export async function drawSynthwave(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const rand = makeRng(0x9e3779b9);
  const W = WIDTH;
  const H = HEIGHT;

  // ============================================================
  // 1. SKY GRADIENT
  // ============================================================
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON);
  sky.addColorStop(0, '#1a0b2e');
  sky.addColorStop(0.55, '#3a1248');
  sky.addColorStop(0.82, '#7a1b54');
  sky.addColorStop(1, '#0d0618');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, HORIZON);

  // subtle deep-purple top for the very top band
  const topGlow = ctx.createLinearGradient(0, 0, 0, 120);
  topGlow.addColorStop(0, '#0d0618');
  topGlow.addColorStop(1, 'rgba(13,6,24,0)');
  ctx.fillStyle = topGlow;
  ctx.fillRect(0, 0, W, 120);

  // ============================================================
  // 2. STARS (upper sky only)
  // ============================================================
  ctx.save();
  for (let i = 0; i < 90; i++) {
    const x = rand() * W;
    const y = rand() * (HORIZON - 90);
    const a = 0.15 + rand() * 0.65 * (1 - y / HORIZON);
    const s = rand() * 1.4 + 0.3;
    ctx.globalAlpha = a;
    ctx.fillStyle = rand() > 0.85 ? '#ff9ad1' : '#ffffff';
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // ============================================================
  // 3. THE SUN (right of center, sitting on horizon, sliced)
  // ============================================================
  const SUN_X = 845;
  const SUN_Y = HORIZON;
  const SUN_R = 152;

  ctx.save();
  // outer atmospheric glow behind the sun
  const halo = ctx.createRadialGradient(SUN_X, SUN_Y - 30, 40, SUN_X, SUN_Y - 30, SUN_R * 1.9);
  halo.addColorStop(0, 'rgba(255,120,60,0.55)');
  halo.addColorStop(0.4, 'rgba(233,30,99,0.28)');
  halo.addColorStop(1, 'rgba(233,30,99,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(SUN_X - SUN_R * 2, 0, SUN_R * 4, HORIZON);
  ctx.restore();

  // clip to sun circle and paint the vertical gradient
  ctx.save();
  ctx.beginPath();
  ctx.arc(SUN_X, SUN_Y, SUN_R, 0, Math.PI * 2);
  ctx.clip();
  const sunGrad = ctx.createLinearGradient(0, SUN_Y - SUN_R, 0, SUN_Y + SUN_R);
  sunGrad.addColorStop(0, '#fff2c2');
  sunGrad.addColorStop(0.22, '#ffd54f');
  sunGrad.addColorStop(0.55, '#f57c00');
  sunGrad.addColorStop(0.8, '#f5375f');
  sunGrad.addColorStop(1, '#e91e63');
  ctx.fillStyle = sunGrad;
  ctx.fillRect(SUN_X - SUN_R, SUN_Y - SUN_R, SUN_R * 2, SUN_R * 2);

  // horizontal slices cut from the LOWER half — increasing thickness downward
  // paint sky-color rects so the slices blend with the sky gradient behind
  let sliceY = SUN_Y - 46;
  let gap = 11;
  let thick = 3;
  while (sliceY < SUN_Y + SUN_R) {
    // blend slice color toward the magenta lower sky as we descend
    const t = Math.max(0, (sliceY - (SUN_Y - 46)) / (SUN_R + 46));
    const r = Math.round(46 + t * (122 - 46));
    const g = Math.round(14 + t * (27 - 14));
    const b = Math.round(60 + t * (84 - 60));
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(SUN_X - SUN_R, sliceY, SUN_R * 2, thick);
    sliceY += thick + gap;
    thick += 2.2;
    gap += 0.3;
  }
  ctx.restore();

  // ============================================================
  // 4. MOUNTAIN SILHOUETTES (far-left horizon)
  // ============================================================
  ctx.save();
  ctx.fillStyle = '#160a26';
  ctx.beginPath();
  ctx.moveTo(0, HORIZON);
  ctx.lineTo(0, 196);
  ctx.lineTo(70, 150);
  ctx.lineTo(120, 188);
  ctx.lineTo(178, 132);
  ctx.lineTo(245, 190);
  ctx.lineTo(300, 168);
  ctx.lineTo(340, HORIZON);
  ctx.closePath();
  ctx.fill();
  // second nearer ridge, slightly lighter
  ctx.fillStyle = '#1d0d2f';
  ctx.beginPath();
  ctx.moveTo(0, HORIZON);
  ctx.lineTo(0, 224);
  ctx.lineTo(95, 200);
  ctx.lineTo(150, 222);
  ctx.lineTo(210, 198);
  ctx.lineTo(275, 230);
  ctx.lineTo(330, 214);
  ctx.lineTo(400, HORIZON);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // thin neon horizon line
  ctx.save();
  ctx.shadowColor = '#ff4f9a';
  ctx.shadowBlur = 14;
  ctx.strokeStyle = 'rgba(255,120,170,0.85)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, HORIZON);
  ctx.lineTo(W, HORIZON);
  ctx.stroke();
  ctx.restore();

  // ============================================================
  // 5. PERSPECTIVE NEON GRID (below horizon)
  // ============================================================
  ctx.save();
  // ground base fill
  const ground = ctx.createLinearGradient(0, HORIZON, 0, H);
  ground.addColorStop(0, '#1a0726');
  ground.addColorStop(1, '#070310');
  ctx.fillStyle = ground;
  ctx.fillRect(0, HORIZON, W, H - HORIZON);

  const VP_X = SUN_X; // vanishing point at sun center x, on the horizon
  const VP_Y = HORIZON;

  // converging vertical lines fanning down from VP
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ff4f9a';
  ctx.shadowBlur = 6;
  const fanCount = 26;
  for (let i = -fanCount; i <= fanCount; i++) {
    const bottomX = VP_X + i * 95;
    const t = Math.abs(i) / fanCount;
    ctx.strokeStyle = `rgba(${Math.round(255 - t * 20)},${Math.round(79 + t * 40)},${Math.round(154 + t * 30)},0.45)`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(VP_X, VP_Y);
    ctx.lineTo(bottomX, H + 4);
    ctx.stroke();
  }

  // horizontal lines packing tighter toward horizon (perspective)
  let y = H;
  let step = 46;
  while (y > HORIZON + 1.2) {
    const dist = (y - HORIZON) / (H - HORIZON); // 0 at horizon -> 1 at bottom
    const alpha = 0.12 + dist * 0.6;
    // color shifts orange near horizon -> pink toward viewer
    const r = 255;
    const g = Math.round(124 - dist * 70);
    const b = Math.round(40 + dist * 120);
    ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`;
    ctx.lineWidth = 1.1 + dist * 1.3;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    y -= step;
    step *= 0.78; // pack closer toward the horizon
    if (step < 3) step = 3;
  }
  ctx.restore();

  // soft glow band right at the horizon to ground the grid (gentler, so sun slices read)
  ctx.save();
  const hb = ctx.createLinearGradient(0, HORIZON, 0, HORIZON + 50);
  hb.addColorStop(0, 'rgba(255,150,90,0.22)');
  hb.addColorStop(1, 'rgba(255,150,90,0)');
  ctx.fillStyle = hb;
  ctx.fillRect(0, HORIZON, W, 50);
  ctx.restore();

  // ============================================================
  // 6. AVATAR — rounded square, floating right over the sun
  // ============================================================
  const AV = 150;
  const AV_X = 968; // sits over the sun's upper-right shoulder, with edge margin
  const AV_Y = 92;
  const AV_R = 24;

  // neon glow behind frame
  ctx.save();
  ctx.shadowColor = '#ff2f8e';
  ctx.shadowBlur = 38;
  roundRectPath(ctx, AV_X, AV_Y, AV, AV, AV_R);
  ctx.fillStyle = 'rgba(255,47,142,0.001)';
  ctx.fill();
  // double-pass glow for intensity
  ctx.shadowColor = '#ff7a3c';
  ctx.shadowBlur = 26;
  ctx.fill();
  ctx.restore();

  // gradient border frame
  ctx.save();
  const frameGrad = ctx.createLinearGradient(AV_X, AV_Y, AV_X + AV, AV_Y + AV);
  frameGrad.addColorStop(0, '#ff2f8e');
  frameGrad.addColorStop(0.5, '#ff5fa2');
  frameGrad.addColorStop(1, '#ff8a3c');
  roundRectPath(ctx, AV_X - 4, AV_Y - 4, AV + 8, AV + 8, AV_R + 4);
  ctx.fillStyle = frameGrad;
  ctx.fill();
  ctx.restore();

  // dark inset so the photo sits in a bezel
  ctx.save();
  roundRectPath(ctx, AV_X, AV_Y, AV, AV, AV_R);
  ctx.fillStyle = '#0b0d12';
  ctx.fill();
  ctx.restore();

  // avatar photo — clip to circle inside the rounded frame
  const cx = AV_X + AV / 2;
  const cy = AV_Y + AV / 2;
  const cr = AV / 2 - 8;
  const img = await loadAvatar(d.avatarUrl);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.clip();
  if (img) {
    // cover-fit the real avatar into the circular clip
    ctx.drawImage(img, cx - cr, cy - cr, cr * 2, cr * 2);
  } else {
    // deliberate placeholder in the same visual language as the preview
    // layered radial gradient
    const avg = ctx.createRadialGradient(cx - cr * 0.3, cy - cr * 0.35, cr * 0.1, cx, cy, cr);
    avg.addColorStop(0, '#2a2f3a');
    avg.addColorStop(1, '#11141a');
    ctx.fillStyle = avg;
    ctx.fillRect(cx - cr, cy - cr, cr * 2, cr * 2);

    // faint inner geometric texture — concentric rings
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = '#aab2c6';
    ctx.lineWidth = 1;
    for (let rr = cr * 0.3; rr < cr; rr += 11) {
      ctx.beginPath();
      ctx.arc(cx, cy, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    // faint diagonal hatch
    ctx.globalAlpha = 0.05;
    for (let dx = -cr; dx < cr * 2; dx += 14) {
      ctx.beginPath();
      ctx.moveTo(cx - cr + dx, cy - cr);
      ctx.lineTo(cx - cr + dx - cr * 2, cy + cr);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // the bold member initial
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 96px Cairo';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(255,47,142,0.5)';
    ctx.shadowBlur = 18;
    ctx.fillText((d.username.trim()[0] ?? 'L').toUpperCase(), cx, cy + 4);
  }
  ctx.restore();

  // crisp ring on the photo edge
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, cr, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();

  // ============================================================
  // 7. TEXT BLOCK (right-aligned, to the LEFT of avatar)
  // ============================================================
  const TX = 520; // right edge of the right-aligned text block (clears the sun)
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  // greeting — small orange, with glow
  ctx.font = '700 32px Cairo';
  ctx.shadowColor = 'rgba(245,124,0,0.7)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ffb04a';
  ctx.fillText(d.variant === 'goodbye' ? 'وداعًا' : 'أهلًا وسهلًا', TX, 138);
  ctx.shadowBlur = 0;

  // NAME — chrome effect
  const nameY = 222;
  ctx.font = 'bold 92px Cairo';
  const name = truncate(d.username, 18);
  // soft drop shadow to lift name off the sky
  ctx.shadowColor = 'rgba(0,0,0,0.55)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 4;
  // thin dark outline for legibility
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = 'rgba(8,4,18,0.95)';
  ctx.strokeText(name, TX, nameY);
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  // chrome vertical gradient — punchier band
  const chrome = ctx.createLinearGradient(0, nameY - 78, 0, nameY + 8);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(0.38, '#f2f4fa');
  chrome.addColorStop(0.5, '#7f8698');
  chrome.addColorStop(0.56, '#6c7384');
  chrome.addColorStop(0.66, '#d4d9e3');
  chrome.addColorStop(1, '#ffffff');
  ctx.fillStyle = chrome;
  ctx.fillText(name, TX, nameY);
  // glossy top highlight sweep
  ctx.save();
  ctx.beginPath();
  ctx.rect(TX - 360, nameY - 78, 360, 34);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fillText(name, TX, nameY);
  ctx.restore();

  // subtitle pill — dark translucent plate for legibility over the glow
  ctx.font = '700 27px Cairo';
  const subT =
    d.variant === 'goodbye'
      ? truncate(d.serverName, 36)
      : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 42);
  const subW = ctx.measureText(subT).width;
  const subY = 272;
  const padX = 16;
  roundRectPath(ctx, TX - subW - padX, subY - 30, subW + padX * 2, 44, 12);
  ctx.fillStyle = 'rgba(12,6,24,0.45)';
  ctx.fill();
  roundRectPath(ctx, TX - subW - padX, subY - 30, subW + padX * 2, 44, 12);
  ctx.strokeStyle = 'rgba(255,79,154,0.35)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // subtitle text — neon pink
  ctx.shadowColor = 'rgba(255,79,154,0.85)';
  ctx.shadowBlur = 14;
  ctx.fillStyle = '#ff6fb0';
  ctx.fillText(subT, TX, subY);
  ctx.restore();

  // ============================================================
  // 8. SCANLINES over everything
  // ============================================================
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.9)';
  ctx.globalAlpha = 0.02;
  for (let sy = 0; sy < H; sy += 3) {
    ctx.fillRect(0, sy, W, 1);
  }
  ctx.restore();

  // subtle vignette to focus the composition
  ctx.save();
  const vig = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 760);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(0,0,0,0.45)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  // fine film grain
  ctx.save();
  ctx.globalAlpha = 0.035;
  for (let i = 0; i < 2600; i++) {
    const x = rand() * W;
    const yy = rand() * H;
    ctx.fillStyle = rand() > 0.5 ? '#ffffff' : '#000000';
    ctx.fillRect(x, yy, 1, 1);
  }
  ctx.restore();
}
