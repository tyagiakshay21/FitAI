import { Loader2 } from 'lucide-react';
import { cls } from '../lib/utils';

export function Loader({ full, label }: { full?: boolean; label?: string }) {
  return (
    <div className={cls('flex items-center justify-center gap-2 text-ink-soft', full ? 'h-[60vh]' : 'py-10')}>
      <Loader2 className="h-5 w-5 animate-spin text-pine" />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card border-coral/30 bg-coral/5 text-center">
      <p className="text-sm text-coral">{message}</p>
      {onRetry && <button onClick={onRetry} className="btn-ghost mt-3">Try again</button>}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="card border-dashed text-center">
      <p className="font-display text-lg">{title}</p>
      {body && <p className="muted mt-1">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
