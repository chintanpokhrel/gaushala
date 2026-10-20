import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { decode, encode } from './codec';
import type { AppData } from './models';

/** Same data as JsonCodecTest.kt / FormatFixtureTest.kt in the Android app. */
const data: AppData = {
  business: {
    nameEn: 'Giriraj Gaushala', nameNe: 'गिरिराज गौशाला', phone: '98000 00000', upiId: 'giriraj@okaxis',
    upiName: 'Giriraj', defaultRate: 60, countryCode: '91', openingTurnoverPaise: 50_000_00,
  },
  customers: [{
    id: 'a', name: 'राम "Ram"', phone: '9800000001', address: 'Ward 3', openingPaise: -200_50,
    plans: [
      { from: '2026-10-01', morningMl: 1000, eveningMl: 500, rate: 60 },
      { from: '2026-10-11', morningMl: 1500, eveningMl: 0, rate: 65 },
    ],
  }],
  adjustments: [
    { customerId: 'a', date: '2026-10-03', shift: 'E', ml: 0 },
    { customerId: 'a', date: '2026-10-04', shift: 'M', ml: 2000 },
  ],
  payments: [{ id: 'p', customerId: 'a', date: '2026-10-06', paise: 1234_56, note: 'UPI' }],
};

const fixture = (name: string) => readFileSync(new URL(`../../../fixtures/${name}`, import.meta.url), 'utf8');

describe('backup format', () => {
  test('round trip keeps everything', () => {
    expect(decode(encode(data))).toEqual(data);
  });

  test('reads the backup written by the Android app', () => {
    expect(decode(fixture('backup-v1-android.json'))).toEqual(data);
  });

  // The Android tests decode this file, so it must stay what this app actually writes.
  test('writes exactly the sample the Android app is tested against', () => {
    expect(encode(data)).toBe(fixture('backup-v1-web.json').trimEnd());
  });

  test('starting turnover defaults to zero in older backups', () => {
    const older = JSON.parse(encode(data));
    delete older.business.openingTurnoverPaise;
    expect(decode(JSON.stringify(older)).business.openingTurnoverPaise).toBe(0);
  });

  test('rejects entries for unknown customers', () => {
    const broken = { ...data, payments: [...data.payments, { id: 'x', customerId: 'ghost', date: '2026-10-01', paise: 100, note: '' }] };
    expect(() => decode(encode(broken))).toThrow();
  });

  test('rejects newer versions', () => {
    expect(() => decode(encode(data).replace('"version":1', '"version":99'))).toThrow();
  });

  test('rejects malformed dates and fractional amounts', () => {
    expect(() => decode(encode(data).replace('2026-10-06', '2026-02-30'))).toThrow();
    expect(() => decode(encode(data).replace('"paise":123456', '"paise":1234.5'))).toThrow();
  });
});
