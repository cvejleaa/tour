/**
 * Render-tests for rundens point og kronen I STILLINGEN.
 *
 * Findes som EGEN fil, fordi ingen af de eksisterende GameStandings-tests
 * sender et `game` ind. Uden `game.type === 'football'` er evne-gaten lukket,
 * kolonnen renderes aldrig, og hele suiten ville stå grøn uden at røre
 * ændringen — præcis den fælde, QC pegede på.
 *
 * Derfor asserterer hver positiv test PÅ TILSTEDEVÆRELSE: glemmer en fremtidig
 * test at sætte spiltypen, bliver den rød i stedet for tavst tom.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../firebase', () => ({ db: {} }));

const mockStandings = vi.fn();
vi.mock('./useVisibleGameStandings', () => ({
  useVisibleGameStandings: () => mockStandings(),
}));
vi.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { uid: 'me' } }),
}));
vi.mock('../../components/Avatar', () => ({
  default: () => <span data-testid="avatar" />,
}));
vi.mock('./football/SpillerDetalje', () => ({ default: () => <div /> }));

import GameStandings from './GameStandings';

const FODBOLD = { id: 'sl', type: 'football' };

/** Seks spillere, så tre står på podiet og resten i tabellen. */
const raekker = (perRoundPrUid) => [
  ['u1', 'Anne', 60], ['u2', 'Bo', 50], ['u3', 'Carl', 40],
  ['u4', 'Dorte', 30], ['me', 'Mig', 20], ['u5', 'Erik', 10],
].map(([uid, name, totalPoints], i) => ({
  uid, name, totalPoints, rank: i + 1, perRound: perRoundPrUid[uid] ?? null,
}));

function vis({ standings, leagues = [], game = FODBOLD, matches = [] }) {
  // leagueCount mindst 1: med 0 viser fladen "du er ikke med i en liga endnu"
  // og rendrer slet ingen tabel. Ligalisten kan være tom uden at man står
  // uden for alle ligaer (fx en liga man er i, men som ikke er hentet her).
  mockStandings.mockReturnValue({
    standings,
    leagues,
    leagueCount: Math.max(leagues.length, 1),
    loading: false,
    error: null,
  });
  return render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes>
        <Route path="/spil/:gameId" element={<GameStandings gameId="sl" game={game} matches={matches} />} />
      </Routes>
    </MemoryRouter>,
  );
}

/** Tabellen under podiet — podiet har sine egne kopier af de samme tal. */
const tabel = () => screen.getByRole('table');

/**
 * Navnene på dem, der er markeret som førende i runden — uanset om de står i tabellen eller på
 * podiet. Med tre eller færre spillere i et filter er listen TOM og alle står
 * på podiet, så en assertion, der kun kigger i <tr>, ville fejle af den
 * forkerte grund (og en, der kun kigger på podiet, ville gå glip af nr. 4).
 */
const foerendeNavne = () => screen.queryAllByLabelText('Flest point i runden')
  .map((k) => k.closest('tr, .podium__spot'))
  .map((boks) => boks?.querySelector('button')?.textContent ?? null)
  .sort();

beforeEach(() => { mockStandings.mockReset(); });

