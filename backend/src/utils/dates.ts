/**
 * All "daily" records are stored as calendar dates (Postgres DATE). The client
 * sends its own local date as YYYY-MM-DD so a user's "today" is never shifted by
 * server time zone. If omitted we fall back to the server's UTC date.
 */
export const isoDate = (d: Date = new Date()) => d.toISOString().slice(0, 10);
export const toDate = (iso?: string) => new Date(`${iso ?? isoDate()}T00:00:00.000Z`);
export const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86_400_000);
/** Monday of the week containing d (UTC). */
export const weekStart = (d: Date) => {
  const day = (d.getUTCDay() + 6) % 7; // Mon=0
  return addDays(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())), -day);
};
export const eachDay = (from: Date, to: Date) => {
  const out: Date[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
};
export const round = (n: number, dp = 1) => Math.round(n * 10 ** dp) / 10 ** dp;
