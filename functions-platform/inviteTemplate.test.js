// ---------------------------------------------------------------------------
// inviteTemplate.test.js — invitations-skabelonen. SKAL følge spillet:
// den første udgave var hardcodet til Superligaen, så PL-launch-mailen
// lovede et pulje-tip, spillet ikke har. Testene her assertérer BÅDE hvad
// PL-mailen siger, og hvad den IKKE må sige (CLAUDE.md: en test, der kun
// tjekker at noget blev vist, beviser ikke hvad der stod).
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { HAANDBOLD_SPIL, TEST_FASER } from '../src/test/faseKalender.js';

const require = createRequire(import.meta.url);
const { invitationsHtml, ligaProfil, invitationsFejl } = require('./inviteTemplate.js');

// Bagudkompatibilitet: uden liga-profil er mailen Superligaens (gamle
// klienter sender intet gameId).
const superligaInviteHtml = (opts) => invitationsHtml(opts);

describe('invitationsHtml — Superligaen (default, bagudkompatibel)', () => {
  const base = {
    intro: 'Hej alle\nSidste år vandt Anders.',
    joinLink: 'https://tip.vejleaa.dk/tilmeld/superliga-2026/ABC123',
    leagueName: 'Kontorligaen',
  };

  it('bygger et komplet HTML-dokument med hero og CTA', () => {
    const html = superligaInviteHtml(base);
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('Klar til revanche?');
    expect(html).toContain(base.joinLink);
    expect(html).toContain('Kontorligaen');
  });

  it('viser skærmbilleder af både runde-tip og pulje', () => {
    const html = superligaInviteHtml(base);
    expect(html).toContain('https://tip.vejleaa.dk/salgstale/runde.png');
    expect(html).toContain('https://tip.vejleaa.dk/salgstale/pulje.png');
  });

  it('præsenterer hele spillet, ikke kun puljen', () => {
    const html = superligaInviteHtml(base);
    for (const s of ['1, X eller 2', 'Runde-bonus', 'Chancen', 'Pulje-tippet', 'mini-liga', 'Runde-Botten', 'Elo']) {
      expect(html).toContain(s);
    }
    // Runde-tippet skal stå før puljen i mailen.
    expect(html.indexOf('salgstale/runde.png')).toBeLessThan(html.indexOf('salgstale/pulje.png'));
  });

  it('bevarer linjeskift i admins tekst', () => {
    const html = superligaInviteHtml(base);
    expect(html).toContain('Hej alle<br>Sidste &aring;r vandt Anders.'.replace('&aring;', 'å'));
  });

  it('escaper HTML i admins tekst og ligenavn', () => {
    const html = superligaInviteHtml({
      ...base,
      intro: '<script>alert(1)</script>',
      leagueName: 'A & B <b>',
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('A &amp; B &lt;b&gt;');
  });

  it('falder tilbage til app-url og standardnavn uden link/liga', () => {
    const html = superligaInviteHtml({ intro: 'Hej' });
    expect(html).toContain('vores liga');
    expect(html).toContain('href="https://tip.vejleaa.dk"');
  });

  it('kan kaldes helt uden argumenter', () => {
    expect(() => superligaInviteHtml()).not.toThrow();
  });
});

describe('ligaProfil — profilen afledes af SPIL-DOKUMENTET', () => {
  const plSpil = { name: 'Premier League 2026/27 — efterår', sync: { provider: 'pulselive', competitionId: 8, season: 2026 } };
  const slSpil = { name: 'Superligaen 2026/27', sync: { provider: 'superliga' }, pulje: { poolSize: 6 } };

  it('null → Superligaens fulde profil (gamle klienter sender intet gameId)', () => {
    const l = ligaProfil(null);
    expect(l.navn).toBe('Superligaen');
    expect(l.harPulje).toBe(true);
    expect(l.rundeImg).toBe('salgstale/runde.png');
    expect(l.puljeImg).toBe('salgstale/pulje.png');
  });

  it('PL efterår: navn, "hele efteråret", 18-runder-chippen, INGEN pulje og INGEN billeder', () => {
    const l = ligaProfil(plSpil);
    expect(l.navn).toBe('Premier League');
    expect(l.overskrift).toBe('Ny liga, blanke tavler');
    expect(l.periode).toContain('efter');   // "hele efteråret" (entity-kodet å)
    expect(l.periode).not.toContain('s&aelig;son');
    expect(l.chip3).toContain('18 runder');
    expect(l.harPulje).toBe(false);
    expect(l.rundeImg).toBe('salgstale/runde-pl-kampkort.png'); // PL's EGET screenshot
    expect(l.puljeImg).toBeNull();
  });

  it('pulje er DATA, ikke en liga-liste: et pulselive-spil MED pulje får pulje-kapitlet', () => {
    const l = ligaProfil({ ...plSpil, pulje: { poolSize: 4 } });
    expect(l.harPulje).toBe(true);
    expect(l.poolSize).toBe(4);
    expect(l.puljeImg).toBeNull(); // men aldrig Superligaens billede
  });

  it('Superliga-spillet matcher default-profilen', () => {
    expect(ligaProfil(slSpil)).toEqual(ligaProfil(null));
  });

  it('ukendt provider: neutral profil uden SL-påstande og uden billeder', () => {
    const l = ligaProfil({ name: 'La Liga 2027', shortName: 'La Liga', sync: { provider: 'laliga-api' } });
    expect(l.navn).toBe('La Liga');
    expect(l.rundeImg).toBeNull();
    expect(l.puljeImg).toBeNull();
    expect(l.harPulje).toBe(false);
  });
});

describe('invitationsHtml — Premier League-invitationen', () => {
  const html = invitationsHtml({
    liga: ligaProfil({ name: 'Premier League 2026/27 — efterår', sync: { provider: 'pulselive' } }),
    intro: 'Er du klar?',
    joinLink: 'https://tip.vejleaa.dk/tilmeld?spil=pl2627-efteraar&kode=4GGR99',
    leagueName: 'Buddy ligaen',
  });

  it('hero og titel taler om Premier League og efteråret', () => {
    expect(html).toContain('Premier League skal tippes');
    expect(html).toContain('hele efter');
    expect(html).toContain('Ny liga, blanke tavler');
    expect(html).toContain('18 runder');
  });

  it('siger ALDRIG Superligaen — og viser KUN PL-spillets eget skærmbillede', () => {
    expect(html).not.toContain('Superliga');
    expect(html).toContain('salgstale/runde-pl-kampkort.png');
    expect(html).not.toContain('salgstale/runde.png');  // SL-billedet
    expect(html).not.toContain('salgstale/pulje.png');  // SL-puljen
    expect(html).not.toContain('mesterskabsspillet');
  });

  it('lover INTET pulje-tip — liga-spørgsmålene står som den sene joker i stedet', () => {
    expect(html).not.toContain('Pulje-tippet');
    expect(html).toContain('Liga-sp&oslash;rgsm&aring;l');
    expect(html).toContain('vende stillingen');
    // ...og de gentages ikke i mini-liga-rækken (dobbelt løfte læses som fyld).
    expect(html.split('liga-admin').length).toBe(2); // nævnes præcis én gang
  });

  it('bonussen omtales under ÉT navn og kun én gang — og Chancen starter med ejerens ordlyd', () => {
    // Testmail-fund (ejeren): 'Runde-bonus' i billedet og 'Combi-bonus' i
    // teksten var to navne for samme regel — og den var omtalt to gange.
    expect(html).not.toContain('Combi-bonus');
    // Kort-overskriften opremser + rækken forklarer = to navne-forekomster,
    // men FORKLARINGEN (kvadratrods-reglen) må kun stå én gang.
    expect(html.split('Runde-bonus').length).toBe(3);
    expect(html.split('kvadratroden').length).toBe(2);
    expect(html).toContain('Hvis du f&oslash;ler dig HELT sikker');
    expect(html).not.toContain('N&aring;r du er HELT sikker');
  });

  it('hero-chips ombrydes som hele piller — aldrig midt i teksten', () => {
    // Overløbet i testmailen: chip-teksten knækkede midt i pillen.
    const chips = html.match(/<span style="[^"]*border-radius:20px[^"]*"/g) || [];
    expect(chips.length).toBe(3);
    for (const c of chips) expect(c).toContain('white-space:nowrap');
  });

  it('kernen består: 1X2, combi, chancen, Runde-Botten og den gule CTA', () => {
    for (const t of ['1, X eller 2', 'Runde-bonus', 'Chancen', 'Runde-Botten', 'Buddy ligaen', 'kode=4GGR99']) {
      expect(html).toContain(t);
    }
  });
});

describe('invitationsFejl — vagten er én ren funktion (Security-fund F1+F3)', () => {
  const ok = { template: 'invitation', joinLink: 'https://tip.vejleaa.dk/tilmeld?spil=pl&kode=X', gameId: 'pl2627-efteraar' };

  it('godkender det ægte kald — og kræver domænet MED skråstreg', () => {
    expect(invitationsFejl(ok)).toBeNull();
    // Bekræftede omgåelser af startsWith(APP_URL) uden skråstreg:
    expect(invitationsFejl({ ...ok, joinLink: 'https://tip.vejleaa.dk.evil.dk/tilmeld/X' })).toMatch(/tilmeldingslink/);
    expect(invitationsFejl({ ...ok, joinLink: 'https://tip.vejleaa.dk@evil.dk/tilmeld' })).toMatch(/tilmeldingslink/);
    expect(invitationsFejl({ ...ok, joinLink: '' })).toMatch(/tilmeldingslink/);
  });

  it("'invitation' KRÆVER gameId — tavs Superliga-mail om et andet spil var fejlen", () => {
    expect(invitationsFejl({ ...ok, gameId: '' })).toMatch(/valgt spil/);
    // ...men 'superliga' er den bagudkompatible vej UDEN gameId.
    expect(invitationsFejl({ template: 'superliga', joinLink: ok.joinLink, gameId: '' })).toBeNull();
  });

  it('gameId skal ligne et dokument-id — stier og punktummer afvises', () => {
    for (const slem of ['a/b/c', '.', '..', 'x'.repeat(201)]) {
      expect(invitationsFejl({ ...ok, gameId: slem })).toMatch(/spil-id/);
    }
  });
});

describe('invitationsHtml — linket escapes i href (Security-fund F2)', () => {
  it('et fjendtligt joinLink kan hverken bryde ud af attributten eller plante et fremmed link', () => {
    const html = invitationsHtml({
      intro: 'x',
      joinLink: 'https://tip.vejleaa.dk/"><a href="https://evil.dk/phish">Log ind',
    });
    expect(html).not.toContain('href="https://evil.dk');
    expect(html).toContain('href="https://tip.vejleaa.dk/&quot;&gt;');
  });

  it('ligaProfil leverer RÅT navn — og hero escaper det ved indsættelsen', () => {
    // Escap ved flet, ikke ved dannelse: en ny profil-gren uden esc() må
    // ikke kunne blive en injektion med grøn suite (Security-designnote).
    const l = ligaProfil({ name: 'X', shortName: '<b>Liga</b>', sync: { provider: 'ukendt' } });
    expect(l.navn).toBe('<b>Liga</b>'); // råt i profilen…
    const html = invitationsHtml({ liga: l, intro: 'x', joinLink: 'https://tip.vejleaa.dk/t' });
    expect(html).not.toContain('<b>Liga</b> skal tippes'); // …aldrig råt i HTML
    expect(html).toContain('&lt;b&gt;Liga&lt;/b&gt; skal tippes');
  });

  it('et giftigt navnefelt ({toString:null}) vælter ikke profilen', () => {
    expect(() => ligaProfil({ name: { toString: null }, sync: { provider: 'pulselive' } })).not.toThrow();
  });

  it('…og heller ikke et giftigt shortName — den gren har sin EGEN vagt', () => {
    // TM-fund: name-vagten var bevist, shortName-vagten kunne fjernes med
    // grøn suite. Ukendt-provider-grenen er den eneste, der læser shortName.
    expect(() => ligaProfil({ shortName: { toString: null }, sync: { provider: 'ukendt' } })).not.toThrow();
    const l = ligaProfil({ shortName: { toString: null }, name: 'Ligaen X', sync: { provider: 'ukendt' } });
    expect(l.navn).toBe('Ligaen X'); // falder til name, ikke til et objekt
  });
});

// Runde-puljen (semifinalisterne): afgøres, når en fase er lagt ind — ikke
// "til allersidst". Datoen kommer af kalenderen.
describe('invitationsHtml — en turnering med runde-pulje', () => {
  const FASER = [
    { navn: 'Kvartfinaler', bestemt: 'Kvartfinalerne', fra: 1, til: 2, start: '2027-01-27', knockout: true, antalKampe: 4 },
    { navn: 'Semifinaler', bestemt: 'Semifinalerne', fra: 3, til: 3, start: '2027-01-29', knockout: true, antalKampe: 2 },
  ];
  const spil = {
    name: 'Håndbold-VM 2027', shortName: 'VM', faser: FASER,
    pulje: { poolSize: 4, facitKilde: 'runde', facitFase: 'Semifinaler' },
  };
  const html = invitationsHtml({ liga: ligaProfil(spil), intro: 'Klar?', joinLink: 'https://tip.vejleaa.dk/x' });

  it('siger, hvornår puljen afgøres — med kalenderens dato', () => {
    expect(ligaProfil(spil).puljeDato).toBe('fredag 29. januar');
    expect(html).toContain('afgjort, s&aring; snart semifinalerne er lagt ind (de spilles fredag 29. januar).');
    // «når», ikke «står i» — samme ord som pulje-fanen og guiden.
    expect(html).toContain('du tror n&aring;r semifinalerne');
    expect(html).toContain('pr. hold, du rammer');
    expect(html).not.toContain('st&aring;r i semifinalerne');
    expect(html).not.toContain('der st&aring;r rigtigt');
    expect(html).not.toContain('afgjort til allersidst');
    expect(html).not.toContain('mesterskabsspillet');
  });

  // M25: «fra» ved en fase over flere dage — og datoen er pulje-fanens egen
  // funktion, ikke en kopi.
  it('en fase over flere dage: «fra» og samme dato som pulje-fanen', () => {
    const lang = { ...spil, faser: [FASER[0], { ...FASER[1], til: 4 }] };
    expect(ligaProfil(lang).puljeDato).toBe('fra fredag 29. januar');
    const { rundePuljeDato } = require('./puljeFacit');
    const { puljeKonfig } = require('./superligaScoring');
    expect(ligaProfil(lang).puljeDato).toBe(rundePuljeDato(lang, puljeKonfig(lang)));
    expect(ligaProfil(spil).puljeDato).toBe(rundePuljeDato(spil, puljeKonfig(spil)));
  });

  it('uden fasen i kalenderen: ingen dato, men stadig ikke "til allersidst"', () => {
    const udenSpil = { ...spil, faser: undefined };
    const uden = invitationsHtml({ liga: ligaProfil(udenSpil), intro: 'x', joinLink: 'https://tip.vejleaa.dk/x' });
    expect(ligaProfil(udenSpil).puljeDato).toBeNull();
    expect(uden).toContain('afgjort, s&aring; snart semifinaler er lagt ind.');
    expect(uden).not.toContain('afgjort til allersidst');
  });

  it('liga-puljerne lover stadig "til allersidst"', () => {
    const sl = invitationsHtml({ liga: ligaProfil(null), intro: 'x', joinLink: 'https://tip.vejleaa.dk/x' });
    expect(sl).toContain('afgjort til allersidst');
    expect(sl).toContain('du tror st&aring;r i mesterskabsspillet');
    expect(sl).toContain('pr. hold, der st&aring;r rigtigt');
    expect(sl).not.toContain('pr. hold, du rammer');
    expect(ligaProfil(null).puljeDato).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// TURNERINGENS INVITATION (håndbold-VM). Teksterne skifter med EVNERNE —
// fasekalender, knockout-faser, hjemmebane — og ejerens 60-min-regel (§11.1)
// skal stå i mailen. Superligaens og Premier Leagues mail er byte for byte
// den, de altid har fået (hashen nedenfor er taget af udgaven FØR teksterne
// blev gjort skiftende; ændres de med vilje, skal hashen opdateres med vilje).
// ---------------------------------------------------------------------------
describe('invitationsHtml — en turnering med fasekalender', () => {
  const opts = { joinLink: 'https://tip.vejleaa.dk/tilmeld/x', leagueName: 'Familien' };
  const html = invitationsHtml({ ...opts, liga: ligaProfil(HAANDBOLD_SPIL) });

  it('dag for dag, turneringen, håndbold — og 60-min-reglen ved kampene', () => {
    expect(html).toContain('Dag for dag tipper du 1, X eller 2.');
    expect(html).toContain('hele turneringen');
    expect(html).toContain('nul håndboldforstand');
    expect(html).toContain('~2 min pr. dag');
    expect(html).toContain('Tip dagens kampe');
    expect(html).toContain('<b>Knockout: vi tipper stillingen efter 60 min. Uafgjort er X, også når nogen vinder i forlængelsen.</b>');
    expect(html).toContain('Efter dagens sidste kamp');
    expect(html).toContain('🤾');
  });

  it('og INTET af ligaens: runde, sæson, fodbold, hjemmebane, en tabel spillet ikke har — eller ⚽', () => {
    for (const t of ['Runde for runde', 'pr. runde', 'rundens', 's&aelig;sonen', 'sæsonens', 'fodbold',
      'hjemmesejr', 'udesejr', 'den officielle tabel', '&#9917;', '90 min']) {
      expect(html, t).not.toContain(t);
    }
  });

  it('uden knockout-faser: ingen regel — og en officiel tabel kun med standings', () => {
    const udenKo = invitationsHtml({ ...opts, liga: ligaProfil({ ...HAANDBOLD_SPIL, faser: TEST_FASER.slice(0, 2) }) });
    expect(udenKo).not.toContain('Knockout:');
    expect(udenKo).toContain('Dag for dag');
    const medTabel = invitationsHtml({ ...opts, liga: ligaProfil({ ...HAANDBOLD_SPIL, standings: true }) });
    expect(medTabel).toContain(', den officielle tabel og holdenes Elo-udvikling');
  });

  it('et fodboldspil MED kalender, men med hjemmebane: 1/X/2 forklares som hjemme/ude', () => {
    const fodboldTurnering = invitationsHtml({ ...opts, liga: ligaProfil({ ...HAANDBOLD_SPIL, sport: undefined }) });
    expect(fodboldTurnering).toContain('Hver dag sætter du hjemmesejr, uafgjort eller udesejr');
    expect(fodboldTurnering).toContain('nul fodboldforstand');
    expect(fodboldTurnering).toContain('stillingen efter 90 min');
  });

  it('Superligaen og Premier League: byte for byte den mail, de altid har fået', () => {
    const h = (s) => createHash('sha256').update(s).digest('hex');
    const sl = invitationsHtml({ ...opts, intro: 'Hej\nmed', liga: ligaProfil({ name: 'Superligaen 2026/27', sync: { provider: 'superliga' }, pulje: { poolSize: 6 } }) });
    const pl = invitationsHtml({ ...opts, intro: 'Hej\nmed', liga: ligaProfil({ name: 'Premier League 2026/27 — efterår', sync: { provider: 'pulselive', competitionId: 8, season: 2026 } }) });
    const ukendt = invitationsHtml({ ...opts, intro: 'Hej\nmed', liga: ligaProfil({ name: 'La Liga 2027', shortName: 'La Liga', sync: { provider: 'laliga-api' } }) });
    expect(h(sl)).toBe('2549416cf8688576940ba16e238bb04a78b44138c4ffc74c6bcbb609b4f1e876');
    expect(h(pl)).toBe('95a7600473e121268d336a6de0cc4f052cdf2cd78f662b700f7e15e6e9f056f4');
    expect(h(ukendt)).toBe('0b66615ae9a80b845e645bf970bc4b19600208012b236505747bea773061eabd');
    expect(h(invitationsHtml())).toBe('84016c7b16ebbb4740e4544b233d5bc50296fcb525c3cd02f40d7dcec0f0d9cc');
  });
});
