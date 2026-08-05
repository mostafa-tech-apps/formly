import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, ClipboardCopy, ExternalLink, Save } from 'lucide-react';
import { api } from '../api/client';
import type { Form, Question } from '../types';
import { parseOptions, isRequired } from '../types';
import QuestionEditor from '../components/QuestionEditor';

export default function FormBuilder() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showNewQuestion, setShowNewQuestion] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const data = await api.getForm(id!);
      setForm(data.form);
      setQuestions(data.questions);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const saveForm = async (updates: Partial<Form>) => {
    setSaving(true);
    try {
      const { form: updated } = await api.updateForm(id!, updates);
      setForm(updated);
      showToast('Saved');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async () => {
    const newStatus = form?.status === 'published' ? 'draft' : 'published';
    if (newStatus === 'published' && questions.length === 0) {
      showToast('A form must have at least one question to be published.', 'error');
      return;
    }
    await saveForm({ status: newStatus });
  };

  const addQuestion = async (data: any) => {
    try {
      const { question } = await api.addQuestion(id!, data);
      setQuestions(q => [...q, question]);
      setShowNewQuestion(false);
      showToast('Question added');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const updateQuestion = async (qId: string, data: any) => {
    try {
      const { question } = await api.updateQuestion(id!, qId, data);
      setQuestions(qs => qs.map(q => q.id === qId ? question : q));
      setEditingQuestion(null);
      showToast('Question updated');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const deleteQuestion = async (qId: string) => {
    if (!confirm('Delete this question?')) return;
    try {
      await api.deleteQuestion(id!, qId);
      setQuestions(qs => qs.filter(q => q.id !== qId));
      showToast('Question deleted');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const moveQuestion = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.length) return;
    const reordered = [...questions];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setQuestions(reordered);
    try {
      await api.reorderQuestions(id!, reordered.map(q => q.id));
    } catch (e: any) {
      showToast(e.message, 'error');
      load();
    }
  };

  const copyUrl = () => {
    if (form?.slug) {
      navigator.clipboard.writeText(`${window.location.origin}/f/${form.slug}`);
      showToast('URL copied to clipboard');
    }
  };

  const typeLabel = (t: string) => t === 'text' ? 'Text Input' : t === 'multiple_choice' ? 'Multiple Choice' : 'File Upload';

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!form) return <div className="page-container"><div className="error-banner">Form not found</div></div>;

  return (
    <div className="page-container">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to Dashboard</Link>

      {/* Form header */}
      <div style={{ marginBottom: '2rem' }}>
        <input
          className="input-inline input-title"
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          onBlur={() => saveForm({ title: form.title })}
          placeholder="Form title..."
        />
        <input
          className="input-inline input-desc"
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          onBlur={() => saveForm({ description: form.description })}
          placeholder="Add a description..."
          style={{ marginTop: '0.25rem' }}
        />
      </div>

      {/* Publish toggle + URL */}
      <div className="card" style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="toggle-wrap">
            <div className={`toggle ${form.status === 'published' ? 'active' : ''}`} onClick={togglePublish} />
            <span className="toggle-label">
              {form.status === 'published' ? 'Published' : 'Draft'}
            </span>
          </div>
        </div>
        {form.status === 'published' && form.slug && (
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <div className="copy-url-wrap">
              <code>{window.location.origin}/f/{form.slug}</code>
            </div>
            <button className="btn-icon" onClick={copyUrl} title="Copy URL"><ClipboardCopy size={16} /></button>
            <button className="btn-icon" onClick={() => window.open(`/f/${form.slug}`, '_blank')} title="Open form">
              <ExternalLink size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Questions */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>Questions ({questions.length})</h2>
        <button className="btn btn-primary btn-sm" onClick={() => setShowNewQuestion(true)}>
          <Plus size={16} /> Add Question
        </button>
      </div>

      {questions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Plus size={28} /></div>
          <h3>No questions yet</h3>
          <p>Add your first question to start building this form.</p>
          <button className="btn btn-primary" onClick={() => setShowNewQuestion(true)}>
            <Plus size={18} /> Add Question
          </button>
        </div>
      ) : (
        <div className="question-list">
          {questions.map((q, i) => (
            <div key={q.id} className="question-card">
              <div className="question-card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                  <span className="question-number">{i + 1}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
                      {q.label || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Untitled question</span>}
                    </div>
                    <div className="question-card-badges">
                      <span className="badge badge-type">{typeLabel(q.type)}</span>
                      {isRequired(q.required) && <span className="badge badge-required">Required</span>}
                    </div>
                  </div>
                </div>
                <div className="question-card-actions">
                  <button className="btn-icon" onClick={() => moveQuestion(i, 'up')} disabled={i === 0} title="Move up" style={{ width: 30, height: 30 }}>
                    <ChevronUp size={14} />
                  </button>
                  <button className="btn-icon" onClick={() => moveQuestion(i, 'down')} disabled={i === questions.length - 1} title="Move down" style={{ width: 30, height: 30 }}>
                    <ChevronDown size={14} />
                  </button>
                  <button className="btn-icon" onClick={() => setEditingQuestion(q)} title="Edit" style={{ width: 30, height: 30 }}>
                    <Save size={14} />
                  </button>
                  <button className="btn-icon" onClick={() => deleteQuestion(q.id)} title="Delete" style={{ width: 30, height: 30, color: 'var(--red)' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              {q.type === 'multiple_choice' && (
                <div style={{ marginTop: '0.5rem', paddingLeft: '2.75rem' }}>
                  {parseOptions(q.options).map((opt, oi) => (
                    <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.2rem 0', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
                      <div className="option-bullet" /> {opt}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* New question modal */}
      {showNewQuestion && (
        <QuestionEditor onSave={addQuestion} onClose={() => setShowNewQuestion(false)} />
      )}

      {/* Edit question modal */}
      {editingQuestion && (
        <QuestionEditor
          question={editingQuestion}
          onSave={(data) => updateQuestion(editingQuestion.id, data)}
          onClose={() => setEditingQuestion(null)}
        />
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
