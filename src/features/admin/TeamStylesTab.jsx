/**
 * TeamStylesTab — admin: justér hvert Superliga-holds badge-farver (hjemme + ude).
 * Gemmer overrides på spil-dokumentet (games/superliga2627.teamStyles); i en kamp
 * vises hjemmeholdet i sin hjemmefarve og udeholdet i sin udefarve.
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
const eq = (a, b) => String(a).toUpperCase() === String(b).toUpperCase();

export default function TeamStylesTab() {
  const defaults = useMemo(() => {
    const m = {};
    for (const t of SUPERLIGA_TEAMS_2026) m[t.name] = { color: t.color, awayColor: t.awayColor };
    return m;
  }, []);

  const [styles, setStyles] = useState(defaults); // holdnavn → { color, awayColor }
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    getDoc(doc(db, COL.GAMES, GAME_ID)).then((snap) => {
      if (!alive) return;
      const ov = (snap.exists() && snap.data().teamStyles) || {};
      const merged = {};
      for (const t of SUPERLIGA_TEAMS_2026) {
        const o = ov[t.name] || {};
        merged[t.name] = {
          color: isHex6(o.color) ? o.color : t.color,
          awayColor: isHex6(o.awayColor) ? o.awayColor : t.awayColor,
        };
      }
      setStyles(merged);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, []);

  function setField(name, key, value) {
    setStyles((s) => ({ ...s, [name]: { ...s[name], [key]: value } }));
    setMsg(''); setErr('');
  }

  async function handleSave() {
    setBusy(true); setMsg(''); setErr('');
    const out = {};
    for (const t of SUPERLIGA_TEAMS_2026) {
      const s = styles[t.name] || {};
      const o = {};
      if (isHex6(s.color) && !eq(s.color, t.color)) o.color = s.color;
      if (isHex6(s.awayColor) && !eq(s.awayColor, t.awayColor)) o.awayColor = s.awayColor;
      if (Object.keys(o).length) out[t.name] = o;
    }
    const res = await setTeamStyles(GAME_ID, out);
    if (res.ok) setMsg('Hold-farverne er gemt. De slår igennem i tip-fladen med det samme.');
    else setErr(res.error);
    setBusy(false);
  }

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;

  const Picker = ({ name, field, label }) => {
    const val = styles[name]?.[field] || '#888888';
    const def = defaults[name][field];
    const changed = !eq(val, def);
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--c-muted)', width: 42 }}>{label}</span>
        <ClubBadge code={SUPERLIGA_TEAMS_2026.find((t) => t.name === name).short}
          color={isHex6(val) ? val : '#888888'} size={26} title={`${name} ${label}`} />
        <input type="color" value={isHex6(val) ? val : '#888888'}
          onChange={(e) => setField(name, field, e.target.value)} aria-label={`${label}farve for ${name}`}
          style={{ width: 34, height: 28, padding: 0, border: '1px solid var(--c-border)', borderRadius: 6, cursor: 'pointer' }} />
        <input type="text" value={val} maxLength={7}
          onChange={(e) => setField(name, field, e.target.value)}
          style={{ width: 78, fontFamily: 'monospace', textTransform: 'uppercase' }} />
        {changed && (
          <button className="btn btn--ghost btn--sm" title="Nulstil"
            onClick={() => setField(name, field, def)}>↺</button>
        )}
      </span>
    );
  };

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>🎨 Superliga — hold-farver</h3>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        Sæt hver klubs <strong>hjemme-</strong> og <strong>udefarve</strong>. I en kamp vises
        hjemmeholdet i hjemmefarve og udeholdet i udefarve. Ændringer gemmes på spillet og
        slår igennem for alle med det samme.
      </p>

      {msg && <p className="badge badge--green mb-2" style={{ display: 'block' }}>{msg}</p>}
      {err && <p className="badge badge--red mb-2">{err}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {SUPERLIGA_TEAMS_2026.map((t) => (
          <div key={t.name} style={{ borderTop: '1px solid var(--c-border)', paddingTop: '0.5rem' }}>
            <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>{t.name}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem' }}>
              <Picker name={t.name} field="color" label="Hjemme" />
              <Picker name={t.name} field="awayColor" label="Ude" />
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '1rem' }}>
        <button className="btn" disabled={busy} onClick={handleSave}>
          {busy ? 'Gemmer…' : 'Gem farver'}
        </button>
      </div>
    </div>
  );
}
