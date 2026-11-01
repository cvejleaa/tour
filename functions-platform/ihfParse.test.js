// Tests for IHF-parseren (håndbold-VM 2027) — mod ÆGTE sider fra ihf.info.
//
// Fixtures i testdata/ihf-*.html er hentet af scripts/probe-ihf.mjs og er
// valgt på hvad de DÆKKER, ikke på hvad der var nemt:
//
//   ihf-dag-2027-01-13.html   VM 2027, dag 1: status '', «VS», tider 00:00
//   ihf-dag-2027-01-29.html   VM 2027, semifinaledag: pladsholdere «W QF1»
//   ihf-dag-2025-02-02.html   VM 2025, finaledag: finale 26-32, bronze 35-34
//   ihf-dag-2023-01-25.html   VM 2023, kvartfinaler: 34-35 er INKL. forlængelse
//   ihf-dag-2025-01-22.html   VM 2025, hovedrunde «Main Round IV» OG «President's Cup II» samme dag
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
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const {
  STATUS, PERIODE_ID, IhfStrukturFejl, parseDagside, parseKampside, konkurrenceIdAf, kampIdAf, kalenderAf,
} = require('./ihfParse');

const fx = (navn) => readFileSync(new URL(`./testdata/${navn}`, import.meta.url), 'utf8');
const DAG_2027 = fx('ihf-dag-2027-01-13.html');
const DAG_2027_SF = fx('ihf-dag-2027-01-29.html');
const DAG_2025 = fx('ihf-dag-2025-02-02.html');
const DAG_2023_KV = fx('ihf-dag-2023-01-25.html');
const DAG_2025_HR = fx('ihf-dag-2025-01-22.html');
const KAMP_BRONZE = fx('ihf-kamp-2025-202123.html');
const KAMP_FORL = fx('ihf-kamp-2023-119085.html');
const KAMP_STRAFFE = fx('ihf-kamp-2021-26809.html');
const KAMP_2027 = fx('ihf-kamp-2027-307515.html');
const MARKOER_KAMP = 'data-ihf-competitions-match-results-match-id=';

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
  // Præfikset er det, Drift-kortet og alarmen viser først.
  expect(fanget.message).toMatch(/^IHF: /);
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
    expect(konkurrenceIdAf(DAG_2023_KV, 'matches')).toBe(101253);
    expect(konkurrenceIdAf(KAMP_BRONZE, 'match-center')).toBe(177649);
  });

  it('køns-segmentet er ikke låst til «men»: 2021/2023 skriver «/Men/» med stort M, 2025/2027 «/men/»', () => {
    // Fixturerne er hvad vi tror: begge stavemåder findes i ægte sider.
    expect(DAG_2023_KV).toContain('ihf.info/competitions/Men/308/');
    expect(DAG_2025).toContain('ihf.info/competitions/men/308/');
    expect(konkurrenceIdAf(KAMP_FORL, 'match-center')).toBe(101253);
    expect(konkurrenceIdAf(KAMP_STRAFFE, 'match-center')).toBe(22415);
    // Samme side med lille m giver samme id — stavemåden afgør intet.
    const smaat = erstat(DAG_2023_KV, 'competitions/Men/308/', 'competitions/men/308/', 'rel="canonical"');
    expect(konkurrenceIdAf(smaat, 'matches')).toBe(101253);
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
        status: 'slut', statusKode: 'E', slutScore: { h: 35, u: 34 }, dato: '2025-02-02', lokalTid: '15:00', gmtTid: '14:00',
      },
      {
        ihfId: 202125, fase: 'Finals', gruppe: null, by: 'Oslo', hal: 'Unity Arena',
        hjemme: 'Croatia', hjemmeId: 123, ude: 'Denmark', udeId: 116,
        status: 'slut', statusKode: 'E', slutScore: { h: 26, u: 32 }, dato: '2025-02-02', lokalTid: '18:00', gmtTid: '17:00',
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
      status: 'planlagt', statusKode: '', slutScore: null, dato: '2027-01-13', lokalTid: null, gmtTid: null,
    });
    for (const k of kampe) {
      expect(k.status).toBe('planlagt');
      expect(k.slutScore).toBeNull();
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
    expect(norgeSpanien.slutScore).toEqual({ h: 34, u: 35 });
    // Samme kamp på kampsiden: 25-25 efter 60 minutter. Dagsiden kan altså
    // ikke bære knockout-facit — det kan kun kampsidens halvlege.
    const kamp = parseKampside(KAMP_FORL, { ihfId: 119085 });
    expect(kamp.slut).toEqual(norgeSpanien.slutScore);
    expect(kamp.efter60).toEqual({ h: 25, u: 25 });
  });

  it('holdnavne afkodes (HTML-entiteter) og trimmes', () => {
    const html = erstat(DAG_2025, '>Portugal</a>', '> Côte d&#039;Ivoire &amp; Co </a>');
    expect(parseDagside(html)[0].ude).toBe("Côte d'Ivoire & Co");
  });

  it('hex-entiteter afkodes også (&#x27; er Drupals apostrof)', () => {
    const html = erstat(DAG_2025, '>Portugal</a>', '>Côte d&#x27;Ivoire &#X26; Co</a>');
    const ude = parseDagside(html)[0].ude;
    expect(ude).toBe("Côte d'Ivoire & Co");
    expect(ude).not.toContain('&#x');
  });

  it('navngivne entiteter i holdnavn og hal: apos, quot, lt, gt, nbsp', () => {
    let html = erstat(DAG_2025, '>Croatia</a>', '>&quot;Hrvatska&quot;&nbsp;&lt;HR&gt; d&apos;Or</a>');
    html = erstat(html, 'Oslo / Unity Arena', 'Oslo / Unity&nbsp;&quot;Arena&quot; &lt;N&gt; l&apos;Est',
      'data-ihf-competitions-match-id="202125"');
    const finale = parseDagside(html)[1];
    expect(finale.hjemme).toBe('"Hrvatska" <HR> d\'Or');
    expect(finale).toMatchObject({ by: 'Oslo', hal: 'Unity "Arena" <N> l\'Est' });
    expect(JSON.stringify(finale)).not.toMatch(/&(quot|nbsp|lt|gt|apos);/);
  });

  it('entiteter afkodes i ÉT gennemløb — «&#38;lt;» bliver «&lt;», ikke «<»', () => {
    const html = erstat(DAG_2025, '>Portugal</a>', '>A &#38;lt; B</a>');
    expect(parseDagside(html)[0].ude).toBe('A &lt; B');
  });

  it('fase og gruppe skilles også, når linjeskiftet står som <br/> eller <BR />', () => {
    // Skilles de ikke, bliver «Preliminary round Group A» til fasen og gruppen null — tavst forkert.
    for (const br of ['<br/>', '<BR />']) {
      const html = erstat(DAG_2027, 'Preliminary round <br> Group A', `Preliminary round ${br} Group A`);
      expect(parseDagside(html)[0], br).toMatchObject({ fase: 'Preliminary round', gruppe: 'Group A' });
    }
  });

  it('en hal uden skråstreg er hele hallen (ingen by) — og en tom hal er ingen af dem', () => {
    let html = erstat(DAG_2025, 'Oslo / Unity Arena', 'Unity Arena', 'data-ihf-competitions-match-id="202125"');
    expect(parseDagside(html)[1]).toMatchObject({ by: null, hal: 'Unity Arena' });
    html = erstat(DAG_2025, 'Oslo / Unity Arena', '', 'data-ihf-competitions-match-id="202125"');
    const finale = parseDagside(html)[1];
    expect(finale.by).toBeNull();
    expect(finale.hal).toBeNull();
  });

  it('store bogstaver i en entitet (&AMP;) afkodes; en ukendt (&eacute;) lades stå — ikke sluges', () => {
    // Sluges den, bliver «Cur&ccedil;ao» til «Curao» og kan matche et forkert hold
    // uden en lyd; står den, fejler holdopslaget højlydt.
    const html = erstat(DAG_2025, '>Portugal</a>', '>A &AMP; B &eacute;</a>');
    expect(parseDagside(html)[0].ude).toBe('A & B &eacute;');
  });

  it('tegn uden for det basale plan afkodes som ét tegn (decimal og hex)', () => {
    const html = erstat(DAG_2025, '>Portugal</a>', '>A &#128512; B &#x1F600;</a>');
    expect(parseDagside(html)[0].ude).toBe('A \u{1F600} B \u{1F600}');
  });

  it('mellemrum og linjeskift i et holdnavn samles til ét mellemrum', () => {
    const html = erstat(DAG_2025, '>Portugal</a>', '>South\n        Korea   </a>');
    expect(parseDagside(html)[0].ude).toBe('South Korea');
  });

  it('score-feltet skal tilhøre kampen: et felt med et andet id tæller ikke', () => {
    const html = erstat(DAG_2025, 'id="ihf-competitions-score-202123"', 'id="ihf-competitions-score-999999"');
    kaster(() => parseDagside(html), /kamp 202123 mangler sit score-felt/);
  });

  it.each(['1000-32', '26-1000'])('en score med fire cifre på den ene side kaster (%s)', (score) => {
    const html = erstat(DAG_2025, '>26-32<', `>${score}<`);
    kaster(() => parseDagside(html), new RegExp(`scoren «${score}» for kamp 202125 har et uventet format`));
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

  // Kamp-id'erne har ÉN vagt (én pr. kampblok, ingen før første blok). De fire
  // tests herunder er dens fire brudformer; en mutation af vagten gør dem røde.
  it('et kamp-id før første kampblok kaster (første blok har mistet sin markør)', () => {
    const html = erstat(DAG_2027, '<div class="matchDetails"', '<div class="kampDetaljer"');
    kaster(() => parseDagside(html), /4 kamp-id'er og 3 kampblokke.*før første kampblok står 1/);
  });

  it('to kampe slået sammen i én blok kaster', () => {
    const html = erstat(DAG_2027, '<div class="matchDetails"', '<div class="kampDetaljer"',
      'data-ihf-competitions-match-id="307527"');
    kaster(() => parseDagside(html), /4 kamp-id'er og 3 kampblokke.*kampblok 2 har 2/);
  });

  it('en kampblok uden kamp-id kaster', () => {
    const html = erstat(DAG_2025, 'data-ihf-competitions-match-id="202125"', 'data-kamp-id="202125"');
    kaster(() => parseDagside(html), /1 kamp-id'er og 2 kampblokke.*kampblok 2 har 0/);
  });

  it('en blok uden id og et id uden for blokkene kaster, selv om optællingen går op', () => {
    let html = erstat(DAG_2025, 'data-ihf-competitions-match-id="202125"', 'data-kamp-id="202125"');
    html = erstat(html, '<body', '<i data-ihf-competitions-match-id="999"></i><body');
    const e = kaster(() => parseDagside(html), /2 kamp-id'er og 2 kampblokke.*før første kampblok står 1/);
    expect(e.name).toBe('IhfStrukturFejl');
  });

  it('to kampblokke med samme kamp-id kaster (hvilken af dem er kampen?)', () => {
    // Bronzekampens blok to gange: hvert id står i præcis én blok, så
    // én-pr.-blok-vagten er tilfreds — det er dubletten, der skal fanges.
    const [foer, ...blokke] = DAG_2025.split('<div class="matchDetails"');
    expect(blokke).toHaveLength(2);
    const html = [foer, blokke[0], ...blokke].join('<div class="matchDetails"');
    kaster(() => parseDagside(html), /dagsiden har kamp 202123 i to kampblokke/);
  });

  it('score med kolon i stedet for bindestreg kaster', () => {
    const html = erstat(DAG_2025, '>26-32<', '>26:32<');
    kaster(() => parseDagside(html), /scoren «26:32» for kamp 202125 har et uventet format/);
  });

  it('score med foranstillet tekst kaster', () => {
    const html = erstat(DAG_2025, '>35-34<', '>ca. 35-34<');
    kaster(() => parseDagside(html), /scoren «ca\. 35-34» for kamp 202123 har et uventet format/);
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

  it('manglende status kaster', () => {
    const html = erstat(DAG_2025, 'data-ihf-competitions-match-status="E"', 'data-status="E"',
      'data-ihf-competitions-match-id="202125"');
    kaster(() => parseDagside(html), /kamp 202125 mangler sin status/);
  });

  it('tre holdfelter kaster', () => {
    const html = erstat(DAG_2025, '<div class="country', '<div class="country ekstra"><span>Norway</span></div><div class="country',
      'data-ihf-competitions-match-id="202125"');
    kaster(() => parseDagside(html), /kamp 202125 har 3 holdfelter, ikke 2/);
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

  // Tidsformatet er strengt 00-23:00-59 og hele feltet: hver af de fire løsnede
  // regex-former (timer, minutter, uden ^, uden $) har sin røde test.
  it.each([
    ['25:00', 'timer over 23'],
    ['24:00', 'timer = 24 (midnat hedder 00:00)'],
    ['12:60', 'minutter over 59'],
    ['12:5', 'ét ciffer i minutterne'],
    ['18:00 h', 'suffiks efter tiden'],
    ['kl. 18:00', 'tekst foran tiden'],
  ])('tiden «%s» kaster (%s)', (tid) => {
    const html = erstat(DAG_2025, '>18:00</time>', `>${tid}</time>`, 'match-time-202125');
    kaster(() => parseDagside(html), new RegExp(`tiden for kamp 202125 har et uventet format \\(lokal «${tid.replace('.', '\\.')}»`));
  });

  it('også GMT-tiden er streng (25:00)', () => {
    const html = erstat(DAG_2025, 'GMT 17:00', 'GMT 25:00');
    kaster(() => parseDagside(html), /tiden for kamp 202125 har et uventet format \(lokal «18:00», GMT «25:00»/);
  });

  it('grænserne 23:59 og 00:00/GMT 23:00 er gyldige tider', () => {
    let html = erstat(DAG_2025, '>18:00</time>', '>23:59</time>', 'match-time-202125');
    html = erstat(html, 'GMT 17:00', 'GMT 22:59');
    expect(parseDagside(html)[1]).toMatchObject({ lokalTid: '23:59', gmtTid: '22:59' });
  });
});

// ---------------------------------------------------------------------------

describe('parseKampside — ægte sider', () => {
  it('bronzekampen 2025: perioder 19-17/16-17, ingen forlængelse, efter60 = slut', () => {
    expect(parseKampside(KAMP_BRONZE, { ihfId: 202123 })).toEqual({
      ihfId: 202123,
      status: 'slut',
      statusKode: 'E',
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
      afgjort: 'ordinaer',
    });
  });

  it('kvartfinalen 2023 (to forlængelser): 25-25 efter 60, 34-35 til slut', () => {
    const k = parseKampside(KAMP_FORL, { ihfId: 119085 });
    expect(k).toMatchObject({ ihfId: 119085, hjemme: 'Norway', ude: 'Spain', by: 'Gdansk', hal: 'ERGO ARENA' });
    expect(k.perioder).toEqual({
      h1: { h: 13, u: 12 }, h2: { h: 12, u: 13 },
      ot1: { h: 4, u: 4 }, ot2: { h: 5, u: 6 }, straffe: { h: 0, u: 0 },
    });
    expect(k.efter60).toEqual({ h: 25, u: 25 });
    expect(k.slut).toEqual({ h: 34, u: 35 });
    expect(k.afgjort).toBe('forlaenget');
  });

  it('kvartfinalen 2021 (straffekast): slutscoren tæller straffene med', () => {
    const k = parseKampside(KAMP_STRAFFE, { ihfId: 26809 });
    expect(k).toMatchObject({ ihfId: 26809, hjemme: 'Denmark', ude: 'Egypt', lokalTid: '18:30', gmtTid: '16:30' });
    expect(k.perioder.straffe).toEqual({ h: 4, u: 3 });
    expect(k.efter60).toEqual({ h: 28, u: 28 });
    // 28-28 + 6-6 + 1-1 + 4-3 = 39-38
    expect(k.slut).toEqual({ h: 39, u: 38 });
    expect(k.afgjort).toBe('straffe');
  });

  it('VM 2027, ikke spillet: 0:0 er ikke et resultat, og 00:00 er ikke en tid', () => {
    expect(parseKampside(KAMP_2027, { ihfId: 307515 })).toEqual({
      ihfId: 307515,
      status: 'planlagt',
      statusKode: '',
      hjemme: 'Germany',
      ude: 'Tunisia',
      lokalTid: null,
      gmtTid: null,
      by: 'Munich',
      hal: 'SAP Garden',
      slut: null,
      perioder: null,
      efter60: null,
      afgjort: null,
    });
  });
});

describe('parseKampside — struktur-vagterne kaster', () => {
  it('fejlside uden konkurrence-markør kaster', () => {
    kaster(() => parseKampside(IHF_FEJLSIDE, { ihfId: 202123 }), /ligner ikke en IHF-kampside \(ingen konkurrence-markør/);
  });

  it('en dagside givet som kampside kaster', () => {
    kaster(() => parseKampside(DAG_2025, { ihfId: 202123 }), /ligner ikke en IHF-kampside/);
  });

  it('manglende kampmarkør kaster', () => {
    const html = erstat(KAMP_BRONZE, 'data-ihf-competitions-match-results-match-id=', 'data-kamp=');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kampsiden mangler sin kampmarkør/);
  });


  it('manglende status kaster', () => {
    const html = erstat(KAMP_BRONZE, 'data-ihf-competitions-match-results-match-status=', 'data-status=');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kamp 202123 mangler sin status/);
  });

  it('slutscore med bindestreg i stedet for kolon kaster', () => {
    const html = erstat(KAMP_BRONZE, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">35-34</p>');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /scoren «35-34» for kamp 202123 har et uventet format/);
  });

  it('manglende slutscore kaster', () => {
    const html = erstat(KAMP_BRONZE, 'id="result-a-b"', 'id="resultat"');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kamp 202123 mangler sin slutscore/);
  });

  it('manglende resultatkort kaster i stedet for at give hold = null', () => {
    const html = erstat(KAMP_BRONZE, 'resultCardBody', 'resultatKort');
    const e = kaster(() => parseKampside(html, { ihfId: 202123 }), /kamp 202123 mangler sit resultatkort \(resultCardBody\)/);
    expect(e.message).toContain('holdene kan ikke læses');
  });

  it('holdene læses i resultatkortet, ikke fra et andet «country»-felt tidligere på siden', () => {
    const html = erstat(KAMP_BRONZE, '<div class="resultCardBody',
      '<div class="country nabo"><span>Sweden</span></div><div class="country nabo"><span>Spain</span></div><div class="resultCardBody');
    expect(html.indexOf('<span>Sweden</span>')).toBeLessThan(html.indexOf('resultCardBody'));
    expect(parseKampside(html, { ihfId: 202123 })).toMatchObject({ hjemme: 'France', ude: 'Portugal' });
  });

  it('et resultatkort med kun ét hold kaster', () => {
    const html = erstat(KAMP_BRONZE, '<div class="country', '<div class="land', 'id="result-a-b"');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kamp 202123: resultatkortet har ikke to holdnavne \(fandt \["France"\]\)/);
  });

  it('et tomt holdnavn i resultatkortet kaster', () => {
    const html = erstat(KAMP_BRONZE, '<span>France</span>', '<span> </span>', 'resultCardBody');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kamp 202123: resultatkortet har ikke to holdnavne \(fandt \["","Portugal"\]\)/);
  });

  it('kampsidens tid er også streng («18:00 h» og «25:00»)', () => {
    kaster(() => parseKampside(erstat(KAMP_BRONZE, '<p class="time time-local">15:00</p>', '<p class="time time-local">15:00 h</p>'), { ihfId: 202123 }),
      /tiden for kamp 202123 har et uventet format \(lokal «15:00 h»/);
    kaster(() => parseKampside(erstat(KAMP_BRONZE, '14:00 <small>GMT', '25:00 <small>GMT'), { ihfId: 202123 }),
      /tiden for kamp 202123 har et uventet format \(lokal «15:00», GMT «25:00»/);
  });

  it('manglende tid kaster', () => {
    const html = erstat(KAMP_BRONZE, 'class="time time-gmt"', 'class="tid"');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kamp 202123 mangler sin lokale tid eller GMT-tid/);
  });

  it('en ikke-spillet kamp med en anden score end 0:0 kaster (ukendt tilstand)', () => {
    const html = erstat(KAMP_2027, '<p id="result-a-b">0:0</p>', '<p id="result-a-b">3:2</p>');
    kaster(() => parseKampside(html, { ihfId: 307515 }), /kamp 307515 er ikke spillet, men slutscoren viser «3:2»/);
  });

  it('en periode, der ikke er et tal, kaster', () => {
    const html = erstat(KAMP_BRONZE, 'id="sh-goals-b" class="col-xs-4 bigFont">17<', 'id="sh-goals-b" class="col-xs-4 bigFont">–<');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /perioden h2 \(sh-goals-b\) for kamp 202123 mangler eller har et uventet format \(«–»\)/);
  });

  it('en manglende periode kaster', () => {
    const html = erstat(KAMP_BRONZE, 'id="penalty-score-a"', 'id="straffe-a"');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /perioden straffe \(penalty-score-a\) for kamp 202123 mangler/);
  });

  it('perioder, der ikke summerer til slutscoren, kaster', () => {
    const html = erstat(KAMP_BRONZE, 'id="fh-goals-a" class="col-xs-4 bigFont">19<', 'id="fh-goals-a" class="col-xs-4 bigFont">18<');
    const e = kaster(() => parseKampside(html, { ihfId: 202123 }), /perioderne summerer til 34-34, men slutscoren er 35-34/);
    expect(e.message).toContain('facit bruges ikke');
  });

  it('også udeholdets side af summen er bevogtet', () => {
    const html = erstat(KAMP_BRONZE, 'id="sh-goals-b" class="col-xs-4 bigFont">17<', 'id="sh-goals-b" class="col-xs-4 bigFont">16<');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /perioderne summerer til 35-33, men slutscoren er 35-34/);
  });

  it('forlængelse fra en stilling, der ikke var lige efter 60, kaster', () => {
    // Summen passer stadig (35-35), men 26-25 efter 60 kan ikke føre til forlængelse.
    let html = erstat(KAMP_FORL, 'id="fh-goals-a" class="col-xs-4 bigFont">13<', 'id="fh-goals-a" class="col-xs-4 bigFont">14<');
    html = erstat(html, '<p id="result-a-b">34:35</p>', '<p id="result-a-b">35:35</p>');
    const e = kaster(() => parseKampside(html, { ihfId: 119085 }), /forlængelse\/straffekast, men halvlegene giver 26-25 efter 60 minutter/);
    expect(e.message).toContain('ikke uafgjort');
    expect(e.message).not.toMatch(/summerer/);
  });

  it('straffekast fra en stilling, der ikke var lige efter forlængelsen, kaster', () => {
    // 28-28 efter 60 er lige, men 6-6 + 2-1 giver 36-35 — så skulle der ikke have været straffe.
    let html = erstat(KAMP_STRAFFE, 'id="fot-2-score-a" class="col-xs-4 bigFont">1<', 'id="fot-2-score-a" class="col-xs-4 bigFont">2<');
    html = erstat(html, '<p id="result-a-b">39:38</p>', '<p id="result-a-b">40:38</p>');
    kaster(() => parseKampside(html, { ihfId: 26809 }), /straffekast, men stillingen efter forlængelsen er 36-35/);
  });

  it('også en forlængelse, der kun står i 2. forlængelse, tæller som forlængelse', () => {
    // ot1 0-0, ot2 1-0 efter 35-34: summen passer (36-34), men der var ikke lige efter 60.
    let html = erstat(KAMP_BRONZE, 'id="fot-2-score-a" class="col-xs-4 bigFont">0<', 'id="fot-2-score-a" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">36:34</p>');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /forlængelse\/straffekast, men halvlegene giver 35-34 efter 60 minutter/);
  });

  it('straffekast alene fra en ulige 60-minutters-stilling kaster', () => {
    // Ingen forlængelse, men straffe 1-0 efter 35-34: summen passer (36-34), stillingen gør ikke.
    let html = erstat(KAMP_BRONZE, 'id="penalty-score-a" class="col-xs-4 bigFont">0<', 'id="penalty-score-a" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">36:34</p>');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /halvlegene giver 35-34 efter 60 minutter/);
  });

  it('forlængelse efter en stilling, hvor UDEholdet førte efter 60, kaster', () => {
    // Norge–Spanien 2023 med Spaniens 2. halvleg 13 → 14: 25-26 efter 60, men
    // stadig to forlængelser. Summen passer (34-36), stillingen gør ikke.
    let html = erstat(KAMP_FORL, 'id="sh-goals-b" class="col-xs-4 bigFont">13<', 'id="sh-goals-b" class="col-xs-4 bigFont">14<');
    html = erstat(html, '<p id="result-a-b">34:35</p>', '<p id="result-a-b">34:36</p>');
    // Ændringen landede: halvlegene ER nu 25-26 (ikke den ægte sides 25-25).
    expect(html).toContain('id="sh-goals-b" class="col-xs-4 bigFont">14<');
    expect(html).not.toContain('id="sh-goals-b" class="col-xs-4 bigFont">13<');
    kaster(() => parseKampside(html, { ihfId: 119085 }), /forlængelse\/straffekast, men halvlegene giver 25-26 efter 60 minutter/);
  });

  it('straffekast efter en forlængelse, hvor UDEholdet førte, kaster', () => {
    // Danmark–Egypten 2021 med Egyptens 2. forlængelse 1 → 2: 28-28 + 6-6 + 1-2 = 35-36.
    let html = erstat(KAMP_STRAFFE, 'id="fot-2-score-b" class="col-xs-4 bigFont">1<', 'id="fot-2-score-b" class="col-xs-4 bigFont">2<');
    html = erstat(html, '<p id="result-a-b">39:38</p>', '<p id="result-a-b">39:39</p>');
    kaster(() => parseKampside(html, { ihfId: 26809 }), /straffekast, men stillingen efter forlængelsen er 35-36/);
  });

  it('en forlængelse, hvor kun udeholdet scorer (0-1), tæller som forlængelse', () => {
    // Bronzekampen 2025 (35-34 efter 60) med Portugals 1. forlængelse 0 → 1.
    let html = erstat(KAMP_BRONZE, 'id="fot-1-score-b" class="col-xs-4 bigFont">0<', 'id="fot-1-score-b" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">35:35</p>');
    expect(html).toContain('id="fot-1-score-b" class="col-xs-4 bigFont">1<');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /forlængelse\/straffekast, men halvlegene giver 35-34 efter 60 minutter/);
  });

  it('straffekast, hvor kun udeholdet scorer (0-1), tæller som straffekast', () => {
    let html = erstat(KAMP_BRONZE, 'id="penalty-score-b" class="col-xs-4 bigFont">0<', 'id="penalty-score-b" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">35:35</p>');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /forlængelse\/straffekast, men halvlegene giver 35-34 efter 60 minutter/);
  });

  it('straffekast efter en forlængelse, hvor HJEMMEholdet førte i 1. forlængelse, kaster', () => {
    // Danmark–Egypten 2021 med Danmarks 1. forlængelse 6 → 7 og ingen 2. forlængelse:
    // 28-28 + 7-6 + 0-0 = 35-34, og så straffe 4-3 (slut 39:37). Kun straffe-vagten kan
    // fange den (2. forlængelse er 0-0) — og kun, hvis den tæller 1. forlængelse med.
    let html = erstat(KAMP_STRAFFE, 'id="fot-1-score-a" class="col-xs-4 bigFont">6<', 'id="fot-1-score-a" class="col-xs-4 bigFont">7<');
    html = erstat(html, 'id="fot-2-score-a" class="col-xs-4 bigFont">1<', 'id="fot-2-score-a" class="col-xs-4 bigFont">0<');
    html = erstat(html, 'id="fot-2-score-b" class="col-xs-4 bigFont">1<', 'id="fot-2-score-b" class="col-xs-4 bigFont">0<');
    html = erstat(html, '<p id="result-a-b">39:38</p>', '<p id="result-a-b">39:37</p>');
    const e = kaster(() => parseKampside(html, { ihfId: 26809 }), /straffekast, men stillingen efter forlængelsen er 35-34/);
    expect(e.message).not.toMatch(/2\. forlængelse/);
  });

  // 2. forlængelse spilles KUN, hvis 1. forlængelse endte lige. Før var en
  // forlængelse, «der udligner sig selv over de to perioder» (7-6 og 0-1),
  // asserteret som gyldig — den test fastfrøs en umulig kamp og er vendt her.
  it('2. forlængelse efter en 1. forlængelse, der ikke endte lige, kaster (7-6 og 0-1)', () => {
    // Danmark–Egypten 2021: 28-28 + 7-6 + 0-1 = 35-35 — straffene «passer», men
    // efter 1. forlængelse stod det 35-34, så der var ingen 2. forlængelse.
    let html = erstat(KAMP_STRAFFE, 'id="fot-1-score-a" class="col-xs-4 bigFont">6<', 'id="fot-1-score-a" class="col-xs-4 bigFont">7<');
    html = erstat(html, 'id="fot-2-score-a" class="col-xs-4 bigFont">1<', 'id="fot-2-score-a" class="col-xs-4 bigFont">0<');
    kaster(() => parseKampside(html, { ihfId: 26809 }), /2\. forlængelse, men stillingen efter 1\. forlængelse er 35-34/);
  });

  it.each([
    ['hjemmeholdet', '5', '4', '4', '6', '30-29'],
    ['udeholdet', '4', '5', '5', '5', '29-30'],
  ])('2. forlængelse, efter at %s førte i 1. forlængelse, kaster — uden straffe (Norge–Spanien 2023)', (_, ot1a, ot1b, ot2a, ot2b, stilling) => {
    // 25-25 efter 60, og summen er stadig 34-35 — kun den nye vagt kan se det.
    let html = erstat(KAMP_FORL, 'id="fot-1-score-a" class="col-xs-4 bigFont">4<', `id="fot-1-score-a" class="col-xs-4 bigFont">${ot1a}<`);
    html = erstat(html, 'id="fot-1-score-b" class="col-xs-4 bigFont">4<', `id="fot-1-score-b" class="col-xs-4 bigFont">${ot1b}<`);
    html = erstat(html, 'id="fot-2-score-a" class="col-xs-4 bigFont">5<', `id="fot-2-score-a" class="col-xs-4 bigFont">${ot2a}<`);
    html = erstat(html, 'id="fot-2-score-b" class="col-xs-4 bigFont">6<', `id="fot-2-score-b" class="col-xs-4 bigFont">${ot2b}<`);
    kaster(() => parseKampside(html, { ihfId: 119085 }),
      new RegExp(`kamp 119085: der er spillet 2\\. forlængelse, men stillingen efter 1\\. forlængelse er ${stilling}`));
  });

  it('2. forlængelse efter en lige 1. forlængelse er gyldig — også når 1. forlængelse var 0-0', () => {
    // Norge–Spanien 2023 med 1. forlængelse 0-0 og 2. forlængelse 9-10: 25-25 → 25-25 → 34-35.
    let html = erstat(KAMP_FORL, 'id="fot-1-score-a" class="col-xs-4 bigFont">4<', 'id="fot-1-score-a" class="col-xs-4 bigFont">0<');
    html = erstat(html, 'id="fot-1-score-b" class="col-xs-4 bigFont">4<', 'id="fot-1-score-b" class="col-xs-4 bigFont">0<');
    html = erstat(html, 'id="fot-2-score-a" class="col-xs-4 bigFont">5<', 'id="fot-2-score-a" class="col-xs-4 bigFont">9<');
    html = erstat(html, 'id="fot-2-score-b" class="col-xs-4 bigFont">6<', 'id="fot-2-score-b" class="col-xs-4 bigFont">10<');
    const k = parseKampside(html, { ihfId: 119085 });
    expect(k.perioder.ot2).toEqual({ h: 9, u: 10 });
    expect(k.afgjort).toBe('forlaenget');
  });

  it('en ikke-spillet kamp med TOM slutscore kaster (ukendt tilstand, ikke «0:0»)', () => {
    const html = erstat(KAMP_2027, '<p id="result-a-b">0:0</p>', '<p id="result-a-b"></p>');
    kaster(() => parseKampside(html, { ihfId: 307515 }), /kamp 307515 er ikke spillet, men slutscoren viser «»/);
  });

  it('uafgjort efter 60 uden forlængelse er et gyldigt facit (gruppekamp)', () => {
    let html = erstat(KAMP_BRONZE, 'id="sh-goals-b" class="col-xs-4 bigFont">17<', 'id="sh-goals-b" class="col-xs-4 bigFont">18<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">35:35</p>');
    const k = parseKampside(html, { ihfId: 202123 });
    expect(k.efter60).toEqual({ h: 35, u: 35 });
    expect(k.slut).toEqual({ h: 35, u: 35 });
  });
});

