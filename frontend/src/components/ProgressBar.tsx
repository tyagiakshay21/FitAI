import { clampPct } from '../lib/utils';

export function ProgressBar({ pct, color = 'bg-pine' }: { pct: number; color?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-pine-light">
      <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${clampPct(pct)}%` }} />
    </div>
  );
}
