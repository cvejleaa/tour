// Tests for IHF-parseren (håndbold-VM 2027) — mod ÆGTE sider fra ihf.info.
//
// Fixtures i testdata/ihf-*.html er hentet af scripts/probe-ihf.mjs og er
// valgt på hvad de DÆKKER, ikke på hvad der var nemt:
//
//   ihf-dag-2027-01-13.html   VM 2027, dag 1: status '', «VS», tider 00:00
//   ihf-dag-2027-01-29.html   VM 2027, semifinaledag: pladsholdere «W QF1»
//   ihf-dag-2025-02-02.html   VM 2025, finaledag: finale 26-32, bronze 35-34
//   ihf-dag-2023-01-25.html   VM 2023, kvartfinaler: 34-35 er INKL. forlængelse
//   ihf-kamp-2025-202123.html bronzekampen 2025: perioder uden forlængelse
//   ihf-kamp-2023-119085.html kvartfinalen Norge–Spanien 2023: to forlængelser
//   ihf-kamp-2021-26809.html  kvartfinalen Danmark–Egypten 2021: straffekast
//   ihf-kamp-2027-307515.html VM 2027, ikke spillet: 0:0 og 00:00
//
// VAGTERNE bevises ved at mutere en ægte side ét sted. Hver mutation går
// gennem `erstat`, der KASTER, hvis teksten ikke fandtes — ellers ville en
// erstatning, der ikke matcher, give en grøn test, der intet beviser
// (CLAUDE.md, «Kontrollér, at hver ændring faktisk landede»).
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';

const require = createRequire(import.meta.url);
const {
  STATUS, PERIODE_ID, IhfStrukturFejl, parseDagside, parseKampside, konkurrenceIdAf, kalenderAf,
} = require('./ihfParse');

const fx = (navn) => readFileSync(new URL(`./testdata/${navn}`, import.meta.url), 'utf8');
const DAG_2027 = fx('ihf-dag-2027-01-13.html');
const DAG_2027_SF = fx('ihf-dag-2027-01-29.html');
const DAG_2025 = fx('ihf-dag-2025-02-02.html');
const DAG_2023_KV = fx('ihf-dag-2023-01-25.html');
const KAMP_BRONZE = fx('ihf-kamp-2025-202123.html');
const KAMP_FORL = fx('ihf-kamp-2023-119085.html');
const KAMP_STRAFFE = fx('ihf-kamp-2021-26809.html');
const KAMP_2027 = fx('ihf-kamp-2027-307515.html');

/** Erstat ÉN forekomst — efter `efter`, hvis givet. Kaster, hvis teksten ikke findes. */
function erstat(html, fra, til, efter = '') {
  const start = efter ? html.indexOf(efter) : 0;
  if (start < 0) throw new Error(`testfejl: ankeret «${efter}» findes ikke`);
  const i = html.indexOf(fra, start);
  if (i < 0) throw new Error(`testfejl: «${fra}» findes ikke${efter ? ` efter «${efter}»` : ''}`);
  return html.slice(0, i) + til + html.slice(i + fra.length);
}

/** Erstat ALLE forekomster. Kaster, hvis der ingen er. */
function erstatAlle(html, fra, til) {
  if (!html.includes(fra)) throw new Error(`testfejl: «${fra}» findes ikke`);
  return html.split(fra).join(til);
}

/** Forventer et IhfStrukturFejl-kast, hvis besked matcher. */
function kaster(fn, moenster) {
  let fanget;
  try {
    fn();
  } catch (e) {
    fanget = e;
  }
  expect(fanget, 'skulle have kastet').toBeInstanceOf(IhfStrukturFejl);
  expect(fanget.message).toMatch(moenster);
  return fanget;
}

/** Den ægte fejltekst, ihf.info svarede med for en ugyldig adresse under probningen 1/11 2026. */
const IHF_FEJLSIDE = 'The website encountered an unexpected error. Please try again later.';

// ---------------------------------------------------------------------------

describe('STATUS — det lukkede sæt', () => {
  it('kender præcis to koder: ikke spillet og slut', () => {
    expect(STATUS).toEqual({ '': 'planlagt', E: 'slut' });
    expect(Object.isFrozen(STATUS)).toBe(true);
  });

  it('perioderne har IHF\'s element-id\'er (fem stk., i rækkefølge)', () => {
    expect(PERIODE_ID).toEqual({
      h1: 'fh-goals', h2: 'sh-goals', ot1: 'fot-1-score', ot2: 'fot-2-score', straffe: 'penalty-score',
    });
  });
});

