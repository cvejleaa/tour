import { describe, it, expect } from 'vitest';
import { paakraevedeRoller, formatér } from './roller.mjs';

const navne = (f) => paakraevedeRoller(f).roller.map((r) => r.navn);

describe('paakraevedeRoller — de tre faste', () => {
  it('kræver alle tre — og KUN dem — på en ændring uden mekanik eller adgang', () => {
    // Testen hed før "en helt almindelig kodeændring" og brugte Pokaler.jsx.
    // Den fejlede, og koden havde ret: Pokaler ER en rangliste, så Spilfører
    // skal med. Fixturet var forkert, ikke reglen. Her bruges en fil, der
    // hverken rører mekanik eller adgang.
    expect(navne(['src/features/games/football/visningsnavn.js'])).toEqual(
      ['Test Manager', 'Quality Control', 'Release Manager'],
    );
  });

  it('tilføjer Spilfører på en rangliste-flade — også når den ser uskyldig ud', () => {
    expect(navne(['src/features/games/Pokaler.jsx'])).toContain('Spilfører');
  });

  it('kræver dem OGSÅ på "bare en lille fejlrettelse"', () => {
    // CLAUDE.md er udtrykkelig: det var netop en "lille" ændring, der spærrede
    // alle migrerede brugere ude fra deres egen profil.
    expect(navne(['src/lib/daNum.js'])).toContain('Test Manager');
  });
});

describe('undtagelsen er SNÆVER', () => {
  it('undtager en ren tekstrettelse i docs/', () => {
    const p = paakraevedeRoller(['docs/drift.md']);
    expect(p.undtaget).toBe(true);
    expect(p.roller).toEqual([]);
  });

  it('undtager IKKE en .md uden for docs/ — den ændrer arbejdsgangen', () => {
    // CLAUDE.md og rolledefinitionerne er ikke dokumentation om spillet; de er
    // selve processen. Undtages de, kan processen ændres uden gennemgang.
    for (const fil of ['CLAUDE.md', '.claude/agents/test-manager.md', 'README.md']) {
      const p = paakraevedeRoller([fil]);
      expect(p.undtaget, fil).toBe(false);
      expect(p.roller.length, fil).toBe(3);
    }
  });

  it('undtager IKKE docs + kode blandet', () => {
    expect(paakraevedeRoller(['docs/drift.md', 'src/lib/x.js']).undtaget).toBe(false);
  });
});

describe('Security Reviewer — kun når adgang røres', () => {
  it.each([
    ['firestore.rules', 'reglerne selv'],
    ['functions-platform/chanceVagt.js', 'Cloud Functions'],
    ['functions/index.js', 'Cloud Functions'],
    ['src/features/admin/UsersTab.jsx', 'admin-flade'],
    ['src/features/games/gameLeagueActions.js', 'invitationer'],
  ])('kræves af %s', (fil) => {
    expect(navne([fil])).toContain('Security Reviewer');
  });

  it('kræves IKKE af en ren visningsændring', () => {
    // En sikkerhedsgennemgang af en tekstrettelse lærer ingen noget — CLAUDE.md
    // siger det selv. En rolle, der altid kaldes, holder man op med at læse.
    expect(navne(['src/features/games/football/FootballHelp.jsx']))
      .not.toContain('Security Reviewer');
  });
});

describe('Spilfører — kun på planen, og kun ved spilmekanik', () => {
  it.each([
    'functions-platform/gameScoring.js',
    'src/features/games/rundeSejre.js',
    'src/lib/ligaPoint.js',
    'functions-platform/gameRecap.js',
    'src/features/games/football/LeagueBets.jsx',
  ])('kræves af %s', (fil) => {
    expect(navne([fil])).toContain('Spilfører');
  });

  it('siger PÅ PLANEN — ikke på koden', () => {
    // Rådgivende på en færdigbygget feature er for sent: en kedelig feature,
    // der først opdages færdig, koster det samme som en designfejl.
    const r = paakraevedeRoller(['functions-platform/gameScoring.js']).roller
      .find((x) => x.navn === 'Spilfører');
    expect(r.hvornaar).toMatch(/PLANEN/);
  });

  it('kræves IKKE af et byggeskript', () => {
    expect(navne(['scripts/seed-football.mjs'])).not.toContain('Spilfører');
  });
});

describe('QC på planen er BETINGET — det var dén, der blev kørt for bredt', () => {
  it('spørger ved en .jsx-ændring i stedet for at kræve', () => {
    const p = paakraevedeRoller(['src/features/games/Pokaler.jsx']);
    expect(p.noter.join(' ')).toMatch(/NY brugerflade eller NYE TAL/);
    // Den må ikke snige en fjerde rolle ind: betingelsen afgøres af mennesket.
    expect(p.roller.filter((r) => r.navn === 'Quality Control')).toHaveLength(1);
  });

  it('spørger IKKE, når ingen flade er rørt', () => {
    expect(paakraevedeRoller(['src/lib/daNum.js']).noter.join(' '))
      .not.toMatch(/NY brugerflade/);
  });

  it('regner en .test.jsx som test, ikke som ny flade', () => {
    expect(paakraevedeRoller(['src/features/games/Pokaler.test.jsx']).noter.join(' '))
      .not.toMatch(/NY brugerflade/);
  });
});

describe('spejlede filer', () => {
  it('minder om modparten, når kun src/lib er rørt', () => {
    expect(paakraevedeRoller(['src/lib/ligaPoint.js']).noter.join(' '))
      .toMatch(/spejlet modpart/);
  });

  it('siger at de skal FØLGES AD, når begge ender er rørt', () => {
    const n = paakraevedeRoller(['src/lib/ligaPoint.js', 'functions-platform/ligaPoint.js']).noter.join(' ');
    expect(n).toMatch(/følges ad/);
  });
});

describe('en tom diff er en FEJL, ikke et frikort', () => {
  it('giver ingen roller MEN siger klart fra', () => {
    // Uden denne regel ville en forkert base-branch tavst afmelde hele
    // gennemgangen — og udskriften ville ligne "der er ikke noget at gøre".
    const p = paakraevedeRoller([]);
    expect(p.undtaget).toBe(false);
    expect(p.noter.join(' ')).toMatch(/TOM DIFF/);
    expect(formatér(p)).not.toMatch(/INGEN roller påkrævet/);
  });

  it('klarer manglende input uden at kaste', () => {
    expect(() => paakraevedeRoller()).not.toThrow();
    expect(paakraevedeRoller(null).noter.join(' ')).toMatch(/TOM DIFF/);
  });
});

describe('formatér', () => {
  it('skriver BÅDE rollen og begrundelsen — en liste uden hvorfor bliver ikke læst', () => {
    const t = formatér(paakraevedeRoller(['firestore.rules']));
    expect(t).toContain('Security Reviewer');
    expect(t).toContain('firestore.rules — reglerne selv');
  });

  it('skelner "undtaget" fra "kunne ikke afgøres"', () => {
    expect(formatér(paakraevedeRoller(['docs/x.md']))).toContain('INGEN roller påkrævet');
    expect(formatér(paakraevedeRoller([]))).toContain('KUNNE IKKE AFGØRES');
  });
});
