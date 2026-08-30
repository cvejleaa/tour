import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import FootballHelp from './FootballHelp';
import { RUBRIKKER } from './PointOpdeling';
import { COMBI, ODDS, TRAEF_BONUS } from '../../../lib/superligaScoring';

// Guiden får SPILLET og må kun beskrive de faner, spillet har. Uden gaten
// forklarede den pulje-tippet og Superligaens tabel-deling i Premier
// League-spillet.
describe('FootballHelp følger spillet', () => {
  const medSpil = (game) => render(
    <MemoryRouter initialEntries={['/spil/x?fane=hjaelp']}>
      <Routes>
        <Route path="/spil/:gameId" element={<FootballHelp game={game} />} />
      </Routes>
    </MemoryRouter>,
  );

  it('forklarer pulje-tippet og tabel-delingen i et spil MED pulje', () => {
    const { container } = medSpil({ pulje: { poolSize: 6 }, standings: [{ rank: 1 }] });
    expect(container.textContent).toContain('Bonus: pulje-tip');
    // Rundeforløbets pulje-linje skal OGSÅ bevises positivt — mutationen
    // "gaten altid false" overlevede, da kun den negative retning var dækket.
    expect(container.textContent).toContain('Afgiv dit');
    // Spilneutral: 'Superliga' er ude af delings-teksten (#8) — delingen og
    // tallene kommer fra konfigurationen.
    expect(container.textContent).toContain('officielle stilling');
    expect(container.textContent).toContain('mesterskabsspil (top 6)');
    expect(container.textContent).toContain('puljebonussen');
    expect(container.textContent).toContain('Følg den officielle');
  });

  // Kernen: guiden i et spil UDEN pulje og UDEN standings (PL i dag) må
  // hverken indeholde ét pulje-begreb eller beskrive/linke Tabel-fanen —
  // fanen er skjult (gated på standings), og "hentet direkte fra ligaen"
  // ville være usandt uden en synk. Positiv OG negativ assertion — kun den
  // nye tekst at tjekke fanger ikke en halv rettelse.
  it('nævner hverken pulje, Superliga-delingen eller Tabel-fanen i et spil uden begge', () => {
    const { container } = medSpil({});
    expect(container.textContent).toContain('Dyst i');
    expect(container.textContent).not.toContain('Bonus: pulje-tip');
    expect(container.textContent).not.toContain('Superliga-stilling');
    expect(container.textContent).not.toContain('mesterskabsspil (top 6)');
    expect(container.textContent).not.toContain('puljebonussen');
    expect(container.textContent).not.toContain('Pulje-tip');
    expect(container.textContent).not.toContain('⚽ Tabel');
    expect(container.textContent).not.toContain('hentet direkte fra ligaen');
  });

  // Fremtidens PL: standings uden pulje → Tabel-fanen findes, og guiden
  // beskriver den — men uden Superliga-delingen.
  it('beskriver Tabel-fanen uden Superliga-deling, når spillet har standings men ingen pulje', () => {
    const { container } = medSpil({ standings: [{ rank: 1 }] });
    expect(container.textContent).toContain('⚽ Tabel');
    expect(container.textContent).toContain('officielle stilling');
    expect(container.textContent).toContain('Følg den officielle');
    expect(container.textContent).not.toContain('Superliga-stilling');
    expect(container.textContent).not.toContain('mesterskabsspil (top 6)');
  });
});