// ---------------------------------------------------------------------------
// VM 2025, 22/1: hovedrunden OG Presidents Cup på samme dagside.

describe('parseDagside — hovedrundedag med Presidents Cup (VM 2025, 22/1)', () => {
  const kampe = parseDagside(DAG_2025_HR);

  it('otte kampe, alle slut — og den første er en Presidents Cup-kamp', () => {
    expect(konkurrenceIdAf(DAG_2025_HR, 'matches')).toBe(177649);
    expect(kampe.map((k) => k.ihfId)).toEqual([202093, 202063, 202045, 202065, 202043, 202091, 202061, 202047]);
    expect(kampe.every((k) => k.status === 'slut' && k.statusKode === 'E')).toBe(true);
    expect(kampe[0]).toEqual({
      ihfId: 202093, fase: "President's Cup", gruppe: "President's Cup II", by: 'Poreč', hal: 'Porec Zatika Arena',
      hjemme: 'Cuba', hjemmeId: 1425, ude: 'Bahrain', udeId: 125,
      status: 'slut', statusKode: 'E', slutScore: { h: 26, u: 39 }, dato: '2025-01-22', lokalTid: '15:30', gmtTid: '14:30',
    });
  });

  it('fase og gruppe læses for begge faser: «Main Round» · «Main Round III/IV» og «President\'s Cup» · «President\'s Cup II»', () => {
    const par = kampe.map((k) => `${k.fase} · ${k.gruppe}`);
    expect([...new Set(par)].sort()).toEqual([
      'Main Round · Main Round III', 'Main Round · Main Round IV', "President's Cup · President's Cup II",
    ]);
    expect(par.filter((p) => p === 'Main Round · Main Round IV')).toHaveLength(3);
    expect(par.filter((p) => p === 'Main Round · Main Round III')).toHaveLength(3);
    // Fasen er ikke slået sammen med gruppen, og &#039; er afkodet til en almindelig apostrof.
    for (const k of kampe) {
      expect(k.fase).not.toMatch(/Main Round I|Cup II|&#|’/);
      expect(k.gruppe).not.toBeNull();
    }
  });

  it('Presidents Cup-kampene kan kendes på fasen alene (provideren filtrerer dem fra, §11.4)', () => {
    const presidentsCup = kampe.filter((k) => k.fase === "President's Cup");
    expect(presidentsCup.map((k) => k.ihfId)).toEqual([202093, 202091]);
    expect(presidentsCup.map((k) => `${k.hjemme}–${k.ude}`)).toEqual(['Cuba–Bahrain', 'United States of America–Japan']);
    const hovedrunde = kampe.filter((k) => k.fase !== "President's Cup");
    expect(hovedrunde).toHaveLength(6);
    expect(hovedrunde.every((k) => k.fase === 'Main Round' && /^Main Round (III|IV)$/.test(k.gruppe))).toBe(true);
    // Ingen hovedrundekamp spilles i Presidents Cup-hallen.
    expect(hovedrunde.map((k) => k.hal)).not.toContain('Porec Zatika Arena');
  });

  it('uafgjort i hovedrunden er et gyldigt slutresultat (Sverige–Portugal 37-37)', () => {
    expect(kampe.find((k) => k.ihfId === 202043)).toMatchObject({
      fase: 'Main Round', gruppe: 'Main Round III', hjemme: 'Sweden', ude: 'Portugal', slutScore: { h: 37, u: 37 },
    });
  });
});

// ---------------------------------------------------------------------------
// En ukendt status (fx en kamp i gang) må ikke vælte hele dagen.

describe('ukendt status-kode: kampen er «ukendt», ikke en fejl for hele dagen — og ALDRIG slut', () => {
  const live = (html, kode, score) => {
    let h = erstat(html, 'data-ihf-competitions-match-status="E"', `data-ihf-competitions-match-status="${kode}"`,
      'data-ihf-competitions-match-id="202125"');
    if (score) h = erstat(h, '>26-32<', `>${score}<`);
    return h;
  };

  it('dagsiden: kampen gives som ukendt med sin rå kode og UDEN score; naboen læses som normalt', () => {
    const [bronze, finale] = parseDagside(live(DAG_2025, 'L', '12-10'));
    expect(finale).toMatchObject({ ihfId: 202125, status: 'ukendt', statusKode: 'L', slutScore: null });
    expect(finale.status).not.toBe('slut');
    // Resten af kampen er læst — det er kun status/score, der ikke tolkes.
    expect(finale).toMatchObject({ hjemme: 'Croatia', ude: 'Denmark', fase: 'Finals', gmtTid: '17:00' });
    expect(bronze).toMatchObject({ ihfId: 202123, status: 'slut', slutScore: { h: 35, u: 34 } });
  });

  it('heller ikke et færdigt resultat i score-feltet giver en ukendt kamp en score', () => {
    // Score-feltet viser 26-32 som ved slut — men koden er ukendt, så intet facit.
    const finale = parseDagside(live(DAG_2025, 'F'))[1];
    expect(finale.status).toBe('ukendt');
    expect(finale.slutScore).toBeNull();
  });

  it.each(['e', ' E', 'E ', 'slut', '__proto__', 'toString', 'hasOwnProperty'])(
    'koden «%s» er ukendt — kun præcis \'\' og \'E\' kendes', (kode) => {
      const finale = parseDagside(live(DAG_2025, kode))[1];
      expect(finale.status).toBe('ukendt');
      expect(finale.slutScore).toBeNull();
    },
  );

  it('den rå kode vises renset og afkortet (Drift-kortet må ikke bære en hel fremmed streng)', () => {
    const finale = parseDagside(live(DAG_2025, `X&#x202E;${'Y'.repeat(200)}`))[1];
    expect(finale.statusKode).toBe(`X${'Y'.repeat(39)}`);
  });

  it('et strukturbrud kaster stadig, også i en ukendt kamp (manglende score-felt)', () => {
    const html = erstat(live(DAG_2025, 'L'), 'id="ihf-competitions-score-202125"', 'id="score-202125"');
    kaster(() => parseDagside(html), /kamp 202125 mangler sit score-felt/);
  });

  it('et strukturbrud kaster stadig, også i en ukendt kamp (manglende fase/gruppe)', () => {
    const html = erstat(live(DAG_2025, 'L'), 'class="groupName', 'class="gruppeNavn', 'data-ihf-competitions-match-id="202125"');
    kaster(() => parseDagside(html), /kamp 202125 mangler fase\/gruppe/);
  });

  it('kampsiden: ukendt status giver hold og tider, men intet resultat, ingen perioder og intet afgjort', () => {
    // Slutscoren står som en løbende stilling — den tolkes ikke.
    let html = erstat(KAMP_BRONZE, 'match-results-match-status="E"', 'match-results-match-status="L"');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">12:10</p>');
    expect(parseKampside(html, { ihfId: 202123 })).toEqual({
      ihfId: 202123, status: 'ukendt', statusKode: 'L', hjemme: 'France', ude: 'Portugal',
      lokalTid: '15:00', gmtTid: '14:00', by: 'Oslo', hal: 'Unity Arena',
      slut: null, perioder: null, efter60: null, afgjort: null,
    });
  });

  it('kampsiden: et strukturbrud kaster stadig ved ukendt status (manglende slutscore-felt)', () => {
    let html = erstat(KAMP_BRONZE, 'match-results-match-status="E"', 'match-results-match-status="L"');
    html = erstat(html, 'id="result-a-b"', 'id="resultat"');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kamp 202123 mangler sin slutscore/);
  });
});

