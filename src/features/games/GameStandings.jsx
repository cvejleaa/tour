/**
 * GameStandings — rangliste for ét spil. Viser placering, spiller (avatar +
 * navn) og point, med en lille pil for placerings-ændring. Fremhæver den
 * indloggede spiller.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import Avatar from '../../components/Avatar';
import { useAuth } from '../../context/AuthContext';
import { useVisibleGameStandings } from './useVisibleGameStandings';
import { rankDelta, ligaRanking } from './gameStandings';
import {
  sidsteRunde, rundensPoint, rundeFoerende, rundePile, rundeRanking,
} from './rundePoint';
import { faerdigeRunder } from './rundeSejre';
import {
  ligaPoint, harRundeVektor, puljenTaeller, vektorStemmer,
} from '../../lib/ligaPoint';
import { GAME_TYPE } from '../../lib/constants';
import GameTabLink from './GameTabLink';
import { formatPoints } from './GameLayout';
import { fmtSignedPoints } from '../../lib/daNum';
import { RUBRIKKER, opdelingsAfvigelse, afvigelsesTekst } from './football/PointOpdeling';
import SpillerDetalje from './football/SpillerDetalje';
import Pokaler from './Pokaler';
import { useKlubFarver } from './football/useKlubFarver';

// Værdien for "vis alle mine ligaer samlet". Tom streng ville kollidere med
// et manglende valg.
const ALLE = '__alle__';

/**
 * Rundens point for ÉN spiller, med 🔥 hvis han fører runden.
 *
 * SYMBOLET VÆLGES HER OG KUN HER. Regnelaget hedder `rundeFoerende` efter
 * betydningen, ikke efter tegnet, så et skift af glyf ikke efterlader
 * kroner i en kode uden kroner (opgave #36 er den drift, sat i system).
 *
 * 🔥 og ikke 👑, fordi pokalen "👑 Rundekongen" står lige over podiet og
 * betyder noget ANDET: flest HELE runder vundet over sæsonen, afgjort først
 * når hver kamp har facit. To identiske symboler med hver sin betydning på
 * samme skærm var Quality Controls fund; ilden skiller dem, så teksten ikke
 * skal bære forskellen alene.
 *
 * ÉN komponent, fordi tallet står to steder — i listen og på podiet — og de
 * to skal sige det samme. Skrev man dem hver for sig, ville den ene få
 * kronen og den anden ikke, første gang reglen ændrede sig.
 *
 * `–` BETYDER "INGEN AFGJORTE TIPS I RUNDEN ENDNU". Serveren skriver rundens
 * nøgle, så snart ét tip er afgjort — også med 0, når alt ramte forbi
 * (functions-platform/pointOpdeling.js, laegTil). Ingen nøgle betyder derfor
 * ikke "deltog ikke", men "intet facit på dine tips endnu": den, der tippede
 * en kommende runde, og den, der aldrig tippede, får samme streg — før kickoff
 * må de to ikke kunne skelnes. Et forbier står som 0 (rundeTal).
 *
 * INGEN FARVE PÅ ET LAVT TAL. Farve er en dom, cifre er en kendsgerning.
 * Rødt på bunden ville gøre en ugentlig aflæsning til en kæp — se den samme
 * grænse i Pokaler.jsx og LeagueBets.jsx: et navn fremhæves KUN for at have
 * haft ret.
 */
/**
 * Rundens tal som tekst: «+12,3», «−6,4» — og «0» for nul. Ikke fmtSignedPoints
 * direkte: den giver «+0» (også for −0 fra serverens afrunding), og et fortegn
 * på nul betyder ingenting. ÉN helper for de tre steder, tallet står (cellen i
 * Samlet, det store tal og podiet i rundevisningen), så de ikke driver.
 */
function rundeTal(p) {
  return p === 0 ? '0' : fmtSignedPoints(p);
}

/**
 * Stregen for «ingen afgjorte tips i runden endnu». 0 er IKKE en streg:
 * serveren skriver nøglen med 0, når et tip er afgjort og ramte forbi. Titlen
 * siger hvorfor — undtagen ved klar:false, hvor det ikke er sandt (hun kan have
 * et tal, som er afvist): dér forklarer badget «ikke klar» i samme celle.
 */
function IngenRundePoint({ r }) {
  return (
    <span title={r?.klar === false ? undefined : 'Ingen afgjorte tips i runden endnu'} style={{ color: 'var(--c-muted)' }}>–</span>
  );
}

function RundeCelle({ r, runde, foerende }) {
  const p = rundensPoint(r, runde);
  if (p == null) return <IngenRundePoint r={r} />;
  const foerer = foerende.has(r.uid);
  return (
    <span title={foerer ? 'Flest point i runden indtil videre' : undefined}>
      {foerer && <span aria-label="Flest point i runden">🔥</span>}
      {foerer ? ' ' : ''}
      {rundeTal(p)}
    </span>
  );
}

