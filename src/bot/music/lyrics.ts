// Keyless lyrics lookup via the free lyrics.ovh API. Best-effort: returns null when the
// track can't be matched, so the feature degrades gracefully with no config required.

/** Strip "(feat ...)", "[Official Video]", "ft. ..." noise that breaks exact-match lookups. */
function clean(s: string): string {
  return s
    .replace(/\(.*?\)|\[.*?\]/g, '')
    .replace(/\b(feat\.?|ft\.?)\b.*$/i, '')
    .replace(/official\s*(music\s*)?video|lyrics?|audio|hd|4k/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface LyricsResult {
  title: string;
  lyrics: string;
}

export async function fetchLyrics(title: string, author: string): Promise<LyricsResult | null> {
  const a = clean(author);
  const t = clean(title);
  if (!t) return null;
  // When there's no separate author, many Lavalink titles are "Artist - Song".
  const [artist, song] = a ? [a, t] : t.includes(' - ') ? t.split(' - ').map((x) => x.trim()) : ['', t];
  if (!artist) return null;
  try {
    const res = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(artist)}/${encodeURIComponent(song)}`);
    if (!res.ok) return null;
    const data = (await res.json()) as { lyrics?: string };
    const lyrics = data.lyrics?.trim();
    if (!lyrics) return null;
    return { title: `${artist} — ${song}`, lyrics };
  } catch {
    return null;
  }
}

/** Read the current track's title/author off a Lavalink player (loose shape to avoid the dep). */
export function currentTrackInfo(player: unknown): { title: string; author: string } | null {
  const cur = (player as { queue?: { current?: { info?: { title?: string; author?: string } } } } | undefined)?.queue?.current;
  if (!cur?.info?.title) return null;
  return { title: cur.info.title, author: cur.info.author ?? '' };
}

/** Split lyrics into <=4096-char chunks for paginated embeds. */
export function paginateLyrics(lyrics: string, size = 3900): string[] {
  const pages: string[] = [];
  const lines = lyrics.split('\n');
  let buf = '';
  for (const line of lines) {
    if (buf.length + line.length + 1 > size) {
      pages.push(buf);
      buf = '';
    }
    buf += line + '\n';
  }
  if (buf.trim()) pages.push(buf);
  return pages.length ? pages : [lyrics.slice(0, size)];
}
