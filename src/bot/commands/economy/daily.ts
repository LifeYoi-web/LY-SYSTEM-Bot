import { SlashCommandBuilder, MessageFlags, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { getEconomyConfig } from '../../../db/community';
import { claimDaily } from '../../economy';
import { formatBalance } from '../../../shared/economy';

module.exports = {
  data: new SlashCommandBuilder().setName('daily').setDescription('استلم مكافأتك اليومية'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const cfg = await getEconomyConfig(interaction.guild.id);
    if (!cfg.enabled) {
      await interaction.reply('نظام العملات غير مفعّل في هذا السيرفر.');
      return;
    }
    const res = await claimDaily(prisma, interaction.guild.id, interaction.user.id, cfg);
    if (!res.claimed) {
      await interaction.reply({ content: '⏳ استلمت مكافأتك اليوم بالفعل — ارجع بكرة!', flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply(
      `🎁 استلمت **${formatBalance(res.amount, cfg.currencyEmoji)}** ${cfg.currencyName}! ` +
        `(سلسلة: ${res.streak} يوم) — رصيدك الآن: **${formatBalance(res.balance, cfg.currencyEmoji)}**`,
    );
  },
};
