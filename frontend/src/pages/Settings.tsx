import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Copy, Check, KeyRound, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../context/AuthContext';

export default function Settings() {
  const { user, refreshUser } = useAuth();
  const [newToken, setNewToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const showToast = (msg: string, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const generateToken = async () => {
    setLoading(true);
    try {
      const { token } = await api.generateApiToken();
      setNewToken(token);
      setCopied(false);
      await refreshUser();
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const revokeToken = async () => {
    setLoading(true);
    try {
      await api.revokeApiToken();
      setNewToken(null);
      setConfirmRevoke(false);
      await refreshUser();
      showToast('Token revoked');
    } catch (e: any) {
      showToast(e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const copyToken = () => {
    if (!newToken) return;
    navigator.clipboard.writeText(newToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="page-container">
      <Link to="/" className="back-link"><ArrowLeft size={16} /> Back to Dashboard</Link>

      <div className="page-header">
        <div>
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">{user?.email}</p>
        </div>
      </div>

      <div className="card" style={{ maxWidth: 560 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.5rem' }}>
          <KeyRound size={18} />
          <h2 style={{ fontSize: '1.05rem', fontWeight: 700 }}>MCP API Token</h2>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
          Use this token to connect an MCP client (like Claude Code) to your forms at <code>/mcp</code>.
          It has full read/write access to every form on your account.
        </p>

        {newToken ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
              <AlertTriangle size={14} style={{ color: 'var(--amber)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.8rem', color: 'var(--amber)' }}>Copy this now — you won't be able to see it again.</span>
            </div>
            <div className="copy-url-wrap" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <code style={{ flex: 1, wordBreak: 'break-all' }}>{newToken}</code>
              <button className="btn-icon" onClick={copyToken} title="Copy token">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>
        ) : user?.hasApiToken ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span className="badge badge-published">Token active</span>
            <button className="btn btn-secondary btn-sm" onClick={generateToken} disabled={loading}>Regenerate</button>
            {confirmRevoke ? (
              <span style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Revoke access for this token?</span>
                <button className="btn btn-danger btn-sm" onClick={revokeToken} disabled={loading}>Confirm</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmRevoke(false)}>Cancel</button>
              </span>
            ) : (
              <button className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => setConfirmRevoke(true)}>Revoke</button>
            )}
          </div>
        ) : (
          <button className="btn btn-primary" onClick={generateToken} disabled={loading}>
            {loading ? 'Generating...' : 'Generate Token'}
          </button>
        )}
      </div>

      {toast && <div className={`toast toast-${toast.type}`}>{toast.msg}</div>}
    </div>
  );
}
