import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      navigate('/');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={handleSubmit}>
        <h1 className="page-title" style={{ marginBottom: '1.5rem' }}>Log in</h1>
        {error && <div className="error-banner">{error}</div>}
        <div className="form-group">
          <label className="form-label">Email</label>
          <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} required />
        </div>
        <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}>
          {loading ? 'Logging in...' : 'Log in'}
        </button>
        <p className="auth-switch">No account? <Link to="/signup">Sign up</Link></p>
      </form>
    </div>
  );
}
