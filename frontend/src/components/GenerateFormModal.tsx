import { useState } from 'react';
import { X, Sparkles, ArrowLeft } from 'lucide-react';
import { api } from '../api/client';
import type { FormPlan } from '../api/client';

interface Props {
  onClose: () => void;
  onCreated: (form: any) => void;
}

const typeLabel = (t: string) => t === 'text' ? 'Text Input' : t === 'multiple_choice' ? 'Multiple Choice' : 'File Upload';

export default function GenerateFormModal({ onClose, onCreated }: Props) {
  const [prompt, setPrompt] = useState('');
  const [plan, setPlan] = useState<FormPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const generatePlan = async () => {
    if (!prompt.trim()) return;
    setError('');
    setPlanning(true);
    try {
      const { plan } = await api.planForm(prompt.trim());
      setPlan(plan);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setPlanning(false);
    }
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

  const totalQuestions = plan?.steps.reduce((n, s) => n + s.questions.length, 0) ?? 0;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px' }}>
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Sparkles size={18} /> Generate a form with AI
          </h3>
          <button className="btn-icon" onClick={onClose} style={{ border: 'none', background: 'none' }}><X size={18} /></button>
        </div>

        <div className="modal-body">
          {!plan ? (
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
          {!plan ? (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={generatePlan} disabled={!prompt.trim() || planning}>
                {planning ? 'Thinking...' : 'Generate Plan'}
              </button>
            </>
          ) : (
            <>
              <button className="btn btn-secondary" onClick={() => setPlan(null)}><ArrowLeft size={14} /> Back</button>
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
