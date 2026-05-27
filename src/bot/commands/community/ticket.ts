import {
  SlashCommandBuilder,
  MessageFlags,
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
  type TextChannel,
} from 'discord.js';
import { prisma } from '../../../db/prisma';
import { getTicketConfig, getTicketTypes } from '../../../db/community';
import {
  isTicketStaff,
  buildTicketPanel,
  setClaim,
  closeTicket,
  reopenTicket,
  renameTicket,
  addUserToTicket,
  removeUserFromTicket,
} from '../../tickets';

const EPH = { flags: MessageFlags.Ephemeral } as const;

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket')
    .setDescription('إدارة التذاكر')
    .addSubcommand((s) => s.setName('claim').setDescription('استلام التذكرة الحالية'))
    .addSubcommand((s) => s.setName('unclaim').setDescription('فك استلام التذكرة الحالية'))
    .addSubcommand((s) =>
      s
        .setName('close')
        .setDescription('إغلاق التذكرة الحالية')
        .addStringOption((o) => o.setName('reason').setDescription('سبب الإغلاق')),
    )
    .addSubcommand((s) =>
      s
        .setName('rename')
        .setDescription('إعادة تسمية التذكرة الحالية')
        .addStringOption((o) => o.setName('name').setDescription('الاسم الجديد').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('add')
        .setDescription('إضافة عضو للتذكرة الحالية')
        .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('remove')
        .setDescription('إزالة عضو من التذكرة الحالية')
        .addUserOption((o) => o.setName('user').setDescription('العضو').setRequired(true)),
    )
    .addSubcommand((s) =>
      s
        .setName('reopen')
        .setDescription('إعادة فتح تذكرة مغلقة برقمها')
        .addIntegerOption((o) => o.setName('number').setDescription('رقم التذكرة').setRequired(true).setMinValue(1)),
    )
    .addSubcommand((s) =>
      s
        .setName('panel')
        .setDescription('نشر لوحة فتح التذاكر')
        .addChannelOption((o) =>
          o.setName('channel').setDescription('القناة (الحالية افتراضيًا)').addChannelTypes(ChannelType.GuildText),
        ),
    ),

  async execute(interaction: ChatInputCommandInteraction) {
    if (!interaction.inGuild() || !interaction.guild) return;
    const guild = interaction.guild;
    const sub = interaction.options.getSubcommand();
    const [cfg, types] = await Promise.all([getTicketConfig(guild.id), getTicketTypes(guild.id)]);
    const member = (await guild.members.fetch(interaction.user.id).catch(() => null)) as GuildMember | null;
    const staff = !!member && isTicketStaff(member, cfg, types);
    const denyStaff = () => interaction.reply({ content: '❌ هذا الأمر لفريق الدعم فقط.', ...EPH });

    if (sub === 'panel') {
      if (!staff) return denyStaff();
      const channel = (interaction.options.getChannel('channel') ?? interaction.channel) as TextChannel | null;
      if (!channel?.isTextBased?.()) return interaction.reply({ content: '❌ قناة غير صالحة.', ...EPH });
      await channel.send(buildTicketPanel(cfg, types)).catch(() => undefined);
      return interaction.reply({ content: `✅ تم نشر اللوحة في <#${channel.id}>.`, ...EPH });
    }

    if (sub === 'reopen') {
      if (!staff) return denyStaff();
      const number = interaction.options.getInteger('number', true);
      const ticket = await prisma.ticket.findFirst({
        where: { guildId: guild.id, number, status: 'closed' },
        orderBy: { closedAt: 'desc' },
      });
      if (!ticket) return interaction.reply({ content: '❌ لا توجد تذكرة مغلقة بهذا الرقم.', ...EPH });
      await interaction.deferReply(EPH);
      const channel = await reopenTicket(guild, prisma, ticket.id, interaction.user.id);
      return interaction.editReply(channel ? `✅ تم إعادة فتح التذكرة: <#${channel.id}>` : '❌ تعذّر إعادة الفتح.');
    }

    // Remaining subcommands operate on the current channel's open ticket.
    const ticket = await prisma.ticket.findFirst({
      where: { guildId: guild.id, channelId: interaction.channelId, status: 'open' },
    });
    if (!ticket) return interaction.reply({ content: '❌ استخدم هذا الأمر داخل قناة تذكرة مفتوحة.', ...EPH });
    const channel = interaction.channel as TextChannel;

    if (sub === 'close') {
      if (!staff && ticket.userId !== interaction.user.id) return denyStaff();
      const reason = interaction.options.getString('reason') ?? undefined;
      await interaction.reply({ content: '🔒 يتم إغلاق التذكرة...', ...EPH });
      await closeTicket(guild, prisma, channel.id, interaction.user.id, reason);
      return;
    }

    // claim / unclaim / rename / add / remove — staff only
    if (!staff) return denyStaff();

    if (sub === 'claim' || sub === 'unclaim') {
      await setClaim(guild, prisma, channel.id, interaction.user.id, sub === 'claim');
      return interaction.reply({ content: sub === 'claim' ? '🙋 استلمت التذكرة.' : '↩️ فككت الاستلام.', ...EPH });
    }
    if (sub === 'rename') {
      await renameTicket(channel, interaction.options.getString('name', true));
      return interaction.reply({ content: '✏️ تم تغيير اسم التذكرة.', ...EPH });
    }
    if (sub === 'add') {
      const user = interaction.options.getUser('user', true);
      await addUserToTicket(channel, user.id);
      return interaction.reply({ content: `➕ تمت إضافة <@${user.id}> للتذكرة.`, allowedMentions: { parse: [] }, ...EPH });
    }
    if (sub === 'remove') {
      const user = interaction.options.getUser('user', true);
      await removeUserFromTicket(channel, user.id);
      return interaction.reply({ content: `➖ تمت إزالة <@${user.id}> من التذكرة.`, allowedMentions: { parse: [] }, ...EPH });
    }
  },
};