describe('konkurrenceIdAf / kalenderAf', () => {
  it('læser konkurrence-id\'et af den kanoniske adresse', () => {
    expect(konkurrenceIdAf(DAG_2027, 'matches')).toBe(263667);
    expect(konkurrenceIdAf(DAG_2025, 'matches')).toBe(177649);
    expect(konkurrenceIdAf(DAG_2023_KV, 'matches')).toBe(101253); // «/Men/» med stort M
    expect(konkurrenceIdAf(KAMP_BRONZE, 'match-center')).toBe(177649);
  });

  it('skelner sideform: en kampside er ikke en dagside', () => {
    expect(konkurrenceIdAf(KAMP_BRONZE, 'matches')).toBeNull();
    expect(konkurrenceIdAf(DAG_2025, 'match-center')).toBeNull();
    expect(konkurrenceIdAf(IHF_FEJLSIDE, 'matches')).toBeNull();
  });

  it('kalenderen er VM 2027\'s 17 spilledage', () => {
    const k = kalenderAf(DAG_2027);
    expect(k).toHaveLength(17);
    expect(k[0]).toBe('2027-01-13');
    expect(k.slice(-3)).toEqual(['2027-01-27', '2027-01-29', '2027-01-31']);
    expect(k).not.toContain('2027-01-28'); // hviledag
  });
});

// ---------------------------------------------------------------------------

describe('parseDagside — ægte sider', () => {
  it('VM 2025 finaledag: bronze 35-34 og finalen 26-32, begge slut', () => {
    expect(parseDagside(DAG_2025)).toEqual([
      {
        ihfId: 202123, fase: 'Bronze Medal Match', gruppe: null, by: 'Oslo', hal: 'Unity Arena',
        hjemme: 'France', hjemmeId: 117, ude: 'Portugal', udeId: 5647,
        status: 'slut', score: { h: 35, u: 34 }, dato: '2025-02-02', lokalTid: '15:00', gmtTid: '14:00',
      },
      {
        ihfId: 202125, fase: 'Finals', gruppe: null, by: 'Oslo', hal: 'Unity Arena',
        hjemme: 'Croatia', hjemmeId: 123, ude: 'Denmark', udeId: 116,
        status: 'slut', score: { h: 26, u: 32 }, dato: '2025-02-02', lokalTid: '18:00', gmtTid: '17:00',
      },
    ]);
  });

  it('GMT læses af teksten, ikke af <time datetime="…Z"> (der er lokal tid med forkert Z)', () => {
    expect(DAG_2025).toContain('datetime="2025-02-02T15:00:00Z"'); // fixturen er hvad vi tror
    const [bronze] = parseDagside(DAG_2025);
    expect(bronze.gmtTid).toBe('14:00');
    expect(bronze.gmtTid).not.toBe('15:00');
  });

  it('VM 2027 dag 1: fire kampe, ikke spillet, ingen score og INGEN tid (00:00 = ikke sat)', () => {
    const kampe = parseDagside(DAG_2027);
    expect(kampe.map((k) => k.ihfId)).toEqual([307515, 307527, 307513, 307525]);
    expect(kampe[0]).toEqual({
      ihfId: 307515, fase: 'Preliminary round', gruppe: 'Group A', by: 'Munich', hal: 'SAP Garden',
      hjemme: 'Germany', hjemmeId: 115, ude: 'Tunisia', udeId: 129,
      status: 'planlagt', score: null, dato: '2027-01-13', lokalTid: null, gmtTid: null,
    });
    for (const k of kampe) {
      expect(k.status).toBe('planlagt');
      expect(k.score).toBeNull();
      expect(k.lokalTid).toBeNull();
      expect(k.gmtTid).toBeNull();
    }
    expect(JSON.stringify(kampe)).not.toContain('00:00');
    expect(kampe.map((k) => k.gruppe)).toEqual(['Group A', 'Group B', 'Group A', 'Group B']);
  });

  it('00:00 er kun «ikke sat», når BEGGE tider står som 00:00', () => {
    // Lokal 01:00 / GMT 00:00 er et ægte (om end usandsynligt) klokkeslæt.
    const html = erstat(DAG_2027, '>00:00</time>', '>01:00</time>', 'match-time-307513');
    const kamp = parseDagside(html).find((k) => k.ihfId === 307513);
    expect(kamp.lokalTid).toBe('01:00');
    expect(kamp.gmtTid).toBe('00:00');
    // … og naboen er urørt.
    expect(parseDagside(html).find((k) => k.ihfId === 307515).gmtTid).toBeNull();
  });

  it('en sat tid kommer igennem som HH:MM', () => {
    let html = erstat(DAG_2027, '>00:00</time>', '>18:00</time>', 'match-time-307513');
    html = erstat(html, 'GMT 00:00', 'GMT 17:00', 'match-time-307513');
    const kamp = parseDagside(html).find((k) => k.ihfId === 307513);
    expect(kamp).toMatchObject({ lokalTid: '18:00', gmtTid: '17:00', dato: '2027-01-13' });
  });

  it('VM 2027 semifinaledag: pladsholdere uden hold-id, og placeringskampe har deres egen fase', () => {
    const kampe = parseDagside(DAG_2027_SF);
    const sf = kampe.filter((k) => k.fase === 'Semi-finals');
    expect(sf.map((k) => [k.hjemme, k.ude])).toEqual([['W QF1', 'W QF3'], ['W QF2', 'W QF4']]);
    for (const k of kampe) {
      expect(k.hjemmeId).toBeNull();
      expect(k.udeId).toBeNull();
    }
    expect(kampe.filter((k) => k.fase === 'Placement matches 5-8')).toHaveLength(2);
  });

  it('VM 2023 kvartfinaledag: dagsidens score er slutresultatet INKL. forlængelse', () => {
    const norgeSpanien = parseDagside(DAG_2023_KV).find((k) => k.ihfId === 119085);
    expect(norgeSpanien).toMatchObject({ fase: 'Quarter finals', gruppe: null, hjemme: 'Norway', ude: 'Spain' });
    expect(norgeSpanien.score).toEqual({ h: 34, u: 35 });
    // Samme kamp på kampsiden: 25-25 efter 60 minutter. Dagsiden kan altså
    // ikke bære knockout-facit — det kan kun kampsidens halvlege.
    const kamp = parseKampside(KAMP_FORL);
    expect(kamp.slut).toEqual(norgeSpanien.score);
    expect(kamp.efter60).toEqual({ h: 25, u: 25 });
  });

  it('holdnavne afkodes (HTML-entiteter) og trimmes', () => {
    const html = erstat(DAG_2025, '>Portugal</a>', '> Côte d&#039;Ivoire &amp; Co </a>');
    expect(parseDagside(html)[0].ude).toBe("Côte d'Ivoire & Co");
  });
});

