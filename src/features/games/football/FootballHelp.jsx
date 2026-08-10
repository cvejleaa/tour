/**
 * FootballHelp — hjælp der hører til ÉT fodbold-spil (fx Superligaen). Vises som
 * en fane inde i spillet, så den generelle samleside-hjælp kan handle om
 * platformen. Tallene hentes fra scoring-libbet, så de altid stemmer.
 */
import { Link } from 'react-router-dom';
import GameTabLink from '../GameTabLink';
import { CHANCE, COMBI, PULJE, ELO, ODDS, roundComboBonus, TRAEF_BONUS } from '../../../lib/superligaScoring';
import { fmtDec } from '../../../lib/daNum';
// Rubrik-navnene HENTES og skrives ikke af. Ellers hedder de noget andet på
// hjælpesiden end på skærmen, næste gang et ord ændres — præcis den drift,
// denne fils formål er at undgå.
import { RUBRIKKER } from './PointOpdeling';

// Udbetalingstabellen REGNES af den rigtige formel, den skrives ikke af.
// En håndskrevet tabel er en anden udgave af reglen, og to udgaver driver fra
// hinanden ved næste ændring — så ville hjælpesiden love noget, serveren ikke
// udbetalte. `1` er et neutralt led i produktet: [p, 1] har produktet p og de
// to led, roundComboBonus kræver.
function bonusAfProdukt(produkt) {
  return roundComboBonus([produkt, 1], 2);
}

// Rækkerne i tabellen: fra "to sikre rammer" til over loftet.
const PRODUKTER = [4, 9, 16, 25, 50, 100, 156.25, 300];

