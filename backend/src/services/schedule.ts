/** Maps "N workout days/week" to weekdays (0=Sun … 6=Sat) with rest days spread out. */
const SCHEDULES: Record<number, number[]> = {
  1: [3],
  2: [1, 4],
  3: [1, 3, 5],
  4: [1, 2, 4, 5],
  5: [1, 2, 3, 5, 6],
  6: [1, 2, 3, 4, 5, 6],
  7: [0, 1, 2, 3, 4, 5, 6],
};

export const scheduleWeekdays = (daysPerWeek: number) => SCHEDULES[Math.min(6, Math.max(1, daysPerWeek))]; // 7 is treated as 6 + 1 rest day

/** Index of the plan workout scheduled for a given date, or null on a rest day. */
export function workoutIndexForDate(daysPerWeek: number, date: Date): number | null {
  const idx = scheduleWeekdays(daysPerWeek).indexOf(date.getUTCDay());
  return idx === -1 ? null : idx;
}
