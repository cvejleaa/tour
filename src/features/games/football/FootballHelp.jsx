/**
 * FootballHelp — hjælp der hører til ÉT fodbold-spil (fx Superligaen). Vises som
 * en fane inde i spillet, så den generelle samleside-hjælp kan handle om
 * platformen. Tallene hentes fra scoring-libbet, så de altid stemmer.
 */
import { Link } from 'react-router-dom';
import { CHANCE, ROUND_BONUS, PULJE, ELO } from '../../../lib/superligaScoring';

function Section({ emoji, title, children }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h3 className="card__title" style={{ marginTop: 0 }}>{emoji} {title}</h3>
      <div style={{ color: 'var(--c-text)', fontSize: '0.92rem', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

function Tab({ children }) {
  return <span className="badge badge--muted" style={{ whiteSpace: 'nowrap', fontWeight: 600 }}>{children}</span>;
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
            <strong>Før kampene:</strong> På <Tab>⚽ Tip</Tab> sætter du 1X2 på rundens kampe — du kan rette
            frit indtil hver kampstart. Tip gerne <strong>hele runden</strong> (combi-bonus), og brug evt.
            {' '}<strong>Chancen</strong> på den kamp, du har bedst fornemmelse for.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Mens der spilles:</strong> Følg den officielle <Tab>⚽ Tabel</Tab> og jeres indbyrdes
            {' '}<Tab>🏆 Stilling</Tab>.
          </li>
          <li style={{ marginBottom: '0.4rem' }}>
            <strong>Efter runden:</strong> Se dit facit og din træfprocent under <Tab>📋 Mine tips</Tab>, og
            hvordan holdenes rating flyttede sig under <Tab>📈 Elo</Tab>.
          </li>
          <li>
            <strong>Løbende:</strong> Afgiv dit <Tab>🎖️ Pulje</Tab>-tip før deadline (én gang), dyst i
            {' '}<Tab>👥 Ligaer</Tab> med vennerne, og vælg dit hold under <Tab>🙂 Mit hold</Tab>.
          </li>
        </ul>
      </Section>

      <Section emoji="⚽" title="Tip kampene (1X2)">
        På <Tab>⚽ Tip</Tab> gætter du udfaldet af hver kamp i runden: <strong>1</strong> (hjemmesejr),
        {' '}<strong>X</strong> (uafgjort) eller <strong>2</strong> (udesejr). Du kan rette dit tip helt
        indtil <strong>kampstart</strong> — derefter låses netop den kamp. Du behøver ikke tippe hele runden
        på én gang, men jo flere kampe du rammer, jo mere kan du hente på combi-bonussen.
      </Section>

      <Section emoji="🎯" title="Point følger oddsene">
        Du får point <strong>svarende til oddsene</strong> på det udfald, du rammer — afrundet til én
        decimal. Rammer du en storfavorit til odds 1,3, giver det <strong>1,3 point</strong>; rammer du en
        overraskelse til odds 4,5, giver det <strong>4,5 point</strong>. Forkert tip giver 0. Så det betaler
        sig at turde satse på outsidere — men de sikre kampe holder dig stabil.
      </Section>

      <Section emoji="⚡" title="Chancen">
        På én kamp pr. runde kan du bruge <strong>Chancen</strong>: sæt et lille antal point i spil på dit
        1X2-valg. Rammer du, vinder du <strong>indsats × (odds − 1)</strong> oveni; rammer du forkert,
        mister du kun indsatsen. Indsatsen er mellem <strong>{CHANCE.MIN}</strong> og{' '}
        <strong>{CHANCE.MAX_ABS}</strong> point og kan aldrig være mere end{' '}
        {Math.round(CHANCE.CAP_FRACTION * 100)} % af din saldo — så du kan aldrig gå i minus. Indsatsen
        tages fra dine <strong>optjente point</strong>, så du kan først bruge Chancen, når du har samlet
        nogle point.
      </Section>

      <Section emoji="🎰" title="Combi-runde-bonus">
        Tipper du <strong>alle</strong> kampe i en runde, får du en bonus oveni — som en tæmmet
        bookmaker-kupon. <strong>Sådan beregnes den:</strong> de odds, du <strong>rammer</strong>, ganges
        sammen, og resultatet lægges til som bonus-point (oveni de almindelige point pr. kamp).
        <ul style={{ margin: '0.5rem 0 0', paddingLeft: '1.2rem' }}>
          <li><strong>Alle kampe ramt</strong> → alle de ramte odds ganges, med et loft på <strong>{ROUND_BONUS.PERFECT_CAP}</strong> point.</li>
          <li><strong>Alle på nær én</strong> → de ramte odds (den forkerte tælder ikke med) ganges, med et loft på <strong>{ROUND_BONUS.NEAR_CAP}</strong> point.</li>
          <li><strong>To eller flere fejl</strong> → ingen combi-bonus.</li>
        </ul>
        <p style={{ margin: '0.5rem 0 0' }}>
          <em>Eksempel:</em> rammer du en hel runde med odds 1,5 · 2,0 · 3,0, giver combi’en
          {' '}1,5 × 2,0 × 3,0 = <strong>9,0 point</strong> oveni. Ryger produktet over loftet, skæres det til
          {' '}{ROUND_BONUS.PERFECT_CAP} — så én heldig runde ikke afgør hele sæsonen. Det belønner at turde
          tippe hele runden.
        </p>
      </Section>

      <Section emoji="📋" title="Mine tips">
        <Tab>📋 Mine tips</Tab> samler alle dine tips runde for runde med facit, point pr. kamp og din
        combi-bonus — plus en opsummering med samlet point og din træfprocent.
      </Section>

      <Section emoji="🏆" title="Stilling & tabel">
        <Tab>🏆 Stilling</Tab> viser jeres indbyrdes kamp — spillernes samlede point. <Tab>⚽ Tabel</Tab>
        {' '}viser den <strong>officielle Superliga-stilling</strong> (hentet direkte fra ligaen), delt op i
        mesterskabsspil (top 6) og nedrykningsspil (bund 6). Det er den, pulje-tippet afgøres på.
      </Section>

      <Section emoji="📈" title="Elo-tabellen">
        På <Tab>📈 Elo</Tab> kan du følge holdenes <strong>styrke-rating</strong> hele sæsonen. Efter hver
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
            {' '}plus en <strong>hjemmebanefordel på ~{ELO.HFA}</strong> point. Lige stærke hold ≈ 50/50.</li>
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
        På <Tab>🎖️ Pulje</Tab> forudsiger du, hvilke <strong>{PULJE.POOL_SIZE} hold</strong> der ender i
        <strong> mesterskabsspillet</strong> efter grundspillet (de øvrige 6 ryger i nedrykningsspillet).
        Hvert rigtigt hold giver <strong>+{PULJE.PER_TEAM} point</strong>, og rammer du alle{' '}
        {PULJE.POOL_SIZE}, får du <strong>+{PULJE.PERFECT_BONUS}</strong> i bonus. Deadline sættes af
        arrangøren og vises på fanen.
      </Section>

      <Section emoji="👥" title="Mini-ligaer">
        På <Tab>👥 Ligaer</Tab> kan du oprette en privat liga (du får en <strong>invitationskode</strong>)
        eller deltage med en kode fra en ven. I ligaen dyster I på jeres egen stilling, og hver liga har en
        {' '}<strong>væg</strong>, hvor I kan skrive sammen undervejs.
      </Section>

      <Section emoji="🙂" title="Dit hold">
        Under <Tab>🙂 Mit hold</Tab> vælger du dit <strong>yndlingshold i dette spil</strong>. Det giver din
        avatar holdets farve i stillingen og i dine ligaer. Holdet gælder kun her — andre spil har deres
        egne hold.
      </Section>

      <p style={{ color: 'var(--c-muted)', fontSize: '0.88rem', marginTop: '1rem' }}>
        Vil du vide, hvordan hele platformen hænger sammen — og hvilke andre spil du kan være med i med den
        samme bruger? Se den generelle <Link to="/hjaelp">hjælp</Link>.
      </p>
    </div>
  );
}
