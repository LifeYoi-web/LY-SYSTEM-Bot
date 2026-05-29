/** A single piece of creator content (a YouTube upload or a TikTok post). */
export interface ContentItem {
  /** Platform-native id, used for de-duplication. */
  id: string;
  title: string;
  /** Public watch URL. */
  url: string;
  /** Optional preview image. */
  thumbnail?: string;
  publishedAt?: Date;
}

export type Platform = 'youtube' | 'tiktok';
