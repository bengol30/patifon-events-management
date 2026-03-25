import sharp from 'sharp';

export async function convertImageUrlToStoryBuffer(imageUrl: string, background = '#1a1a1a') {
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`Failed to download source image: ${res.status}`);
  const input = Buffer.from(await res.arrayBuffer());
  const meta = await sharp(input).rotate().metadata();
  const srcWidth = meta.width || 1080;
  const srcHeight = meta.height || 1080;

  const targetW = 1080;
  const targetH = 1920;
  const scale = Math.min(targetW / srcWidth, targetH / srcHeight);
  const width = Math.max(1, Math.round(srcWidth * scale));
  const height = Math.max(1, Math.round(srcHeight * scale));
  const left = Math.floor((targetW - width) / 2);
  const top = Math.floor((targetH - height) / 2);

  return sharp({
    create: {
      width: targetW,
      height: targetH,
      channels: 3,
      background,
    },
  })
    .composite([
      {
        input: await sharp(input).rotate().resize(width, height, { fit: 'fill' }).jpeg({ quality: 92 }).toBuffer(),
        left,
        top,
      },
    ])
    .jpeg({ quality: 92 })
    .toBuffer();
}
