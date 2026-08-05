import { useRef, useState } from 'react';
import { X, Sparkles, ArrowLeft, Loader2, Check, ExternalLink, Plus, Trash2 } from 'lucide-react';
import { api, streamPlanForm } from '../api/client';
import type { FormPlan, PlannedQuestion } from '../api/client';

interface Props {
  onClose: () => void;
  onCreated: (form: any) => void;
}

type TimelinePhase = 'understanding' | 'thinking' | 'planning' | 'approval' | 'building' | 'verify' | 'publishing' | 'ready';
type RowStatus = 'pending' | 'active' | 'done' | 'error';

const TIMELINE: { phase: TimelinePhase; label: string }[] = [
  { phase: 'understanding', label: 'Understanding your request' },
  { phase: 'thinking', label: 'Thinking through the structure' },
  { phase: 'planning', label: 'Planning the full question set' },
  { phase: 'approval', label: 'Your approval' },
  { phase: 'building', label: 'Building the form' },
  { phase: 'verify', label: 'Verifying the form' },
  { phase: 'publishing', label: 'Publishing' },
  { phase: 'ready', label: 'Ready' },
];

export default function GenerateFormTray({ onClose, onCreated }: Props) {
  const [started, setStarted] = useState(false);
  const [prompt, setPrompt] = useState('');
  const [rowStatus, setRowStatus] = useState<Record<TimelinePhase, RowStatus>>(
    () => Object.fromEntries(TIMELINE.map(t => [t.phase, 'pending'])) as Record<TimelinePhase, RowStatus>
  );
  const [rowLabel, setRowLabelState] = useState<Record<TimelinePhase, string>>(
    () => Object.fromEntries(TIMELINE.map(t => [t.phase, t.label])) as Record<TimelinePhase, string>
  );
  const [rowError, setRowErrorState] = useState<Partial<Record<TimelinePhase, string>>>({});

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [awaitingClarification, setAwaitingClarification] = useState(false);
  const [clarifyQuestions, setClarifyQuestions] = useState<string[]>([]);
  const [clarifyAnswer, setClarifyAnswer] = useState('');

  const [plan, setPlan] = useState<FormPlan | null>(null);
  const [finalForm, setFinalForm] = useState<any | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const currentPhaseRef = useRef<TimelinePhase>('understanding');

  const setRow = (phase: TimelinePhase, status: RowStatus) => {
    currentPhaseRef.current = phase;
    setRowStatus(prev => ({ ...prev, [phase]: status }));
  };
  const setRowLabel = (phase: TimelinePhase, label: string) => {
    setRowLabelState(prev => ({ ...prev, [phase]: label }));
  };
  const failCurrentRow = (message: string) => {
    const phase = currentPhaseRef.current;
    setRow(phase, 'error');
    setRowErrorState(prev => ({ ...prev, [phase]: message }));
  };

  const runTurn = async (body: { conversationId?: string; message: string }) => {
    abortRef.current = new AbortController();
    try {
      await streamPlanForm(body, (evt) => {
        if (evt.event === 'step') {
          const { phase, status, label } = evt.data as { phase: 'understanding' | 'thinking' | 'planning'; status: 'start' | 'done'; label: string };
          setRowLabel(phase, label);
          setRow(phase, status === 'start' ? 'active' : 'done');
        } else if (evt.event === 'question') {
          setConversationId(evt.data.conversationId);
          setClarifyQuestions(evt.data.questions);
          setClarifyAnswer('');
          setAwaitingClarification(true);
        } else if (evt.event === 'plan') {
          setPlan(evt.data.plan);
          setRow('approval', 'active');
        } else if (evt.event === 'error') {
          failCurrentRow(evt.data.message);
        }
      }, abortRef.current.signal);
    } catch (e: any) {
      if (e.name !== 'AbortError') failCurrentRow(e.message);
    }
  };

  const startGeneration = () => {
    if (!prompt.trim()) return;
    setStarted(true);
    runTurn({ message: prompt.trim() });
  };

  const submitClarification = () => {
    if (!clarifyAnswer.trim() || !conversationId) return;
    setAwaitingClarification(false);
    runTurn({ conversationId, message: clarifyAnswer.trim() });
  };

  const backToPrompt = () => {
    setStarted(false);
    setPlan(null);
    setAwaitingClarification(false);
    setConversationId(null);
    setRowStatus(Object.fromEntries(TIMELINE.map(t => [t.phase, 'pending'])) as Record<TimelinePhase, RowStatus>);
    setRowLabelState(Object.fromEntries(TIMELINE.map(t => [t.phase, t.label])) as Record<TimelinePhase, string>);
    setRowErrorState({});
  };

  const updateStepTitle = (stepIndex: number, title: string) => {
    setPlan(prev => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, si) => si !== stepIndex ? s : { ...s, title });
      return { ...prev, steps };
    });
  };

  const updateQuestion = (stepIndex: number, qIndex: number, patch: Partial<PlannedQuestion>) => {
    setPlan(prev => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, si) => si !== stepIndex ? s : {
        ...s,
        questions: s.questions.map((q, qi) => qi !== qIndex ? q : { ...q, ...patch }),
      });
      return { ...prev, steps };
    });
  };

  const updateOption = (stepIndex: number, qIndex: number, optIndex: number, value: string) => {
    setPlan(prev => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, si) => si !== stepIndex ? s : {
        ...s,
        questions: s.questions.map((q, qi) => qi !== qIndex ? q : { ...q, options: q.options.map((o, oi) => oi !== optIndex ? o : value) }),
      });
      return { ...prev, steps };
    });
  };

  const addOption = (stepIndex: number, qIndex: number) => {
    setPlan(prev => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, si) => si !== stepIndex ? s : {
        ...s,
        questions: s.questions.map((q, qi) => qi !== qIndex ? q : { ...q, options: [...q.options, `Option ${q.options.length + 1}`] }),
      });
      return { ...prev, steps };
    });
  };

  const removeOption = (stepIndex: number, qIndex: number, optIndex: number) => {
    setPlan(prev => {
      if (!prev) return prev;
      const steps = prev.steps.map((s, si) => si !== stepIndex ? s : {
        ...s,
        questions: s.questions.map((q, qi) => qi !== qIndex ? q : { ...q, options: q.options.filter((_, oi) => oi !== optIndex) }),
      });
      return { ...prev, steps };
    });
  };

  const approvePlan = async () => {
    if (!plan) return;
    setRow('approval', 'done');
    try {
      setRow('building', 'active');
      const { form } = await api.createFormFromPlan(plan);
      setRow('building', 'done');

      setRow('verify', 'active');
      const { questions, steps } = await api.getForm(form.id);
      if (questions.length === 0) throw new Error('The created form has no questions.');
      if (steps.length > 0 && steps.some((s: any) => !questions.some((q: any) => q.step_id === s.id))) {
        throw new Error('One or more steps ended up with no questions.');
      }
      setRow('verify', 'done');

      setRow('publishing', 'active');
      const { form: published } = await api.updateForm(form.id, { status: 'published' });
      setRow('publishing', 'done');

      setFinalForm(published);
      setRow('ready', 'done');
    } catch (e: any) {
      failCurrentRow(e.message);
    }
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  const totalQuestions = plan?.steps.reduce((n, s) => n + s.questions.length, 0) ?? 0;

  const renderIcon = (status: RowStatus) => {
    if (status === 'active') return <Loader2 size={12} style={{ animation: 'spin 0.7s linear infinite' }} />;
    if (status === 'done') return <Check size={12} />;
    if (status === 'error') return <X size={12} />;
    return null;
  };

  return (
    <div className="tray-overlay" onClick={close}>
      <div className="tray" onClick={e => e.stopPropagation()}>
        <div className="tray-header">
          <div className="tray-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} /> Generate a form with AI
          </div>
          <button className="btn-icon" onClick={close} style={{ border: 'none', background: 'none' }}><X size={18} /></button>
        </div>

        <div className="tray-body">
          {!started ? (
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
          ) : (
            <div className="timeline">
              {TIMELINE.map(({ phase }) => {
                const status = rowStatus[phase];
                return (
                  <div key={phase} className="timeline-row">
                    <div className="timeline-marker">
                      <div className={`timeline-icon ${status}`}>{renderIcon(status)}</div>
                      <div className={`timeline-connector ${status === 'done' ? 'done' : ''}`} />
                    </div>
                    <div className="timeline-row-content">
                      <div className={`timeline-label ${status}`}>{rowLabel[phase]}</div>
                      {rowError[phase] && (
                        <div style={{ color: 'var(--red)', fontSize: '0.8rem', marginTop: '0.35rem' }}>{rowError[phase]}</div>
                      )}

                      {phase === 'understanding' && awaitingClarification && (
                        <div className="timeline-inline">
                          <div className="form-label" style={{ marginBottom: '0.5rem' }}>Before I continue, a quick question:</div>
                          <ul style={{ margin: '0 0 0.75rem', paddingLeft: '1.1rem', fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                            {clarifyQuestions.map((q, i) => <li key={i} style={{ marginBottom: '0.25rem' }}>{q}</li>)}
                          </ul>
                          <textarea
                            className="input"
                            style={{ minHeight: 80, resize: 'vertical' }}
                            value={clarifyAnswer}
                            onChange={e => setClarifyAnswer(e.target.value)}
                            placeholder="Your answer..."
                            autoFocus
                          />
                        </div>
                      )}

                      {phase === 'approval' && status === 'active' && plan && (
                        <div className="timeline-inline">
                          <div style={{ marginBottom: '1rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{plan.title}</div>
                            {plan.description && <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '0.25rem' }}>{plan.description}</p>}
                            <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                              {plan.steps.length > 1 ? `${plan.steps.length} steps, ` : ''}{totalQuestions} question{totalQuestions !== 1 ? 's' : ''}
                            </p>
                          </div>

                          {plan.steps.map((step, si) => (
                            <div key={si} style={{ marginBottom: '1rem' }}>
                              {plan.steps.length > 1 && (
                                <input
                                  className="input"
                                  value={step.title}
                                  onChange={e => updateStepTitle(si, e.target.value)}
                                  style={{ fontWeight: 600, fontSize: '0.86rem', marginBottom: '0.5rem', padding: '0.4rem 0.6rem' }}
                                />
                              )}
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {step.questions.map((q, qi) => (
                                  <div key={qi} className="card" style={{ padding: '0.65rem 0.85rem' }}>
                                    <input
                                      className="input"
                                      value={q.label}
                                      onChange={e => updateQuestion(si, qi, { label: e.target.value })}
                                      style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}
                                    />
                                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                      <select
                                        className="select"
                                        value={q.type}
                                        onChange={e => updateQuestion(si, qi, { type: e.target.value as PlannedQuestion['type'] })}
                                        style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem 0.5rem' }}
                                      >
                                        <option value="text">Text Input</option>
                                        <option value="multiple_choice">Multiple Choice</option>
                                        <option value="file_upload">File Upload</option>
                                      </select>
                                      <div className="toggle-wrap" style={{ flexShrink: 0 }}>
                                        <div className={`toggle ${q.required ? 'active' : ''}`} onClick={() => updateQuestion(si, qi, { required: !q.required })} />
                                        <span className="toggle-label" style={{ fontSize: '0.78rem' }}>Required</span>
                                      </div>
                                    </div>
                                    {q.type === 'multiple_choice' && (
                                      <div style={{ marginTop: '0.5rem' }}>
                                        <div className="option-list">
                                          {q.options.map((opt, oi) => (
                                            <div key={oi} className="option-item">
                                              <div className="option-bullet" />
                                              <input
                                                className="input"
                                                value={opt}
                                                onChange={e => updateOption(si, qi, oi, e.target.value)}
                                                placeholder={`Option ${oi + 1}`}
                                                style={{ fontSize: '0.82rem' }}
                                              />
                                              {q.options.length > 1 && (
                                                <button className="btn-icon" onClick={() => removeOption(si, qi, oi)} style={{ width: 28, height: 28, flexShrink: 0 }}>
                                                  <Trash2 size={12} />
                                                </button>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                        <button className="btn btn-ghost btn-sm" onClick={() => addOption(si, qi)} style={{ marginTop: '0.4rem' }}>
                                          <Plus size={12} /> Add Option
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}

                          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
                            <button className="btn btn-secondary" onClick={backToPrompt}><ArrowLeft size={14} /> Back</button>
                            <button className="btn btn-primary" onClick={approvePlan}>Approve &amp; Build</button>
                          </div>
                        </div>
                      )}

                      {phase === 'ready' && status === 'done' && finalForm && (
                        <div className="timeline-inline">
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '1rem' }}>
                            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{finalForm.title}</div>
                            <button
                              className="btn btn-ghost btn-sm"
                              onClick={() => window.open(`/f/${finalForm.slug}`, '_blank')}
                            >
                              <ExternalLink size={14} /> Open
                            </button>
                          </div>
                          <button className="btn btn-primary" style={{ width: '100%', justifyContent: 'center' }} onClick={() => onCreated(finalForm)}>
                            Go to form
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="tray-footer">
          {!started && (
            <>
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              <button className="btn btn-primary" onClick={startGeneration} disabled={!prompt.trim()}>
                Generate Plan
              </button>
            </>
          )}

          {started && awaitingClarification && (
            <>
              <button className="btn btn-secondary" onClick={close}>Cancel</button>
              <button className="btn btn-primary" onClick={submitClarification} disabled={!clarifyAnswer.trim()}>
                Continue
              </button>
            </>
          )}

          {started && !awaitingClarification && rowStatus.approval !== 'active' && rowStatus.ready !== 'done' && (
            <button className="btn btn-secondary" onClick={close}>
              {Object.values(rowStatus).includes('error') ? 'Close' : 'Cancel'}
            </button>
          )}

          {started && rowStatus.ready === 'done' && (
            <button className="btn btn-secondary" onClick={close}>Close</button>
          )}
        </div>
      </div>
    </div>
  );
}
