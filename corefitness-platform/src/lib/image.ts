/**
 * A picture, made small enough to keep in a database row (0148): drawn onto a
 * canvas no wider or taller than `max`, and exported as PNG for a QR code
 * (its sharp edges must survive scanning) or JPEG for a photo.
 */
export async function shrinkImage(file: File, max: number, kind: 'qr' | 'photo'): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose a picture (PNG or JPG).');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => fail(new Error('That picture could not be read.'));
      i.src = url;
    });
    const scale = Math.min(1, max / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * scale));
    c.height = Math.max(1, Math.round(img.height * scale));
    const g = c.getContext('2d');
    if (!g) throw new Error('This browser cannot resize pictures.');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = kind === 'photo';
    g.drawImage(img, 0, 0, c.width, c.height);
    return kind === 'qr' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.8);
  } finally {
    URL.revokeObjectURL(url);
  }
}
