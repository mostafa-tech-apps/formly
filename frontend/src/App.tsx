import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import FormBuilder from './pages/FormBuilder';
import Submissions from './pages/Submissions';
import SubmissionDetail from './pages/SubmissionDetail';
import PublicForm from './pages/PublicForm';

function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  return (
    <>
      <header className="app-header">
        <Link to="/" className="app-logo">◆ FormCraft</Link>
        <nav className="app-nav">
          <Link to="/" className={location.pathname === '/' ? 'active' : ''}>Dashboard</Link>
        </nav>
      </header>
      {children}
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/f/:slug" element={<PublicForm />} />
      <Route path="*" element={
        <AppLayout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/forms/:id/edit" element={<FormBuilder />} />
            <Route path="/forms/:id/submissions" element={<Submissions />} />
            <Route path="/forms/:id/submissions/:submissionId" element={<SubmissionDetail />} />
          </Routes>
        </AppLayout>
      } />
    </Routes>
  );
}
