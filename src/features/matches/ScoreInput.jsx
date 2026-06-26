// ---------------------------------------------------------------------------
// ScoreInput – kompakt komponent til at indtaste kampresultat (hjem/ude).
// Validerer ikke-negative heltal. Kalder onSave({ home, away }) ved gem.
// ---------------------------------------------------------------------------
import { useState, useEffect } from 'react';

/**
 * @param {{ home: number|'', away: number|'', onSave: (val:{home,away})=>void, disabled: boolean }} props
 */
export default function ScoreInput({ home: initHome = '', away: initAway = '', onSave, disabled = false }) {
  const [home, setHome] = useState(String(initHome === '' ? '' : initHome));
  const [away, setAway] = useState(String(initAway === '' ? '' : initAway));

  // Synkronisér eksternt ændrede initialværdier (fx når bets loades asynkront)
  useEffect(() => {
    setHome(initHome === '' || initHome == null ? '' : String(initHome));
  }, [initHome]);
  useEffect(() => {
    setAway(initAway === '' || initAway == null ? '' : String(initAway));
  }, [initAway]);

  /** Returnerer true hvis værdien er et ikke-negativt heltal. */
  function isValid(v) {
    return /^\d+$/.test(v) && Number(v) >= 0;
  }

  function handleChange(setter) {
    return (e) => {
      const val = e.target.value;
      // Tillad kun cifre
      if (val === '' || /^\d+$/.test(val)) setter(val);
    };
  }

  function handleSave() {
    if (!isValid(home) || !isValid(away)) return;
    onSave({ home: Number(home), away: Number(away) });
  }

  const canSave = isValid(home) && isValid(away) && !disabled;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <input
        type="number"
        min={0}
        step={1}
        value={home}
        onChange={handleChange(setHome)}
        disabled={disabled}
        aria-label="Hjemmemål"
        data-testid="score-home"
        style={{
          width: 52,
          textAlign: 'center',
          fontSize: '1.1rem',
          fontWeight: 700,
          border: '2px solid var(--c-border)',
          borderRadius: 8,
          padding: '0.3rem',
          background: disabled ? 'var(--c-bg)' : 'var(--c-surface)',
          color: 'var(--c-text)',
        }}
      />
      <span style={{ fontWeight: 700, color: 'var(--c-muted)' }}>–</span>
      <input
        type="number"
        min={0}
        step={1}
        value={away}
        onChange={handleChange(setAway)}
        disabled={disabled}
        aria-label="Udemål"
        data-testid="score-away"
        style={{
          width: 52,
          textAlign: 'center',
          fontSize: '1.1rem',
          fontWeight: 700,
          border: '2px solid var(--c-border)',
          borderRadius: 8,
          padding: '0.3rem',
          background: disabled ? 'var(--c-bg)' : 'var(--c-surface)',
          color: 'var(--c-text)',
        }}
      />
      {!disabled && (
        <button
          className="btn"
          onClick={handleSave}
          disabled={!canSave}
          aria-label="Gem tip"
          data-testid="score-save"
          style={{ padding: '0.3rem 0.75rem', fontSize: '0.85rem' }}
        >
          Gem
        </button>
      )}
    </div>
  );
}