/**
 * Navnet som knap. ÉT sted, fordi navne står tre steder — på podiet, i listen
 * og i opdelingstabellen — og alle tre skal åbne det samme panel. Var podiet
 * ikke klikbart, kunne man ikke åbne detaljen på nummer ét: præcis den
 * spiller, man vil kigge efter i sømmene.
 *
 * Navnet er klikbart, fordi rækken KOM fra en liga-filtreret kilde:
 * useVisibleGameStandings viser kun folk, man deler liga med (plus sig selv),
 * og det er nøjagtig samme afgrænsning som reglen på detalje-dokumentet.
 * Vises navne et andet sted uden den garanti, må de ikke gøres klikbare — så
 * ville linket åbne et panel med en tilladelses-fejl.
 */
function SpillerNavn({ r, aaben, onToggle, className = 'link-btn' }) {
  return (
    <button type="button" className={className} onClick={() => onToggle(r.uid)} aria-expanded={aaben}>
      {r.name}
    </button>
  );
}

/**
 * Opdelingen for hele feltet. Kolonnerne bygges af SAMME RUBRIKKER-liste som
 * kort-visningen — ét sted at ændre rækkefølge og ord. Ellers hedder det
 * "Chancen" det ene sted og noget andet det andet om et halvt år.
 */
