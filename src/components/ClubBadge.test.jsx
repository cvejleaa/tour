/**
 * Tests for ClubBadge — især trøje-varianten.
 *
 * Badgen står på hver kamp på hver skærm, og den bærer holdets identitet.
 * Cirklen gjorde det med tre bogstaver; trøjen gør det med farve og form, og
 * så skal formen faktisk komme frem.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ClubBadge from './ClubBadge';

const svg = (c) => c.querySelector('svg');

describe('ClubBadge — cirkel (uændret)', () => {
  it('viser kortkoden', () => {
    render(<ClubBadge code="ARS" color="#EC0000" title="Arsenal" />);
    expect(screen.getByText('ARS')).toBeInTheDocument();
  });

  it('er stadig standard, så intet brugssted skifter form af sig selv', () => {
    const { container } = render(<ClubBadge code="ARS" color="#EC0000" />);
    expect(svg(container)).toBeNull();
  });
});

describe('ClubBadge — trøje', () => {
  it('tegner en trøje i klubbens farve', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="CHE" color="#1B379B" title="Chelsea" />,
    );
    const s = svg(container);
    expect(s).toBeInTheDocument();
    expect(container.innerHTML).toContain('#1B379B');
  });

  // KODEN KAN IKKE VÆRE I TRØJEN — kroppen er for smal ved alle tre
  // størrelser. Brugsstedet viser den ved siden af. Slap den ind i badgen,
  // ville den enten flyde ud over kanten eller blive ulæselig.
  it('bærer ikke kortkoden som tekst', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="CHE" color="#1B379B" title="Chelsea" />,
    );
    expect(container.textContent).not.toContain('CHE');
  });

  // Holdnavnet er identiteten for skærmlæsere, uanset form.
  it('læses op som holdets navn', () => {
    render(<ClubBadge variant="troeje" code="CHE" color="#1B379B" title="Chelsea" />);
    expect(screen.getByRole('img', { name: 'Chelsea' })).toBeInTheDocument();
  });

  it('giver ærmerne deres egen farve', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="ARS" color="#EC0000" aerme="#FFFFFF" title="Arsenal" />,
    );
    // Både krop og ærmer skal være der — ikke kun den ene.
    expect(container.innerHTML).toContain('#EC0000');
    expect(container.innerHTML).toContain('#FFFFFF');
  });

  it('bruger kropsfarven på ærmerne, når holdet ikke har en egen', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="CHE" color="#1B379B" title="Chelsea" />,
    );
    // Tre paths (to ærmer + krop) skal alle bære samme farve.
    const fyld = [...container.querySelectorAll('path[fill]')].map((p) => p.getAttribute('fill'));
    expect(fyld.filter((f) => f === '#1B379B').length).toBeGreaterThanOrEqual(3);
  });
});

describe('ClubBadge — mønstre', () => {
  const tegn = (moenster) => render(
    <ClubBadge
      variant="troeje" code="NEW" color="#FDFDFD" color2="#0A0A0A"
      moenster={moenster} title="Newcastle United"
    />,
  ).container;

  it('tegner lodrette bånd ved striber', () => {
    const r = [...tegn('striber').querySelectorAll('rect')];
    expect(r.length).toBe(2);
    // Lodret = højere end bredt.
    for (const b of r) {
      expect(Number(b.getAttribute('height'))).toBeGreaterThan(Number(b.getAttribute('width')));
    }
  });

  it('tegner vandrette bånd ved bøjler', () => {
    const r = [...tegn('boejler').querySelectorAll('rect')];
    expect(r.length).toBe(2);
    for (const b of r) {
      expect(Number(b.getAttribute('width'))).toBeGreaterThan(Number(b.getAttribute('height')));
    }
  });

  // Striber og bøjler må ikke tegnes ens — det var hele grunden til at måle
  // mønstret i grafikken i stedet for at antage striber.
  it('tegner striber og bøjler forskelligt', () => {
    const s = tegn('striber').innerHTML;
    const b = tegn('boejler').innerHTML;
    expect(s).not.toBe(b);
  });

  it('deler trøjen i to ved halveret', () => {
    expect([...tegn('halveret').querySelectorAll('rect')].length).toBe(1);
  });

  it('tegner intet mønster uden en sekundærfarve', () => {
    const { container } = render(
      <ClubBadge variant="troeje" code="CHE" color="#1B379B" moenster="striber" title="Chelsea" />,
    );
    expect(container.querySelectorAll('rect').length).toBe(0);
  });

  // Tre bånd, ikke tolv: kroppen er 6,9 px bred ved størrelse 22, og flere
  // bånd bliver til en grå tåge — præcis den fejl, et farvegennemsnit laver.
  it('holder antallet af bånd nede', () => {
    expect([...tegn('striber').querySelectorAll('rect')].length).toBeLessThanOrEqual(3);
  });

  // ---------------------------------------------------------------------------
  // DE TRE NYE FORMER. Uden dem måtte tre danske trøjer stå ensfarvede, selv om
  // de tydeligt har et mønster — og alternativet var værre: et enkelt brystbånd
  // tegnet som `boejler` bliver til TO bånd, altså en anden trøje.
  // ---------------------------------------------------------------------------
  // MØNSTERETS FORM, uden klipstiens id. `svg.innerHTML` duer IKKE til
  // sammenligning: `idTaeller` tælles op ved hver render, så to renders af
  // SAMME mønster giver to forskellige strenge. Testen "alle otte er
  // forskellige" var derfor strukturelt umulig at gøre rød — `vandret-delt`
  // kunne gøres pixel-identisk med `halveret` med grøn suite.
  const form = (m) => [...tegn(m).querySelectorAll('g rect, g polygon')]
    .map((e) => e.outerHTML).join('|');

  // Vagten mod at defekten sniger sig tilbage: samme mønster, to renders,
  // samme form. Falder den, sammenligner vi id'er igen i stedet for figurer.
  it('giver samme form ved to renders af samme mønster', () => {
    expect(form('striber')).toBe(form('striber'));
  });

  it('tegner ét skråbånd som en polygon, ikke et rektangel', () => {
    const c = tegn('skraabaand');
    expect(c.querySelectorAll('polygon').length).toBe(1);
    // Et rektangel ville være et vandret bånd — altså `baand`, ikke et skråbånd.
    expect(c.querySelectorAll('rect').length).toBe(0);
  });

  /** Polygonens punkter som [x, y]-par. */
  const punkter = () => tegn('skraabaand').querySelector('polygon')
    .getAttribute('points').trim().split(/\s+/)
    .map((par) => par.split(',').map(Number));

  // BÆRENDE for skråbåndet: RETNINGEN. Trøjens bånd går fra ØVERST TIL HØJRE
  // ned mod nederst til venstre — målt række for række på klubbens foto, hvor
  // båndets midte flytter sig fra x=805 ved y=200 til x=351 ved y=800.
  //
  // Den første udgave af BÅDE formen og den her test havde den spejlvendt, og
  // testen bestod. Beskrivelsen "fra venstre skulder" er sand i bærerens
  // koordinater og falsk i beskuerens — og badgen tegnes i beskuerens.
  //
  // Den gamle test målte kun polygonens samlede lodrette udstrækning, og så
  // bestod BÅDE et bånd der vender forkert, en lodret stribe og en polygon,
  // der malede hele kroppen.
  it('lader skråbåndet gå fra øverst til højre mod nederst til venstre', () => {
    const p = punkter();
    const xMin = Math.min(...p.map(([x]) => x));
    const xMaks = Math.max(...p.map(([x]) => x));
    const venstreY = p.filter(([x]) => x === xMin).map(([, y]) => y);
    const hoejreY = p.filter(([x]) => x === xMaks).map(([, y]) => y);
    const midt = (ys) => (Math.min(...ys) + Math.max(...ys)) / 2;
    // Højre ende ligger HØJERE oppe, altså med mindre y.
    expect(midt(hoejreY)).toBeLessThan(midt(venstreY) - 4);
  });

  // …og det må ikke sluge trøjen. En polygon fra top til bund over hele
  // bredden bestod den gamle test og malede kroppen ensfarvet marineblå.
  it('lader skråbåndet dække under halvdelen af kroppens højde', () => {
    const p = punkter();
    const xMin = Math.min(...p.map(([x]) => x));
    const venstreY = p.filter(([x]) => x === xMin).map(([, y]) => y);
    const tykkelse = Math.max(...venstreY) - Math.min(...venstreY);
    // Kroppen er 19 enheder høj (y 2,5-21,5). Båndet er målt til 21,3 % af
    // trøjen og tegnet 4,8 enheder tykt.
    //
    // NEDRE GRÆNSE PÅ 4 OG IKKE 2. Med `> 2` bestod et bånd på 2,1 enheder —
    // vinkelret ca. 1 px ved 22 px, altså i samme område som Lyngbys 0,61 px,
    // der blev FRAVALGT netop på synlighed. Så ville testen have tilladt
    // præcis det, hele udvælgelsen bygger på at afvise.
    expect(tykkelse).toBeGreaterThan(4);
    expect(tykkelse).toBeLessThan(19 / 2);
  });

  it('tegner ÉT bånd ved baand — ikke to som boejler', () => {
    expect(tegn('baand').querySelectorAll('rect').length).toBe(1);
    expect(tegn('boejler').querySelectorAll('rect').length).toBe(2);
  });

  // Båndet sidder på BRYSTET — midten i 34 % af trøjens højde. Tallet kommer
  // fra `--moenster`-linjen "båndets egen midte", som måler den bredeste
  // sammenhængende stribe i et lodret snit. To forkerte værdier er passeret
  // her: 49 % (taljen) og 38 % (tyngdepunktet af alle gule pixels, hvor `gul`
  // også fanger krave og tryk).
  it('lægger baand på brystet, ikke i kraven eller taljen', () => {
    const r = tegn('baand').querySelector('rect');
    const y = Number(r.getAttribute('y'));
    const h = Number(r.getAttribute('height'));
    // Kroppen går fra y=2,5 til y=21,5. 38 % svarer til y≈9,7 for midten.
    // Målt: 34 %. Båndet er 15,9 % af fladen, så et bånd, der sidder rigtigt,
    // kan ikke ligge langt fra. Båndet [0,30; 0,40] gør BEGGE de forkerte
    // værdier røde: 49,5 % (taljen) og 37,9 % (tyngdepunkt-fejlen).
    const midte = (y + h / 2 - 2.5) / 19;
    expect(midte).toBeGreaterThan(0.30);
    expect(midte).toBeLessThan(0.40);
  });

  // OG DET SKAL KUNNE SES. Et bånd på 0,3 enheder bestod den gamle test — det
  // er 0,27 px på en 22 px badge, altså tyndere end Lyngbys bånd, som blev
  // FRAVALGT netop på den grund (0,61 px). Kroppen er 11 enheder bred og 19 høj.
  it('gør baandet bredt nok til at ses ved 22 px', () => {
    const r = tegn('baand').querySelector('rect');
    const h = Number(r.getAttribute('height'));
    const w = Number(r.getAttribute('width'));
    // Hele kroppens bredde, ikke 10 af 11: en enheds primærfarve i højre kant
    // ville se ud som en fejl, og `>= 10` tillod netop det.
    expect(w).toBeGreaterThanOrEqual(11);
    // 2 enheder af 24 er 1,8 px ved størrelse 22 — tre gange Lyngbys 0,61.
    expect(h).toBeGreaterThanOrEqual(2);
  });

  // `firkanter` er et EGENTLIGT bræt; `ternet` er to modstående kvadranter.
  // Tegnes de ens, er den ene form overflødig — og OB ville få kvarterer, hvor
  // trøjen har et skakbræt.
  // SET FORFRA. Randers' tredjetrøje har ORANGE øverst til venstre; orange er
  // primærfarven, så sekundærfarven skal ligge øverst til HØJRE. Den lå
  // omvendt, og trøjen var spejlvendt — samme fejl som skråbåndet, samme grund.
  it('lægger ternets sekundærfarve øverst til højre', () => {
    const r = [...tegn('ternet').querySelectorAll('rect')]
      .map((e) => ({ x: Number(e.getAttribute('x')), y: Number(e.getAttribute('y')) }));
    const oeverst = r.reduce((a, b) => (a.y <= b.y ? a : b));
    const nederst = r.reduce((a, b) => (a.y > b.y ? a : b));
    // Kroppens midte ligger ved x=12.
    expect(oeverst.x).toBeGreaterThanOrEqual(12);
    expect(nederst.x).toBeLessThan(12);
  });

  // OG SAMME KRAV TIL SKAKBRÆTTET. `(r + c) % 2` kunne vendes om med hele
  // suiten grøn: antallet af felter er det samme, formen er den komplementære,
  // og ingen test så forskel. Det er nøjagtig den fejl, der ramte `skraabaand`
  // og `ternet` — to spejlvendinger, som først et menneskeøje opdagede.
  // `firkanter` bruges ikke af nogen trøje endnu, og derfor er der ikke et
  // foto at falde tilbage på: så meget desto mere skal orienteringen låses,
  // før den første trøje tages i brug.
  it('lægger firkanternes øverste venstre felt i sekundærfarven', () => {
    const felter = [...tegn('firkanter').querySelectorAll('rect')]
      .map((e) => ({ x: Number(e.getAttribute('x')), y: Number(e.getAttribute('y')) }));
    // Kroppen begynder ved x=6,5 og y=2,5, og felterne er 11/3 × 19/4 store.
    expect(felter).toContainEqual({ x: 6.5, y: 2.5 });
    // …og nabofeltet til højre skal så IKKE være der.
    expect(felter.some((f) => f.y === 2.5 && f.x > 6.5 && f.x < 6.5 + 11 / 3 + 0.01)).toBe(false);
  });

  // `halveret` er den sidste form uden retningstest, og den er navngivet efter
  // en retning ("højre halvdel"). Ingen trøje bruger den i dag — men det gjaldt
  // også `firkanter`, og både `skraabaand` og `ternet` var spejlvendt. Én linje
  // nu er billigere end at opdage det på den første trøje, der tager den i brug.
  it('lægger halveret på beskuerens højre halvdel', () => {
    const r = tegn('halveret').querySelector('rect');
    // Kroppen går fra x=6,5 til x=17,5, altså med midten ved x=12.
    expect(Number(r.getAttribute('x'))).toBeGreaterThanOrEqual(12);
  });

  // …og `vandret-delt` på den nederste. Samme grund.
  it('lægger vandret-delt på den nederste halvdel', () => {
    const r = tegn('vandret-delt').querySelector('rect');
    // Kroppen går fra y=2,5 til y=21,5, altså med midten ved y=12.
    expect(Number(r.getAttribute('y'))).toBeGreaterThanOrEqual(12);
  });

  it('tegner firkanter som et bræt, ternet som to kvadranter', () => {
    expect(tegn('ternet').querySelectorAll('rect').length).toBe(2);
    expect(tegn('firkanter').querySelectorAll('rect').length).toBeGreaterThan(4);
    expect(form('firkanter')).not.toBe(form('ternet'));
  });

  // BRÆTTET SKAL DÆKKE KROPPEN. Testene talte kun felter, så `bredde = 1,
  // hoejde = 1` (en lillebitte klynge i hjørnet) og `bredde = 0` (seks
  // usynlige rektangler) var begge grønne.
  it('spænder firkanterne over hele kroppen', () => {
    const r = [...tegn('firkanter').querySelectorAll('rect')]
      .map((e) => ['x', 'y', 'width', 'height'].map((a) => Number(e.getAttribute(a))));
    const venstre = Math.min(...r.map(([x]) => x));
    const hoejre = Math.max(...r.map(([x, , w]) => x + w));
    const top = Math.min(...r.map(([, y]) => y));
    const bund = Math.max(...r.map(([, y, , h]) => y + h));
    expect(hoejre - venstre).toBeGreaterThanOrEqual(10);   // kroppen er 11 bred
    expect(bund - top).toBeGreaterThanOrEqual(18);         // og 19 høj
    // Og hvert felt skal have areal — seks nulstore rektangler er ikke et bræt.
    for (const [, , w, h] of r) expect(w * h).toBeGreaterThan(2);
  });

  // Men ikke for mange: kroppen er 6,9 px bred ved størrelse 22, så fire
  // kolonner giver 1,7 px hver og bliver til grød.
  it('holder antallet af firkanter nede', () => {
    expect(tegn('firkanter').querySelectorAll('rect').length).toBeLessThanOrEqual(6);
  });

  // Alle otte former skal give hver sit billede. To ens former er en fejl i
  // vokabularet, ikke i dataen — og den ville først blive opdaget på skærmen.
  it('tegner alle otte mønstre forskelligt', () => {
    const alle = ['striber', 'boejler', 'ternet', 'halveret', 'vandret-delt', 'skraabaand', 'baand', 'firkanter'];
    const former = alle.map(form);
    expect(new Set(former).size).toBe(alle.length);
  });

  // Et ukendt mønsternavn må tegne INTET — ikke falde tilbage på striber.
  // Ellers ville en stavefejl i dataen give en trøje et mønster, den ikke har.
  it('tegner intet ved et ukendt mønsternavn', () => {
    expect(tegn('skakbraet').querySelectorAll('rect,polygon').length).toBe(0);
  });

  // To trøjer på samme kampkort må ikke dele klipsti — så ville den ene miste
  // sit mønster.
  it('giver hver trøje sin egen klipsti', () => {
    const { container } = render(
      <div>
        <ClubBadge variant="troeje" code="NEW" color="#FDFDFD" color2="#0A0A0A" moenster="striber" title="Newcastle" />
        <ClubBadge variant="troeje" code="BOU" color="#FB0000" color2="#000000" moenster="striber" title="Bournemouth" />
      </div>,
    );
    const ider = [...container.querySelectorAll('clipPath')].map((c) => c.id);
    expect(new Set(ider).size).toBe(2);
  });
  // Fulhams udetrøje er ternet. Aflæsningen kaldte den bøjler, fordi tern
  // skifter farve BÅDE vandret og lodret, og målingen valgte den ene akse.
  // Rettet i hånden efter klubbens butik.
  it('tegner tern som fire felter, ikke som bånd', () => {
    const { container } = render(
      <ClubBadge
        variant="troeje" code="FUL" color="#FF0000" color2="#000000"
        moenster="ternet" title="Fulham"
      />,
    );
    const r = [...container.querySelectorAll('rect')];
    expect(r.length).toBe(2);
    // Felterne må ikke stå på samme højde — så var det bånd og ikke tern.
    expect(r[0].getAttribute('y')).not.toBe(r[1].getAttribute('y'));
    expect(r[0].getAttribute('x')).not.toBe(r[1].getAttribute('x'));
  });
});
