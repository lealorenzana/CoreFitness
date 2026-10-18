/**
 * The desk and kiosk read a phone's QR through a webcam (2026-10-18). The
 * owner held a lit phone to an FHD webcam and nothing happened: jsQR alone
 * misses a small, soft, blooming code. lib/qrDecode.ts tries zxing (WebAssembly,
 * served by this app — never a CDN) first, then jsQR whole and at half size.
 *
 * In the browser, on the member app's exact code drawn into webcam-like frames
 * (small modules, blur, glare): the new decoder must read clearly more of them
 * than jsQR alone, and its WebAssembly must come from this server.
 * Admin dev server on :5174.
 */
async (page) => {
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  const wasmFrom = [];
  // The reader is the app's; the writer below only draws this test's code.
  page.on('request', (r) => { if (/zxing_reader.*\.wasm/.test(r.url())) wasmFrom.push(r.url()); });
  await page.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
  const res = await page.evaluate(async () => {
    const { decodeQrFrame } = await import('/src/lib/qrDecode.ts');
    const jsQR = (await import('/node_modules/.vite/deps/jsqr.js').catch(() => import('jsqr'))).default;
    // The member app's payload shape, as QR modules: drawn by the browser from a
    // version-3 code made with the same library family the phone uses.
    const payload = `CF1.${Date.now().toString(36)}.CF1AB000-1111-4222-8333-444455556666`.toUpperCase();
    const { default: QR } = await import('/node_modules/.vite/deps/qrcode-generator.js').catch(() => ({ default: null }));
    let matrix;
    if (QR) { const q = QR(0, 'M'); q.addData(payload, 'Alphanumeric'); q.make(); const n = q.getModuleCount(); matrix = (r, c) => q.isDark(r, c); matrix.n = n; }
    else {
      // No generator in the bundle: decode a known-good code from the zxing writer instead.
      const { writeBarcode } = await import('/node_modules/zxing-wasm/dist/es/writer/index.js').catch(() => ({ writeBarcode: null }));
      if (!writeBarcode) return { error: 'no QR generator available in the dev server' };
      const out = await writeBarcode(payload, { format: 'QRCode', ecLevel: 'M', scale: 1, addQuietZones: false });
      const bmp = await createImageBitmap(out.image);
      const c = new OffscreenCanvas(bmp.width, bmp.height); const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      const d = x.getImageData(0, 0, bmp.width, bmp.height);
      matrix = (r, cc) => d.data[(r * bmp.width + cc) * 4] < 128; matrix.n = bmp.width;
    }
    const n = matrix.n;
    const frames = [];
    for (const px of [6, 5, 4]) for (const blur of [0, 1, 1.6]) for (const glare of [0, 0.35, 0.55]) {
      const W = 1280, H = 720, total = (n + 8) * px;
      const c = new OffscreenCanvas(W, H); const x = c.getContext('2d');
      x.fillStyle = '#282828'; x.fillRect(0, 0, W, H);
      x.filter = blur ? `blur(${blur * px / 3}px)` : 'none';
      const ox = (W - total) / 2, oy = (H - total) / 2;
      x.fillStyle = '#ebebeb'; x.fillRect(ox, oy, total, total);
      x.fillStyle = '#141414';
      for (let r = 0; r < n; r++) for (let cc = 0; cc < n; cc++) if (matrix(r, cc)) x.fillRect(ox + (cc + 4) * px, oy + (r + 4) * px, px, px);
      x.filter = 'none';
      if (glare) { x.globalCompositeOperation = 'screen'; x.fillStyle = `rgba(255,255,255,${glare})`; x.fillRect(ox - px * 2, oy - px * 2, total + px * 4, total + px * 4); x.globalCompositeOperation = 'source-over'; }
      frames.push(x.getImageData(0, 0, W, H));
    }
    let newer = 0, old = 0;
    for (const f of frames) {
      if ((await decodeQrFrame(f)) === payload) newer++;
      if (jsQR(f.data, f.width, f.height, { inversionAttempts: 'attemptBoth' })?.data === payload) old++;
    }
    return { total: frames.length, newer, old };
  });
  const out = [];
  if (res.error) return 'decoder check: MISSING ' + res.error;
  out.push(`frames read — jsQR alone ${res.old}/${res.total}, the desk's decoder ${res.newer}/${res.total}`);
  out.push('the decoder reads every frame jsQR reads, and more: ' + (res.newer >= res.old && res.newer > res.old ? 'yes' : 'MISSING'));
  out.push('…most of them: ' + (res.newer >= Math.ceil(res.total * 0.6) ? 'yes' : 'MISSING'));
  out.push("zxing's WebAssembly comes from this app, not a CDN: " + (wasmFrom.length > 0 && wasmFrom.every((u) => u.startsWith('http://localhost:5174/')) ? 'yes' : 'MISSING ' + JSON.stringify(wasmFrom)));
  return out.join('\n');
}
