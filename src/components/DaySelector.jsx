// Dag-for-dag-navigation: ◀ [dag] ▶. `days` er en ordnet liste af dagsnøgler
// (fx fra tournamentDays); `value` er den valgte. Pile deaktiveres ved kanterne.
export default function DaySelector({ days, value, onChange, testId = 'day-selector' }) {
  if (!Array.isArray(days) || days.length === 0) return null;
  const idx = days.indexOf(value);
  const go = (delta) => {
    const ni = idx + delta;
    if (ni >= 0 && ni < days.length) onChange(days[ni]);
  };

  return (
    <div
      data-testid={testId}
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.85rem' }}
    >
      <button
        className="btn btn--ghost btn--sm"
        onClick={() => go(-1)}
        disabled={idx <= 0}
        aria-label="Forrige dag"
        data-testid="day-prev"
      >
        ◀
      </button>
      <span style={{ fontWeight: 700, textTransform: 'capitalize', textAlign: 'center', flex: 1 }}>
        {value || '—'}
      </span>
      <button
        className="btn btn--ghost btn--sm"
        onClick={() => go(1)}
        disabled={idx < 0 || idx >= days.length - 1}
        aria-label="Næste dag"
        data-testid="day-next"
      >
        ▶
      </button>
    </div>
  );
}
