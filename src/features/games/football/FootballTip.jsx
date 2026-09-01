/**
 * FootballTip — tip-flade for et fodbold-spil (fx Superligaen).
 * Tipper 1X2 pr. kamp i den aktive runde og kan (valgfrit) bruge "Chancen ⚡"
 * på ÉN kamp: sæt point på spil på dit 1X2-valg til elo-lite fair odds.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useGameBets } from '../useGameBets';
import { setBet, setChance } from '../betActions';
import { kvitteringFor } from './chanceKvittering';
import LeagueBets from './LeagueBets';
import GameTabLink from '../GameTabLink';
import MatchElo from './MatchElo';
import { eloFormByTeam } from './eloHistory';
import { playerBank } from '../GameLayout';
import { useVisibleGameStandings } from '../useVisibleGameStandings';
import { rankDelta, ligaRanking } from '../gameStandings';
import { rundePile } from '../rundePoint';
import { rundensVildeste } from './xgRunde';
import { ligaPoint, harRundeVektor, vektorStemmer } from '../../../lib/ligaPoint';
import ClubBadge from '../../../components/ClubBadge';
import CountUp from '../../../components/CountUp';
import { teamsOf, visOf, teamInfo } from './teamInfo';
import { matchBadges } from './badges';
import { formatKickoff, relativeDeadline, formatDateRange } from '../../../lib/daDate';
import { fmtPoints, fmtDec, fmtSignedPoints, fmtHeltal } from '../../../lib/daNum';
import { shareText } from '../../../lib/share';
import {
  groupByRound, activeRound, isLocked, toMillis, matchScore, liveScore,
} from './footballRounds';
import { fraStartRunde, startRundeFor } from '../../../lib/startGate';
import {
  OUTCOME, OUTCOMES, round1, hitPoints, TRAEF_BONUS, COMBI,
  chanceMaxStake, canUseChance, CHANCE, settleChance,
} from '../../../lib/superligaScoring';
// Combi-reglen bor ÉT sted, spejlet med serveren. Fladen regnede den før selv.
import { buildRoundContext, combiBonus } from '../../../lib/pointOpdeling';
// Chance-deltaet udledes ÉT sted — se chanceUdfald.
import { chanceUdfald } from './tipsHistory';

const OUTCOME_LABEL = { [OUTCOME.HOME]: '1', [OUTCOME.DRAW]: 'X', [OUTCOME.AWAY]: '2' };

/** Odds for et udfald på en kamp (frosset på kamp-dokumentet). */
function matchOdds(match, outcome) {
  const o = match?.odds?.[outcome];
  return Number.isFinite(o) ? o : null;
}

/** Klokkeslæt uden dato — "opdateret 20.44". */
function klokken(ms) {
  return new Date(ms).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
}

/**
 * Holdnavnet på kampkortet som indgang til holdsiden.
 *
 * Kortkoden slås op i HOLDLISTEN, ikke i badge-objektet: `badgeFor` udleder
 * en kode af navnet, når holdet mangler `short`, og en udledt kode er ingen
 * URL-nøgle. Findes den ikke, bliver navnet stående som ren tekst — et dødt
 * link er værre end intet link.
 *
 * At navigere herfra er sikkert: et tip gemmes ved klikket (`setBet`), så der
 * står ingen ugemt tilstand på kortet, man kunne miste undervejs.
 */

/**
 * Har kampen en brugbar halvlegsstilling?
 *
 * `typeof === 'number'` og ikke en sandhedsprøve: 0 er et helt normalt
 * halvlegstal, og `m.halvlegHome && ...` ville skjule enhver 0-0-pause —
 * altså netop den stilling, der oftest adskiller sig fra slutresultatet.
 */
function harHalvleg(m) {
  return typeof m?.halvlegHome === 'number' && Number.isFinite(m.halvlegHome)
    && typeof m?.halvlegAway === 'number' && Number.isFinite(m.halvlegAway);
}

function HoldLink({ teams, name, className, children }) {
  const short = teamInfo(teams, name)?.short;
  if (!short) return <span className={className}>{children}</span>;
  return (
    <GameTabLink fane="elo" hold={short} className={className} title={name}>
      {children}
    </GameTabLink>
  );
}

