import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { prisma } from '../../../db/prisma';
import { getEconomyConfig } from '../../../db/community';
import { transfer, type TransferError } from '../../economy';
import { formatBalance } from '../../../shared/economy';

const ERR: Record<TransferError, string> = {
  amount: '❌ المبلغ غير صالح.',
  self: '❌ لا يمكنك التحويل لنفسك.',
  balance: '❌ رصيدك لا يكفي.',
};

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pay')
    .setDescription('حوّل عملة لعضو آخر')
    .addUserOption((o) => o.setName('user').setDescription('المستلم').setRequired(true))
    .addIntegerOption((o) => o.setName('amount').setDescription('الكمية').setRequired(true).setMinValue(1)),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const cfg = await getEconomyConfig(interaction.guild.id);
    if (!cfg.enabled) {
      await interaction.reply('نظام العملات غير مفعّل في هذا السيرفر.');
      return;
    }
    const to = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    if (to.bot) {
      await interaction.reply('❌ لا يمكنك التحويل لبوت.');
      return;
    }
    const res = await transfer(prisma, interaction.guild.id, interaction.user.id, to.id, amount);
    if (!res.ok) {
      await interaction.reply(ERR[res.reason]);
      return;
    }
    await interaction.reply({
      content: `✅ حوّلت **${formatBalance(amount, cfg.currencyEmoji)}** ${cfg.currencyName} إلى <@${to.id}>.`,
      allowedMentions: { users: [to.id] },
    });
  },
};
