import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Flame, Play, RotateCcw, Square, Timer, Trophy } from 'lucide-react';
import { CameraCapture } from '../components/CameraCapture';
import { getAccessToken, setAccessToken, authApi, workoutApi } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { EmptyState } from '../components/Loader';

const CV_WS_URL = import.meta.env.VITE_CV_WS_URL ?? 'ws://localhost:8001';
const EXERCISES = [
  { key: 'squat', label: 'Squat' }, { key: 'pushup', label: 'Push-up' }, { key: 'lunge', label: 'Lunge' },
  { key: 'bicep_curl', label: 'Bicep curl' }, { key: 'shoulder_press', label: 'Shoulder press' },
  { key: 'plank', label: 'Plank' }, { key: 'jumping_jack', label: 'Jumping jack' },
];

interface Result {
  reps: number; phase: string; form_score: number | null; breakdown: Record<string, number>;
  feedback: string[]; calories: number; hold_seconds: number; landmarks?: [number, number, number][];
}
interface Summary {
  reps: number; avg_form_score: number; breakdown: Record<string, number>;
  feedback_summary: { message: string; count: number }[]; duration_s: number; calories_estimate: number; disclaimer: string;
}

export default function FormCheck() {
  const [exercise, setExercise] = useState('squat');
  const [running, setRunning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [saved, setSaved] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const { toast } = useToast();

  const disconnect = useCallback(() => { wsRef.current?.close(); wsRef.current = null; }, []);
  useEffect(() => disconnect, [disconnect]);

  const onFrame = useCallback((blob: Blob) => {
    const ws = wsRef.current;
    // Keep only the live frame; queued frames make feedback stale on slower devices.
    if (!ws || ws.readyState !== WebSocket.OPEN || ws.bufferedAmount > 1_500_000) return;
    blob.arrayBuffer().then((buf) => ws.readyState === WebSocket.OPEN && ws.send(buf));
  }, []);

  const start = async () => {
    setSummary(null);
    setSaved(false);
    setConnecting(true);

    let token: string;
    try {
      // Access tokens expire after 15 minutes; always refresh before opening the camera socket.
      const r = await authApi.refresh();
      token = r.accessToken;
      setAccessToken(token);
    } catch {
      setConnecting(false);
      setAccessToken(null);
      toast('Your session expired. Sign in again before starting Form Check.', 'error');
      return;
    }
    const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';

    try {
      const ws = new WebSocket(`${CV_WS_URL}/ws/analyze?exercise=${exercise}${tokenParam}`);
      ws.onopen = () => {
        setRunning(true);
        setConnecting(false);
      };
      ws.onmessage = (ev) => {
        try {
          const data = JSON.parse(ev.data);
          if (data.type === 'result') setResult(data);
          if (data.type === 'summary') setSummary(data);
        } catch {}
      };
      ws.onerror = () => {
        setRunning(false);
        setConnecting(false);
        toast(`Could not connect to Computer Vision service at ${CV_WS_URL}. Ensure port 8001 is running.`, 'error');
      };
      ws.onclose = (ev) => {
        setRunning(false);
        setConnecting(false);
        if (ev.code === 4401) {
          toast('Authentication failed for camera service. Please sign in again.', 'error');
        } else if (ev.code === 4404) {
          toast('That exercise is not supported by the camera service. Restart the app and try again.', 'error');
        } else if (ev.code !== 1000 && ev.code !== 1001) {
          toast('Camera service disconnected. Check that all FitAI services are running, then try again.', 'error');
        }
      };
      wsRef.current = ws;
    } catch {
      setRunning(false);
      setConnecting(false);
      toast('Failed to initialize WebSocket for Form Check.', 'error');
    }
  };
  const stop = () => {
    wsRef.current?.send(JSON.stringify({ type: 'end' }));
    setTimeout(disconnect, 300);
    setRunning(false);
  };
  const reset = () => { wsRef.current?.send(JSON.stringify({ type: 'reset' })); setResult(null); setSummary(null); setSaved(false); };

  const save = async () => {
    if (!summary) return;
    await workoutApi.saveFormAnalysis({
      exerciseKey: exercise, reps: summary.reps, formScore: summary.avg_form_score, durationSec: summary.duration_s,
      caloriesBurned: summary.calories_estimate, breakdown: summary.breakdown,
      feedbackSummary: summary.feedback_summary.map((f) => f.message),
    });
    setSaved(true);
  };

  const cfg = useMemo(() => EXERCISES.find((e) => e.key === exercise)!, [exercise]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl">Live Form Check</h1>
        <p className="muted">Real-time rep counting and posture feedback from your camera.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {EXERCISES.map((e) => (
          <button key={e.key} disabled={running} onClick={() => { setExercise(e.key); setResult(null); setSummary(null); }} className={`chip ${exercise === e.key ? 'chip-on' : ''}`}>{e.label}</button>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
        <div>
          <CameraCapture active={running} onFrame={onFrame} landmarks={result?.landmarks} fps={6} />
          <div className="mt-3 flex gap-2">
            {!running ? (
              <button onClick={start} disabled={connecting} className="btn-primary flex-1 gap-2"><Play className="h-4 w-4" /> {connecting ? 'Connecting…' : `Start ${cfg.label}`}</button>
            ) : (
              <>
                <button onClick={stop} className="btn-danger flex-1 gap-2"><Square className="h-4 w-4" /> Stop</button>
                <button onClick={reset} className="btn-ghost gap-2"><RotateCcw className="h-4 w-4" /> Reset</button>
              </>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {result && !summary && (
            <div className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="muted">{exercise === 'plank' ? 'Hold time' : 'Reps'}</p>
                  <p className="font-display text-4xl">{exercise === 'plank' ? `${result.hold_seconds.toFixed(0)}s` : result.reps}</p>
                </div>
                {result.form_score !== null && (
                  <div className="text-right">
                    <p className="muted">Form score</p>
                    <p className={`font-display text-4xl ${result.form_score >= 80 ? 'text-pine' : result.form_score >= 60 ? 'text-amber' : 'text-coral'}`}>{result.form_score}</p>
                  </div>
                )}
              </div>
              <p className="muted mt-2 flex items-center gap-1 text-xs"><Flame className="h-3.5 w-3.5" /> ~{result.calories.toFixed(1)} kcal · phase: {result.phase}</p>
              <div className="mt-3 space-y-1.5">
                {result.feedback.map((f, i) => (
                  <p key={i} className={`flex items-start gap-1.5 text-sm ${f.includes('Good') ? 'text-pine' : 'text-amber'}`}>
                    {f.includes('Good') ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />} {f}
                  </p>
                ))}
              </div>
            </div>
          )}

          {summary && (
            <div className="card">
              <h3 className="font-display flex items-center gap-2 text-lg"><Trophy className="h-5 w-5 text-amber" /> Session summary</h3>
              <div className="mt-3 grid grid-cols-2 gap-3 text-center">
                <div className="rounded-xl bg-pine-light p-3"><p className="font-display text-2xl">{summary.reps}</p><p className="muted text-xs">{exercise === 'plank' ? 'Seconds held' : 'Reps'}</p></div>
                <div className="rounded-xl bg-amber/15 p-3"><p className="font-display text-2xl">{summary.avg_form_score}</p><p className="muted text-xs">Avg form score</p></div>
              </div>
              <p className="muted mt-3 flex items-center gap-1 text-xs"><Timer className="h-3.5 w-3.5" /> {summary.duration_s}s · <Flame className="h-3.5 w-3.5" /> ~{summary.calories_estimate} kcal</p>
              {!!summary.feedback_summary.length && (
                <ul className="muted mt-3 list-disc space-y-1 pl-5 text-sm">
                  {summary.feedback_summary.map((f) => <li key={f.message}>{f.message} <span className="text-ink-faint">×{f.count}</span></li>)}
                </ul>
              )}
              <p className="mt-3 text-xs text-ink-faint">{summary.disclaimer}</p>
              <button onClick={save} disabled={saved} className="btn-primary mt-4 w-full">{saved ? 'Saved to history' : 'Save to progress'}</button>
            </div>
          )}

          {!result && !summary && <EmptyState title={`Ready for ${cfg.label}`} body="Position yourself so your whole body is visible, then press Start." />}
        </div>
      </div>
    </div>
  );
}
