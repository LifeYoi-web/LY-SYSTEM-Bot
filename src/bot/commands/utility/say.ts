import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type TextChannel,
} from 'discord.js';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('say')
    .setDescription('إرسال إعلان باسم البوت')
    .addStringOption((o) => o.setName('message').setDescription('نص الرسالة').setRequired(true))
    .addChannelOption((o) =>
      o.setName('channel').setDescription('القناة (افتراضيًا الحالية)').addChannelTypes(ChannelType.GuildText),
    )
    .addBooleanOption((o) => o.setName('embed').setDescription('إرسالها كبطاقة منسّقة؟'))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const message = interaction.options.getString('message', true);
    const asEmbed = interaction.options.getBoolean('embed') ?? false;
    const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel | null;
    if (!channel?.isTextBased?.()) {
      await interaction.reply({ content: '❌ قناة غير صالحة.', ephemeral: true });
      return;
    }
    try {
      // Allow user/role pings in announcements but never @everyone/@here via the bot.
      const allowedMentions = { parse: ['users', 'roles'] as ('users' | 'roles')[] };
      if (asEmbed) {
        await channel.send({
          embeds: [new EmbedBuilder().setColor(0xf57c00).setDescription(message).setTimestamp()],
          allowedMentions,
        });
      } else {
        await channel.send({ content: message, allowedMentions });
      }
      await interaction.reply({ content: `✅ تم الإرسال إلى ${channel}.`, ephemeral: true });
    } catch {
      await interaction.reply({ content: '❌ تعذّر الإرسال — تأكد من صلاحيات البوت في تلك القناة.', ephemeral: true });
    }
  },
};
