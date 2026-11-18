import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Flame, Loader2 } from 'lucide-react';
import { authApi, errorMessage } from '../lib/api';
import { useToast } from '../context/ToastContext';

export default function ForgotPassword() {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await authApi.forgotPassword(email);
      setSent(true);
    } catch (err) {
      toast(errorMessage(err), 'error');
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
          <h1 className="font-display text-xl">Reset your password</h1>
          {sent ? (
            <p className="muted mt-4">If that email exists, a reset link has been sent. Check your inbox.</p>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <div>
                <label className="label">Email</label>
                <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <button className="btn-primary w-full" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />} Send reset link</button>
            </form>
          )}
        </div>
        <p className="muted mt-4 text-center"><Link to="/login" className="font-medium text-pine hover:underline">Back to sign in</Link></p>
      </div>
    </div>
  );
}
