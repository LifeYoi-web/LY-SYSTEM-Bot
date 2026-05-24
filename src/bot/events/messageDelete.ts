import { Message, PartialMessage, EmbedBuilder } from 'discord.js';
import { prisma } from '../../db/prisma';
import { logEvent } from '../logging';

module.exports = {
  name: 'messageDelete',
  once: false,
  async execute(message: Message | PartialMessage) {
    if (!message.guild || message.author?.bot) return;
    const content = message.content ?? '';
    const embed = new EmbedBuilder()
      .setColor(0x9a9aa8)
      .setTitle('🗑️ رسالة محذوفة')
      .addFields(
        { name: 'العضو', value: message.author ? `<@${message.author.id}>` : 'غير معروف', inline: true },
        { name: 'القناة', value: `<#${message.channelId}>`, inline: true },
      )
      .setDescription(content ? content.slice(0, 1024) : '—')
      .setTimestamp();
    await logEvent(
      { client: message.client, prisma },
      message.guild.id,
      'message_delete',
      { userId: message.author?.id ?? null, channelId: message.channelId, content: content.slice(0, 500) },
      embed,
    );
  },
};
