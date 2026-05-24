import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { setAfk } from '../../../db/community';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('afk')
    .setDescription('وضع حالة "بعيد عن الكيبورد"')
    .addStringOption((o) => o.setName('reason').setDescription('السبب (اختياري)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const reason = (interaction.options.getString('reason') ?? 'بعيد حاليًا').slice(0, 200);
    await setAfk(interaction.guild.id, interaction.user.id, reason);
    await interaction.reply({ content: `😴 صرت AFK: ${reason}\nبشيل الحالة أول ما ترجع تكتب.`, flags: MessageFlags.Ephemeral });
  },
};
