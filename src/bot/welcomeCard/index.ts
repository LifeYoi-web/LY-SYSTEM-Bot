import { createCanvas } from '@napi-rs/canvas';
import { ensureFonts, WIDTH, HEIGHT, type StyleDraw, type WelcomeCardData } from './helpers';
import { drawClassic } from './styles/classic';
import { drawNeonHud } from './styles/neon-hud';
import { drawCalligraphyGold } from './styles/calligraphy-gold';
import { drawAuroraGlass } from './styles/aurora-glass';
import { drawIslamicStar } from './styles/islamic-star';
import { drawVipTicket } from './styles/vip-ticket';
import { drawConstellation } from './styles/constellation';
import { drawSynthwave } from './styles/synthwave';
import { drawLiquidGold } from './styles/liquid-gold';

export type { WelcomeCardData } from './helpers';

const REGISTRY: Record<string, { labelAr: string; draw: StyleDraw }> = {
  classic: { labelAr: 'الكلاسيكي', draw: drawClassic },
  'neon-hud': { labelAr: 'النيون السيبراني', draw: drawNeonHud },
  'calligraphy-gold': { labelAr: 'حبر وذهب', draw: drawCalligraphyGold },
  'aurora-glass': { labelAr: 'زجاج الشفق', draw: drawAuroraGlass },
  'islamic-star': { labelAr: 'النجمة الثمانية', draw: drawIslamicStar },
  'vip-ticket': { labelAr: 'تذكرة VIP', draw: drawVipTicket },
  constellation: { labelAr: 'سماء الانضمام', draw: drawConstellation },
  synthwave: { labelAr: 'الغروب الرقمي', draw: drawSynthwave },
  'liquid-gold': { labelAr: 'الذهب السائل', draw: drawLiquidGold },
};

/** Dashboard/API source of truth for selectable card styles. */
export const WELCOME_CARD_STYLES = Object.entries(REGISTRY).map(([key, v]) => ({
  key,
  labelAr: v.labelAr,
}));
export const WELCOME_CARD_STYLE_KEYS = Object.keys(REGISTRY);

/** Render a branded welcome (or goodbye) card to a PNG buffer. Unknown styles fall back to classic. */
export async function renderWelcomeCard(d: WelcomeCardData): Promise<Buffer> {
  ensureFonts();
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d');
  const entry = REGISTRY[d.style ?? 'classic'] ?? REGISTRY.classic;
  await entry.draw(ctx, d);
  return canvas.toBuffer('image/png');
}
