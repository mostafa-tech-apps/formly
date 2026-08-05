import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, ClipboardCopy, ExternalLink, Pencil, GripVertical, Layers, ChevronUp, ChevronDown } from 'lucide-react';
import { api } from '../api/client';
import type { Form, Question, Step } from '../types';
import { parseOptions, isRequired } from '../types';
import QuestionEditor from '../components/QuestionEditor';
import FormTabs from '../components/FormTabs';

export default function FormBuilder() {
  const { id } = useParams<{ id: string }>();
  const [form, setForm] = useState<Form | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [showNewQuestion, setShowNewQuestion] = useState(false);
  const [newQuestionStepId, setNewQuestionStepId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragStartStepId, setDragStartStepId] = useState<string | null>(null);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const load = async () => {
    try {
      const data = await api.getForm(id!);
      setForm(data.form);
      setQuestions(data.questions);
      setSteps(data.steps ?? []);
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
      const { question } = await api.addQuestion(id!, { ...data, step_id: newQuestionStepId });
      setQuestions(q => [...q, question]);
      setShowNewQuestion(false);
      setNewQuestionStepId(null);
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

  // Drag a question to reorder it, or drop it onto a different step's section
  // to move it there. Tracking by id (not array index) keeps this correct
  // whether the drop target is in the same step or a different one.
  const shiftQuestion = (overId: string) => {
    if (!draggedId || draggedId === overId) return;
    setQuestions(prev => {
      const fromIndex = prev.findIndex(q => q.id === draggedId);
      const overIndex = prev.findIndex(q => q.id === overId);
      if (fromIndex === -1 || overIndex === -1) return prev;
      const overStepId = prev[overIndex].step_id ?? null;
      const reordered = [...prev];
      reordered[fromIndex] = { ...reordered[fromIndex], step_id: overStepId };
      const [moved] = reordered.splice(fromIndex, 1);
      const newOverIndex = reordered.findIndex(q => q.id === overId);
      reordered.splice(newOverIndex, 0, moved);
      return reordered;
    });
  };

  const moveToStepEnd = (stepId: string | null) => {
    if (!draggedId) return;
    setQuestions(prev => {
      const fromIndex = prev.findIndex(q => q.id === draggedId);
      if (fromIndex === -1) return prev;
      const dragged = { ...prev[fromIndex], step_id: stepId };
      const rest = prev.filter((_, idx) => idx !== fromIndex);
      rest.push(dragged);
      return rest;
    });
  };

  const persistOrder = async () => {
    const dragged = questions.find(q => q.id === draggedId);
    setDraggedId(null);
    try {
      if (dragged && (dragged.step_id ?? null) !== dragStartStepId) {
        await api.updateQuestion(id!, dragged.id, { step_id: dragged.step_id ?? null });
      }
      await api.reorderQuestions(id!, questions.map(q => q.id));
    } catch (e: any) {
      showToast(e.message, 'error');
      load();
    }
  };

  const addStep = async () => {
    try {
      const wasFirstStep = steps.length === 0;
      const { step } = await api.addStep(id!, `Step ${steps.length + 1}`);
      setSteps(s => [...s, step]);
      // Turning a flat form into a multi-step one: fold existing unassigned
      // questions into this first step instead of leaving them orphaned.
      if (wasFirstStep) {
        const unassigned = questions.filter(q => !q.step_id);
        for (const q of unassigned) {
          await api.updateQuestion(id!, q.id, { step_id: step.id });
        }
        if (unassigned.length > 0) {
          setQuestions(qs => qs.map(q => q.step_id ? q : { ...q, step_id: step.id }));
        }
      }
      showToast('Step added');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const updateStepTitleLocal = (stepId: string, title: string) => {
    setSteps(s => s.map(st => st.id === stepId ? { ...st, title } : st));
  };

  const saveStepTitle = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step) return;
    try {
      await api.updateStep(id!, stepId, step.title);
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const deleteStep = async (stepId: string) => {
    if (!confirm('Delete this step? Its questions move to the previous step, or become unassigned if this is the first step.')) return;
    try {
      await api.deleteStep(id!, stepId);
      await load();
      showToast('Step deleted');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const moveStep = async (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= steps.length) return;
    const reordered = [...steps];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    setSteps(reordered);
    try {
      await api.reorderSteps(id!, reordered.map(s => s.id));
    } catch (e: any) {
      showToast(e.message, 'error');
      load();
    }
  };

  const questionsForStep = (stepId: string | null) => questions.filter(q => (q.step_id ?? null) === stepId);

  const typeLabel = (t: string) => t === 'text' ? 'Text Input' : t === 'multiple_choice' ? 'Multiple Choice' : 'File Upload';

  const renderQuestionCard = (q: Question) => (
    <div
      key={q.id}
      className={`question-card ${draggedId === q.id ? 'is-dragging' : ''}`}
      draggable
      onDragStart={() => { setDraggedId(q.id); setDragStartStepId(q.step_id ?? null); }}
      onDragEnd={persistOrder}
      onDragOver={(e) => { e.preventDefault(); shiftQuestion(q.id); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      <div className="question-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
          <span className="drag-handle" title="Drag to reorder or move to another step" style={{ display: 'inline-flex', color: 'var(--text-muted)' }}>
            <GripVertical size={16} />
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: '0.95rem', marginBottom: '0.25rem' }}>
              {q.label || <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Untitled question</span>}
              {isRequired(q.required) && <span className="required-star"> *</span>}
            </div>
            <div className="question-card-badges">
              <span className="badge badge-type">{typeLabel(q.type)}</span>
            </div>
          </div>
        </div>
        <div className="question-card-actions">
          <button className="btn-icon-ghost" onClick={() => setEditingQuestion(q)} title="Edit">
            <Pencil size={14} />
          </button>
          <button className="btn-icon-ghost" onClick={() => deleteQuestion(q.id)} title="Delete" style={{ color: 'var(--red)' }}>
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
  );

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!form) return <div className="page-container"><div className="error-banner">Form not found</div></div>;

  return (
    <div className="page-container">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to Dashboard</Link>
      <FormTabs id={id!} />

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
            <button className="btn-icon" onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/f/${form.slug}`); showToast('URL copied to clipboard'); }} title="Copy URL"><ClipboardCopy size={16} /></button>
            <button className="btn-icon" onClick={() => window.open(`/f/${form.slug}`, '_blank')} title="Open form">
              <ExternalLink size={16} />
            </button>
          </div>
        )}
      </div>

      {/* Questions / Steps */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>
          {steps.length > 0 ? `Steps (${steps.length})` : `Questions (${questions.length})`}
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-secondary btn-sm" onClick={addStep}>
            <Layers size={14} /> Add Step
          </button>
          {steps.length === 0 && (
            <button className="btn btn-primary btn-sm" onClick={() => { setNewQuestionStepId(null); setShowNewQuestion(true); }}>
              <Plus size={16} /> Add Question
            </button>
          )}
        </div>
      </div>

      {steps.length === 0 ? (
        questions.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon"><Plus size={28} /></div>
            <h3>No questions yet</h3>
            <p>Add your first question to start building this form.</p>
            <button className="btn btn-primary" onClick={() => { setNewQuestionStepId(null); setShowNewQuestion(true); }}>
              <Plus size={18} /> Add Question
            </button>
          </div>
        ) : (
          <div className="question-list">
            {questions.map(renderQuestionCard)}
          </div>
        )
      ) : (
        steps.map((step, si) => (
          <div key={step.id} className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <input
                className="input-inline"
                style={{ fontWeight: 700, fontSize: '1rem' }}
                value={step.title}
                onChange={e => updateStepTitleLocal(step.id, e.target.value)}
                onBlur={() => saveStepTitle(step.id)}
                placeholder={`Step ${si + 1}`}
              />
              <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }}>
                <button className="btn-icon-ghost" onClick={() => moveStep(si, 'up')} disabled={si === 0} title="Move step up"><ChevronUp size={14} /></button>
                <button className="btn-icon-ghost" onClick={() => moveStep(si, 'down')} disabled={si === steps.length - 1} title="Move step down"><ChevronDown size={14} /></button>
                <button className="btn-icon-ghost" onClick={() => deleteStep(step.id)} title="Delete step" style={{ color: 'var(--red)' }}><Trash2 size={14} /></button>
              </div>
            </div>

            <div
              className="question-list"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); moveToStepEnd(step.id); }}
            >
              {questionsForStep(step.id).length === 0 ? (
                <div style={{ padding: '1.25rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
                  Drag a question here, or add one below.
                </div>
              ) : questionsForStep(step.id).map(renderQuestionCard)}
            </div>

            <button
              className="btn btn-ghost btn-sm"
              style={{ marginTop: '0.75rem' }}
              onClick={() => { setNewQuestionStepId(step.id); setShowNewQuestion(true); }}
            >
              <Plus size={14} /> Add Question
            </button>
          </div>
        ))
      )}

      {/* New question modal */}
      {showNewQuestion && (
        <QuestionEditor
          onSave={addQuestion}
          onClose={() => { setShowNewQuestion(false); setNewQuestionStepId(null); }}
          previousQuestions={questions}
        />
      )}

      {/* Edit question modal */}
      {editingQuestion && (
        <QuestionEditor
          question={editingQuestion}
          previousQuestions={questions.slice(0, questions.findIndex(q => q.id === editingQuestion.id))}
          onSave={(data) => updateQuestion(editingQuestion.id, data)}
          onClose={() => setEditingQuestion(null)}
        />
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
