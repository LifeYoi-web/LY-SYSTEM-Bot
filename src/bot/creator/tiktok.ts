import type { ContentItem } from './types';

/** Default RapidAPI TikTok provider; overridable via RAPIDAPI_TIKTOK_HOST. */
export const DEFAULT_TIKTOK_HOST = 'tiktok-scraper7.p.rapidapi.com';

function firstArray(json: any): any[] {
  const candidates = [
    json?.data?.videos,
    json?.data?.itemList,
    json?.data?.aweme_list,
    json?.itemList,
    json?.aweme_list,
    json?.videos,
    Array.isArray(json?.data) ? json.data : undefined,
    Array.isArray(json) ? json : undefined,
  ];
  return candidates.find((c) => Array.isArray(c)) ?? [];
}

/**
 * Parse a RapidAPI TikTok scraper response into content items, newest first.
 * TikTok has no official feed, and providers differ, so this reads defensively across the
 * common field names rather than binding to one provider's exact shape.
 */
export function parseTikTokResponse(json: any, username: string): ContentItem[] {
  const out: ContentItem[] = [];
  for (const v of firstArray(json)) {
    const id = String(v?.video_id ?? v?.aweme_id ?? v?.id ?? v?.video?.id ?? '').trim();
    if (!id) continue;
    const title = String(v?.title ?? v?.desc ?? v?.description ?? '').trim() || 'مقطع جديد';
    const ct = Number(v?.create_time ?? v?.createTime ?? v?.create_at ?? 0);
    const cover = v?.cover ?? v?.origin_cover ?? v?.ai_dynamic_cover ?? v?.video?.cover;
    out.push({
      id,
      title,
      url: String(v?.share_url ?? v?.url ?? `https://www.tiktok.com/@${username}/video/${id}`),
      thumbnail: cover ? String(cover) : undefined,
      publishedAt: ct ? new Date(ct * 1000) : undefined,
    });
  }
  out.sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0));
  return out;
}

/** Fetch a user's latest TikTok posts through a RapidAPI scraper. Throws on a non-OK response. */
export async function fetchTikTokUploads(
  username: string,
  key: string,
  host: string = DEFAULT_TIKTOK_HOST,
  fetchImpl: typeof fetch = fetch,
): Promise<ContentItem[]> {
  const u = username.replace(/^@/, '').trim();
  const res = await fetchImpl(
    `https://${host}/user/posts?unique_id=${encodeURIComponent(u)}&count=10`,
    { headers: { 'x-rapidapi-key': key, 'x-rapidapi-host': host } },
  );
  if (!res.ok) throw new Error(`TikTok API HTTP ${res.status}`);
  return parseTikTokResponse(await res.json(), u);
}
