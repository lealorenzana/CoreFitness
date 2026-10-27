import jsQR from 'jsqr';
import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';
import zxingWasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

/**
 * Reading a phone's QR off a webcam frame — shared by the desk scanner and the
 * kiosk (2026-10-18).
 *
 * jsQR alone was not enough. The owner held a phone up to an FHD webcam and
 * nothing happened: a lit phone screen through a fixed-focus webcam is small,
 * soft and blooms. Measured on the member app's exact code (version 3, level M)
 * drawn into 48 webcam-like frames — 3-6px modules, blur, glare
 * (~/uicheck/qr-bench.mjs): jsQR read 11, jsQR on a half-size frame 19, zxing
 * (the zxing-cpp decoder, compiled to WebAssembly) 31.
 *
 * So, in order, stopping at the first that reads: zxing on the whole frame,
 * jsQR on the whole frame, jsQR on the frame at half size (averaging four
 * pixels smooths blur and noise, and a code too big for jsQR fits). Always the
 * whole frame, never a crop (QRScanner's history says why). zxing's WebAssembly
 * is served from this app's own bundle, never a CDN — a desk on a captive
 * network must still scan — and if it cannot load, jsQR still runs.
 */

prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? zxingWasmUrl : prefix + path),
  },
});

let zxingBroken = false;

function halfSize(img: ImageData): ImageData {
  const w = Math.floor(img.width / 2), h = Math.floor(img.height / 2);
  const out = new ImageData(w, h);
  const s = img.data, d = out.data, W = img.width;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * 2 * W + x * 2) * 4, j = i + W * 4, o = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) d[o + c] = (s[i + c] + s[i + 4 + c] + s[j + c] + s[j + 4 + c]) >> 2;
      d[o + 3] = 255;
    }
  }
  return out;
}

/** The text of the first QR code found in the frame, or null. Never throws. */
export async function decodeQrFrame(frame: ImageData): Promise<string | null> {
  if (!zxingBroken) {
    try {
      const found = await readBarcodes(frame, { formats: ['QRCode'], tryHarder: true, maxNumberOfSymbols: 1 });
      const hit = found.find((r) => r.isValid && r.text);
      if (hit) return hit.text;
    } catch {
      // The WebAssembly could not load (an old browser, a blocked file): jsQR carries on alone.
      zxingBroken = true;
    }
  }
  const a = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'attemptBoth' });
  if (a?.data) return a.data;
  const half = halfSize(frame);
  const b = jsQR(half.data, half.width, half.height, { inversionAttempts: 'attemptBoth' });
  return b?.data || null;
}
