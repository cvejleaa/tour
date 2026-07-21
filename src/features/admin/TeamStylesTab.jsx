/**
 * TeamStylesTab — admin: justér hvert Superliga-holds badge-farve.
 * Gemmer overrides på spil-dokumentet (games/superliga2627.teamStyles); badges
 * i tip-fladen læser din farve og falder tilbage til standardfarven.
 */
import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { SUPERLIGA_TEAMS_2026 } from '../../data/superligaTeams2026';
import { setTeamStyles } from '../games/gameActions';
import ClubBadge from '../../components/ClubBadge';

const GAME_ID = 'superliga2627';
const isHex6 = (s) => /^#[0-9a-fA-F]{6}$/.test(s);

export default function TeamStylesTab() {
  const defaults = useMemo(() => {
    const m = {};
    for (const t of SUPERLIGA_TEAMS_2026) m[t.name] = t.color;
    return m;
  }, []);

  const [colors, setColors] = useState(defaults);   // holdnavn → hex (nuværende valg)
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, COL.GAMES, GAME_ID)).then((snap) => {
      if (!alive) return;
      const overrides = (snap.exists() && snap.data().teamStyles) || {};
      setColors({
        ...defaults,
        ...Object.fromEntries(
          Object.entries(overrides)
            .filter(([, v]) => v && isHex6(v.color))
            .map(([name, v]) => [name, v.color]),
        ),
      });
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, [defaults]);

  function setColor(name, value) {
    setColors((c) => ({ ...c, [name]: value }));
    setMsg(''); setErr('');
  }

  async function handleSave() {
    setBusy(true); setMsg(''); setErr('');
    // Gem KUN de hold hvor farven afviger fra standard (som override).
    const styles = {};
    for (const t of SUPERLIGA_TEAMS_2026) {
      const chosen = colors[t.name];
      if (isHex6(chosen) && chosen.toUpperCase() !== String(t.color).toUpperCase()) {
        styles[t.name] = { color: chosen };
      }
    }
    const res = await setTeamStyles(GAME_ID, styles);
    if (res.ok) setMsg('Hold-farverne er gemt. De slår igennem i tip-fladen med det samme.');
    else setErr(res.error);
    setBusy(false);
  }

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>🎨 Superliga — hold-farver</h3>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        Justér hvert holds badge-farve. Tomme/ugyldige felter beholder standardfarven.
        Ændringer gemmes på spillet og slår igennem for alle med det samme.
      </p>

      {msg && <p className="badge badge--green mb-2" style={{ display: 'block' }}>{msg}</p>}
      {err && <p className="badge badge--red mb-2">{err}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: 460 }}>
        {SUPERLIGA_TEAMS_2026.map((t) => {
          const val = colors[t.name] || t.color;
          const changed = String(val).toUpperCase() !== String(t.color).toUpperCase();
          return (
            <div key={t.name} className="flex items-center" style={{ gap: '0.6rem', justifyContent: 'space-between' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <ClubBadge code={t.short} color={isHex6(val) ? val : '#888888'} size={30} title={t.name} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flex: '0 0 auto' }}>
                <input
                  type="color"
                  value={isHex6(val) ? val : '#888888'}
                  onChange={(e) => setColor(t.name, e.target.value)}
                  aria-label={`Farve for ${t.name}`}
                  style={{ width: 40, height: 30, padding: 0, border: '1px solid var(--c-border)', borderRadius: 6, cursor: 'pointer' }}
                />
                <input
                  type="text"
                  value={val}
                  maxLength={7}
                  onChange={(e) => setColor(t.name, e.target.value)}
                  style={{ width: 84, fontFamily: 'monospace', textTransform: 'uppercase' }}
                />
                {changed && (
                  <button className="btn btn--ghost btn--sm" title="Nulstil til standard"
                    onClick={() => setColor(t.name, t.color)}>↺</button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <button className="btn" disabled={busy} onClick={handleSave}>
          {busy ? 'Gemmer…' : 'Gem farver'}
        </button>
      </div>
    </div>
  );
}
