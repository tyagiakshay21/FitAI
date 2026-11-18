import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { adminApi } from '../lib/api';
import { Loader } from '../components/Loader';
import { formatDateLong } from '../lib/utils';

interface Row { id: string; email: string; name: string | null; role: string; isActive: boolean; createdAt: string }

export default function Admin() {
  const [users, setUsers] = useState<Row[] | null>(null);
  const load = () => { adminApi.users().then(setUsers); };
  useEffect(load, []);
  if (!users) return <Loader full />;

  return (
    <div className="space-y-6">
      <h1 className="font-display flex items-center gap-2 text-2xl"><ShieldCheck className="h-6 w-6 text-pine" /> Admin</h1>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="border-b border-line text-ink-faint"><th className="py-2 pr-4">Email</th><th className="py-2 pr-4">Name</th><th className="py-2 pr-4">Role</th><th className="py-2 pr-4">Active</th><th className="py-2 pr-4">Joined</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line/60">
                <td className="py-2 pr-4">{u.email}</td>
                <td className="py-2 pr-4">{u.name ?? '—'}</td>
                <td className="py-2 pr-4">
                  <select value={u.role} onChange={async (e) => { await adminApi.setRole(u.id, e.target.value); load(); }} className="input py-1">
                    <option value="USER">User</option><option value="TRAINER">Trainer</option><option value="ADMIN">Admin</option>
                  </select>
                </td>
                <td className="py-2 pr-4">
                  <button onClick={async () => { await adminApi.setActive(u.id, !u.isActive); load(); }} className={`chip text-xs ${u.isActive ? 'chip-on' : ''}`}>{u.isActive ? 'Active' : 'Disabled'}</button>
                </td>
                <td className="py-2 pr-4 text-ink-faint">{formatDateLong(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
