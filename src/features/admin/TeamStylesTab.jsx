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
import { standardVisningsnavn, MAKS_VISNINGSNAVN } from '../games/football/visningsnavn';
import { byggOverrides, dubletter, ugyldigeFarver } from './teamStylesOverrides';

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
  const [indlaesFejl, setIndlaesFejl] = useState(false);

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
      setIndlaesFejl(false);
      setLoading(false);
    }).catch(() => {
      if (!alive) return;
      // FEJLEDE INDLÆSNINGEN, MÅ DER IKKE GEMMES. Formularen ville da stå med
      // lutter standardværdier, `byggOverrides` ville bygge et tomt objekt, og
      // `updateDoc` ville ERSTATTE — altså slette alle admins gemte farver og
      // navne, uden at nogen havde rørt et felt. Før `updateDoc` var det også
      // galt, bare tavst: `setDoc(merge)` med et tomt map slettede lige så
      // meget. Vinduet har været åbent hele tiden.
      setIndlaesFejl(true);
      setErr('Kunne ikke hente spillets gemte farver og navne. Prøv at genindlæse siden — der gemmes ikke, før de er hentet, så intet er gået tabt.');
      setLoading(false);
    });
    return () => { alive = false; };
  }, [gameId, teams]);

  function setField(name, key, value) {
    setStyles((s) => ({ ...s, [name]: { ...s[name], [key]: value } }));
    setMsg(''); setErr('');
  }

  // Viste navne, to hold ville dele. En ADVARSEL, ikke en spærring: der findes
  // ligaer med to klubber, man dagligt kalder det samme, og admin må selv
  // afgøre det. Men den skal stå der, FØR der gemmes — opdages "Manchester" to
  // gange først på kampkortet, er den allerede live for alle.
  const dobbelte = useMemo(() => dubletter(teams, styles), [teams, styles]);

  // Halvskrevne farvekoder. I MODSÆTNING til dubletter spærrer de for at gemme:
  // en dublet er et valg, admin må træffe, mens en ugyldig hex ikke er et valg
  // om noget — den ville bare slette holdets gemte farve uden at sige det.
  const ugyldige = useMemo(() => ugyldigeFarver(teams, styles), [teams, styles]);

  const kanGemme = !busy && !indlaesFejl && ugyldige.length === 0;

  async function handleSave() {
    if (!kanGemme) return;
    setBusy(true); setMsg(''); setErr('');
    const res = await setTeamStyles(gameId, byggOverrides(teams, styles));
    if (res.ok) setMsg(`Hold-farver og navne for ${game?.name} er gemt. De slår igennem i appen med det samme.`);
    else setErr(res.error);
    setBusy(false);
  }

  /**
   * Dublet-advarslen. Står BÅDE over listen og ved Gem-knappen, så `id` skal
   * skille dem ad — to elementer med samme testid er ikke til at skrive en test
   * imod, og for en skærmlæser er det to gange den samme besked uden kontekst.
   */
  const dubletAdvarsel = (id) => dobbelte.length > 0 && (
    <p className="badge badge--yellow mb-2" data-testid={id} style={{ display: 'block' }}>
      {/* "To hold" var hårdkodet. Tre hold på samme navn — eller to par — gjorde
          sætningen forkert, og en advarsel, der tæller forkert, er svær at tro
          på. Tælleren er HOLD, ikke grupper: én gruppe kan rumme tre. */}
      ⚠️ {dobbelte.reduce((n, d) => n + d.hold.length, 0) === 2
        ? 'To hold ville hedde det samme på skærmen'
        : 'Flere hold ville hedde det samme på skærmen'}:
      {' '}{dobbelte.map((d) => `"${d.navn}" (${d.hold.join(' og ')})`).join('; ')}.
      {' '}På kampkortet kan de så ikke skelnes fra hinanden. Du kan godt gemme alligevel.
    </p>
  );

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
        {/* Tekstfeltet er DÉT, der kan komme til at stå med en halv hex —
            farvevælgeren ved siden af retter selv en ugyldig værdi til sort.
            Egen etiket, så det kan skelnes fra vælgeren; uden den var feltet
            heller ikke til at finde for en skærmlæser. */}
        <input type="text" value={val} maxLength={7}
          onChange={(e) => setField(name, field, e.target.value)}
          aria-label={`${label}farve for ${name} som kode`}
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
          udefarve — men skifter til 3. farve, HVIS den ligger længere fra hjemmeholdets farve.
          {/* "skifter automatisk, hvis udefarven er for tæt på" var et over-løfte, og
              det er værst netop her, hvor man sidder og retter farverne: `matchBadges`
              vælger den FJERNESTE af ude og 3. Sætter ejeren en tredjefarve, der ligger
              tættere på end udefarven, sker der ingenting — og så ser funktionen ud til
              at være i stykker. Samme rettelse er lavet på spillerfladen; de to skærme
              skal beskrive den samme regel ens. */}
          {' '}Ligger ingen af dem langt nok væk, bliver udefarven stående, og de to badges ligner
          {' '}stadig hinanden — spilleren kan se hvilke hold det gælder under
          {' '}<strong>🙂 Mit hold</strong>.
          {' '}Under <strong>Vises som</strong> kan du give klubben et kortere navn til skærmen —
          {' '}fx <em>Brighton</em> i stedet for <em>Brighton and Hove Albion</em>. Klubbens rigtige navn
          {' '}står som overskrift og kan ikke ændres: det er nøglen, resultater og Elo matches på.
          {' '}<strong>Ryd feltet for at bruge forslaget igen.</strong>
          {/* "for alle med det samme" var for bredt: serverens påmindelsesmails
              bruger stadig det eksakte navn, fordi visningsnavnet bevidst ikke
              er spejlet til functions-platform/. */}
          {' '}Ændringer slår igennem i appen for alle med det samme — påmindelses-mails
          bruger fortsat klubbens rigtige navn.
        </p>
      )}

      {msg && <p className="badge badge--green mb-2" style={{ display: 'block' }}>{msg}</p>}
      {err && <p className="badge badge--red mb-2">{err}</p>}

      {ugyldige.length > 0 && (
        <p className="badge badge--red mb-2" data-testid="hex-fejl" style={{ display: 'block' }}>
          🛑 Der gemmes ikke, før farvekoderne er hele.
          {' '}{ugyldige.map((u) => `${u.hold} → ${u.felt}: "${u.vaerdi}"`).join('; ')}.
          {' '}En farvekode skal være seks tegn efter tegnet #, fx <code>#B80112</code>.
          {' '}Ryd feltet for at bruge holdets standardfarve.
        </p>
      )}

      {dubletAdvarsel('dublet-advarsel')}

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
                    maxLength={MAKS_VISNINGSNAVN}
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

          {/* ADVARSLERNE GENTAGES HER. Med 12-20 hold laver man dubletten
              nederst i listen og trykker Gem nederst — advarslen i toppen er
              da for længst scrollet ud af skærmen. En advarsel, man ikke kan se
              i det øjeblik, man handler, er ingen advarsel. */}
          <div style={{ marginTop: '1rem' }}>
            {ugyldige.length > 0 && (
              <p className="badge badge--red mb-2" data-testid="hex-fejl-gem" style={{ display: 'block' }}>
                🛑 {ugyldige.length === 1 ? 'Én farvekode er ikke hel' : `${ugyldige.length} farvekoder er ikke hele`}:
                {' '}{ugyldige.map((u) => `${u.hold} → ${u.felt}`).join('; ')}.
                {' '}Ret {ugyldige.length === 1 ? 'den' : 'dem'} for at kunne gemme.
              </p>
            )}
            {dubletAdvarsel('dublet-advarsel-gem')}
            <button className="btn" disabled={!kanGemme} onClick={handleSave}>
              {busy ? 'Gemmer…' : `Gem farver og navne for ${game.name}`}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
