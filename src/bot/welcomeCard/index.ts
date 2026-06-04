import { createCanvas } from '@napi-rs/canvas';
import { ensureFonts, WIDTH, HEIGHT, type StyleDraw, type WelcomeCardData } from './helpers';
import { drawClassic } from './styles/classic';

export type { WelcomeCardData } from './helpers';

const REGISTRY: Record<string, { labelAr: string; draw: StyleDraw }> = {
  classic: { labelAr: 'الكلاسيكي', draw: drawClassic },
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
