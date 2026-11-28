/**
 * QuizTab — admin: en quiz om, hvordan det går/er gået for én liga (som
 * standard «Dreamteam») i VM 2026, Tour de France, Superligaen og PL.
 *
 * Spørgsmålene regnes af LEVENDE data, når fanen åbnes — ingen kopi, der kan
 * blive forældet (CLAUDE.md: «Et spejl af levende data er en løgn med
 * forsinkelse»):
 *   - VM og Tour: legacyLeagueResults (top 5 eksporteret fra de gamle apps;
 *     kun admin må læse).
 *   - Superligaen og PL: ligaens stilling (samme ligaRanking som Stilling-
 *     fanen), ligamedlemmernes tips og kampene. Ligaen findes blandt de ligaer,
 *     DU er med i — reglerne lader kun medlemmer læse en liga.
 *
 * Selve spørgsmålene laves af den rene funktion `lavQuiz` (quiz.js).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { useGames } from '../games/useGames';
import { useGame } from '../games/useGame';
import { useVisibleGameStandings } from '../games/useVisibleGameStandings';
import { ligaRanking } from '../games/gameStandings';
import { ligaPointFor, harRundeVektor, vektorStemmer } from '../../lib/ligaPoint';
import { fetchLegacyResults } from './legacyResults';
import { lavQuiz } from './quiz';

const BOGSTAVER = ['A', 'B', 'C', 'D'];
const norm = (s) => String(s || '').trim().toLocaleLowerCase('da');

/** Ligamedlemmernes tips i ét spil (admin må læse alle tips). */
async function hentTips(gameId, uids) {
  const ud = [];
  for (let i = 0; i < uids.length; i += 30) {
    const snap = await getDocs(query(
      collection(db, COL.GAMES, gameId, COL.GAME_BETS),
      where('uid', 'in', uids.slice(i, i + 30)),
    ));
    snap.forEach((d) => ud.push({ ...d.data(), id: d.id }));
  }
  return ud;
}

/**
 * Henter ét levende spils data for ligaen og melder det op.
 * Renderer intet — den findes, fordi hooks skal kaldes pr. spil.
 */
function LevendeLiga({ gameId, ligaNavn, onData }) {
  const { game, matches, loading: gameLoading } = useGame(gameId);
  const { standings, leagues, loading } = useVisibleGameStandings(gameId);
  const liga = useMemo(
    () => leagues.find((l) => norm(l.name) === norm(ligaNavn)) || null,
    [leagues, ligaNavn],
  );
  const rows = useMemo(
    () => (liga && game ? ligaRanking(standings, liga, ligaPointFor(game), harRundeVektor, vektorStemmer) : []),
    [standings, liga, game],
  );
  // Effekten følger INDHOLD, ikke objekt-identitet: et nyt array med samme
  // tal må ikke starte en ny hentning (og en ny onData → gentegning → løkke).
  const dataKey = rows.map((r) => `${r.uid}:${r.totalPoints}`).sort().join(',')
    + `|${(matches || []).length}|${liga?.id ?? ''}|${liga?.startRound ?? ''}`;
  const seneste = useRef({ rows, matches, liga });
  seneste.current = { rows, matches, liga };

  useEffect(() => {
    if (loading || gameLoading) return undefined;
    const { rows: r, matches: m, liga: l } = seneste.current;
    if (!l) { onData(gameId, { fejl: 'ikke-medlem' }); return undefined; }
    let aflyst = false;
    const start = Number.isFinite(l.startRound) ? l.startRound : null;
    hentTips(gameId, r.map((x) => x.uid))
      .then((bets) => { if (!aflyst) onData(gameId, { rows: r, bets, matches: m, startRound: start }); })
      .catch(() => { if (!aflyst) onData(gameId, { rows: r, bets: [], matches: m, startRound: start, tipsFejl: true }); });
    return () => { aflyst = true; };
  }, [gameId, dataKey, loading, gameLoading, onData]);
  return null;
}

function Spoergsmaal({ nr, q, visAlle }) {
  const [vis, setVis] = useState(false);
  const aaben = vis || visAlle;
  const rigtigtValg = q.svarValg ?? q.svar;
  return (
    <li className="quiz__q" data-testid="quiz-spoergsmaal">
      <div className="quiz__hoved">
        <span className="quiz__nr">{nr}.</span>
        <span className="badge badge--muted">{q.spil}</span>
        <span className="badge">{q.type === 'valg' ? 'Multiple choice' : 'Åbent spørgsmål'}</span>
      </div>
      <p className="quiz__tekst">{q.tekst}</p>
      {q.type === 'valg' && (
        <ol className="quiz__valg">
          {q.valg.map((v, i) => (
            <li key={v} className={aaben && v === rigtigtValg ? 'quiz__valg--rigtigt' : undefined}>
              <b>{BOGSTAVER[i]}.</b> {v}
            </li>
          ))}
        </ol>
      )}
      <button type="button" className="btn btn--ghost btn--sm quiz__vis" onClick={() => setVis((x) => !x)}>
        {aaben ? 'Skjul svar' : 'Vis svar'}
      </button>
      {aaben && <p className="quiz__svar" data-testid="quiz-svar">Svar: <b>{q.svar}</b></p>}
    </li>
  );
}

