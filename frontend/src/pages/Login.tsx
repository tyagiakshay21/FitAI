import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Flame, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      navigate((location.state as { from?: Location })?.from?.pathname ?? '/dashboard', { replace: true });
    } catch (err) {
      toast(errorMessage(err, 'Could not sign in. Check your email and password.'), 'error');
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
          <h1 className="font-display text-xl">Welcome back</h1>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              <Link to="/forgot-password" className="mt-1 inline-block text-xs text-pine hover:underline">Forgot password?</Link>
            </div>
            <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Sign in</button>
          </form>
        </div>
        <p className="muted mt-4 text-center">No account? <Link to="/register" className="font-medium text-pine hover:underline">Create one</Link></p>
      </div>
    </div>
  );
}
