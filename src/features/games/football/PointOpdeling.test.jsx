import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PointOpdeling, { RUBRIKKER, opdelingsAfvigelse } from './PointOpdeling';

const FULD = { p1x2: 12.4, chance: 3.1, combi: 6, pulje: 8 };

describe('PointOpdeling', () => {
  it('viser alle fire kilder plus totalen', () => {
    render(<PointOpdeling opdeling={FULD} total={29.5} />);
    expect(screen.getByText('12,4')).toBeInTheDocument();
    expect(screen.getByText('+3,1')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('29,5')).toBeInTheDocument();
  });

  // Rækkefølgen er den samme på kortet og i stillingens tabel, fordi begge
  // bygger på RUBRIKKER. Byttes to om, skifter begge flader — og en spiller,
  // der har lært, hvor Chancen står, skal lede igen.
  it('holder rækkefølgen fast: tippoint, Chancen, Combi, pulje', () => {
    expect(RUBRIKKER.map((r) => r.key)).toEqual(['p1x2', 'chance', 'combi', 'pulje']);
  });

  // Chancen er den ENESTE rubrik, der kan være negativ. Uden fortegn ser et
  // tab ud som en gevinst, og et minus tegnet som bindestreg forsvinder i en
  // talkolonne.
  it('viser Chancen med fortegn — også når den er negativ', () => {
    render(<PointOpdeling opdeling={{ ...FULD, chance: -4.5 }} total={21.9} />);
    expect(screen.getByText('−4,5')).toBeInTheDocument();
  });

  // Navnene er dem, spillet og hjælpesiden allerede bruger. Et nyt ord for en
  // mekanik, brugeren har lært, er ren forvirring — derfor ikke
  // "betting-bonus" og ikke "5/6 rigtige".
  it('bruger spillets egne ord', () => {
    render(<PointOpdeling opdeling={FULD} total={29.5} />);
    expect(screen.getByText(/Chancen/)).toBeInTheDocument();
    expect(screen.getByText(/Combi/)).toBeInTheDocument();
    expect(screen.queryByText(/betting/i)).toBeNull();
    expect(screen.queryByText(/5\/6/)).toBeNull();
  });

  // ⚡ er Chancen overalt i appen. Får Combi det samme ikon, betyder tegnet to
  // ting på samme skærm.
  it('giver ikke Combi samme ikon som Chancen', () => {
    const chance = RUBRIKKER.find((r) => r.key === 'chance');
    const combi = RUBRIKKER.find((r) => r.key === 'combi');
    expect(chance.ikon).toBe('⚡');
    expect(combi.ikon).not.toBe(chance.ikon);
  });

  // Serveren skriver opdelingen ved næste genberegning. Fire nuller ville
  // påstå, at spilleren ingen point har fået — det er en anden ting end
  // "tallet er ikke klar".
  it('siger til, når opdelingen ikke findes endnu — i stedet for at vise nuller', () => {
    render(<PointOpdeling opdeling={null} total={42} />);
    expect(screen.getByText(/ikke klar endnu/)).toBeInTheDocument();
    expect(screen.queryByText('0')).toBeNull();
  });

  // Rubrikkerne kan mangle; totalen kan ikke. Uden den ville "point i alt"
  // forsvinde fra Mine tips, indtil serveren nåede rundt til spilleren.
  it('viser totalen, også når rubrikkerne mangler', () => {
    render(<PointOpdeling opdeling={null} total={42} />);
    expect(screen.getByText('42')).toBeInTheDocument();
  });

  // Gulvet er en feature (saldoen går aldrig i minus), men det gør, at
  // rubrikkerne kan summe til noget helt andet end totalen. Uden forklaringen
  // ser regnestykket forkert ud.
  it('forklarer gulvet, når delene summer under nul', () => {
    render(<PointOpdeling opdeling={{ p1x2: 11, chance: -44.8, combi: 0, pulje: 8.5 }} total={0} />);
    expect(screen.getByText(/kan ikke gå i minus/)).toBeInTheDocument();
    expect(screen.getByText(/-25,3/)).toBeInTheDocument();
  });

  it('forklarer ingenting, når gulvet ikke har været i brug', () => {
    render(<PointOpdeling opdeling={FULD} total={29.5} />);
    expect(screen.queryByText(/kan ikke gå i minus/)).toBeNull();
  });

  // DEN FORRIGE UDGAVE af denne note hang på et `raaTotal`-felt, som ingen
  // kalder sendte med — grøn test, tom skærm. Afvigelsen regnes derfor af de
  // tal, der FAKTISK står på skærmen.
  it('forklarer også en afvigelse, der ikke er gulvet', () => {
    // En kamp, hvis facit er fjernet igen: pointene ligger i totalen, men i
    // ingen rubrik.
    render(<PointOpdeling opdeling={FULD} total={35} />);
    expect(screen.getByText(/Totalen er den rigtige/)).toBeInTheDocument();
    expect(screen.queryByText(/kan ikke gå i minus/)).toBeNull();
  });

  // Fire tal afrundet hver for sig kan afvige lidt fra ét afrundet tal. Fyrer
  // noten på den støj, står den på hver eneste spiller og betyder ingenting.
  it('larmer ikke på ren afrundingsstøj', () => {
    expect(opdelingsAfvigelse({ p1x2: 12.4, chance: 3.1, combi: 6, pulje: 8 }, 29.6)).toBeNull();
    render(<PointOpdeling opdeling={FULD} total={29.6} />);
    expect(screen.queryByText(/Totalen er den rigtige/)).toBeNull();
  });

  it('siger intet om afvigelser, når opdelingen slet ikke findes', () => {
    expect(opdelingsAfvigelse(null, 42)).toBeNull();
  });
});
