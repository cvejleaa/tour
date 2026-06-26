// Lille statuslinje for resultat-automatikken (config/syncStatus).
// Grøn når synken kører, gul når den er forsinket, rød ved fejl — så en
// lydløst død automatik (token udløbet, API-fejl) bliver synlig med det samme.
import { useSyncStatus } from './useSyncStatus';

function minutesSince(ts) {
  if (!ts) return null;
  const date = ts.toDate ? ts.toDate() : new Date(ts);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
}

function agoLabel(min) {
  if (min == null) return 'ukendt';
  if (min < 1) return 'lige nu';
  if (min === 1) return '1 min siden';
  if (min < 60) return `${min} min siden`;
  const h = Math.floor(min / 60);
  return h === 1 ? '1 time siden' : `${h} timer siden`;
}

// Forsinket hvis seneste vellykkede synk er ældre end dette (synken kører hvert minut).
const STALE_MIN = 5;

export default function SyncHealthBanner() {
  const { status, loading } = useSyncStatus();
  if (loading) return null;

  let tone = 'ok';
  let text;

  if (!status || (!status.lastSuccessAt && !status.lastError)) {
    tone = 'muted';
    text = 'Auto-synk: endnu ingen kørsel registreret (starter når funktionen er deployet).';
  } else if (status.lastError) {
    tone = 'err';
    const okMin = minutesSince(status.lastSuccessAt);
    text = `⚠️ Auto-synk fejler: ${status.lastError}`
      + (okMin != null ? ` · sidst OK ${agoLabel(okMin)}` : '');
  } else {
    const min = minutesSince(status.lastSuccessAt);
    if (min != null && min > STALE_MIN) {
      tone = 'warn';
      text = `⚠️ Ingen synk i ${agoLabel(min)} — automatikken kan være stoppet.`;
    } else {
      tone = 'ok';
      text = `✅ Auto-synk kører · sidste synk ${agoLabel(min)}`;
    }
  }

  const colors = {
    ok:    { bg: '#f0fdf4', fg: 'var(--c-ok)',  bd: 'var(--c-ok)' },
    warn:  { bg: '#fffbeb', fg: '#b45309',      bd: '#f59e0b' },
    err:   { bg: '#fef2f2', fg: 'var(--c-err)', bd: 'var(--c-err)' },
    muted: { bg: 'var(--c-surface-2, #f3f4f6)', fg: 'var(--c-muted)', bd: 'var(--c-border)' },
  }[tone];

  return (
    <div
      role="status"
      style={{
        marginBottom: '1rem', padding: '0.45rem 0.8rem', borderRadius: 8,
        fontSize: '0.85rem', background: colors.bg, color: colors.fg,
        border: `1px solid ${colors.bd}`,
      }}
    >
      {text}
    </div>
  );
}
