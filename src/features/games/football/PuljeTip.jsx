/**
 * PuljeTip — sæson-bonus-tip, drevet af spillets pulje-konfiguration
 * (puljeKonfig): Superligaen = vælg 6 til mesterskabsspillet; PL = vælg 4 i
 * toppen og 3 i bunden ("Juletabellen"). Alle antal, tekster og facit-kilden
 * kommer fra konfigurationen — ingen hårdkodede 6-taller.
 *
 * Facit-kilden SPEJLER serverens (settlePuljeBets): 'officiel' læser
 * game.standings; 'egneKampe' beregner af spillets egne kampe og rører aldrig
 * standings. Klienten regnede før sit eget facit med en 12-holds-antagelse og
 * ville ALDRIG have vist facit-kortet for PL (QC-fund).
 */
import { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../../../firebase';
import { useAuth } from '../../../context/AuthContext';
import { COL } from '../../../lib/constants';
import { teamsOf } from './teamInfo';
import {
  puljeKonfig, leagueTable, championshipTeams, bundTeams, puljeScore,
} from '../../../lib/superligaScoring';
import { setPuljeBet } from '../gameActions';
import { toMillis } from './footballRounds';
import ClubBadge from '../../../components/ClubBadge';
import { fmtPoints } from '../../../lib/daNum';
import { formatKickoff, relativeDeadline } from '../../../lib/daDate';

/** Er ALLE spillets kampe spillet (samme kriterium som serverens self-guard)? */
function alleSpillet(matches) {
  const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));
  return (matches || []).length > 0 && matches.every(
    (m) => Number.isFinite(goalOf(m.homeGoals)) && Number.isFinite(goalOf(m.awayGoals)),
  );
}

