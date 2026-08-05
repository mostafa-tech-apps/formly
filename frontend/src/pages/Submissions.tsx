import { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Eye, Inbox } from 'lucide-react';
import { api } from '../api/client';
import type { Submission } from '../types';

export default function Submissions() {
  const { id } = useParams<{ id: string }>();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [formTitle, setFormTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    Promise.all([api.getForm(id!), api.listSubmissions(id!)]).then(([formData, subData]) => {
      setFormTitle(formData.form.title);
      setSubmissions(subData.submissions);
    }).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div className="page-container">
      <Link to={`/forms/${id}/edit`} className="back-link"><ArrowLeft size={16} /> Back to Form</Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">Submissions</h1>
          <p className="page-subtitle">{formTitle} — {submissions.length} response{submissions.length !== 1 ? 's' : ''}</p>
        </div>
      </div>
      {submissions.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><Inbox size={28} /></div>
          <h3>No submissions yet</h3>
          <p>Share your form to start collecting responses.</p>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="sub-table">
            <thead>
              <tr><th>#</th><th>Date</th><th>Preview</th><th></th></tr>
            </thead>
            <tbody>
              {submissions.map((sub, i) => (
                <tr key={sub.id} onClick={() => navigate(`/forms/${id}/submissions/${sub.id}`)}>
                  <td style={{ fontWeight: 600, color: 'var(--accent)' }}>{submissions.length - i}</td>
                  <td>{new Date(sub.submitted_at).toLocaleString()}</td>
                  <td>
                    <div className="sub-preview">
                      {sub.preview?.map((p, pi) => (
                        <span key={pi}>{p.label}: {p.type === 'file_upload' ? (p.file_name || '—') : (p.value || '—')}{pi < sub.preview!.length - 1 ? ' · ' : ''}</span>
                      )) || '—'}
                    </div>
                  </td>
                  <td><button className="btn btn-ghost btn-sm"><Eye size={14} /> View</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
