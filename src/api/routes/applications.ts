import { Router } from 'express';
import type { PrismaClient } from '@prisma/client';
import type { Client, TextChannel } from 'discord.js';
import type { AppConfig } from '../../shared/config';
import { applyPanelEmbed, applyButtonRow } from '../../bot/applications';
import { planLimit } from '../middleware/entitlements';
import { tenantGuildId } from '../middleware/tenant';

export interface ApplicationsDeps {
  client: Client;
  prisma: PrismaClient;
  config: Pick<AppConfig, 'guildId'>;
}

const optStr = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s ? s : null;
};

type NormQuestions = { ok: true; data: { label: string; style: string; required: boolean; position: number }[] } | { ok: false; error: string };

function normalizeQuestions(raw: unknown): NormQuestions {
  if (!Array.isArray(raw)) return { ok: false, error: 'questions must be an array' };
  if (raw.length < 1 || raw.length > 5) return { ok: false, error: 'questions must be 1..5 items (Discord modal limit)' };
  const data = raw.map((q, i) => {
    const o = (q ?? {}) as Record<string, unknown>;
    return {
      label: String(o.label ?? '').trim(),
      style: o.style === 'paragraph' ? 'paragraph' : 'short',
      required: o.required === undefined ? true : Boolean(o.required),
      position: i,
    };
  });
  if (data.some((d) => !d.label || d.label.length > 45)) return { ok: false, error: 'each question label is required (≤45 chars)' };
  return { ok: true, data };
}

export function createApplicationsRouter(deps: ApplicationsDeps): Router {
  const router = Router();
  const { client, prisma } = deps;

  router.get('/', async (req, res) => {
    const guildId = tenantGuildId(req);
    const [forms, submissions] = await Promise.all([
      prisma.applicationForm.findMany({
        where: { guildId },
        include: { questions: { orderBy: { position: 'asc' } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.applicationSubmission.findMany({ where: { guildId }, orderBy: { createdAt: 'desc' }, take: 50 }),
    ]);
    res.json({ forms, submissions });
  });

  router.post('/forms', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const name = String(b.name ?? '').trim();
    if (!name || name.length > 80) return res.status(400).json({ error: 'name required (≤80 chars)' });
    const q = normalizeQuestions(b.questions);
    if (!q.ok) return res.status(400).json({ error: q.error });
    const limit = await planLimit(guildId, 'applicationForms');
    if ((await prisma.applicationForm.count({ where: { guildId } })) >= limit) {
      return res.status(403).json({ error: 'limit reached', upgrade: true, limit });
    }
    const form = await prisma.applicationForm.create({
      data: {
        guildId,
        name,
        description: optStr(b.description),
        reviewChannelId: optStr(b.reviewChannelId),
        acceptRoleId: optStr(b.acceptRoleId),
        enabled: b.enabled === undefined ? true : Boolean(b.enabled),
        questions: { create: q.data },
      },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    res.status(201).json(form);
  });

  router.put('/forms/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    const b = (req.body ?? {}) as Record<string, unknown>;
    const existing = await prisma.applicationForm.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.guildId !== guildId) return res.status(404).json({ error: 'not found' });
    const data: Record<string, unknown> = {};
    if (b.name !== undefined) {
      const name = String(b.name).trim();
      if (!name || name.length > 80) return res.status(400).json({ error: 'name required (≤80 chars)' });
      data.name = name;
    }
    if (b.description !== undefined) data.description = optStr(b.description);
    if (b.reviewChannelId !== undefined) data.reviewChannelId = optStr(b.reviewChannelId);
    if (b.acceptRoleId !== undefined) data.acceptRoleId = optStr(b.acceptRoleId);
    if (b.enabled !== undefined) data.enabled = Boolean(b.enabled);

    if (b.questions !== undefined) {
      const q = normalizeQuestions(b.questions);
      if (!q.ok) return res.status(400).json({ error: q.error });
      await prisma.applicationQuestion.deleteMany({ where: { formId: existing.id } });
      data.questions = { create: q.data };
    }
    const form = await prisma.applicationForm.update({
      where: { id: existing.id },
      data,
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    res.json(form);
  });

  router.delete('/forms/:id', async (req, res) => {
    const guildId = tenantGuildId(req);
    // Ownership check first — a foreign guild's form id must 404, not delete.
    const existing = await prisma.applicationForm.findUnique({ where: { id: req.params.id } });
    if (!existing || existing.guildId !== guildId) return res.status(404).json({ error: 'not found' });
    // Submissions have no DB cascade (plain formId column) — delete them explicitly,
    // tenant-scoped. Questions cascade via the relation's onDelete.
    await prisma.applicationSubmission.deleteMany({ where: { guildId, formId: existing.id } }).catch(() => undefined);
    await prisma.applicationForm.delete({ where: { id: existing.id } }).catch(() => undefined);
    res.json({ ok: true });
  });

  router.post('/forms/:id/panel', async (req, res) => {
    const guildId = tenantGuildId(req);
    const channelId = String((req.body as Record<string, unknown>)?.channelId ?? '').trim();
    if (!channelId) return res.status(400).json({ error: 'channelId required' });
    const form = await prisma.applicationForm.findUnique({ where: { id: req.params.id } });
    if (!form || form.guildId !== guildId) return res.status(404).json({ error: 'not found' });
    const channel = client.channels.cache.get(channelId) as TextChannel | undefined;
    if (!channel?.isTextBased?.()) return res.status(400).json({ error: 'invalid channel' });
    const msg = await channel
      .send({ embeds: [applyPanelEmbed(form.name, form.description)], components: [applyButtonRow(form.id)] })
      .catch(() => null);
    if (!msg) return res.status(400).json({ error: 'could not post panel' });
    res.json({ ok: true });
  });

  return router;
}
