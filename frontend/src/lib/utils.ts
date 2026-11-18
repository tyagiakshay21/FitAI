export const isoDate = (d: Date | string = new Date()) => (typeof d === 'string' ? d : d.toISOString().slice(0, 10));
export const formatDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
export const formatDateLong = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const titleCase = (s: string) => s.toLowerCase().replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
