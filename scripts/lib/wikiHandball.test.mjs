// Tests for scripts/lib/wikiHandball.mjs — {{handballbox}} i wikitekst.
//
// Hver strukturvagt har en test, der FÅR den til at kaste, med beskeden
// asserteret: en vagt, der kun er beskrevet i en kommentar, er ikke en vagt.
// Fixturen er VM 2025-siden, beskåret til 26 kampe (se dens hoved).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findHandballboxe, delFelter, overskrifter, parseHold, parseDato, parseTid, parseScore,
  facitFraBox, sidensForskydning, utcIso, laesKampe, beskaarTilKampe, fjernKommentarer,
} from './wikiHandball.mjs';
import { holdForIhfNavn } from '../../src/data/haandboldVm2027Hold.js';

const HER = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(HER, 'x.js'));
const VM2025 = readFileSync(resolve(HER, '../testdata/wiki-vm2025-udsnit.wikitext'), 'utf8');

const box = (felter, foer = '') => `${foer}{{handballbox\n${Object.entries(felter).map(([k, v]) => `|${k}=${v}`).join('\n')}\n}}\n`;

describe('skabeloner og felter', () => {
  it('deler på | på øverste niveau — ikke inde i links og indlejrede skabeloner', () => {
    expect(delFelter('handballbox|team1={{hb-rt|SRB}}|stadium=[[SAP Garden|Garden]], [[Munich]]|score='))
      .toEqual(['handballbox', 'team1={{hb-rt|SRB}}', 'stadium=[[SAP Garden|Garden]], [[Munich]]', 'score=']);
  });

  it('finder kasser med sektionssti, også når første felt står på samme linje (|bg=)', () => {
    const t = `== Final round ==\n=== Final ===\n{{handballbox|bg=#CC9966\n|date=2 February 2025\n|team1={{hb-rt|CRO}}\n|score=26–32\n|team2={{hb|DEN}}\n}}`;
    const [b] = findHandballboxe(t);
    expect(b.sektion).toEqual(['Final round', 'Final']);
    expect(b.felter.score).toBe('26–32');
    expect(b.ukendte).toEqual(['bg']);
  });

  it('overskrifter tåler mellemrum og fed skrift; niveau 3 nulstilles af et nyt niveau 2', () => {
    const t = "== Main round ==\n=== Group I ===\n{{handballbox|date=1 January 2025}}\n==Final round==\n{{handballbox|date=2 January 2025}}";
    const bs = findHandballboxe(t);
    expect(bs.map((b) => b.sektion)).toEqual([['Main round', 'Group I'], ['Final round']]);
    expect(overskrifter("=== '''Group A''' ===").map((o) => o.titel)).toEqual(['Group A']);
  });

  it('en kasse i en kommentar er ikke en kamp', () => {
    const t = `<!-- ${box({ date: '1 January 2025', score: '30–20' })} -->${box({ date: '2 January 2025' })}`;
    expect(findHandballboxe(t)).toHaveLength(1);
    expect(fjernKommentarer('a<!-- åben til slut')).toBe('a');
  });

  it('KASTER på en kasse, der aldrig lukkes — og siger linjen', () => {
    expect(() => findHandballboxe('linje 1\n{{handballbox\n|date=1 January 2025\n|team1={{hb|DEN}}'))
      .toThrow(/linje 2 lukkes aldrig.*Intet er læst/);
  });

  it('KASTER på et ukendt felt, der ligner et resultat — men ikke på et, der ikke gør', () => {
    expect(() => findHandballboxe(box({ score: '30–29', aet: 'yes' }))).toThrow(/«aet=yes».*ligner et resultat/);
    expect(() => findHandballboxe(box({ score: '30–29', OT3: '2–1' }))).toThrow(/OT3/);
    // MediaWiki skelner store/små bogstaver: `ft=` er IKKE FT, og må ikke sluges.
    expect(() => findHandballboxe(box({ score: '30–29', ft: '25–25' }))).toThrow(/«ft=25–25»/);
    // Et nyt, harmløst felt tælles — det vælter intet.
    const [b] = findHandballboxe(box({ score: '30–29', other: 'x', bg: '#fff' }));
    expect(b.ukendte).toEqual(['other', 'bg']);
    // Et tomt resultat-lignende felt bærer intet facit.
    expect(() => findHandballboxe(box({ score: '', aet: '' }))).not.toThrow();
  });
});

