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

/** Slash commands that require a plan — one map entry per future premium command. */
export const PREMIUM_COMMANDS: Record<string, { key: FeatureKey; label: string }> = Object.fromEntries(
  ['play', 'skip', 'pause', 'resume', 'stop', 'disconnect', 'queue', 'nowplaying', 'volume', 'loop', 'shuffle', 'seek', 'lyrics'].map(
    (name) => [name, { key: 'music' as FeatureKey, label: 'الموسيقى' }],
  ),
);

/** Returns true when the interaction was blocked (upsell already sent). */
export async function gatePremiumCommand(interaction: {
  commandName: string;
  guildId: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reply: (payload: any) => Promise<any>;
}): Promise<boolean> {
  const gate = PREMIUM_COMMANDS[interaction.commandName];
  if (!gate || !interaction.guildId) return false;
  if (await featureAllowed(interaction.guildId, gate.key)) return false;
  await interaction.reply(upsellReply(gate.label)).catch(() => undefined);
  return true;
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