function Section({ emoji, title, children }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 className="card__title" style={{ marginTop: 0 }}>{emoji} {title}</h3>
      <div style={{ color: 'var(--c-text)', fontSize: '0.92rem', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

// Fane-henvisning. Har den et fane-id, bliver mærkatet et rigtigt link — så
// guiden kan FØLGES i stedet for bare at anvise vejen. Uden id (fx faner der
// ikke findes i dette spil) står den som før.
function Tab({ children, fane }) {
  const style = { whiteSpace: 'nowrap', fontWeight: 600 };
  if (!fane) return <span className="badge badge--muted" style={style}>{children}</span>;
  // Den linkede variant SKAL se anderledes ud end den grå tekst, den erstattede.
  // Uden farve og understregning er mærkatet pixel-identisk med før, og så
  // findes funktionen aldrig — slet ikke på mobil, hvor der ingen hover er.
  return (
    <GameTabLink
      fane={fane}
      className="badge"
      style={{ ...style, color: 'var(--c-pitch)', textDecoration: 'underline' }}
    >
      {children}
    </GameTabLink>
  );
}

export default function FootballHelp() {
  return (
    <div>
      <p style={{ color: 'var(--c-muted)', margin: '0 0 1rem', fontSize: '0.95rem' }}>
        Alt om at tippe her — fra dit ugentlige flow til point, bonus, Elo og mini-ligaer.
      </p>

      {/* Det daglige/ugentlige flow først — så resten er detaljerne. */}
      <Section emoji="🗓️" title="Sådan forløber en runde">
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Før kampene:</strong> På <Tab fane="tip">Tip</Tab> sætter du 1X2 på rundens kampe — du kan rette
            frit indtil hver kampstart. Jo flere kampe du tipper, jo større kan combi-bonussen blive. Brug evt.
            {' '}<strong>Chancen</strong> på den kamp, du har bedst fornemmelse for.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Mens der spilles:</strong> Følg den officielle <Tab fane="tabel">⚽ Tabel</Tab> og jeres indbyrdes
            {' '}<Tab fane="stilling">🏆 Stilling</Tab>. Når en kamp er <strong>gået i gang</strong>, kan du folde
            {' '}<em>Se ligaens tips</em> ud under kampen på <Tab fane="tip">Tip</Tab> og se, hvad de andre i dine
            ligaer valgte — og de kan se dit. Du kan også klikke på et navn i
            {' '}<Tab fane="stilling">🏆 Stilling</Tab> og se den spillers tip på <strong>alle</strong> afgjorte
            kampe — og de kan se dine på samme måde. Før kampstart er alles tips skjult, så ingen kan
            kigge efter.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Mens kampen spilles:</strong> Stillingen står mellem holdnavnene med et rødt
            {' '}<em>DIREKTE</em> og halvlegen, og den opdaterer sig selv hvert minut — du behøver ikke
            hente siden igen. Under tallet står klokkeslættet for seneste opdatering; holder den op med at
            komme, siger kortet det i stedet for at lade som ingenting.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Når kampen er slut:</strong> Ved slutfløjt bliver stillingen stående, og kortet
            skifter til <em>Slut · afventer facit</em> — tallet forsvinder ikke. Så lander slutresultatet,
            det rigtige 1X2 markeres, og dine point afregnes i samme øjeblik. Alt kommer fra Superligaens
            eget system, så der kan gå et minut eller to, hvor kampen er slut, uden at resultatet er nået frem.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Efter runden:</strong> Se dit facit og din træfprocent under <Tab fane="mine">📋 Mine tips</Tab>, og
            hvordan holdenes rating flyttede sig under <Tab fane="elo">📈 Elo</Tab>.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Hvilken runde lander du på?</strong> <Tab fane="tip">Tip</Tab> bliver stående på den runde, der
            har en kamp <strong>i gang</strong> — så forsvinder kampen, du sidder og ser, ikke fra skærmen. Ellers
            viser den runden med den <strong>næste kamp</strong>. Vil du videre før tid, bruger du
            {' '}<strong>Runde X →</strong> øverst; du kan tippe frit i enhver runde, der ikke er begyndt.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Løbende:</strong> Afgiv dit <Tab fane="pulje">🎖️ Pulje</Tab>-tip før deadline (én gang), dyst i
            {' '}<Tab fane="ligaer">👥 Ligaer</Tab> med vennerne, og vælg dit hold under <Tab fane="profil">🙂 Mit hold</Tab>.
          </li>
          <li>
            <strong>Spillet kan starte midt i sæsonen.</strong> Kampe, der er spillet <em>før</em> spillets
            startdato, vises ikke og giver ingen point — så alle er med fra samme runde. Derfor kan runde 1
            mangle, hvis spillet først begynder ved runde 2.
          </li>
        </ul>
      </Section>

      <Section emoji="⚽" title="Tip kampene (1X2)">
        På <Tab fane="tip">Tip</Tab> gætter du udfaldet af hver kamp i runden: <strong>1</strong> (hjemmesejr),
        {' '}<strong>X</strong> (uafgjort) eller <strong>2</strong> (udesejr). Du kan rette dit tip helt
        indtil <strong>kampstart</strong> — derefter låses netop den kamp. Du behøver ikke tippe hele
        runden, og en glemt kamp koster dig ikke combi-bonussen — men hver kamp, du rammer, ganger den op.
      </Section>

      <Section emoji="🎯" title="Point følger oddsene">
        Du får point <strong>svarende til oddsene</strong> på det udfald, du rammer — afrundet til én
        decimal{TRAEF_BONUS > 0 ? <> — <strong>plus {TRAEF_BONUS} point for at have ramt</strong></> : null}.
        Rammer du en storfavorit til odds 1,3, giver det{' '}
        <strong>{(1.3 + TRAEF_BONUS).toFixed(1).replace('.', ',')} point</strong>; rammer du en
        overraskelse til odds 4,5, giver det{' '}
        <strong>{(4.5 + TRAEF_BONUS).toFixed(1).replace('.', ',')} point</strong>. Forkert tip giver 0.
        <p style={{ margin: '0.5rem 0 0' }}>
          Oddsene er <strong>1 delt med sandsynligheden</strong> — mindst{' '}
          <strong>{fmtDec(ODDS.MIN)}</strong>, og ellers uden loft. Det betyder, at ethvert
          enkelt tip er lige meget værd i det lange løb: en sikker favorit giver få point ofte, en
          overraskelse giver mange point sjældent. På den <em>enkelte</em> kamp er de tre valg altså
          lige gode.
        </p>
        <p style={{ margin: '0.5rem 0 0' }}>
          <strong>Der er ikke længere et loft over oddsene.</strong> Tidligere blev alt over 6,00
          skåret ned til 6,00, og det gjorde tre ting: de vildeste langskud var underbetalte, to
          vidt forskellige udfald kunne stå til nøjagtig samme pris, og en Chance på høje odds var
          i praksis et tab. Nu betaler et udfald altid, hvad det er værd — i Superligaen op til
          omkring 8, i Premier League helt op til 24.
        </p>
        <p style={{ margin: '0.5rem 0 0' }}>
          <strong>Oddsene kan nå at flytte sig, indtil kampen går i gang.</strong> Efter hvert
          resultat opdateres holdenes styrke, og så friskes oddsene på alle kampe, der ikke er
          begyndt endnu. Ved kampstart låser de. Du <em>låser altså ikke en kurs</em> ved at tippe
          tidligt: det er kampens odds ved kampstart, der gælder — de samme for alle, uanset hvornår
          man har tippet. Så ingen kan hente en fordel ved at komme først.
        </p>
        <p style={{ margin: '0.5rem 0 0' }}>
          <strong>Combi-bonussen</strong> ganger de <strong>rene odds</strong> sammen: rammer du
          to overraskelser til odds 4,5, giver den{' '}
          <strong>{fmtDec(roundComboBonus([4.5, 4.5], 2))}</strong>; rammer du fem favoritter til odds 1,6,
          giver den <strong>{fmtDec(roundComboBonus([1.6, 1.6, 1.6, 1.6, 1.6], 5))}</strong>. Den er
          nu det eneste sted i spillet, der stadig har et loft — på{' '}
          <strong>{COMBI.LOFT}</strong>.
        </p>
      </Section>

      <Section emoji="⚡" title="Chancen">
        På én kamp pr. runde kan du bruge <strong>Chancen</strong>: sæt et lille antal point i spil på dit
        1X2-valg. Rammer du, vinder du <strong>indsats × (odds − 1)</strong> oveni; rammer du forkert,
        mister du kun indsatsen. Indsatsen er mellem <strong>{CHANCE.MIN}</strong> og{' '}
        <strong>{CHANCE.MAX_ABS}</strong> point og kan aldrig være mere end{' '}
        {Math.round(CHANCE.CAP_FRACTION * 100)} % af din saldo — så du kan aldrig gå i minus. Indsatsen
        tages fra dine <strong>optjente point</strong>, så du kan først bruge Chancen, når du har samlet
        nogle point.
        <p style={{ margin: '0.5rem 0 0' }}>
          Fordi oddsene ikke længere har et loft, er det her, ændringen mærkes mest. Fuld indsats
          på et udfald til odds 8 giver <strong>56 point</strong>; i Premier League kan en enkelt
          Chance til odds 24 give <strong>187</strong>. Det sker sjældent — og de gange du ikke
          rammer, koster det stadig kun indsatsen.
        </p>
      </Section>

      <Section emoji="🎰" title="Combi-runde-bonus">
        Oveni pointene pr. kamp får du en <strong>combi-bonus</strong> — som en tæmmet
        bookmaker-kupon. <strong>Sådan beregnes den:</strong> de odds, du <strong>rammer</strong>, ganges
        sammen, og bonussen er <strong>{COMBI.FAKTOR} × kvadratroden</strong> af det produkt, med et loft
        på <strong>{COMBI.LOFT}</strong> point.
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
          <li><strong>Hver ramt kamp tæller — fra to rigtige og opefter.</strong> Du behøver ikke ramme dem alle. Rammer du kun én, er der ingen kupon at gange; den kamp har allerede fået sine point.</li>
          <li><strong>Du behøver ikke tippe hele runden.</strong> Har du glemt en kamp, tæller den bare ikke med — den koster dig ikke bonussen. Men hver kamp, du tipper og rammer, ganger den op.</li>
          <li><strong>De forkerte tæller ikke med</strong> i produktet — de trækker heller ikke fra.</li>
        </ul>
        <p style={{ margin: '0.5rem 0 0' }}>
          <em>Eksempel:</em> rammer du odds 1,5 · 2,0 · 3,0, er produktet 9,0, og combi’en giver
          {' '}{COMBI.FAKTOR} × √9,0 = <strong>{fmtDec(bonusAfProdukt(9))} point</strong> oveni.
        </p>
        <p style={{ margin: '0.5rem 0 0' }}>
          Kvadratroden er ikke pynt. Uden den var bonussen så stor, at én heldig runde afgjorde
          sæsonen — og så lidt værd ved 4-5 rigtige, at det bedste træk var at tippe favoritter og håbe
          på en perfekt runde. Nu vokser den <em>jævnt</em>: det kan betale sig at turde en outsider,
          også når man ved, at man ikke rammer alle seks.
        </p>

        <h4 style={{ margin: '0.9rem 0 0.3rem', fontSize: '0.92rem' }}>Udbetalingstabel</h4>
        <p style={{ margin: '0 0 0.4rem', color: 'var(--c-muted)', fontSize: '0.86rem' }}>
          Tallene her er <strong>regnet ud af selve formlen</strong>, ikke skrevet af — de kan derfor
          ikke komme til at sige noget andet end det, serveren gør.
        </p>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ fontSize: '0.88rem' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left' }}>Produkt af de ramte odds</th>
                <th style={{ textAlign: 'right' }}>Bonus</th>
              </tr>
            </thead>
            <tbody>
              {PRODUKTER.map((p) => (
                <tr key={p}>
                  <td>{fmtDec(p)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>
                    +{fmtDec(bonusAfProdukt(p))}{bonusAfProdukt(p) >= COMBI.LOFT ? ' (loft)' : ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section emoji="🕒" title="Når en kamp bliver udsat">
        En runde kan blive splittet: fire kampe spilles i weekenden, to bliver rykket en måned. Så ville
        rundens bonus først falde, længe efter alle havde glemt runden.
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
          <li><strong>Kuponen er rundens kampe i samme uge</strong> — ugen fra tirsdag til mandag, hvor de fleste af rundens kampe ligger.</li>
          <li><strong>De udsatte kampe står uden for kuponen.</strong> De giver 1X2-point og Chancen præcis som altid, men tæller hverken med i combi’en her eller i en senere runde.</li>
          <li><strong>Du kan se det på kampen.</strong> Er runden splittet, står der <em>🎯 På kuponen</em> eller <em>🕒 Uden for kuponen</em> på hvert kort, og øverst på <Tab fane="tip">Tip</Tab> står hvilke kampe der er rykket hvorhen.</li>
          <li><strong>Kuponen bliver mindre — men du mister ingenting.</strong> Formlen er den samme, og de udsatte kampe giver stadig deres egne point, når de spilles.</li>
        </ul>
      </Section>

      <Section emoji="📋" title="Mine tips">
        <Tab fane="mine">📋 Mine tips</Tab> samler alle dine tips runde for runde med facit, point pr. kamp og din
        combi-bonus — plus din træfprocent og øverst en opdeling af, hvor pointene kommer fra:
        {' '}{RUBRIKKER.map(({ ikon, navn }, i) => (
          <span key={navn}>
            {i > 0 && ' · '}<strong>{ikon} {navn}</strong>
          </span>
        ))} og i alt. Det er de <strong>samme fire tal</strong> som i stillingen — de kommer fra
        serveren, ikke fra to forskellige regnestykker.
      </Section>

      <Section emoji="🏆" title="Stilling & tabel">
        <Tab fane="stilling">🏆 Stilling</Tab> viser jeres indbyrdes kamp — de samlede point for de spillere, du
        {' '}<strong>deler liga med</strong>. Er du ikke med i en liga endnu, er der ingen at måle dig
        mod: opret eller tilmeld dig én under <Tab fane="ligaer">👥 Ligaer</Tab>. Er du med i <strong>flere
        ligaer</strong>, kan du vælge én ad gangen øverst — så tælles placeringerne forfra inden
        for den liga.
        <ul style={{ margin: '0.5rem 0', paddingLeft: '1.2rem' }}>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>🧮 Hvor kommer pointene fra?</strong> — knappen bytter listen ud med et regnskab, hvor
            hver spillers point er delt i {RUBRIKKER.map(({ ikon, navn, hjaelp }, i) => (
              <span key={navn}>
                {i > 0 && (i === RUBRIKKER.length - 1 ? ' og ' : ', ')}
                <strong>{ikon} {navn}</strong> ({hjaelp.replace(/\.$/, '').toLowerCase()})
              </span>
            ))}. Summen kan afvige lidt fra totalen — så står forklaringen under tabellen, og totalen
            er den rigtige.
          </li>
          <li>
            <strong>Klik på et navn</strong> — så folder du den spillers tips ud runde for runde, med facit
            og udbytte, for alle kampe der er <strong>afgjort og gået i gang</strong>. Det virker begge
            veje: de andre i dine ligaer kan se dine på samme måde.
          </li>
        </ul>
        Bemærk, at stillingen viser <strong>spillets point</strong>; eventuelle
        {' '}<strong>liga-spørgsmål</strong> lægges kun oveni på ligaens egen side under
        {' '}<Tab fane="ligaer">👥 Ligaer</Tab>, så rækkefølgen dér kan være en anden. <Tab fane="tabel">⚽ Tabel</Tab>
        {' '}viser den <strong>officielle Superliga-stilling</strong> (hentet direkte fra ligaen), delt op i
        mesterskabsspil (top 6) og nedrykningsspil (bund 6). Det er den, pulje-tippet afgøres på.
      </Section>

      <Section emoji="📈" title="Elo på kampkortet">
        På <Tab fane="tip">Tip</Tab> står begge holds <strong>styrke-rating</strong> under kampen sammen med de
        seneste op til fem runders udvikling (▲/▼ pr. runde — samme betydning som i Elo-tabellen).
        Ratingen er holdets styrke <strong>efter seneste hele runde</strong> — den er ikke et bud på
        netop denne kamp. Hvem der er favorit, kan du læse direkte på 1X2-knapperne: der står, hvor
        mange point hvert udfald giver. De tal er ikke bare forskellen i rating — hjemmebanen tæller
        også med.
      </Section>

      <Section emoji="📈" title="Elo-tabellen">
        På <Tab fane="elo">📈 Elo</Tab> kan du følge holdenes <strong>styrke-rating</strong> hele sæsonen. Efter hver
        færdigspillet runde kommer der en ny kolonne forrest med den nye rating og en pil, der viser
        udviklingen. Elo-ratingen er også det, <strong>oddsene bygger på</strong>.
        <p style={{ margin: '0.5rem 0 0' }}><strong>Sådan beregnes Elo:</strong></p>
        <ul style={{ margin: '0.35rem 0 0', paddingLeft: '1.2rem' }}>
          <li><strong>Holdene starter ikke alle på {ELO.START}.</strong> {ELO.START} er blot det neutrale
            nulpunkt. Hvert hold får en <strong>start-rating</strong>, vi har beregnet ud fra de
            <strong> sidste 3 års resultater</strong> plus en vurdering af holdets aktuelle styrke — så en
            storklub starter <em>over</em> {ELO.START} og et oprykker-/svagt hold <em>under</em>. Derfor
            er favoritter og outsidere forskellige allerede fra første kamp.</li>
          <li>Før en kamp regnes en <strong>forventning</strong> til hjemmeholdet ud fra forskellen i rating
            {' '}plus en <strong>hjemmebanefordel på ~{ELO.HFA}</strong> point. To hold med samme rating er altså
            ikke 50/50 — hjemmeholdet forventes at tage omkring 59 % takket være hjemmebanen.</li>
          <li>Efter kampen flyttes rating mod resultatet: <em>ny rating = gammel + {ELO.K} ×
            (resultat − forventning)</em>, hvor resultat er 1 (sejr), ½ (uafgjort) eller 0 (nederlag).
            Vinderens point lægges til, taberens trækkes fra — lige meget begge veje.</li>
          <li>Jo mere <strong>overraskende</strong> resultatet er, jo større er udsvinget (slår en outsider
            en favorit, rykker det meget; vinder favoritten som ventet, rykker det lidt).</li>
        </ul>
        <p style={{ margin: '0.5rem 0 0' }}>
          <em>Eksempel 1 — jævnbyrdige:</em> to lige stærke hold (forventning 50 %). Vinder hjemmeholdet,
          får det {ELO.K} × (1 − 0,5) = <strong>+{Math.round(ELO.K * 0.5)}</strong> point, og udeholdet
          {' '}−{Math.round(ELO.K * 0.5)}.
        </p>
        <p style={{ margin: '0.35rem 0 0' }}>
          <em>Eksempel 2 — outsider slår favorit:</em> favoritten er ventet til at vinde med 80 %, outsideren
          har altså kun 20 % forventning. Vinder outsideren alligevel, får den {ELO.K} × (1 − 0,2) =
          {' '}<strong>+{Math.round(ELO.K * 0.8)}</strong> point, og favoritten
          {' '}<strong>−{Math.round(ELO.K * 0.8)}</strong> — et langt større udsving end mellem jævnbyrdige
          hold, netop fordi resultatet var overraskende.
        </p>
      </Section>

      <Section emoji="🎖️" title="Bonus: pulje-tip">
        På <Tab fane="pulje">🎖️ Pulje</Tab> forudsiger du, hvilke <strong>{PULJE.POOL_SIZE} hold</strong> der ender i
        <strong> mesterskabsspillet</strong> efter grundspillet (de øvrige 6 ryger i nedrykningsspillet).
        Hvert rigtigt hold giver <strong>+{PULJE.PER_TEAM} point</strong>, og rammer du alle{' '}
        {PULJE.POOL_SIZE}, får du <strong>+{PULJE.PERFECT_BONUS}</strong> i bonus. Deadline sættes af
        arrangøren og vises på fanen.
      </Section>

      <Section emoji="👥" title="Mini-ligaer">
        På <Tab fane="ligaer">👥 Ligaer</Tab> kan du oprette en privat liga (du får en <strong>invitationskode</strong>)
        eller deltage med en kode fra en ven. I ligaen dyster I på jeres egen stilling, og hver liga har en
        {' '}<strong>væg</strong>, hvor I kan skrive sammen undervejs.
        <p style={{ margin: '0.5rem 0 0' }}>
          <strong>Liga-spørgsmål:</strong> den, der oprettede ligaen, kan stille jeres egne spørgsmål
          (&quot;hvem bliver topscorer?&quot;) med deadline og pointværdi. Andres svar er skjult, indtil
          spørgsmålet lukker — så ingen kan skrive af. Point fra spørgsmål tæller <em>kun</em> i den liga og
          vises som <strong>(+X❓)</strong> i liga-stillingen.
        </p>
        <p style={{ margin: '0.5rem 0 0' }}>
          <strong>Runde-Botten 🤖:</strong> efter rundens sidste kamp skriver en bot et kort resumé på jeres
          væg — hvem der løb med runden, hvem der brændte den, og hvordan stillingen ser ud.
        </p>
      </Section>

      <Section emoji="🙂" title="Dit hold">
        {/* SAMME ORDLYD SOM GameProfile. De to tekster beskriver den samme
            funktion, og stod der forskelligt, ville den ene være forkert —
            præcis den fælde, CLAUDE.md navngiver. Begge sagde "holdets farve",
            mens yndlingsholdet slet ikke rørte avataren; da GameProfile blev
            rettet, blev den her stående og sagde så noget andet. */}
        Under <Tab fane="profil">🙂 Mit hold</Tab> vælger du dit <strong>yndlingshold i dette spil</strong>. Din
        avatar får holdets farve som ring om sig i stillingen og i dine ligaer. Holdet gælder kun
        her — andre spil har deres egne hold.
        {/* EN HENVISNING, IKKE EN KOPI. Reglen for tredjetrøjen er formuleret ÉT sted
            (trøjeoversigten nederst på fanen). Skrev vi den af her, ville de to kunne
            drive fra hinanden — nøjagtig det, kommentaren ovenfor handler om. */}
        {' '}Nederst på fanen står alle holdenes tre trøjer, og hvordan kampkortet vælger
        {' '}mellem dem.
      </Section>

      <p style={{ color: 'var(--c-muted)', fontSize: '0.88rem', marginTop: '1rem' }}>
        Vil du vide, hvordan hele platformen hænger sammen — og hvilke andre spil du kan være med i med den
        samme bruger? Se den generelle <Link to="/hjaelp">hjælp</Link>.
      </p>
    </div>
  );
}