export default function FootballTip({ game, me, matches }) {
  const gameId = game?.id;
  const { betsByMatch } = useGameBets(gameId);
  // Facittet måler dig mod dem du deler liga med — samme kreds som ranglisten.
  // `leagues` kommer med fra samme hook — intet ekstra abonnement. Den bruges
  // til at give facit-blokken ligaens skala, når man kun er i én liga.
  const { standings, leagues } = useVisibleGameStandings(gameId);
  const bank = playerBank(me);
  const nowMs = Date.now();

  // Skjul kampe før spillets STARTRUNDE — så en sæson kan starte midt i.
  // Runder, ikke datoer: en runde kan ligge spredt over en måned, og en
  // dato-gate ville vise dens sene kampe og skjule dens tidlige.
  const startRunde = useMemo(() => startRundeFor(game, matches), [game, matches]);
  const shownMatches = useMemo(() => fraStartRunde(matches, startRunde), [matches, startRunde]);
  const rounds = useMemo(() => groupByRound(shownMatches), [shownMatches]);
  const initialRound = useMemo(() => activeRound(rounds, nowMs), [rounds, nowMs]);

  // Combi-kuponen: rundens kampe i SAMME UGE. En udsat kamp giver 1X2-point og
  // 1X2-point som altid, men står ikke på kuponen — ellers ville bonussen vente
  // på en kamp, der spilles en måned senere.
  //
  // Regnes af det spejlede modul, ikke her. Fladen havde sin egen udgave af
  // reglen, og fem udgaver af "hvad er en runde" er fem steder at rette.
  // Står OVER den tidlige return nedenfor: hooks skal kaldes i samme
  // rækkefølge ved hver gentegning.
  const roundCtx = useMemo(() => buildRoundContext(shownMatches), [shownMatches]);

  // Runden ligger i URL'en, ikke i komponent-tilstand: så kan man dele et link
  // til en bestemt runde, bruge browserens tilbage-knap og bogmærke den.
  // Uden ?runde= vises den aktive runde.
  const [searchParams, setSearchParams] = useSearchParams();
  // NaN > 0 er falsk, så både "abc" og manglende parameter giver den aktive
  // runde. En runde, der ikke findes (fx 99), fanges af opslaget nedenfor —
  // derfor ingen ekstra validering her: den ville være uobserverbar.
  const rundeParam = Number(searchParams.get('runde'));
  const roundNo = rundeParam > 0 ? rundeParam : initialRound;
  const setRoundNo = (r) => {
    const next = new URLSearchParams(searchParams);
    next.set('runde', String(r));
    // replace, ikke push: at bladre mellem runder er filtrering, ikke
    // navigation. Uden den ville seks rundeklik kræve seks tryk på
    // tilbage-knappen for at forlade tip-fladen — før forlod ét tryk siden.
    setSearchParams(next, { replace: true });
  };
  const [busy, setBusy] = useState(null); // matchId der gemmes
  const [error, setError] = useState('');
  const [shareMsg, setShareMsg] = useState('');

  const { current, roundMatches, idx } = useMemo(() => {
    const cur = rounds.find((r) => r.round === roundNo)
      ?? rounds.find((r) => r.round === initialRound)
      ?? rounds[0];
    return {
      current: cur,
      roundMatches: cur?.matches ?? [],
      idx: rounds.findIndex((r) => r.round === cur?.round),
    };
  }, [rounds, roundNo, initialRound]);

  // Hvilken kamp i runden har Chancen aktiv (chanceStake > 0)?
  const chanceMatchId = useMemo(() => {
    for (const m of roundMatches) {
      const b = betsByMatch[m.id];
      if (b && Number(b.chanceStake) > 0) return m.id;
    }
    return null;
  }, [roundMatches, betsByMatch]);

  // Elo-opslaget bygges ÉN gang for hele runden — ikke pr. kampkort. Kilden er
  // de rundevise snapshots, serveren har lagt på spillet; her regnes intet.
  // Spillets egne hold. Bruges både til Elo-opslaget og til kampkortenes
  // badges — før slog badgen altid op i den danske liste, uanset spil.
  const hold = useMemo(() => teamsOf(game), [game]);
  const eloByTeam = useMemo(() => eloFormByTeam(hold, game?.eloHistory), [hold, game?.eloHistory]);

  // Et eget ur til live-visningen.
  //
  // "Opdatering afbrudt" kan kun komme frem, hvis komponenten gentegner. Under
  // en kamp kommer gentegningerne fra pulsen på spil-dokumentet — men stopper
  // synken, stopper pulsen med den, og så ville kortet fryse på "DIREKTE" i
  // præcis det tilfælde, forbeholdet findes for. Uret kører kun, mens der
  // faktisk er en kamp i gang på skærmen.
  //
  // Står OVER den tidlige return nedenfor: hooks skal kaldes i samme
  // rækkefølge ved hver gentegning.
  // En kamp, der står som slut, har intet ur at tælle: både tidsstemplet og
  // forældet-teksten er undertrykt. Uden 'slut'-undtagelsen ville uret køre
  // resten af vinduet — og for evigt på en kamp, der aldrig får facit — og
  // gentegne kortet hvert halve minut uden at noget kunne ændre sig.
  const harLive = roundMatches.some((m) => m.live && m.live.status !== 'slut'
    && (m.result == null || m.result === ''));
  const [liveNu, setLiveNu] = useState(() => Date.now());
  useEffect(() => {
    if (!harLive) return undefined;
    const t = setInterval(() => setLiveNu(Date.now()), 30_000);
    return () => clearInterval(t);
  }, [harLive]);

  if (!rounds.length) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">📅</div>
        <div className="empty-state__title">Kampprogrammet er ikke lagt ind endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>
          Så snart runderne er klar, kan du tippe her.
        </p>
      </div>
    );
  }

  async function pick(match, outcome) {
    if (isLocked(match, nowMs)) return;
    setError('');
    setBusy(match.id);
    // `chanceStake` sendes IKKE med. Den blev før skrevet tilbage ved hvert
    // skift af 1X2, fordi setBet skrev feltet ubetinget og ellers ville have
    // nulstillet chancen. Nu ejer serveren feltet, og `merge: true` lader det
    // stå urørt — så et skift af valget rører ikke længere chancen.
    const res = await setBet({
      uid: me?.uid, gameId, matchId: match.id, pick: outcome,
      leagueIds: me?.leagueIds || [],
    });
    if (!res.ok) setError(res.error);
    setBusy(null);
  }

  // Kuponen for DENNE runde — se buildRoundContext-kaldet ovenfor.
  const rc = roundCtx.rounds[current?.round] || null;
  const iKupon = (m) => !!roundCtx.byMatch[m.id]?.iVindue;
  const kuponKampe = roundMatches.filter(iKupon);
  const udenforKupon = roundMatches.filter((m) => !iKupon(m));
  const kupon = kuponKampe.length;
  const tippetKupon = kuponKampe.filter((m) => betsByMatch[m.id]?.pick).length;

  // Runde-header-data: datospænd, næste deadline, hvor mange kampe tippet.
  //
  // Spændet følger KUPONEN, ikke alle rundens kampe. Med en kamp udsat til
  // september sagde headeren "7. aug. – 3. sep." om en runde, der gøres op den
  // 10. — de udsatte får deres eget spænd i combi-kortet nedenfor.
  const spaend = (liste) => {
    const ms = liste.map((m) => toMillis(m.kickoff)).filter((x) => x != null);
    return ms.length ? [Math.min(...ms), Math.max(...ms)] : [null, null];
  };
  const [rangeFrom, rangeTo] = spaend(kuponKampe.length ? kuponKampe : roundMatches);
  const [udenforFra, udenforTil] = spaend(udenforKupon);
  const upcoming = roundMatches.filter((m) => !isLocked(m, nowMs))
    .map((m) => toMillis(m.kickoff)).filter((x) => x != null);
  const nextDeadline = upcoming.length ? Math.min(...upcoming) : null;
  const deadlineSoon = nextDeadline != null && nextDeadline - nowMs < 2 * 3600 * 1000;
  const tipped = roundMatches.filter((m) => betsByMatch[m.id]?.pick).length;
  const total = roundMatches.length;

  const tippedAllRound = kupon > 0 && tippetKupon === kupon;
  const roundSettled = !!rc && rc.combiCount > 0 && rc.combiSettled === rc.combiCount;
  const roundHits = kuponKampe.filter((m) => m.result && betsByMatch[m.id]?.pick === m.result);
  const roundBonus = combiBonus(
    kuponKampe.filter((m) => betsByMatch[m.id]?.pick)
      .map((m) => ({ matchId: m.id, pick: betsByMatch[m.id].pick })),
    roundCtx,
  );

  // Rundens facit: point tjent i runden (bet-point + combi-bonus) + placering.
  //
  // Nævneren er de SPILLEDE kampe, ikke rundens seks. Facittet falder, når
  // kuponen er afgjort, og "3/6 ramt" om en runde med to udsatte kampe læses
  // som tre fejl — ikke som "tre af fire ramt, to mangler".
  const roundHitsAll = roundMatches.filter((m) => m.result && betsByMatch[m.id]?.pick === m.result);
  const spilledeIRunden = roundMatches.filter((m) => m.result).length;
  const manglerIRunden = total - spilledeIRunden;
  const roundBetPoints = roundMatches.reduce((a, m) => a + (Number(betsByMatch[m.id]?.points) || 0), 0);
  const roundEarned = round1(roundBetPoints + roundBonus);
  // PILEN SKAL HANDLE OM DEN RUNDE, KORTET VISER. Serverens previousRank er et
  // øjebliksbillede, der kun skrives når en rundes KUPON er afgjort, og kun én
  // gang pr. runde — det kan ligge flere runder tilbage. Stillings-fanen
  // regner den nu af runde-vektoren; gjorde denne flade ikke det samme, ville
  // de to sider VISE FORSKELLIGE PILE for samme runde, og delingsteksten
  // nedenfor ville sende den forkerte påstand videre til vennerne.
  //
  // Her bruges kortets EGEN runde (current.round), ikke "seneste runde med
  // point": bladrer man tilbage til en gammel runde, skal pilen handle om
  // netop den.
  //
  // SKALAEN FØLGER STILLINGEN. Der stod før "ingen startrunde — fladen viser
  // hele kredsen, ikke én liga", og for én liga ER hele kredsen den liga.
  // Blokken her viser rang, total og "op til/foran" — og `buildFacitShare`
  // sender "nr. X af N" UD I CHATTEN. Regnede den på spillets skala, mens
  // Stilling-fanen regner på ligaens, ville de to faner sige forskellige tal
  // OG forskellige placeringer om samme spiller i samme sekund — og den
  // forkerte af dem ville forlade appen.
  //
  // Ikke useMemo: dette punkt ligger efter en tidlig returnering, og en hook
  // her ville bryde hook-rækkefølgen. Arbejdet er én sortering over de få
  // spillere, man deler liga med.
  // Samme defensive vagt som i GameStandings: en liga, der ikke lister én
  // selv, må ikke afgøre ens skala — `ligaRanking` ville filtrere én væk, og
  // blokken forsvandt i stedet for at vise spillets tal. Rettet ét sted og
  // glemt i søsteren er præcis den drift, spejlfils-reglen findes imod.
  const enesteLiga = leagues.length === 1
    && (leagues[0]?.memberUids || []).includes(me?.uid)
    ? leagues[0]
    : null;
  const ligaSkala = enesteLiga
    ? ligaRanking(standings, enesteLiga, ligaPoint, harRundeVektor, vektorStemmer)
    : standings;
  // En spiller uden brugbar runde-vektor kan ikke rangeres. Uden filteret
  // stod han med 0 point nederst og talte med i "af N" — et felt, han ikke er
  // placeret i. Er det ÉN SELV, forsvinder blokken (`myRow` bliver undefined),
  // og det er det rigtige: hellere ingen placering end en påstået.
  const rangerbare = ligaSkala.filter((r) => r.klar !== false);
  const raekker = Number.isFinite(current?.round)
    ? rundePile(rangerbare, current.round, enesteLiga?.startRound ?? null, ligaPoint, harRundeVektor)
    : rangerbare;
  const myIdx = raekker.findIndex((r) => r.uid === me?.uid);
  const myRow = myIdx >= 0 ? raekker[myIdx] : null;
  const rivalAbove = myIdx > 0 ? raekker[myIdx - 1] : null;
  const rivalBelow = myIdx >= 0 && myIdx < raekker.length - 1 ? raekker[myIdx + 1] : null;
  const showFacit = roundSettled && tipped > 0;
  // Rundens vildeste kamp. Uafhængig af `showFacit`: den handler om kampene,
  // ikke om hvorvidt DU nåede at tippe dem, og en runde uden tips har lige så
  // meget en vildeste kamp.
  const vildeste = Number.isFinite(current?.round)
    ? rundensVildeste(matches, current.round)
    : null;
  // Bevægelse i DENNE runde (se rundePile ovenfor).
  const myPrev = myRow?.previousRank;
  const myDelta = myRow ? rankDelta(myRow) : null;
  const overtook = (myRow && myPrev != null)
    ? raekker.filter((r) => r.uid !== me?.uid && r.previousRank != null
        && r.previousRank < myPrev && r.rank > myRow.rank).map((r) => r.name)
    : [];
  const overtakenBy = (myRow && myPrev != null)
    ? raekker.filter((r) => r.uid !== me?.uid && r.previousRank != null
        && r.previousRank > myPrev && r.rank < myRow.rank).map((r) => r.name)
    : [];

  function buildFacitShare() {
    // Spillets eget navn — "Superliga R5" i en Premier League-deling ville
    // sende venner til den forkerte liga.
    const parts = [`⚽ ${game?.shortName || game?.name || 'Runde'} R${current?.round}: ${fmtSignedPoints(roundEarned)} point (${roundHitsAll.length}/${spilledeIRunden} ramt)`];
    // 🔗 og ikke ⚡: ⚡ er Chancen overalt i appen (PointOpdeling siger det
    // eksplicit), og delingsteksten stod med begge betydninger på samme linje.
    if (roundBonus > 0) parts.push(`combi +${fmtDec(roundBonus)} 🔗`);
    if (myRow) parts.push(`nr. ${myRow.rank} af ${raekker.length}`);
    if (overtook.length) parts.push(`overhalede ${overtook.slice(0, 2).join(', ')} 🎉`);
    return `${parts.join(' · ')}\ntip.vejleaa.dk`;
  }
  async function onShareFacit() {
    const res = await shareText(buildFacitShare());
    if (res.ok) setShareMsg(res.method === 'copy' ? 'Kopieret — indsæt i chatten!' : 'Delt!');
    else if (res.error) setShareMsg('Kunne ikke dele.');
  }

  return (
    <div>
      {/* Runde-navigation — bladr let frem/tilbage mellem ALLE runder (som
          etaperne i Tour): navngivne pile + en "Runde X af Y"-tæller, så det er
          tydeligt at der er flere runder end den aktuelle. Ved enderne holdes
          en usynlig pladsholder, så tælleren bliver centreret. */}
      <nav
        className="round-nav mb-2"
        data-testid="round-nav"
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}
      >
        {idx > 0 ? (
          <button
            className="btn btn--ghost btn--sm"
            data-testid="round-nav-prev"
            onClick={() => setRoundNo(rounds[idx - 1].round)}
            aria-label={`Forrige runde (runde ${rounds[idx - 1].round})`}
          >
            ← Runde {rounds[idx - 1].round}
          </button>
        ) : (
          <span className="btn btn--ghost btn--sm" aria-hidden="true" style={{ visibility: 'hidden' }}>←</span>
        )}

        <span style={{ fontSize: '0.82rem', color: 'var(--c-muted)', fontWeight: 600, whiteSpace: 'nowrap' }}>
          Runde {idx + 1} af {rounds.length}
        </span>

        {idx < rounds.length - 1 ? (
          <button
            className="btn btn--ghost btn--sm"
            data-testid="round-nav-next"
            onClick={() => setRoundNo(rounds[idx + 1].round)}
            aria-label={`Næste runde (runde ${rounds[idx + 1].round})`}
          >
            Runde {rounds[idx + 1].round} →
          </button>
        ) : (
          <span className="btn btn--ghost btn--sm" aria-hidden="true" style={{ visibility: 'hidden' }}>→</span>
        )}
      </nav>

      {/* Rundens overskrift + datospænd + deadline */}
      <div className="round-head mb-2" style={{ textAlign: 'center' }}>
        <div className="round-head__title">
          {current?.round ? `Runde ${current.round}` : 'Kampe'}
          {rangeFrom && <span className="round-head__meta" style={{ marginLeft: 8, textTransform: 'none', letterSpacing: 0 }}>{formatDateRange(rangeFrom, rangeTo)}</span>}
        </div>
        {nextDeadline != null && (
          <>
            {/* "Næste kamp låser", ikke "Deadline": runden HAR ingen samlet
                deadline — hver kamp låser for sig (reglen står i linjen
                nedenunder), og tælleren her ruller videre til næste ulåste
                kamp, når en kamp går i gang. Ordet "Deadline" fik det til at
                ligne én frist for hele kuponen. */}
            <div className={`round-head__meta ${deadlineSoon ? 'round-head__deadline--soon' : ''}`}>
              Næste kamp låser {relativeDeadline(nextDeadline, new Date(nowMs))}
            </div>
            <div className="round-head__meta" style={{ textTransform: 'none', letterSpacing: 0, opacity: 0.75 }}>
              Hver kamp låser ved sin egen kampstart
            </div>
          </>
        )}
      </div>

      {/* RUNDENS VILDESTE — eget kort, ALDRIG i facit-blokken.
          Facit-blokken bærer "Du er nr. X · N point", og xG må ikke stå i
          samme kort som en placering: et alibi er ufarligt drilleri, lige
          indtil det kan pege på, hvad det kostede dig. Spilførers regel.

          Om en KAMP, ingen navne. Vises kun over det målte gab (se xgRunde.js),
          så det er en begivenhed hver anden runde og ikke fast inventar. */}
      {vildeste && (
        <div className="card mb-2">
          <div className="xgvild">
            <span className="xgvild__titel">🎲 Rundens vildeste</span>
            {' '}
            <span>
              {vildeste.home} {vildeste.homeGoals}–{vildeste.awayGoals} {vildeste.away},
              {' '}mens målchancerne stod {fmtDec(vildeste.xgHome)} – {fmtDec(vildeste.xgAway)}.
            </span>
          </div>
        </div>
      )}

      {/* Rundens facit — vises når hele runden er spillet */}
      {showFacit && (
        <div className="card facit mb-2">
          <div className="facit__top">
            <span className="facit__title">Runde {current?.round} · facit</span>
            <span className="facit__earned">
              <CountUp value={Math.abs(roundEarned)} prefix={roundEarned < 0 ? '−' : '+'}
                decimals={Number.isInteger(roundEarned) ? 0 : 1} />
            </span>
          </div>
          <div className="facit__sub">
            <strong>{roundHitsAll.length}/{spilledeIRunden}</strong> ramt
            {roundBonus > 0 && <> · <span className="facit__combi">combi +{fmtDec(roundBonus)} 🔗</span></>}
            {manglerIRunden > 0 && (
              <> · <span className="facit__mangler">
                {manglerIRunden === 1 ? '1 kamp mangler endnu' : `${manglerIRunden} kampe mangler endnu`}
              </span></>
            )}
          </div>
          {myRow && (
            <div className="facit__pos">
              <div className="facit__rank">
                Du er nr. <strong>{myRow.rank}</strong> af {raekker.length}
                {myDelta != null && myDelta !== 0 && (
                  <span className={myDelta > 0 ? 'facit__up' : 'facit__down'}>
                    {' '}{myDelta > 0 ? `▲${myDelta}` : `▼${-myDelta}`}
                  </span>
                )}
                <span className="facit__total"> · {fmtPoints(myRow.totalPoints)} point</span>
              </div>
              {(overtook.length > 0 || overtakenBy.length > 0) && (
                <div className="facit__moves">
                  {overtook.length > 0 && (
                    <span className="facit__up">⬆ Du overhalede {overtook.slice(0, 3).join(', ')}{overtook.length > 3 ? ` +${overtook.length - 3}` : ''}</span>
                  )}
                  {overtakenBy.length > 0 && (
                    <span className="facit__down">⬇ Overhalet af {overtakenBy.slice(0, 3).join(', ')}{overtakenBy.length > 3 ? ` +${overtakenBy.length - 3}` : ''}</span>
                  )}
                </div>
              )}
              <div className="facit__rivals">
                {rivalAbove
                  ? <span>⬆ {fmtPoints(rivalAbove.totalPoints - myRow.totalPoints)} op til {rivalAbove.name}</span>
                  : <span className="facit__lead">🥇 Du fører!</span>}
                {rivalBelow && (
                  <span>⬇ {fmtPoints(myRow.totalPoints - rivalBelow.totalPoints)} foran {rivalBelow.name}</span>
                )}
              </div>
            </div>
          )}
          <div className="facit__share">
            <button className="btn btn--ghost btn--sm" onClick={onShareFacit}>📣 Del i chatten</button>
            {shareMsg && <span className="facit__sharemsg">{shareMsg}</span>}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2" style={{ gap: '0.5rem' }}>
        <span className={`badge ${tipped >= total && total > 0 ? 'badge--green' : 'badge--yellow'}`}>
          {tipped}/{total} tippet
        </span>
        <span style={{ color: 'var(--c-muted)', fontSize: '0.78rem' }}>
          Point følger oddsene{TRAEF_BONUS > 0 ? `, plus ${TRAEF_BONUS} for hver kamp du rammer` : ''}.
        </span>
      </div>

      {/* Combi-runde-bonus. Kortet vises kun, når der ER en kupon: uden
          rundenummer kender vi ikke runden, og kortet ville sige "Tip alle 0
          kuponkampe" og mærke hver kamp som udsat. */}
      {kupon > 0 && (
      <div className="card mb-2" style={{ borderStyle: 'dashed' }} data-testid="combi-kort">
        <div className="flex items-center justify-between" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 700 }}>🎯 Runde-bonus</span>
          {/* Der er INTET krav om at have tippet hele kuponen. Kortet må derfor
              aldrig sige "for at være med" — man ER med, også med ét tip.
              Mangler der tips, er det en opfordring, ikke en spærring. */}
          {roundSettled ? (
            roundBonus > 0
              ? <span className="badge badge--green">+{fmtDec(roundBonus)} ({roundHits.length}/{kupon} ramt)</span>
              : <span className="badge badge--muted">Ingen ({roundHits.length}/{kupon} ramt)</span>
          ) : (
            <span className="chance-pill">⚡ I spil — {roundHits.length}/{kupon} ramt indtil videre</span>
          )}
        </div>
        <p style={{ color: 'var(--c-muted)', fontSize: '0.78rem', margin: '0.4rem 0 0' }}>
          Oddsene på de kampe, du rammer, ganges sammen. Bonussen er
          {' '}{COMBI.FAKTOR} × kvadratroden af produktet — maks +{COMBI.LOFT}.
          {/* Gulvet SKAL stå her. Uden det siger kortet "hver ramt kamp tæller"
              lige over et "Ingen (1/4 ramt)" — og så er teksten en løgn i
              præcis det øjeblik, spilleren læser den efter. */}
          {' '}Det tæller fra <strong>to rigtige</strong> og opefter. Har du glemt en kamp, tæller
          den bare ikke med — den koster dig ikke bonussen.
        </p>
        {!tippedAllRound && !roundSettled && (
          <p
            className="combi-mangler"
            data-testid="combi-mangler"
            style={{ color: 'var(--c-muted)', fontSize: '0.78rem', margin: '0.4rem 0 0' }}
          >
            Du mangler <strong>{kupon - tippetKupon}</strong> af kuponens {kupon} kampe.
            Hver ekstra kamp, du rammer, ganger bonussen op.
          </p>
        )}
        {udenforKupon.length > 0 && (
          <p
            className="combi-udenfor"
            data-testid="combi-udenfor"
            style={{ color: 'var(--c-muted)', fontSize: '0.78rem', margin: '0.4rem 0 0' }}
          >
            {/* "Uden for rundens uge", ikke "udsat": en kamp kan være programsat
                i næste uge helt legitimt, og så er "udsat" en påstand, vi ikke
                kan bakke op. Det første holder altid. */}
            🕒 {udenforKupon.length === 1 ? 'Én kamp i runden ligger' : `${udenforKupon.length} kampe i runden ligger`}
            {' '}uden for rundens uge ({formatDateRange(udenforFra, udenforTil)}) og står derfor uden for
            kuponen: {udenforKupon.map((m) => `${visOf(hold, m.home)}–${visOf(hold, m.away)}`).join(', ')}.
            {' '}{udenforKupon.length === 1 ? 'Den' : 'De'} giver 1X2-point som altid — men runde-bonussen
            venter ikke på {udenforKupon.length === 1 ? 'den' : 'dem'}, og Chancen følger RUNDEN:
            har du brugt din ⚡ i denne runde, er den brugt, også her.
          </p>
        )}
      </div>
      )}

      {error && <p className="badge badge--red mb-2">{error}</p>}

      {/* Kampe */}
      {roundMatches.map((m) => {
        const bet = betsByMatch[m.id];
        const locked = isLocked(m, nowMs);
        const isChance = m.id === chanceMatchId;
        const { h, a } = matchBadges(hold, m.home, m.away, game?.teamStyles);
        const hit = m.result && bet?.pick ? bet.pick === m.result : null;
        const score = matchScore(m);
        const live = liveScore(m, game?.liveHeartbeatAt, liveNu);
        // Kuponmærket vises KUN, når runden faktisk er splittet. I en normal
        // runde er alle seks kampe med, og seks ens mærker er støj — mærket
        // skal betyde noget, den dag der står ét anderledes.
        // Hvad chancen kostede eller gav på DENNE kamp. null = ingen chance.
        const udfald = chanceUdfald(bet, m);
        const chanceUdfaldVises = udfald?.afregnet ? udfald : null;
        const chanceUikkeAfregnet = !!udfald && !udfald.afregnet;
        const paaKupon = iKupon(m);
        const visMaerke = kupon > 0 && udenforKupon.length > 0;
        return (
          <div
            className={`card match-card mb-2 ${isChance ? 'match-card--chance' : ''}`
              + `${visMaerke && !paaKupon ? ' match-card--udenfor' : ''}`}
            key={m.id}
          >
            <div className="match-card__meta">
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0 }}>
                <span className="match-card__kickoff">{formatKickoff(m.kickoff)}</span>
                {visMaerke && (
                  <span
                    className={`kupon-maerke ${paaKupon ? 'kupon-maerke--med' : 'kupon-maerke--uden'}`}
                    data-testid={paaKupon ? 'kupon-med' : 'kupon-uden'}
                    title={paaKupon
                      ? 'Tæller med i runde-bonussen'
                      : 'Uden for rundens uge — giver point, men tæller ikke i runde-bonussen'}
                  >
                    {paaKupon ? '🎯 På kuponen' : '🕒 Uden for kuponen'}
                  </span>
                )}
              </span>
              <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.5rem', minWidth: 0 }}>
                {h.venue && <span className="match-card__venue">{h.venue}</span>}
                {m.result ? (
                  <>
                    {hit === true ? <span className="badge badge--green">Ramt +{fmtDec(hitPoints(m.result, m.odds))}</span>
                      : hit === false ? <span className="badge badge--red">Ikke ramt</span>
                        : <span className="badge">Spillet</span>}
                    {/* CHANCEN FORSVANDT HELT, når facit kom. Pillen ligger i
                        grenen NEDENFOR `m.result`, så et tab på fire point var
                        usynligt på præcis den skærm, man står på lige efter
                        runden — og rundens facit-kort trak dem fra uden at
                        sige hvor.

                        Tallet står ved siden af "Ramt +3,0", ikke i stedet
                        for: dét er 1X2-point alene, og de to lægges sammen.
                        Erstattede vi det med summen, ville kortet vise ét tal
                        og Mine tips et andet for samme kamp. */}
                    {chanceUdfaldVises && (
                      <span
                        className={`badge ${chanceUdfaldVises.delta < 0 ? 'badge--red' : 'badge--green'}`}
                        /* Tabet udledes af DELTAET, ikke af chanceStake:
                           reglerne validerer ikke feltet, og serveren scorer
                           uden bank-loft, så clampStake klipper ved 8. En
                           forfalsket indsats på 100 ville give mærket −8 og en
                           tekst om 100 point. */
                        title={chanceUdfaldVises.delta < 0
                          ? `Chancen tabt: ${fmtPoints(Math.abs(chanceUdfaldVises.delta))} point`
                          : `Chancen vundet: ${fmtPoints(chanceUdfaldVises.delta)} point oveni`}
                      >
                        ⚡ {fmtSignedPoints(chanceUdfaldVises.delta)}
                      </span>
                    )}
                    {chanceUikkeAfregnet && (
                      /* Teksten bærer sig selv. "ikke afregnet" læses som
                         "vent, den kommer" — og for den ene af de to grunde er
                         det direkte forkert: kampen manglede odds, så den
                         kommer aldrig. En title duer ikke som forklaring; den
                         findes ikke på en telefon. */
                      <span className="badge">
                        {udfald.grund === 'afventer'
                          ? '⚡ afregnes om lidt'
                          : '⚡ ingen odds · hverken vundet eller tabt'}
                      </span>
                    )}
                  </>
                ) : live ? (
                  /* Live har forrang over Chancen-pillen: chance-kampen er
                     netop den, man følger tættest. */
                  <span className={`live-pill ${live.forældet || live.sluttet ? 'live-pill--doed' : ''}`}>
                    {/* Eget tegn til slutfløjt. ⏸ er appens "noget er galt"-look
                        ("Opdatering afbrudt"), og en helt normal afslutning må
                        ikke ligne en fejl — den rammer jo hver eneste kamp. */}
                    {live.sluttet ? '🏁'
                      : live.forældet ? '⏸'
                        : <span className="live-pill__prik" aria-hidden="true" />}
                    {/* `sluttet` går FORREST. Er kampen fløjtet af, er "Slut ·
                        afventer facit" sandt og "Opdatering afbrudt" en løgn —
                        synken fejler jo ikke, den venter bare på resultatet. */}
                    {live.sluttet ? 'Slut · afventer facit'
                      : live.forældet ? 'Opdatering afbrudt'
                        : live.afbrudt ? 'Afbrudt'
                          : live.halvleg ? `DIREKTE · ${live.halvleg}` : 'DIREKTE'}
                  </span>
                ) : isChance ? (
                  // "indsats 4" — IKKE "4 point". Ti pixels nedenunder står
                  // pick-knapperne med et tal og ordet POINT i en helt anden
                  // betydning: dét er udbetalingen ved rigtigt tip. Et kort,
                  // der på én gang sagde "4 point" og "3,90 POINT", inviterer
                  // til netop den forveksling.
                  <span className="chance-pill" title={`Chancen: ${Number(bet?.chanceStake) || 0} point på spil`}>
                    ⚡ Chancen · indsats {Number(bet?.chanceStake) || 0}
                  </span>
                ) : locked ? (
                  <span className="badge badge--muted">Låst</span>
                ) : null}
              </span>
            </div>

            <div className="match-card__lineup">
              <div className="match-card__side">
                <ClubBadge
                  variant="troeje" code={h.code} color={h.color} size={34}
                  color2={h.color2} moenster={h.moenster} aerme={h.aerme}
                  title={m.home}
                />
                {/* KUN NAVNET. Kortet viste før kortkoden på smal skærm, men
                    spillerne ved ikke, hvad forkortelserne betyder — "SJF" og
                    "VFF" er ikke almenviden, og de fleste tipper fra telefonen.
                    Navnet ombrydes i stedet; kortet har højde nok. */}
                <HoldLink teams={hold} name={m.home} className="match-card__side-name">
                  {h.navn}
                </HoldLink>
              </div>
              {/* Stregen mellem holdene er pladsen, hvor scoren hører hjemme.
                  Uden den kunne kortet på én gang sige "Ramt +6,0" og vise en
                  tom streg — vi vidste altså godt, hvordan det gik.
                  Skærmlæsere får et helt udsagn: tankestregen mellem to tal
                  oplæses uforudsigeligt. */}
              {score ? (
                <div
                  className="match-card__score"
                  aria-label={`Slutresultat: ${m.home} ${score.home}, ${m.away} ${score.away}.`
                    + `${harHalvleg(m) ? ` Ved pausen stod den ${m.halvlegHome}-${m.halvlegAway}.` : ''}`}
                >
                  <span aria-hidden="true">{score.home} – {score.away}</span>
                  {/* HALVLEGSSTILLINGEN er ikke et nyt tal på kortet — den er
                      en kvalifikator på et tal, der allerede står der, og
                      koster derfor ingen ny blok. Det er også den stærkeste af
                      de tre nye datatyper: spillet er 1X2, så "2-1 (1-1)"
                      betyder, at alle der tippede X havde ret i 45 minutter.
                      Målt skifter udfaldet fra pausen til slutfløjt i 48 % af
                      kampene (scripts/maal-livescore-detaljer.mjs).

                      EGEN KLASSE og ikke match-card__score: den klasse tælles
                      i FootballTip.test.jsx, og tripwiren dér skal blive ved
                      med at betyde "der er ét slutresultat på kortet".

                      "Ved pausen" og ikke "Pause": footballRounds.js bruger
                      allerede "Pause" om en kamp, der holder pause LIGE NU. */}
                  {harHalvleg(m) && (
                    <span className="match-card__halvleg" aria-hidden="true">
                      ved pausen {m.halvlegHome}–{m.halvlegAway}
                    </span>
                  )}
                </div>
              ) : live ? (
                /* Tre uafhængige kanaler skiller en LEVENDE stilling fra en
                   endelig: pillen øverst, teksten her under tallet, og
                   oplæsningen. Kun farve ville ikke være nok — på en telefon
                   står pillen og tallet langt fra hinanden, og det er dér,
                   forvekslingen sker. */
                <div
                  className={`match-card__score match-card__score--live ${live.forældet || live.sluttet ? 'match-card__score--doed' : ''}`}
                  aria-label={`${live.sluttet ? 'Stillingen ved slutfløjt' : 'Stillingen lige nu'}:`
                    + ` ${m.home} ${live.home}, ${m.away} ${live.away}.`
                    + ` ${live.sluttet ? 'Kampen er slut, det officielle resultat er ikke nået frem endnu.'
                      : live.afbrudt ? 'Kampen er afbrudt.' : live.halvleg ? `Kampen er i gang, ${live.halvleg}.` : 'Kampen er i gang.'}`
                    // Tidsstemplet hører til opdateringen, ikke til slutfløjtet.
                    // På en sluttet kamp er "Opdateret 19.52" misvisende: tallet
                    // står nu stille, fordi kampen er forbi, ikke fordi vi kigger.
                    + `${live.sluttet ? '' : ` ${live.forældet ? 'Opdateringen er afbrudt' : 'Opdateret'}`
                      + `${live.setAt ? ` ${klokken(live.setAt)}` : ''}.`}`}
                >
                  <span aria-hidden="true">{live.home} – {live.away}</span>
                  <span className="match-card__score-note" aria-hidden="true">
                    {live.sluttet ? 'ved slutfløjt'
                      : `${live.forældet ? 'sidst ' : ''}${live.setAt ? klokken(live.setAt) : 'lige nu'}`}
                  </span>
                </div>
              ) : (
                <div className="match-card__dash" aria-hidden="true">–</div>
              )}
              {/* SPEJLVENDT — se `.match-card__side--ude`. Trøjen står yderst
                  til højre, så de to hold flugter med kortets to kanter i
                  stedet for at klumpe sig om stregen i midten. */}
              <div className="match-card__side match-card__side--ude">
                <ClubBadge
                  variant="troeje" code={a.code} color={a.color} size={34}
                  color2={a.color2} moenster={a.moenster} aerme={a.aerme}
                  title={m.away}
                />
                {/* KUN NAVNET. Kortet viste før kortkoden på smal skærm, men
                    spillerne ved ikke, hvad forkortelserne betyder — "SJF" og
                    "VFF" er ikke almenviden, og de fleste tipper fra telefonen.
                    Navnet ombrydes i stedet; kortet har højde nok. */}
                <HoldLink teams={hold} name={m.away} className="match-card__side-name">
                  {a.navn}
                </HoldLink>
              </div>
            </div>

            {/* MÅLCHANCER (xG) — HVAD DER SKETE, ikke hvem der burde have vundet.
                Står OVER MatchElo og under scoren med vilje. MatchElo er
                PROSPEKTIV og bærer selv sætningen "ikke et bud på denne kamp"
                (MatchElo.jsx:93); et retrospektivt tal klistret ind i samme
                stiplede zone inviterer til præcis den sammenblanding. xG hører
                til dét, den beskriver: resultatet.

                EGEN BLOK, ikke et badge i meta-rækken: den række er en
                inline-flex UDEN wrap, så et fjerde element klipper venue-
                teksten i stedet for at ombryde. Her vokser linjen nedad.

                Vagten er `typeof === 'number'`, ikke fmtDec: fmtDec gør
                `Number(n) || 0`, så en manglende værdi ville blive til "0,0"
                — præcis det tal, der aldrig må vises for "ved ikke".

                Ingen dom pr. kamp. Målingen (scripts/maal-xg.mjs) viser, at xG
                peger den modsatte vej i 13 af 37 afgjorte kampe. Ord som
                "burde", "fortjent", "heldig", "tyveri" hører ingen steder. */}
            {m.result && typeof m.xgHome === 'number' && Number.isFinite(m.xgHome)
              && typeof m.xgAway === 'number' && Number.isFinite(m.xgAway) && (
              <div className="match-card__xg">
                <span className="match-card__xg-label">xG (målchancer)</span>
                {' '}{h.navn} <strong>{fmtDec(m.xgHome)}</strong>
                {' – '}<strong>{fmtDec(m.xgAway)}</strong> {a.navn}
              </div>
            )}

            {/* MÅLSCORERE. ÉN ombrydende linje, ikke en liste — og i EGEN
                blok, aldrig i meta-rækken: den er inline-flex UDEN wrap og
                klipper venue-teksten, hvis den får et element mere
                (tipPil.test.jsx vogter netop dét).

                RÅ FRA KILDEN ER LISTEN KORREKT OG KEDELIG — Spilførers dom, og
                den samme, de to første xG-flader fik: en linje om Dreyer
                handler om Dreyer, og ingen i vennekredsen er Dreyer. Det, der
                skaber snak, er MINUTTALLET, og derfor står det først.

                INGEN DOM OM ET MENNESKE. Kortet siger, hvad der skete. Det må
                ALDRIG udregne "din X holdt til det 94" for en spiller: det
                ville både pege på en person og opfinde et skyggepoint-system,
                spillet ikke udbetaler. Vennerne siger det selv; ammunitionen
                er husets, skuddet er deres.

                TILSKUERTALLET hænger på samme blok som en fin-linje frem for
                at få sin egen: kortet bærer i forvejen kickoff, kupon-mærke,
                venue, ramt/ikke-ramt, Chancen, live-badges, score, holdnavne,
                xG, Elo og pick-grid. Stadion og dommer er skåret helt —
                stadion vises allerede som `h.venue` ovenfor, og dommeren er en
                klage-magnet uden tipværdi.

                Gatet på FELTERNE og ikke på evnen: en netop afsluttet kamp
                mangler dem, til sweep'et har kørt. Samme skel som xG-tallet. */}
            {m.result && Array.isArray(m.maal) && m.maal.length > 0 && (
              <div className="match-card__maal">
                <span className="match-card__maal-label">Mål</span>
                {' '}
                {m.maal.map((g, i) => (
                  <span key={`${g.hold}-${g.minut}-${i}`} className="match-card__maal-post">
                    {i > 0 && <span aria-hidden="true"> · </span>}
                    <strong>{g.minut}′</strong>
                    {' '}{g.scorer || 'ukendt'}
                    {' '}<span className="match-card__maal-hold">
                      ({g.hold === 'home' ? h.navn : a.navn})
                    </span>
                    {g.oplaeg && <span className="match-card__maal-oplaeg"> opl. {g.oplaeg}</span>}
                  </span>
                ))}
                {typeof m.tilskuere === 'number' && Number.isFinite(m.tilskuere) && (
                  <span className="match-card__tilskuere">
                    {fmtHeltal(m.tilskuere)} tilskuere
                  </span>
                )}
              </div>
            )}

            <MatchElo home={m.home} away={m.away} eloByTeam={eloByTeam} />

            <div className="pick-grid">
              {OUTCOMES.map((o) => {
                const selected = bet?.pick === o;
                // Når scoren står ovenover, skal kortet også svare på HVILKEN
                // knap der så var den rigtige. LeagueBets farver allerede den
                // vindende udfaldsgruppe; her manglede det samme.
                const won = m.result === o;
                const odds = matchOdds(m, o);
                // Tallet på knappen SKAL være det, man faktisk får — altså
                // oddsene plus træf-bonussen. Stod oddsene alene, ville kortet
                // love 3,1 og udbetale 4,1.
                const pts = odds ? hitPoints(o, m.odds) : null;
                return (
                  <button
                    key={o}
                    className={`pick ${selected ? 'pick--selected' : ''} ${won ? 'pick--won' : ''}`}
                    disabled={locked || busy === m.id}
                    onClick={() => pick(m, o)}
                    title={won
                      ? `${OUTCOME_LABEL[o]} blev udfaldet`
                      : pts != null
                        ? `${fmtDec(pts)} point hvis rigtigt${TRAEF_BONUS > 0 ? ` (odds ${fmtDec(round1(odds))} + ${TRAEF_BONUS} for at ramme)` : ` (kampens odds ${fmtDec(round1(odds))})`}`
                        : 'Odds mangler endnu'}
                  >
                    <span className="pick__label">{OUTCOME_LABEL[o]}</span>
                    <span className="pick__odds">{pts != null ? fmtDec(pts) : '—'}</span>
                    <span className="pick__pts">point</span>
                  </button>
                );
              })}
            </div>

            {/* Efter kickoff: hvad tippede de andre i mine ligaer? */}
            {locked && (
              <LeagueBets
                gameId={gameId}
                match={m}
                myUid={me?.uid}
                leagueIds={me?.leagueIds || []}
              />
            )}
          </div>
        );
      })}

      {/* Chancen */}
      <ChancePanel
        gameId={gameId}
        me={me}
        bank={bank}
        roundMatches={roundMatches}
        betsByMatch={betsByMatch}
        chanceMatchId={chanceMatchId}
        nowMs={nowMs}
        teams={hold}
      />
    </div>
  );
}

