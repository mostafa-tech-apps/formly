import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, FileText, Trash2, ExternalLink, Link2, BarChart3, LayoutGrid, LayoutList, AlertTriangle, Sparkles } from 'lucide-react';
import { api } from '../api/client';
import type { Form } from '../types';
import GenerateFormTray from '../components/GenerateFormTray';

function ConfirmModal({ title, message, onConfirm, onCancel }: {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [closing, setClosing] = useState(false);

  const dismiss = () => {
    setClosing(true);
    setTimeout(onCancel, 220);
  };

  return (
    <div className={`modal-overlay ${closing ? 'is-closing' : ''}`} onClick={dismiss}>
      <div className={`modal-box confirm-modal ${closing ? 'is-closing' : ''}`} onClick={e => e.stopPropagation()}>
        <div className="confirm-modal-icon"><AlertTriangle size={22} /></div>
        <h3 className="confirm-modal-title">{title}</h3>
        <p className="confirm-modal-message">{message}</p>
        <div className="confirm-modal-actions">
          <button className="btn btn-ghost" onClick={dismiss}>Cancel</button>
          <button className="btn btn-danger" onClick={onConfirm}>Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>(
    () => (localStorage.getItem('dashboard-view') as 'list' | 'grid') ?? 'list'
  );
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showGenerate, setShowGenerate] = useState(false);
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

  const onFormGenerated = (form: Form) => {
    setShowGenerate(false);
    navigate(`/forms/${form.id}/edit`);
  };

  const handleDeleteClick = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setConfirmDelete(id);
  };

  const confirmDeleteForm = async () => {
    if (!confirmDelete) return;
    try {
      await api.deleteForm(confirmDelete);
      setForms(f => f.filter(x => x.id !== confirmDelete));
      showToast('Form deleted');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setConfirmDelete(null);
    }
  };

  const copyUrl = (e: React.MouseEvent, slug: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(`${window.location.origin}/f/${slug}`);
    showToast('URL copied to clipboard');
  };

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">My Forms</h1>
          <p className="page-subtitle">{forms.length} form{forms.length !== 1 ? 's' : ''} created</p>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {forms.length > 0 && (
            <>
              <div className="view-toggle">
                <button
                  className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => { setViewMode('list'); localStorage.setItem('dashboard-view', 'list'); }}
                  title="List view"
                ><LayoutList size={16} /></button>
                <button
                  className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => { setViewMode('grid'); localStorage.setItem('dashboard-view', 'grid'); }}
                  title="Grid view"
                ><LayoutGrid size={16} /></button>
              </div>
              <button className="btn btn-secondary" onClick={() => setShowGenerate(true)}>
                <Sparkles size={16} /> Generate with AI
              </button>
              <button className="btn btn-primary" onClick={createForm}>
                <Plus size={18} /> New Form
              </button>
            </>
          )}
        </div>
      </div>

      {forms.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><FileText size={28} /></div>
          <h3>No forms yet</h3>
          <p>Create your first form to get started collecting responses.</p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button className="btn btn-primary" onClick={createForm}>
              <Plus size={18} /> Create Form
            </button>
            <button className="btn btn-secondary" onClick={() => setShowGenerate(true)}>
              <Sparkles size={16} /> Generate with AI
            </button>
          </div>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'form-grid-2col' : 'form-grid'}>
          {forms.map(form => (
            <div key={form.id} className="card form-card" onClick={() => navigate(`/forms/${form.id}/edit`)}>
              <div className="form-card-body">
                <div className="form-card-info">
                  <div className="form-card-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.4rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', minWidth: 0 }}>
                      {form.title}
                      {form.status === 'published' && form.slug && (
                        <button
                          className="btn-icon"
                          style={{ width: 22, height: 22, borderRadius: 'var(--radius-sm)', opacity: 0.6 }}
                          onClick={(e) => copyUrl(e, form.slug!)}
                          title="Copy public link"
                        >
                          <Link2 size={13} />
                        </button>
                      )}
                    </div>
                    {form.status === 'published' && form.slug && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={(e) => { e.stopPropagation(); window.open(`/f/${form.slug}`, '_blank'); }}
                      >
                        <ExternalLink size={14} /> Open
                      </button>
                    )}
                  </div>
                  {form.description && (
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '0.2rem' }}>
                      {form.description.slice(0, 100)}{form.description.length > 100 ? '…' : ''}
                    </p>
                  )}
                  <div className="form-card-meta">
                    <span>{form.question_count ?? 0} questions</span>
                    <span>{form.submission_count ?? 0} responses</span>
                    <span>{new Date(form.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="form-card-actions" onClick={(e) => e.stopPropagation()}>
                  <span className={`badge ${form.status === 'published' ? 'badge-published' : 'badge-draft'}`}>
                    {form.status}
                  </span>
                  <button className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/forms/${form.id}/submissions`); }}>
                    <BarChart3 size={14} /> Responses
                  </button>
                  <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={(e) => handleDeleteClick(e, form.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          title="Delete Form"
          message="This will permanently delete the form and all its submissions. This action cannot be undone."
          onConfirm={confirmDeleteForm}
          onCancel={() => setConfirmDelete(null)}
        />
      )}

      {showGenerate && (
        <GenerateFormTray onClose={() => setShowGenerate(false)} onCreated={onFormGenerated} />
      )}

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
