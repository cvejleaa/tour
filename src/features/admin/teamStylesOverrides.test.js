// ---------------------------------------------------------------------------
// Hvad admin FAKTISK gemmer på spillet.
//
// Hele TeamStylesTab kunne sættes til `return null` med grøn suite — filen blev
// ikke indlæst af én eneste test. Reglerne herunder bestemmer, hvad der står i
// `games/{id}.teamStyles` bagefter, og de kunne ikke prøves uden at rendere
// fanen. Derfor ligger de i en ren funktion nu.
//
// DET DYRESTE, DER KAN GÅ GALT, ER IKKE EN FORKERT FARVE. Det er en override,
// der IKKE burde have været skrevet: den fryser spillet mod fremtidige
// rettelser i holdlisten og i husets forslag, og ingen kan se på dokumentet, at
// valget aldrig blev truffet.
// ---------------------------------------------------------------------------
import { describe, it, expect } from 'vitest';
import { byggOverrides, dubletter } from './teamStylesOverrides';

// 'FC Nordsjælland' har et forslag i VISNINGSNAVN ('Nordsjælland'); de to andre
// har ikke. Begge grene skal med, ellers dækker testen kun den ene.
const TEAMS = [
  { name: 'FC Nordsjælland', color: '#B80112', awayColor: '#111111', thirdColor: '#FFD200' },
  { name: 'Brøndby IF', color: '#003DA5', awayColor: '#FFFFFF', thirdColor: '#FFD200' },
  { name: 'Silkeborg IF', color: '#CA202C', awayColor: '#FFFFFF', thirdColor: '#003DA5' },
];

/** Feltet, som fanen selv fylder ud ved indlæsning: alt sat til standarden. */
const uaendret = (teams, forslag = {}) => Object.fromEntries(teams.map((t) => [t.name, {
  visningsnavn: forslag[t.name] ?? t.name,
  color: t.color,
  awayColor: t.awayColor,
  thirdColor: t.thirdColor,
}]));

describe('byggOverrides', () => {
  // BÆRENDE. Åbner man fanen og trykker Gem uden at røre noget, skal der
  // skrives et TOMT objekt. Skrives standarden i stedet, er hvert hold i
  // spillet fra da af frosset — også dem, admin aldrig har set på.
  it('gemmer intet, når alt står på standarden', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    expect(byggOverrides(TEAMS, styles)).toEqual({});
  });

  // Og navnet gemmes heller ikke, hvis admin skriver husets forslag med håndkraft.
  it('gemmer ikke et visningsnavn, der er lig husets forslag', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    styles['FC Nordsjælland'].visningsnavn = 'Nordsjælland';
    expect(byggOverrides(TEAMS, styles)['FC Nordsjælland']).toBeUndefined();
  });

  it('gemmer et afvigende navn, trimmet', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    styles['Brøndby IF'].visningsnavn = '  Brøndby  ';
    expect(byggOverrides(TEAMS, styles)).toEqual({ 'Brøndby IF': { visningsnavn: 'Brøndby' } });
  });

  // TOMT FELT = "brug forslaget", ikke "intet navn". Gemtes den tomme streng,
  // ville `visningsnavn()` ganske vist afvise den ved læsning — men dokumentet
  // ville stå med en override, ingen har bedt om, og ↺ ville ikke kunne rydde op.
  it('gemmer et tomt felt som ingen override', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    styles['Brøndby IF'].visningsnavn = '   ';
    expect(byggOverrides(TEAMS, styles)['Brøndby IF']).toBeUndefined();
  });

  // Farverne følger samme regel — og kun den ændrede farve gemmes, ikke alle tre.
  it('gemmer kun den farve, der er ændret', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    styles['Silkeborg IF'].awayColor = '#123456';
    expect(byggOverrides(TEAMS, styles)).toEqual({ 'Silkeborg IF': { awayColor: '#123456' } });
  });

  // Store og små bogstaver er samme farve. Uden det ville browserens egen
  // farvevælger (som skriver med små) gemme en "ændring" på hvert eneste hold,
  // bare fordi feltet blev åbnet.
  it('regner #CA202C og #ca202c for samme farve', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    styles['Silkeborg IF'].color = '#ca202c';
    expect(byggOverrides(TEAMS, styles)).toEqual({});
  });

  // En ugyldig hex må ikke nå frem til dokumentet — feltet er frit tekstfelt.
  it('gemmer ikke en ugyldig farvekode', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    styles['Silkeborg IF'].color = '#12345';
    expect(byggOverrides(TEAMS, styles)).toEqual({});
  });

  // Farve og navn på samme hold skal begge med — ikke kun det første, der rammer.
  it('samler flere ændringer på samme hold i ét objekt', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    styles['Brøndby IF'].visningsnavn = 'Brøndby';
    styles['Brøndby IF'].color = '#000000';
    expect(byggOverrides(TEAMS, styles)).toEqual({
      'Brøndby IF': { visningsnavn: 'Brøndby', color: '#000000' },
    });
  });

  it('tåler et tomt styles-objekt og en tom holdliste', () => {
    expect(byggOverrides(TEAMS, {})).toEqual({});
    expect(byggOverrides([], { 'Brøndby IF': { visningsnavn: 'Brøndby' } })).toEqual({});
    expect(byggOverrides(null, null)).toEqual({});
  });
});

