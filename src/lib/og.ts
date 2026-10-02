import { getImage } from 'astro:assets';
import type { Photo } from './data';

export type OgImage = { src: string; alt: string };

export async function ogFromPhoto(photo: Photo | undefined): Promise<OgImage | undefined> {
  if (!photo) return undefined;
  const image = await getImage({ src: photo.src, width: 1200, height: 630, fit: 'cover', format: 'jpg', quality: 80 });
  return { src: image.src, alt: photo.alt };
}
