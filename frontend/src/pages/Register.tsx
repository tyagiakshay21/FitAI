import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flame, Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await register(form.email, form.password, form.name);
      navigate('/onboarding', { replace: true });
    } catch (err) {
      toast(errorMessage(err, 'Could not create your account.'), 'error');
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
          <h1 className="font-display text-xl">Create your account</h1>
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="label">Name</label>
              <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="label">Email</label>
              <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="label">Password</label>
              <input className="input" type="password" minLength={8} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <p className="mt-1 text-xs text-ink-faint">At least 8 characters.</p>
            </div>
            <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Create account</button>
          </form>
        </div>
        <p className="muted mt-4 text-center">Already have an account? <Link to="/login" className="font-medium text-pine hover:underline">Sign in</Link></p>
      </div>
    </div>
  );
}
