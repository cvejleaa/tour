// ---------------------------------------------------------------------------
// Countdown – viser nedtælling til kickoff eller "Låst" hvis forbi.
// Opdateres hvert sekund.
// ---------------------------------------------------------------------------
import { useState, useEffect } from 'react';

/**
 * @param {{ kickoff: Date|{toDate:()=>Date}|null }} props
 */
export default function Countdown({ kickoff }) {
  const [diff, setDiff] = useState(null);

  useEffect(() => {
    if (!kickoff) return;
    const ko =
      typeof kickoff.toDate === 'function' ? kickoff.toDate() : new Date(kickoff);

    function update() {
      const remaining = ko - Date.now();
      setDiff(remaining);
    }
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [kickoff]);

  if (diff === null) return null;

  if (diff <= 0) {
    return (
      <span
        style={{
          fontSize: '0.75rem',
          color: 'var(--c-err)',
          fontWeight: 700,
        }}
      >
        Låst
      </span>
    );
  }

  const totalSecs = Math.floor(diff / 1000);
  const hours = Math.floor(totalSecs / 3600);
  const mins = Math.floor((totalSecs % 3600) / 60);
  const secs = totalSecs % 60;

  const pad = (n) => String(n).padStart(2, '0');

  // Vis dage hvis mere end 24 timer
  const days = Math.floor(hours / 24);
  const remHours = hours % 24;

  const label =
    days > 0
      ? `${days}d ${pad(remHours)}:${pad(mins)}:${pad(secs)}`
      : `${pad(hours)}:${pad(mins)}:${pad(secs)}`;

  return (
    <span
      style={{
        fontSize: '0.75rem',
        color: diff < 3600000 ? 'var(--c-warn)' : 'var(--c-muted)', // gul under 1 time
        fontWeight: 600,
      }}
      title="Tid til luk"
    >
      ⏱ {label}
    </span>
  );
}
