import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Camera, Loader2, Plus, Ruler, Scale, Sparkles, TrendingUp } from 'lucide-react';
import { progressApi, aiApi, errorMessage } from '../lib/api';
import type { TimelineEvent } from '../lib/types';
import { useToast } from '../context/ToastContext';
import { Loader, EmptyState } from '../components/Loader';
import { formatDate, formatDateLong } from '../lib/utils';

export default function Progress() {
  const [weights, setWeights] = useState<any[] | null>(null);
  const [strength, setStrength] = useState<any[] | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[] | null>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [analysis, setAnalysis] = useState<{ summary: string } | null>(null);
  const [newWeight, setNewWeight] = useState('');
  const [measure, setMeasure] = useState({ waistCm: '', chestCm: '', armsCm: '', thighsCm: '' });
  const [photo, setPhoto] = useState<File | undefined>();
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();

  const load = () => {
    progressApi.weights().then(setWeights);
    progressApi.strength().then(setStrength);
    progressApi.timeline().then(setTimeline);
    aiApi.weightForecast().then(setForecast).catch(() => setForecast(null));
  };
  useEffect(load, []);

  const addWeight = async () => {
    if (!newWeight) return;
    try { await progressApi.addWeight(+newWeight); setNewWeight(''); toast('Weight logged', 'success'); load(); }
    catch (err) { toast(errorMessage(err), 'error'); }
  };
  const addMeasurement = async () => {
    setBusy(true);
    try { await progressApi.addMeasurement(measure, photo); toast('Measurement saved', 'success'); setMeasure({ waistCm: '', chestCm: '', armsCm: '', thighsCm: '' }); setPhoto(undefined); load(); }
    catch (err) { toast(errorMessage(err), 'error'); }
    finally { setBusy(false); }
  };
  const runAnalysis = async () => {
    setBusy(true);
    try { setAnalysis(await aiApi.progressAnalysis()); }
    catch (err) { toast(errorMessage(err, 'Could not analyse progress yet.'), 'error'); }
    finally { setBusy(false); }
  };

  if (!weights || !strength || !timeline) return <Loader full />;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl">Progress</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="card">
          <h3 className="font-display flex items-center gap-2 text-lg"><Scale className="h-5 w-5 text-pine" /> Weight</h3>
          <div className="mt-2 flex gap-2">
            <input type="number" step={0.1} className="input" placeholder="Weight (kg)" value={newWeight} onChange={(e) => setNewWeight(e.target.value)} />
            <button onClick={addWeight} className="btn-primary"><Plus className="h-4 w-4" /></button>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={weights.map((w: any) => ({ ...w, date: formatDate(w.date) }))}>
              <CartesianGrid strokeDasharray="3 3" stroke="#DDE2DC" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} /><YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} width={36} /><Tooltip />
              <Line type="monotone" dataKey="weightKg" stroke="#1F6F5B" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
          {forecast?.available && (
            <p className="muted mt-2 flex items-start gap-1.5 text-xs"><TrendingUp className="mt-0.5 h-3.5 w-3.5 shrink-0 text-pine" /> Estimated {forecast.forecast?.[forecast.forecast.length - 1]?.weight_kg} kg in {forecast.horizon_days} days ({forecast.weekly_rate_kg > 0 ? '+' : ''}{forecast.weekly_rate_kg} kg/wk). {forecast.note}</p>
          )}
        </div>

        <div className="card">
          <h3 className="font-display flex items-center gap-2 text-lg"><Ruler className="h-5 w-5 text-pine" /> Body measurements</h3>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(['waistCm', 'chestCm', 'armsCm', 'thighsCm'] as const).map((k) => (
              <input key={k} type="number" className="input" placeholder={k.replace('Cm', ' (cm)')} value={measure[k]} onChange={(e) => setMeasure((m) => ({ ...m, [k]: e.target.value }))} />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <label className="btn-ghost cursor-pointer gap-1 text-xs"><Camera className="h-3.5 w-3.5" /> {photo ? photo.name.slice(0, 16) : 'Add photo'}<input type="file" accept="image/*" className="hidden" onChange={(e) => setPhoto(e.target.files?.[0])} /></label>
            <button onClick={addMeasurement} disabled={busy} className="btn-primary ml-auto">Save</button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">Strength trend (est. 1RM)</h3>
        </div>
        {!strength.length ? <EmptyState title="No strength history yet" body="Log a few weighted sets to see your trend." /> : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" stroke="#DDE2DC" />
              <XAxis dataKey="date" type="category" allowDuplicatedCategory={false} tick={{ fontSize: 11 }} tickFormatter={formatDate} />
              <YAxis tick={{ fontSize: 11 }} width={36} /><Tooltip labelFormatter={formatDate} />
              {strength.map((s: any, i: number) => (
                <Line key={s.exercise} data={s.points} dataKey="e1rm" name={s.exercise} stroke={['#1F6F5B', '#E9A72C', '#3B6FE0', '#E5544B'][i % 4]} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg">AI progress analysis</h3>
          <button onClick={runAnalysis} disabled={busy} className="btn-ghost gap-1">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Analyze</button>
        </div>
        {analysis && <p className="muted mt-2 whitespace-pre-line text-sm">{analysis.summary}</p>}
      </div>

      <div className="card">
        <h3 className="font-display text-lg">Timeline</h3>
        <div className="mt-3 space-y-3">
          {timeline.slice(0, 15).map((e, i) => (
            <div key={i} className="flex gap-3 border-l-2 border-pine-light pl-3">
              <div>
                <p className="text-sm font-medium">{e.title} <span className="muted font-normal">· {formatDateLong(e.date)}</span></p>
                {e.detail && <p className="muted text-sm">{e.detail}</p>}
                {e.photoUrl && <img src={e.photoUrl} alt="Progress" className="mt-1 h-24 w-24 rounded-lg object-cover" />}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
