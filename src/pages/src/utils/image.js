// Simple image compressor: downscale to maxWidth (keeps aspect) and export as JPEG
// Returns a data URL. If anything fails, returns the original dataUrl.
export async function compressDataUrl(dataUrl, { maxWidth = 800, quality = 0.7 } = {}) {
  try {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return dataUrl;
    // Create image
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = dataUrl;
    });
    const scale = img.width > maxWidth ? (maxWidth / img.width) : 1;
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);
    const out = canvas.toDataURL('image/jpeg', quality);
    // If compression got larger (unlikely), fallback to original
    if (typeof out === 'string' && out.length < dataUrl.length) return out;
    return dataUrl;
  } catch {
    return dataUrl;
  }
}

export async function compressMany(dataUrls, opts) {
  const arr = Array.isArray(dataUrls) ? dataUrls : [];
  const out = [];
  for (const u of arr) out.push(await compressDataUrl(u, opts));
  return out;
}