describe('felternes former', () => {
  it('hold: {{hb|…}}, {{hb-rt|…}} og pladsholdere; alt andet kaster', () => {
    expect(parseHold('{{hb-rt|SRB}}')).toEqual({ kode: 'SRB' });
    expect(parseHold('{{hb|URU}}')).toEqual({ kode: 'URU' });
    expect(parseHold('{{hb|RUS|name=X}}')).toEqual({ kode: 'RUS' });
    expect(parseHold('A1')).toEqual({ pladsholder: 'A1' });
    expect(parseHold('WQF1')).toEqual({ pladsholder: 'WQF1' });
    expect(parseHold('')).toBeNull();
    expect(() => parseHold('{{flagicon|DEN}} Denmark', 'X: ')).toThrow('X: holdet «{{flagicon|DEN}} Denmark» er hverken {{hb|KODE}} eller en pladsholder');
    expect(() => parseHold('[[Denmark]]')).toThrow(/hverken/);
  });

  it('dato: to former; ukendt måned og umulig dato kaster', () => {
    expect(parseDato('13 January 2027')).toBe('2027-01-13');
    expect(parseDato('January 13, 2027')).toBe('2027-01-13');
    expect(parseDato('')).toBeNull();
    expect(() => parseDato('13.01.2027')).toThrow(/ukendt form/);
    expect(() => parseDato('13 Janvier 2027')).toThrow(/ukendt måned/);
    expect(() => parseDato('30 February 2027')).toThrow(/findes ikke/);
  });

  it('tid: ét tidspunkt eller et vindue; alt andet kaster', () => {
    expect(parseTid('17:30')).toEqual({ tid: '17:30', senest: null });
    expect(parseTid('8:15')).toEqual({ tid: '08:15', senest: null });
    // VM 2027-siden har netop disse to former (Gruppe D, hentet 2/11 2026).
    expect(parseTid('18:00/30')).toEqual({ tid: '18:00', senest: '18:30' });
    expect(parseTid('20:30/21:00')).toEqual({ tid: '20:30', senest: '21:00' });
    expect(parseTid('')).toBeNull();
    for (const v of ['TBD', '18:00 CET', '25:00', '18:00/17:30', '18:00/23:00', '18:00/18:00']) {
      expect(() => parseTid(v), v).toThrow(/ukendt form/);
    }
  });

  // GRÆNSERNE præcist: 23:59 og et vindue på 120 min er gyldige; 24:00, et
  // vindue til 24:00 og 121 min er ikke. Hver linje gør én vagt rød
  // (time over 23, minut over 59, begge ender, og vinduets længde).
  it('tid: grænserne for timer, minutter og vinduets længde', () => {
    expect(parseTid('23:59')).toEqual({ tid: '23:59', senest: null });
    // Punktum som skilletegn (britisk form) er samme tid som kolon.
    expect(parseTid('17.30')).toEqual({ tid: '17:30', senest: null });
    expect(parseTid('20.30/21.00')).toEqual({ tid: '20:30', senest: '21:00' });
    expect(parseTid('18:00/20:00')).toEqual({ tid: '18:00', senest: '20:00' });
    expect(parseTid('21:30/23:30')).toEqual({ tid: '21:30', senest: '23:30' });
    for (const v of ['24:00', '17:60', '23:30/24:00', '20:30/20:60', '18:00/20:01', '18:00/21:00']) {
      expect(() => parseTid(v), v).toThrow(/ukendt form/);
    }
  });

  it('score: «tal–tal» med alle bindestreger; fodnoter fjernes; tekst kaster', () => {
    expect(parseScore('31–30')).toEqual({ h: 31, u: 30 });
    expect(parseScore('31-30')).toEqual({ h: 31, u: 30 });
    expect(parseScore('5–3{{efn-ua|Even though …}}')).toEqual({ h: 5, u: 3 });
    expect(parseScore('5–3<ref>x</ref>')).toEqual({ h: 5, u: 3 });
    expect(parseScore('')).toBeNull();
    expect(() => parseScore('31–30 (OT)')).toThrow(/ikke «tal–tal»/);
    expect(() => parseScore('w/o')).toThrow(/ikke «tal–tal»/);
    // Kun FODNOTE-skabeloner fjernes. En anden skabelon kan bære betydning.
    expect(() => parseScore('{{nowrap|31–30}}')).toThrow(/ikke «tal–tal»/);
  });
});

