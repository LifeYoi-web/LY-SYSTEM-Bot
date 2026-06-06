import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
} from 'discord.js';
import { getPlan } from '../db/subscriptions';
import { hasFeature, type FeatureKey } from '../shared/entitlements';

const ORANGE = 0xf57c00;

/** True when the guild's plan unlocks the feature (plan is cached — cheap on hot paths). */
export async function featureAllowed(guildId: string, key: FeatureKey): Promise<boolean> {
  return hasFeature(await getPlan(guildId), key);
}

/** Standard Arabic upsell payload for gated slash commands / buttons. */
export function upsellReply(featureLabel: string) {
  const url = process.env.DASHBOARD_URL || 'https://discord.com';
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('🔒 ميزة بريميوم')
    .setDescription(`**${featureLabel}** متاحة في باقة بريميوم.\nرقِّ سيرفرك من لوحة التحكم وافتح كل المميزات.`);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setLabel('⬆️ ترقية الباقة').setStyle(ButtonStyle.Link).setURL(url),
  );
  return { embeds: [embed], components: [row], flags: MessageFlags.Ephemeral } as const;
}
