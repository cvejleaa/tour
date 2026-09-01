import { describe, it, expect } from 'vitest';
import {
  toMillis, groupByRound, activeRound, RUNDE_SLIP_MS, isLocked, matchScore,
  liveScore, LIVE_STALE_MS, efterslaebere, efterslaebPaaRunde,
} from './footballRounds';

const M = (round, kickoffMs, extra = {}) => ({ round, kickoff: kickoffMs, ...extra });

// `afterStart` ER VÆK. Den skjulte kampe med kickoff før spillets startdato og
// kunne dermed skjule fire kampe i en runde og vise de to sidste, hvis runden
// lå spredt — Superligaens runde 3 spilles 7.-10. august bortset fra to kampe
// den 2.-3. september. Visningen og pointgivningen havde hver sin kopi af den
// regel. Nu har de den samme, den tæller runder, og den ligger i
// src/lib/startGate.js med sine egne tests.

describe('toMillis', () => {
  it('håndterer tal, ISO, Date, Firestore-Timestamp', () => {
    expect(toMillis(123)).toBe(123);
    expect(toMillis('2026-07-24T17:00:00Z')).toBe(Date.parse('2026-07-24T17:00:00Z'));
    expect(toMillis({ toMillis: () => 999 })).toBe(999);
    expect(toMillis({ seconds: 5 })).toBe(5000);
    expect(toMillis(null)).toBeNull();
  });
});

describe('groupByRound', () => {
  it('grupperer og sorterer runder + kampe efter kickoff', () => {
    const rounds = groupByRound([
      M(2, 200), M(1, 150), M(1, 100), M(2, 50),
    ]);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(rounds[0].matches.map((m) => m.kickoff)).toEqual([100, 150]);
    expect(rounds[1].matches.map((m) => m.kickoff)).toEqual([50, 200]);
  });
  it('samler kampe uden runde i runde 0', () => {
    const rounds = groupByRound([{ kickoff: 10 }, M(1, 20)]);
    expect(rounds[0].round).toBe(0);
  });
});

