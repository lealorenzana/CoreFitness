import { mediaType, parseReading } from './core.ts';

const eq = (a: unknown, b: unknown) => {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${JSON.stringify(a)} !== ${JSON.stringify(b)}`);
};

Deno.test('a good answer passes through', () => {
  const r = parseReading(JSON.stringify({ readable: true, looks_like: 'permit', business_name: ' Iron Den ', owner_name: 'Ana Cruz',
    id_number: '2026-001', issued_on: '2026-01-05', expires_on: '2026-12-31', valid_for_year: '2026', confidence: 'high' }));
  eq(r?.business_name, 'Iron Den');
  eq(r?.expires_on, '2026-12-31');
  eq(r?.looks_like, 'permit');
});

Deno.test('bad values become null, never trusted', () => {
  eq(parseReading(JSON.stringify({ readable: true, expires_on: '2026-13-45' }))?.expires_on, null);
  const r = parseReading(JSON.stringify({ readable: true, looks_like: 'verified', expires_on: '31/12/2026',
    issued_on: '2026-02-30x', valid_for_year: '26', confidence: 'certain', business_name: '' }));
  eq([r?.looks_like, r?.expires_on, r?.issued_on, r?.valid_for_year, r?.confidence, r?.business_name],
    [null, null, null, null, 'low', null]);
});

Deno.test('not JSON, or no readable flag, is no reading', () => {
  eq(parseReading('Sure! Here is the permit'), null);
  eq(parseReading('{"looks_like":"permit"}'), null);
});

Deno.test('media types by extension', () => {
  eq(mediaType('a/b.JPG'), 'image/jpeg');
  eq(mediaType('a/b.pdf'), 'application/pdf');
  eq(mediaType('a/b.heic'), null);
});
