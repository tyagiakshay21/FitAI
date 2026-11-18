import { useEffect, useRef, useState } from 'react';
import { Bot, Loader2, Send, User } from 'lucide-react';
import { aiApi, errorMessage } from '../lib/api';
import type { ChatMessage } from '../lib/types';
import { useToast } from '../context/ToastContext';

const SUGGESTIONS = [
  "What should I train today?",
  "How to do squats with proper form?",
  "What are good high-protein vegetarian snacks?",
  "How much protein have I had today?",
  "Explain progressive overload for muscle growth",
  "How can I relieve muscle soreness after training?",
];

export default function Assistant() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const endRef = useRef<HTMLDivElement>(null);
  const startedChatRef = useRef(false);

  useEffect(() => {
    let active = true;
    aiApi.history().then((history) => {
      if (active && !startedChatRef.current) setMessages(history);
    }).catch(() => {
      // Chat remains usable if old conversation history is unavailable.
    });
    return () => { active = false; };
  }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || busy) return;
    startedChatRef.current = true;
    setInput('');
    const requestId = `tmp-${Date.now()}`;
    setMessages((m) => [...m, { id: requestId, role: 'USER', content: message, createdAt: new Date().toISOString() }]);
    setBusy(true);
    try {
      const r = await aiApi.chat(message);
      setMessages((m) => [...m, { id: `${requestId}-a`, role: 'ASSISTANT', content: r.reply, createdAt: new Date().toISOString() }]);
    } catch (err) {
      setMessages((m) => m.filter((messageItem) => messageItem.id !== requestId));
      setInput(message);
      toast(errorMessage(err, 'The assistant could not respond.'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-w-2xl flex-col">
      <h1 className="font-display mb-4 text-2xl">AI Assistant</h1>
      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {!messages.length && (
          <div className="card">
            <p className="muted text-sm">Ask about your workouts, nutrition or progress. FitAI gives general fitness guidance, not medical advice.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {SUGGESTIONS.map((s) => <button key={s} onClick={() => send(s)} className="chip text-xs">{s}</button>)}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex items-start gap-2 ${m.role === 'USER' ? 'flex-row-reverse' : ''}`}>
            <div className={`rounded-full p-1.5 ${m.role === 'USER' ? 'bg-ink text-white' : 'bg-pine text-white'}`}>{m.role === 'USER' ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}</div>
            <div className={`max-w-[80%] whitespace-pre-wrap rounded-xl2 px-4 py-2.5 text-sm ${m.role === 'USER' ? 'bg-ink text-white' : 'card'}`}>{m.content}</div>
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-ink-faint"><Loader2 className="h-4 w-4 animate-spin" /> Thinking…</div>}
        <div ref={endRef} />
      </div>
      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2 border-t border-line pt-3">
        <input className="input" placeholder="Ask FitAI…" value={input} maxLength={1000} onChange={(e) => setInput(e.target.value)} />
        <button className="btn-primary" disabled={busy}><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