describe('activeRound', () => {
  // Absolutte tidspunkter, ikke offsets fra RUNDE_SLIP_MS: regner fixturet ud
  // fra konstanten, flytter det sig MED en mutation af den, og suiten kan
  // aldrig fortælle, at grænsen er forkert. Samme fælde som LIVE_STALE_MS
  // allerede har en absolut pin imod.
  const T = 1_754_150_000_000;       // rundens sidste kickoff
  const MIN = 60_000;
  const rounds = groupByRound([M(1, T - 60 * MIN), M(1, T), M(2, T + 5 * 24 * 60 * MIN)]);
  const afgjort = groupByRound([
    { ...M(1, T - 60 * MIN), result: '1' }, { ...M(1, T), result: 'X' },
    M(2, T + 5 * 24 * 60 * MIN),
  ]);

  it('grænsen for at slippe en runde er tre timer', () => {
    expect(RUNDE_SLIP_MS).toBe(3 * 60 * 60 * 1000);
  });

  it('vælger runden med den næste kamp, før noget er begyndt', () => {
    expect(activeRound(rounds, T - 120 * MIN)).toBe(1);
    expect(activeRound(rounds, T - 30 * MIN)).toBe(1); // én kamp er i gang, én venter
  });

  // DETTE er hele pointen: fladen må ikke springe videre, i samme sekund som
  // rundens sidste kamp fløjtes i gang. Man sad og så kampen, trykkede
  // opdatér, og var pludselig i næste runde.
  it('bliver i runden, mens dens sidste kamp spilles', () => {
    expect(activeRound(rounds, T + 30 * MIN)).toBe(1);
    expect(activeRound(rounds, T + 100 * MIN)).toBe(1);
  });

  it('går videre, når rundens kampe er afgjort', () => {
    expect(activeRound(afgjort, T + 30 * MIN)).toBe(2);
  });

  // Én kamp uden facit må ikke binde fladen til en gammel runde for evigt —
  // kilden kan svigte, og en kamp kan blive afbrudt. Tallene er absolutte, så
  // en ændring af grænsen får testen til at fejle.
  it('slipper en runde efter tre timer, hvis facit aldrig kommer', () => {
    expect(activeRound(rounds, T + 179 * MIN)).toBe(1);
    expect(activeRound(rounds, T + 181 * MIN)).toBe(2);
  });

  // Number('') er 0 og '' er falsk-agtig: uden det udtrykkelige tjek ville en
  // tom streng tælle som facit, og runden se afgjort ud. Samme fælde som
  // matchScore allerede er faldet i.
  it('regner en tom streng som IKKE afgjort', () => {
    const tom = groupByRound([
      { ...M(1, T - 60 * MIN), result: '' }, { ...M(1, T), result: '' },
      M(2, T + 5 * 24 * 60 * MIN),
    ]);
    expect(activeRound(tom, T + 30 * MIN)).toBe(1);
  });

  it('kalder ikke en runde færdig, hvis bare ét facit mangler', () => {
    const halvt = groupByRound([
      { ...M(1, T - 60 * MIN), result: '1' }, M(1, T),
      M(2, T + 5 * 24 * 60 * MIN),
    ]);
    expect(activeRound(halvt, T + 30 * MIN)).toBe(1);
  });

  // DEN UDSKUDTE KAMP. Runde 3 i 2026/27 har en kamp den 3. september, mens
  // runde 4-6 spilles i august. Valgte fladen "tidligste runde, der mangler
  // noget", stod den på runde 3 i tre uger, og ingen blev ført til de runder,
  // de faktisk kunne tippe i.
  it('springer en runde med en udskudt kamp over til fordel for den næste kamp', () => {
    const udskudt = groupByRound([
      { ...M(3, T - 30 * 24 * 60 * MIN), result: '1' },
      M(3, T + 30 * 24 * 60 * MIN),   // udskudt: langt ude i fremtiden
      M(4, T + 7 * 24 * 60 * MIN),    // næste rigtige kamp
      M(5, T + 14 * 24 * 60 * MIN),
    ]);
    expect(activeRound(udskudt, T)).toBe(4);
  });

  // ...men en kamp, der er i GANG, slår altid den næste kamp. Ellers ville
  // rettelsen ovenfor genindføre den fejl, hele ændringen findes for.
  it('lader en kamp i gang slå den næste kamp i en anden runde', () => {
    const samtidig = groupByRound([
      M(3, T - 30 * MIN),             // spilles lige nu
      M(4, T + 10 * MIN),             // starter om lidt
    ]);
    expect(activeRound(samtidig, T)).toBe(3);
  });

  // En kamp uden kickoff kan ikke være "den næste" — den har ingen dato. Men
  // den må heller ikke forsvinde: findes der ingen kamp med en dato foran os,
  // er dens runde den, der stadig mangler noget.
  it('binder ikke fladen til en kamp uden kickoff, når andre kampe har en dato', () => {
    const udenTid = groupByRound([
      { round: 1, kickoff: null }, M(2, T + 5 * 24 * 60 * MIN),
    ]);
    expect(activeRound(udenTid, T)).toBe(2);
  });

  it('finder runden med en kamp uden kickoff, når intet andet venter', () => {
    const udenTid = groupByRound([
      { ...M(1, T - 10 * 24 * 60 * MIN), result: '1' }, { round: 2, kickoff: null },
    ]);
    expect(activeRound(udenTid, T)).toBe(2);
  });

  it('vælger sidste runde, når hele sæsonen er afgjort', () => {
    const slut = groupByRound([
      { ...M(1, T - 20 * 24 * 60 * MIN), result: '1' },
      { ...M(2, T - 10 * 24 * 60 * MIN), result: 'X' },
    ]);
    expect(activeRound(slut, T)).toBe(2);
  });

  it('returnerer null uden runder', () => {
    expect(activeRound([], 0)).toBeNull();
  });
});

describe('isLocked', () => {
  it('låser når kickoff er passeret', () => {
    expect(isLocked({ kickoff: 100 }, 150)).toBe(true);
    expect(isLocked({ kickoff: 100 }, 50)).toBe(false);
    expect(isLocked({ kickoff: null }, 50)).toBe(false);
  });
});

