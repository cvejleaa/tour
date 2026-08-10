/**
 * TeamStylesTab — admin: justér et spils hold-badge-farver (hjemme + ude + 3.).
 * Funktionen kan gælde flere spil, så man VÆLGER FØRST spillet i toppen. Kun
 * spil med en hold-liste (fodbold-spil) kan have hold-farver. Overrides gemmes
 * på det valgte spil-dokument (games/{gameId}.teamStyles).
 */
import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { useGames } from '../games/useGames';
import { setTeamStyles } from '../games/gameActions';
import ClubBadge from '../../components/ClubBadge';
import { standardVisningsnavn } from '../games/football/visningsnavn';

const isHex6 = (s) => /^#[0-9a-fA-F]{6}$/.test(s);
const eq = (a, b) => String(a).toUpperCase() === String(b).toUpperCase();

export default function TeamStylesTab() {
  const { games, loading: gamesLoading } = useGames();
  // Kun spil med en hold-liste (fodbold-spil) har hold-farver.
  const styleable = useMemo(
    () => (games || []).filter((g) => Array.isArray(g.teams) && g.teams.length),
    [games],
  );

  const [gameId, setGameId] = useState('');
  useEffect(() => {
    if (styleable.length && !styleable.some((g) => g.id === gameId)) setGameId(styleable[0].id);
  }, [styleable, gameId]);

  const game = styleable.find((g) => g.id === gameId) || null;
  const teams = useMemo(() => game?.teams || [], [game]);

  const defaults = useMemo(() => {
    const m = {};
    for (const t of teams) m[t.name] = { color: t.color, awayColor: t.awayColor, thirdColor: t.thirdColor, visningsnavn: standardVisningsnavn(t.name) };
    return m;
  }, [teams]);

  const [styles, setStyles] = useState({}); // holdnavn → { color, awayColor, thirdColor }
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Indlæs det VALGTE spils gemte overrides (flettet med holdenes standardfarver).
  useEffect(() => {
    if (!gameId || !teams.length) { setStyles({}); return undefined; }
    let alive = true;
    setLoading(true); setMsg(''); setErr('');
    getDoc(doc(db, COL.GAMES, gameId)).then((snap) => {
      if (!alive) return;
      const ov = (snap.exists() && snap.data().teamStyles) || {};
      const merged = {};
      for (const t of teams) {
        const o = ov[t.name] || {};
        merged[t.name] = {
          visningsnavn: (typeof o.visningsnavn === 'string' && o.visningsnavn.trim())
            ? o.visningsnavn.trim() : standardVisningsnavn(t.name),
          color: isHex6(o.color) ? o.color : t.color,
          awayColor: isHex6(o.awayColor) ? o.awayColor : t.awayColor,
          thirdColor: isHex6(o.thirdColor) ? o.thirdColor : t.thirdColor,
        };
      }
      setStyles(merged);
      setLoading(false);
    }).catch(() => setLoading(false));
    return () => { alive = false; };
  }, [gameId, teams]);

  function setField(name, key, value) {
    setStyles((s) => ({ ...s, [name]: { ...s[name], [key]: value } }));
    setMsg(''); setErr('');
  }

  async function handleSave() {
    setBusy(true); setMsg(''); setErr('');
    const out = {};
    for (const t of teams) {
      const s = styles[t.name] || {};
      const o = {};
      if (isHex6(s.color) && !eq(s.color, t.color)) o.color = s.color;
      if (isHex6(s.awayColor) && !eq(s.awayColor, t.awayColor)) o.awayColor = s.awayColor;
      if (isHex6(s.thirdColor) && !eq(s.thirdColor, t.thirdColor)) o.thirdColor = s.thirdColor;
      // Visningsnavnet gemmes KUN, hvis det afviger fra husets forslag — så
      // en fremtidig ændring af forslaget slår igennem for alle spil, der ikke
      // har taget stilling. Et tomt felt betyder "brug forslaget", ikke "intet
      // navn"; ellers kunne et hold komme til at hedde ingenting.
      const vn = String(s.visningsnavn || '').trim();
      if (vn && vn !== standardVisningsnavn(t.name)) o.visningsnavn = vn;
      if (Object.keys(o).length) out[t.name] = o;
    }
    const res = await setTeamStyles(gameId, out);
    if (res.ok) setMsg(`Hold-farver og navne for ${game?.name} er gemt. De slår igennem med det samme.`);
    else setErr(res.error);
    setBusy(false);
  }

  const Picker = ({ name, field, label }) => {
    const val = styles[name]?.[field] || '#888888';
    const def = defaults[name]?.[field];
    const changed = def != null && !eq(val, def);
    const short = teams.find((t) => t.name === name)?.short;
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
        <span style={{ fontSize: '0.7rem', color: 'var(--c-muted)', width: 52 }}>{label}</span>
        <ClubBadge code={short} color={isHex6(val) ? val : '#888888'} size={26} title={`${name} ${label}`} />
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
      <h3 style={{ marginTop: 0 }}>🎨 Hold-farver og navne</h3>

      {/* Vælg FØRST spillet — funktionen kan gælde flere spil. */}
      <div className="form-group" style={{ maxWidth: 340 }}>
        <label className="form-label" htmlFor="teamstyles-game">Spil</label>
        {gamesLoading ? (
          <div className="spinner" role="status" aria-label="Indlæser" />
        ) : styleable.length === 0 ? (
          <p style={{ color: 'var(--c-muted)' }}>Ingen spil med en hold-liste endnu.</p>
        ) : (
          <select id="teamstyles-game" className="select" value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {styleable.map((g) => (
              <option key={g.id} value={g.id}>{g.emoji ? `${g.emoji} ` : ''}{g.name}</option>
            ))}
          </select>
        )}
      </div>

      {game && (
        <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
          Sæt hver klubs <strong>hjemme-</strong>, <strong>ude-</strong> og <strong>3. farve</strong> for
          {' '}<strong>{game.name}</strong>. I en kamp vises hjemmeholdet i hjemmefarve og udeholdet i
          udefarve — men skifter automatisk til 3. farve, hvis udefarven er for tæt på hjemmeholdets farve.
          {' '}Under <strong>Vises som</strong> kan du give klubben et kortere navn til skærmen —
          {' '}fx <em>Brighton</em> i stedet for <em>Brighton and Hove Albion</em>. Klubbens rigtige navn
          {' '}står som overskrift og kan ikke ændres: det er nøglen, resultater og Elo matches på.
          Ændringer slår igennem for alle med det samme.
        </p>
      )}

      {msg && <p className="badge badge--green mb-2" style={{ display: 'block' }}>{msg}</p>}
      {err && <p className="badge badge--red mb-2">{err}</p>}

      {loading ? (
        <div className="spinner" role="status" aria-label="Indlæser" />
      ) : game ? (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {teams.map((t) => (
              <div key={t.name} style={{ borderTop: '1px solid var(--c-border)', paddingTop: '0.5rem' }}>
                <div style={{ fontWeight: 700, marginBottom: '0.35rem' }}>{t.name}</div>
                {/* VISNINGSNAVNET, ikke holdets navn. `t.name` er den eksakte
                    streng fra pulselive/api.superliga.dk og er nøglen, alt
                    matches på — den står som overskrift og kan ikke rettes. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.4rem' }}>
                  <span style={{ fontSize: '0.7rem', color: 'var(--c-muted)', width: 52 }}>Vises som</span>
                  <input
                    type="text"
                    value={styles[t.name]?.visningsnavn ?? ''}
                    maxLength={40}
                    onChange={(e) => setField(t.name, 'visningsnavn', e.target.value)}
                    aria-label={`Visningsnavn for ${t.name}`}
                    style={{ width: 220 }}
                  />
                  {String(styles[t.name]?.visningsnavn || '').trim() !== standardVisningsnavn(t.name) && (
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      title={`Nulstil til "${standardVisningsnavn(t.name)}"`}
                      onClick={() => setField(t.name, 'visningsnavn', standardVisningsnavn(t.name))}
                    >↺</button>
                  )}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.25rem' }}>
                  <Picker name={t.name} field="color" label="Hjemme" />
                  <Picker name={t.name} field="awayColor" label="Ude" />
                  <Picker name={t.name} field="thirdColor" label="3. farve" />
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1rem' }}>
            <button className="btn" disabled={busy} onClick={handleSave}>
              {busy ? 'Gemmer…' : `Gem farver og navne for ${game.name}`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
