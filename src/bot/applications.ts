import {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Guild,
  type TextChannel,
} from 'discord.js';
import type { PrismaClient } from '@prisma/client';

const ORANGE = 0xf57c00;

/** The "apply" button row that gets posted in a public channel for a given form. */
export function applyButtonRow(formId: string, label = 'تقديم الطلب'): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`app:start:${formId}`).setLabel(label.slice(0, 80)).setStyle(ButtonStyle.Primary).setEmoji('📝'),
  );
}

export function applyPanelEmbed(name: string, description?: string | null): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(ORANGE)
    .setTitle(`📋 ${name}`)
    .setDescription(description || 'اضغط الزر بالأسفل لتعبئة الطلب.');
}

/** Build the modal a member fills in. Discord caps modals at 5 inputs. */
export async function buildApplyModal(prisma: PrismaClient, formId: string): Promise<ModalBuilder | null> {
  const form = await prisma.applicationForm.findUnique({
    where: { id: formId },
    include: { questions: { orderBy: { position: 'asc' } } },
  });
  if (!form || !form.enabled || !form.questions.length) return null;
  const modal = new ModalBuilder().setCustomId(`app:submit:${formId}`).setTitle(form.name.slice(0, 45));
  for (const q of form.questions.slice(0, 5)) {
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId(q.id)
          .setLabel(q.label.slice(0, 45))
          .setStyle(q.style === 'paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(q.required)
          .setMaxLength(q.style === 'paragraph' ? 1000 : 300),
      ),
    );
  }
  return modal;
}

/** Persist a submission and post it to the review channel with accept/deny buttons. */
export async function submitApplication(
  guild: Guild,
  prisma: PrismaClient,
  formId: string,
  userId: string,
  getValue: (questionId: string) => string,
): Promise<boolean> {
  const form = await prisma.applicationForm.findUnique({
    where: { id: formId },
    include: { questions: { orderBy: { position: 'asc' } } },
  });
  if (!form || !form.enabled) return false;
  const answers = form.questions.slice(0, 5).map((q) => ({ label: q.label, answer: (getValue(q.id) || '—').slice(0, 1024) }));
  const sub = await prisma.applicationSubmission.create({ data: { guildId: guild.id, formId, userId, answers } });

  if (form.reviewChannelId) {
    const channel = guild.channels.cache.get(form.reviewChannelId) as TextChannel | undefined;
    if (channel?.isTextBased?.()) {
      const embed = new EmbedBuilder()
        .setColor(ORANGE)
        .setTitle(`📝 طلب جديد: ${form.name}`)
        .setDescription(`مقدّم الطلب: <@${userId}>`)
        .addFields(answers.map((a) => ({ name: a.label.slice(0, 256), value: a.answer || '—' })))
        .setTimestamp();
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(`app:accept:${sub.id}`).setLabel('قبول').setStyle(ButtonStyle.Success).setEmoji('✅'),
        new ButtonBuilder().setCustomId(`app:deny:${sub.id}`).setLabel('رفض').setStyle(ButtonStyle.Danger).setEmoji('✖️'),
      );
      const msg = await channel.send({ embeds: [embed], components: [row], allowedMentions: { parse: [] } }).catch(() => null);
      if (msg) await prisma.applicationSubmission.update({ where: { id: sub.id }, data: { messageId: msg.id } }).catch(() => undefined);
    }
  }
  return true;
}

/** Accept or deny a submission: update status, grant the accept-role, DM the applicant. */
export async function decideApplication(
  guild: Guild,
  prisma: PrismaClient,
  submissionId: string,
  reviewerId: string,
  accept: boolean,
): Promise<{ ok: boolean; userId?: string }> {
  const sub = await prisma.applicationSubmission.findUnique({ where: { id: submissionId } });
  if (!sub || sub.status !== 'pending') return { ok: false };
  const form = await prisma.applicationForm.findUnique({ where: { id: sub.formId } });
  await prisma.applicationSubmission.update({
    where: { id: sub.id },
    data: { status: accept ? 'accepted' : 'denied', reviewedBy: reviewerId },
  });
  if (accept && form?.acceptRoleId) {
    const m = await guild.members.fetch(sub.userId).catch(() => null);
    await m?.roles.add(form.acceptRoleId, 'Application accepted').catch(() => undefined);
  }
  const user = await guild.client.users.fetch(sub.userId).catch(() => null);
  await user
    ?.send(
      accept
        ? `✅ تم قبول طلبك "${form?.name ?? ''}" في **${guild.name}**!`
        : `✖️ نعتذر، تم رفض طلبك "${form?.name ?? ''}" في **${guild.name}**.`,
    )
    .catch(() => undefined);
  return { ok: true, userId: sub.userId };
}
