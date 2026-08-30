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

function vis({ standings, leagues = [], game = FODBOLD }) {
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
        <Route path="/spil/:gameId" element={<GameStandings gameId="sl" game={game} />} />
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
    expect(screen.getByText(/Runde 8: tallet ved siden af totalen er rundens point/)).toBeInTheDocument();
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
    expect(screen.getByText(/Runde 8/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Flest point i runden')).toBeNull();
    // Forklaringslinjen om kronen må heller ikke stå, når ingen bærer den.
    expect(screen.queryByText(/har flest indtil videre/)).toBeNull();
  });

  it('en spiller uden point i runden viser – og siger HVORFOR', () => {
    // Stregen betyder "ingen point i runden endnu", IKKE "deltog ikke": de to
    // kan ikke skelnes, fordi serveren springer nul-værdier over.
    vis({ standings: raekker({ u4: { 8: 5 } }) });
    const mig = within(tabel()).getByText('Mig').closest('tr');
    const streg = within(mig).getByText('–');
    expect(streg).toHaveAttribute('title', 'Ingen point i runden endnu');
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
    expect(screen.getByText(/Runde 8: tallet ved siden af totalen er rundens point/))
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
    const rows = raekker({
      u1: { 21: 2 }, u2: { 21: 3 }, u4: { 21: 6 }, me: { 21: 1 }, u5: { 21: 99 },
    });
    vis({ standings: rows, leagues: [LIGA, LIGA2] });
    expect(foerendeNavne()).toEqual(['Erik']);
    vaelgLiga();
    expect(screen.queryByText('Erik')).toBeNull();
    expect(foerendeNavne()).toEqual(['Dorte']);
  });
});
