import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { invalidateHighlights } from '../../../db/community';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('highlight')
    .setDescription('تنبيهك في الخاص عند ذكر كلمة معينة')
    .addSubcommand((s) =>
      s.setName('add').setDescription('إضافة كلمة').addStringOption((o) => o.setName('word').setDescription('الكلمة').setRequired(true)),
    )
    .addSubcommand((s) =>
      s.setName('remove').setDescription('حذف كلمة').addStringOption((o) => o.setName('word').setDescription('الكلمة').setRequired(true)),
    )
    .addSubcommand((s) => s.setName('list').setDescription('عرض كلماتك')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const guildId = interaction.guild.id;
    const userId = interaction.user.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'list') {
      const items = await prisma.highlight.findMany({ where: { guildId, userId } });
      await interaction.reply({
        content: items.length ? `🔔 كلماتك: ${items.map((h) => `\`${h.word}\``).join('، ')}` : 'ما عندك كلمات تنبيه.',
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const word = interaction.options.getString('word', true).trim().toLowerCase().slice(0, 50);
    if (!word) {
      await interaction.reply({ content: '❌ كلمة غير صالحة.', flags: MessageFlags.Ephemeral });
      return;
    }
    if (sub === 'add') {
      await prisma.highlight
        .create({ data: { guildId, userId, word } })
        .catch(() => undefined); // unique → ignore duplicate
      await interaction.reply({ content: `🔔 بنبّهك لما تُذكر كلمة \`${word}\`.`, flags: MessageFlags.Ephemeral });
    } else {
      await prisma.highlight.deleteMany({ where: { guildId, userId, word } });
      await interaction.reply({ content: `🔕 حذفت \`${word}\`.`, flags: MessageFlags.Ephemeral });
    }
    invalidateHighlights(guildId);
  },
};
