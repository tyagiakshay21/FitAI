import { Link } from 'react-router-dom';
import { Activity, Bot, Flame, Salad, TrendingUp } from 'lucide-react';

const FEATURES = [
  { icon: Activity, title: 'Live form analysis', body: 'Your camera watches your reps and coaches your form in real time — squats, push-ups, curls and more.' },
  { icon: Salad, title: 'Indian-friendly meal plans', body: 'Diet-type and allergy-aware nutrition plans built from a real Indian food database.' },
  { icon: Bot, title: 'AI coach', body: 'Ask about today’s workout, your macros, or how your training is trending.' },
  { icon: TrendingUp, title: 'Progress that adapts', body: 'Your plan adjusts to your consistency and effort, backed by real ML forecasts.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-chalk">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-pine p-1.5"><Flame className="h-5 w-5 text-white" /></div>
          <span className="font-display text-lg font-semibold">FitAI</span>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/login" className="btn-ghost">Sign in</Link>
          <Link to="/register" className="btn-primary">Get started</Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 py-16 text-center md:py-24">
        <h1 className="font-display text-4xl font-semibold leading-tight md:text-6xl">
          Train smarter with an AI coach that watches your form
        </h1>
        <p className="muted mx-auto mt-5 max-w-2xl text-base md:text-lg">
          Personalised workouts, Indian-friendly nutrition plans, real-time posture feedback, and progress
          forecasts — all in one place.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link to="/register" className="btn-primary px-6 py-3 text-base">Start free</Link>
          <Link to="/login" className="btn-ghost px-6 py-3 text-base">I have an account</Link>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-4 px-6 pb-20 md:grid-cols-4">
        {FEATURES.map((f) => (
          <div key={f.title} className="card">
            <div className="mb-3 inline-flex rounded-xl bg-pine-light p-2.5 text-pine-dark"><f.icon className="h-5 w-5" /></div>
            <h3 className="font-display text-lg">{f.title}</h3>
            <p className="muted mt-1">{f.body}</p>
          </div>
        ))}
      </section>
      <footer className="border-t border-line py-6 text-center text-xs text-ink-faint">
        FitAI gives general fitness and nutrition guidance, not medical advice.
      </footer>
    </div>
  );
}
