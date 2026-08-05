import { useState, useRef, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { Upload, CheckCircle } from 'lucide-react';
import { api } from '../api/client';
import type { Question } from '../types';
import { parseOptions, isRequired, parseVisibilityRules } from '../types';
import { evaluateLogic } from '../logicEvaluator';

export default function PublicForm() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<any>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
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
      .then(data => { setForm(data.form); setQuestions(data.questions); setLoading(false); })
      .catch(() => { setNotFound(true); setLoading(false); });
  });

  const visibleQuestions = useMemo(() => {
    return questions.filter(q => {
      const logic = parseVisibilityRules(q.visibility_rules);
      return evaluateLogic(logic, answers, files);
    });
  }, [questions, answers, files]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    for (const q of visibleQuestions) {
      if (isRequired(q.required)) {
        if (q.type === 'file_upload' && !files[q.id]) { setError(`"${q.label}" is required`); return; }
        if (q.type !== 'file_upload' && (!answers[q.id] || !answers[q.id].trim())) { setError(`"${q.label}" is required`); return; }
      }
    }
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

  return (
    <div className="public-page">
      <div className="public-form-container">
        <div className="public-form-header">
          <h1>{form.title}</h1>
          {form.description && <p>{form.description}</p>}
        </div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={handleSubmit}>
          {visibleQuestions.map(q => (
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
          ))}
          <button className="btn btn-primary" type="submit" disabled={submitting} style={{ width: '100%', padding: '0.85rem', fontSize: '1rem', marginTop: '0.5rem' }}>
            {submitting ? 'Submitting...' : 'Submit Response'}
          </button>
        </form>
      </div>
    </div>
  );
}