// ---------------------------------------------------------------------------
// Entiteter og usynlige tegn: alt, en fremmed side kan sende, giver tekst eller
// IhfStrukturFejl — aldrig RangeError.

describe('rens — entiteter med loft, styre- og retningstegn væk', () => {
  const ude = (navn) => parseDagside(erstat(DAG_2025, '>Portugal</a>', `>${navn}</a>`))[0].ude;

  it.each([
    ['&#99999999;', 'decimal over U+10FFFF'],
    ['&#xFFFFFFFFFF;', 'hex over U+10FFFF'],
    [`&#${'9'.repeat(400)};`, '400 cifre (Infinity)'],
    [`&#x${'F'.repeat(400)};`, '400 hex-cifre (Infinity)'],
    ['&#x110000;', 'lige over loftet'],
    ['&#0;', 'NUL'],
    ['&#x0;', 'NUL (hex)'],
    ['&#xD800;', 'enlig høj surrogat'],
    ['&#xDFFF;', 'enlig lav surrogat'],
    ['&#55296;', 'surrogat, decimal'],
  ])('%s (%s) bliver U+FFFD — ikke RangeError', (entitet) => {
    expect(ude(`A ${entitet} B`)).toBe('A \uFFFD B');
  });

  it('grænserne afkodes som ægte tegn: U+10FFFF, U+D7FF og U+E000', () => {
    expect(ude('A&#x10FFFF;B')).toBe('A\u{10FFFF}B');
    expect(ude('A&#xD7FF;B')).toBe('A\uD7FFB');
    expect(ude('A&#xE000;B')).toBe('A\uE000B');
  });

  it.each([
    ['&#x202E;', 'RIGHT-TO-LEFT OVERRIDE som entitet'],
    ['\u202E', 'RIGHT-TO-LEFT OVERRIDE rå'],
    ['\u202A', 'LEFT-TO-RIGHT EMBEDDING'],
    ['\u2066', 'LEFT-TO-RIGHT ISOLATE'],
    ['\u2069', 'POP DIRECTIONAL ISOLATE'],
    ['\u200F', 'RIGHT-TO-LEFT MARK'],
    ['\u061C', 'ARABIC LETTER MARK'],
    ['\u200B', 'nul-bredde mellemrum'],
    ['&#xFEFF;', 'BOM / nul-bredde no-break'],
  ])('%s (%s) fjernes helt fra holdnavnet', (tegn) => {
    expect(ude(`Den${tegn}mark`)).toBe('Denmark');
  });

  it.each([
    ['&#7;', 'BEL som entitet'],
    ['\u0007', 'BEL rå'],
    ['\u0000', 'NUL rå'],
    ['\u001B', 'ESC'],
    ['\u0085', 'C1-styretegn (NEL)'],
    ['\u009B', 'C1-styretegn (CSI)'],
  ])('%s (%s) bliver til ét mellemrum', (tegn) => {
    expect(ude(`South${tegn}Korea`)).toBe('South Korea');
  });

  it('en enlig surrogat i selve strengen (ikke som entitet) bliver U+FFFD', () => {
    expect(ude('A\uD800B')).toBe('A\uFFFDB');
  });

  it('også fase, gruppe og hal renses for retningstegn', () => {
    let html = erstat(DAG_2025, '>Finals</div>', '>Fin&#x202E;als\u2066</div>');
    html = erstat(html, 'Oslo / Unity Arena', 'Os\u202Elo / Unity&#x200F; Arena&#7;', 'data-ihf-competitions-match-id="202125"');
    expect(parseDagside(html)[1]).toMatchObject({ fase: 'Finals', by: 'Oslo', hal: 'Unity Arena' });
    const gruppe = parseDagside(erstat(DAG_2027, 'Preliminary round <br> Group A', 'Preliminary round <br> Group&#x202E; A'))[0];
    expect(gruppe.gruppe).toBe('Group A');
  });

  it('kampsidens holdnavne renses på samme måde', () => {
    const html = erstat(KAMP_BRONZE, '<span>France</span>', '<span>Fr&#x202E;ance &#99999999;</span>', 'resultCardBody');
    expect(parseKampside(html, { ihfId: 202123 }).hjemme).toBe('France \uFFFD');
  });
});

