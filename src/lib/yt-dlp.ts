import { env } from '@/lib/constants';
import type { socialMediaResult } from '@/lib/types';
import { selectBestFoodThumbnail } from '@/lib/ai';
import { YtDlp, type VideoInfo } from 'ytdlp-nodejs';

const ytdlp = new YtDlp({
  ffmpegPath: env.FFMPEG_PATH,
  binaryPath: env.YTDLP_PATH,
});

export async function downloadMediaWithYtDlp(
  url: string,
): Promise<socialMediaResult> {
  try {
    // Get video metadata first
    const metadata = (await ytdlp.getInfoAsync(url, {
      cookies: env.COOKIES,
    })) as VideoInfo;

    // Get audio stream as a file/buffer
    // ytdlp-nodejs 'getFileAsync' with filter 'audioonly' retrieves the audio
    // and allows accessing it via .bytes() which returns a Uint8Array
    const audioFile = await ytdlp.getFileAsync(url, {
      format: { filter: 'audioonly' },
      cookies: env.COOKIES,
    });

    const buffer = await audioFile.bytes();

    // Get the best quality thumbnail
    // yt-dlp provides thumbnails array with multiple resolutions
    // Use AI to select the best food-related thumbnail
    let thumbnail = metadata.thumbnail || '';
    if (metadata.thumbnails && metadata.thumbnails.length > 0) {
      console.log(
        `\nFound ${metadata.thumbnails.length} thumbnails, using AI to select best food thumbnail...`,
      );

      // Filter out very small thumbnails (likely icons/avatars)
      const qualityThumbnails = metadata.thumbnails.filter(t => {
        const width = Number(t.width) || 0;
        const height = Number(t.height) || 0;
        return width >= 200 && height >= 200; // Minimum size threshold
      });

      if (qualityThumbnails.length > 1) {
        // Use AI to select the best food thumbnail
        const thumbnailUrls = qualityThumbnails.map(t => t.url);
        const selectedThumbnail = await selectBestFoodThumbnail(thumbnailUrls);
        thumbnail = selectedThumbnail || thumbnail;
        console.log('AI selected thumbnail:', thumbnail);
      } else if (qualityThumbnails.length === 1) {
        thumbnail = qualityThumbnails[0].url;
        console.log('Using single quality thumbnail:', thumbnail);
      } else {
        // Fallback to highest resolution if no quality thumbnails
        const sortedThumbnails = [...metadata.thumbnails].sort((a, b) => {
          const aWidth = Number(a.width) || 0;
          const aHeight = Number(a.height) || 0;
          const bWidth = Number(b.width) || 0;
          const bHeight = Number(b.height) || 0;
          const aPixels = aWidth * aHeight;
          const bPixels = bWidth * bHeight;
          return bPixels - aPixels;
        });
        thumbnail = sortedThumbnails[0].url || thumbnail;
        console.log('Using fallback highest resolution thumbnail:', thumbnail);
      }
    }

    return {
      blob: new Blob([buffer], { type: 'audio/wav' }), // Using wav as generic container for processed audio or source
      thumbnail,
      description: metadata.description || 'No description found',
      title: metadata.title,
    };
  } catch (error) {
    console.error('Error in downloadMediaWithYtDlp:', error);
    throw new Error('Failed to download media or metadata');
  }
}
