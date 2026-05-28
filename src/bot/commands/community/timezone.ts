import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';

const EPH = { flags: MessageFlags.Ephemeral } as const;

/** Validate by attempting a format pass. Intl throws for unknown IANA ids. */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('timezone')
    .setDescription('احفظ منطقتك الزمنية ليعرضها /time للأعضاء')
    .addSubcommand((s) =>
      s
        .setName('set')
        .setDescription('حدد منطقتك (IANA مثل Asia/Riyadh)')
        .addStringOption((o) => o.setName('zone').setDescription('IANA timezone id').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('clear').setDescription('احذف منطقتك المحفوظة')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const zone = interaction.options.getString('zone', true).trim();
      if (!isValidTimezone(zone)) {
        await interaction.reply({
          content: '❌ منطقة غير صالحة. أمثلة: `Asia/Riyadh` · `Europe/London` · `America/New_York`.',
          ...EPH,
        });
        return;
      }
      await prisma.profile.upsert({
        where: { guildId_userId: { guildId, userId } },
        update: { timezone: zone },
        create: { guildId, userId, timezone: zone },
      });
      await interaction.reply({ content: `🕒 تم حفظ منطقتك: \`${zone}\`.`, ...EPH });
      return;
    }

    if (sub === 'clear') {
      await prisma.profile
        .update({ where: { guildId_userId: { guildId, userId } }, data: { timezone: null } })
        .catch(() => undefined);
      await interaction.reply({ content: '🕒 تم حذف منطقتك.', ...EPH });
      return;
    }
  },
};
