import type { LucideIcon } from 'lucide-react';

export function StatCard({ icon: Icon, label, value, sub, accent }: { icon: LucideIcon; label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="card flex items-start gap-3">
      <div className={`rounded-xl p-2.5 ${accent ?? 'bg-pine-light text-pine-dark'}`}><Icon className="h-5 w-5" /></div>
      <div>
        <p className="muted">{label}</p>
        <p className="font-display text-2xl">{value}</p>
        {sub && <p className="text-xs text-ink-faint">{sub}</p>}
      </div>
    </div>
  );
}