describe('rundens point i stillingen', () => {
  it('viser rundenummeret og rundens point pr. spiller', () => {
    vis({ standings: raekker({ u4: { 7: 3, 8: 12.3 }, me: { 8: 4 } }) });
    // Rundenummeret SKAL stå: uden det er tallet ikke tilskrevet en runde, og
    // det kan læses som pilens forklaring — pilen opdateres først, når
    // rundens kupon er afgjort, og handler derfor ofte om en ANDEN runde.
    expect(screen.getByText(/Runde 8: tallet under totalen er rundens point/)).toBeInTheDocument();
    const dorte = within(tabel()).getByText('Dorte').closest('tr');
    expect(within(dorte).getByText('+12,3')).toBeInTheDocument();
    // Runde 7 er IKKE rundens — kun den seneste vises.
    expect(within(dorte).queryByText('+3')).toBeNull();
  });

  it('markeringen er 🔥 og IKKE 👑 — pokalen ovenover bruger kronen', () => {
    // BESLUTNINGEN, bundet fast. Begge var 👑 i første udgave, og Quality
    // Control kaldte det en reel designrisiko: to identiske symboler med hver
    // sin betydning på samme skærm — pokalen 👑 Rundekongen (flest HELE runder
    // i sæsonen, endelig) står lige over podiet, mens markeringen her er
    // foreløbig og flytter sig i løbet af weekenden.
    //
    // De øvrige tests finder markeringen på dens aria-label og ville derfor
    // bestå, selv om nogen satte kronen tilbage. Denne ser tegnet.
    vis({ standings: raekker({ u4: { 8: 12.3 }, me: { 8: 4 } }) });
    const markering = screen.getAllByLabelText('Flest point i runden');
    expect(markering).not.toHaveLength(0);
    for (const m of markering) {
      expect(m.textContent).toBe('🔥');
      expect(m.textContent).not.toBe('👑');
    }
    // Overskriftens forklaring skal bruge SAMME tegn som markeringen.
    expect(screen.getByText(/🔥 har flest indtil videre/)).toBeInTheDocument();
  });

  it('markeringen sidder på rundens højeste — ikke på totalens', () => {
    // Anne fører spillet (60 point), men Dorte tog runden. Det er hele
    // pointen: den, der vinder ugen, er ofte ikke den, der fører.
    vis({ standings: raekker({ u1: { 8: 1 }, u4: { 8: 12.3 }, me: { 8: 4 } }) });
    const dorte = within(tabel()).getByText('Dorte').closest('tr');
    expect(within(dorte).getByLabelText('Flest point i runden')).toBeInTheDocument();
    const mig = within(tabel()).getByText('Mig').closest('tr');
    expect(within(mig).queryByLabelText('Flest point i runden')).toBeNull();
  });

  it('UAFGJORT DELES — to med samme rundepoint bærer begge kronen', () => {
    vis({ standings: raekker({ u4: { 8: 7 }, me: { 8: 7 }, u5: { 8: 1 } }) });
    const t = tabel();
    expect(within(within(t).getByText('Dorte').closest('tr')).getByLabelText('Flest point i runden')).toBeInTheDocument();
    expect(within(within(t).getByText('Mig').closest('tr')).getByLabelText('Flest point i runden')).toBeInTheDocument();
  });

  it('NUL VINDER IKKE — en runde hele feltet tabte giver ingen krone og ingen 👑-forklaring', () => {
    vis({ standings: raekker({ u4: { 8: -2 }, me: { 8: -5 } }) });
    // Knappen «Runde 8» står også på siden — det er LINJEN, der skal findes.
    expect(screen.getByText(/Runde 8: tallet/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Flest point i runden')).toBeNull();
    // Forklaringslinjen om kronen må heller ikke stå, når ingen bærer den.
    expect(screen.queryByText(/har flest indtil videre/)).toBeNull();
  });

  it('en spiller uden point i runden viser – og siger HVORFOR', () => {
    // Stregen betyder "ingen afgjorte tips i runden endnu", IKKE "deltog ikke": et
    // forbier står som 0 (nøglen skrives, så snart ét tip er afgjort). Stregen
    // er kun for den, hvis tips ingen facit har endnu — og den, der ikke tippede.
    vis({ standings: raekker({ u4: { 8: 5 } }) });
    const mig = within(tabel()).getByText('Mig').closest('tr');
    const streg = within(mig).getByText('–');
    expect(streg).toHaveAttribute('title', 'Ingen afgjorte tips i runden endnu');
  });

  it('INGEN FARVE og INGEN etiket på den lavest scorende', () => {
    // Farve er en dom, cifre er en kendsgerning. Huset fremhæver kun navne
    // for at have haft RET — en bundmarkering ville være en kæp.
    vis({ standings: raekker({ u1: { 8: 20 }, u4: { 8: 0.1 }, me: { 8: 4 } }) });
    expect(screen.queryByText(/sidst i runden/i)).toBeNull();
    expect(screen.queryByText(/dårligst/i)).toBeNull();
    const dorte = within(tabel()).getByText('Dorte').closest('tr');
    // Ingen rød/advarsels-klasse på rækken med det laveste tal.
    expect(dorte.className).not.toMatch(/red|danger|warn/);
  });
});

describe('pilen måler den viste runde — ikke et gammelt øjebliksbillede', () => {
  // EJERENS SAG, i fladen. Han havde rundens næsthøjeste tal og en pil NED.
  // Serverens previousRank er et øjebliksbillede fra sidste KUPON-afgjorte
  // runde og kan ligge flere runder tilbage; her sættes den bevidst forkert
  // (som produktionen havde den), og testen kræver, at fladen IKKE bruger den.
  const medGammelPil = () => [
    ['a', 'Marianne', 96.3, { 5: 80.9, 6: 15.4 }, 1],
    ['b', 'Better', 78, { 5: 68.6, 6: 9.4 }, 2],
    ['c', 'Sonja', 77, { 5: 70.1, 6: 6.9 }, 5],
    ['d', 'Bibamus', 73.6, { 5: 60.6, 6: 13 }, 3],
    ['e', 'Team Sharkey', 61.3, { 5: 58.8, 6: 2.5 }, 4],
    ['f', 'Oldefar', 44.4, { 5: 35.5, 6: 8.9 }, 6],
    ['g', 'Fasteren', 36.5, { 5: 36.5 }, 7],
  ].map(([uid, name, totalPoints, perRound, previousRank], i) => ({
    uid, name, totalPoints, perRound, previousRank, rank: i + 1, bonusPoints: 0,
  }));

  /** Pilens tekst i en spillers række, eller null hvis der ingen er. */
  const pil = (navn) => {
    const boks = screen.getByText(navn).closest('tr, .podium__spot');
    const m = boks.textContent.match(/[▲▼]\s*\d+/);
    return m ? m[0].replace(/\s+/g, '') : null;
  };

  it('den, der ikke rykkede i runden, får INGEN pil — heller ikke en falsk ned', () => {
    vis({ standings: medGammelPil() });
    // Før runde 6: Marianne 80,9 · Sonja 70,1 · Better 68,6 · Bibamus 60,6 ·
    // Team Sharkey 58,8 · Fasteren 36,5 · Oldefar 35,5.
    // Bibamus var nr. 4 og er nr. 4. Serverens previousRank sagde 3 → ▼1.
    expect(pil('Bibamus')).toBeNull();
    expect(pil('Team Sharkey')).toBeNull();
  });

  it('de, der FAKTISK rykkede, får deres pil', () => {
    vis({ standings: medGammelPil() });
    // KUN listen bærer pile — podiet viser medalje, navn og point, ingen pil.
    // Better og Sonja byttede plads, men står som nr. 2 og 3 og har derfor
    // ingen pil at vise. Testen holder sig til listen, hvor pilen findes.
    expect(pil('Oldefar')).toBe('▲1');   // 7 -> 6
    expect(pil('Fasteren')).toBe('▼1');  // 6 -> 7
  });

  it('rundens point og pilen peger samme vej for den, der vandt runden', () => {
    vis({ standings: medGammelPil() });
    // Marianne har rundens højeste tal og fører. (Hun står på podiet, som
    // aldrig viser pile — derfor kun ilden asserteres her.)
    expect(foerendeNavne()).toEqual(['Marianne']);
  });
});

describe('pilen under et liga-filter med startrunde', () => {
  // Komponenten skal give ligaens startrunde VIDERE til pilberegningen. Gør
  // den ikke det, tælles runder FØR ligaens start med i "stillingen før
  // runden", og en spiller med en stor gammel score får en falsk stor pil.
  // Fixturet er valgt, så de to veje giver forskellige pile — ellers ville
  // testen bestå, uanset om startrunden blev givet med (mutationstestet).
  const L = {
    id: 'L1', name: 'Sent hold', startRound: 20,
    memberUids: ['m1', 'm2', 'm3', 'm4', 'm5'],
  };
  const L2 = { id: 'L2', name: 'Alle', memberUids: ['m1', 'm2', 'm3', 'm4', 'm5'] };

  const felt = () => [
    ['m1', 'Anne', { 20: 50, 21: 10 }],
    ['m2', 'Bo', { 20: 40, 21: 8 }],
    ['m3', 'Carl', { 20: 30, 21: 6 }],
    // Dorte har 100 point i runde 3 — LANGT før ligaens start. De må ikke
    // tælle med, hverken i totalen eller i pilen.
    ['m4', 'Dorte', { 3: 100, 20: 5, 21: 3 }],
    ['m5', 'Erik', { 3: 0, 20: 9, 21: 0.5 }],
  ].map(([uid, name, perRound], i) => ({
    uid, name, perRound, bonusPoints: 0, totalPoints: 0, rank: i + 1,
  }));

  const pil = (navn) => {
    const boks = screen.getByText(navn).closest('tr, .podium__spot');
    const m = boks.textContent.match(/[▲▼]\s*\d+/);
    return m ? m[0].replace(/\s+/g, '') : null;
  };

  it('runder før ligaens start tæller ikke med i pilen', () => {
    vis({ standings: felt(), leagues: [L, L2] });
    fireEvent.change(screen.getByLabelText('Vis stilling for'), { target: { value: 'L1' } });
    // Ligaens tal (fra runde 20): Anne 60, Bo 48, Carl 36, Erik 9,5, Dorte 8.
    // Før runde 21:                Anne 50, Bo 40, Carl 30, Erik 9,   Dorte 5.
    // Ingen af de to i listen har flyttet sig.
    expect(pil('Erik')).toBeNull();
    expect(pil('Dorte')).toBeNull();
    // Tælles runde 3 med, bliver Dorte nr. 1 før runden og falder fire
    // pladser — en pil, der udelukkende kommer af point, ligaen ikke tæller.
  });
});

describe('overskriften overlever en TOM liste', () => {
  // REGRESSIONEN. Overskriften stod oprindeligt inde i listens betingelse. Med
  // tre eller færre spillere er listen tom — alle står på podiet — og så blev
  // rundepoint og kroner vist UDEN et ord om, hvilken runde det handlede om.
  //
  // Alle andre fixtures her har 4+ spillere, så listen aldrig er tom. Test
  // Manager beviste, at man kunne flytte overskriften tilbage ind i
  // listens betingelse — altså gendanne præcis den fejl — med alle 57 tests
  // grønne. Den her er den eneste, der kan se det.
  const tre = [
    ['u1', 'Anne', 60], ['u2', 'Bo', 50], ['u3', 'Carl', 40],
  ].map(([uid, name, totalPoints], i) => ({
    uid, name, totalPoints, rank: i + 1, perRound: { 8: 10 - i },
  }));

  it('med tre spillere er der INGEN tabel — og overskriften står der alligevel', () => {
    vis({ standings: tre });
    // Beviser at listen faktisk er tom: findes der en tabel, tester vi ikke
    // det tilfælde, kommentaren i koden handler om.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/Runde 8: tallet under totalen er rundens point/))
      .toBeInTheDocument();
  });

  it('kronen står på podiet, og forklaringen af den står med', () => {
    vis({ standings: tre });
    expect(foerendeNavne()).toEqual(['Anne']);
    expect(screen.getByText(/har flest indtil videre/)).toBeInTheDocument();
  });
});

describe('rundens point — hvornår den IKKE vises', () => {
  it('ikke i et spil uden runder (evne-gaten)', () => {
    // Gaten er på spillets EVNE, ikke på fanen: Stilling-fanen findes stadig
    // for cykelspillet, den viser bare ikke rundepoint.
    vis({ standings: raekker({ u4: { 8: 5 } }), game: { id: 't', type: 'cycling' } });
    expect(screen.queryByText(/rundens point/)).toBeNull();
    expect(screen.queryByLabelText('Flest point i runden')).toBeNull();
  });

  it('ikke når ingen har point i nogen runde endnu', () => {
    vis({ standings: raekker({}) });
    expect(screen.queryByText(/rundens point/)).toBeNull();
  });

  it('ikke når kun kampe UDEN rundenummer har givet point', () => {
    vis({ standings: raekker({ u4: { uden: 9 } }) });
    expect(screen.queryByText(/rundens point/)).toBeNull();
  });
});

describe('rundens point under et liga-filter med startrunde', () => {
  const LIGA = {
    // FIRE medlemmer med vilje: med tre ville listen være tom (alle på
    // podiet), og en assertion om at overskriften mangler ville bestå, uanset
    // om startrunde-gaten virkede. Det var netop den fælde, mutationstesten
    // afslørede.
    id: 'L1', name: 'Sent hold', startRound: 20, memberUids: ['u1', 'u2', 'u4', 'me'],
  };
  // Filteret vises først ved MERE end én liga ("alle mine ligaer" og den ene
  // liga er ellers det samme). Derfor en liga nummer to uden startrunde —
  // et realistisk fixture frem for et opskruet leagueCount.
  const LIGA2 = {
    id: 'L2', name: 'Hele holdet', memberUids: ['u1', 'u2', 'u3', 'u4', 'me', 'u5'],
  };

  /** Vælg ligaen med startrunde i dropdown'en. */
  const vaelgLiga = () => {
    fireEvent.change(screen.getByLabelText('Vis stilling for'), { target: { value: 'L1' } });
  };

  it('en runde FØR ligaens start kan ikke blive rundens — heller ikke som den eneste', () => {
    // Medlemmerne har KUN point i runde 3, og ligaen tæller fra runde 20.
    // Ufiltreret ville runde 3 være "rundens"; i ligaen findes den ikke.
    // Testen er skrevet så de to svar er FORSKELLIGE — ellers ville den bestå,
    // uden at filteret gjorde noget.
    const rows = raekker({ u1: { 3: 9 }, u2: { 3: 7 }, u4: { 3: 5 }, me: { 3: 1 } });
    vis({ standings: rows, leagues: [LIGA, LIGA2] });
    expect(screen.getByText(/Runde 3:/)).toBeInTheDocument();
    vaelgLiga();
    expect(screen.queryByText(/Runde 3:/)).toBeNull();
    expect(screen.queryByText(/rundens point/)).toBeNull();
  });

  it('kronen regnes af LIGAENS felt — en bedre runde uden for ligaen tæller ikke', () => {
    // Erik (u5) er ikke medlem og har rundens klart højeste tal. Ufiltreret
    // bærer han kronen; i ligaen skal Dorte have den. Uden afgrænsningen til
    // det VISTE felt ville kronen forsvinde for ligaens medlemmer, fordi
    // vinderen står i en liga, de ikke deler.
    // Medlemmernes vektorer STEMMER med deres totaler (60/50/30/20): under
    // ligaen regnes de forfra, og en vektor, totalen afviser, har ingen point
    // i runden (rundensPoint) — så ville ingen føre, og testen ville måle
    // klar-reglen i stedet for ligaens felt.
    const rows = raekker({
      u1: { 1: 58, 21: 2 }, u2: { 1: 47, 21: 3 }, u4: { 1: 24, 21: 6 }, me: { 1: 19, 21: 1 }, u5: { 21: 99 },
    });
    vis({ standings: rows, leagues: [LIGA, LIGA2] });
    expect(foerendeNavne()).toEqual(['Erik']);
    vaelgLiga();
    expect(screen.queryByText('Erik')).toBeNull();
    expect(foerendeNavne()).toEqual(['Dorte']);
  });
});

// ---------------------------------------------------------------------------
// VÆLGEREN «Samlet / Runde N» over podiet (ejerens ønske 12/10 2026: «2 knapper
// så man kan skifte mellem total stilling og ugestilling»). Rundevisningen
// rangerer efter rundens point ALENE; det store tal er rundens, det lille er
// placering og point fra Samlet. Der asserteres på INDHOLDET af linjen — og
// på det, der IKKE må stå i rundevisningen.
// ---------------------------------------------------------------------------
describe('vælgeren Samlet / Runde N', () => {
  // Rundens fører er IKKE totalens: Erik er sidst samlet (10 p) men tog runden
  // (+20); Anne fører samlet (60 p) uden point i runden. Carl er i minus.
  const FELT = () => raekker({ u5: { 8: 20 }, u4: { 8: 12.3 }, u2: { 8: 4 }, me: { 8: 3 }, u3: { 8: -1 } });
  const gruppe = () => screen.getByRole('group', { name: 'Visning' });
  const knap = (navn) => within(gruppe()).getByRole('button', { name: navn });
  const tabelNavne = () => [...tabel().querySelectorAll('tbody tr')]
    .map((tr) => tr.querySelectorAll('td')[1].textContent.replace(/\s*\(dig\)/, '').trim());
  const raekkeFor = (navn) => within(tabel()).getByText(navn).closest('tr');
  const celler = (navn) => [...raekkeFor(navn).querySelectorAll('td')].map((td) => td.textContent.trim());
  const podiePlads = (c, rang) => [...c.querySelectorAll('.podium__spot')]
    .find((sp) => sp.querySelector('.podium__plads')?.textContent === String(rang));
  // Knappen hedder også «Runde 8» — linjen kendes på det, der følger efter tallet.
  const linje = () => screen.getByText(/^Runde 8( alene|:)/).closest('p');

  it('står på Samlet som udgangspunkt, og listen er i Samlet-orden', () => {
    vis({ standings: FELT() });
    expect(knap('Samlet')).toHaveAttribute('aria-pressed', 'true');
    expect(knap('Runde 8')).toHaveAttribute('aria-pressed', 'false');
    expect(tabelNavne()).toEqual(['Dorte', 'Mig', 'Erik']);
    // Og ilden brænder hos Erik — Samlet er uændret.
    expect(foerendeNavne()).toEqual(['Erik']);
  });

  it('findes ikke uden en runde: hverken i Touren eller før nogen har point', () => {
    vis({ standings: raekker({}), game: { id: 'tour', type: 'tour' } });
    expect(screen.queryByRole('group', { name: 'Visning' })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Runde/ })).toBeNull();
  });

  it('«Runde 8» vender stillingen: rundens fører får guldet, totalens fører står nederst med –', () => {
    const { container } = vis({ standings: FELT() });
    fireEvent.click(knap('Runde 8'));
    expect(knap('Runde 8')).toHaveAttribute('aria-pressed', 'true');
    expect(knap('Samlet')).toHaveAttribute('aria-pressed', 'false');

    // Podiet er rundens: Erik (+20) guld, Dorte (+12,3) sølv, Bo (+4) bronze.
    const guld = podiePlads(container, 1);
    expect(guld.querySelector('.podium__name').textContent).toBe('Erik');
    expect(guld.querySelector('.podium__pts').textContent).toBe('+20 p');
    // Det lille tal er placering OG point fra Samlet — kontrasten er pointen.
    expect(guld.textContent).toMatch(/nr\. 6 samlet · 10 p/);
    expect(podiePlads(container, 2).querySelector('.podium__name').textContent).toBe('Dorte');
    expect(podiePlads(container, 3).querySelector('.podium__name').textContent).toBe('Bo');

    // Listen: Mig (+3, nr. 4), Carl (−1, nr. 5), Anne (– , urangeret, nederst).
    expect(tabelNavne()).toEqual(['Mig', 'Carl', 'Anne']);
    expect(celler('Mig')).toEqual(['4', 'Mig (dig)', '+3nr. 5 samlet · 20']);
    expect(celler('Carl')[0]).toBe('5');
    expect(celler('Carl')[2]).toMatch(/^−1nr\. 3 samlet · 40$/);
    // Anne: ingen rang, ingen tal — og stregen siger HVORFOR (samme title som i Samlet).
    expect(celler('Anne')[0]).toBe('–');
    // Begge streger (rang og point) siger hvorfor — samme title som i Samlet.
    const streger = within(raekkeFor('Anne')).getAllByTitle('Ingen afgjorte tips i runden endnu');
    expect(streger.map((e) => e.textContent)).toEqual(['–', '–']);
    expect(celler('Anne')[2]).toBe('–nr. 1 samlet · 60');

    // INGEN pil — der findes ikke noget «før» for en rundestilling — og INGEN ild.
    expect(tabel().textContent).not.toMatch(/[▲▼]/);
    expect(screen.queryAllByLabelText('Flest point i runden')).toHaveLength(0);
    expect(container.textContent).not.toContain('🔥');
  });

  it('«Samlet» bringer én tilbage: Samlet-orden, pil og ild igen', () => {
    const { container } = vis({ standings: FELT() });
    fireEvent.click(knap('Runde 8'));
    expect(tabelNavne()).toEqual(['Mig', 'Carl', 'Anne']);
    fireEvent.click(knap('Samlet'));
    expect(knap('Samlet')).toHaveAttribute('aria-pressed', 'true');
    expect(knap('Runde 8')).toHaveAttribute('aria-pressed', 'false');
    expect(tabelNavne()).toEqual(['Dorte', 'Mig', 'Erik']);
    expect(podiePlads(container, 1).querySelector('.podium__name').textContent).toBe('Anne');
    expect(podiePlads(container, 1).querySelector('.podium__pts').textContent).toBe('60 p');
    expect(foerendeNavne()).toEqual(['Erik']);
    // Det store tal er totalen igen, og rundens point står under den.
    expect(celler('Erik')[2]).toBe('10🔥 +20');
    expect(linje().textContent).toMatch(/^Runde 8: tallet under totalen er rundens point\. 🔥 har flest indtil videre\./);
  });

  it('linjen siger, hvad rækkefølgen følger, at runden ikke er færdig, og hvad – betyder', () => {
    vis({ standings: FELT() });
    fireEvent.click(knap('Runde 8'));
    const t = linje().textContent;
    expect(t).toMatch(/^Runde 8 alene — sorteret efter rundens point\./);
    // Uden kampprogram er runden ikke bevist færdig — så er den foreløbig.
    // Spilfører bad om ORDET foreløbig — det bar ilden før.
    expect(t).toMatch(/Rækkefølgen er foreløbig — runden er ikke færdigspillet\./);
    expect(t).toMatch(/Det lille tal er placering og point i Samlet\./);
    expect(t).toMatch(/Stregen – betyder ingen afgjorte tips i runden endnu\./);
    // Erik fører — så siges det IKKE, at alle har ramt forbi.
    expect(t).not.toMatch(/har ramt forbi indtil videre|Ingen fører runden/);
    // Det, der IKKE må stå i rundevisningen (QC på planen).
    // «færdigspillet» rummer «pil» — derfor ordgrænser på de korte ord.
    expect(t).not.toMatch(/ved siden af|under totalen|🔥|\buge\b|\bpil(en)?\b|samlede total|tidligere|[▲▼]/i);
  });

  it('siger IKKE «ikke færdigspillet», når hver kamp i runden har facit — men gør det, når én mangler', () => {
    const faerdig = [{ round: 8, result: '1' }, { round: 8, result: 'X' }];
    const { unmount } = vis({ standings: FELT(), matches: faerdig });
    fireEvent.click(knap('Runde 8'));
    expect(linje().textContent).not.toMatch(/ikke færdigspillet/);
    unmount();
    vis({ standings: FELT(), matches: [{ round: 8, result: '1' }, { round: 8, result: null }] });
    fireEvent.click(knap('Runde 8'));
    expect(linje().textContent).toMatch(/ikke færdigspillet/);
  });

  it('0 er et tal: den, der ramte alt forbi, står med «0» over en tabt Chance — ikke nederst med –', () => {
    // Serveren skriver nu nøglen med 0 for et afgjort tip (ejerens fund 12/10
    // 2026: nr. 1 samlet stod nederst som «deltog ikke», under −6,4).
    const { container } = vis({ standings: raekker({ u5: { 8: 20 }, u4: { 8: 0 }, u3: { 8: -1 } }) });
    // Samlet: «0» under totalen — ikke «+0» — og ingen ild på et nul.
    expect(within(raekkeFor('Dorte')).getByText('0')).toBeInTheDocument();
    expect(screen.queryByText('+0')).toBeNull();
    expect(foerendeNavne()).toEqual(['Erik']);
    fireEvent.click(knap('Runde 8'));
    // Rundens podie: Erik guld, Dorte SØLV med 0, Carl bronze med −1.
    const soelv = podiePlads(container, 2);
    expect(soelv.querySelector('.podium__name').textContent).toBe('Dorte');
    expect(soelv.querySelector('.podium__pts').textContent).toBe('0 p');
    expect(podiePlads(container, 3).querySelector('.podium__name').textContent).toBe('Carl');
    expect(podiePlads(container, 3).querySelector('.podium__pts').textContent).toBe('−1 p');
    // De tre uden afgjorte tips står nederst med streg — Dorte gør ikke.
    expect(tabelNavne()).toEqual(['Anne', 'Bo', 'Mig']);
    expect(container.textContent).not.toContain('+0');
  });

  // Test Manager: rundeTal() står tre steder, men render-testen ovenfor rører kun
  // to af dem — nullet stod på PODIET, aldrig i LISTEN, så Row's store tal kunne
  // gå tilbage til fmtSignedPoints («+0») med hele render-suiten grøn; kun en
  // kildetekst-test (scripts/stillingsbredde.test.mjs) så det. Og −0 var uprøvet:
  // Firestore-SDK'et gemmer negativt nul som double (serializer.js: isNegativeZero
  // → doubleValue), round1(−0,04) giver netop −0, og fmtSignedPoints(−0) er «+0».
  // Object.is(p, 0) i stedet for p === 0 overlevede derfor hele suiten.
  for (const [navn, nul] of [['0', 0], ['−0 (en sum på −0,04 afrundet af serveren)', -0]]) {
    it(`et nul (${navn}) står som «0», aldrig «+0» — i Samlet, i rundevisningens liste og på podiet`, () => {
      // Listen: fire har et tal, Dorte er nr. 4 med nul og står i LISTEN, ikke på podiet.
      const liste = vis({ standings: raekker({ u1: { 8: 9 }, u2: { 8: 8 }, u3: { 8: 7 }, u4: { 8: nul } }) });
      expect(within(raekkeFor('Dorte')).getByText('0')).toBeInTheDocument(); // Samlet: RundeCelle
      fireEvent.click(knap('Runde 8'));
      expect(celler('Dorte')).toEqual(['4', 'Dorte', '0nr. 4 samlet · 30']); // Row: det store tal
      expect(liste.container.textContent).not.toContain('+0');
      liste.unmount();
      // Podiet: nullet er nr. 2, foran et minus.
      const podie = vis({ standings: raekker({ u5: { 8: 20 }, u4: { 8: nul }, u3: { 8: -1 } }) });
      fireEvent.click(knap('Runde 8'));
      expect(podiePlads(podie.container, 2).querySelector('.podium__pts').textContent).toBe('0 p');
      expect(podie.container.textContent).not.toContain('+0');
    });
  }

  it('en runde, hvor ingen endnu har andet end et nul, er stadig rundens — fredag efter første afgjorte kamp', () => {
    // Runde 9's første kamp er afgjort, og alle ramte forbi: nøglen 9 findes med 0
    // hos begge. Springer sidsteRunde nul-nøgler over (den gamle semantik), hænger
    // fladen på sidste uges runde 8 — og den, der er "i gang", ses ikke. Ingen test
    // havde en runde, hvis EGET højeste tal er 0 (Test Manager: mutationen overlevede).
    vis({ standings: raekker({ u4: { 8: 5, 9: 0 }, me: { 8: 4, 9: 0 } }) });
    expect(screen.getByText(/^Runde 9: tallet under totalen er rundens point\./)).toBeInTheDocument();
    expect(screen.queryByText(/^Runde 8: tallet/)).toBeNull();
    expect(foerendeNavne()).toEqual([]); // nul fører ikke
    fireEvent.click(knap('Runde 9'));
    // Begge har et afgjort tip og står med «0» — over de fire uden tal — men ingen har en rang.
    expect(celler('Dorte')).toEqual(['–', 'Dorte', '0nr. 4 samlet · 30']);
    expect(celler('Mig')).toEqual(['–', 'Mig (dig)', '0nr. 5 samlet · 20']);
    const t = screen.getByText(/^Runde 9 alene/).closest('p').textContent;
    expect(t).toMatch(/Alle med et afgjort tip har ramt forbi indtil videre: ingen er over nul, så ingen har en rang\./);
    expect(t).toMatch(/Stregen – betyder ingen afgjorte tips i runden endnu\./);
  });

  it('«Alle med et afgjort tip har ramt forbi» står IKKE, når ingen har et tal — her: alle vektorer er afvist (klar:false)', () => {
    // Linjens anden betingelse (viste.some(rundePoint != null)) var ubevist: den
    // kunne fjernes med grøn suite, og så påstod linjen, at «alle med et afgjort tip
    // har ramt forbi», mens ingen havde et tal at have ramt forbi med. rundeNr
    // kommer af vektorerne (sidsteRunde læser ikke klar), men rundePoint er null
    // for hver række — den eneste vej til en rundevisning uden et eneste tal.
    const felt = raekker({ u1: { 8: 9 }, u2: { 8: 8 }, u3: { 8: 7 }, u4: { 8: 6 }, me: { 8: 5 }, u5: { 8: 4 } })
      .map((r) => ({ ...r, klar: false }));
    vis({ standings: felt });
    fireEvent.click(knap('Runde 8'));
    expect(linje().textContent).toMatch(/Stregen – betyder ingen afgjorte tips i runden endnu\./); // alle står med –
    expect(linje().textContent).not.toMatch(/ramt forbi|ingen er over nul/);
  });

  it('nævner – kun, når nogen står med den', () => {
    vis({ standings: raekker({ u1: { 8: 9 }, u2: { 8: 8 }, u3: { 8: 7 }, u4: { 8: 6 }, me: { 8: 5 }, u5: { 8: 4 } }) });
    fireEvent.click(knap('Runde 8'));
    expect(linje().textContent).not.toMatch(/– betyder/);
  });

  it('uafgjort i toppen: to guldmedaljer på lige trin', () => {
    const { container } = vis({ standings: raekker({ u5: { 8: 20 }, u4: { 8: 20 }, me: { 8: 4 } }) });
    fireEvent.click(knap('Runde 8'));
    expect(container.querySelector('.podium').className).toMatch(/podium--lige/);
    expect([...container.querySelectorAll('.podium__medal')].filter((m) => m.textContent === '🥇')).toHaveLength(2);
  });

  it('NUL FØRER IKKE: fredag aften med én tabt Chance er der intet podie og ingen «1.» ved et minus', () => {
    const { container } = vis({ standings: raekker({ u3: { 8: -4 } }) });
    fireEvent.click(knap('Runde 8'));
    expect(container.querySelector('.podium')).toBeNull();
    // Carl står først (han har et tal), men uden rang — og rangens streg siger hvorfor.
    expect(tabelNavne()[0]).toBe('Carl');
    expect(celler('Carl')[0]).toBe('–');
    expect(within(raekkeFor('Carl')).getByTitle('Ingen rang — ingen fører runden endnu')).toBeInTheDocument();
    expect(celler('Carl')[2]).toMatch(/^−4/);
    // Dorte har intet tal: begge streger, og titlen er den anden.
    expect(within(raekkeFor('Dorte')).getAllByTitle('Ingen afgjorte tips i runden endnu')).toHaveLength(2);
    expect(linje().textContent).toMatch(/– betyder ingen afgjorte tips i runden endnu/);
    // Og linjen siger selv, hvorfor Carl ingen rang har — en title findes ikke på en telefon.
    expect(linje().textContent).toMatch(/Alle med et afgjort tip har ramt forbi indtil videre: ingen er over nul, så ingen har en rang\./);
    // IKKE «hele feltet» (QC): Dorte står med – og har ikke ramt noget forbi —
    // hun har intet afgjort tip. Sætningen må kun tale om dem, der har et tal.
    expect(linje().textContent).not.toMatch(/[Hh]ele feltet/);
  });

  it('klar:false er urangeret, viser badget og ALDRIG et tal fra den afviste vektor', () => {
    const felt = raekker({ u4: { 8: 5 }, me: { 8: 2 } })
      .map((r) => (r.uid === 'u1' ? { ...r, klar: false, perRound: { 8: 9 } } : r));
    const { container } = vis({ standings: felt });
    fireEvent.click(knap('Runde 8'));
    // Kun to er rangerede → intet podie; alle i listen.
    expect(container.querySelector('.podium')).toBeNull();
    const anne = celler('Anne');
    expect(anne[0]).toBe('–');
    expect(anne[2]).toMatch(/^–/);
    expect(anne[2]).toMatch(/ikke klar/);
    expect(anne[2]).not.toMatch(/\+9|nr\. 1 samlet/);
    // Stregerne lover ikke «ingen afgjorte tips» — hun kan have et tal, som er afvist.
    // QC: regexen bar den gamle titel («Ingen point i runden») og matchede
    // ingenting — vagten var død, og klar:false-grenen i IngenRundePoint kunne
    // fjernes med grøn suite. Den følger nu den titel, der faktisk findes.
    expect(within(raekkeFor('Anne')).queryByTitle(/Ingen afgjorte tips|Ingen rang/)).toBeNull();
  });

  it('klar:false fører heller ikke i Samlet — ilden følger samme regel som rangen', () => {
    // Som ligaRanking leverer det: klar:false OG rank null (ingen podieplads).
    const felt = raekker({ u4: { 8: 5 }, me: { 8: 2 } })
      .map((r) => (r.uid === 'u1' ? { ...r, klar: false, rank: null, perRound: { 8: 99 } } : r));
    vis({ standings: felt });
    expect(foerendeNavne()).toEqual(['Dorte']);
    const anne = celler('Anne');
    expect(anne[2]).toMatch(/ikke klar/);
    expect(anne[2]).toMatch(/–$/);
    expect(anne[2]).not.toMatch(/99/);
  });

  it('regnskabet og rundevisningen udelukker hinanden — og vælgeren bliver stående', () => {
    vis({ standings: FELT() });
    fireEvent.click(knap('Runde 8'));
    fireEvent.click(screen.getByRole('button', { name: '🧮 Hvor kommer pointene fra?' }));
    // Regnskabet er spillets totaler → podiet over det er Samlet.
    expect(knap('Samlet')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '← Tilbage til listen' })).toBeInTheDocument();
    // Og den anden vej: «Runde 8» lukker regnskabet.
    fireEvent.click(knap('Runde 8'));
    expect(knap('Runde 8')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '🧮 Hvor kommer pointene fra?' })).toBeInTheDocument();
    expect(tabelNavne()).toEqual(['Mig', 'Carl', 'Anne']);
  });

  it('et ligaskift til en liga uden runden lader vælgeren forsvinde — og valget huskes, til runden er der igen', () => {
    // Vektorerne stemmer med totalerne, så ligaen "Senere" (fra runde 12)
    // kan regnes: dér er runde 8 FØR ligaens start, så der er ingen runde.
    const felt = [
      { uid: 'u1', name: 'Anne', totalPoints: 60, rank: 1, bonusPoints: 0, perRound: { 8: 60 } },
      { uid: 'me', name: 'Mig', totalPoints: 20, rank: 2, bonusPoints: 0, perRound: { 8: 20 } },
      { uid: 'u5', name: 'Erik', totalPoints: 10, rank: 3, bonusPoints: 0, perRound: { 8: 10 } },
    ];
    const ligaer = [
      { id: 'L1', name: 'Alle', memberUids: ['me', 'u1', 'u5'] },
      { id: 'L2', name: 'Senere', memberUids: ['me', 'u1'], startRound: 12 },
    ];
    vis({ standings: felt, leagues: ligaer });
    fireEvent.click(knap('Runde 8'));
    expect(knap('Runde 8')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.change(screen.getByLabelText('Vis stilling for'), { target: { value: 'L2' } });
    expect(screen.queryByRole('group', { name: 'Visning' })).toBeNull();
    // Visningen er Samlet: ingen streg for «ingen afgjorte tips i runden».
    expect(screen.queryByTitle('Ingen afgjorte tips i runden endnu')).toBeNull();
    fireEvent.change(screen.getByLabelText('Vis stilling for'), { target: { value: 'L1' } });
    expect(knap('Runde 8')).toHaveAttribute('aria-pressed', 'true');
    // Tre spillere → alle på podiet, ingen tabel — men podiet er rundens igen.
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText('+60 p')).toBeInTheDocument();
  });

  // ---- Test Manager: fire huller i vælgeren, fundet ved mutation af GameStandings.jsx ----
  // Hver test nedenfor er rød uden den linje, den binder (se kommentaren pr. test).
  // Mutationerne, de dræber: Samlet-knappens onClick tom · Pokaler rows={viste} ·
  // meRow = raekker.find · rundeFaerdig = «nogen runde er færdig».

  it('«Samlet» bringer dig tilbage: Samlet-orden, ilden og Samlet-linjen er tilbage — og «Runde 8» virker igen bagefter', () => {
    // Binder Samlet-knappens egen onClick. Ingen af de andre tests trykker på
    // den (de læser kun dens aria-pressed), så den kunne gøres til en tom
    // funktion med hele suiten grøn — og knappen i guiden, «Samlet bringer dig
    // tilbage», ville være en løgn. Fladevagten tæller kun klik, og har samme
    // fund: ét urørt element.
    const { container } = vis({ standings: FELT() });
    fireEvent.click(knap('Runde 8'));
    expect(tabelNavne()).toEqual(['Mig', 'Carl', 'Anne']); // rundevisningen ER vist, før vi trykker
    fireEvent.click(knap('Samlet'));

    expect(knap('Samlet')).toHaveAttribute('aria-pressed', 'true');
    expect(knap('Runde 8')).toHaveAttribute('aria-pressed', 'false');
    expect(tabelNavne()).toEqual(['Dorte', 'Mig', 'Erik']);
    const guld = podiePlads(container, 1);
    expect(guld.querySelector('.podium__name').textContent).toBe('Anne');
    expect(guld.querySelector('.podium__pts').textContent).toBe('60 p');
    // Ilden og Samlet-linjen er tilbage; intet af rundevisningens «nr. N samlet».
    expect(foerendeNavne()).toEqual(['Erik']);
    // (linje() finder kun rundevisningens «Runde 8 alene» — Samlet-linjen har
    // kolon lige efter tallet, så den slås op på sin egen tekst.)
    expect(screen.getByText(/^Runde 8: tallet under totalen er rundens point\./)).toBeInTheDocument();
    expect(screen.queryByText(/^Runde 8 alene/)).toBeNull();
    expect(container.textContent).not.toMatch(/nr\. \d+ samlet/);

    fireEvent.click(knap('Runde 8'));
    expect(tabelNavne()).toEqual(['Mig', 'Carl', 'Anne']);
  });

  it('pokalerne står fast, når man trykker på knappen — Rundekongens navne og Chance-kongens «Bedst:» skifter ikke', () => {
    // Binder `<Pokaler rows={raekker}>` (og ikke `viste`). Mig (Samlet nr. 5) og
    // Erik (nr. 6) er LIGE i alt, pokalerne måler: lige mange point i runde 8
    // (de deler rundesejren) og samme Chance-saldo. Pokalerne tager rækkernes
    // orden, når to er lige: Samlet-orden giver Mig, Erik. Rundevisningen
    // sorterer lige point alfabetisk — Erik, Mig. Fik Pokaler den omsorterede
    // liste, skiftede «Bedst: Mig» til «Bedst: Erik» og «Mig, Erik (delt)» til
    // «Erik, Mig (delt)» ved et tryk på en knap, der ikke handler om pokalerne.
    const felt = raekker({ u5: { 8: 20 }, me: { 8: 20 }, u4: { 8: 4 } })
      .map((r) => (r.uid === 'me' || r.uid === 'u5' ? { ...r, opdeling: { chance: 5 } } : r));
    const { container } = vis({ standings: felt, matches: [{ round: 8, result: '1' }] });
    const kort = (titel) => screen.getByText(new RegExp(titel)).closest('.card').textContent;
    const podieNavne = () => [...container.querySelectorAll('.podium__name')].map((n) => n.textContent);

    expect(kort('Rundekongen')).toMatch(/Mig, Erik.*1 rundesejr.*\(delt\)/);
    expect(kort('Chance-kongen')).toMatch(/Bedst: Mig/);
    const foer = [kort('Rundekongen'), kort('Chance-kongen')];
    // Samlet: podiet er Samlet-podiet — i visuel orden 2 · 1 · 3 (vinderen i midten).
    expect(podieNavne()).toEqual(['Bo', 'Anne', 'Carl']);

    fireEvent.click(knap('Runde 8'));
    // Beviser at rundevisningen faktisk er vist (ellers er sammenligningen
    // tom): lige point sorteres alfabetisk, så Erik står FØR Mig.
    expect(podieNavne()).toEqual(['Erik', 'Mig', 'Dorte']);
    expect(tabelNavne()).toEqual(['Anne', 'Bo', 'Carl']);
    expect(kort('Rundekongen')).toBe(foer[0]);
    expect(kort('Chance-kongen')).toBe(foer[1]);

    fireEvent.click(knap('Samlet'));
    expect(kort('Rundekongen')).toBe(foer[0]);
    expect(kort('Chance-kongen')).toBe(foer[1]);
  });

  it('tager jeg selv runden, men er nr. 5 samlet, står jeg på podiet — og ikke også nederst i listen', () => {
    // Binder `meRow = viste.find(…)` (og ikke raekker.find). Med Samlet-rækken
    // er meRow.rank 5 (> 3), mens jeg ikke står i listen (jeg er på podiet) —
    // og så tegnes min række én gang til som klæbende bundlinje, med «nr.
    // undefined samlet». Det er netop den situation, knappen findes til: jeg
    // er langt nede samlet, men vandt ugen.
    const { container } = vis({ standings: raekker({ me: { 8: 30 }, u5: { 8: 20 }, u4: { 8: 12.3 }, u2: { 8: 4 } }) });
    fireEvent.click(knap('Runde 8'));
    expect(podiePlads(container, 1).querySelector('.podium__name').textContent).toBe('Mig');
    expect(tabelNavne()).toEqual(['Bo', 'Anne', 'Carl']);
    expect(container.querySelectorAll('.rank-row--me')).toHaveLength(0);
    expect(screen.getAllByText('Mig')).toHaveLength(1);
  });

  it('«ikke færdigspillet» gælder DEN runde — en tidligere færdig runde gør ikke runde 8 færdig', () => {
    // I produktion er alle tidligere runder færdige, mens den igangværende ikke
    // er. Testen ovenfor har kun runde 8-kampe og kan derfor ikke se, om
    // betingelsen spørger «er DENNE runde færdig» eller «er NOGEN runde
    // færdig» (rundeFaerdig = faerdigeRunder(matches).length > 0).
    const kampe = [
      { round: 7, result: '1' }, { round: 7, result: '2' },
      { round: 8, result: '1' }, { round: 8, result: null },
    ];
    vis({ standings: FELT(), matches: kampe });
    fireEvent.click(knap('Runde 8'));
    expect(linje().textContent).toMatch(/ikke færdigspillet/);
  });
});

