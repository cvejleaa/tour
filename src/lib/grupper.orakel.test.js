// ---------------------------------------------------------------------------
// IHF-ORAKLET for gruppeStilling: IHF's slutrækkefølge i hver færdig tabel i
// VM 2021, 2023 og 2025 (indledende runde + hovedrunde) mod kampene i
// scripts/haandbold-historik.json.
//
// Oraklet er bygget af scripts/haandbold-gruppeorakel.mjs (læs dens header)
// og står i scripts/testdata/ihf-gruppestillinger.json. Kampene tages fra
// historikken pr. turnering (kun VM) og sektion; hovedrundens tabeller får
// de indledende kampe mellem de medkvalificerede med (IHF medfører dem).
//
// `hold` gives i ALFABETISK og OMVENDT alfabetisk orden, aldrig i IHF's: ellers
// ville en fuld lighed falde tilbage til facit og bestå af sig selv.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { gruppeStilling, rangerGruppe, IHF_REGEL } from './grupper';
import orakel from '../../scripts/testdata/ihf-gruppestillinger.json';
import historik from '../../scripts/haandbold-historik.json';

const P = { sejr: 2, uafgjort: 1 };
const VM = ['vm2021', 'vm2023', 'vm2025'];

function kampeFor(t) {
  const med = new Set(t.team_order);
  return historik.kampe
    .filter((m) => m.turnering === t.turnering)
    .filter((m) => m.sektion === t.sektion
      || (t.fase === 'hoved' && m.sektion.startsWith('Preliminary round › ') && med.has(m.hjemme) && med.has(m.ude)))
    .map((m) => ({ home: m.hjemme, away: m.ude, homeGoals: m.efter60.h, awayGoals: m.efter60.u }));
}
const holdOrdener = (t) => [[...t.team_order].sort(), [...t.team_order].sort().reverse()];
const fejlUnder = (regel) => orakel.tabeller.filter((t) => holdOrdener(t).some(
  (hold) => rangerGruppe(hold, kampeFor(t), P, regel).map((r) => r.teamName).join() !== t.team_order.join(),
)).map((t) => `${t.turnering} ${t.sektion}`);

describe('oraklet selv', () => {
  it('35 tabeller: 23 indledende + 12 hovedrunde, kun VM, og VM 2021 gruppe A udeladt navngivet', () => {
    expect(orakel.tabeller).toHaveLength(35);
    expect(orakel.tabeller.filter((t) => t.fase === 'indledende')).toHaveLength(23);
    expect(orakel.tabeller.filter((t) => t.fase === 'hoved')).toHaveLength(12);
    expect([...new Set(orakel.tabeller.map((t) => t.turnering))].sort()).toEqual(VM);
    expect(orakel.udeladt.map((u) => `${u.turnering} ${u.sektion}`)).toEqual(['vm2021 Preliminary round › Group A']);
    expect(orakel.udeladt[0].grund).toMatch(/CPV tabel 0-0-3/);
    // Presidents Cup (også «Group I/II») er aldrig med.
    expect(orakel.tabeller.every((t) => /^(Preliminary round › Group [A-H]|Main round › Group (I|II|III|IV))$/.test(t.sektion))).toBe(true);
  });
  it('hver tabels kampe er alle mod alle (hovedrunden inkl. de medførte)', () => {
    for (const t of orakel.tabeller) {
      const n = t.team_order.length;
      expect([t.sektion, kampeFor(t).length]).toEqual([t.sektion, (n * (n - 1)) / 2]);
    }
  });
});

describe('gruppeStilling = IHF\'s rækkefølge', () => {
  for (const t of orakel.tabeller) {
    it(`${t.turnering} ${t.sektion}`, () => {
      for (const hold of holdOrdener(t)) {
        const r = gruppeStilling(hold, kampeFor(t), P);
        expect(r.map((x) => x.teamName)).toEqual(t.team_order);
        expect(r.map((x) => x.rank)).toEqual(t.team_order.map((_, i) => i + 1));
        // Tallene er IHF-tabellens (V/U/T/mål) — også de medførte i hovedrunden.
        for (const x of r) {
          expect([x.teamName, x.won, x.draw, x.lost, x.gf, x.ga]).toEqual(
            [x.teamName, t.stats[x.teamName].won, t.stats[x.teamName].draw, t.stats[x.teamName].lost,
              t.stats[x.teamName].gf, t.stats[x.teamName].ga],
          );
        }
      }
    });
  }
});

// KONTROLFUNDET: hvilke kriterier rammer oraklet overhovedet? Et orakel, der
// er grønt uanset regel, beviser intet om reglen.
describe('kontrolfund: oraklet falder, når et kriterie, det rammer, fjernes', () => {
  it('uden de indbyrdes kriterier (2)-(4) falder fire tabeller', () => {
    expect(fejlUnder({ ...IHF_REGEL, indbyrdes: [] })).toEqual([
      'vm2021 Main round › Group II', 'vm2023 Preliminary round › Group D',
      'vm2023 Main round › Group II', 'vm2025 Main round › Group IV',
    ]);
  });
  it('uden (3) indbyrdes målforskel falder to (trevejs-lighederne POR/ISL/HUN og CRO/EGY/ISL)', () => {
    expect(fejlUnder({ ...IHF_REGEL, indbyrdes: ['point', 'maal'] })).toEqual([
      'vm2023 Preliminary round › Group D', 'vm2025 Main round › Group IV',
    ]);
  });
  it('uden (5)-(6) i alle kampe falder tre (indbyrdes uafgjort, fx Polen 23-23 Tyskland i 2021)', () => {
    expect(fejlUnder({ ...IHF_REGEL, alle: [] })).toEqual([
      'vm2021 Main round › Group I', 'vm2025 Preliminary round › Group F', 'vm2025 Main round › Group II',
    ]);
  });
  // DET ORAKLET IKKE RAMMER — skrevet ned, så ingen tror det. Bliver en af
  // disse rød (et nyt VM i oraklet), er det godt nyt: så rammer oraklet
  // kriteriet, og testen skal vendes til at kræve, at det falder.
  //   (2) indbyrdes point: hvor den skiller, er (3) enig. Bæres syntetisk
  //       (grupper.test.js: «indbyrdes point går forud for indbyrdes målforskel»).
  //   Genanvendelse: ingen tabel skelner. Bæres af reglementets ordlyd og den
  //       syntetiske test «uden genanvendelse …».
  //   (6) mål i alle kampe: nås aldrig. Bæres syntetisk.
  it('oraklet skelner IKKE på (2) alene, på genanvendelse eller på (6)', () => {
    expect(fejlUnder({ ...IHF_REGEL, indbyrdes: ['maalforskel', 'maal'] })).toEqual([]);
    expect(fejlUnder({ ...IHF_REGEL, genanvend: !IHF_REGEL.genanvend })).toEqual([]);
    expect(fejlUnder({ ...IHF_REGEL, alle: ['maalforskel'] })).toEqual([]);
  });
});
