// Oraklets byggesten (scripts/lib/haandboldGruppeOrakel.mjs) på et lille
// udsnit i sidens form. De rigtige sider er ikke committet; oraklet selv er
// (scripts/testdata/ihf-gruppestillinger.json, testet i src/lib/grupper.orakel.test.js).
import { describe, it, expect } from 'vitest';
import { findSportsTabeller, laesGruppetabeller, byggOrakel, afvigelse } from './haandboldGruppeOrakel.mjs';

const tabel = ({ update = 'complete', order = 'GER, POL', ekstra = '' } = {}) => `{{#invoke:Sports table|main|style=WDL
|update=${update}
|source=[https://www.ihf.info IHF]
|winpoints=2
|team_order=${order}
|win_GER=1 |draw_GER=0 |loss_GER=0 |gf_GER=30 |ga_GER=25
|win_POL=0 |draw_POL=0 |loss_POL=1 |gf_POL=25 |ga_POL=30
|win_RHF=0 |draw_RHF=0 |loss_RHF=0 |gf_RHF=0 |ga_RHF=0
|name_GER={{hb|GER}}
|name_POL={{hb|POL}}
|name_RHF= [[Russia men's national handball team|Russian Handball Federation]]
${ekstra}
|class_rules = 1) points; 2) head-to-head points.
}}
`;
const side = (t1, t2) => `== Preliminary round ==\n=== Group A ===\n${t1}\n== Presidents Cup ==\n=== Group I ===\n${t2}\n== Main round ==\n=== Group I ===\n${t1}`;
const KAMPE = [
  { turnering: 'vm2099', sektion: 'Preliminary round › Group A', hjemme: 'GER', ude: 'POL', efter60: { h: 30, u: 25 } },
];

describe('gruppeorakel', () => {
  it('finder tabellerne med sektionssti og felter', () => {
    const t = findSportsTabeller(side(tabel(), tabel()));
    expect(t.map((x) => x.sektion.join(' › '))).toEqual(['Preliminary round › Group A', 'Presidents Cup › Group I', 'Main round › Group I']);
    expect(t[0].felter.team_order).toBe('GER, POL');
  });
  it('Presidents Cup springes over på SEKTIONEN, ikke på gruppenavnet', () => {
    const { tabeller } = laesGruppetabeller(side(tabel(), tabel()), 'vm2099');
    expect(tabeller.map((t) => [t.fase, t.gruppe, t.sektion])).toEqual([
      ['indledende', 'A', 'Preliminary round › Group A'], ['hoved', 'I', 'Main round › Group I'],
    ]);
  });
  it('koderne oversættes til historikkens (RHF → RUS) via name_KODE', () => {
    const { tabeller } = laesGruppetabeller(side(tabel({ order: 'GER, RHF, POL' }), ''), 'vm2099');
    expect(tabeller[0].team_order).toEqual(['GER', 'RUS', 'POL']);
    expect(tabeller[0].stats.RUS).toEqual({ won: 0, draw: 0, lost: 0, gf: 0, ga: 0 });
  });
  it('kun VM: en EM-side afvises ved navn', () => {
    expect(() => laesGruppetabeller(side(tabel(), ''), 'em2024')).toThrow(/ikke et VM/);
  });
  it('en ufærdig tabel er ikke et orakel', () => {
    const { tabeller, ufaerdige } = laesGruppetabeller(side(tabel({ update: '18 January 2025' }), ''), 'vm2099');
    expect(tabeller).toHaveLength(0);
    expect(ufaerdige).toEqual(['Preliminary round › Group A', 'Main round › Group I']);
  });
  it('winpoints ≠ 2 vælter kørslen', () => {
    expect(() => laesGruppetabeller(side(tabel().replace('winpoints=2', 'winpoints=3'), ''), 'vm2099')).toThrow(/winpoints=3/);
  });
  it('tabeller, hvis tal ikke kan regnes af historikken, udelades med grunden', () => {
    const { tabeller: [t] } = laesGruppetabeller(side(tabel(), ''), 'vm2099');
    expect(afvigelse(t, KAMPE)).toBeNull();
    expect(afvigelse(t, [])).toBe('GER tabel 1-0-0 30:25 ≠ historik 0-0-0 0:0; POL tabel 0-0-1 25:30 ≠ historik 0-0-0 0:0');
    const o = byggOrakel([{ turnering: 'vm2099', wikitekst: side(tabel(), ''), kilde: { noegle: 'vm2099' } }], KAMPE);
    // Hovedrundens tabel får den indledende kamp med (begge hold er med) og består også.
    expect(o.tabeller.map((x) => x.sektion)).toEqual(['Preliminary round › Group A', 'Main round › Group I']);
    expect(byggOrakel([{ turnering: 'vm2099', wikitekst: side(tabel(), ''), kilde: {} }], []).udeladt.map((u) => u.sektion))
      .toEqual(['Preliminary round › Group A', 'Main round › Group I']);
  });
});