describe('facit: ordinær tid, forlængelse og straffekast', () => {
  it('ordinær kamp: efter 60 = slutstillingen, ingen afgørelse', () => {
    expect(facitFraBox({ score: '31–30', HT: '16–16' })).toEqual({
      slut: { h: 31, u: 30 }, efter60: { h: 31, u: 30 }, afgjort: null, halvleg: { h: 16, u: 16 },
    });
  });

  it('uafgjort efter 60 i en gruppekamp er et facit (X), ikke en fejl', () => {
    expect(facitFraBox({ score: '17–17' }).efter60).toEqual({ h: 17, u: 17 });
  });

  it('forlængelse: efter 60 = FT, slut = score', () => {
    expect(facitFraBox({ score: '31–30', FT: '26–26', OT1: '5–4' }))
      .toMatchObject({ efter60: { h: 26, u: 26 }, slut: { h: 31, u: 30 }, afgjort: 'forlaenget' });
    expect(facitFraBox({ score: '38–37', FT: '30–30', OT1: '4–4', OT2: '4–3' }).afgjort).toBe('forlaenget');
  });

  it('straffekast: afgjort straffe, også efter forlængelse', () => {
    expect(facitFraBox({ score: '33–31', FT: '28–28', PEN: '5–3{{efn-ua|…}}' }))
      .toMatchObject({ efter60: { h: 28, u: 28 }, slut: { h: 33, u: 31 }, afgjort: 'straffe' });
    expect(facitFraBox({ score: '39–38', FT: '30–30', OT1: '3–3', OT2: '2–2', PEN: '4–3' }).afgjort).toBe('straffe');
  });

  it('ikke spillet → null', () => {
    expect(facitFraBox({ score: '', HT: '' })).toBeNull();
  });

  // OT2 er et KENDT felt. Står det ikke på listen, er det «resultat-lignende»
  // (ot\d*) og vælter hele siden — så kampen skal kunne læses hele vejen
  // gennem findHandballboxe, ikke kun i facitFraBox direkte.
  it('en kamp med to forlængelser læses hele vejen fra wikiteksten', () => {
    const [k] = laesKampe(box({
      date: '29 January 2025', time: '20:30', team1: '{{hb-rt|POR}}', team2: '{{hb|GER}}',
      score: '38–37', FT: '30–30', OT1: '4–4', OT2: '4–3',
    }));
    expect(k.facit).toMatchObject({ efter60: { h: 30, u: 30 }, slut: { h: 38, u: 37 }, afgjort: 'forlaenget' });
    expect(k.ukendte).toEqual([]);
  });

  it('KASTER, når udeholdets pausestilling er større end efter 60 min', () => {
    expect(() => facitFraBox({ score: '25–18', HT: '10–20' })).toThrow('pausestillingen 10–20 er større end stillingen efter 60 min 25–18');
    expect(facitFraBox({ score: '25–18', HT: '10–18' }).halvleg).toEqual({ h: 10, u: 18 });
  });

  it('KASTER på hver inkonsistent form', () => {
    expect(() => facitFraBox({ score: '', FT: '20–20' })).toThrow(/periodefelter, men ingen slutstilling/);
    expect(() => facitFraBox({ score: '31–30', OT1: '5–4' })).toThrow(/uden FT/);
    expect(() => facitFraBox({ score: '31–30', FT: '26–26' })).toThrow(/FT står uden forlængelse/);
    expect(() => facitFraBox({ score: '31–30', FT: '26–25', OT1: '5–5' })).toThrow(/ikke uafgjort/);
    expect(() => facitFraBox({ score: '31–30', FT: '26–26', OT2: '5–4' })).toThrow(/OT2 uden OT1/);
    expect(() => facitFraBox({ score: '32–30', FT: '26–26', OT1: '5–4' })).toThrow('FT + forlængelse + straffe = 31–30, men slutstillingen er 32–30');
    expect(() => facitFraBox({ score: '20–19', HT: '21–9' })).toThrow(/pausestillingen 21–9 er større/);
    expect(() => facitFraBox({ score: '3–2' })).toThrow(/3 mål efter 60 min er ikke en håndboldkamp/);
    expect(() => facitFraBox({ score: '71–30' })).toThrow(/71 mål/);
  });

  // Grænserne ligger PRÆCIS på 5 og 70 (gyldige). En mutation til < 4 / > 71
  // ville lade 4 og 71 slippe igennem — de to tal herunder fanger den.
  it('plausibilitet: 5 og 70 er gyldige, 4 og 71 er ikke', () => {
    expect(facitFraBox({ score: '70–5' }).efter60).toEqual({ h: 70, u: 5 });
    expect(() => facitFraBox({ score: '30–4' })).toThrow(/4 mål/);
  });
});