describe('FootballHelp (spil-intern hjælp)', () => {
  it('viser Superliga-mekanikken inkl. hvordan combi-bonus beregnes', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Sådan forløber en runde/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Point følger oddsene/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Combi-runde-bonus/ })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Chancen/ })).toBeInTheDocument();
    // Combi-beregningen forklares konkret (ganges sammen + eksempel).
    expect(screen.getByText(/Sådan beregnes den/)).toBeInTheDocument();
    expect(screen.getByText(/1,5 · 2,0 · 3,0/)).toBeInTheDocument();
    // Elo-beregningen forklares også — inkl. hvorfor holdene ikke starter ens
    // og et outsider-slår-favorit-eksempel.
    expect(screen.getByRole('heading', { name: /Elo-tabellen/ })).toBeInTheDocument();
    expect(screen.getByText(/Sådan beregnes Elo/)).toBeInTheDocument();
    expect(screen.getByText(/sidste 3 års resultater/)).toBeInTheDocument();
    expect(screen.getByText(/outsider slår favorit/i)).toBeInTheDocument();
  });

  // Guiden henviser til faner mange steder. Uden en Route ville GameTabLink
  // falde tilbage til ren tekst, og alle henvisningerne ville være grønne og
  // utestede.
  // Hjælpesiden skal blive ved med at passe på appen. Fjernes afsnittet, står
  // der intet sted, at stillingen kommer af sig selv — og så genindlæser folk
  // siden manuelt for at se, om der er sket noget.
  it('forklarer, at stillingen opdaterer sig selv under kampen', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByText(/Mens kampen spilles/)).toBeInTheDocument();
    expect(screen.getByText(/opdaterer sig selv hvert minut/)).toBeInTheDocument();
  });

  // Hjælpeteksten og kortet er drevet fra hinanden to gange på to dage: først
  // lovede den, at slutresultatet AFLØSER den levende stilling, og derefter at
  // kortet står uden tal. Begge dele var forkerte, og intet fangede det.
  it('lover det samme om slutfløjt, som kortet faktisk gør', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByText(/Slut · afventer facit/)).toBeInTheDocument();
    expect(screen.getByText(/tallet forsvinder ikke/)).toBeInTheDocument();
  });

  // To nye ting kan man ikke gætte sig til: at knappen findes, og at et navn
  // kan klikkes. Står de ikke i hjælpen, findes de i praksis ikke.
  it('fortæller om opdelingen og om at klikke på et navn', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByText(/Hvor kommer pointene fra/)).toBeInTheDocument();
    expect(screen.getByText(/Klik på et navn/)).toBeInTheDocument();
  });

  // Rubrik-navnene hentes fra RUBRIKKER. Skrives de af, hedder de noget andet
  // på hjælpesiden end på skærmen, næste gang et ord ændres.
  it('bruger de samme rubrik-navne som skærmen', () => {
    const { container } = render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    for (const { navn } of RUBRIKKER) {
      expect(container.textContent).toContain(navn);
    }
  });

  // Man kan nu se en ligakammerats tips for HELE sæsonen i ét klik. Det skal
  // stå i hjælpen — begge veje.
  it('siger, at de andre kan se ens egne tips på samme måde', () => {
    render(<MemoryRouter><FootballHelp /></MemoryRouter>);
    expect(screen.getByText(/de kan se dine på samme måde/)).toBeInTheDocument();
  });

  // Udbetalingstabellen er hele pointen med "et link til en tabel": spilleren
  // skal kunne se, hvad en kupon giver, uden at regne kvadratrødder i hovedet.
  // Tallene REGNES af formlen — testen tjekker dem derfor mod formlen, ikke mod
  // en afskrift. Ændres faktoren, skal tabellen følge med af sig selv.
  it('viser en udbetalingstabel, der er regnet af den rigtige formel', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Udbetalingstabel/ })).toBeInTheDocument();
    // Produkt 100 → 2 × √100 = 20,0. Produkt 300 er over loftet → 25.
    const raekke = (tekst) => screen.getByText(tekst).closest('tr');
    expect(raekke('100,0')).toHaveTextContent('+20,0');
    expect(raekke('300,0')).toHaveTextContent(`+${COMBI.LOFT}`);
    expect(raekke('300,0')).toHaveTextContent('loft');
    // Og et lille produkt må IKKE give loftet — ellers er tabellen bare pynt.
    expect(raekke('4,0')).toHaveTextContent('+4,0');
    expect(raekke('4,0')).not.toHaveTextContent('loft');
  });

  // Udsatte kampe er den ændring, spillerne bliver spurgt om. Kan hjælpesiden
  // ikke svare, ender spørgsmålet i chatten.
  it('forklarer, hvad der sker med en udsat kamp', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: /Når en kamp bliver udsat/ })).toBeInTheDocument();
    expect(screen.getByText(/rundens kampe i samme uge/)).toBeInTheDocument();
    // Det vigtigste for spilleren: point går ikke tabt, kun combi'en venter ikke.
    expect(screen.getByText(/1X2-point præcis som altid/)).toBeInTheDocument();

    // VENDT BEVIDST. Her stod før "1X2-point og Chancen præcis som altid" —
    // testen asserterede altså LØGNEN ordret og ville have forsvaret den mod
    // enhver rettelse. Chancen følger RUNDEN (chanceGruppeKampe grupperer på
    // `round`), så en ⚡ brugt i weekenden er brugt, når rundens udsatte kamp
    // spilles en måned senere. Combi'en skæres pr. uge; Chancen gør ikke.
    //
    // Det var netop den slags, der før først blev opdaget, når en spiller
    // stod i situationen og troede, han havde en chance til gode.
    expect(screen.getByText(/Chancen følger RUNDEN, ikke kuponen/)).toBeInTheDocument();
    expect(screen.getByText(/Har du brugt din ⚡ i weekenden, er den brugt/)).toBeInTheDocument();
  });

  it('lover IKKE, at en udsat kamp giver en ny Chance', () => {
    // Fraværs-assertion på præcis den formulering, der var forkert. Uden den
    // kunne sætningen snige sig tilbage ved en senere omskrivning.
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(/Chancen præcis som altid/);
  });

  // Den gamle regel ("alle på nær én, ellers ingenting") stod fem steder. Står
  // den stadig ét sted, lover hjælpesiden noget, serveren ikke udbetaler.
  it('lover ikke længere den gamle 0-eller-1-fejl-regel', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(container.textContent).not.toMatch(/på nær én/);
    expect(container.textContent).not.toMatch(/To eller flere fejl/);
    expect(container.textContent).toMatch(/Hver ramt kamp tæller/);
  });

  it('gør fane-henvisningerne til rigtige links', () => {
    render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getAllByRole('link', { name: '👥 Ligaer' })[0])
      .toHaveAttribute('href', '/spil/sl?fane=ligaer');
    expect(screen.getAllByRole('link', { name: '📈 Elo' })[0])
      .toHaveAttribute('href', '/spil/sl?fane=elo');
    // "Mit hold" hedder profil som fane-nøgle — nem at ramme forkert.
    expect(screen.getAllByRole('link', { name: '🙂 Mit hold' })[0])
      .toHaveAttribute('href', '/spil/sl?fane=profil');
  });

  // GUIDEN ER SPILLERNES REGELBOG, og den har nu tre gange på tre dage sagt
  // noget andet end koden. Eksempeltallene bindes derfor til FORMLEN, ikke til
  // en afskrift: hardkodes de tilbage til de gamle 2,3/5,5, skal denne test
  // falde. Og teksten må aldrig kunne skrive "plus 0 point", når skruen er nul.
  it('regner eksemplerne af træf-bonussen — og skriver aldrig "plus 0 point"', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/spil/sl?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp />} />
        </Routes>
      </MemoryRouter>,
    );
    const komma = (n) => n.toFixed(1).replace('.', ',');
    expect(container.textContent).toContain(`${komma(1.3 + TRAEF_BONUS)} point`);
    expect(container.textContent).toContain(`${komma(4.5 + TRAEF_BONUS)} point`);
    // Regex, ikke toContain: "plus 0 point" findes også inde i "plus 0,5 point".
    expect(container.textContent).not.toMatch(/plus 0 point/);
    // Loftet SKAL nævnes ved sit navn. Uden det lover teksten ren fairness
    // netop dér, hvor spillet betaler mindre end fair — på de mest
    // usandsynlige udfald. En løsere regex på "6,0" ville ramme et hvilket
    // som helst andet tal i teksten og lyse grønt uden at bevise noget.
    // Loftet er fjernet, så teksten skal sige DET — ikke et tal. Bindes til
    // konstanten: genindføres et loft, skal hjælpen skrives om igen.
    expect(ODDS.MAX).toBeUndefined();
    expect(container.textContent).toContain('ikke længere et loft over oddsene');
    // EN POSITIV ASSERTION ER IKKE NOK. Mutationstesten viste, at man kunne
    // ændre "og ellers uden loft" til "og højst 6,00" — teksten ville så
    // modsige sig selv i to nabosætninger, og alle tests blev grønne, fordi de
    // kun tjekkede, at ÉN sætning var til stede. Nu skal teksten heller ikke
    // sige det modsatte noget sted. (Undtagen om FORTIDEN: "alt over 6,00 blev
    // skåret ned" er hele forklaringen og skal stå.)
    expect(container.textContent).toMatch(/og ellers uden loft/);
    expect(container.textContent).not.toMatch(/og højst \d/);
    expect(container.textContent).not.toMatch(/loft over oddsene på \d/);
    // Combi-loftet er nu det eneste tilbage, og det skal siges — ellers tror
    // en spiller, at intet er begrænset længere.
    expect(container.textContent).toMatch(/eneste sted i spillet, der stadig har et loft/);
    // HVORNÅR oddsene låser er det, en spiller bliver overrasket over: man
    // låser IKKE en kurs ved at tippe tidligt. Uden den sætning fremgår det
    // ingen steder — hverken i guiden eller på tip-fladen.
    expect(container.textContent).toMatch(/låser ikke en kurs|låser altså ikke en kurs/);
    expect(container.textContent).toMatch(/ved kampstart, der gælder/);
  });
});

