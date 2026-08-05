import { Link, useLocation } from 'react-router-dom';
import { Pencil, BarChart3 } from 'lucide-react';

export default function FormTabs({ id }: { id: string }) {
  const { pathname } = useLocation();
  const isResponses = pathname.startsWith(`/forms/${id}/submissions`);

  return (
    <div className="form-tabs">
      <Link to={`/forms/${id}/edit`} className={`form-tab ${!isResponses ? 'active' : ''}`}>
        <Pencil size={15} /> Edit
      </Link>
      <Link to={`/forms/${id}/submissions`} className={`form-tab ${isResponses ? 'active' : ''}`}>
        <BarChart3 size={15} /> Responses
      </Link>
    </div>
  );
}
