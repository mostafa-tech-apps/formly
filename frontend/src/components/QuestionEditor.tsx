import { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import type { Question } from '../types';
import { parseOptions, isRequired } from '../types';

interface Props {
  question?: Question;
  onSave: (data: any) => void;
  onClose: () => void;
}

export default function QuestionEditor({ question, onSave, onClose }: Props) {
  const [type, setType] = useState<string>(question?.type ?? 'text');
  const [label, setLabel] = useState(question?.label ?? '');
  const [required, setRequired] = useState(question ? isRequired(question.required) : false);
  const [options, setOptions] = useState<string[]>(question ? parseOptions(question.options) : ['Option 1']);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!label.trim()) return;
    setSaving(true);
    try {
      await onSave({ type, label: label.trim(), required, options: type === 'multiple_choice' ? options.filter(o => o.trim()) : [] });
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
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{question ? 'Edit Question' : 'Add Question'}</h3>
          <button className="btn-icon" onClick={onClose} style={{ border: 'none', background: 'none' }}><X size={18} /></button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Question Label</label>
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
              <label className="form-label">Options</label>
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
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={saving || !label.trim()}>
            {saving ? 'Saving...' : (question ? 'Update' : 'Add Question')}
          </button>
        </div>
      </div>
    </div>
  );
}
