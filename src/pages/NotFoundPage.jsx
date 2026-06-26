import { Link } from 'react-router-dom';
export default function NotFoundPage() {
  return (
    <div className="card">
      <h1>404 – Siden findes ikke</h1>
      <Link to="/">Til forsiden</Link>
    </div>
  );
}
