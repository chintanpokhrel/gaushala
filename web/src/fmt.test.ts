import { describe, expect, test } from 'vitest';
import * as Fmt from './fmt';
import { LANGS } from './i18n';
import { whatsAppNumber } from './share';

const en = LANGS.en;
const ne = LANGS.ne;

describe('formatting', () => {
  test('money uses Indian grouping and shows paise only when there are some', () => {
    expect(Fmt.money(en, 1_00_000_00)).toBe('₹1,00,000');
    expect(Fmt.money(en, 1625)).toBe('₹16.25');
    expect(Fmt.money(en, 1250_50)).toBe('₹1,250.50');
    expect(Fmt.money(ne, 1250_00)).toBe('रु. 1,250');
  });

  test('plain numbers drop trailing zeros', () => {
    expect(Fmt.plainRupees(1250_50)).toBe('1250.5');
    expect(Fmt.plainRupees(-200_50)).toBe('-200.5');
    expect(Fmt.plainRupees(5)).toBe('0.05');
    expect(Fmt.litres(1500)).toBe('1.5');
    expect(Fmt.litres(250)).toBe('0.25');
    expect(Fmt.litres(2000)).toBe('2');
  });

  test('typed litres allow at most 2 decimals', () => {
    expect(Fmt.parseLitres('1.5')).toBe(1500);
    expect(Fmt.parseLitres('0,25')).toBe(250);
    expect(Fmt.parseLitres('.5')).toBe(500);
    expect(Fmt.parseLitres('2')).toBe(2000);
    expect(Fmt.parseLitres('1.255')).toBeNull();
    expect(Fmt.parseLitres('-1')).toBeNull();
    expect(Fmt.parseLitres('')).toBeNull();
    expect(Fmt.parseLitres('abc')).toBeNull();
  });

  test('typed rupees allow a minus only when asked', () => {
    expect(Fmt.parseRupees('1,200.50')).toBe(1200_50);
    expect(Fmt.parseRupees('-200')).toBeNull();
    expect(Fmt.parseRupees('-200.5', true)).toBe(-200_50);
    expect(Fmt.parseRupees('1.234')).toBeNull();
  });

  test('dates use the language own names and Latin digits', () => {
    expect(Fmt.date(en, '2026-10-20')).toBe('20 Oct 2026');
    expect(Fmt.weekdayDate(en, '2026-10-20')).toBe('Tue, 20 Oct');
    expect(Fmt.range(en, '2026-10-01', '2026-10-31')).toBe('1 – 31 Oct 2026');
    expect(Fmt.range(en, '2026-09-25', '2026-10-05')).toBe('25 Sep 2026 – 5 Oct 2026');
    expect(Fmt.month(ne, '2026-10')).toBe('अक्टोबर 2026');
    expect(Fmt.weekdayDate(ne, '2026-10-20')).toBe('मङ्गल, 20 अक्टोबर');
    expect(Fmt.weekdayShort(ne, '2026-10-18')).toBe('आ');
  });

  test('WhatsApp numbers get the country code', () => {
    expect(whatsAppNumber('98000 00001', '91')).toBe('919800000001');
    expect(whatsAppNumber('09800000001', '91')).toBe('919800000001');
    expect(whatsAppNumber('+977 980-0000001', '91')).toBe('9779800000001');
    expect(whatsAppNumber('12345', '91')).toBeNull();
  });
});
