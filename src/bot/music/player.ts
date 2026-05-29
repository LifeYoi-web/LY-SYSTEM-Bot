import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

const ORANGE = 0xf57c00; // LY brand

export type LoopMode = 'off' | 'track' | 'queue';

const LOOP_LABEL: Record<LoopMode, string> = { off: 'إيقاف', track: 'المقطع', queue: 'القائمة' };
export function loopLabel(m: string): string {
  return LOOP_LABEL[(m as LoopMode)] ?? m;
}

/** Cycle the loop mode for the 🔁 button: off → track → queue → off. */
export function nextLoopMode(m: LoopMode): LoopMode {
  return m === 'off' ? 'track' : m === 'track' ? 'queue' : 'off';
}

/** ms → `H:MM:SS` / `M:SS`; live streams render as a marker. */
export function formatDuration(ms: number, isStream = false): string {
  if (isStream) return '🔴 مباشر';
  if (!Number.isFinite(ms) || ms <= 0) return '0:00';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Clamp a requested volume into 0–150; null if not a finite number. */
export function coerceVolume(v: unknown): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(150, Math.round(n)));
}

/** Parse a seek argument: plain seconds (`90`), `mm:ss`, `h:mm:ss`, or `1h2m3s`. ms, or null if invalid. */
export function parseSeek(input: string): number | null {
  const s = input.trim().toLowerCase();
  if (!s) return null;
  if (/^\d+$/.test(s)) return Number(s) * 1000;
  if (/^\d+(:\d{1,2}){1,2}$/.test(s)) {
    let sec = 0;
    for (const part of s.split(':')) sec = sec * 60 + Number(part);
    return sec * 1000;
  }
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(s);
  if (m && (m[1] || m[2] || m[3])) {
    return (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000;
  }
  return null;
}

/** The precondition error (Arabic) for using a control command, or null when allowed. */
export function voiceError(
  memberVoiceChannelId: string | null | undefined,
  botVoiceChannelId: string | null | undefined,
): string | null {
  if (!memberVoiceChannelId) return 'ادخل روم صوتي أول 🎙️';
  if (botVoiceChannelId && memberVoiceChannelId !== botVoiceChannelId) {
    return 'لازم تكون بنفس الروم الصوتي مع البوت.';
  }
  return null;
}

/** Minimal track shape the formatters need — keeps these helpers testable without lavalink-client. */
export interface TrackLike {
  info: { title: string; author: string; duration: number; uri: string; artworkUrl: string | null; isStream: boolean };
  requester?: unknown;
}

export function requesterMention(track: { requester?: unknown }): string {
  const r = track.requester as { id?: string } | undefined;
  return r?.id ? `<@${r.id}>` : 'غير معروف';
}

/** Build one page of the queue as display lines + total page count. */
export function queueLines(
  tracks: TrackLike[],
  page = 0,
  perPage = 10,
): { lines: string[]; totalPages: number; page: number } {
  const totalPages = Math.max(1, Math.ceil(tracks.length / perPage));
  const p = Math.max(0, Math.min(page, totalPages - 1));
  const start = p * perPage;
  const lines = tracks.slice(start, start + perPage).map(
    (t, i) => `**${start + i + 1}.** ${t.info.title.slice(0, 60)} \`${formatDuration(t.info.duration, t.info.isStream)}\``,
  );
  return { lines, totalPages, page: p };
}

export interface PlayerState {
  volume: number;
  repeatMode: string;
  paused: boolean;
}

/** The ▶️/⏸️ · ⏭️ · ⏹️ · 🔁 · 🔀 control row for the now-playing message. */
export function buildControlRow(paused: boolean): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('mu:toggle').setStyle(ButtonStyle.Secondary).setLabel(paused ? '▶️ تشغيل' : '⏸️ إيقاف'),
    new ButtonBuilder().setCustomId('mu:skip').setStyle(ButtonStyle.Secondary).setLabel('⏭️ تخطّي'),
    new ButtonBuilder().setCustomId('mu:stop').setStyle(ButtonStyle.Danger).setLabel('⏹️ إيقاف'),
    new ButtonBuilder().setCustomId('mu:loop').setStyle(ButtonStyle.Secondary).setLabel('🔁 تكرار'),
    new ButtonBuilder().setCustomId('mu:shuffle').setStyle(ButtonStyle.Secondary).setLabel('🔀 خلط'),
  );
}

/** The "now playing" embed + control row. */
export function buildNowPlaying(track: TrackLike, state: PlayerState) {
  const { info } = track;
  const embed = new EmbedBuilder()
    .setColor(ORANGE)
    .setAuthor({ name: '🎵 يشتغل الآن' })
    .setTitle(info.title.slice(0, 256))
    .setURL(info.uri)
    .addFields(
      { name: 'الفنان', value: info.author || '—', inline: true },
      { name: 'المدة', value: formatDuration(info.duration, info.isStream), inline: true },
      { name: 'بطلب من', value: requesterMention(track), inline: true },
    )
    .setFooter({ text: `الصوت ${state.volume}% · التكرار: ${loopLabel(state.repeatMode)}` });
  if (info.artworkUrl) embed.setThumbnail(info.artworkUrl);
  return { embeds: [embed], components: [buildControlRow(state.paused)] };
}