function OpdelingsTabel({ rows, meUid, aabenUid, onToggle }) {
  const harNogen = rows.some((r) => r.opdeling);
  // Afvigelserne regnes med SAMME funktion som kortet, så noten siger det
  // samme begge steder. I en tabel med 22 rækker kan sætningen ikke stå ved
  // hver række — derfor en stjerne på totalen og forklaringen under tabellen.
  // MOD SPILLETS TOTAL, ikke ligaens. Rubrikkerne (1X2, Chancen, combi, pulje)
  // er spillets regnskab; under et liga-filter med startrunde er totalPoints
  // ligaens tal, og de to må ikke stemmes mod hinanden.
  const afvigelser = rows.map((r) => opdelingsAfvigelse(r.opdeling, r.spilTotal ?? r.totalPoints));
  const foersteAfvigelse = afvigelser.find(Boolean) || null;
  return (
    <div className="table-wrap">
      <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Spiller</th>
            {RUBRIKKER.map(({ key, ikon, navn, hjaelp }) => (
              <th key={key} title={hjaelp} style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                <span aria-hidden="true">{ikon}</span> {navn}
              </th>
            ))}
            <th style={{ textAlign: 'right' }}>I alt</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isMe = r.uid === meUid;
            return (
              <tr
                key={r.uid}
                // Fremhævningen skrives her og ikke som en klasse: `.row--me`
                // fandtes ikke i noget stylesheet, så din egen række så ud som
                // alle andre — i et felt på 22 med seks talkolonner kunne man
                // ikke finde sig selv.
                style={{ background: isMe ? 'var(--c-surface-alt)' : undefined, fontWeight: isMe ? 700 : 400 }}
              >
                <td>
                  {r.rank}.{' '}
                  <SpillerNavn r={r} aaben={aabenUid === r.uid} onToggle={onToggle} />
                  {isMe && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
                </td>
                {RUBRIKKER.map(({ key }) => (
                  <td key={key} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {/* En streg og ikke et nul: findes opdelingen ikke endnu, har
                        vi ikke tallet — vi ved ikke, at det er nul. */}
                    {r.opdeling
                      ? (key === 'chance'
                        ? fmtSignedPoints(r.opdeling[key] ?? 0)
                        : formatPoints(r.opdeling[key] ?? 0))
                      : '–'}
                  </td>
                ))}
                <td style={{ textAlign: 'right', fontWeight: 700 }}>
                  {formatPoints(r.spilTotal ?? r.totalPoints)}
                  {afvigelser[i] && <span title={afvigelsesTekst(afvigelser[i])}>*</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {/* Kolonneoverskrifternes title-tekst findes ikke på en telefon — der er
          ingen mus at holde stille. Derfor står forklaringen også som tekst. */}
      <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
        {RUBRIKKER.map(({ ikon, navn, hjaelp }) => `${ikon} ${navn}: ${hjaelp}`).join(' ')}
      </p>
      {foersteAfvigelse && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
          * Delene summer ikke til totalen. Totalen er den rigtige — enten fordi saldoen
          ikke kan gå i minus, eller fordi en kamp ikke kunne læses i opdelingen.
        </p>
      )}
      {!harNogen && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', marginTop: '0.4rem' }}>
          Opdelingen bygges, næste gang en kamp afgøres. Totalen er der allerede.
        </p>
      )}
    </div>
  );
}

/**
 * "IKKE KLAR" OG IKKE NUL. En spiller uden runde-vektor er ikke genberegnet
 * endnu — at vise 0 ville påstå, at han ingen point har. Det var præcis QC's
 * fund: klar-flaget blev beregnet, men ingen flade læste det. ÉN komponent,
 * fordi badget nu står både som hovedtal (Samlet) og som det lille tal
 * (rundevisningen) — og ligaRanking sætter totalPoints til 0 for netop de
 * rækker, så et formatPoints(0) dér ville være løgnen, badget findes for.
 */
function IkkeKlar() {
  return (
    <span className="badge badge--muted" title="Spillerens point pr. runde er ikke beregnet endnu — bed admin køre 🔄 Genberegn point">ikke klar</span>
  );
}

function DeltaArrow({ row }) {
  const d = rankDelta(row);
  if (d == null || d === 0) return null;
  const up = d > 0;
  return (
    <span
      title={up ? `Rykket ${d} op` : `Rykket ${-d} ned`}
      style={{ color: up ? 'var(--c-pitch)' : 'var(--c-err)', fontSize: '0.75rem', marginLeft: 4 }}
    >
      {up ? `▲${d}` : `▼${-d}`}
    </span>
  );
}

export default function GameStandings({ gameId, game = null, matches = [] }) {
  const { user } = useAuth();
  // Yndlingsholdets farver som ring om avataren — se useKlubFarver.
  const klubFarver = useKlubFarver(game);
  const { standings: alleMine, leagues, leagueCount, loading, error } = useVisibleGameStandings(gameId);

  // Filter: hele kredsen (alle mine ligaer samlet) eller én enkelt liga.
  const [leagueId, setLeagueId] = useState(ALLE);
  // Slået fra som udgangspunkt: stillingen skal svare på "hvem fører", ikke
  // stille et regnskab op.
  const [visOpdeling, setVisOpdeling] = useState(false);
  // Samlet eller rundens stilling — knapperne over podiet. Det er et VALG,
  // ikke visningen: visningen udledes nedenfor, for valget kan pege på en
  // runde, det viste felt ikke har (se `visning`).
  const [valg, setValg] = useState('samlet');
  // Hvilken spiller er foldet ud? Kun én ad gangen — to paneler side om side
  // ville hver hente sit dokument og fylde skærmen.
  const [aabenUid, setAabenUid] = useState(null);
  const panelRef = useRef(null);
  const tabelRef = useRef(null);

  // Knappen står øverst, men tabellen, den bytter ud, står under podiet — godt
  // 200 px længere nede. Uden dette er den eneste tilbagemelding på klikket, at
  // knappens egen tekst skifter. Samme greb som til spillerdetaljen nedenfor.
  useEffect(() => {
    if (!visOpdeling) return;
    const el = tabelRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [visOpdeling]);

  // Rul til panelet, når det åbnes. Uden det ser et klik på en spiller langt
  // nede i listen ud, som om der ikke skete noget. Hooken står før de tidlige
  // returneringer, fordi hooks ikke må springes over.
  useEffect(() => {
    if (!aabenUid) return;
    const el = panelRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [aabenUid]);

  // Er ligaen forsvundet under fødderne på en (forladt, slettet), falder vi
  // tilbage til alle — hellere end en tom tabel uden forklaring.
  //
  // ÉN LIGA ER IKKE "INTET VALG". Vælgeren skjules ved én liga, fordi der
  // ikke er noget at vælge imellem — men den samme gren afgjorde også, om
  // ligaens SKALA gjaldt. "Alle mine ligaer" og den ene liga er det samme om
  // HVEM (samme medlemmer) og IKKE om POINT: uden `valgt` viste fanen
  // spillets totaler fra runde 1 i en liga, der tæller fra runde N, og
  // spillere stod med 47 her og 9,7 én fane væk. Er man kun i én liga, ER
  // ligaen stillingen.
  //
  // VAGTEN "lister ligaen mig?" er ikke pynt. `leagueMateUids` springer en
  // liga over, man ikke selv står i, så `alleMine` ville da kun rumme én selv
  // — mens `subsetRanking` HER ville filtrere efter ligaens medlemsliste og
  // dermed fjerne den sidste række. Uden vagten kunne ét skævt liga-dokument
  // tømme ens egen stilling helt. Samme defensive tjek som `leagueMateUids`
  // laver i den anden ende af kæden.
  const enesteLiga = leagues.length === 1
    && (leagues[0]?.memberUids || []).includes(user?.uid)
    ? leagues[0]
    : null;
  const valgt = leagues.find((l) => l.id === leagueId) || enesteLiga;
  // En liga med egen startrunde får sin total regnet FORFRA af runde-vektoren
  // (ligaRanking); uden er den bare en delmængde af spillet (subsetRanking).
  const standings = useMemo(
    () => (valgt
      ? ligaRanking(alleMine, valgt, ligaPoint, harRundeVektor, vektorStemmer)
      : alleMine),
    [alleMine, valgt],
  );

  // RUNDENS POINT. Regnes af det VISTE felt (standings), ikke af hele kredsen:
  // stillingen er liga-filtreret, så kronen skal gælde dem, rækken faktisk
  // viser. Ellers ville den forsvinde for alle, fordi vinderen står i en liga,
  // man ikke deler.
  //
  // Gate på spillets EVNE (runder findes i et fodboldspil), ikke på fanen.
  // At lægge football:true på selve Stilling-fanen ville fjerne den helt fra
  // cykelspillet — en anden beslutning, som ikke hører til her (opgave #56).
  const harRunder = game?.type === GAME_TYPE.FOOTBALL;
  const rundeNr = useMemo(
    () => (harRunder ? sidsteRunde(standings, valgt?.startRound ?? null) : null),
    [harRunder, standings, valgt],
  );
  const foerende = useMemo(
    () => rundeFoerende(standings, rundeNr),
    [standings, rundeNr],
  );
  const visRunde = harRunder && rundeNr != null;

  // PILEN SKAL MÅLE SAMME PERIODE SOM RUNDETALLET. Serverens previousRank er
  // et øjebliksbillede fra sidste KUPON-afgjorte runde og kan ligge flere
  // runder tilbage; står den ved siden af rundens point, modsiger de to
  // hinanden på skærmen. Ejeren fandt det: rundens næsthøjeste tal og en pil
  // NED, uden at være rykket. Gen-tildeles kun når en runde faktisk vises —
  // ellers beholder cykelspil og spil uden runder serverens billede.
  const raekker = useMemo(
    () => (visRunde
      ? rundePile(standings, rundeNr, valgt?.startRound ?? null, ligaPoint, harRundeVektor)
      : standings),
    [visRunde, standings, rundeNr, valgt],
  );

  // VISNINGEN UDLEDES, DEN GEMMES IKKE RÅT (QC på planen). Skifter man til
  // en liga med startrunde 12, mens runde 6 vises, er `rundeNr` null for den
  // liga — vælgeren forsvinder, og et råt gemt 'runde' ville efterlade en
  // liste, hvor alle er urangerede og der intet podie er. Valget bliver
  // stående, så vælgeren husker det, når runden er der igen.
  const visning = visRunde && valg === 'runde' ? 'runde' : 'samlet';
  // KUN podiet og listen får den omsorterede liste. Pokaler, regnskabet og
  // spillerdetaljen bliver på `raekker`: rundeSejre bygger sin vinder-liste i
  // rækkernes orden, og Chance-kongens "Bedst:" ved uafgjort ville skifte
  // navn, når man trykkede på en knap, der ikke handler om pokalen.
  const viste = useMemo(
    () => (visning === 'runde' ? rundeRanking(raekker, rundeNr) : raekker),
    [visning, raekker, rundeNr],
  );
  // Uden ilden skal forklaringslinjen selv bære "foreløbig": et guldpodie
  // for en halvspillet runde står lige under 👑 Rundekongen, som først kårer,
  // når hver kamp har facit. Samme afgørelse som pokalen (faerdigeRunder).
  const rundeFaerdig = useMemo(
    () => (rundeNr != null && faerdigeRunder(matches).includes(rundeNr)),
    [matches, rundeNr],
  );

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;
  if (error) return <p className="badge badge--red">{error}</p>;

  // Måles på HELE kredsen, ikke på det filtrerede resultat: ellers ville en
  // tom liga skjule selve filteret, og man kunne ikke vælge sig tilbage.
  if (alleMine.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">🏆</div>
        <div className="empty-state__title">Ingen deltagere endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>Stillingen fyldes, når spillere tilmelder sig og tipper.</p>
      </div>
    );
  }

  // Ranglisten er jeres indbyrdes opgør: kun spillere fra dine egne ligaer.
  if (leagueCount === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state__icon">👥</div>
        <div className="empty-state__title">Du er ikke med i en liga endnu.</div>
        <p style={{ color: 'var(--c-muted)' }}>
          Ranglisten viser kun de spillere, du deler liga med. Opret eller tilmeld dig
          en liga — så dukker de andre op her.
        </p>
        <p style={{ marginTop: '0.6rem' }}>
          <GameTabLink fane="ligaer" className="btn btn--sm">👥 Gå til Ligaer</GameTabLink>
        </p>
      </div>
    );
  }

  const meUid = user?.uid;
  const toggleUid = (uid) => setAabenUid((u) => (u === uid ? null : uid));
  // En spiller UDEN RANG hører ikke på et podie — medaljens fallback ville
  // vise "#null". Rangen mangler for klar:false (ligaRanking, Samlet) og for
  // dem uden point i runden eller når ingen fører den (rundeRanking). Én
  // regel for begge visninger: er nogen i top tre uden rang, vises ALLE som
  // liste; et podie med huller ville ligne en færdig stilling.
  const podieKlar = viste.slice(0, 3).every((r) => r.rank != null);
  const hasPodium = viste.length >= 3 && podieKlar;
  const podium = hasPodium ? viste.slice(0, 3) : [];
  const listRows = hasPodium ? viste.slice(3) : viste;
  const meRow = viste.find((r) => r.uid === meUid);
  const meInList = meRow && (!hasPodium || meRow.rank > 3);

  const Row = ({ r, sticky = false }) => {
    const isMe = r.uid === meUid;
    return (
      <tr
        className={sticky ? 'rank-row--me' : ''}
        style={{
          borderTop: '1px solid var(--c-border)',
          background: isMe && !sticky ? 'var(--c-surface-alt)' : undefined,
          fontWeight: isMe ? 700 : 400,
        }}
      >
        <td style={{ padding: '0.45rem 0.5rem', fontVariantNumeric: 'tabular-nums', width: 52 }}>
          {/* Rangens streg forklarer sig selv: i rundevisningen kan den
              betyde «intet tal i runden» eller «ingen fører runden endnu»
              (fredag aften med én tabt Chance: et tal, men ingen rang). Ved
              klar:false siger badget i pointcellen det. */}
          {r.rank == null
            ? (
              <span
                title={visning !== 'runde' || r.klar === false ? undefined
                  : (r.rundePoint == null ? 'Ingen afgjorte tips i runden endnu' : 'Ingen rang — ingen fører runden endnu')}
              >
                –
              </span>
            )
            : <>{r.rank}<DeltaArrow row={r} /></>}
        </td>
        <td style={{ padding: '0.45rem 0.5rem' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <Avatar
              uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam}
              klubFarver={klubFarver(r.favoriteTeam)} size={26}
            />
            <SpillerNavn r={r} aaben={aabenUid === r.uid} onToggle={toggleUid} />
            {isMe && <span style={{ color: 'var(--c-muted)', fontWeight: 400 }}> (dig)</span>}
          </span>
        </td>
        <td style={{ padding: '0.45rem 0.5rem', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
          {visning === 'runde' ? (
            <>
              {/* RUNDEVISNINGEN BYTTER TALLENE OM: rundens point er det store
                  tal, for det er det, rækkefølgen følger — et stort total-tal
                  ude af orden ville ligne en fejl. Det lille tal er placering
                  og point fra Samlet (Spilfører: kontrasten «nr. 1 i runden,
                  nr. 13 samlet» er selve pointen). En urangeret række viser
                  samme streg og samme title som RundeCelle; klar:false viser
                  badget og aldrig ligaRankings 0. */}
              {r.rundePoint == null ? <IngenRundePoint r={r} /> : rundeTal(r.rundePoint)}
              <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)', fontWeight: 400 }}>
                {r.klar === false
                  ? <IkkeKlar />
                  : `nr. ${r.samletRank} samlet · ${formatPoints(r.totalPoints)}`}
              </div>
            </>
          ) : (
            <>
              {r.klar === false ? <IkkeKlar /> : formatPoints(r.totalPoints)}
              {/* RUNDENS POINT UNDER TOTALEN — IKKE I EN EGEN KOLONNE.
                  Pokaler.jsx bærer husets skrevne beslutning: listen er en bar
                  <table> uden .table-wrap, så nye kolonner knækker den på en
                  telefon UDEN vandret scroll at hente indholdet med. Målt med
                  scripts/stillingsbredde.mjs: en fjerde kolonne skubbede 39-109 px
                  ud over kanten ved 320-390 px. Under totalen koster tallet højde
                  i stedet for bredde — og det står stadig ved totalen, hvor
                  overskriften siger, det er. */}
              {visRunde && (
                <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)', fontWeight: 400 }}>
                  <RundeCelle r={r} runde={rundeNr} foerende={foerende} />
                </div>
              )}
            </>
          )}
        </td>
      </tr>
    );
  };

  // Bestemt form i flertal er med vilje: listen trunkeres aldrig, så "de N
  // spillere" siger korrekt, at det er dem alle. Ved ÉN spiller er det én selv
  // — man deler ikke liga med sig selv, så den sætning skal skrives om.
  const antal = raekker.length;
  // Skalaskiftet skal stå HER, hvor tallene ses — forklaringen på Ligaer-fanen
  // er én fane væk, og en title-attribut findes ikke på en telefon.
  // SKALA-TEKSTEN BESKRIVER DEN VISTE SKALA — ikke om nogen har valgt noget.
  // Før krævede den `valgt`, præcis den betingelse der OGSÅ afgør om skalaen
  // skifter. Så stod den ene gren, der havde mest brug for forklaringen, som
  // den eneste uden den: den flettede visning sagde intet om, at dens tal er
  // spillets og ikke ligaens. Samme fejl som gaten selv, gentaget i teksten.
  const ligaGate = valgt
    ? (Number.isFinite(valgt.startRound)
      ? ` Tæller fra runde ${valgt.startRound}${puljenTaeller(valgt.startRound) ? '' : ' — puljen tæller ikke'}.`
      : '')
    : ' Tæller fra runde 1 — spillets egen skala, ikke en ligas.';
  const opsummering = (valgt
    ? (antal === 1
      ? `Viser 1 spiller i ${valgt.name || 'ligaen'}.`
      : `Viser de ${antal} spillere i ${valgt.name || 'ligaen'}.`)
    : (antal === 1
      ? 'Viser kun dig selv — ingen andre i dine ligaer er med endnu.'
      : `Viser de ${antal} spillere, du deler liga med.`)) + ligaGate;

  // Opdelingen viser HELE feltet — også de tre på podiet. Byggede den på
  // listRows, ville regnskabet mangle netop de spillere, man helst vil se
  // tallene bag.
  const alleRaekker = raekker;

  // Slå den åbne spiller op i de SYNLIGE rækker. Forsvinder han (liga skiftet,
  // filter ændret), lukker panelet af sig selv i stedet for at hænge med data,
  // man ikke længere må se.
  const aabenRow = aabenUid ? raekker.find((r) => r.uid === aabenUid) : null;

  const MEDAL = ['🥇', '🥈', '🥉'];
  // Ombytningen 2 · 1 · 3 findes ALENE for at sætte vinderen i midten. Er der
  // ingen enkelt vinder, gør den kun to ting, der begge er forkerte: den
  // sætter en tilfældig af de delende i den brede midterplads — ved lige point
  // er rækkefølgen alfabetisk — og den får podiet til at læse i én rækkefølge,
  // mens tabellen 40 px længere nede læser i en anden.
  //
  // Højden holdt allerede op med at lyve; bredden gjorde ikke. Uden en enkelt
  // vinder står de tre derfor i deres egen rækkefølge og i samme bredde.
  const enVinder = podium.length === 3 && podium[0].rank < podium[1].rank;
  const podiumOrder = enVinder ? [podium[1], podium[0], podium[2]] : podium;

  return (
    <div>
      {/* Filteret vises kun, når der er noget at vælge imellem: med én liga
          er "alle mine ligaer" og den ene liga det samme. */}
      {leagueCount > 1 && (
        <label style={{ display: 'block', margin: '0 0 0.6rem' }}>
          <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--c-muted)', marginBottom: '0.2rem' }}>
            Vis stilling for
          </span>
          <select
            value={valgt ? valgt.id : ALLE}
            onChange={(e) => setLeagueId(e.target.value)}
            style={{ width: '100%', maxWidth: '18rem' }}
            aria-label="Vis stilling for"
          >
            <option value={ALLE}>Alle mine ligaer</option>
            {leagues.map((l) => (
              <option key={l.id} value={l.id}>{l.name || 'Liga uden navn'}</option>
            ))}
          </select>
        </label>
      )}

      {/* Overskriftslinjen er en VÆRKTØJSLINJE: hvem vises, og hvordan.
          Knappen til opdelingen stod før mellem podiet og listen, hvor den
          delte stillingen i to og lignede en overskrift for den nederste
          halvdel. Den skifter visning for hele fanen og hører derfor øverst. */}
      <div className="standings__bar">
        <p style={{ color: 'var(--c-muted)', fontSize: '0.82rem', margin: 0 }}>
          {opsummering}
          {/* Har man valgt en liga, står man typisk og vil videre TIL den —
              væggen, spørgsmålene, medlemmerne. */}
          {valgt && (
            <>
              {' '}
              <GameTabLink fane="ligaer" liga={valgt.id}>Åbn ligaen →</GameTabLink>
            </>
          )}
        </p>
        {/* Opdelingen er en EGEN visning, ikke en udvidelse af stillingen.
            Seks tal pr. række ville drukne en liste, der har tre kolonner på
            mobil — og podiet har plads til nøjagtig ét tal. Derfor en knap,
            der bytter tabellen ud, og som er slået fra som udgangspunkt.

            Betingelsen er `raekker`, IKKE `listRows`. En liga med præcis tre
            spillere fylder podiet og har en tom liste — og så forsvandt både
            knappen og spillerdetaljen for hele den gruppe. Værre: knappen
            fandtes under "Alle mine ligaer" og forsvandt, når man valgte den
            lille liga i filteret. En knap, der forsvinder af sig selv. */}
        {raekker.length > 0 && (
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            aria-pressed={visOpdeling}
            // REGNSKAB OG RUNDEVISNING UDELUKKER HINANDEN (QC på planen):
            // regnskabet er spillets totaler, så podiet over det skal være
            // Samlet — ellers står to skalaer oven på hinanden. Vælgeren
            // bliver stående med Samlet trykket ind; det er sandt. Og
            // «Runde N» lukker regnskabet den anden vej (se knappen).
            onClick={() => { if (!visOpdeling) setValg('samlet'); setVisOpdeling(!visOpdeling); }}
          >
            {/* "Tilbage til listen" og ikke "vis stillingen": man ER i
                stillingen, og podiet står uændret ovenover hele tiden. */}
            {visOpdeling ? '← Tilbage til listen' : '🧮 Hvor kommer pointene fra?'}
          </button>
        )}
      </div>

      {/* Sæsonens to ANDRE pokaler. De står FØR podiet, fordi de er dem, der
          kan have skiftet siden sidst — podiet ligner ofte sig selv fra
          december. IKKE gate't på podiet: en liga på to spillere har ingen
          top-3, men har stadig en rundekonge. Kortene bærer selv deres skala:
          rundesejre følger ligaens startrunde, mens Chance-kongen stadig regner
          på hele sæsonen (opdeling.chance) — rubrikkerne pr. runde findes nu,
          men kortet følger først ligaen, når alle rækker har dem. */}
      <Pokaler
        rows={raekker}
        matches={matches}
        startRunde={valgt && Number.isFinite(valgt.startRound) ? valgt.startRound : null}
      />

      {/* HVILKEN RUNDE tallet er.
          Linjen stod oprindeligt her, fordi pilen ▲▼ målte mod et ældre
          øjebliksbillede og derfor kunne modsige rundetallet. Den strid er
          løst i selve pilen (se rundePile ovenfor) — de to måler nu samme
          runde. Overskriften bliver stående, fordi tallet stadig skal
          TILSKRIVES en runde: uden den ved man ikke, hvilken runde "+12,3"
          hører til. Ilden forklares her og ikke pr. række — det er en regel,
          ikke en oplysning om spilleren.

          Den står OVER podiet og ikke i listen, fordi tallet står BEGGE
          steder. Lå den i listen, ville en liga med tre eller færre spillere
          — hvor listen er tom og alle står på podiet — vise rundepoint og
          ild uden et ord om, hvilken runde det handler om. Den fejl slap
          igennem en grøn test, indtil fladen blev mutationstestet. */}
      {visRunde && (
        <>
          {/* VÆLGEREN STÅR HER, lige over podiet — ikke i værktøjslinjen.
              Værktøjslinjen ligger over pokalerne, som knapperne IKKE rører;
              her står de ved det, de skifter: podiet og listen. To knapper
              (ejerens ord), én gruppe, den trykkede er fyldt. «Runde N» og
              ikke «Uge N»: perRound grupperes efter kampens runde, ikke efter
              uge, så "uge" ville love denne uges point, og det kan data ikke
              give. Ingen tidligere runder — ejeren bad om den igangværende;
              en vælger til ældre runder er den naturlige næste udvidelse. */}
          <div className="visning" role="group" aria-label="Visning">
            <button
              type="button"
              className="btn btn--ghost btn--sm visning__knap"
              aria-pressed={visning === 'samlet'}
              onClick={() => setValg('samlet')}
            >
              Samlet
            </button>
            <button
              type="button"
              className="btn btn--ghost btn--sm visning__knap"
              aria-pressed={visning === 'runde'}
              onClick={() => { setValg('runde'); setVisOpdeling(false); }}
            >
              Runde {rundeNr}
            </button>
          </div>
          {/* HVILKEN RUNDE tallet er — og hvad rækkefølgen følger.
              Linjen stod oprindeligt her, fordi pilen ▲▼ målte mod et ældre
              øjebliksbillede og derfor kunne modsige rundetallet. Den strid er
              løst i selve pilen (se rundePile ovenfor). Overskriften bliver
              stående, fordi tallet stadig skal TILSKRIVES en runde. Ilden
              forklares her og ikke pr. række — det er en regel, ikke en
              oplysning om spilleren.

              I rundevisningen er der ingen ild: rækkefølgen og guldet siger,
              hvem der fører — to tegn for samme ting. Men ilden bar også
              ordet "foreløbig", så linjen siger selv, at runden ikke er
              færdigspillet, når den ikke er. Og «–» forklares kun, når nogen
              står med den.

              Den står OVER podiet og ikke i listen, fordi tallet står BEGGE
              steder. Lå den i listen, ville en liga med tre eller færre
              spillere — hvor listen er tom og alle står på podiet — vise
              rundepoint uden et ord om, hvilken runde det handler om. */}
          <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0 0 0.6rem' }}>
            {visning === 'runde' ? (
              <>
                Runde {rundeNr} alene — sorteret efter rundens point.
                {!rundeFaerdig && ' Rækkefølgen er foreløbig — runden er ikke færdigspillet.'}
                {' '}Det lille tal er placering og point i Samlet.
                {viste.some((r) => r.rundePoint == null) && ' Stregen – betyder ingen afgjorte tips i runden endnu.'}
                {/* Fredag aften, hvor alle ramte den første kamp forbi (eller én
                    tabte sin Chance): tal, men ingen rang — og en title findes
                    ikke på en telefon, så linjen siger det selv. Spilførers ord:
                    det er drillestof, ikke en fejlmelding. */}
                {foerende.size === 0 && viste.some((r) => r.rundePoint != null)
                  && ' Alle med et afgjort tip har ramt forbi indtil videre: ingen er over nul, så ingen har en rang.'}
              </>
            ) : (
              <>
                Runde {rundeNr}: tallet under totalen er rundens point.
                {foerende.size > 0 && ' 🔥 har flest indtil videre.'}
              </>
            )}
          </p>
        </>
      )}
      {hasPodium && (
        <div className={`podium${enVinder ? '' : ' podium--lige'}`}>
          {podiumOrder.map((r) => (
            <div key={r.uid} className="podium__spot">
              <span className="podium__medal">{MEDAL[r.rank - 1] || `#${r.rank}`}</span>
              <Avatar
                uid={r.uid} name={r.name} emoji={r.emoji} favoriteTeam={r.favoriteTeam}
                klubFarver={klubFarver(r.favoriteTeam)} size={r.rank === 1 ? 44 : 34}
              />
              <SpillerNavn r={r} aaben={aabenUid === r.uid} onToggle={toggleUid} className="link-btn podium__name" />
              <span className="podium__pts">
                {visning === 'runde' ? rundeTal(r.rundePoint) : formatPoints(r.totalPoints)} p
              </span>
              {/* Podiet vokser kun LODRET af en linje mere — modsat listen,
                  hvor en kolonne æder bredde på en telefon. I rundevisningen
                  er linjen placering og point i Samlet; en podie-række er
                  altid rangeret og klar, så badget er ikke nødvendigt her. */}
              {visning === 'runde' ? (
                <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                  nr. {r.samletRank} samlet · {formatPoints(r.totalPoints)} p
                </span>
              ) : visRunde && (
                <span style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                  <RundeCelle r={r} runde={rundeNr} foerende={foerende} />
                </span>
              )}
              {/* Selve trinnet. Højden følger PLACERINGEN og ikke pladsen i
                  rækken: står tre spillere lige, har de alle rang 1 og skal
                  stå i samme højde. Et podie, der løfter én af tre lige
                  spillere, ville lyve om stillingen. DÉT er testdækket.

                  Loftet på 3 er derimod et defensivt værn mod en tilstand,
                  rangeringen ikke kan producere — rang på indeks 2 er altid
                  højst 3 — og er derfor ikke dækket af nogen test. */}
              <div className={`podium__trin podium__trin--${Math.min(r.rank, 3)}`}>
                <span className="podium__plads">{r.rank}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {raekker.length === 0 && (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>
          Ingen af ligaens medlemmer er med i stillingen endnu.
        </p>
      )}

      {/* Betingelsen er `raekker`, IKKE `listRows`. En liga med præcis tre
          spillere fylder podiet og har en tom liste — og så forsvandt både
          opdelingen og spillerdetaljen for hele den gruppe. */}
      {raekker.length > 0 && (
        <div ref={tabelRef}>
          {visOpdeling ? (
            <>
              {/* Under et liga-filter med startrunde er tabellen ovenfor på
                  LIGAENS skala; regnskabet her er spillets. Uden sætningen
                  ville de to tal ligne en fejl. */}
              {ligaGate && (
                <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                  Regnskabet viser spillets samlede point.{ligaGate}
                </p>
              )}
              <OpdelingsTabel
                rows={alleRaekker}
                meUid={meUid}
                aabenUid={aabenUid}
                onToggle={toggleUid}
              />
            </>
          ) : (
            listRows.length > 0 && (
              <>
                <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <tbody>
                    {listRows.map((r) => <Row key={r.uid} r={r} />)}
                    {meInList && meRow && !listRows.some((r) => r.uid === meUid) && (
                      <Row r={meRow} sticky />
                    )}
                  </tbody>
                </table>
              </>
            )
          )}

          {/* Panelet står under HELE tabellen. Klikkede man på nr. 12 af 22,
              skete der tilsyneladende ingenting — derfor rulles der derhen. */}
          <div ref={panelRef}>
            {aabenRow && (
              <>
                {/* SIG DET, NÅR PANELET STÅR PÅ EN ANDEN SKALA END RÆKKEN.
                    Panelet får bevidst spillets total, fordi det lister runder
                    fra spillets start — men rækken ovenfor kan vise ligaens.
                    To tal for samme spiller på samme skærm uden ét ord er
                    præcis den modsigelse, hele denne rettelse handler om;
                    opdelings-tabellen har haft sin sætning hele tiden, dette
                    panel havde ingen.

                    Betingelsen er, at tallene FAKTISK er forskellige — ikke at
                    der er valgt en liga. En liga uden startrunde giver samme
                    tal, og en sætning dér ville forklare en forskel, læseren
                    ikke kan se. */}
                {aabenRow.spilTotal != null && aabenRow.spilTotal !== aabenRow.totalPoints && (
                  <p style={{ color: 'var(--c-muted)', fontSize: '0.85rem', margin: '0 0 0.5rem' }}>
                    Tallene herunder er spillets samlede point
                    {' '}({formatPoints(aabenRow.spilTotal)}) — i stillingen ovenfor tæller
                    {' '}{valgt?.name || 'ligaen'} kun fra runde {valgt?.startRound}.
                  </p>
                )}
                <SpillerDetalje
                  game={game}
                  matches={matches}
                  // Spillets total: detaljen lister runder fra SPILLETS start,
                  // og dens sum skal ramme det tal, den selv viser.
                  spiller={{ ...aabenRow, totalPoints: aabenRow.spilTotal ?? aabenRow.totalPoints }}
                  // Den, der kigger — grundlaget for det indbyrdes opgør.
                  minUid={user?.uid ?? null}
                  onLuk={() => setAabenUid(null)}
                />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