// Holdsiden er en NY flade, og guiden er det eneste sted, den forklares. En
// test, der kun tjekker at afsnittet blev VIST, beviser ikke hvad der stod —
// derfor assertes der på indholdet OG på det, der ikke må stå.
describe('FootballHelp forklarer holdsiden', () => {
  // Afgrænset til HOLDSIDENS kort. Uden afgrænsningen målte testen hele
  // guiden, og "kampkort" (3 steder) og "dette spil" (4 steder) står også i
  // andre afsnit — så mutationer af netop denne tekst overlevede, fordi
  // ordene blev fundet et andet sted på siden.
  const vis = () => {
    render(
      <MemoryRouter initialEntries={['/spil/x?fane=hjaelp']}>
        <Routes>
          <Route path="/spil/:gameId" element={<FootballHelp game={{ standings: [{ rank: 1 }] }} />} />
        </Routes>
      </MemoryRouter>,
    );
    const overskrift = screen.getByText(/Holdsiden/);
    const kort = overskrift.closest('.card');
    expect(kort, 'Holdsidens afsnit mangler helt i guiden').not.toBeNull();
    return kort.textContent;
  };

  it('siger HVOR man klikker — ellers er fladen uopdagelig', () => {
    const tekst = vis();
    expect(tekst).toContain('Klik på et holdnavn');
    // Alle fire indgange skal nævnes; en manglende indgang er en flade,
    // brugeren ikke finder.
    expect(tekst).toMatch(/Elo-tabellen/);
    expect(tekst).toMatch(/officielle tabel/);
    expect(tekst).toMatch(/trøjeoversigten/i);
    expect(tekst).toMatch(/kampkort/);
  });

  it('siger at forventningen er VORES model, ikke rigtige odds', () => {
    // Den vigtigste sætning på hele siden: uden den ville en bruger tro, at
    // tallet måler os mod en bookmaker.
    const tekst = vis();
    expect(tekst).toContain('vores egen model');
    expect(tekst).toContain('ikke rigtige');
    expect(tekst).toMatch(/bookmakerodds/);
  });

  it('forklarer HVORFOR et kort kan mangle — ikke bare at det kan', () => {
    const tekst = vis();
    expect(tekst).toMatch(/aldrig været favorit/);
    expect(tekst).toMatch(/nul i nævneren/);
  });

  it('siger DETTE SPIL og lover aldrig hele sæsonen', () => {
    const tekst = vis();
    // HELE sætningen, ikke bare ordene: "dette spil" står også i afsnittets
    // første linje, så en assertion på ordene alene overlevede at forbeholdet
    // blev vendt om til "Tallene gælder sæsonen".
    expect(tekst).toContain('Tallene gælder dette spil — ikke hele sæsonen');
    expect(tekst).toContain('forårets kampe ikke med');
    // Guiden må ikke love tal for en hel sæson: Premier League-spillet er
    // runde 1-18 af 38, og foråret bliver et andet spil.
    expect(tekst).not.toMatch(/hele sæsonen for holdet/);
  });
});

