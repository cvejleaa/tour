// Gør et hold (flag + navn) klikbart → fører til holdets side (/hold/:code).
// Uden kode (knockout-pladsholder) rendres children uændret og uden link, så
// eksisterende UI ikke ændrer udseende.
import { Link } from 'react-router-dom';

export default function TeamLink({ code, children, style }) {
  if (!code) return <>{children}</>;
  return (
    <Link
      to={`/hold/${code}`}
      style={{ color: 'inherit', textDecoration: 'none', ...style }}
    >
      {children}
    </Link>
  );
}
