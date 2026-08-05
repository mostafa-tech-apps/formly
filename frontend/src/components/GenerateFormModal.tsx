import { useRef, useState } from 'react';
import { X, Sparkles, ArrowLeft, Loader2, Check } from 'lucide-react';
import { api, streamPlanForm } from '../api/client';
import type { FormPlan } from '../api/client';

interface Props {
  onClose: () => void;
  onCreated: (form: any) => void;
}

const typeLabel = (t: string) => t === 'text' ? 'Text Input' : t === 'multiple_choice' ? 'Multiple Choice' : 'File Upload';

interface StepProgress {
  phase: 'analyzing' | 'outlining' | 'building';
  status: 'start' | 'done';
  label: string;
}

export default function GenerateFormModal({ onClose, onCreated }: Props) {
  const [phase, setPhase] = useState<'prompt' | 'working' | 'clarifying' | 'review'>('prompt');
  const [prompt, setPrompt] = useState('');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [progress, setProgress] = useState<StepProgress[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [answer, setAnswer] = useState('');
  const [plan, setPlan] = useState<FormPlan | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const upsertStep = (evt: StepProgress) => {
    setProgress(prev => {
      const i = prev.findIndex(p => p.phase === evt.phase);
      if (i === -1) return [...prev, evt];
      const next = [...prev];
      next[i] = evt;
      return next;
    });
  };

  const runTurn = async (body: { conversationId?: string; message: string }) => {
    setError('');
    setPhase('working');
    abortRef.current = new AbortController();

    try {
      await streamPlanForm(body, (evt) => {
        if (evt.event === 'step') upsertStep(evt.data);
        else if (evt.event === 'question') {
          setConversationId(evt.data.conversationId);
          setQuestions(evt.data.questions);
          setAnswer('');
          setPhase('clarifying');
        } else if (evt.event === 'plan') {
          setPlan(evt.data.plan);
          setPhase('review');
        } else if (evt.event === 'error') {
          setError(evt.data.message);
          setPhase('prompt');
        }
      }, abortRef.current.signal);
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        setError(e.message);
        setPhase('prompt');
      }
    }
  };

  const startGeneration = () => {
    if (!prompt.trim()) return;
    setProgress([]);
    runTurn({ message: prompt.trim() });
  };

  const submitAnswer = () => {
    if (!answer.trim() || !conversationId) return;
    runTurn({ conversationId, message: answer.trim() });
  };

  const approvePlan = async () => {
    if (!plan) return;
    setError('');
    setCreating(true);
    try {
      const { form } = await api.createFormFromPlan(plan);
      onCreated(form);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const totalQuestions = plan?.steps.reduce((n, s) => n + s.questions.length, 0) ?? 0;

  return (
    <div className="modal-overlay" onClick={close}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} /> Generate a form with AI
          </h3>
          <button className="btn-icon" onClick={close} style={{ border: 'none', background: 'none' }}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {phase === 'prompt' && (
            <div className="form-group">
              <label className="form-label">Describe the form you want</label>
              <textarea
                className="input"
                style={{ minHeight: 110, resize: 'vertical' }}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                placeholder="e.g. A customer feedback form for a bakery, asking about their order, food quality, and whether they'd recommend us."
                autoFocus
              />
            </div>
          )}

          {(phase === 'working' || phase === 'clarifying') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
              {progress.map(step => (
                <div key={step.phase} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.9rem' }}>
                  {step.status === 'done'
                    ? <Check size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
                    : <Loader2 size={16} style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0, color: 'var(--text-muted)' }} />}
                  <span style={{ color: step.status === 'done' ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{step.label}</span>
                </div>
              ))}

              {phase === 'clarifying' && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <div className="form-label" style={{ marginBottom: '0.5rem' }}>Before I continue, a quick question:</div>
                  <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.1rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                    {questions.map((q, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{q}</li>)}
                  </ul>
                  <textarea
                    className="input"
                    style={{ minHeight: 80, resize: 'vertical' }}
                    value={answer}
                    onChange={e => setAnswer(e.target.value)}
                    placeholder="Your answer..."
                    autoFocus
                  />
                </div>
              )}
            </div>
          )}

          {phase === 'review' && plan && (
            <div>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>{plan.title}</div>
                {plan.description && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{plan.description}</p>}
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                  {plan.steps.length > 1 ? `${plan.steps.length} steps, ` : ''}{totalQuestions} question{totalQuestions !== 1 ? 's' : ''}
                </p>
              </div>

              {plan.steps.map((step, si) => (
                <div key={si} style={{ marginBottom: '1rem' }}>
                  {plan.steps.length > 1 && (
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.5rem' }}>{step.title || `Step ${si + 1}`}</div>
                  )}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    {step.questions.map((q, qi) => (
                      <div key={qi} className="card" style={{ padding: '0.6rem 0.85rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
                          <span style={{ fontSize: '0.88rem' }}>
                            {q.label}
                            {q.required && <span className="required-star"> *</span>}
                          </span>
                          <span className="badge badge-type" style={{ flexShrink: 0 }}>{typeLabel(q.type)}</span>
                        </div>
                        {q.type === 'multiple_choice' && q.options.length > 0 && (
                          <div style={{ marginTop: '0.35rem', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>
                            {q.options.join(' · ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="modal-footer">
          {error && <span style={{ color: 'var(--red)', fontSize: '0.8rem', marginRight: 'auto' }}>{error}</span>}

          {phase === 'prompt' && (
            <>
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              <button className="btn btn-primary" onClick={startGeneration} disabled={!prompt.trim()}>
                Generate Plan
              </button>
            </>
          )}

          {phase === 'working' && (
            <button className="btn btn-secondary" onClick={close}>Cancel</button>
          )}

          {phase === 'clarifying' && (
            <>
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              <button className="btn btn-primary" onClick={submitAnswer} disabled={!answer.trim()}>
                Continue
              </button>
            </>
          )}

          {phase === 'review' && (
            <>
              <button className="btn btn-secondary" onClick={() => { setPlan(null); setProgress([]); setPhase('prompt'); }}>
                <ArrowLeft size={14} /> Back
              </button>
              <button className="btn btn-primary" onClick={approvePlan} disabled={creating}>
                {creating ? 'Creating...' : 'Create Form'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
