import {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../../db/prisma';
import { getEconomyConfig } from '../../../db/community';
import { formatBalance } from '../../../shared/economy';

module.exports = {
  data: new SlashCommandBuilder().setName('shop').setDescription('عرض متجر الرتب'),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.guild) return;
    const cfg = await getEconomyConfig(interaction.guild.id);
    if (!cfg.enabled) {
      await interaction.reply('المتجر غير مفعّل في هذا السيرفر.');
      return;
    }
    const items = await prisma.shopItem.findMany({
      where: { guildId: interaction.guild.id, enabled: true },
      orderBy: { position: 'asc' },
      take: 20,
    });
    if (!items.length) {
      await interaction.reply('🛒 المتجر فاضي حالياً.');
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0xf57c00)
      .setTitle('🛒 متجر الرتب')
      .setDescription(
        items
          .map(
            (it) =>
              `<@&${it.roleId}> — **${formatBalance(it.price, cfg.currencyEmoji)}**` +
              `${it.durationHours ? ` · ${it.durationHours}س` : ''}${it.requiredLevel ? ` · مستوى ${it.requiredLevel}+` : ''}` +
              `${it.stock >= 0 ? ` · متبقّي ${it.stock}` : ''}`,
          )
          .join('\n'),
      );
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    for (let i = 0; i < items.length && rows.length < 5; i += 5) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const it of items.slice(i, i + 5)) {
        row.addComponents(
          new ButtonBuilder().setCustomId(`shop:buy:${it.id}`).setLabel((it.label || 'شراء').slice(0, 80)).setStyle(ButtonStyle.Primary),
        );
      }
      rows.push(row);
    }
    await interaction.reply({ embeds: [embed], components: rows, allowedMentions: { parse: [] } });
  },
};