// ---------------------------------------------------------------------------
// Kampsiden er kampen, der blev bedt om — og intet andet på siden.

describe('parseKampside — siden er bundet til sit kamp-id og sit eget resultatkort', () => {
  it('kræver det forventede id: uden { ihfId } er det en programmeringsfejl, ikke en skraberfejl', () => {
    for (const opt of [undefined, {}, { ihfId: '202123' }, { ihfId: 0 }, { ihfId: 2.5 }]) {
      expect(() => parseKampside(KAMP_BRONZE, opt), JSON.stringify(opt)).toThrow(TypeError);
    }
  });

  it('en side for en anden kamp end den, der blev bedt om, kaster (omdirigering / forkert side)', () => {
    const e = kaster(() => parseKampside(KAMP_BRONZE, { ihfId: 202125 }),
      /kampsiden er ikke kamp 202125: den kanoniske adresse siger 202123/);
    expect(e.message).toContain('omdirigering');
  });

  it('kampmarkøren skal sige det samme som den kanoniske adresse', () => {
    const html = erstat(KAMP_BRONZE, 'data-ihf-competitions-match-results-match-id="202123"',
      'data-ihf-competitions-match-results-match-id="999999"');
    kaster(() => parseKampside(html, { ihfId: 202123 }),
      /kampsidens markør siger kamp 999999, men den kanoniske adresse siger 202123/);
  });

  it('kamp-id\'et skal være SIDSTE led i den kanoniske adresse (…/match-center/{id})', () => {
    const html = erstat(KAMP_BRONZE, '/match-center/202123"', '/match-center/202123/vote"', 'rel="canonical"');
    expect(kampIdAf(html)).toBeNull();
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kanoniske adresse siger intet kamp-id/);
    expect(kampIdAf(KAMP_BRONZE)).toBe(202123);
    expect(kampIdAf(DAG_2025)).toBeNull();
  });

  it('en nabo-widget med sin egen kampmarkør FØR kampen kaster (Securitys PoC: 35-34 tilskrevet kamp 999999)', () => {
    const nabo = '<div class="nextMatch" data-ihf-competitions-match-results-match-id="999999" '
      + 'data-ihf-competitions-match-results-match-status="E"></div>';
    const html = erstat(KAMP_BRONZE, '<body', `${nabo}<body`);
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kampsiden har 2 kampmarkører .*præcis én forventes/);
  });

  it('tid, slutscore og perioder FØR resultatkortet tilhører ikke kampen', () => {
    // Uden for kortet, men tidligere på siden: «første forekomst i siden» ville tage 09:00 og 1:0.
    const nabo = '<div class="nabo"><p class="time time-local">09:00</p><p class="time time-gmt">08:00 <small>GMT</small></p>'
      + '<span>Bergen</span><p id="result-a-b">1:0</p><div id="fh-goals-a" class="col-xs-4 bigFont">1</div></div>';
    const html = erstat(KAMP_BRONZE, '<!--Match result section-->', `${nabo}<!--Match result section-->`);
    expect(html.indexOf('09:00')).toBeLessThan(html.indexOf(MARKOER_KAMP));
    expect(parseKampside(html, { ihfId: 202123 })).toMatchObject({
      lokalTid: '15:00', gmtTid: '14:00', by: 'Oslo', slut: { h: 35, u: 34 }, efter60: { h: 35, u: 34 },
    });
  });

  it('status læses af kampmarkørens eget tag — ikke af en status-attribut tidligere på siden', () => {
    // VM 2027-kampen er ikke spillet (''). En løs «E» før kortet må ikke gøre den til slut.
    const html = erstat(KAMP_2027, '<!--Match result section-->',
      '<i data-ihf-competitions-match-results-match-status="E"></i><!--Match result section-->');
    expect(parseKampside(html, { ihfId: 307515 })).toMatchObject({ status: 'planlagt', slut: null });
  });

  it.each([
    ['slutscoren', '<p id="result-a-b">35:34</p>', 'id="result-a-b">'],
    ['den lokale tid', '<p class="time time-local">15:00</p>', 'class="time time-local">'],
    ['GMT-tiden', '<p class="time time-gmt">14:00 <small>GMT</small></p>', 'class="time time-gmt">'],
    ['1. halvleg', '<div id="fh-goals-a" class="col-xs-4 bigFont">19</div>', 'id="fh-goals-a"'],
    ['straffekastene', '<div id="penalty-score-b" class="col-xs-4 bigFont">0</div>', 'id="penalty-score-b"'],
    ['kortets krop', '<div class="resultCardBody"></div>', 'resultCardBody'],
  ])('%s to gange i resultatkortet kaster (hvilken er kampens?)', (_, ekstra, anker) => {
    // Indsat inde i kortet, lige efter kroppen: kortet har nu to af feltet.
    const html = erstat(KAMP_BRONZE, '<div class="resultCardBody text-center">', `<div class="resultCardBody text-center">${ekstra}`);
    const anker_ = anker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    kaster(() => parseKampside(html, { ihfId: 202123 }), new RegExp(`«${anker_}» står 2 gange i resultatkortet`));
  });

  it('et resultatkort, der aldrig lukkes, kaster', () => {
    const mi = KAMP_BRONZE.indexOf(MARKOER_KAMP);
    const html = KAMP_BRONZE.slice(0, mi) + KAMP_BRONZE.slice(mi).split('</div>').join('</dv>');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kamp 202123: resultatkortet .*lukkes aldrig/);
  });

  it('en kampmarkør, der ikke står på et <div>, kaster', () => {
    const html = erstat(KAMP_BRONZE, '<div id="ihf-competitions-match-results-match-node-202123"',
      '<section id="ihf-competitions-match-results-match-node-202123"');
    kaster(() => parseKampside(html, { ihfId: 202123 }), /kampmarkøren står ikke på et <div>/);
  });

  it('afgjort afledes af perioderne: ordinær, forlænget, straffe', () => {
    expect(parseKampside(KAMP_BRONZE, { ihfId: 202123 }).afgjort).toBe('ordinaer');
    expect(parseKampside(KAMP_FORL, { ihfId: 119085 }).afgjort).toBe('forlaenget');
    expect(parseKampside(KAMP_STRAFFE, { ihfId: 26809 }).afgjort).toBe('straffe');
  });

  it('kun 2. forlængelse scoret (1. forlængelse 0-0) er også «forlaenget»', () => {
    // Bronzekampen gjort lige (35-35 efter 60), ot1 0-0, ot2 1-0.
    let html = erstat(KAMP_BRONZE, 'id="sh-goals-b" class="col-xs-4 bigFont">17<', 'id="sh-goals-b" class="col-xs-4 bigFont">18<');
    html = erstat(html, 'id="fot-2-score-a" class="col-xs-4 bigFont">0<', 'id="fot-2-score-a" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">36:35</p>');
    expect(parseKampside(html, { ihfId: 202123 }).afgjort).toBe('forlaenget');
  });

  it('kun udeholdets mål i 1. forlængelse (0-1) er «forlaenget» — ikke ordinær', () => {
    let html = erstat(KAMP_BRONZE, 'id="sh-goals-b" class="col-xs-4 bigFont">17<', 'id="sh-goals-b" class="col-xs-4 bigFont">18<');
    html = erstat(html, 'id="fot-1-score-b" class="col-xs-4 bigFont">0<', 'id="fot-1-score-b" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">35:34</p>', '<p id="result-a-b">35:36</p>');
    expect(parseKampside(html, { ihfId: 202123 }).afgjort).toBe('forlaenget');
  });

  it('straffe, hvor kun udeholdet scorer (0-1), er «straffe» — også selv om der er spillet forlængelse', () => {
    // Danmark–Egypten 2021 med straffe 0-1 i stedet for 4-3: 35-35 + 0-1 = 35:36.
    let html = erstat(KAMP_STRAFFE, 'id="penalty-score-a" class="col-xs-4 bigFont">4<', 'id="penalty-score-a" class="col-xs-4 bigFont">0<');
    html = erstat(html, 'id="penalty-score-b" class="col-xs-4 bigFont">3<', 'id="penalty-score-b" class="col-xs-4 bigFont">1<');
    html = erstat(html, '<p id="result-a-b">39:38</p>', '<p id="result-a-b">35:36</p>');
    expect(parseKampside(html, { ihfId: 26809 }).afgjort).toBe('straffe');
  });
});

