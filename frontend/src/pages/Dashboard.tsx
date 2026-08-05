import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Trash2, ExternalLink, BarChart3 } from 'lucide-react';
import { api } from '../api/client';
import type { Form } from '../types';

export default function Dashboard() {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const { forms } = await api.listForms();
      setForms(forms);
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const createForm = async () => {
    try {
      const { form } = await api.createForm();
      navigate(`/forms/${form.id}/edit`);
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };

  const deleteForm = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (!confirm('Delete this form and all its submissions?')) return;
    try {
      await api.deleteForm(id);
      setForms(f => f.filter(x => x.id !== id));
      showToast('Form deleted');
    } catch (e: any) {
      showToast(e.message, 'error');
    }
  };



  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Forms</h1>
          <p className="page-subtitle">{forms.length} form{forms.length !== 1 ? 's' : ''} created</p>
        </div>
        <button className="btn btn-primary" onClick={createForm}>
          <Plus size={18} /> New Form
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><FileText size={28} /></div>
          <h3>No forms yet</h3>
          <p>Create your first form to get started collecting responses.</p>
          <button className="btn btn-primary" onClick={createForm}>
            <Plus size={18} /> Create Form
          </button>
        </div>
      ) : (
        <div className="form-grid">
          {forms.map(form => (
            <div key={form.id} className="card form-card" onClick={() => navigate(`/forms/${form.id}/edit`)}>
              <div className="form-card-header">
                <div className="form-card-title">{form.title}</div>
                <span className={`badge ${form.status === 'published' ? 'badge-published' : 'badge-draft'}`}>
                  {form.status}
                </span>
              </div>
              {form.description && (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                  {form.description.slice(0, 80)}{form.description.length > 80 ? '…' : ''}
                </p>
              )}
              <div className="form-card-meta">
                <span>{form.question_count ?? 0} questions</span>
                <span>{form.submission_count ?? 0} responses</span>
                <span>{new Date(form.created_at).toLocaleDateString()}</span>
              </div>
              <div className="form-card-actions">
                {form.status === 'published' && form.slug && (
                  <>
                    <button className="btn btn-ghost btn-sm" onClick={(e) => copyUrl(e, form.slug!)}>
                      <ClipboardCopy size={14} /> Copy URL
                    </button>
                    <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); window.open(`/f/${form.slug}`, '_blank'); }}>
                      <ExternalLink size={14} /> Open
                    </button>
                  </>
                )}
                <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/submissions`); }}>
                  <BarChart3 size={14} /> Responses
                </button>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto', color: 'var(--red)' }} onClick={(e) => deleteForm(e, form.id)}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
