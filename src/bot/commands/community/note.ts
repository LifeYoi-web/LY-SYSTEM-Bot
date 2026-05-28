import {
  SlashCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from 'discord.js';
import { prisma } from '../../../db/prisma';

const EPH = { flags: MessageFlags.Ephemeral } as const;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('note')
    .setDescription('ملاحظات خاصة للطاقم على الأعضاء (لا يراها العضو)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('إضافة ملاحظة على عضو')
        .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true))
        .addStringOption((o) => o.setName('content').setDescription('الملاحظة').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('list')
        .setDescription('عرض ملاحظات عضو')
        .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('حذف ملاحظة بمعرّفها')
        .addStringOption((o) => o.setName('id').setDescription('معرّف الملاحظة (من /note list)').setRequired(true)),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const guildId = interaction.guild.id;
    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const user = interaction.options.getUser('user', true);
      const content = interaction.options.getString('content', true).slice(0, 1000);
      const note = await prisma.memberNote.create({
        data: { guildId, userId: user.id, authorId: interaction.user.id, content },
      });
      await interaction.reply({
        content: `📝 تم تسجيل الملاحظة \`${note.id}\` على <@${user.id}>.`,
        allowedMentions: { parse: [] },
        ...EPH,
      });
      return;
    }

    if (sub === 'list') {
      const user = interaction.options.getUser('user', true);
      const notes = await prisma.memberNote.findMany({
        where: { guildId, userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      if (notes.length === 0) {
        await interaction.reply({
          content: `📭 لا توجد ملاحظات على <@${user.id}>.`,
          allowedMentions: { parse: [] },
          ...EPH,
        });
        return;
      }
      const body = notes
        .map(
          (n) =>
            `\`${n.id}\` — <@${n.authorId}> · <t:${Math.floor(n.createdAt.getTime() / 1000)}:R>\n${n.content}`,
        )
        .join('\n\n')
        .slice(0, 4000);
      const embed = new EmbedBuilder()
        .setColor(0xf57c00)
        .setTitle(`📝 ملاحظات على ${user.username} (${notes.length})`)
        .setDescription(body);
      await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] }, ...EPH });
      return;
    }

    if (sub === 'remove') {
      const id = interaction.options.getString('id', true);
      const r = await prisma.memberNote.deleteMany({ where: { guildId, id } });
      await interaction.reply({
        content: r.count > 0 ? '🗑️ تم حذف الملاحظة.' : '❌ لم يتم العثور على ملاحظة بهذا المعرّف.',
        ...EPH,
      });
      return;
    }
  },
};
