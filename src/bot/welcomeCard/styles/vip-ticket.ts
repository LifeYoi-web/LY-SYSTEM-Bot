import type { SKRSContext2D } from '@napi-rs/canvas';
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

// Boarding-pass redesign (2026-06-04): the original ticket was cluttered (ghost VIP
// watermark + VERIFIED stamp + dashed frame + grain). This version is a tidy labeled
// field grid — the name is the hero, the avatar + barcode live in the stub.
const ORANGE_LT = '#ffa733';
const OUTER_BG = '#0a0a0c';
const BODY_TOP = '#1d1f28';
const BODY_BOT = '#15161c';
const WHITE = '#ffffff';

/** VIP boarding-pass ticket: perforated stub with avatar + barcode, labeled field grid. */
export async function drawVipTicket(ctx: SKRSContext2D, d: WelcomeCardData): Promise<void> {
  const rnd = makeRng(1337);
  const goodbye = d.variant === 'goodbye';

  // ================= OUTER BACKGROUND (flat near-black) =================
  ctx.fillStyle = OUTER_BG;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // ================= TICKET BODY =================
  const INSET = 16;
  const TX = INSET;
  const TY = INSET;
  const TW = WIDTH - INSET * 2;
  const TH = HEIGHT - INSET * 2;
  const TR = 24;

  // soft drop shadow under the ticket
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.6)';
  ctx.shadowBlur = 34;
  ctx.shadowOffsetY = 12;
  roundRectPath(ctx, TX, TY, TW, TH, TR);
  ctx.fillStyle = BODY_BOT;
  ctx.fill();
  ctx.restore();

  // flat-ish vertical gradient body (NO texture)
  const bodyGrad = ctx.createLinearGradient(0, TY, 0, TY + TH);
  bodyGrad.addColorStop(0, BODY_TOP);
  bodyGrad.addColorStop(1, BODY_BOT);
  roundRectPath(ctx, TX, TY, TW, TH, TR);
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // thin orange border
  ctx.save();
  roundRectPath(ctx, TX + 1, TY + 1, TW - 2, TH - 2, TR);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = ORANGE;
  ctx.stroke();
  ctx.restore();

  // ================= PERFORATION (stub on the LEFT) =================
  const PERF_X = Math.round(WIDTH * 0.27);

  // two clean notches biting in at the top & bottom of the perforation line
  const NOTCH_R = 18;
  const carveNotch = (cx: number, cy: number): void => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, NOTCH_R, 0, Math.PI * 2);
    ctx.fillStyle = OUTER_BG;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, NOTCH_R, 0, Math.PI * 2);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = ORANGE;
    ctx.stroke();
    ctx.restore();
  };
  carveNotch(PERF_X, TY);
  carveNotch(PERF_X, TY + TH);

  // small punched holes between the notches
  ctx.save();
  const holeR = 4;
  const holeTop = TY + NOTCH_R + 26;
  const holeBot = TY + TH - NOTCH_R - 26;
  const holeCount = 12;
  for (let i = 0; i < holeCount; i++) {
    const y = holeTop + (holeBot - holeTop) * (i / (holeCount - 1));
    ctx.beginPath();
    ctx.arc(PERF_X, y, holeR, 0, Math.PI * 2);
    ctx.fillStyle = OUTER_BG;
    ctx.fill();
  }
  ctx.restore();

  // ================= LEFT STUB: avatar + barcode + ID =================
  const stubCX = TX + (PERF_X - TX) / 2;
  const AV_R = 70;
  const AV_CX = stubCX;
  const AV_CY = TY + 132;

  const img = await loadAvatar(d.avatarUrl);
  drawCircularAvatarInto(ctx, img, d.username, AV_CX, AV_CY, AV_R);

  // orange ring around the avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(AV_CX, AV_CY, AV_R + 3, 0, Math.PI * 2);
  ctx.lineWidth = 4;
  ctx.strokeStyle = ORANGE;
  ctx.stroke();
  ctx.restore();

  // barcode strip under the avatar
  ctx.save();
  const bcWidth = AV_R * 2 + 16;
  const bcLeft = stubCX - bcWidth / 2;
  const bcTop = AV_CY + AV_R + 34;
  const bcHeight = 46;
  let bx = bcLeft;
  ctx.fillStyle = 'rgba(255,255,255,0.88)';
  while (bx < bcLeft + bcWidth - 1) {
    const bw = 1 + Math.floor(rnd() * 4);
    const gap = 1 + Math.floor(rnd() * 3);
    ctx.fillRect(bx, bcTop, bw, bcHeight);
    bx += bw + gap;
  }
  ctx.restore();

  // tiny ID line under the barcode
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 14px Cairo';
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillText(`LY-${String(d.position).padStart(7, '0')}`, stubCX, bcTop + bcHeight + 12);
  ctx.restore();

  // ================= MAIN SECTION (right of the perforation, RTL) =================
  const MR = TX + TW - 46; // right edge — RTL anchor
  const ML = PERF_X + 42; // left edge of the main content
  const MTOP = TY + 38;

  // header row: small orange label + thin divider under it
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = 'bold 22px Cairo';
  ctx.fillStyle = ORANGE;
  const headerY = MTOP + 22;
  ctx.fillText(goodbye ? 'بطاقة مغادرة' : 'بطاقة دخول كبار الشخصيات', MR, headerY);
  ctx.restore();

  const dividerY = headerY + 20;
  ctx.save();
  ctx.strokeStyle = 'rgba(245,124,0,0.45)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(MR, dividerY);
  ctx.lineTo(ML, dividerY);
  ctx.stroke();
  ctx.restore();

  // HERO name: huge, clean, white — shrink to fit so long names never overflow
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  const name = truncate(d.username, 16);
  let nameSize = 96;
  ctx.font = `bold ${nameSize}px Cairo`;
  while (nameSize > 56 && ctx.measureText(name).width > MR - ML) {
    nameSize -= 8;
    ctx.font = `bold ${nameSize}px Cairo`;
  }
  ctx.fillStyle = WHITE;
  const nameY = dividerY + 104;
  ctx.fillText(name, MR, nameY);
  ctx.restore();

  // greeting just under the name (right-aligned, subdued)
  ctx.save();
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '600 28px Cairo';
  ctx.fillStyle = 'rgba(255,255,255,0.62)';
  ctx.fillText(goodbye ? 'وداعًا' : 'أهلًا وسهلًا', MR, nameY + 48);
  ctx.restore();

  // labeled field grid (goodbye drops the member number per the variant rule)
  const fields = goodbye
    ? [
        { label: 'السيرفر', value: truncate(d.serverName, 16) },
        { label: 'الحالة', value: 'غادر' },
      ]
    : [
        { label: 'العضو رقم', value: `#${d.position}` },
        { label: 'السيرفر', value: truncate(d.serverName, 16) },
        { label: 'الحالة', value: 'VIP' },
      ];

  const gridLabelY = TY + TH - 70;
  const gridValueY = TY + TH - 40;
  const cellW = (MR - ML) / fields.length;
  const gridTopY = gridLabelY - 30;

  // subtle top hairline above the field grid for grouping
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.10)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MR, gridTopY);
  ctx.lineTo(ML, gridTopY);
  ctx.stroke();
  ctx.restore();

  // thin vertical separators between the cells
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 1;
  for (let i = 1; i < fields.length; i++) {
    const sx = MR - i * cellW;
    ctx.beginPath();
    ctx.moveTo(sx, gridTopY + 8);
    ctx.lineTo(sx, gridValueY + 4);
    ctx.stroke();
  }
  ctx.restore();

  ctx.textAlign = 'right';
  for (let i = 0; i < fields.length; i++) {
    // cell i spans [MR - (i+1)*cellW, MR - i*cellW]; anchor to its right edge with a gutter
    const cellRight = MR - i * cellW - 16;
    ctx.save();
    ctx.font = 'bold 16px Cairo';
    ctx.fillStyle = ORANGE_LT;
    ctx.fillText(fields[i].label, cellRight, gridLabelY);
    ctx.restore();
    ctx.save();
    ctx.font = 'bold 28px Cairo';
    ctx.fillStyle = WHITE;
    ctx.fillText(fields[i].value, cellRight, gridValueY);
    ctx.restore();
  }
}
