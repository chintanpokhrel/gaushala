import qrcode from 'qrcode-generator';
import { addDays, dayOfMonth, weekStart, type LocalDate } from './data/dates';
import type { Statement } from './data/ledger';
import type { Business } from './data/models';
import * as Fmt from './fmt';
import { LANGS, t, type Lang } from './i18n';

/**
 * Draws the bill as a PNG-ready canvas, with the same layout as the Android app's BillImage.
 * Drawn directly (no screen capture), so it looks the same on every phone; [l] decides the bill
 * language, so a bill can go out in English or Nepali whatever the app language is.
 */
const W = 1080;
const PAD = 56;
const INK = '#1C242E';
const MUTED = '#5E6B78';
const BRAND = '#2F5D8A';
const RULE = '#DDE3EA';
const SKIP = '#C62828';
const SKIP_BG = '#FDECEC';
const EXTRA = '#1B7A3D';
const EXTRA_BG = '#E6F4EA';
const PLAIN_BG = '#F5F7FA';
const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Noto Sans Devanagari", sans-serif';

export function businessName(b: Business, l: Lang): string {
  return l.tag === 'ne' ? b.nameNe.trim() || b.nameEn : b.nameEn.trim() || b.nameNe;
}

export function renderBill(l: Lang, business: Business, s: Statement): HTMLCanvasElement {
  const name = businessName(business, l);
  const cell = (W - 2 * PAD) / 7;
  const cellH = 104;
  const weeks = weeksOf(s.from, s.to);
  const summary = summaryRows(l, s);
  const showQr = business.upiId.trim() !== '' && s.duePaise > 0;
  const height = Math.round(230 + 150 + 56 + weeks.length * cellH + 70 + summary.length * 66 + 20 + 40 + (showQr ? 340 : 90) + 90);

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = height;
  const c = canvas.getContext('2d')!;
  c.fillStyle = '#FFFFFF';
  c.fillRect(0, 0, W, height);

  const text = (str: string, x: number, y: number, size: number, color: string, opts: { bold?: boolean; align?: CanvasTextAlign } = {}) => {
    c.font = `${opts.bold ? 'bold ' : ''}${size}px ${FONT}`;
    c.fillStyle = color;
    c.textAlign = opts.align ?? 'left';
    c.fillText(str, x, y);
  };

  // Header band: business name, phone, bill title and period.
  c.fillStyle = BRAND;
  c.fillRect(0, 0, W, 230);
  text(name, PAD, 92, 60, '#FFFFFF', { bold: true });
  if (business.phone.trim() !== '') text(t(l, 'bill_phone', business.phone), PAD, 146, 36, '#FFFFFF');
  text(`${t(l, 'bill_title')}  ·  ${Fmt.range(l, s.from, s.to)}`, PAD, 200, 38, '#FFFFFF', { bold: true });

  let y = 230 + 70;
  text(s.customer.name, PAD, y, 46, INK, { bold: true });
  if (s.customer.address.trim() !== '') text(s.customer.address, PAD, y + 50, 34, MUTED);
  y = 230 + 150;

  // Calendar: weeks start Sunday; days outside the period are left blank.
  for (let i = 0; i < 7; i++) {
    text(Fmt.weekdayShort(l, addDays(weeks[0], i)), PAD + cell * i + cell / 2, y + 36, 30, MUTED, { bold: true, align: 'center' });
  }
  y += 56;
  const byDate = new Map(s.days.map((d) => [d.date, d]));
  for (const week of weeks) {
    for (let i = 0; i < 7; i++) {
      const date = addDays(week, i);
      const day = byDate.get(date);
      if (!day) continue;
      const x = PAD + cell * i;
      const [bg, fg] = day.ml === 0 && day.usualMl > 0 ? [SKIP_BG, SKIP] : day.ml > day.usualMl ? [EXTRA_BG, EXTRA] : [PLAIN_BG, INK];
      c.fillStyle = bg;
      roundRect(c, x + 4, y + 4, cell - 8, cellH - 8, 14);
      text(String(dayOfMonth(date)), x + 16, y + 34, 26, MUTED);
      text(day.ml === 0 ? '–' : Fmt.litres(day.ml), x + cell / 2, y + cellH - 22, 38, fg, { bold: true, align: 'center' });
    }
    y += cellH;
  }
  text(t(l, 'bill_legend'), PAD, y + 44, 28, MUTED);
  y += 70;

  // Totals.
  for (const row of summary) {
    y += row.strong ? 86 : 66;
    if (row.strong) {
      c.fillStyle = RULE;
      c.fillRect(PAD, y - 59.5, W - 2 * PAD, 3);
    }
    const size = row.strong ? 44 : 36;
    const color = row.strong ? INK : MUTED;
    text(row.label, PAD, y, size, color, { bold: row.strong });
    text(row.amount, W - PAD, y, size, color, { bold: row.strong, align: 'right' });
  }
  y += 40;

  if (showQr) {
    const size = 300;
    drawQr(c, upiLink(business, name, s), PAD - 14, y + 10, size);
    const x = PAD + size + 24;
    text(t(l, 'bill_scan_to_pay'), x, y + 90, 38, INK, { bold: true });
    text(t(l, 'bill_upi_id', business.upiId), x, y + 150, 34, INK);
    text(Fmt.money(l, s.duePaise), x, y + 220, 52, BRAND, { bold: true });
    y += 340;
  } else {
    text(t(l, s.duePaise < 0 ? 'bill_advance_note' : 'bill_nothing_due'), PAD, y + 60, 38, EXTRA, { bold: true });
    y += 90;
  }
  text(t(l, 'bill_thanks'), W / 2, y + 60, 34, MUTED, { align: 'center' });
  return canvas;
}