/** Chancen ⚡: sæt point på spil på ét 1X2-valg i runden. */
function ChancePanel({
  gameId, me, bank, roundMatches, betsByMatch, chanceMatchId, nowMs, teams = null,
}) {
  const maxStake = chanceMaxStake(bank);
  const usable = canUseChance(bank);

  // Kampe man kan chance på: dem man har tippet, og som ikke er låst.
  const options = roundMatches.filter((m) => betsByMatch[m.id]?.pick && !isLocked(m, nowMs));
  const alleLaast = roundMatches.length > 0 && roundMatches.every((m) => isLocked(m, nowMs));
  // RUNDENS AKTIVE CHANCE — sandheden, uafhængigt af hvad der er valgt i
  // dropdownen, og uafhængigt af om kampen er låst. chanceMatchId filtrerer
  // ikke på lås, så den bærer hele runden igennem; `options` gør ikke.
  const activeBet = chanceMatchId ? betsByMatch[chanceMatchId] : null;
  const gemtIndsats = Number(activeBet?.chanceStake) || 0;
  const chanceMatch = chanceMatchId ? roundMatches.find((m) => m.id === chanceMatchId) : null;

  // ER RUNDENS CHANCE LÅST FAST? Så er den brugt, og der er intet at vælge.
  //
  // Uden denne gate stod panelet med en dropdown, der pegede på en ANDEN,
  // åben kamp, og en knap, der sagde "Aktivér Chancen". Et klik nulstillede
  // først den låste kamp — hvilket reglerne afviser — og skrev derefter den
  // nye. Resultatet var TO bets med chanceStake > 0 i samme runde, som
  // serveren afregner hver for sig; den har ingen dedup pr. runde. Og
  // ⚡-pillen blev siddende på den første kamp, så den anden var usynlig.
  // "Fjern" var død på samme måde: to kald, begge uden virkning, ingen besked.
  const chanceLaast = Boolean(chanceMatch) && isLocked(chanceMatch, nowMs);
  const [selMatchId, setSelMatchId] = useState(chanceMatchId || options[0]?.id || '');
  // CHANCE.MIN og intet andet: effekten nedenfor sætter den gemte værdi i
  // samme flush, også når chance-kampen er låst. Læste initialiseringen ALTSÅ
  // også gemtIndsats, ville der stå to vagter om samme regel, og den ene kunne
  // fjernes med grøn suite.
  const [stake, setStake] = useState(CHANCE.MIN);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Kvitteringen står ved siden af fejlen, ikke i stedet for: efter et fejlet
  // forsøg skal spilleren stadig kunne se, hvor chancen FAKTISK ligger.
  const [kvittering, setKvittering] = useState('');

  // selMatchId sættes ÉN gang, når panelet monteres. Har man ikke tippet noget
  // endnu — eller er runden ikke hentet fra Firestore endnu — er `options` tom,
  // og state bliver ''. Tipper man så sin første kamp, mens panelet står åbent,
  // fyldes listen, men state følger ikke med.
  //
  // <select> med en value, der ikke matcher nogen option, viser den FØRSTE
  // kamp alligevel. Så ser det ud, som om der er valgt en kamp, mens opslaget
  // nedenfor ikke finder nogen: boksen påstod "Odds er ikke lagt ind på kampen
  // endnu" — selv om oddsene stod på knapperne lige ovenover — og knappen var
  // død, fordi `pick` også blev undefined. Man kunne altså slet ikke sætte
  // Chancen.
  //
  // Fallbacken peger stadig på chance-kampen. Den ENESTE måde, den kan ligge
  // uden for `options`, er ved at være låst — en åben, tippet kamp er altid
  // med — og den tilstand fanges af `chanceLaast` ovenfor, hvor hverken
  // dropdown eller knapper vises. En ekstra lås-kontrol her ville være en
  // anden vagt om samme regel, og den kunne fjernes uden at noget blev rødt.
  useEffect(() => {
    if (options.some((m) => m.id === selMatchId)) return;
    setSelMatchId(chanceMatchId || options[0]?.id || '');
  }, [options, selMatchId, chanceMatchId]);

  // Tips hentes asynkront, og fladen venter kun på KAMPENE (se den tidlige
  // return på !rounds.length). Panelet monteres derfor med betsByMatch = {},
  // stake bliver CHANCE.MIN — og uden denne effekt stod tælleren på 1, uanset
  // hvad der var gemt. Så viste "Rammer du"-linjen tallene for et væddemål,
  // man ikke havde indgået, og "Opdatér Chancen" skrev 1 oven i en indsats
  // på 4.
  //
  // Kun OPAD fra en gemt indsats: en nulstilling til MIN ville betyde, at man
  // ikke kunne flytte sin chance til en anden kamp uden samtidig at sætte den
  // ned. Og depen er TALLET, ikke bettet — betsByMatch[id] er et nyt objekt
  // ved hvert snapshot, så med objektet i deps ville en ugemt ændring blive
  // nulstillet, hver gang serveren rørte dokumentet.
  const gemtForValgt = Number(betsByMatch[selMatchId]?.chanceStake) || 0;
  useEffect(() => {
    if (gemtForValgt > 0) setStake(gemtForValgt);
  }, [selMatchId, gemtForValgt]);

  const selMatch = roundMatches.find((m) => m.id === selMatchId);
  const selBet = selMatch ? betsByMatch[selMatch.id] : null;
  const pick = selBet?.pick;
  const odds = pick && Number.isFinite(selMatch?.odds?.[pick]) ? selMatch.odds[pick] : null;
  const clampedStake = Math.max(CHANCE.MIN, Math.min(maxStake, Number(stake) || 0));
  const win = odds ? settleChance({ correct: true, stake: clampedStake, fairOdds: odds }).delta : null;

  // DEN GEMTE INDSATS. Står over ALLE panelets forgreninger, fordi der er tre
  // helt almindelige tilstande, hvor tallet ellers er usynligt, mens der er
  // point i spil: hele runden låst (så `options` er tom, og panelet skrev
  // "Tip mindst én kamp i runden først" — usandt, når man har 4 point på
  // spil), chance-kampen i gang eller spillet (live-pillen og "Ramt" fortrænger
  // ⚡-pillen på kortet), og en saldo, der er faldet under grænsen for at
  // BRUGE Chancen, uden at den aktive chance forsvinder.
  //
  // Læser den RÅ gemte værdi — ikke clampedStake. maxStake følger den levende
  // saldo, så et point tabt fredag kan sænke loftet fra 8 til 7, mens der
  // stadig ligger 8 gemt på søndagskampen. Klampede linjen, ville den vise 7
  // og dermed lyve om præcis det tal, den findes for at vise.
  //
  // "På spil nu" — ikke "Gemt indsats". Appens faste vending for netop dette
  // tal er "point på spil" (panelets egen intro, LeagueBets, PointOpdeling),
  // og "Gemt" bruges overalt ellers som kvittering for en handling ("Gemt ✓").
  // Værst: etiketten "Indsats:" står ti pixels nedenunder med et ANDET tal i
  // tre af tilstandene — to næsten enslydende navne på to forskellige begreber
  // er præcis den forveksling, ⚡-pillen blev omskrevet for at undgå.
  const gemtLinje = gemtIndsats > 0 && chanceMatch ? (
    <p style={{ margin: '0 0 0.5rem', fontSize: '0.9rem' }}>
      På spil nu: <strong>{gemtIndsats} point</strong> på {visOf(teams, chanceMatch.home)}–{visOf(teams, chanceMatch.away)}
      {activeBet?.pick ? ` (${OUTCOME_LABEL[activeBet.pick]})` : ''}
    </p>
  ) : null;

  if (!usable) {
    return (
      <div className="card">
        <h3 className="card__title">Chancen ⚡</h3>
        {gemtLinje}
        <p style={{ color: 'var(--c-muted)', marginBottom: 0 }}>
          {/* Uden denne sætning stod der "På spil nu: 4 point" umiddelbart
              efterfulgt af "Du kan bruge Chancen, når du har mindst 7" — og så
              er det uklart, om de 4 point stadig gælder. Det gør de. */}
          {gemtIndsats > 0 && 'Din aktive chance afregnes som normalt. '}
          Du kan sætte en NY chance, når du har mindst {Math.ceil(CHANCE.MIN / CHANCE.CAP_FRACTION)} point.
          Sæt point på spil på ét tip: rammer du, ganges indsatsen med oddsene — ellers mister du kun indsatsen.
        </p>
      </div>
    );
  }

  async function save(newStake) {
    if (!selMatch || !pick) { setError('Vælg først 1, X eller 2 på kampen.'); return; }
    setError('');
    setKvittering('');
    setBusy(true);

    // TRIN 1 — gem 1X2-valget. Den ser overflødig ud, for panelet viser kun
    // kampe, der ALLEREDE har et valg (`options` ovenfor kræver det), og den
    // skriver typisk samme værdi igen.
    //
    // Den er ikke overflødig, og grunden er værd at kende: Firestore viser en
    // lokal skrivning i `onSnapshot` FØR serveren har den (latency
    // compensation). Klikker spilleren 1X2 og straks derefter "Aktivér
    // Chancen", ser fladen et valg, som serveren endnu ikke kan se — og
    // callable'en ville afvise med `intet-tip`, altså "Vælg 1, X eller 2
    // først" på en kamp, hvor valget står tydeligt på skærmen. Den awaitede
    // skrivning her lukker det kapløb. Fjern den ikke som en forenkling.
    const gemtValg = await setBet({
      uid: me?.uid, gameId, matchId: selMatch.id, pick, leagueIds: me?.leagueIds || [],
    });
    if (!gemtValg.ok) {
      // Beskeden skal matche den knap, der blev trykket på. "Tippet kunne ikke
      // gemmes" efter et tryk på "Aktivér Chancen" lader spilleren i tvivl om,
      // hvad der så skete med chancen.
      setError(`${gemtValg.error || 'Kunne ikke gemme dit 1X2-valg.'} Chancen blev ikke sat.`);
      setBusy(false);
      return;
    }

    // TRIN 2 — serveren sætter chancen. Den flytter selv en åben chance i
    // samme runde, i én transaktion. Klienten nulstiller ikke længere selv:
    // den to-trins nulstilning kunne slå fejl halvvejs og efterlade to åbne
    // chancer i runden — præcis det hul, hele denne ændring lukker.
    const res = await setChance({ gameId, matchId: selMatch.id, stake: newStake });
    if (!res.ok) {
      setError(res.error);
    } else {
      // KVITTERINGEN ER IKKE PYNT. Før skrev klienten selv, og ⚡-pillen kom
      // med det samme fra den lokale skrivning. Nu er der en rundtur, og uden
      // et ord tilbage står fladen tilsyneladende uændret — hvorefter
      // spilleren trykker igen. `uaendret` skal derfor også kvittere: "der
      // skete ingenting" er et svar, ikke en fejl.
      // Opslaget oversætter callable'ens bet-id'er ("uid_matchId") til
      // kampnavne. Det er dét, der gør "flyttet fra Brøndby–FCK" muligt —
      // og dermed fjerner den dyreste misforståelse i hele mekanikken.
      setKvittering(kvitteringFor(res, (betId) => {
        const m = roundMatches.find((k) => betId.endsWith(`_${k.id}`));
        return m ? `${visOf(teams, m.home)}–${visOf(teams, m.away)}` : null;
      }));
    }
    setBusy(false);
  }

  return (
    <div className="card">
      <h3 className="card__title">Chancen ⚡</h3>
      <p style={{ color: 'var(--c-muted)', marginTop: 0 }}>
        Sæt point på spil på ét af dine tips i runden. Rammer du, ganges indsatsen
        med kampens odds. Rammer du ikke, mister du kun indsatsen (du kan aldrig gå i minus).
      </p>

      {gemtLinje}

      {chanceLaast ? (
        // Rundens chance er brugt og kan ikke flyttes. Vis kendsgerningen i
        // stedet for et valg, der ikke findes.
        <p className="badge badge--muted">
          Chancen er brugt i denne runde — kampen er låst, så den kan hverken
          flyttes eller fjernes.
        </p>
      ) : options.length === 0 ? (
        // To vidt forskellige grunde til, at der ikke er noget at vælge —
        // og den ene tekst dækkede begge. "Tip mindst én kamp i runden
        // først" er forkert, når runden er låst: så HAR man tippet, og man
        // kan under ingen omstændigheder gøre det, sætningen beder om.
        <p className="badge badge--muted">
          {alleLaast
            ? 'Runden er låst — Chancen kan ikke ændres nu.'
            : 'Tip mindst én kamp i runden først.'}
        </p>
      ) : (
        <>
          <label style={{ display: 'block', marginBottom: '0.5rem' }}>
            Kamp:
            <select
              value={selMatchId}
              onChange={(e) => { setSelMatchId(e.target.value); }}
              style={{ marginLeft: '0.5rem' }}
            >
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {visOf(teams, m.home)}–{visOf(teams, m.away)} (dit valg: {OUTCOME_LABEL[betsByMatch[m.id].pick]})
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center" style={{ gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span>Indsats:</span>
            <button className="btn btn--ghost btn--sm" disabled={clampedStake <= CHANCE.MIN}
              onClick={() => setStake(Math.max(CHANCE.MIN, clampedStake - 1))}>−</button>
            <strong style={{ minWidth: 28, textAlign: 'center' }}>{clampedStake}</strong>
            <button className="btn btn--ghost btn--sm" disabled={clampedStake >= maxStake}
              onClick={() => setStake(Math.min(maxStake, clampedStake + 1))}>+</button>
            <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>af maks {maxStake}</span>
          </div>

          <p style={{ margin: '0.25rem 0' }}>
            {odds ? (
              <>Rammer du: <strong style={{ color: 'var(--c-pitch)' }}>+{win}</strong>
                {'  '}· Rammer du ikke: <strong style={{ color: 'var(--c-err)' }}>−{clampedStake}</strong>
                {'  '}<span style={{ color: 'var(--c-muted)' }}>(odds {fmtDec(odds, 2)})</span></>
            ) : (
              <span style={{ color: 'var(--c-muted)' }}>Odds er ikke lagt ind på kampen endnu.</span>
            )}
          </p>

          {/* Loftet følger den LEVENDE saldo, så et tabt point kan sænke maks
              under det, der allerede er gemt. Så står "På spil nu: 8 point"
              over en tæller, der viser 3 — og et klik ville sætte de 8 ned til
              3. Sig det, i stedet for at lade de to tal modsige hinanden. */}
          {chanceMatchId === selMatchId && gemtIndsats > clampedStake && (
            <p className="badge badge--muted" style={{ marginTop: '0.25rem' }}>
              Dit maksimum er nu {maxStake}. Opdaterer du, sættes indsatsen ned
              fra {gemtIndsats} til {clampedStake}.
            </p>
          )}

          {/* FEJL OG KVITTERING STÅR SAMMEN, ikke i stedet for hinanden.
              Værste udfald i hele mekanikken er, at spilleren tror chancen
              ligger på søndagskampen og opdager søndag aften, at den lå på
              fredagskampen. `gemtLinje` ovenfor siger, hvor den FAKTISK
              ligger, og den må ikke forsvinde, fordi noget gik galt. */}
          {error && <p className="badge badge--red">{error}</p>}
          {kvittering && <p className="badge badge--green">{kvittering}</p>}

          <div className="flex items-center" style={{ gap: '0.5rem', marginTop: '0.5rem' }}>
            <button className="btn btn--sm" disabled={busy || !pick} onClick={() => save(clampedStake)}>
              {/* "Flyt Chancen hertil" siger med to ord dét, intet før sagde:
                  at et klik FJERNER chancen fra den anden kamp. Statuslinjen
                  gør nu den anden kamp nærværende, så tavsheden ville stikke
                  endnu mere i øjnene. */}
              {chanceMatchId === selMatchId ? 'Opdatér Chancen'
                : chanceMatchId ? 'Flyt Chancen hertil' : 'Aktivér Chancen'}
            </button>
            {chanceMatchId && (
              <button className="btn btn--ghost btn--sm" disabled={busy}
                onClick={() => save(0)}>Fjern</button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
