import { Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { LayoutTemplate, Settings as SettingsIcon, LogOut } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import Dashboard from './pages/Dashboard';
import FormBuilder from './pages/FormBuilder';
import Submissions from './pages/Submissions';
import SubmissionDetail from './pages/SubmissionDetail';
import PublicForm from './pages/PublicForm';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Settings from './pages/Settings';

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RedirectIfAuthed({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="loading"><div className="spinner" /></div>;
  if (user) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-logo"><LayoutTemplate size={20} strokeWidth={2} /> FormCraft</Link>
        <nav className="app-nav" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Dashboard</Link>
          {user && (
            <>
              <Link to="/settings" className={location.pathname === '/settings' ? 'active' : ''} title="Settings">
                <SettingsIcon size={16} />
              </Link>
              <button className="btn-icon" onClick={handleLogout} title="Log out" style={{ width: 32, height: 32 }}>
                <LogOut size={14} />
              </button>
            </>
          )}
        </nav>
      </header>
      {children}
    </>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/f/:slug" element={<PublicForm />} />
        <Route path="/login" element={<RedirectIfAuthed><Login /></RedirectIfAuthed>} />
        <Route path="/signup" element={<RedirectIfAuthed><Signup /></RedirectIfAuthed>} />
        <Route path="*" element={
          <AppLayout>
            <RequireAuth>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="/forms/:id/edit" element={<FormBuilder />} />
                <Route path="/forms/:id/submissions" element={<Submissions />} />
                <Route path="/forms/:id/submissions/:submissionId" element={<SubmissionDetail />} />
              </Routes>
            </RequireAuth>
          </AppLayout>
        } />
      </Routes>
    </AuthProvider>
  );
}
