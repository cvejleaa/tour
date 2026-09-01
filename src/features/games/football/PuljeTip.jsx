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
import { puljenTaeller } from '../../../lib/ligaPoint';
import { useGameStandings } from '../useGameStandings';
import PuljeAfsloering from './PuljeAfsloering';
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

/**
 * Sektionens navn i DETTE spil.
 *
 * "Toppen" giver kun mening op mod en bund. Har spillet ingen bundsektion,
 * bruges spillets eget ord for feltet (`labels.top`, fx "mesterskabsspillet").
 *
 * ÉT STED, TO BRUGERE: overskriften over gitteret og "lige nu"-linjen. De sagde
 * før hver sit — overskriften "Mesterskabsspillet", linjen "i toppen" — og så
 * stod ordet "toppen" intet andet sted på Superligaens side.
 *
 * KONTRAKTEN PÅ `labels.top`: den skrives som et SÆTNINGSLED ("du tror står i
 * top 4 juleaften"), ikke som en titel. Her sættes den forrest med stort
 * begyndelsesbogstav, hvilket går godt for "mesterskabsspillet". Et spil uden
 * bund og med en label som "top 4 juleaften" ville få "🏆 Top 4 juleaften —
 * vælg 4"; forstået, men klodset. Skal det bruges, hører der en egen
 * `labels.topTitel` med — ikke en omskrivning af den indlejrede.
 */
export function sektionsNavn(konfig) {
  if (konfig.nedSize > 0) return 'toppen';
  // `puljeKonfig` typetjekker labels.top, men tjekker ikke længden — en admin
  // kan sætte "". Uden vagten ville overskriften få et hul, hvor navnet skulle
  // stå: "🏆  — vælg 6".
  return (konfig.labels?.top || '').trim() || 'toppen';
}

/**
 * Overskriften over holdgitteret — den, PL havde og Superligaen manglede.
 *
 * Den blev FØR undertrykt for spil uden bundsektion (`nedSize > 0 ? … : null`)
 * ud fra at én sektion ikke behøver et navn. Men overskriften bærer også
 * ANTALLET, og uden den skulle man læse brødteksten for at vide, at
 * Superligaen vil have 6.
 *
 * ER TIPPET LÅST, ER "VÆLG" EN LØGN. Efter deadline kan man ikke vælge, og
 * overskriften er så den eneste tekst ved gitteret — en imperativ, ingen kan
 * følge. Låst siger den derfor, hvad man HAR.
 */
export function topTitel(konfig, laast = false) {
  const navn = sektionsNavn(konfig);
  const stort = navn.charAt(0).toUpperCase() + navn.slice(1);
  return `🏆 ${stort} — ${laast ? 'dine' : 'vælg'} ${konfig.poolSize}`;
}

/** "A", "A og B", "A, B og C" — dansk opremsning. */
function opremsning(navne) {
  if (navne.length === 1) return navne[0];
  return `${navne.slice(0, -1).join(', ')} og ${navne[navne.length - 1]}`;
}

/**
 * Forbeholdet: puljen tæller ikke i en liga, der starter for sent.
 *
 * `puljenTaeller` (`ligaPoint.js:43-46`) slår puljen fra over
 * `PULJE_MAKS_STARTRUNDE`. Fire flader sagde det allerede — stillingen
 * (`GameStandings.jsx:403`), Ligaer-fanen (`GameLeagues.jsx:225` og `:247`) og
 * Guiden (`FootballHelp.jsx:273-274`) — men netop puljefanen, som LOVER
 * pointene, sagde intet. Efter #201 lyser pokalerne oveni på et låst gitter og
 * gør løftet mere nærværende.
 *
 * LIGAEN NAVNGIVES, og der siges hvad der TÆLLER først.
 *
 * "Puljen tæller ikke i dine ligaer" ville være både en dræber og USANDT: har
 * man to eller flere ligaer og ikke valgt én, viser Stilling-fanen SPILLETS
 * skala, hvor puljen altid tæller (`GameStandings.jsx:406-410`). Den absolutte
 * form ville altså modsige den total, spilleren ser ét klik væk (QC-fund).
 *
 * En liga UDEN startrunde tæller puljen med — `puljenTaeller` returnerer true
 * for alt, der ikke er et endeligt tal.
 *
 * @param {Array<{name?:string, startRound?:number}>} ligaer seerens ligaer i spillet
 * @returns {string|null} sætningen, eller null når der intet er at tage forbehold for
 */
export function puljeLigaForbehold(ligaer) {
  const uden = (ligaer || []).filter((l) => !puljenTaeller(l.startRound));
  if (!uden.length) return null;
  const navne = uden.map((l) => l.name || 'en liga uden navn');
  // "men ikke i X" ville sige det samme, men uden strengen "tæller ikke", som
  // de fire andre flader bruger — og så kunne denne femte ikke findes med en
  // grep efter den. Gentagelsen af verbet er prisen for, at samme ting hedder
  // det samme alle steder.
  return `Puljen tæller i spillets samlede stilling, men tæller ikke i ${opremsning(navne)}.`;
}