export default function PuljeTip({ game, matches }) {
  const gameId = game?.id;
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const konfig = useMemo(() => puljeKonfig(game), [game]);
  const [bet, setBet] = useState(undefined); // undefined = indlæser, null = intet tip
  const [picks, setPicks] = useState([]);    // toppen
  const [nedPicks, setNedPicks] = useState([]); // bunden (kun når nedSize > 0)
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!gameId || !uid) { setBet(null); return undefined; }
    const ref = doc(db, COL.GAMES, gameId, COL.GAME_PULJE, uid);
    return onSnapshot(ref, (snap) => {
      const data = snap.exists() ? snap.data() : null;
      setBet(data);
      setPicks(Array.isArray(data?.championship) ? data.championship : []);
      setNedPicks(Array.isArray(data?.relegation) ? data.relegation : []);
    }, () => setBet(null));
  }, [gameId, uid]);

  const lockMs = useMemo(() => toMillis(game?.puljeLockAt), [game]);
  const locked = lockMs != null && Date.now() >= lockMs;
  // UDEN deadline er tippet IKKE åbent: rules kræver puljeLockAt for
  // overhovedet at acceptere en skrivning. Den gamle tekst "🟢 Åbent —
  // deadline fastsættes af admin" inviterede til en gemme-knap, der
  // garanteret fejlede (QC-fund).
  const ikkeAabnet = lockMs == null;

  // Facit — SAMME kilde som serverens afregning.
  const facit = useMemo(() => {
    if (!konfig) return null;
    if (konfig.facitKilde === 'egneKampe') {
      if (!alleSpillet(matches)) return null;
      return {
        top: championshipTeams(matches, konfig.poolSize),
        bund: konfig.nedSize > 0 ? bundTeams(matches, konfig.nedSize) : null,
      };
    }
    // 'officiel': game.standings, kun når hele sæsonen er synket igennem.
    const st = Array.isArray(game?.standings) ? game.standings : null;
    const antalHold = Array.isArray(game?.teams) && game.teams.length >= 2 ? game.teams.length : 12;
    if (!st || st.length < antalHold) return null;
    const kampePrRunde = antalHold / 2;
    const expectedPlayed = matches.length % kampePrRunde === 0 ? matches.length / kampePrRunde : null;
    if (expectedPlayed && !st.every((r) => Number(r.played) === expectedPlayed)) return null;
    return {
      top: st.filter((r) => Number(r.rank) <= konfig.poolSize).map((r) => r.teamName),
      bund: konfig.nedSize > 0
        ? st.filter((r) => Number(r.rank) > antalHold - konfig.nedSize).map((r) => r.teamName)
        : null,
    };
  }, [konfig, game, matches]);
  const seasonDone = facit != null;

  // "Lige nu"-status (spilfører-krav: puljen skal have puls hele sæsonen).
  // Beregnes af de SPILLEDE kampe — samme tal som facit ville give, hvis
  // tabellen sluttede i dag. Ordet "lige nu" er bærende: intet her er afregnet.
  const ligeNu = useMemo(() => {
    if (!konfig || seasonDone) return null;
    const spillede = (matches || []).filter((m) => {
      const goalOf = (g) => (g == null || g === '' ? NaN : Number(g));
      return Number.isFinite(goalOf(m.homeGoals)) && Number.isFinite(goalOf(m.awayGoals));
    });
    if (spillede.length === 0 || leagueTable(spillede).length < konfig.poolSize + konfig.nedSize) return null;
    return {
      top: new Set(championshipTeams(spillede, konfig.poolSize)),
      bund: konfig.nedSize > 0 ? new Set(bundTeams(spillede, konfig.nedSize)) : null,
    };
  }, [konfig, seasonDone, matches]);

  if (!konfig) return null; // fanen er data-gated, men bæltet OG selerne
  if (bet === undefined) return <div className="spinner" role="status" aria-label="Indlæser" />;

  const valg = { antal: konfig.poolSize, perTeam: konfig.perTeam, perfectBonus: konfig.perfectBonus };
  const ligeNuTop = ligeNu && bet ? puljeScore(picks, ligeNu.top, valg) : null;
  const ligeNuBund = ligeNu?.bund && bet
    ? puljeScore(nedPicks, ligeNu.bund, { ...valg, antal: konfig.nedSize }) : null;

  const komplet = picks.length === konfig.poolSize
    && (konfig.nedSize === 0 || nedPicks.length === konfig.nedSize);

  function toggleI(liste, saetListe, andenListe, maks) {
    return (name) => {
      setMsg(''); setErr('');
      saetListe((cur) => {
        if (cur.includes(name)) return cur.filter((n) => n !== name);
        if (cur.length >= maks) return cur;
        if (andenListe.includes(name)) return cur; // aldrig i begge (rules-spejl)
        return [...cur, name];
      });
    };
  }

  async function save() {
    setBusy(true); setMsg(''); setErr('');
    const res = await setPuljeBet(uid, gameId, picks, { konfig, relegation: nedPicks });
    if (res.ok) setMsg('Pulje-tippet er gemt.');
    else setErr(res.error);
    setBusy(false);
  }

  const teams = teamsOf(game);

  // Én sektion (toppen eller bunden): grid af holdknapper med valg,
  // facit-markering (🏆/⚠️) og "lige nu"-markering, når facit mangler.
  const Sektion = ({ titel, maks, valgte, toggle, facitHold, ligeNuHold, ikon }) => {
    const chosen = new Set(valgte);
    return (
      <div className="mb-2">
        {titel && <h4 style={{ margin: '0.6rem 0 0.35rem' }}>{titel}</h4>}
        <div className="pulje-grid">
          {teams.map((t) => {
            const isChosen = chosen.has(t.name);
            const inFacit = facitHold ? facitHold.includes(t.name) : null;
            const hitClass = inFacit == null ? '' : (isChosen && inFacit ? 'pulje-team--hit' : (isChosen && !inFacit ? 'pulje-team--miss' : ''));
            return (
              <button
                key={t.name}
                className={`pulje-team ${isChosen ? 'pulje-team--chosen' : ''} ${hitClass}`}
                disabled={ikkeAabnet || locked || busy || (!isChosen && valgte.length >= maks)}
                onClick={() => toggle(t.name)}
                aria-pressed={isChosen}
              >
                <ClubBadge
                  variant="troeje" code={t.short} color={t.color} size={26}
                  color2={t.troejer?.hjemme?.sekundaer} moenster={t.troejer?.hjemme?.moenster}
                  aerme={t.troejer?.hjemme?.aerme} title={t.name}
                />
                <span className="pulje-team__name">{t.vis || t.name}</span>
                {isChosen && <span className="pulje-team__check">✓</span>}
                {inFacit === true && <span className="pulje-team__actual" title="Facit">{ikon}</span>}
                {inFacit == null && ligeNuHold?.has(t.name) && (
                  <span className="pulje-team__actual" title="Står der lige nu — intet er afgjort">{ikon}</span>
                )}
              </button>
            );
          })}
        </div>
        {!ikkeAabnet && !locked && (
          <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>{valgte.length}/{maks} valgt</span>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="card mb-2">
        <h3 className="card__title">{konfig.labels.overskrift}</h3>
        <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
          Vælg de <strong>{konfig.poolSize} hold</strong> du tror står i <strong>{konfig.labels.top}</strong>
          {konfig.nedSize > 0 && (
            <> — og de <strong>{konfig.nedSize}</strong> du tror hænger i <strong>{konfig.labels.ned}</strong></>
          )}
          . Afgøres på {konfig.labels.facit}: <strong>+{konfig.perTeam} point</strong> pr. hold, der står rigtigt
          {konfig.perfectBonus > 0 && (
            <>, og <strong>+{konfig.perfectBonus} bonus</strong> hvis du rammer alle</>
          )}
          .
        </p>
        {ikkeAabnet ? (
          <p className="badge badge--muted" style={{ display: 'inline-block' }}>
            Endnu ikke åbnet — arrangøren har ikke sat en deadline.
          </p>
        ) : locked ? (
          <p className="badge badge--muted" style={{ display: 'inline-block' }}>
            🔒 Deadline passeret ({formatKickoff(lockMs)}) — pulje-tippet er låst.
          </p>
        ) : (
          <p className="badge badge--yellow" style={{ display: 'inline-block' }}>
            Deadline: {formatKickoff(lockMs)} ({relativeDeadline(lockMs)})
          </p>
        )}
      </div>

      {/* Facit — ét kort PR. SPØRGSMÅL, så bonusPoints-summen har en forklaring. */}
      {seasonDone && bet && (
        <div className="card mb-2" style={{ borderLeft: '4px solid var(--c-pitch)' }}>
          <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
            <strong>Facit: {konfig.labels.top}</strong>
            <span className="badge badge--green">
              {bet.correct ?? 0}/{konfig.poolSize} rigtige · +{fmtPoints(bet.points ?? 0)}
            </span>
          </div>
          {konfig.nedSize > 0 && (
            <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
              <strong>Facit: {konfig.labels.ned}</strong>
              <span className="badge badge--green">
                {bet.nedCorrect ?? 0}/{konfig.nedSize} rigtige · +{fmtPoints(bet.nedPoints ?? 0)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* "Lige nu" — puls hele sæsonen. Aldrig ordet "point" uden "lige nu". */}
      {!seasonDone && ligeNuTop && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }} data-testid="pulje-ligenu">
          Lige nu: <strong>{ligeNuTop.correct} af {konfig.poolSize}</strong> i toppen
          {ligeNuBund && (
            <>, <strong>{ligeNuBund.correct} af {konfig.nedSize}</strong> i bunden</>
          )}
          {' '}— {fmtPoints(ligeNuTop.points + (ligeNuBund?.points || 0))} point,
          hvis tabellen sluttede i dag. Intet er afgjort endnu.
        </p>
      )}

      {msg && <p className="badge badge--green mb-2" style={{ display: 'block' }}>{msg}</p>}
      {err && <p className="badge badge--red mb-2">{err}</p>}

      <Sektion
        titel={konfig.nedSize > 0 ? `🏆 Toppen — vælg ${konfig.poolSize}` : null}
        maks={konfig.poolSize} valgte={picks}
        toggle={toggleI(picks, setPicks, nedPicks, konfig.poolSize)}
        facitHold={facit?.top || null} ligeNuHold={ligeNu?.top || null} ikon="🏆"
      />
      {konfig.nedSize > 0 && (
        <Sektion
          titel={`⚠️ Bunden — vælg ${konfig.nedSize}`}
          maks={konfig.nedSize} valgte={nedPicks}
          toggle={toggleI(nedPicks, setNedPicks, picks, konfig.nedSize)}
          facitHold={facit?.bund || null} ligeNuHold={ligeNu?.bund || null} ikon="⚠️"
        />
      )}

      {!ikkeAabnet && !locked && (
        <div className="flex items-center mt-2" style={{ gap: '0.6rem' }}>
          <button className="btn" disabled={busy || !komplet} onClick={save}>
            {busy ? 'Gemmer…' : 'Gem pulje-tip'}
          </button>
          {!komplet && (
            <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>
              {konfig.nedSize > 0
                ? `Vælg ${konfig.poolSize} i toppen og ${konfig.nedSize} i bunden — begge dele gemmes samlet.`
                : `Vælg præcis ${konfig.poolSize} hold.`}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
