import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Download } from 'lucide-react';
import { api } from '../api/client';
import type { Answer } from '../types';

export default function SubmissionDetail() {
  const { id, submissionId } = useParams<{ id: string; submissionId: string }>();
  const [submission, setSubmission] = useState<any>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getSubmission(id!, submissionId!).then(data => {
      setSubmission(data.submission);
      setAnswers(data.answers);
    }).finally(() => setLoading(false));
  }, [id, submissionId]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!submission) return <div className="page-container"><div className="error-banner">Submission not found</div></div>;

  return (
    <div className="page-container">
      <Link to={`/forms/${id}/submissions`} className="back-link"><ArrowLeft size={16} /> Back to Submissions</Link>
      <div className="page-header">
        <div>
          <h1 className="page-title">Submission Details</h1>
          <p className="page-subtitle">Submitted {new Date(submission.submitted_at).toLocaleString()}</p>
        </div>
      </div>
      <div className="answer-list">
        {answers.map(a => (
          <div key={a.id} className="answer-card">
            <div className="answer-label">{a.question_label}</div>
            {a.question_type === 'file_upload' ? (
              <div className="answer-file">
                {a.file_path ? (
                  <a href={`/uploads/${a.file_path}`} target="_blank" rel="noopener noreferrer">
                    <Download size={16} /> {a.file_name || 'Download file'}
                  </a>
                ) : <span style={{ color: 'var(--text-muted)' }}>No file uploaded</span>}
              </div>
            ) : (
              <div className="answer-value">{a.value || <span style={{ color: 'var(--text-muted)' }}>—</span>}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
