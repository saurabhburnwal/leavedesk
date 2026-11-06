import { useState } from 'react';
import { AiApi, useAiEnabled } from '../api/ai.js';
import { useToast } from '../context.jsx';
import { LEAVE_TYPE_META, formatRange } from '../utils.js';
import '../styles/ai.css';

const Sparkle = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    <path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9L12 2zm7 11l.9 2.6 2.6.9-2.6.9L19 20l-.9-2.6-2.6-.9 2.6-.9L19 13z" />
  </svg>
);

/** Apply page: describe the leave in plain English; the AI pre-fills the form for review. */
export function AiLeaveAssistant({ onSuggestion }) {
  const enabled = useAiEnabled();
  const toast = useToast();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);
  if (!enabled) return null;

  async function submit(e) {
    e.preventDefault();
    if (text.trim().length < 3) return;
    setBusy(true);
    try {
      const { suggestion } = await AiApi.suggestLeave(text.trim());
      setLast(suggestion);
      onSuggestion(suggestion);
      toast.success('Form filled from your description. Please review before submitting.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card ai-card" onSubmit={submit}>
      <div className="ai-head">
        <span className="ai-badge">
          <Sparkle /> AI assist
        </span>
        <span className="muted small">Describe your leave in plain English, then check the filled form. Nothing is submitted automatically.</span>
      </div>
      <div className="ai-input-row">
        <input
          type="text"
          value={text}
          maxLength={400}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Need next Monday to Wednesday off for my sister's wedding"
          aria-label="Describe your leave"
        />
        <button className="btn btn-primary" type="submit" disabled={busy || text.trim().length < 3}>
          {busy ? 'Thinking…' : 'Fill the form'}
        </button>
      </div>
      {last && (
        <p className="ai-result small">
          <strong>AI suggestion:</strong> {LEAVE_TYPE_META[last.leaveType]?.label} · {formatRange(last.fromDate, last.toDate)}
          {last.dayPart !== 'FULL' && ` · ${last.dayPart === 'FIRST_HALF' ? 'first half' : 'second half'}`}
          {last.notes && <span className="muted"> · {last.notes}</span>}
        </p>
      )}
    </form>
  );
}

/** Floating policy assistant (RAG over the leave policy + the user's live balance). */
export function PolicyAssistant() {
  const enabled = useAiEnabled();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'ai', text: 'Hi! Ask me about leave rules or your balance, e.g. "Do I need a document for 4 days?" or "How many sick days do I have left?"' },
  ]);
  if (!enabled) return null;

  async function ask(e) {
    e.preventDefault();
    const question = text.trim();
    if (question.length < 3 || busy) return;
    setMessages((m) => [...m, { role: 'user', text: question }]);
    setText('');
    setBusy(true);
    try {
      const { answer, sources } = await AiApi.ask(question);
      setMessages((m) => [...m, { role: 'ai', text: answer, sources }]);
    } catch (err) {
      setMessages((m) => [...m, { role: 'ai', text: err.message, error: true }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="ai-fab" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="ai-chat" title="Ask the leave-policy assistant">
        <Sparkle /> <span>{open ? 'Close' : 'Ask policy AI'}</span>
      </button>
      {open && (
        <section id="ai-chat" className="ai-chat" aria-label="Leave policy assistant">
          <header className="ai-chat-head">
            <span className="ai-badge">
              <Sparkle /> Policy assistant
            </span>
            <span className="muted small">Answers come from the leave policy and your balance. AI can make mistakes; HR has the final word.</span>
          </header>
          <div className="ai-messages" aria-live="polite">
            {messages.map((m, i) => (
              <div key={i} className={`ai-msg ai-msg-${m.role} ${m.error ? 'ai-msg-error' : ''}`}>
                {m.text}
                {m.sources?.length > 0 && <div className="ai-sources">Source: {m.sources.join(' · ')}</div>}
              </div>
            ))}
            {busy && <div className="ai-msg ai-msg-ai muted">Thinking…</div>}
          </div>
          <form className="ai-input-row" onSubmit={ask}>
            <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="Ask about leave rules…" aria-label="Your question" />
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy || text.trim().length < 3}>
              Ask
            </button>
          </form>
        </section>
      )}
    </>
  );
}

/** Approver-only advisory summary of a request. */
export function AiInsight({ leaveId }) {
  const enabled = useAiEnabled();
  const [state, setState] = useState({ loading: false });
  if (!enabled) return null;

  async function load() {
    setState({ loading: true });
    try {
      setState({ loading: false, data: await AiApi.insight(leaveId) });
    } catch (error) {
      setState({ loading: false, error });
    }
  }

  return (
    <div className="ai-insight">
      {!state.data && (
        <button className="btn btn-sm btn-secondary" onClick={load} disabled={state.loading}>
          <Sparkle /> {state.loading ? 'Analysing…' : 'AI insight'}
        </button>
      )}
      {state.error && <p className="small text-danger">{state.error.message}</p>}
      {state.data && (
        <div className="ai-insight-box">
          <span className="ai-badge">
            <Sparkle /> AI insight · advisory only, you decide
          </span>
          <p>{state.data.summary}</p>
        </div>
      )}
    </div>
  );
}
