// "🔴 Live fra etapen" — dansk live-ticker fra letour racecenter på etapedage.
// Skjuler sig selv helt hvis feedet fejler eller er tomt (spillet er upåvirket).
import { useLiveTicker } from './useLiveTicker';
import { pictoEmoji, formatPostTime } from './liveTickerUtils';

const MAX_VISIBLE = 8;

export default function LiveTicker({ stage, enabled = true }) {
  const stageNumber = stage?.number ?? null;
  const { posts, updatedAt, failed } = useLiveTicker(stageNumber, enabled && !!stageNumber);

  if (!enabled || !stageNumber || failed || posts.length === 0) return null;

  const visible = posts.slice(0, MAX_VISIBLE);

  return (
    <div className="card" data-testid="live-ticker" style={{ marginBottom: '1rem' }}>
      <div className="flex items-center justify-between" style={{ marginBottom: '0.6rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h2 className="card__title" style={{ margin: 0 }}>
          <span aria-hidden style={{ animation: 'pulse 2s infinite' }}>🔴</span> Live fra etape {stageNumber}
        </h2>
        {updatedAt && (
          <span className="text-muted" style={{ fontSize: '0.75rem' }}>
            Opdateret {formatPostTime(updatedAt)} · letour.fr
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gap: 0 }}>
        {visible.map((p, i) => (
          <div
            key={p.id ?? `${p.publicationAt}-${i}`}
            style={{
              display: 'flex', gap: '0.6rem', alignItems: 'flex-start',
              padding: '0.5rem 0.4rem',
              borderTop: i === 0 ? 'none' : '1px solid var(--c-border)',
              background: p.highlight ? 'var(--c-surface-alt)' : 'transparent',
              borderRadius: p.highlight ? 8 : 0,
            }}
          >
            <span aria-hidden style={{ fontSize: '1.1rem', lineHeight: 1.3 }}>{pictoEmoji(p.picto)}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '0.9rem', fontWeight: 700, lineHeight: 1.35 }}>
                <span className="text-muted" style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums', marginRight: '0.45rem', fontSize: '0.78rem' }}>
                  {formatPostTime(p.publicationAt)}
                </span>
                {p.title}
                {p.pinned && <span className="badge badge--yellow" style={{ marginLeft: '0.4rem' }}>📌</span>}
              </div>
              {p.text && (
                <div className="text-muted" style={{ fontSize: '0.84rem', lineHeight: 1.45, whiteSpace: 'pre-line' }}>
                  {p.text}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
