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

const ORANGE_LT = '#ffa733';
const OUTER_BG = '#0a0a0c';

/** Golden Ticket — the card IS a physical VIP ticket: dark stub + perforation + main pass. */
export async function drawVipTicket(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const W = WIDTH;
  const H = HEIGHT;
  const rnd = makeRng(1337);

  // ================= OUTER BACKGROUND =================
  const bgGrad = ctx.createRadialGradient(W * 0.7, H * 0.3, 80, W * 0.5, H * 0.5, 900);
  bgGrad.addColorStop(0, '#121218');
  bgGrad.addColorStop(1, OUTER_BG);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // faint orange spotlight bleed top-right (cinema premiere vibe)
  const spot = ctx.createRadialGradient(W * 0.82, -40, 20, W * 0.82, -40, 520);
  spot.addColorStop(0, 'rgba(245,124,0,0.18)');
  spot.addColorStop(1, 'rgba(245,124,0,0)');
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);

  // ================= TICKET BODY =================
  const INSET = 14;
  const TX = INSET;
  const TY = INSET;
  const TW = W - INSET * 2;
  const TH = H - INSET * 2;
  const TR = 26;

  // drop shadow under ticket
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.65)';
  ctx.shadowBlur = 38;
  ctx.shadowOffsetY = 14;
  roundRectPath(ctx, TX, TY, TW, TH, TR);
  ctx.fillStyle = '#15161c';
  ctx.fill();
  ctx.restore();

  // ticket gradient fill
  const ticketGrad = ctx.createLinearGradient(TX, TY, TX + TW, TY + TH);
  ticketGrad.addColorStop(0, '#15161c');
  ticketGrad.addColorStop(1, '#1d1f28');
  roundRectPath(ctx, TX, TY, TW, TH, TR);
  ctx.fillStyle = ticketGrad;
  ctx.fill();

  // subtle top sheen
  ctx.save();
  roundRectPath(ctx, TX, TY, TW, TH, TR);
  ctx.clip();
  const sheen = ctx.createLinearGradient(0, TY, 0, TY + 120);
  sheen.addColorStop(0, 'rgba(255,255,255,0.05)');
  sheen.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(TX, TY, TW, 120);
  ctx.restore();

  // thin orange border with soft glow
  ctx.save();
  ctx.shadowColor = 'rgba(245,124,0,0.45)';
  ctx.shadowBlur = 14;
  roundRectPath(ctx, TX + 0.75, TY + 0.75, TW - 1.5, TH - 1.5, TR);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ORANGE;
  ctx.stroke();
  ctx.restore();

  // ================= PERFORATION at x = 25% from LEFT =================
  const PERF_X = Math.round(W * 0.25);

  // Large semicircle notches biting in at top & bottom of the perforation line.
  const NOTCH_R = 22;
  const carveNotch = (cx: number, cy: number): void => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, NOTCH_R, 0, Math.PI * 2);
    ctx.fillStyle = OUTER_BG;
    ctx.fill();
    // re-stroke a thin orange arc edge for definition
    ctx.beginPath();
    ctx.arc(cx, cy, NOTCH_R, 0, Math.PI * 2);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(245,124,0,0.55)';
    ctx.stroke();
    ctx.restore();
  };
  carveNotch(PERF_X, TY); // top notch (centered on ticket top edge)
  carveNotch(PERF_X, TY + TH); // bottom notch

  // punched holes column between the two notches
  ctx.save();
  const holeR = 5;
  const holeGapTop = TY + NOTCH_R + 22;
  const holeGapBot = TY + TH - NOTCH_R - 22;
  const holeCount = 11;
  for (let i = 0; i < holeCount; i++) {
    const y = holeGapTop + (holeGapBot - holeGapTop) * (i / (holeCount - 1));
    // hole = outer bg punch
    ctx.beginPath();
    ctx.arc(PERF_X, y, holeR, 0, Math.PI * 2);
    ctx.fillStyle = OUTER_BG;
    ctx.fill();
    // faint inner ring for crisp punched look
    ctx.beginPath();
    ctx.arc(PERF_X, y, holeR, 0, Math.PI * 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(PERF_X, y, holeR + 1.2, Math.PI * 1.15, Math.PI * 1.85);
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.stroke();
  }
  ctx.restore();

  // ================= LEFT STUB =================
  const stubCenterX = TX + (PERF_X - TX) / 2;

  // rotated vertical title "LY SYSTEM - VIP PASS" (branding — stays literal)
  ctx.save();
  ctx.translate(stubCenterX, TY + TH * 0.42);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 30px Cairo';
  ctx.shadowColor = 'rgba(245,124,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillStyle = ORANGE;
  ctx.fillText('LY SYSTEM', 0, -16);
  ctx.font = 'bold 22px Cairo';
  ctx.shadowBlur = 8;
  ctx.fillStyle = ORANGE_LT;
  ctx.fillText('V I P   P A S S', 0, 18);
  ctx.restore();

  // small "ADMIT ONE" style tag near top of stub
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px Cairo';
  ctx.fillStyle = 'rgba(245,124,0,0.7)';
  ctx.fillText('ADMIT  ONE', stubCenterX, TY + 34);
  // tiny divider line
  ctx.strokeStyle = 'rgba(245,124,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(stubCenterX - 36, TY + 46);
  ctx.lineTo(stubCenterX + 36, TY + 46);
  ctx.stroke();
  ctx.restore();

  // BARCODE at the stub bottom
  ctx.save();
  const bcBottom = TY + TH - 36;
  const bcHeight = 52;
  const bcTop = bcBottom - bcHeight;
  const bcWidth = PERF_X - TX - 56;
  const bcLeft = TX + 28;
  let bx = bcLeft;
  while (bx < bcLeft + bcWidth - 2) {
    const bw = 1 + Math.floor(rnd() * 4); // varied 1-4px
    const gap = 1 + Math.floor(rnd() * 3);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(bx, bcTop, bw, bcHeight);
    bx += bw + gap;
  }
  // barcode caption
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '10px Cairo';
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  ctx.fillText('LY-0001234-VIP', stubCenterX, bcBottom + 6);
  ctx.restore();

  // ================= MAIN SECTION (right of perforation) =================
  const MX = PERF_X + 30; // left edge of main content
  const MR = TX + TW - 30; // right edge (RTL anchor)
  const MTOP = TY + 28;
  const MBOT = TY + TH - 28;

  // dashed inner border framing the main section
  ctx.save();
  ctx.setLineDash([10, 7]);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(245,124,0,0.35)';
  roundRectPath(ctx, MX, MTOP, MR - MX, MBOT - MTOP, 16);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // ----- giant faint "VIP" ghost watermark to fill the left void -----
  ctx.save();
  roundRectPath(ctx, MX, MTOP, MR - MX, MBOT - MTOP, 16);
  ctx.clip();
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = '900 230px Cairo';
  ctx.fillStyle = 'rgba(245,124,0,0.045)';
  ctx.fillText('VIP', MX + 18, H / 2 + 6);
  // faint diagonal sheen streak across the void
  const streak = ctx.createLinearGradient(MX, MTOP, MX + 360, MBOT);
  streak.addColorStop(0, 'rgba(255,255,255,0)');
  streak.addColorStop(0.5, 'rgba(255,255,255,0.022)');
  streak.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = streak;
  ctx.fillRect(MX, MTOP, MR - MX, MBOT - MTOP);
  ctx.restore();

  // ----- decorative VIP seal/stamp filling the lower-left void -----
  const sealCX = MX + 118;
  const sealCY = MTOP + (MBOT - MTOP) * 0.42;
  const sealR = 64;
  ctx.save();
  ctx.translate(sealCX, sealCY);
  ctx.rotate(-0.18);
  // outer broken ring
  ctx.setLineDash([6, 5]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(245,124,0,0.5)';
  ctx.beginPath();
  ctx.arc(0, 0, sealR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  // inner solid ring
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(245,124,0,0.65)';
  ctx.beginPath();
  ctx.arc(0, 0, sealR - 12, 0, Math.PI * 2);
  ctx.stroke();
  // center star
  ctx.fillStyle = 'rgba(245,124,0,0.85)';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const a2 = a + Math.PI / 5;
    const ro = 20;
    const ri = 9;
    if (i === 0) ctx.moveTo(Math.cos(a) * ro, Math.sin(a) * ro);
    else ctx.lineTo(Math.cos(a) * ro, Math.sin(a) * ro);
    ctx.lineTo(Math.cos(a2) * ri, Math.sin(a2) * ri);
  }
  ctx.closePath();
  ctx.fill();
  // captions between rings (straight, small)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 13px Cairo';
  ctx.fillStyle = 'rgba(245,124,0,0.75)';
  ctx.fillText('VERIFIED', 0, sealR - 24);
  ctx.font = 'bold 11px Cairo';
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fillText('EST. 2026', 0, -(sealR - 24));
  ctx.restore();

  // ----- AVATAR: top-right corner of main section (seated INSIDE the frame) -----
  const AV_R = 44;
  const AV_CX = MR - AV_R - 30;
  const AV_CY = MTOP + AV_R + 30;

  // orange glow ring behind
  ctx.save();
  ctx.shadowColor = 'rgba(245,124,0,0.7)';
  ctx.shadowBlur = 22;
  ctx.beginPath();
  ctx.arc(AV_CX, AV_CY, AV_R + 4, 0, Math.PI * 2);
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = ORANGE;
  ctx.stroke();
  ctx.restore();

  // avatar (real image or deliberate placeholder), clipped to the circle
  const img = await loadAvatar(d.avatarUrl);
  drawCircularAvatarInto(ctx, img, d.username, AV_CX, AV_CY, AV_R);

  // ----- RTL TEXT BLOCK (right-aligned, all anchored clear-left of the avatar) -----
  const isGoodbye = d.variant === 'goodbye';
  const textRight = AV_CX - AV_R - 22; // single right margin that never touches the avatar
  ctx.textAlign = 'right';

  // small orange label on top
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 22px Cairo';
  ctx.fillStyle = ORANGE;
  ctx.shadowColor = 'rgba(245,124,0,0.4)';
  ctx.shadowBlur = 8;
  const labelY = MTOP + 52;
  const labelText = 'بطاقة دخول كبار الشخصيات';
  ctx.fillText(labelText, textRight, labelY);
  // thin underline accent beneath the label
  ctx.shadowBlur = 0;
  const labW = ctx.measureText(labelText).width;
  ctx.strokeStyle = 'rgba(245,124,0,0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(textRight, labelY + 10);
  ctx.lineTo(textRight - labW, labelY + 10);
  ctx.stroke();
  ctx.restore();

  // huge white username
  ctx.save();
  ctx.font = 'bold 84px Cairo';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 12;
  const nameY = labelY + 104;
  ctx.fillText(truncate(d.username, 16), textRight, nameY);
  ctx.restore();

  // small greeting under the name
  ctx.save();
  ctx.font = '600 28px Cairo';
  ctx.fillStyle = 'rgba(255,255,255,0.66)';
  ctx.fillText(isGoodbye ? 'وداعًا' : 'أهلًا وسهلًا', textRight, nameY + 44);
  ctx.restore();

  // ----- subtitle pill -----
  ctx.save();
  ctx.font = 'bold 24px Cairo';
  // welcome → member number + server; goodbye → server name only
  const pillText = isGoodbye
    ? truncate(d.serverName, 36)
    : truncate(`العضو رقم #${d.position} · ${d.serverName}`, 42);
  const tw = ctx.measureText(pillText).width;
  const padX = 22;
  const pillH = 50;
  const starGutter = 30; // room for the star icon on the left
  const pillW = tw + padX * 2 + starGutter;
  const pillRight = MR - 20;
  const pillX = pillRight - pillW;
  const pillY = MBOT - pillH - 16;

  // pill bg
  roundRectPath(ctx, pillX, pillY, pillW, pillH, pillH / 2);
  const pillGrad = ctx.createLinearGradient(pillX, pillY, pillX, pillY + pillH);
  pillGrad.addColorStop(0, 'rgba(245,124,0,0.22)');
  pillGrad.addColorStop(1, 'rgba(245,124,0,0.10)');
  ctx.fillStyle = pillGrad;
  ctx.fill();
  roundRectPath(ctx, pillX + 0.5, pillY + 0.5, pillW - 1, pillH - 1, pillH / 2);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(245,124,0,0.55)';
  ctx.stroke();

  // pill text
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffd9a8';
  ctx.fillText(pillText, pillRight - padX, pillY + pillH / 2 + 1);

  // little star icon at the left side of the pill
  const starX = pillX + 24;
  const starY = pillY + pillH / 2;
  ctx.fillStyle = ORANGE;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const a2 = a + Math.PI / 5;
    const ro = 9;
    const ri = 4;
    if (i === 0) ctx.moveTo(starX + Math.cos(a) * ro, starY + Math.sin(a) * ro);
    else ctx.lineTo(starX + Math.cos(a) * ro, starY + Math.sin(a) * ro);
    ctx.lineTo(starX + Math.cos(a2) * ri, starY + Math.sin(a2) * ri);
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // ================= FILM GRAIN =================
  ctx.save();
  for (let i = 0; i < 600; i++) {
    const gx = rnd() * W;
    const gy = rnd() * H;
    const a = 0.02 + rnd() * 0.03;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.fillRect(gx, gy, 1, 1);
  }
  ctx.restore();
}
