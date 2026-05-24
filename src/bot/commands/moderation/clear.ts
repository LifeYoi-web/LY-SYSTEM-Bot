import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clear')
    .setDescription('حذف عدد من الرسائل من القناة الحالية')
    .addIntegerOption((o) =>
      o.setName('amount').setDescription('عدد الرسائل (1-100)').setRequired(true).setMinValue(1).setMaxValue(100),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.channel?.isTextBased()) return;
    const amount = interaction.options.getInteger('amount', true);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const deleted = await (interaction.channel as TextChannel).bulkDelete(amount, true);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xf57c00)
            .setTitle('🧹 تم التنظيف')
            .setDescription(`تم حذف **${deleted.size}** رسالة.`),
        ],
      });
    } catch {
      await interaction.editReply('❌ تعذّر الحذف — لا يمكن حذف الرسائل الأقدم من 14 يومًا.');
    }
  },
};
