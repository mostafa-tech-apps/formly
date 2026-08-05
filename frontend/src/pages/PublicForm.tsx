import { useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react';
import { api } from '../api/client';
import type { PublicFormMeta } from '../api/client';
import type { Question, Step } from '../types';
import { parseOptions, isRequired, parseVisibilityRules } from '../types';
import { evaluateLogic } from '../logicEvaluator';

export default function PublicForm() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<PublicFormMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [stepIndex, setStepIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  useState(() => {
    api.getPublicForm(slug!)
      .then(data => { setForm(data.form); setQuestions(data.questions); setSteps(data.steps ?? []); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  });

  const visibleQuestions = useMemo(() => {
    return questions.filter(q => {
      const logic = parseVisibilityRules(q.visibility_rules);
      return evaluateLogic(logic, answers, files);
    });
  }, [questions, answers, files]);

  // Group visible questions by step, in step order. Any question with no
  // step_id (shouldn't normally happen once a form has steps, but defensive
  // against odd data) is folded into the first step rather than dropped.
  const stepGroups = useMemo(() => {
    if (steps.length === 0) return null;
    const sorted = [...steps].sort((a, b) => a.order_index - b.order_index);
    const groups = sorted.map(step => ({
      step,
      questions: visibleQuestions.filter(q => q.step_id === step.id),
    }));
    const unassigned = visibleQuestions.filter(q => !q.step_id);
    if (unassigned.length > 0 && groups.length > 0) {
      groups[0].questions = [...unassigned, ...groups[0].questions];
    }
    return groups;
  }, [steps, visibleQuestions]);

  const isMultiStep = stepGroups !== null && stepGroups.length > 0;
  const clampedStepIndex = isMultiStep ? Math.min(stepIndex, stepGroups!.length - 1) : 0;
  const currentStepQuestions = isMultiStep ? stepGroups![clampedStepIndex].questions : visibleQuestions;
  const isLastStep = !isMultiStep || clampedStepIndex === stepGroups!.length - 1;

  const validate = (qs: Question[]): string => {
    for (const q of qs) {
      if (isRequired(q.required)) {
        if (q.type === 'file_upload' && !files[q.id]) return `"${q.label}" is required`;
        if (q.type !== 'file_upload' && (!answers[q.id] || !answers[q.id].trim())) return `"${q.label}" is required`;
      }
    }
    return '';
  };

  const goNext = () => {
    const validationError = validate(currentStepQuestions);
    if (validationError) { setError(validationError); return; }
    setError('');
    setStepIndex(i => Math.min(i + 1, (stepGroups?.length ?? 1) - 1));
  };

  const goBack = () => {
    setError('');
    setStepIndex(i => Math.max(i - 1, 0));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validate(currentStepQuestions);
    if (validationError) { setError(validationError); return; }
    setError('');

    setSubmitting(true);
    try {
      const fd = new FormData();
      for (const q of visibleQuestions) {
        if (q.type === 'file_upload') { if (files[q.id]) fd.append(q.id, files[q.id]); }
        else fd.append(q.id, answers[q.id] ?? '');
      }
      await api.submitForm(slug!, fd);
      setSubmitted(true);
    } catch (e: any) { setError(e.message); } finally { setSubmitting(false); }
  };

  if (loading) return <div className="public-page"><div className="loading"><div className="spinner" /></div></div>;
  if (notFound) return <div className="public-page"><div className="public-form-container"><div className="success-page"><h2>Form not found</h2><p>This form may have been unpublished or deleted.</p></div></div></div>;
  if (submitted) return <div className="public-page"><div className="public-form-container"><div className="success-page"><div className="success-icon"><CheckCircle size={36} /></div><h2>Thank you!</h2><p>Your response has been submitted successfully.</p></div></div></div>;
  if (!form) return null;

  const renderQuestion = (q: Question) => (
    <div key={q.id} className="public-question">
      <div className="public-question-label">
        <span>{q.label}</span>
        {isRequired(q.required) && <span className="required-star">*</span>}
      </div>
      {q.type === 'text' && <input className="input" value={answers[q.id] ?? ''} onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="Your answer..." />}
      {q.type === 'multiple_choice' && (
        <div className="radio-group">
          {parseOptions(q.options).map((opt, i) => (
            <label key={i} className={`radio-option ${answers[q.id] === opt ? 'selected' : ''}`} onClick={() => setAnswers({ ...answers, [q.id]: opt })}>
              <div className="radio-dot" /><span className="radio-label">{opt}</span>
            </label>
          ))}
        </div>
      )}
      {q.type === 'file_upload' && (
        <>
          <input ref={el => { fileRefs.current[q.id] = el; }} type="file" style={{ display: 'none' }} onChange={e => { if (e.target.files?.[0]) setFiles({ ...files, [q.id]: e.target.files[0] }); }} />
          <div className={`file-drop ${files[q.id] ? 'has-file' : ''}`} onClick={() => fileRefs.current[q.id]?.click()}>
            <div className="file-drop-icon"><Upload size={24} /></div>
            {files[q.id] ? <div className="file-name">{files[q.id].name}</div> : <div>Click to upload a file</div>}
          </div>
        </>
      )}
    </div>
  );

  return (
    <div className="public-page">
      <div className="public-form-container">
        <div className="public-form-header">
          <h1>{form.title}</h1>
          {form.description && <p>{form.description}</p>}
        </div>

        {isMultiStep && (
          <div style={{ marginBottom: '1.5rem' }}>
            <div className="form-progress-label">
              <span>{stepGroups![clampedStepIndex].step.title || `Step ${clampedStepIndex + 1}`}</span>
              <span>Step {clampedStepIndex + 1} of {stepGroups!.length}</span>
            </div>
            <div className="form-progress-track">
              <div className="form-progress-fill" style={{ width: `${((clampedStepIndex + 1) / stepGroups!.length) * 100}%` }} />
            </div>
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          {currentStepQuestions.map(renderQuestion)}

          {isMultiStep ? (
            <div className="form-step-nav">
              {clampedStepIndex > 0 ? (
                <button type="button" className="btn btn-secondary" onClick={goBack}><ArrowLeft size={16} /> Back</button>
              ) : <span />}
              {isLastStep ? (
                <button className="btn btn-primary" type="submit" disabled={submitting}>
                  {submitting ? 'Submitting...' : 'Submit Response'}
                </button>
              ) : (
                <button type="button" className="btn btn-primary" onClick={goNext}>Next <ArrowRight size={16} /></button>
              )}
            </div>
          ) : (
            <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', marginTop: '0.5rem' }}>
              {submitting ? 'Submitting...' : 'Submit Response'}
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