describe('dubletter', () => {
  it('siger fra, når to hold ville hedde det samme', () => {
    const styles = uaendret(TEAMS);
    styles['Brøndby IF'].visningsnavn = 'Brøndby';
    styles['Silkeborg IF'].visningsnavn = 'Brøndby';
    expect(dubletter(TEAMS, styles)).toEqual([
      { navn: 'Brøndby', hold: ['Brøndby IF', 'Silkeborg IF'] },
    ]);
  });

  // MODPRØVEN. Uden den ville en funktion, der altid melder dublet, bestå
  // testen ovenfor — og advarslen ville stå permanent og dermed være usynlig.
  it('siger intet, når alle navne er forskellige', () => {
    expect(dubletter(TEAMS, uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' }))).toEqual([]);
  });

  // "brighton" og "Brighton " er samme navn på skærmen. Sammenlignes de råt,
  // slipper netop den slags igennem — og det er den nemmeste at lave.
  it('ser bort fra store bogstaver og mellemrum', () => {
    const styles = uaendret(TEAMS);
    styles['Brøndby IF'].visningsnavn = 'Brøndby';
    styles['Silkeborg IF'].visningsnavn = '  brøndby ';
    expect(dubletter(TEAMS, styles).map((d) => d.hold)).toEqual([['Brøndby IF', 'Silkeborg IF']]);
  });

  // Advarslen skal også gælde husets EGNE forslag — de er ikke fredet.
  // Sætter admin ét hold til "Nordsjælland", mens FC Nordsjælland allerede
  // hedder det af sig selv, er kollisionen lige så reel.
  it('fanger en kollision med husets eget forslag', () => {
    const styles = uaendret(TEAMS, { 'FC Nordsjælland': 'Nordsjælland' });
    styles['Silkeborg IF'].visningsnavn = 'Nordsjælland';
    expect(dubletter(TEAMS, styles)).toEqual([
      { navn: 'Nordsjælland', hold: ['FC Nordsjælland', 'Silkeborg IF'] },
    ]);
  });

  // To uafhængige kollisioner skal begge med — ikke kun den første fundne.
  it('melder alle kollisioner, ikke kun den første', () => {
    const fire = [...TEAMS, { name: 'AGF' }];
    const styles = uaendret(fire);
    styles['FC Nordsjælland'].visningsnavn = 'X';
    styles['Brøndby IF'].visningsnavn = 'X';
    styles['Silkeborg IF'].visningsnavn = 'Y';
    styles.AGF.visningsnavn = 'Y';
    expect(dubletter(fire, styles).map((d) => d.navn)).toEqual(['X', 'Y']);
  });
});