// matchScore — målene har ligget på kampdokumentet hele sæsonen uden nogensinde
// at blive vist. 0 er den farlige værdi: en sandhedstest ville skjule hver
// eneste målløse kamp.
describe('matchScore', () => {
  it('læser slutresultatet af en spillet kamp', () => {
    expect(matchScore({ homeGoals: 3, awayGoals: 2 })).toEqual({ home: 3, away: 2 });
  });

  it('viser 0-0 — ikke ingenting', () => {
    expect(matchScore({ homeGoals: 0, awayGoals: 0 })).toEqual({ home: 0, away: 0 });
  });

  it('viser et enkelt nulmål i den ene ende', () => {
    expect(matchScore({ homeGoals: 0, awayGoals: 1 })).toEqual({ home: 0, away: 1 });
    expect(matchScore({ homeGoals: 2, awayGoals: 0 })).toEqual({ home: 2, away: 0 });
  });

  it('giver null på en kamp, der ikke er spillet', () => {
    expect(matchScore({})).toBeNull();
    expect(matchScore({ homeGoals: 1 })).toBeNull();
    expect(matchScore({ homeGoals: null, awayGoals: null })).toBeNull();
  });

  // Number('') er 0 — uden vagten ville en tom streng blive til et mål.
  it('tæller en tom streng som "ikke spillet", ikke som nul mål', () => {
    expect(matchScore({ homeGoals: '', awayGoals: '' })).toBeNull();
    expect(matchScore({ homeGoals: 2, awayGoals: '' })).toBeNull();
  });

  it('tåler tal gemt som tekst', () => {
    expect(matchScore({ homeGoals: '3', awayGoals: '0' })).toEqual({ home: 3, away: 0 });
  });

  it('tåler at blive kaldt uden kamp', () => {
    expect(matchScore(undefined)).toBeNull();
  });
});

