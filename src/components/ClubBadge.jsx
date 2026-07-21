/**
 * ClubBadge — selvstændig hold-badge: en farvet cirkel i klubbens brandfarve
 * med holdets kortkode i auto-kontrast-farve. Ingen eksterne logoer.
 * Kanoniske størrelser: 22 (tabel), 32 (liste), 44 (kamp-kort).
 */
import { textOn } from '../lib/contrastText';

export default function ClubBadge({ code = '?', color = '#888888', size = 32, title }) {
  const fg = textOn(color);
  const fontSize = Math.max(10, Math.round(size * 0.40));
  return (
    <span
      role="img"
      aria-label={title || code}
      title={title || code}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        color: fg,
        fontWeight: 800,
        fontSize,
        lineHeight: 1,
        letterSpacing: '-0.02em',
        fontVariantNumeric: 'tabular-nums',
        flex: '0 0 auto',
        boxShadow: fg === '#ffffff'
          ? 'inset 0 0 0 1.5px rgba(255,255,255,.22)'
          : 'inset 0 0 0 1.5px rgba(0,0,0,.10), 0 0 0 1px var(--c-border)',
      }}
    >
      {code}
    </span>
  );
}