export default function QuizTab() {
  const { games } = useGames();
  const [ligaNavn, setLigaNavn] = useState('Dreamteam');
  const [aktivNavn, setAktivNavn] = useState(null);
  const [legacy, setLegacy] = useState(null);
  const [levende, setLevende] = useState({});
  const [visAlle, setVisAlle] = useState(false);
  // Tæller pr. tryk: et nyt tryk på samme liga skal hente forfra (ny key).
  const [koersel, setKoersel] = useState(0);

  // De to levende fodboldspil: Superligaen og Premier League (ikke afsluttede).
  const slId = games.find((g) => g.id.startsWith('superliga') && g.status !== 'finished')?.id ?? null;
  const plId = games.find((g) => g.id.startsWith('pl') && g.status !== 'finished')?.id ?? null;

  // Nulstil i HANDLINGEN, ikke i en effekt: børnenes effekter kører før
  // forælderens, så en nulstilling her i en effekt ville slette det, et barn
  // netop har meldt (fx «ikke medlem»).
  function lav(navn) {
    setLegacy(null);
    setLevende({});
    setAktivNavn(navn);
    setKoersel((k) => k + 1);
    fetchLegacyResults().then((r) => setLegacy(r));
  }

  const onData = useMemo(() => (gameId, data) => setLevende((s) => ({ ...s, [gameId]: data })), []);

  const vm = legacy?.ok ? legacy.results.find((r) => r.source === 'vm' && norm(r.name) === norm(aktivNavn)) || null : null;
  const tour = legacy?.ok ? legacy.results.find((r) => r.source === 'tour' && norm(r.name) === norm(aktivNavn)) || null : null;
  const sl = slId && levende[slId]?.rows ? levende[slId] : null;
  const pl = plId && levende[plId]?.rows ? levende[plId] : null;
  const klar = legacy != null && (!slId || levende[slId]) && (!plId || levende[plId]);
  const quiz = useMemo(() => (klar ? lavQuiz({ vm, tour, sl, pl }) : null), [klar, vm, tour, sl, pl]);

  const kilder = [
    ['VM 2026', vm ? `top 5 af ${vm.memberCount}` : null],
    ['Tour de France', tour ? `top 5 af ${tour.memberCount}` : null],
    ['Superligaen', sl ? `${sl.rows.length} spillere` : levende[slId]?.fejl ? 'du er ikke med i ligaen her' : null],
    ['Premier League', pl ? `${pl.rows.length} spillere` : levende[plId]?.fejl ? 'du er ikke med i ligaen her' : null],
  ];

  return (
    <div className="quiz">
      <h2 style={{ marginTop: 0 }}>🧠 Liga-quiz</h2>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        2 × 10 spørgsmål om, hvordan det går og er gået for en liga — regnet af de rigtige data,
        hver gang du laver quizzen. VM og Tour kendes kun som ligaens top 5 fra de gamle apps.
      </p>
      <form
        className="quiz__form"
        onSubmit={(e) => { e.preventDefault(); lav(ligaNavn.trim()); }}
        style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}
      >
        <label htmlFor="quiz-liga">Liga</label>
        <input id="quiz-liga" className="input" value={ligaNavn} onChange={(e) => setLigaNavn(e.target.value)} />
        <button type="submit" className="btn btn--primary" disabled={!ligaNavn.trim()}>Lav quizzen</button>
      </form>

      {aktivNavn && slId && <LevendeLiga key={`sl-${koersel}`} gameId={slId} ligaNavn={aktivNavn} onData={onData} />}
      {aktivNavn && plId && <LevendeLiga key={`pl-${koersel}`} gameId={plId} ligaNavn={aktivNavn} onData={onData} />}

      {aktivNavn && (
        <ul className="quiz__kilder" data-testid="quiz-kilder">
          {kilder.map(([navn, txt]) => (
            <li key={navn}>{txt ? '✓' : '–'} {navn}{txt ? `: ${txt}` : (klar ? ': ingen data for ligaen' : ': henter …')}</li>
          ))}
          {legacy && !legacy.ok && <li role="alert">Kunne ikke hente VM/Tour: {legacy.error}</li>}
        </ul>
      )}

      {quiz && (
        <>
          <div style={{ display: 'flex', gap: '0.5rem', margin: '0.75rem 0' }} className="quiz__knapper">
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setVisAlle((x) => !x)}>
              {visAlle ? 'Skjul alle svar' : 'Vis alle svar'}
            </button>
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => window.print()}>🖨️ Udskriv</button>
          </div>
          {quiz.map((runde, ri) => (
            <section key={runde.titel} className="card quiz__runde" data-testid="quiz-runde">
              <h3 style={{ marginTop: 0 }}>{runde.titel}</h3>
              {runde.spoergsmaal.length < 10 && (
                <p className="badge badge--muted">
                  Kun {runde.spoergsmaal.length} spørgsmål — der er ikke data nok til flere i denne runde.
                </p>
              )}
              <ol className="quiz__liste">
                {runde.spoergsmaal.map((q, i) => (
                  <Spoergsmaal key={q.tekst} nr={ri * 10 + i + 1} q={q} visAlle={visAlle} />
                ))}
              </ol>
            </section>
          ))}
        </>
      )}
    </div>
  );
}
