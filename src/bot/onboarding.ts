import { EmbedBuilder, PermissionFlagsBits, type Guild, type GuildBasedChannel } from 'discord.js';

const ORANGE = 0xf57c00;

/** First-contact embed posted when the shared bot joins a new guild. */
export function buildOnboardingEmbed(dashboardUrl: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle('👋 أهلاً! أنا LY-SYSTEM')
    .setDescription(
      [
        'بوت إدارة وحماية وتفاعل عربي متكامل — تم تفعيلي في سيرفركم بنجاح.',
        '',
        '⚙️ **لوحة التحكم:** كل الإعدادات من المتصفح:',
        dashboardUrl,
        '',
        '✨ ابدأ بـ `/help` لاستعراض الأوامر، أو افتح اللوحة لضبط الترحيب والحماية والمستويات.',
      ].join('\n'),
    );
}

function canSend(channel: GuildBasedChannel, guild: Guild): boolean {
  const me = guild.members.me;
  if (!me || !('permissionsFor' in channel) || !channel.isTextBased()) return false;
  const perms = channel.permissionsFor(me);
  return Boolean(perms?.has(PermissionFlagsBits.SendMessages));
}

/** Posts the onboarding embed to the system channel (or first sendable text channel). Never throws. */
export async function postOnboarding(guild: Guild, dashboardUrl: string): Promise<boolean> {
  try {
    const system = guild.systemChannel;
    const target =
      (system && canSend(system, guild) ? system : null) ??
      [...guild.channels.cache.values()].find((c) => canSend(c, guild)) ??
      null;
    if (!target || !target.isTextBased()) return false;
    await target.send({ embeds: [buildOnboardingEmbed(dashboardUrl)] });
    return true;
  } catch {
    return false;
  }
}
