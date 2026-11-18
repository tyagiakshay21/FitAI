import { useState } from 'react';
import { Calculator } from 'lucide-react';

interface BmiResult {
  value: number;
  standard: string;
  asianPacific: string;
  healthyWeightRangeKg: [number, number];
  disclaimer: string;
}

export default function BmiCalculator() {
  const [weight, setWeight] = useState('70');
  const [height, setHeight] = useState('170');
  const [result, setResult] = useState<BmiResult | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const calc = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const weightKg = Number(weight);
    const heightCm = Number(height);
    if (!Number.isFinite(weightKg) || weightKg < 30 || weightKg > 300 || !Number.isFinite(heightCm) || heightCm < 100 || heightCm > 250) {
      setError('Enter a weight from 30 to 300 kg and a height from 100 to 250 cm.');
      setResult(null);
      return;
    }
    setBusy(true);
    setError('');
    try {
      const metres = heightCm / 100;
      const value = Math.round((weightKg / (metres * metres)) * 10) / 10;
      const standard = value < 18.5 ? 'Underweight' : value < 25 ? 'Normal weight' : value < 30 ? 'Overweight' : 'Obese';
      const asianPacific = value < 18.5 ? 'Underweight' : value < 23 ? 'Normal weight' : value < 25 ? 'Overweight (at risk)' : 'Obese';
      setResult({
        value,
        standard,
        asianPacific,
        healthyWeightRangeKg: [
          Math.round(18.5 * metres * metres * 10) / 10,
          Math.round(24.9 * metres * metres * 10) / 10,
        ],
        disclaimer: 'BMI is a screening metric. It does not measure body fat and does not account for muscle mass, age or body frame.',
      });
    } catch {
      setResult(null);
      setError('Could not calculate BMI. Check the values and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-2">
        <Calculator className="h-6 w-6 text-pine" />
        <h1 className="font-display text-2xl">BMI Calculator</h1>
      </div>
      <div className="card space-y-4">
        <form onSubmit={calc} className="space-y-4">
        <div>
          <label className="label">Weight (kg)</label>
          <input type="number" inputMode="decimal" min="30" max="300" step="0.1" required className="input" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </div>
        <div>
          <label className="label">Height (cm)</label>
          <input type="number" inputMode="decimal" min="100" max="250" step="0.1" required className="input" value={height} onChange={(e) => setHeight(e.target.value)} />
        </div>
        <button type="submit" disabled={busy} className="btn-primary w-full">{busy ? 'Calculating…' : 'Calculate'}</button>
        </form>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {result && (
          <div className="rounded-xl bg-pine-light p-4 text-center">
            <p className="font-display text-3xl">{result.value.toFixed(1)}</p>
            <p className="muted mt-1">WHO: {result.standard}</p>
            <p className="muted">Asia-Pacific: {result.asianPacific}</p>
            <p className="muted mt-2 text-sm">Healthy weight range at this height: {result.healthyWeightRangeKg[0]}–{result.healthyWeightRangeKg[1]} kg</p>
          </div>
        )}
        <p className="text-xs text-ink-faint">{result?.disclaimer ?? 'BMI is a general screening tool and does not account for muscle mass, body composition or individual health conditions.'}</p>
      </div>
    </div>
  );
}
