import {
  Interaction,
  Collection,
  MessageFlags,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { prisma } from '../../db/prisma';
import { logger } from '../../shared/logger';
import {
  openTicket,
  closeTicket,
  setClaim,
  reopenTicket,
  ticketControlsRow,
  closeConfirmRow,
  isTicketStaff,
} from '../tickets';
import { getTicketConfig, getTicketTypes } from '../../db/community';
import { buildSuggestionMessage } from '../suggestions';

const EPH = { flags: MessageFlags.Ephemeral } as const;

async function handleRoleButton(interaction: ButtonInteraction): Promise<void> {
  const roleId = interaction.customId.slice(3); // strip "rr:"
  if (!interaction.guild) return;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) {
    await interaction.reply({ content: '❌ تعذّر إيجاد عضويتك.', ...EPH });
    return;
  }
  try {
    if (member.roles.cache.has(roleId)) {
      await member.roles.remove(roleId);
      await interaction.reply({ content: `➖ أزلت رتبة <@&${roleId}>`, ...EPH });
    } else {
      await member.roles.add(roleId);
      await interaction.reply({ content: `➕ أضفت رتبة <@&${roleId}>`, ...EPH });
    }
  } catch {
    await interaction.reply({ content: '❌ تعذّر تعديل الرتبة — تأكد أن رتبة البوت أعلى من الرتبة المطلوبة.', ...EPH });
  }
}

async function isTicketStaffInteraction(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.guild) return false;
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (!member) return false;
  const [cfg, types] = await Promise.all([
    getTicketConfig(interaction.guild.id),
    getTicketTypes(interaction.guild.id),
  ]);
  return isTicketStaff(member, cfg, types);
}

const TICKET_STAFF_ONLY = '❌ هذا الإجراء لفريق الدعم فقط.';

async function handleTicketButton(interaction: ButtonInteraction): Promise<void> {
  if (!interaction.guild) return;
  const id = interaction.customId;

  if (id === 'ticket:open') {
    await interaction.deferReply(EPH);
    const channel = await openTicket(interaction.guild, prisma, interaction.user.id);
    await interaction.editReply(
      channel
        ? `✅ تم فتح تذكرتك: <#${channel.id}>`
        : '❌ تعذّر فتح التذكرة — قد تكون لديك تذكرة مفتوحة أو النظام متوقف.',
    );
    return;
  }

  if (id === 'ticket:claim' || id === 'ticket:unclaim') {
    if (!(await isTicketStaffInteraction(interaction))) {
      await interaction.reply({ content: TICKET_STAFF_ONLY, ...EPH });
      return;
    }
    const claim = id === 'ticket:claim';
    const updated = await setClaim(interaction.guild, prisma, interaction.channelId, interaction.user.id, claim);
    if (!updated) {
      await interaction.reply({ content: '❌ هذه القناة ليست تذكرة مفتوحة.', ...EPH });
      return;
    }
    await interaction.update({ components: [ticketControlsRow(claim)] }).catch(() => undefined);
    await interaction
      .followUp({
        content: claim
          ? `🙋 تم استلام التذكرة بواسطة <@${interaction.user.id}>`
          : `↩️ تم فك الاستلام بواسطة <@${interaction.user.id}>`,
        allowedMentions: { parse: [] },
      })
      .catch(() => undefined);
    return;
  }

  if (id === 'ticket:close') {
    await interaction
      .reply({ content: 'متأكد إنك تبي تغلق التذكرة؟ بتُحفظ نسخة وتُحذف القناة.', components: [closeConfirmRow()], ...EPH })
      .catch(() => undefined);
    return;
  }

  if (id === 'ticket:close:cancel') {
    await interaction.update({ content: 'تم الإلغاء.', components: [] }).catch(() => undefined);
    return;
  }

  if (id === 'ticket:close:confirm') {
    await interaction.update({ content: '🔒 يتم إغلاق التذكرة...', components: [] }).catch(() => undefined);
    await closeTicket(interaction.guild, prisma, interaction.channelId, interaction.user.id);
    return;
  }

  if (id.startsWith('ticket:reopen:')) {
    if (!(await isTicketStaffInteraction(interaction))) {
      await interaction.reply({ content: TICKET_STAFF_ONLY, ...EPH });
      return;
    }
    await interaction.deferReply(EPH);
    const channel = await reopenTicket(interaction.guild, prisma, id.slice('ticket:reopen:'.length), interaction.user.id);
    await interaction.editReply(channel ? `✅ تم إعادة فتح التذكرة: <#${channel.id}>` : '❌ تعذّر إعادة الفتح.');
    return;
  }
}