describe('parseDagside — struktur-vagterne kaster (en tom liste er ALDRIG «intet facit endnu»)', () => {
  it('fejlside uden konkurrence-markør kaster og citerer sidens tekst', () => {
    const e = kaster(() => parseDagside(IHF_FEJLSIDE), /ingen konkurrence-markør/);
    expect(e.message).toContain('The website encountered an unexpected error');
    expect(e.name).toBe('IhfStrukturFejl');
  });

  it('en kampside givet som dagside kaster (forkert sideform)', () => {
    kaster(() => parseDagside(KAMP_BRONZE), /ligner ikke en IHF-dagside/);
  });

  it('ingen streng kaster i stedet for at returnere []', () => {
    kaster(() => parseDagside(undefined), /ingen konkurrence-markør/);
  });

  it('kalender med datoer, men 0 kampe, kaster', () => {
    let html = erstatAlle(DAG_2027, '<div class="matchDetails"', '<div class="kampDetaljer"');
    html = erstatAlle(html, 'data-ihf-competitions-match-id=', 'data-kamp-id=');
    const e = kaster(() => parseDagside(html), /17 spilledage i kalenderen .*men 0 kampe/);
    expect(e.message).toContain('2027-01-13 … 2027-01-31');
    expect(e.message).not.toContain('mangler både');
  });

  it('hverken kalender eller kampmarkører kaster med sin egen besked', () => {
    let html = erstatAlle(DAG_2027, '<div class="matchDetails"', '<div class="kampDetaljer"');
    html = erstatAlle(html, 'data-ihf-competitions-match-id=', 'data-kamp-id=');
    html = erstatAlle(html, 'class="groupDate', 'class="dato');
    expect(kalenderAf(html)).toEqual([]);
    kaster(() => parseDagside(html), /mangler både kalender og kampmarkører/);
  });

  it('flere kamp-id\'er end kampblokke kaster (markuppen er ændret for én kamp)', () => {
    const html = erstat(DAG_2027, '<div class="matchDetails"', '<div class="kampDetaljer"');
    kaster(() => parseDagside(html), /4 kamp-id'er, men 3 kampblokke/);
  });

  it('ukendt status-kode kaster og tolkes ikke som slut', () => {
    const html = erstat(DAG_2025, 'data-ihf-competitions-match-status="E"', 'data-ihf-competitions-match-status="F"',
      'data-ihf-competitions-match-id="202125"');
    const e = kaster(() => parseDagside(html), /ukendt status-kode «F» for kamp 202125/);
    expect(e.message).toContain("Kendte koder: '' (ikke spillet) og 'E' (slut)");
  });

  it('score med kolon i stedet for bindestreg kaster', () => {
    const html = erstat(DAG_2025, '>26-32<', '>26:32<');
    kaster(() => parseDagside(html), /scoren «26:32» for kamp 202125 har et uventet format/);
  });

  it('score med suffiks kaster', () => {
    const html = erstat(DAG_2025, '>35-34<', '>35-34 e.f.<');
    kaster(() => parseDagside(html), /scoren «35-34 e\.f\.» for kamp 202123/);
  });

  it('en ikke-spillet kamp med en score i stedet for «VS» kaster (ukendt tilstand, fx live)', () => {
    const html = erstat(DAG_2027, '>VS<', '>12-10<', 'ihf-competitions-score-307513');
    kaster(() => parseDagside(html), /kamp 307513 er ikke spillet, men score-feltet viser «12-10»/);
  });

  it('manglende score-felt kaster', () => {
    const html = erstat(DAG_2025, 'id="ihf-competitions-score-202125"', 'id="score-202125"');
    kaster(() => parseDagside(html), /kamp 202125 mangler sit score-felt/);
  });

  it('tom fase kaster', () => {
    const html = erstat(DAG_2025, '>Finals</div>', '> </div>');
    kaster(() => parseDagside(html), /kamp 202125 har en tom fase/);
  });

  it('manglende fase/gruppe-felt kaster', () => {
    const html = erstat(DAG_2025, 'class="groupName', 'class="gruppeNavn', 'data-ihf-competitions-match-id="202125"');
    kaster(() => parseDagside(html), /kamp 202125 mangler fase\/gruppe/);
  });

  it('et manglende holdfelt kaster', () => {
    const html = erstat(DAG_2025, '<div class="country', '<div class="land', 'data-ihf-competitions-match-id="202125"');
    kaster(() => parseDagside(html), /kamp 202125 har 1 holdfelter, ikke 2/);
  });

  it('et hold uden navn kaster', () => {
    const html = erstat(DAG_2025, '>Croatia</a>', '></a>');
    kaster(() => parseDagside(html), /hjemmeholdet for kamp 202125 har intet navn/);
  });

  it('manglende tid kaster', () => {
    const html = erstat(DAG_2025, 'Local time', 'Lokal tid', 'data-ihf-competitions-match-id="202125"');
    kaster(() => parseDagside(html), /kamp 202125 mangler sin tid/);
  });

  it('tid i uventet format kaster', () => {
    const html = erstat(DAG_2025, 'GMT 17:00', 'GMT 7:00');
    kaster(() => parseDagside(html), /tiden for kamp 202125 har et uventet format \(lokal «18:00», GMT «7:00»/);
  });
});

// ---------------------------------------------------------------------------

describe('parseKampside — ægte sider', () => {
  it('bronzekampen 2025: perioder 19-17/16-17, ingen forlængelse, efter60 = slut', () => {
    expect(parseKampside(KAMP_BRONZE)).toEqual({
      ihfId: 202123,
      status: 'slut',
      hjemme: 'France',
      ude: 'Portugal',
      lokalTid: '15:00',
      gmtTid: '14:00',
      by: 'Oslo',
      hal: 'Unity Arena',
      slut: { h: 35, u: 34 },
      perioder: {
        h1: { h: 19, u: 17 }, h2: { h: 16, u: 17 },
        ot1: { h: 0, u: 0 }, ot2: { h: 0, u: 0 }, straffe: { h: 0, u: 0 },
      },
      efter60: { h: 35, u: 34 },
    });
  });

  it('kvartfinalen 2023 (to forlængelser): 25-25 efter 60, 34-35 til slut', () => {
    const k = parseKampside(KAMP_FORL);
    expect(k).toMatchObject({ ihfId: 119085, hjemme: 'Norway', ude: 'Spain', by: 'Gdansk', hal: 'ERGO ARENA' });
    expect(k.perioder).toEqual({
      h1: { h: 13, u: 12 }, h2: { h: 12, u: 13 },
      ot1: { h: 4, u: 4 }, ot2: { h: 5, u: 6 }, straffe: { h: 0, u: 0 },
    });
    expect(k.efter60).toEqual({ h: 25, u: 25 });
    expect(k.slut).toEqual({ h: 34, u: 35 });
  });

  it('kvartfinalen 2021 (straffekast): slutscoren tæller straffene med', () => {
    const k = parseKampside(KAMP_STRAFFE);
    expect(k).toMatchObject({ ihfId: 26809, hjemme: 'Denmark', ude: 'Egypt', lokalTid: '18:30', gmtTid: '16:30' });
    expect(k.perioder.straffe).toEqual({ h: 4, u: 3 });
    expect(k.efter60).toEqual({ h: 28, u: 28 });
    // 28-28 + 6-6 + 1-1 + 4-3 = 39-38
    expect(k.slut).toEqual({ h: 39, u: 38 });
  });

  it('VM 2027, ikke spillet: 0:0 er ikke et resultat, og 00:00 er ikke en tid', () => {
    expect(parseKampside(KAMP_2027)).toEqual({
      ihfId: 307515,
      status: 'planlagt',
      hjemme: 'Germany',
      ude: 'Tunisia',
      lokalTid: null,
      gmtTid: null,
      by: 'Munich',
      hal: 'SAP Garden',
      slut: null,
      perioder: null,
      efter60: null,
    });
  });
});

describe('parseKampside — struktur-vagterne kaster', () => {
  it('fejlside uden konkurrence-markør kaster', () => {
    kaster(() => parseKampside(IHF_FEJLSIDE), /ligner ikke en IHF-kampside \(ingen konkurrence-markør/);
  });

  it('en dagside givet som kampside kaster', () => {
    kaster(() => parseKampside(DAG_2025), /ligner ikke en IHF-kampside/);
  });

  it('manglende kampmarkør kaster', () => {
    const html = erstat(KAMP_BRONZE, 'data-ihf-competitions-match-results-match-id=', 'data-kamp=');
    kaster(() => parseKampside(html), /kampsiden mangler sin kampmarkør/);
  });

  it('ukendt status-kode kaster', () => {
    const html = erstat(KAMP_BRONZE, 'match-results-match-status="E"', 'match-results-match-status="L"');
    kaster(() => parseKampside(html), /ukendt status-kode «L» for kamp 202123/);
  });

  it('manglende status kaster', () => {
    const html = erstat(KAMP_BRONZE, 'data-ihf-competitions-match-results-match-status=', 'data-status=');
    kaster(() => parseKampside(html), /kamp 202123 mangler sin status/);
  });

  it('slutscore med bindestreg i stedet for kolon kaster', () => {
    const html = erstat(KAMP_BRONZE, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">35-34</p>');
    kaster(() => parseKampside(html), /scoren «35-34» for kamp 202123 har et uventet format/);
  });

  it('manglende slutscore kaster', () => {
    const html = erstat(KAMP_BRONZE, 'id="result-a-b"', 'id="resultat"');
    kaster(() => parseKampside(html), /kamp 202123 mangler sin slutscore/);
  });

  it('manglende tid kaster', () => {
    const html = erstat(KAMP_BRONZE, 'class="time time-gmt"', 'class="tid"');
    kaster(() => parseKampside(html), /kamp 202123 mangler sin lokale tid eller GMT-tid/);
  });

  it('en ikke-spillet kamp med en anden score end 0:0 kaster (ukendt tilstand)', () => {
    const html = erstat(KAMP_2027, '<p id="result-a-b">0:0</p>', '<p id="result-a-b">3:2</p>');
    kaster(() => parseKampside(html), /kamp 307515 er ikke spillet, men slutscoren viser «3:2»/);
  });

  it('en periode, der ikke er et tal, kaster', () => {
    const html = erstat(KAMP_BRONZE, 'id="sh-goals-b" class="col-xs-4 bigFont">17<', 'id="sh-goals-b" class="col-xs-4 bigFont">–<');
    kaster(() => parseKampside(html), /perioden h2 \(sh-goals-b\) for kamp 202123 mangler eller har et uventet format \(«–»\)/);
  });

  it('en manglende periode kaster', () => {
    const html = erstat(KAMP_BRONZE, 'id="penalty-score-a"', 'id="straffe-a"');
    kaster(() => parseKampside(html), /perioden straffe \(penalty-score-a\) for kamp 202123 mangler/);
  });

  it('perioder, der ikke summerer til slutscoren, kaster', () => {
    const html = erstat(KAMP_BRONZE, 'id="fh-goals-a" class="col-xs-4 bigFont">19<', 'id="fh-goals-a" class="col-xs-4 bigFont">18<');
    const e = kaster(() => parseKampside(html), /perioderne summerer til 34-34, men slutscoren er 35-34/);
    expect(e.message).toContain('facit bruges ikke');
  });

  it('også udeholdets side af summen er bevogtet', () => {
    const html = erstat(KAMP_BRONZE, 'id="sh-goals-b" class="col-xs-4 bigFont">17<', 'id="sh-goals-b" class="col-xs-4 bigFont">16<');
    kaster(() => parseKampside(html), /perioderne summerer til 35-33, men slutscoren er 35-34/);
  });

  it('forlængelse fra en stilling, der ikke var lige efter 60, kaster', () => {
    // Summen passer stadig (35-35), men 26-25 efter 60 kan ikke føre til forlængelse.
    let html = erstat(KAMP_FORL, 'id="fh-goals-a" class="col-xs-4 bigFont">13<', 'id="fh-goals-a" class="col-xs-4 bigFont">14<');
    html = erstat(html, '<p id="result-a-b">34:35</p>', '<p id="result-a-b">35:35</p>');
    const e = kaster(() => parseKampside(html), /forlængelse\/straffekast, men halvlegene giver 26-25 efter 60 minutter/);
    expect(e.message).toContain('ikke uafgjort');
    expect(e.message).not.toMatch(/summerer/);
  });

  it('straffekast fra en stilling, der ikke var lige efter forlængelsen, kaster', () => {
    // 28-28 efter 60 er lige, men 6-6 + 2-1 giver 36-35 — så skulle der ikke have været straffe.
    let html = erstat(KAMP_STRAFFE, 'id="fot-2-score-a" class="col-xs-4 bigFont">1<', 'id="fot-2-score-a" class="col-xs-4 bigFont">2<');
    html = erstat(html, '<p id="result-a-b">39:38</p>', '<p id="result-a-b">40:38</p>');
    kaster(() => parseKampside(html), /straffekast, men stillingen efter forlængelsen er 36-35/);
  });

  it('også en forlængelse, der kun står i 2. forlængelse, tæller som forlængelse', () => {
    // ot1 0-0, ot2 1-0 efter 35-34: summen passer (36-34), men der var ikke lige efter 60.
    let html = erstat(KAMP_BRONZE, 'id="fot-2-score-a" class="col-xs-4 bigFont">0<', 'id="fot-2-score-a" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">36:34</p>');
    kaster(() => parseKampside(html), /forlængelse\/straffekast, men halvlegene giver 35-34 efter 60 minutter/);
  });

  it('straffekast alene fra en ulige 60-minutters-stilling kaster', () => {
    // Ingen forlængelse, men straffe 1-0 efter 35-34: summen passer (36-34), stillingen gør ikke.
    let html = erstat(KAMP_BRONZE, 'id="penalty-score-a" class="col-xs-4 bigFont">0<', 'id="penalty-score-a" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">36:34</p>');
    kaster(() => parseKampside(html), /halvlegene giver 35-34 efter 60 minutter/);
  });

  it('uafgjort efter 60 uden forlængelse er et gyldigt facit (gruppekamp)', () => {
    let html = erstat(KAMP_BRONZE, 'id="sh-goals-b" class="col-xs-4 bigFont">17<', 'id="sh-goals-b" class="col-xs-4 bigFont">18<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">35:35</p>');
    const k = parseKampside(html);
    expect(k.efter60).toEqual({ h: 35, u: 35 });
    expect(k.slut).toEqual({ h: 35, u: 35 });
  });
});