describe('kraevSide — fejlsidens citat', () => {
  it('læses kun af sidens første 4 KB — en hel fremmed side renses aldrig', () => {
    const side = `${'<br>'.repeat(1100)}Teksten efter 4 KB`; // 4096 = 1024 × «<br>»
    expect(side.indexOf('Teksten')).toBeGreaterThan(4096);
    const e = kaster(() => parseDagside(side), /ingen konkurrence-markør/);
    expect(e.message).toContain('Sidens tekst begynder: «».');
    expect(e.message).not.toContain('Teksten');
  });
});

// ---------------------------------------------------------------------------
// ReDoS: hvert mønster mod et fjendtligt input. Kørt i en BØRNEPROCES med
// timeout, for en hængende regex blokerer tråden — en vitest-timeout kan ikke
// afbryde den. Med de gamle mønstre (`\s*([^<]*?)\s*X`, `<[^>]*>`) hænger hver
// af dem (Security målte 159 s for 10.000 mellemrum); med de nye svarer de på
// få millisekunder. Grænsen på 250 ms er langt over et lineært gennemløb af
// ~0,5 MB og langt under et kvadratisk.

describe('ReDoS — parseren svarer (kaster eller returnerer) hurtigt på fjendtligt input', () => {
  const N = 200_000;
  const SP = ' '.repeat(N);
  const GRAENSE_MS = 250;
  const DRAEB_MS = 4000;
  const PARSER = fileURLToPath(new URL('./ihfParse.js', import.meta.url));
  const BARN = `
    const P = require(process.argv[1]);
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => { data += d; });
    process.stdin.on('end', () => {
      const { slags, html, ihfId } = JSON.parse(data);
      const t0 = process.hrtime.bigint();
      let udfald = 'returnerede';
      try {
        if (slags === 'dag') P.parseDagside(html); else P.parseKampside(html, { ihfId });
      } catch (e) { udfald = e.name; }
      process.stdout.write(JSON.stringify({ udfald, ms: Number(process.hrtime.bigint() - t0) / 1e6 }));
    });`;

  /** Kampsiden afskåret lige efter `anker` + fjendtligt fyld: intet «<» følger. */
  const afskaaret = (anker, fyld) => KAMP_BRONZE.slice(0, KAMP_BRONZE.indexOf(anker) + anker.length) + fyld;

  const SAGER = [
    // Dagsidens tid: `>\s*([^<]*?)\s*<\/time>` — mellemrum, og så ikke </time>.
    ['dag', 'dagsidens tid: 200.000 mellemrum uden </time>',
      () => erstat(DAG_2025, '>18:00</time>', `>${SP}18:00${SP}<b>`, 'match-time-202125')],
    // Kampsidens GMT: `\s*([^<]*?)\s*<small>\s*GMT` — mellemrum, og så ikke <small>.
    ['kamp', 'kampsidens GMT-tid: 200.000 mellemrum uden <small>GMT',
      () => erstat(KAMP_BRONZE, '14:00 <small>GMT', `${SP}14:00${SP}<span>GMT`)],
    // Kampsidens lokale tid: `\s*([^<]*?)\s*<` — mellemrum, og intet «<» bagefter.
    ['kamp', 'kampsidens lokale tid: 200.000 mellemrum, intet «<» bagefter',
      () => afskaaret('class="time time-local">', `${SP}15:00${SP}`)],
    ['kamp', 'kampsidens slutscore: 200.000 mellemrum, intet «<» bagefter',
      () => afskaaret('id="result-a-b">', `${SP}35:34${SP}`)],
    ['kamp', 'kampsidens periode: 200.000 mellemrum, intet «<» bagefter',
      () => afskaaret('id="fh-goals-a" class="col-xs-4 bigFont">', `${SP}19${SP}`)],
    // rens' tag-mønster `<[^>]*>` — 200.000 «<» uden «>».
    ['dag', 'fejlside med 200.000 «<» uden «>» (citatet renses)', () => '<'.repeat(N)],
    ['kamp', 'kampside-fejlside med 200.000 «<» uden «>»', () => '<'.repeat(N)],
    ['dag', 'holdnavn med 200.000 «<» uden «>»', () => erstat(DAG_2025, '>Portugal</a>', `>${'<'.repeat(N)}</a>`)],
    // Mange gentagne ankre uden slutning (lazy `[\s\S]*?` pr. start).
    ['dag', '20.000 holdfelter uden </div>',
      () => erstat(DAG_2025, '<div class="country', `${'<div class="country x">'.repeat(20_000)}<div class="country`,
        'data-ihf-competitions-match-id="202125"')],
    ['dag', 'en entitet med 200.000 cifre', () => erstat(DAG_2025, '>Portugal</a>', `>&#${'9'.repeat(N)};</a>`)],
  ];

  it.each(SAGER)('%s: %s', (slags, _, byg) => {
    const html = byg();
    const r = spawnSync(process.execPath, ['-e', BARN, PARSER], {
      input: JSON.stringify({ slags, html, ihfId: 202123 }), encoding: 'utf8', timeout: DRAEB_MS,
    });
    expect(r.error?.code, `parseren svarede ikke inden for ${DRAEB_MS} ms (dræbt: ${r.signal})`).toBeUndefined();
    expect(r.status, r.stderr).toBe(0);
    const { udfald, ms } = JSON.parse(r.stdout);
    // Kaster den, er det en skraberfejl — aldrig RangeError eller anden runtime-fejl.
    expect(['returnerede', 'IhfStrukturFejl']).toContain(udfald);
    expect(ms, `${ms.toFixed(1)} ms`).toBeLessThan(GRAENSE_MS);
  }, 15_000);
});
