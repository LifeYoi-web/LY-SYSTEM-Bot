import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import type { Suggestion } from '@prisma/client';

const STATUS: Record<string, { color: number; label: string }> = {
  pending: { color: 0xf5a524, label: '🕓 قيد المراجعة' },
  approved: { color: 0x36c46f, label: '✅ مقبول' },
  denied: { color: 0xf0494f, label: '❌ مرفوض' },
};

export function buildSuggestionMessage(s: Suggestion) {
  const st = STATUS[s.status] ?? STATUS.pending;
  const embed = new EmbedBuilder()
    .setColor(st.color)
    .setTitle('💡 اقتراح')
    .setDescription(s.content)
    .addFields(
      { name: 'الحالة', value: st.label, inline: true },
      { name: 'التصويت', value: `👍 ${s.up}  •  👎 ${s.down}`, inline: true },
    )
    .setFooter({ text: `بواسطة ${s.authorId}` })
    .setTimestamp(s.createdAt);
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`sg:up:${s.id}`).setLabel(String(s.up)).setEmoji('👍').setStyle(ButtonStyle.Success).setDisabled(s.status !== 'pending'),
    new ButtonBuilder().setCustomId(`sg:down:${s.id}`).setLabel(String(s.down)).setEmoji('👎').setStyle(ButtonStyle.Danger).setDisabled(s.status !== 'pending'),
  );
  return { embeds: [embed], components: [row] };
}
