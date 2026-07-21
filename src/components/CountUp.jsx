/**
 * CountUp — animeret tal-optælling (fx rundens point-udbytte på facit-skærmen).
 * Respekterer prefers-reduced-motion (viser slutværdien med det samme).
 * Dansk komma. Genstarter når value ændrer sig.
 */
import { useEffect, useRef, useState } from 'react';

const reduce = () => typeof window !== 'undefined'
  && window.matchMedia
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function fmt(v, decimals) {
  const s = decimals > 0 ? v.toFixed(decimals) : String(Math.round(v));
  return s.replace('.', ',');
}

export default function CountUp({ value, decimals = 1, prefix = '', durationMs = 700 }) {
  const target = Number(value) || 0;
  const [shown, setShown] = useState(reduce() ? target : 0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (reduce()) { setShown(target); return undefined; }
    const from = 0;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - t) ** 3; // ease-out cubic
      setShown(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs]);

  return <span>{prefix}{fmt(shown, decimals)}</span>;
}