describe('tidszonen', () => {
  it('læser «All times are local (UTC+1)» og regner om', () => {
    expect(sidensForskydning(VM2025)).toBe(60);
    expect(utcIso('2027-01-13', '17:30', 60)).toBe('2027-01-13T16:30:00Z');
    // Over midnat: 00:30 lokalt UTC+1 er dagen før i UTC.
    expect(utcIso('2027-01-14', '00:30', 60)).toBe('2027-01-13T23:30:00Z');
    expect(sidensForskydning("''All times are local ([[Egypt Standard Time|UTC+2]]).''")).toBe(120);
  });

  // Fortegnet: vest for UTC er negativt, med både ASCII-bindestreg og minus.
  it('vest for UTC er negativ forskydning (og minutter tæller)', () => {
    expect(sidensForskydning('All times are local (UTC−3).')).toBe(-180);
    expect(sidensForskydning('All times are local (UTC-3).')).toBe(-180);
    expect(sidensForskydning('All times are local (UTC+5:30).')).toBe(330);
    expect(utcIso('2027-01-13', '17:30', -180)).toBe('2027-01-13T20:30:00Z');
  });

  it('KASTER, når siden ikke siger det — eller siger to ting', () => {
    expect(() => sidensForskydning('== Preliminary round ==')).toThrow(/der gættes ikke/);
    expect(() => sidensForskydning('All times are local (UTC+1).\nAll times are local (UTC+2).')).toThrow(/flere tidszoner \(1, 2\)/);
  });
});

describe('VM 2025-fixturen hele vejen', () => {
  const kampe = laesKampe(VM2025);

  it('læser alle 26 kasser uden fejl', () => {
    expect(kampe).toHaveLength(26);
  });

  it('kvartfinalen POR–GER: 26–26 efter 60, 31–30 efter forlængelse', () => {
    const k = kampe.find((x) => x.hjemme.kode === 'POR' && x.ude.kode === 'GER');
    expect(k).toMatchObject({ dato: '2025-01-29', tid: '20:30', sektion: ['Final round', 'Quarterfinals'] });
    expect(k.facit).toMatchObject({ efter60: { h: 26, u: 26 }, slut: { h: 31, u: 30 }, afgjort: 'forlaenget' });
  });

  it('31.-pladskampen GUI–CUB: 28–28 efter 60, afgjort i straffekast (fodnoten i PEN-feltet fjernet)', () => {
    const k = kampe.find((x) => x.hjemme.kode === 'GUI');
    expect(k.facit).toMatchObject({ efter60: { h: 28, u: 28 }, slut: { h: 33, u: 31 }, afgjort: 'straffe' });
  });

  // UAFHÆNGIG KILDE. De samme kampe læst af IHF-parseren (D2) fra IHF's egne
  // dagsider (functions-platform/testdata). Er Wikipedias score, dato og tid
  // de samme som IHF's, er parseren her ikke bare enig med sig selv.
  it('stemmer med IHF på hovedrundedagen 22/1 og finaledagen 2/2 — score, dato og tid i UTC', () => {
    const { parseDagside } = require('../../functions-platform/ihfParse.js');
    // IHF-navn → Wikipedia-kode går gennem HOLDFILEN (ihfNavn → hbKode), så
    // testen også beviser holdfilens nødvejs-nøgle for de 2027-hold, der
    // spillede her. Kun Cuba er ikke med i 2027 og står derfor i testen.
    const IKKE_2027 = { Cuba: 'CUB' };
    const kode = (navn) => holdForIhfNavn(navn)?.hbKode ?? IKKE_2027[navn];
    let n = 0;
    for (const f of ['ihf-dag-2025-01-22.html', 'ihf-dag-2025-02-02.html']) {
      const html = readFileSync(resolve(HER, `../../functions-platform/testdata/${f}`), 'utf8');
      for (const i of parseDagside(html)) {
        expect(kode(i.hjemme), i.hjemme).toBeTruthy();
        expect(kode(i.ude), i.ude).toBeTruthy();
        const w = kampe.find((k) => k.hjemme.kode === kode(i.hjemme) && k.ude.kode === kode(i.ude));
        expect(w, `${i.hjemme}–${i.ude}`).toBeTruthy();
        expect(w.dato).toBe(i.dato);
        expect(w.facit.slut).toEqual(i.slutScore);
        expect(utcIso(w.dato, w.tid, 60)).toBe(`${i.dato}T${i.gmtTid}:00Z`);
        n += 1;
      }
    }
    expect(n).toBe(10);
  });
});

describe('beskæring', () => {
  it('beholder fra første kamps niveau-2-sektion til den næste niveau-2 efter sidste kamp', () => {
    const t = `== Intro ==\ntekst\n== Preliminary round ==\nAll times are local (UTC+1).\n${box({ date: '1 January 2025' })}== Main round ==\n${box({ date: '2 January 2025' })}== Final ranking ==\nslut`;
    const b = beskaarTilKampe(t);
    expect(b.startsWith('== Preliminary round ==')).toBe(true);
    expect(b).toContain('== Main round ==');
    expect(b).not.toContain('Intro');
    expect(b).not.toContain('Final ranking');
    expect(findHandballboxe(b)).toHaveLength(2);
  });

  it('kaster på en side uden kampe', () => {
    expect(() => beskaarTilKampe('== Intro ==')).toThrow(/ingen \{\{handballbox\}\}/);
  });
});
