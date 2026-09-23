import dayjs from 'dayjs';

export const now = (): string => dayjs().toISOString();

const INDIA_TZ = 'Asia/Kolkata';

export function indiaDateTime(at = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: INDIA_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(at)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value])
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function addIndiaDays(dateStr: string, days: number) {
  const date = new Date(`${dateStr}T12:00:00+05:30`);
  date.setDate(date.getDate() + days);
  return indiaDateTime(date).date;
}

export function stayDurationLabel(date: string | null, inTime: string | null, outTime: string | null) {
  if (!date || !inTime || !outTime) return null;
  const start = new Date(`${date}T${inTime}:00+05:30`);
  const end = new Date(`${date}T${outTime}:00+05:30`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end < start) end.setDate(end.getDate() + 1);
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

export const slugify = (value = ''): string =>
  String(value)
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
