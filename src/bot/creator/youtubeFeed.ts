import type { ContentItem } from './types';

/** Decode the handful of XML entities that appear in YouTube feed titles. `&amp;` is decoded last. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Parse a YouTube channel Atom feed into content items, newest first.
 * The feed is stable, simple XML, so a focused parser beats pulling in an XML dependency.
 */
export function parseYouTubeFeed(xml: string): ContentItem[] {
  const items: ContentItem[] = [];
  for (const chunk of xml.split('<entry>').slice(1)) {
    const block = chunk.split('</entry>')[0];
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(block)?.[1];
    if (!id) continue;
    const title = decodeEntities(/<title>([\s\S]*?)<\/title>/.exec(block)?.[1] ?? '').trim();
    const published = /<published>([^<]+)<\/published>/.exec(block)?.[1];
    items.push({
      id,
      title: title || 'فيديو جديد',
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      publishedAt: published ? new Date(published) : undefined,
    });
  }
  items.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return items;
}

/** Fetch and parse a channel's latest uploads via its public Atom feed (no API key). */
export async function fetchYouTubeUploads(
  channelId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ContentItem[]> {
  const res = await fetchImpl(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`,
  );
  if (!res.ok) throw new Error(`YouTube feed HTTP ${res.status}`);
  return parseYouTubeFeed(await res.text());
}

const UC_RE = /^UC[\w-]{20,}$/;

/**
 * Resolve a user-supplied YouTube reference (channel id, channel URL, or @handle/custom URL)
 * into a canonical `UC…` channel id. Channel ids and `/channel/UC…` URLs resolve offline;
 * handles require fetching the channel page and scraping the embedded channel id.
 * Returns null when it can't be resolved.
 */
export async function resolveYouTubeChannelId(
  input: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const raw = input.trim();
  if (!raw) return null;
  if (UC_RE.test(raw)) return raw;
  const inUrl = /channel\/(UC[\w-]{20,})/.exec(raw);
  if (inUrl) return inUrl[1];

  let url = raw;
  if (!/^https?:\/\//.test(url)) {
    url = raw.startsWith('@') ? `https://www.youtube.com/${raw}` : `https://www.youtube.com/@${raw}`;
  }
  const res = await fetchImpl(url, { headers: { 'accept-language': 'en' } }).catch(() => null);
  if (!res || !res.ok) return null;
  const html = await res.text();
  const m = /"channelId":"(UC[\w-]{20,})"/.exec(html) ?? /channel\/(UC[\w-]{20,})/.exec(html);
  return m ? m[1] : null;
}
