// 📊 Grupper — fladen mod den FORMATTRO fixture (src/test/hvm2027Grupper.js:
// programmets grupper, hovedrundens parringer som på siden, I og III på dag
// 8, II og IV på dag 9).
//
// Assertér på INDHOLD (CLAUDE.md): overskrifterne ordret, pointcellen,
// stregens plads, ventekortets tekst ordret — og det, der ALDRIG må stå:
// ordet for semifinalist-tippet, «Officiel» og «ude» om nr. 4.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

vi.mock('../../../firebase', () => ({ db: {} }));
vi.mock('../../../context/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'A' } }) }));
// Eget pulje-tip (useEgetPuljeBet): `mockBet.current` er dokumentet, null = intet.
const mockBet = { current: null };
const mockLyttere = vi.fn();
vi.mock('firebase/firestore', () => ({
  doc: (...a) => ({ sti: a.slice(1).join('/') }),
  onSnapshot: (ref, cb) => {
    mockLyttere(ref.sti);
    cb({ exists: () => mockBet.current != null, data: () => mockBet.current });
    return () => {};
  },
}));

import Grupper, { DELT_NOTE, stregEfter } from './Grupper';
import {
  HVM27G, INDLEDENDE, medFacit, hovedrundeKampe, GRUPPE_A_KNAEK, A_KNAEK_ORDEN, eloOrden,
} from '../../../test/hvm2027Grupper';

const vis = (matches, game = HVM27G) => render(
  <MemoryRouter initialEntries={['/spil/hvm2027?fane=grupper']}>
    <Routes><Route path="/spil/:gameId" element={<Grupper game={game} matches={matches} />} /></Routes>
  </MemoryRouter>,
);

const kort = (navn) => screen.getByTestId(`gruppe-${navn}`);
const raekker = (navn) => [...kort(navn).querySelectorAll('tbody tr')];
const navnI = (tr) => tr.querySelector('.sltab__name').textContent;
const celler = (tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent);
const overskrifter = (fase) => within(screen.getByTestId(fase)).queryAllByRole('heading', { level: 3 })
  .map((h) => h.textContent).filter((t) => t.startsWith('Gruppe'));

// Dag 8 (I og III) — A efter knækket: Tyskland, Serbien, Tunesien går videre.
const A_VIDERE = { A: A_KNAEK_ORDEN.slice(0, 3) };
const IND_KNAEK = medFacit(INDLEDENDE, GRUPPE_A_KNAEK);

beforeEach(() => { mockBet.current = null; mockLyttere.mockClear(); });

describe('📊 Grupper — den indledende runde', () => {
  it('før start: otte tabeller Gruppe A…H, ingen placeringstal, ingen streg, ingen hovedrunde', () => {
    vis(INDLEDENDE);
    expect(overskrifter('gruppefase-1')).toEqual(['Gruppe A', 'Gruppe B', 'Gruppe C', 'Gruppe D', 'Gruppe E', 'Gruppe F', 'Gruppe G', 'Gruppe H']);
    for (const g of 'ABCDEFGH') {
      const rs = raekker(g);
      expect(rs, g).toHaveLength(4);
      for (const tr of rs) expect(tr.querySelector('.sltab__rank').textContent, g).toBe('');
    }
    expect(document.querySelectorAll('.grupper__streg')).toHaveLength(0);
    // Programrækkefølgen (holdenes første optræden), ikke alfabetet.
    expect(raekker('A').map(navnI)).toEqual(['Serbien', 'Uruguay', 'Tyskland', 'Tunesien']);
    expect(screen.queryByTestId('gruppefase-2')).toBeNull();
    // Reglen står — tallet fra `videre`, fasen fra kalenderen.
    expect(screen.getByTestId('gruppefase-1').textContent).toContain('De 3 øverste går videre til hovedrunden.');
  });

  it('med facit: stillingen, 2 point for en sejr og stregen efter nr. 3', () => {
    vis(IND_KNAEK);
    const rs = raekker('A');
    expect(rs.map(navnI)).toEqual(A_KNAEK_ORDEN);
    // Tyskland: 2 sejre og 1 nederlag = 4 point (ikke fodboldens 6), K 3, mål 89-82.
    expect(celler(rs[0])).toEqual(['1', expect.stringContaining('Tyskland'), '3', '2', '0', '1', '89-82', '+7', '4']);
    expect(celler(rs[3]).at(-1)).toBe('2'); // Uruguay: én sejr = 2
    expect(rs.map((tr) => tr.classList.contains('grupper__streg'))).toEqual([false, false, true, false]);
    // Holdsiden af kortkoden.
    expect(within(rs[0]).getByRole('link', { name: 'Tyskland' })).toHaveAttribute('href', '/spil/hvm2027?fane=elo&hold=GER');
    // Ingen markering af «videre» før hovedrunden er lagt ind.
    expect(screen.queryAllByTestId('gik-videre')).toHaveLength(0);
  });

  it('delt plads: samme tal, noten ordret — og ingen streg gennem den delte blok', () => {
    // Alle seks kampe i gruppe A uafgjort 25-25: alle står helt lige.
    const lige = Object.fromEntries(INDLEDENDE.filter((m) => m.gruppe === 'A').map((m) => [`${m.home}–${m.away}`, [25, 25]]));
    vis(medFacit(INDLEDENDE, lige));
    const rs = raekker('A');
    expect(rs.map((tr) => tr.querySelector('.sltab__rank').textContent)).toEqual(['1', '1', '1', '1']);
    expect(rs.map(navnI)).toEqual(['Serbien', 'Uruguay', 'Tyskland', 'Tunesien']); // programrækkefølge
    expect(within(kort('A')).getByTestId('delt-note').textContent).toBe(DELT_NOTE);
    expect(DELT_NOTE).toBe('Hold med samme placering står lige på point, indbyrdes kampe og målforskel.');
    expect(kort('A').textContent).not.toMatch(/alle IHF/i);
    expect(kort('A').querySelectorAll('.grupper__streg')).toHaveLength(0);
    // B er ikke delt: ingen note dér.
    expect(within(kort('B')).queryByTestId('delt-note')).toBeNull();
  });
});

describe('📊 Grupper — hovedrunden', () => {
  it('dag 8 lagt ind: I og III klar, II og IV venter med teksten ordret og uden tabel', () => {
    vis([...IND_KNAEK, ...hovedrundeKampe(A_VIDERE, { runder: [8] })]);
    const fase2 = screen.getByTestId('gruppefase-2');
    expect(kort('I').dataset.status).toBe('klar');
    expect(kort('III').dataset.status).toBe('klar');
    expect(kort('II').textContent).toBe('Gruppe II · de tre bedste fra gruppe C og D');
    expect(kort('IV').textContent).toBe('Gruppe IV · de tre bedste fra gruppe G og H');
    expect(kort('II').querySelector('table')).toBeNull();
    // Hovedrunden står OVER den indledende.
    expect(fase2.compareDocumentPosition(screen.getByTestId('gruppefase-1')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Q2: startdatoen ÉN gang, ikke pr. gruppe.
    expect(fase2.textContent.split('onsdag 20. januar').length - 1).toBe(1);
    expect(fase2.textContent).toContain('Hovedrunden spilles fra onsdag 20. januar.');
    expect(fase2.textContent).toContain('De 2 øverste går videre til kvartfinalerne.');
    expect(fase2.textContent).toContain('Resultaterne fra den indledende runde mod de to andre hold fra samme gruppe, der også gik videre, tæller med.');
  });

  it('klar gruppe I: seks hold, K = 2 for alle (de medførte kampe), og nr. 4 fra A står ikke', () => {
    vis([...IND_KNAEK, ...hovedrundeKampe(A_VIDERE, { runder: [8] })]);
    const rs = raekker('I');
    expect(rs).toHaveLength(6);
    expect(rs.map(navnI)).not.toContain('Uruguay');
    for (const tr of rs) expect(celler(tr)[2], navnI(tr)).toBe('2');
    // Tyskland slog Serbien og Tunesien (begge med) — 4 point; tabet til
    // Uruguay følger IKKE med (4 og ikke 4+0 med en kamp mere).
    const ger = rs.find((tr) => navnI(tr) === 'Tyskland');
    expect(celler(ger).slice(2)).toEqual(['2', '2', '0', '0', '62-54', '+8', '4']);
    // Stregen efter nr. 2.
    expect(rs.map((tr) => tr.classList.contains('grupper__streg'))).toEqual([false, true, false, false, false, false]);
  });

  it('kun 4 af 6 hold lagt ind: gruppen venter stadig', () => {
    const dag8 = hovedrundeKampe(A_VIDERE, { runder: [8] }).filter((m) => m.id.startsWith('r8-I-'));
    vis([...IND_KNAEK, ...dag8.slice(0, 2)]); // to kampe = fire hold
    expect(kort('I').dataset.status).toBe('venter');
    expect(kort('I').textContent).toBe('Gruppe I · de tre bedste fra gruppe A og B');
  });

  it('Q1: ✓ ved de hold, der FAKTISK er lagt ind — og ingen streg, hvor stillingen er uenig', () => {
    // Stillingen siger Tunesien som nr. 3 i A, men Uruguay er lagt ind.
    vis([...IND_KNAEK, ...hovedrundeKampe({ A: ['Tyskland', 'Serbien', 'Uruguay'] }, { runder: [8] })]);
    const a = raekker('A');
    expect(a.map((tr) => [navnI(tr), tr.dataset.videre === 'true'])).toEqual([
      ['Tyskland', true], ['Serbien', true], ['Tunesien', false], ['Uruguay', true],
    ]);
    expect(kort('A').querySelectorAll('.grupper__streg')).toHaveLength(0);
    // B er enig med stillingen: streg efter nr. 3 og ✓ på de tre øverste.
    const b = raekker('B');
    expect(b.map((tr) => tr.dataset.videre === 'true')).toEqual([true, true, true, false]);
    expect(b.map((tr) => tr.classList.contains('grupper__streg'))).toEqual([false, false, true, false]);
    expect(b.map(navnI).slice(0, 3)).toEqual(eloOrden('B').slice(0, 3));
    // C er IKKE kendt (gruppe II venter): ingen ✓ dér.
    expect(within(kort('C')).queryAllByTestId('gik-videre')).toHaveLength(0);
    expect(screen.getByTestId('gruppefase-1').textContent).toContain('✓ står ved de hold, der er lagt ind i hovedrunden.');
  });
});

describe('📊 Grupper — ✓-mærket (TM)', () => {
  // Før TM assertérede Q1-testen kun data-videre-attributten: ✓-spanen selv kunne fjernes.
  it('✓ står som element ved præcis de indlagte hold — og forklaringen er først der, når nogen er lagt ind', () => {
    vis(IND_KNAEK);
    expect(screen.queryAllByTestId('gik-videre')).toHaveLength(0);
    expect(screen.getByTestId('gruppefase-1').textContent).not.toContain('✓');
    cleanup();
    vis([...IND_KNAEK, ...hovedrundeKampe({ A: ['Tyskland', 'Serbien', 'Uruguay'] }, { runder: [8] })]);
    const a = within(kort('A')).getAllByTestId('gik-videre');
    expect(a.map((e) => navnI(e.closest('tr')))).toEqual(['Tyskland', 'Serbien', 'Uruguay']);
    expect(a[0]).toHaveTextContent('✓');
    expect(a[0]).toHaveAccessibleName('gik videre');
    expect(within(kort('B')).getAllByTestId('gik-videre')).toHaveLength(3);
    expect(within(kort('H')).queryAllByTestId('gik-videre')).toHaveLength(0);
  });

  it('«tæller med»-sætningen står kun, når en hovedrundegruppe er klar', () => {
    // To kampe i gruppe I: gruppen har hold (så fase 2 vises), men venter.
    const dag8 = hovedrundeKampe(A_VIDERE, { runder: [8] }).filter((m) => m.id.startsWith('r8-I-'));
    vis([...IND_KNAEK, ...dag8.slice(0, 2)]);
    const fase2 = screen.getByTestId('gruppefase-2');
    expect(kort('I').dataset.status).toBe('venter');
    expect(fase2.textContent).toContain('Hovedrunden spilles fra');
    expect(fase2.textContent).not.toContain('tæller med');
  });
});

describe('📊 Grupper — 🎖️ ved spillerens egne semifinaletip', () => {
  const egne = () => screen.queryAllByTestId('egen-semifinalist').map((e) => navnI(e.closest('tr')));

  it('står ved præcis de valgte hold og ingen andre', () => {
    mockBet.current = { championship: ['Danmark', 'Tyskland', 'Frankrig', 'Norge'] };
    vis(INDLEDENDE);
    expect(egne().sort()).toEqual(['Danmark', 'Frankrig', 'Norge', 'Tyskland']);
    expect(within(kort('A')).getAllByTestId('egen-semifinalist')).toHaveLength(1);
    expect(navnI(within(kort('A')).getByTestId('egen-semifinalist').closest('tr'))).toBe('Tyskland');
    expect(mockLyttere).toHaveBeenCalledWith('games/hvm2027/puljeBets/A');
  });

  it('uden tip: intet mærke og ingen forklaring', () => {
    vis(INDLEDENDE);
    expect(egne()).toEqual([]);
    expect(document.body.textContent).not.toContain('🎖️');
  });

  it('et spil uden pulje lytter slet ikke', () => {
    const udenPulje = { ...HVM27G, pulje: undefined };
    vis(INDLEDENDE, udenPulje);
    expect(mockLyttere).not.toHaveBeenCalled();
  });
});

describe('📊 Grupper — ordene', () => {
  it('aldrig pulje, aldrig Officiel, aldrig «ude» — i hver tilstand', () => {
    mockBet.current = { championship: ['Danmark', 'Tyskland', 'Frankrig', 'Norge'] };
    for (const kampe of [INDLEDENDE, IND_KNAEK, [...IND_KNAEK, ...hovedrundeKampe({ A: ['Tyskland', 'Serbien', 'Uruguay'] }, { runder: [8, 9] })]]) {
      const { container, unmount } = vis(kampe);
      expect(container.textContent).not.toMatch(/pulje/i);
      expect(container.textContent).not.toMatch(/officiel/i);
      expect(container.textContent).not.toMatch(/\bude\b/i);
      // Pointsystemet står på fladen (Q13).
      expect(container.textContent).toContain('2 point for en sejr, 1 for uafgjort');
      unmount();
    }
  });
});

describe('stregEfter', () => {
  const r = (navne, ranks) => navne.map((teamName, i) => ({ teamName, rank: ranks[i] }));
  it('efter nr. videre — men ikke uden placeringer, og ikke gennem en delt plads', () => {
    expect(stregEfter(r(['a', 'b', 'c', 'd'], [1, 2, 3, 4]), 3, null)).toBe(3);
    expect(stregEfter(r(['a', 'b', 'c', 'd'], [null, null, null, null]), 3, null)).toBeNull();
    expect(stregEfter(r(['a', 'b', 'c', 'd'], [1, 2, 3, 3]), 3, null)).toBeNull();
    expect(stregEfter(r(['a', 'b', 'c', 'd'], [1, 1, 3, 4]), 3, null)).toBe(3);
  });
  it('med kendte videre-hold: kun når de er de øverste', () => {
    expect(stregEfter(r(['a', 'b', 'c', 'd'], [1, 2, 3, 4]), 3, ['c', 'a', 'b'])).toBe(3);
    expect(stregEfter(r(['a', 'b', 'c', 'd'], [1, 2, 3, 4]), 3, ['a', 'b', 'd'])).toBeNull();
    // Delt hen over stregen, men IHF har afgjort det: stregen følger de indlagte.
    expect(stregEfter(r(['a', 'b', 'c', 'd'], [1, 2, 3, 3]), 3, ['a', 'b', 'c'])).toBe(3);
  });
});
