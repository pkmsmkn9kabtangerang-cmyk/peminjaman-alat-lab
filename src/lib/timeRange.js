// src/lib/timeRange.js
// Pilihan rentang waktu yang dipakai bersama oleh halaman Riwayat dan Aktivitas.

export const TIME_RANGE_OPTIONS = [
  { value: 'today', label: 'Hari Ini' },
  { value: '7d', label: '7 Hari Terakhir' },
  { value: '30d', label: '30 Hari Terakhir' },
  { value: 'all', label: 'Semua Waktu' },
];

// Halaman Aktivitas hanya menampilkan 24 jam terakhir agar data lama
// tidak menumpuk di monitor realtime. Riwayat tetap menyimpan semuanya.
export const ACTIVITY_RANGE_OPTIONS = [
  { value: '24h', label: '24 Jam Terakhir' },
];

export const ACTIVITY_TIME_FILTER = '24h';

const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PREFIX = 'date:';

const pad2 = (value) => String(value).padStart(2, '0');

function startOfWibDay(now) {
  const wibNow = new Date(now + WIB_OFFSET_MS);
  return Date.UTC(
    wibNow.getUTCFullYear(),
    wibNow.getUTCMonth(),
    wibNow.getUTCDate()
  ) - WIB_OFFSET_MS;
}

export function dateFilterValue(dateStr) {
  return dateStr ? `${DATE_PREFIX}${dateStr}` : '';
}

export function getDateFromFilter(filter) {
  return typeof filter === 'string' && filter.startsWith(DATE_PREFIX)
    ? filter.slice(DATE_PREFIX.length)
    : '';
}

function getWibDateRangeMs(dateStr) {
  const [year, month, day] = String(dateStr || '')
    .split('-')
    .map(Number);

  if (!year || !month || !day) return null;

  const start = Date.UTC(year, month - 1, day) - WIB_OFFSET_MS;
  return { start, end: start + DAY_MS - 1 };
}

export function todayWibDateValue(now = Date.now()) {
  const wibNow = new Date(now + WIB_OFFSET_MS);
  return `${wibNow.getUTCFullYear()}-${pad2(wibNow.getUTCMonth() + 1)}-${pad2(wibNow.getUTCDate())}`;
}

export function getRangeStartMs(filter, now = Date.now()) {
  if (filter === '24h') return now - DAY_MS;

  if (filter === 'today') {
    // Awal hari menurut WIB, tidak bergantung zona waktu perangkat.
    return startOfWibDay(now);
  }

  if (filter === '7d') return now - 7 * DAY_MS;
  if (filter === '30d') return now - 30 * DAY_MS;

  const date = getDateFromFilter(filter);
  if (date) {
    const range = getWibDateRangeMs(date);
    if (range) return range.start;
  }

  return null;
}

function getRangeEndMs(filter) {
  const date = getDateFromFilter(filter);
  if (!date) return null;

  const range = getWibDateRangeMs(date);
  return range ? range.end : null;
}

export function matchesTimeRange(iso, filter, now = Date.now()) {
  if (filter === 'all') return true;
  if (!iso) return false;

  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return false;

  const start = getRangeStartMs(filter, now);
  if (start === null) return true;

  const end = getRangeEndMs(filter);
  return time >= start && (end === null || time <= end);
}

export function getTimeRangeLabel(filter) {
  const date = getDateFromFilter(filter);
  if (date) {
    const parsed = new Date(`${date}T00:00:00+07:00`);
    if (!Number.isNaN(parsed.getTime())) {
      return new Intl.DateTimeFormat('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta',
      }).format(parsed);
    }
    return date;
  }

  return TIME_RANGE_OPTIONS.find((option) => option.value === filter)?.label ?? 'Semua Waktu';
}