export default function PuljeTip({ game, matches }) {
  const gameId = game?.id;
  const { user } = useAuth();
  const uid = user?.uid ?? null;
  const konfig = useMemo(() => puljeKonfig(game), [game]);
  // ÉN lytter for både forbeholdet (ligaer) og afsløringen (liga-fæller med
  // navne). `useGameStandings` giver begge dele — og kalder `useGameLeagues`
  // indeni, så et direkte kald her ville være samme forespørgsel to gange
  // (QC-fund). Prisen: stillingens lyttere (players, users) er nu også åbne
  // på pulje-fanen, ikke kun på Stilling.
  const { standings, leagues, loading: stillingHenter } = useGameStandings(gameId);
  const ligaForbehold = useMemo(() => puljeLigaForbehold(leagues), [leagues]);
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

  // Overskriften over holdgitteret.
  //
  // Den blev FØR undertrykt for spil uden bundsektion — `nedSize > 0 ? … :
  // null` — ud fra at én sektion ikke behøver et navn. Men overskriften bærer
  // også ANTALLET, og uden den skulle man læse brødteksten for at vide, at
  // Superligaen vil have 6. PL, som har to sektioner, sagde det direkte over
  // gitteret. Det var hele forskellen mellem de to flader.
  //
  // Ét navn er ikke nok til begge: "Toppen" giver kun mening op mod en bund.
  // Har spillet ingen, bruges spillets eget ord for feltet (`labels.top`, fx
  // "mesterskabsspillet"), så overskriften siger, hvad der vælges TIL.
  // LÅST er ikke det samme som "ikke DENNE". Er tippet lukket, er der ingen
  // handling at fraråde — og så er pokalerne det eneste, der stadig er
  // interessant at kigge på. Se `.pulje-team--laast` i theme.css.
  //
  // KUN `locked`, IKKE `ikkeAabnet`. Første udgave havde begge, og det var
  // forkert: i "endnu ikke åbnet" er der ingen spillede kampe, altså ingen
  // pokaler, ingen tæller og ingen gem-knap. Dér ER dæmpningen det rigtige
  // signal — et fuldt oplyst gitter, der ser klikbart ud under "Endnu ikke
  // åbnet", ville love noget, det ikke kan holde (QC-fund).
  //
  // `busy` er heller ikke med, og det er bevidst: den varer et øjeblik under
  // et gem, hvor dæmpningen netop skal sige "vent". Den kan ikke støde sammen
  // med låsen — der kan ikke gemmes på et låst tip (`:297`), så `busy` og
  // `locked` er aldrig sande samtidig (TM-fund: forholdet var udokumenteret).
  const laast = locked;

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
                className={`pulje-team ${isChosen ? 'pulje-team--chosen' : ''} ${hitClass}${laast ? ' pulje-team--laast' : ''}`}
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
        {/* TÆLLEREN BLIVER STÅENDE, NÅR DER ER LÅST. Den var skjult, og efter
            at overskriften kom til, var den det ENESTE, der stod ved et låst
            gitter — som en imperativ uden tæller. Værre: en spiller, der
            aldrig nåede at tippe, fik ingen besked om det. "0/6 valgt · låst"
            siger begge dele. Ved "endnu ikke åbnet" er der stadig intet at
            tælle. */}
        {!ikkeAabnet && (
          <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>
            {valgte.length}/{maks} valgt{locked ? ' · låst' : ''}
          </span>
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
        {/* VED LØFTET, ikke nederst på kortet: ellers lover kortet i ét blik
            og trækker i land i et andet (Spilfører-fund). */}
        {ligaForbehold && (
          <p className="badge badge--yellow" style={{ display: 'block' }} data-testid="pulje-liga-forbehold">
            {ligaForbehold}
          </p>
        )}
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
          Lige nu: <strong>{ligeNuTop.correct} af {konfig.poolSize}</strong> i {sektionsNavn(konfig)}
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
        titel={topTitel(konfig, laast)}
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

      {/* AFSLØRINGEN — kun når tippet er låst. Før deadline ville det være at
          kigge i kortene, og reglen afviser det alligevel. Ved "endnu ikke
          åbnet" må der IKKE forsøges læst: reglen fejler lukket uden deadline,
          og et forsøg ville bare give en fejl at sluge. `locked` er præcis
          "deadline findes og er passeret". */}
      {locked && (
        <PuljeAfsloering
          gameId={gameId} uid={uid} teams={teams} konfig={konfig}
          standings={standings} leagues={leagues} loading={stillingHenter}
          facit={facit} ligeNu={ligeNu}
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