// liveScore — den levende stilling under en kamp. Facit slår altid live, og
// en stilling må aldrig se frisk ud, når synken er holdt op med at kigge.
describe('liveScore', () => {
  const NU = 1_754_150_000_000;
  // kickoff skal med: en stilling hører aldrig til på et kort, der stadig
  // tager imod tips, så liveScore kræver at kampen ER låst.
  const live = (extra = {}) => ({
    kickoff: NU - 40 * 60_000,
    live: { home: 1, away: 0, status: 'foerste', statusRaw: '1st half', at: NU - 60_000, ...extra },
  });

  it('læser stillingen og halvlegen', () => {
    expect(liveScore(live(), NU - 30_000, NU)).toMatchObject({
      home: 1, away: 0, halvleg: '1. halvleg', afbrudt: false, forældet: false,
    });
  });

  it('viser 0-0 som en rigtig stilling', () => {
    expect(liveScore(live({ home: 0, away: 0 }), NU, NU)).toMatchObject({ home: 0, away: 0 });
  });

  // Kampen er fløjtet af, men facit er ikke nået frem. Serveren markerer med
  // 'slut' i stedet for at slette, så tallet bliver stående.
  it('melder sluttet, når serveren har markeret kampen som slut', () => {
    expect(liveScore(live({ status: 'slut' }), NU, NU)).toMatchObject({
      home: 1, away: 0, sluttet: true,
    });
  });

  it('melder ikke sluttet på en kamp, der er i gang', () => {
    expect(liveScore(live(), NU, NU).sluttet).toBe(false);
  });

  // 'slut' må ALDRIG få en halvlegs-tekst. Fik den det, ville kortets sidste
  // udvej — "har den en halvleg, så sig DIREKTE" — kalde en afsluttet kamp
  // levende igen. Det var præcis den fejl, hele rettelsen skulle af med.
  it('giver ingen halvlegs-tekst til en sluttet kamp', () => {
    expect(liveScore(live({ status: 'slut' }), NU, NU).halvleg).toBeNull();
  });

  // Slutresultatet er sandheden. Ligger der live tilbage, er det affald.
  it('lader facit slå live', () => {
    expect(liveScore({ ...live(), result: '1' }, NU, NU)).toBeNull();
  });

  it('giver null, når kampen ikke er i gang', () => {
    expect(liveScore({}, NU, NU)).toBeNull();
    expect(liveScore({ kickoff: NU - 1000, live: {} }, NU, NU)).toBeNull();
    expect(liveScore(undefined, NU, NU)).toBeNull();
  });

  // Skrivestien skriver aldrig live før kickoff, men et dokument kan blive
  // forkert på anden vis — og så må stillingen ikke stå på et åbent kort.
  it('viser INTET, mens kampen stadig tager imod tips', () => {
    expect(liveScore({ ...live(), kickoff: NU + 60 * 60_000 }, NU, NU)).toBeNull();
  });

  it('viser intet på en kamp helt uden kickoff', () => {
    const udenKickoff = { live: live().live };
    expect(liveScore(udenKickoff, NU, NU)).toBeNull();
  });

  it('oversætter alle halvlegene', () => {
    const h = (status) => liveScore(live({ status }), NU, NU).halvleg;
    expect(h('foerste')).toBe('1. halvleg');
    expect(h('pause')).toBe('Pause');
    expect(h('anden')).toBe('2. halvleg');
    expect(h('forlaenget')).toBe('Forlænget spilletid');
    expect(h('straffe')).toBe('Straffespark');
  });

  // En afbrudt kamp må ikke stå som "DIREKTE" — så påstår vi, der spilles.
  it('markerer en afbrudt kamp for sig', () => {
    const r = liveScore(live({ status: 'afbrudt' }), NU, NU);
    expect(r.afbrudt).toBe(true);
    expect(r.halvleg).toBe('Afbrudt');
  });

  it('siger ingenting om halvlegen, når serveren ikke kendte statussen', () => {
    expect(liveScore(live({ status: 'ukendt' }), NU, NU).halvleg).toBeNull();
  });

  // Pulsen og ikke live.at: et 0-0, der står stille i 40 minutter, ville
  // ellers se dødt ud, selv om synken kørte fint.
  it('måler friskhed på spillets puls, ikke på hvornår stillingen sidst ændrede sig', () => {
    const gammelStilling = live({ at: NU - 40 * 60_000 });
    expect(liveScore(gammelStilling, NU - 30_000, NU).forældet).toBe(false);
    expect(liveScore(gammelStilling, NU - 40 * 60_000, NU).forældet).toBe(true);
  });

  // ABSOLUTTE tal. Regnede fixturet ud fra konstanten selv, kunne testen
  // aldrig fejle — en grænse på 20 minutter ville stå lige så grønt, og så
  // stod kortet og løj i et kvarter. Præcis den fejl blev begået én gang før
  // i denne fil, med vinduet i synken.
  it('grænsen for forældelse er fem minutter', () => {
    expect(LIVE_STALE_MS).toBe(5 * 60 * 1000);
  });

  it('fire minutter uden puls er stadig frisk', () => {
    expect(liveScore(live(), NU - 4 * 60_000, NU).forældet).toBe(false);
  });

  it('seks minutter uden puls er forældet', () => {
    expect(liveScore(live(), NU - 6 * 60_000, NU).forældet).toBe(true);
  });

  // Tredje gren: hverken puls eller brugbart live.at.
  it('kalder stillingen forældet, når der slet ingen tid er', () => {
    const uden = { kickoff: NU - 40 * 60_000, live: { home: 1, away: 0, status: 'anden' } };
    const r = liveScore(uden, null, NU);
    expect(r.forældet).toBe(true);
    expect(r.setAt).toBeNull();
    expect(r.home).toBe(1);   // stillingen står der stadig
  });

  it('falder tilbage til live.at, hvis pulsen mangler helt', () => {
    const r = liveScore(live({ at: NU - 60_000 }), null, NU);
    expect(r.forældet).toBe(false);
    expect(r.setAt).toBe(NU - 60_000);
  });

  // Vi sletter ALDRIG stillingen — et tal med forbehold er mere værd end en streg.
  it('beholder stillingen, selv når den er forældet', () => {
    const r = liveScore(live(), NU - 60 * 60_000, NU);
    expect(r.forældet).toBe(true);
    expect(r.home).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// EFTERSLÆBERE — udsatte kampe, der ikke spilles i deres egen rundes uge.
//
// Ejer-rapport: tip-fanen åbnede på RUNDE 2, mens alle var ved at tippe runde
// 7, fordi to udsatte runde-2-kampe blev spillet onsdag og torsdag og dermed
// havde det tidligste fremtidige kickoff. Brugerne troede, spillet var gået i
// stå.
//
// Ugen løber tirsdag→mandag (ugeNoegle i pointOpdeling.js), så 2.-3. sep. og
// 4.-7. sep. er SAMME uge — det er derfor de to kampe hører hjemme på runde 7's
// side, uden at deres point flytter sig.
// ---------------------------------------------------------------------------
describe('efterslæbere', () => {
  const k = (iso) => new Date(iso);
  // Runde 2: fire kampe i uge 2026-08-04, to udsat til uge 2026-09-01.
  const R2 = {
    round: 2,
    matches: [
      { id: 'a', kickoff: k('2026-08-08T16:00:00Z') },
      { id: 'b', kickoff: k('2026-08-08T18:00:00Z') },
      { id: 'c', kickoff: k('2026-08-09T14:00:00Z') },
      { id: 'd', kickoff: k('2026-08-09T16:00:00Z') },
      { id: 'agf-fcm', kickoff: k('2026-09-02T18:00:00Z') },
      { id: 'fck-fcn', kickoff: k('2026-09-03T18:00:00Z') },
    ],
  };
  const R7 = {
    round: 7,
    matches: [
      { id: 'vib-lyn', kickoff: k('2026-09-04T17:00:00Z') },
      { id: 'agf-sif', kickoff: k('2026-09-05T16:00:00Z') },
      { id: 'bif-rfc', kickoff: k('2026-09-06T16:00:00Z') },
    ],
  };
  const R8 = { round: 8, matches: [{ id: 'r8', kickoff: k('2026-09-11T17:00:00Z') }] };
  const alle = [R2, R7, R8];

  it('finder præcis de to udsatte — ikke rundens fire egne', () => {
    expect(efterslaebere(alle).map((e) => e.match.id)).toEqual(['agf-fcm', 'fck-fcn']);
    expect(efterslaebere(alle).every((e) => e.fraRunde === 2)).toBe(true);
  });

  it('en runde, der er flyttet I SIN HELHED, har ingen efterslæbere', () => {
    // Rundens uge er den med FLEST kampe, så flytter hele runden sig, flytter
    // ugen med. Uden dette ville en udskudt runde blive til lutter
    // efterslæbere og forsvinde fra sin egen side.
    const flyttet = { round: 3, matches: [
      { id: 'x', kickoff: k('2026-10-06T17:00:00Z') },
      { id: 'y', kickoff: k('2026-10-07T17:00:00Z') },
    ] };
    expect(efterslaebere([flyttet])).toEqual([]);
  });

  it('et ULÆSELIGT kickoff er ikke en efterslæber', () => {
    // Samme retning som kuponens: kampen bliver, hvor den er, frem for at
    // blive flyttet til en runde, vi ikke kan vide er den rigtige.
    const r = { round: 4, matches: [
      { id: 'p', kickoff: k('2026-08-08T16:00:00Z') },
      { id: 'q', kickoff: k('2026-08-08T18:00:00Z') },
      { id: 'skrald', kickoff: 'i morgen' },
    ] };
    expect(efterslaebere([r])).toEqual([]);
  });

  it('efterslaebPaaRunde giver runde 7 netop de to — og runde 8 ingen', () => {
    expect(efterslaebPaaRunde(alle, 7).map((e) => e.match.id)).toEqual(['agf-fcm', 'fck-fcn']);
    expect(efterslaebPaaRunde(alle, 8)).toEqual([]);
  });

  it('en runde kan ikke låne sin egen kamp tilbage', () => {
    // Runde 2's egen uge er august, så dens september-kampe hører ikke hjemme
    // på runde 2's side igen. Det følger af definitionen — en efterslæber har
    // pr. definition en anden uge end sin runde — og derfor er der ÉN
    // betingelse i filteret, ikke to. Testen binder følgen, ikke vagten.
    expect(efterslaebPaaRunde(alle, 2)).toEqual([]);
  });

  it('rundens uge er den med FLEST kampe — ikke den FØRSTE kamps', () => {
    // Mutationstesten afslørede hullet: mine fixtures havde altid rundens
    // første kamp i rundens egen uge, så `rundensUge` kunne erstattes med
    // "den første kamps uge" med grøn suite.
    //
    // Sagen, der skiller dem, er en kamp rykket FREM — præcis den, kommentaren
    // på `rundensUge` beskriver: bliver én kamp flyttet til mandagen før
    // runden, ville dén ene kamp ellers blive hele rundens uge, og de fire
    // andre ville alle blive efterslæbere på deres egen runde.
    const rykketFrem = { round: 9, matches: [
      { id: 'frem', kickoff: k('2026-09-28T17:00:00Z') }, // en uge før de andre
      { id: 'n1', kickoff: k('2026-10-02T17:00:00Z') },
      { id: 'n2', kickoff: k('2026-10-03T16:00:00Z') },
      { id: 'n3', kickoff: k('2026-10-04T14:00:00Z') },
      { id: 'n4', kickoff: k('2026-10-04T16:00:00Z') },
    ] };
    // Præcis ÉN efterslæber: den fremrykkede. Med "første kamps uge" ville
    // svaret være de fire andre.
    expect(efterslaebere([rykketFrem]).map((e) => e.match.id)).toEqual(['frem']);
  });
});

describe('activeRound — efterslæbere trækker ikke landingen bagud', () => {
  const k = (iso) => new Date(iso);
  const R2 = { round: 2, matches: [
    { id: 'a', kickoff: k('2026-08-08T16:00:00Z'), result: '1' },
    { id: 'b', kickoff: k('2026-08-08T18:00:00Z'), result: 'X' },
    { id: 'c', kickoff: k('2026-08-09T14:00:00Z'), result: '2' },
    { id: 'udsat1', kickoff: k('2026-09-02T18:00:00Z') },
    { id: 'udsat2', kickoff: k('2026-09-03T18:00:00Z') },
  ] };
  const R7 = { round: 7, matches: [
    { id: 'v', kickoff: k('2026-09-04T17:00:00Z') },
    { id: 'w', kickoff: k('2026-09-05T16:00:00Z') },
  ] };

  it('lander på runde 7, ikke på runde 2 (ejerens rapport)', () => {
    // 1. sep.: de to udsatte har det tidligste fremtidige kickoff, men de er
    // efterslæbere. Uden vagten svarer denne 2 — dét var fejlen.
    expect(activeRound([R2, R7], Date.parse('2026-09-01T07:00:00Z'))).toBe(7);
  });

  it('men en kamp, der spilles LIGE NU, vinder stadig — uanset runde', () => {
    // spillesNu er bevidst uændret: en igangværende kamp er værd at lande på.
    expect(activeRound([R2, R7], Date.parse('2026-09-02T18:30:00Z'))).toBe(2);
  });

  it('falder tilbage til den rå regel, hvis ALT er efterslæb', () => {
    // Vagten må ikke kunne pege på ingen runde, fordi den var for grådig.
    const kun = { round: 5, matches: [
      { id: 'e1', kickoff: k('2026-08-08T16:00:00Z') },
      { id: 'e2', kickoff: k('2026-08-08T17:00:00Z') },
    ] };
    const sen = { round: 6, matches: [{ id: 'f', kickoff: k('2026-12-01T17:00:00Z') }] };
    expect(activeRound([kun, sen], Date.parse('2026-08-01T00:00:00Z'))).toBe(5);
  });
});
