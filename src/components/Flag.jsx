// Viser et rigtigt landeflag (via flagcdn) for en holdkode.
// Falder tilbage til en klode-emoji hvis holdet er ukendt (fx pladsholder).
import { flagUrl, teamName } from '../lib/teams';

export default function Flag({ code, size = 28, rounded = true, style }) {
  const name = teamName(code);
  const url = flagUrl(code, size <= 20 ? 20 : size <= 40 ? 40 : 80);

  const common = {
    width: size,
    height: Math.round(size * 0.7),
    display: 'inline-block',
    verticalAlign: 'middle',
    borderRadius: rounded ? 4 : 0,
    boxShadow: '0 0 0 1px rgba(0,0,0,0.08)',
    objectFit: 'cover',
    ...style,
  };

  if (!url) {
    return (
      <span role="img" aria-label={name || 'ukendt hold'} title={name} style={{ fontSize: size * 0.8, ...style }}>
        🏳️
      </span>
    );
  }

  return (
    <img
      src={url}
      srcSet={`${flagUrl(code, 80)} 2x`}
      alt={name}
      title={name}
      loading="lazy"
      style={common}
    />
  );
}
