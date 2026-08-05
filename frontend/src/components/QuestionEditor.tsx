import { useState } from 'react';
import { X, Plus, Trash2, Sparkles } from 'lucide-react';
import type { Question, VisibilityLogic } from '../types';
import { parseOptions, isRequired, parseVisibilityRules } from '../types';
import { api } from '../api/client';
import LogicBuilder from './LogicBuilder';

interface Props {
  question?: Question;
  previousQuestions: Question[];
  onSave: (data: any) => void;
  onClose: () => void;
}

export default function QuestionEditor({ question, previousQuestions, onSave, onClose }: Props) {
  const [type, setType] = useState<string>(question?.type ?? 'text');
  const [label, setLabel] = useState(question?.label ?? '');
  const [required, setRequired] = useState(question ? isRequired(question.required) : false);
  const [options, setOptions] = useState<string[]>(question ? parseOptions(question.options) : ['Option 1']);
  const [visibilityRules, setVisibilityRules] = useState<VisibilityLogic>(question ? parseVisibilityRules(question.visibility_rules) : null);
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [aiError, setAiError] = useState('');

  const [activeTab, setActiveTab] = useState<'basic' | 'logic'>('basic');

  const improveWording = async () => {
    if (!label.trim()) return;
    setAiError('');
    setImproving(true);
    try {
      const { label: improved } = await api.improveQuestion(label.trim());
      setLabel(improved);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setImproving(false);
    }
  };

  const suggestOptions = async () => {
    if (!label.trim()) return;
    setAiError('');
    setSuggesting(true);
    try {
      const { options: suggested } = await api.suggestOptions(label.trim());
      if (suggested.length > 0) setOptions(suggested);
    } catch (e: any) {
      setAiError(e.message);
    } finally {
      setSuggesting(false);
    }
  };

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await onSave({ 
        type, 
        label: label.trim(), 
        required, 
        options: type === 'multiple_choice' ? options.filter(o => o.trim()) : [],
        visibility_rules: visibilityRules
      });
    } finally {
      setSaving(false);
    }
  };

  const addOption = () => setOptions([...options, `Option ${options.length + 1}`]);
  const removeOption = (i: number) => setOptions(options.filter((_, idx) => idx !== i));
  const updateOption = (i: number, val: string) => {
    const updated = [...options];
    updated[i] = val;
    setOptions(updated);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-lg" onClick={e => e.stopPropagation()} style={{ maxWidth: '650px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{question ? 'Edit Question' : 'Add Question'}</h3>
          <button className="btn-icon" onClick={onClose} style={{ border: 'none', background: 'none' }}><X size={18} /></button>
        </div>
        
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 1.5rem', gap: '1rem' }}>
          <button 
            className={`tab-btn ${activeTab === 'basic' ? 'active' : ''}`}
            onClick={() => setActiveTab('basic')}
            style={{ padding: '0.75rem 0.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'basic' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'basic' ? 'var(--text-main)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}
          >
            Basic Settings
          </button>
          <button 
            className={`tab-btn ${activeTab === 'logic' ? 'active' : ''}`}
            onClick={() => setActiveTab('logic')}
            style={{ padding: '0.75rem 0.5rem', background: 'none', border: 'none', borderBottom: activeTab === 'logic' ? '2px solid var(--primary)' : '2px solid transparent', color: activeTab === 'logic' ? 'var(--text-main)' : 'var(--text-secondary)', fontWeight: 600, cursor: 'pointer' }}
          >
            Conditional Logic
          </button>
        </div>

        <div className="modal-body" style={{ minHeight: '300px' }}>
          {activeTab === 'basic' ? (
            <>
              <div className="form-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <label className="form-label">Question Label</label>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={improveWording}
                    disabled={!label.trim() || improving}
                    title="Rewrite this question for clarity using AI"
                  >
                    <Sparkles size={13} /> {improving ? 'Improving...' : 'Improve wording'}
                  </button>
                </div>
                <input className="input" value={label} onChange={e => setLabel(e.target.value)} placeholder="Enter your question..." autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Type</label>
                <select className="select" value={type} onChange={e => setType(e.target.value)}>
                  <option value="text">Text Input</option>
                  <option value="multiple_choice">Multiple Choice</option>
                  <option value="file_upload">File Upload</option>
                </select>
              </div>
              {type === 'multiple_choice' && (
                <div className="form-group">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="form-label">Options</label>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={suggestOptions}
                      disabled={!label.trim() || suggesting}
                      title="Suggest options for this question using AI"
                    >
                      <Sparkles size={13} /> {suggesting ? 'Suggesting...' : 'Suggest options'}
                    </button>
                  </div>
                  <div className="option-list">
                    {options.map((opt, i) => (
                      <div key={i} className="option-item">
                        <div className="option-bullet" />
                        <input className="input" value={opt} onChange={e => updateOption(i, e.target.value)} placeholder={`Option ${i + 1}`} />
                        {options.length > 1 && (
                          <button className="btn-icon" onClick={() => removeOption(i)} style={{ width: 32, height: 32, flexShrink: 0 }}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={addOption} style={{ marginTop: '0.5rem' }}>
                    <Plus size={14} /> Add Option
                  </button>
                </div>
              )}
              <div className="form-group">
                <div className="toggle-wrap">
                  <div className={`toggle ${required ? 'active' : ''}`} onClick={() => setRequired(!required)} />
                  <span className="toggle-label">Required</span>
                </div>
              </div>
            </>
          ) : (
            <LogicBuilder 
              logic={visibilityRules} 
              onChange={setVisibilityRules} 
              previousQuestions={previousQuestions} 
            />
          )}
        </div>
        <div className="modal-footer">
          {aiError && <span style={{ color: 'var(--red)', fontSize: '0.8rem', marginRight: 'auto' }}>{aiError}</span>}
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !label.trim()}>
            {saving ? 'Saving...' : (question ? 'Update' : 'Add Question')}
          </button>
        </div>
      </div>
    </div>
  );
}
