import { SlashCommandBuilder, EmbedBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { getEconomyConfig } from '../../../db/community';
import { getBalance } from '../../economy';
import { formatBalance } from '../../../shared/economy';

module.exports = {
  data: new SlashCommandBuilder()
    .setName('balance')
    .setDescription('عرض رصيدك من عملة السيرفر')
    .addUserOption((o) => o.setName('user').setDescription('عضو آخر (اختياري)')),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const cfg = await getEconomyConfig(interaction.guild.id);
    if (!cfg.enabled) {
      await interaction.reply('نظام العملات غير مفعّل في هذا السيرفر.');
      return;
    }
    const user = interaction.options.getUser('user') ?? interaction.user;
    const bal = await getBalance(prisma, interaction.guild.id, user.id);
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle(`${cfg.currencyEmoji} محفظة ${user.username}`)
      .setDescription(`الرصيد: **${formatBalance(bal, cfg.currencyEmoji)}** ${cfg.currencyName}`)
      .setThumbnail(user.displayAvatarURL());
    await interaction.reply({ embeds: [embed] });
  },
};