// ---------------------------------------------------------------------------
// «IKKE KLAR» I SAMLET (Test Manager). Badget blev flyttet ud i komponenten
// IkkeKlar, så det kan stå begge steder: som hovedtal i Samlet og som det lille
// tal i rundevisningen. Rundevisningens brug er testet ovenfor; Samlets brug
// blev ikke rørt af nogen render-test, hverken før eller efter. Erstattes den
// med `formatPoints(r.totalPoints)`, er hele suiten grøn — og så står en spiller
// uden stemmende vektor med «0» (det tal ligaRanking giver hende), præcis den
// løgn, badget findes for.
// ---------------------------------------------------------------------------
describe('«ikke klar» i Samlet — badget, aldrig et nul', () => {
  it('en klar:false-række viser badget med forklaringen, rangen er – og totalen er ikke 0', () => {
    // Som ligaRanking leverer rækken: klar:false, rank:null, totalPoints:0.
    const felt = raekker({ u4: { 8: 5 }, me: { 8: 2 } })
      .map((r) => (r.uid === 'u3' ? { ...r, klar: false, rank: null, totalPoints: 0 } : r));
    vis({ standings: felt });
    const carl = within(tabel()).getByText('Carl').closest('tr');
    const celler = [...carl.querySelectorAll('td')].map((td) => td.textContent.trim());
    expect(celler[0]).toBe('–');
    const badge = within(carl).getByText('ikke klar');
    expect(badge).toHaveClass('badge', 'badge--muted');
    // Forklaringen siger, hvad man kan GØRE ved det — den findes ikke på en telefon som andet end title.
    expect(badge).toHaveAttribute('title', expect.stringMatching(/ikke beregnet endnu.*Genberegn point/));
    expect(celler[2]).toMatch(/^ikke klar/);
    expect(celler[2]).not.toMatch(/^0/);
  });
});
