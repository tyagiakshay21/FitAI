import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Flame, Loader2 } from 'lucide-react';
import { authApi, errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { toast } = useToast();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.resetPassword(token, password);
      toast('Password updated. Please sign in.', 'success');
      navigate('/login');
    } catch (err) {
      toast(errorMessage(err, 'That reset link is invalid or expired.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-chalk px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <div className="rounded-lg bg-pine p-1.5"><Flame className="h-5 w-5 text-white" /></div>
          <span className="font-display text-lg font-semibold">FitAI</span>
        </div>
        <div className="card">
          <h1 className="font-display text-xl">Set a new password</h1>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="label">New password</label>
              <input className="input" type="password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn-primary w-full" disabled={busy || !token}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password</button>
            {!token && <p className="text-xs text-coral">Missing reset token — use the link from your email.</p>}
          </form>
        </div>
        <p className="muted mt-4 text-center"><Link to="/login" className="font-medium text-pine hover:underline">Back to sign in</Link></p>
      </div>
    </div>
  );
}