async function handleTicketSelect(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!interaction.guild) return;
  await interaction.deferReply(EPH);
  const channel = await openTicket(interaction.guild, prisma, interaction.user.id, interaction.values[0]);
  await interaction.editReply(
    channel
      ? `✅ تم فتح تذكرتك: <#${channel.id}>`
      : '❌ تعذّر فتح التذكرة — قد تكون لديك تذكرة مفتوحة أو النظام متوقف.',
  );
}

async function handleGiveawayButton(interaction: ButtonInteraction): Promise<void> {
  const id = interaction.customId.slice(3); // strip "gw:"
  const g = await prisma.giveaway.findUnique({ where: { id } });
  if (!g || g.ended) {
    await interaction.reply({ content: '❌ هذا السحب انتهى.', ...EPH });
    return;
  }
  const uid = interaction.user.id;
  const inside = g.entrants.includes(uid);
  // Join uses an atomic push (duplicates are harmless — pickWinners dedupes). Leave
  // is a rare read-modify-write, acceptable since double-leave just no-ops.
  await prisma.giveaway.update({
    where: { id },
    data: inside ? { entrants: g.entrants.filter((x) => x !== uid) } : { entrants: { push: uid } },
  });
  await interaction.reply({ content: inside ? '➖ خرجت من السحب.' : '🎉 دخلت السحب، بالتوفيق!', ...EPH });
}

async function handleSuggestionVote(interaction: ButtonInteraction): Promise<void> {
  const [, dir, id] = interaction.customId.split(':'); // sg:up:<id>
  const s = await prisma.suggestion.findUnique({ where: { id } });
  if (!s || s.status !== 'pending') {
    await interaction.reply({ content: '❌ انتهى التصويت على هذا الاقتراح.', ...EPH });
    return;
  }
  if (s.voters.includes(interaction.user.id)) {
    await interaction.reply({ content: '🗳️ صوّتّ على هذا الاقتراح من قبل.', ...EPH });
    return;
  }
  // Atomic increment (the voters guard above prevents an individual from double-voting).
  const updated = await prisma.suggestion.update({
    where: { id },
    data: { ...(dir === 'up' ? { up: { increment: 1 } } : { down: { increment: 1 } }), voters: { push: interaction.user.id } },
  });
  await interaction.update(buildSuggestionMessage(updated)).catch(() => undefined);
}

module.exports = {
  name: 'interactionCreate',
  once: false,
  async execute(interaction: Interaction, commands: Collection<string, any>) {
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith('rr:')) await handleRoleButton(interaction).catch(() => undefined);
      else if (id.startsWith('ticket:')) await handleTicketButton(interaction).catch(() => undefined);
      else if (id.startsWith('gw:')) await handleGiveawayButton(interaction).catch(() => undefined);
      else if (id.startsWith('sg:')) await handleSuggestionVote(interaction).catch(() => undefined);
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket:type') await handleTicketSelect(interaction).catch(() => undefined);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const command = commands.get(interaction.commandName);
    if (!command) {
      logger.warning(`Unknown command: ${interaction.commandName}`);
      return;
    }
    try {
      await command.execute(interaction);
      logger.info(`Command executed: /${interaction.commandName} by ${interaction.user.tag}`);
    } catch (error) {
      logger.error(`Error in command ${interaction.commandName}: ${error}`);
      const payload = { content: '❌ صار خطأ أثناء تنفيذ الأمر!', ...EPH };
      if (interaction.replied || interaction.deferred) await interaction.followUp(payload).catch(() => undefined);
      else await interaction.reply(payload).catch(() => undefined);
    }
  },
};
