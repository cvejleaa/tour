/**
 * Indgangene til holdsiden — ÉN test pr. flade, der skal bære et link.
 *
 * Findes, fordi et link er den slags, der forsvinder tavst: fjerner nogen
 * `GameTabLink` fra Elo-tabellen under en oprydning, er der intet, der bliver
 * rødt, og holdsiden bliver uopnåelig fra den flade uden at nogen opdager det.
 * Reglen om, at en evne skal følges hele vejen ud i fladen, gælder også vejen
 * DERHEN — ikke kun siden selv.
 *
 * Listen er dispositioneret, ikke fundet: pulje-tippet og det indbyrdes opgør
 * har bevidst INGEN link (man er midt i et valg, henholdsvis det handler om
 * spillere), og de står her som fraværs-assertions, så et link ikke sniger sig
 * ind uden en beslutning.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import EloTable from './EloTable';
import FootballTable from './FootballTable';
import TroejeOversigt from './TroejeOversigt';

const TEAMS = [
  { name: 'FC København', short: 'FCK', color: '#ffffff', elo: 1600 },
  { name: 'Brøndby IF', short: 'BIF', color: '#ffff00', elo: 1500 },
];

function vis(ui) {
  return render(
    <MemoryRouter initialEntries={['/spil/sl']}>
      <Routes><Route path="/spil/:gameId" element={ui} /></Routes>
    </MemoryRouter>,
  );
}

/** Peger linket på Elo-fanen med den rigtige kortkode? */
function forventLink(navn, kode) {
  const a = screen.getByRole('link', { name: new RegExp(navn) });
  expect(a).toHaveAttribute('href', `/spil/sl?fane=elo&hold=${kode}`);
}

describe('indgange til holdsiden', () => {
  it('Elo-tabellen linker holdnavnet', () => {
    vis(<EloTable game={{ id: 'sl', teams: TEAMS, eloHistory: [] }} />);
    forventLink('FC København', 'FCK');
    forventLink('Brøndby IF', 'BIF');
  });

  it('Tabel-fanen linker holdnavnet med HOLDLISTENS kortkode', () => {
    // Kortkoden skal komme fra spillets holdliste, ikke fra API'ets
    // teamShortName — URL'en skal matche spillets egen nøgle, og de to kan
    // afvige. Her siger API'et noget andet end holdlisten.
    const standings = [{
      rank: 1, teamName: 'FC København', teamShortName: 'FCK-API',
      points: 10, played: 4, won: 3, draw: 1, lost: 0, gf: 8, ga: 2,
    }];
    vis(<FootballTable game={{ id: 'sl', teams: TEAMS, standings }} />);
    forventLink('FC København', 'FCK');
  });

  it('Trøjeoversigten linker holdnavnet — appens eneste hold-indeks', () => {
    vis(<TroejeOversigt game={{ id: 'sl', type: 'football', teams: TEAMS }} />);
    forventLink('FC København', 'FCK');
    forventLink('Brøndby IF', 'BIF');
  });

  it('et hold UDEN kortkode får ingen link — aldrig en URL af et holdnavn', () => {
    // shortOf falder tilbage på det fulde navn, og et navn med mellemrum er
    // ingen URL-nøgle. Uden kortkode skal navnet blive ren tekst.
    // Navnet her er med vilje neutralt: medVisningsnavn forkorter kendte
    // klubnavne, og så ville testen måle forkortelsen frem for linket.
    const udenKode = [{ name: 'Holdet Uden Kortkode', color: '#0000ff', elo: 1500 }];
    vis(<EloTable game={{ id: 'sl', teams: udenKode, eloHistory: [] }} />);
    expect(screen.getByText('Holdet Uden Kortkode')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Kortkode/ })).not.toBeInTheDocument();
  });
});