// Guiden forklarer de to markeringer: 🔥 i stillingslisten er FORELØBIG og
// flytter sig, mens runden spilles — pokalen 👑 Rundekongen er ENDELIG og
// tælles først, når runden er helt færdig. Tegnene er nu forskellige (de var
// begge 👑, hvilket Quality Control kaldte en designrisiko), men SELVE
// forskellen bæres stadig af teksten, og så skal teksten være dækket.
//
// Test Manager beviste hullet: hele afsnittet kunne slettes, OG teksten kunne
// byttes til den stik modsatte påstand ("kronen er endelig og flytter sig
// ikke"), uden at en eneste af guidens 19 tests blev røde. Der asserteres
// derfor på INDHOLDET, ikke på at der stod noget.
describe('guiden forklarer 🔥 mod 👑 — foreløbig mod endelig', () => {
  const guide = () => render(
    <MemoryRouter initialEntries={['/spil/x?fane=hjaelp']}>
      <Routes>
        <Route path="/spil/:gameId" element={<FootballHelp game={{ id: 'x', type: 'football' }} />} />
      </Routes>
    </MemoryRouter>,
  );

  it('siger at rundens point er LEVENDE og kan skifte, indtil runden er spillet', () => {
    guide();
    const afsnit = screen.getByText(/Rundens point/).closest('li');
    expect(afsnit.textContent).toMatch(/levende/i);
    expect(afsnit.textContent).toMatch(/kan skifte, indtil den sidste kamp er spillet/i);
  });

  it('siger at ilden i listen er FORELØBIG og kronen ENDELIG — de må ikke byttes om', () => {
    guide();
    const rundekongen = screen.getByText(/Rundekongen/).closest('li');
    expect(rundekongen.textContent).toMatch(/🔥 i listen: den er\s*foreløbig/i);
    expect(rundekongen.textContent).toMatch(/kronen her er\s*endelig/i);
    // Det, der IKKE må stå: at ilden ikke flytter sig, eller at den er endelig.
    expect(rundekongen.textContent).not.toMatch(/🔥 i listen: den er\s*endelig/i);
  });

  it('forklarer at uafgjort deles, og at ingen krone gives når hele feltet tabte', () => {
    guide();
    const afsnit = screen.getByText(/Rundens point/).closest('li');
    expect(afsnit.textContent).toMatch(/står to lige, brænder det hos dem begge/i);
    expect(afsnit.textContent).toMatch(/Har hele feltet tabt runden, er der ingen ild/i);
  });

  it('siger at PILEN måler samme runde som tallet', () => {
    // Uden den sætning står to tal side om side uden at nogen siger, at de
    // dækker samme periode — og det var netop dét, ejeren snublede over,
    // dengang pilen målte mod et flere runder gammelt øjebliksbillede.
    guide();
    const afsnit = screen.getByText(/Rundens point/).closest('li');
    expect(afsnit.textContent).toMatch(/Pilen.*måler den samme runde/is);
    expect(afsnit.textContent).toMatch(/siden runden begyndte/i);
  });

  it('siger hvad en streg betyder — og lover ALDRIG et nul', () => {
    // Et 0 kan ikke leveres: serveren springer nul-værdier over, så den der
    // ramte alt forbi, er umulig at skelne fra den der ikke tippede. Lovede
    // guiden et 0, ville den love noget, fladen ikke kan holde.
    guide();
    const afsnit = screen.getByText(/Rundens point/).closest('li');
    expect(afsnit.textContent).toMatch(/betyder,\s*at du ikke har point i runden endnu/i);
    expect(afsnit.textContent).not.toMatch(/vises som 0|står der 0/i);
  });
});
