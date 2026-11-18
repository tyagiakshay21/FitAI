import { useEffect, useState } from 'react';
import { Bell, Trophy } from 'lucide-react';
import { aiApi } from '../lib/api';
import type { Achievement, Notification } from '../lib/types';
import { Loader, EmptyState } from '../components/Loader';
import { formatDateLong } from '../lib/utils';

export default function Achievements() {
  const [achievements, setAchievements] = useState<Achievement[] | null>(null);
  const [notifications, setNotifications] = useState<Notification[] | null>(null);

  useEffect(() => {
    aiApi.achievements().then(setAchievements);
    aiApi.notifications().then(setNotifications);
    aiApi.readNotifications().catch(() => {});
  }, []);

  if (!achievements || !notifications) return <Loader full />;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Achievements</h1>
      {!achievements.length ? <EmptyState title="No achievements yet" body="Complete workouts, log food and track weight to earn your first badge." /> : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {achievements.map((a) => (
            <div key={a.id} className="card text-center">
              <Trophy className="mx-auto h-8 w-8 text-amber" />
              <p className="font-display mt-2 text-sm">{a.title}</p>
              <p className="muted text-xs">{a.description}</p>
              <p className="mt-1 text-xs text-ink-faint">{formatDateLong(a.unlockedAt)}</p>
            </div>
          ))}
        </div>
      )}

      <h2 className="font-display flex items-center gap-2 text-xl"><Bell className="h-5 w-5" /> Notifications</h2>
      {!notifications.length ? <p className="muted">No notifications yet.</p> : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="card flex items-start gap-3">
              <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-pine" />
              <div><p className="text-sm font-medium">{n.title}</p><p className="muted text-sm">{n.body}</p></div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