interface Row { label: string; amount: string; strong?: boolean }

function summaryRows(l: Lang, s: Statement): Row[] {
  const money = (p: number) => Fmt.money(l, p);
  const rows: Row[] = s.usage.lines.map((line) => ({
    label: t(l, 'bill_milk_line', Fmt.litresUnit(l, line.ml), money(line.rate * 100)),
    amount: money(line.paise),
  }));
  if (s.usage.lines.length === 0) rows.push({ label: t(l, 'bill_no_milk'), amount: money(0) });
  if (s.openingPaise > 0) rows.push({ label: t(l, 'bill_previous_due'), amount: money(s.openingPaise) });
  if (s.openingPaise < 0) rows.push({ label: t(l, 'bill_previous_advance'), amount: '− ' + money(-s.openingPaise) });
  for (const p of s.payments) rows.push({ label: t(l, 'bill_received_on', Fmt.dayMonth(l, p.date)), amount: '− ' + money(p.paise) });
  rows.push(
    s.duePaise >= 0
      ? { label: t(l, 'bill_total_due'), amount: money(s.duePaise), strong: true }
      : { label: t(l, 'bill_advance'), amount: money(-s.duePaise), strong: true },
  );
  return rows;
}

/** Sundays starting each calendar row that contains a day of the period. */
function weeksOf(from: LocalDate, to: LocalDate): LocalDate[] {
  const out: LocalDate[] = [];
  for (let w = weekStart(from); w <= to; w = addDays(w, 7)) out.push(w);
  return out;
}

/** UPI deep link; any UPI app opens it with the amount filled in. */
export function upiLink(business: Business, payee: string, s: Statement): string {
  // Always English: some UPI apps reject a payment note in other scripts.
  const en = LANGS.en;
  const note = t(en, 'upi_note', Fmt.range(en, s.from, s.to));
  return 'upi://pay?pa=' + encodeURIComponent(business.upiId.trim()) +
    '&pn=' + encodeURIComponent(business.upiName.trim() || payee) +
    '&am=' + Fmt.plainRupees(s.duePaise) +
    '&cu=INR&tn=' + encodeURIComponent(note);
}

/** QR with a one-module white margin, scaled to [size] px. */
function drawQr(c: CanvasRenderingContext2D, content: string, x: number, y: number, size: number): void {
  const qr = qrcode(0, 'L');
  qr.addData(content);
  qr.make();
  const n = qr.getModuleCount();
  const unit = size / (n + 2);
  c.fillStyle = '#FFFFFF';
  c.fillRect(x, y, size, size);
  c.fillStyle = '#000000';
  for (let r = 0; r < n; r++) {
    for (let col = 0; col < n; col++) {
      // Whole pixels, rounded outward, so no seams show between modules.
      if (qr.isDark(r, col)) c.fillRect(Math.floor(x + (col + 1) * unit), Math.floor(y + (r + 1) * unit), Math.ceil(unit), Math.ceil(unit));
    }
  }
}

function roundRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  c.beginPath();
  c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r);
  c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r);
  c.arcTo(x, y, x + w, y, r);
  c.closePath();
  c.fill();
}
