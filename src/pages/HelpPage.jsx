/**
 * HelpPage — "Sådan virker det". Indholdet skifter efter PLATFORM_MODE:
 *  - Platform (Vejleaa Tip / Superliga): fuld guide til fodbold-tipning.
 *  - Tour (standalone): den oprindelige cykel-guide.
 * Pointreglerne for Tour genbruges fra den centrale PointRules.
 */
import { Link } from 'react-router-dom';
import PointRules from '../components/PointRules';
import { PLATFORM_MODE } from '../lib/platform';
import { CHANCE, ROUND_BONUS, PULJE } from '../lib/superligaScoring';

function Section({ emoji, title, children }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 className="card__title" style={{ marginTop: 0 }}>{emoji} {title}</h2>
      <div style={{ color: 'var(--c-text)', fontSize: '0.92rem', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

/** Lille "chip" til at fremhæve en fane inde i spillet. */
function Tab({ children }) {
  return (
    <span
      className="badge badge--muted"
      style={{ whiteSpace: 'nowrap', fontWeight: 600 }}
    >
      {children}
    </span>
  );
}

// ── Superliga / platform-hjælp ────────────────────────────────────────────────
function PlatformHelp() {
  return (
    <div className="container">
      <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.5rem' }}>❓ Sådan virker det</h1>
      <p style={{ color: 'var(--c-muted)', margin: '0 0 1.25rem', fontSize: '0.95rem' }}>
        Alt du skal vide for at tippe Superligaen — fra dit første tip til bonus, Elo og mini-ligaer.
      </p>

      <Section emoji="🚀" title="Kom i gang">
        Log ind, og vælg <strong>Superligaen</strong> under <Link to="/spil">🎮 Spil</Link>. Tryk
        <strong> Deltag</strong>, så er du med. Inde i spillet finder du alt via fanerne øverst:
        {' '}<Tab>⚽ Tip</Tab> <Tab>📋 Mine tips</Tab> <Tab>🎖️ Pulje</Tab> <Tab>📈 Elo</Tab>{' '}
        <Tab>⚽ Tabel</Tab> <Tab>🏆 Stilling</Tab> <Tab>👥 Ligaer</Tab>.
      </Section>

      <Section emoji="⚽" title="Tip kampene (1X2)">
        På <Tab>⚽ Tip</Tab> gætter du udfaldet af hver kamp i runden: <strong>1</strong> (hjemmesejr),
        {' '}<strong>X</strong> (uafgjort) eller <strong>2</strong> (udesejr). Du kan rette dit tip helt
        indtil <strong>kampstart</strong> — derefter låses netop den kamp. Du behøver ikke tippe hele runden
        på én gang, men jo flere kampe du rammer, jo mere kan du hente på combi-bonussen (se nedenfor).
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
        {Math.round(CHANCE.CAP_FRACTION * 100)} % af din saldo — så du kan aldrig gå i minus. Tænk på den
        som et krydderi til en kamp, du har en stærk mavefornemmelse om.
      </Section>

      <Section emoji="🎰" title="Combi-runde-bonus">
        Tipper du <strong>alle</strong> kampe i en runde, får du en bonus oveni — som en tæmmet
        bookmaker-kupon: de ramte odds ganges sammen. Rammer du <strong>hele runden</strong>, gives bonussen
        med et loft på <strong>{ROUND_BONUS.PERFECT_CAP}</strong> point; rammer du <strong>alle på nær én</strong>,
        er loftet <strong>{ROUND_BONUS.NEAR_CAP}</strong>. To eller flere fejl → ingen combi. Det belønner at
        turde tippe hele runden.
      </Section>

      <Section emoji="🎖️" title="Bonus: pulje-tip">
        På <Tab>🎖️ Pulje</Tab> forudsiger du, hvilke <strong>{PULJE.POOL_SIZE} hold</strong> der ender i
        <strong> mesterskabsspillet</strong> efter grundspillet (de øvrige 6 ryger i nedrykningsspillet).
        Hvert rigtigt hold giver <strong>+{PULJE.PER_TEAM} point</strong>, og rammer du alle{' '}
        {PULJE.POOL_SIZE}, får du <strong>+{PULJE.PERFECT_BONUS}</strong> i bonus. Deadline for pulje-tippet
        sættes af arrangøren og vises på fanen — den behøver ikke være før runde 1.
      </Section>

      <Section emoji="📈" title="Elo-tabellen">
        På <Tab>📈 Elo</Tab> kan du følge holdenes <strong>styrke-rating</strong> hele sæsonen. Efter hver
        færdigspillet runde kommer der en ny kolonne forrest med den nye rating og en pil, der viser
        udviklingen. Elo-ratingen er også det, oddsene bygger på — så tabellen giver et fingerpeg om, hvor
        der er point at hente.
      </Section>

      <Section emoji="🏆" title="Stilling & tabel">
        <Tab>🏆 Stilling</Tab> viser jeres indbyrdes kamp — spillernes samlede point. <Tab>⚽ Tabel</Tab>
        {' '}viser den <strong>officielle Superliga-stilling</strong> (hentet direkte fra ligaen), delt op i
        mesterskabsspil (top 6) og nedrykningsspil (bund 6). Det er den, pulje-tippet afgøres på.
      </Section>

      <Section emoji="📋" title="Mine tips">
        <Tab>📋 Mine tips</Tab> samler alle dine tips runde for runde med facit, point pr. kamp og din
        combi-bonus — plus en opsummering med samlet point og din træfprocent. Perfekt til at se, hvor det
        gik godt, og hvor outsiderne drillede.
      </Section>

      <Section emoji="👥" title="Mini-ligaer">
        På <Tab>👥 Ligaer</Tab> kan du oprette en privat liga (du får en <strong>invitationskode</strong>)
        eller deltage med en kode fra en ven. I ligaen dyster I på jeres egen stilling, og hver liga har en
        {' '}<strong>væg</strong>, hvor I kan skrive sammen undervejs. Ejeren kan omdøbe og rydde op i ligaen.
      </Section>

      <Section emoji="🙂" title="Din profil & avatar">
        På <Link to="/profil">Profil</Link> kan du vælge et <strong>emoji som profilbillede</strong> i stedet
        for dine initialer, sætte dit yndlingshold og styre dine e-mail-præferencer. Har du spørgsmål, så
        skriv i en liga-væg eller send en <Link to="/beskeder">besked</Link> til en medspiller.
      </Section>
    </div>
  );
}

// ── Tour / standalone-hjælp (uændret) ─────────────────────────────────────────
function TourHelp() {
  return (
    <div className="container">
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.4rem' }}>❓ Sådan virker det</h1>

      <Section emoji="🚴" title="Tip etaperne">
        Gå til <Link to="/etaper">Etaper</Link> og tip cykelhold på hver etape: etapevinderens hold,
        bedste hold blandt de første ryttere, flest bjergpoint og flest sprintpoint. Du kan rette
        dit tip helt indtil <strong>etapestart</strong> – derefter låses det. Find hurtigt de etaper,
        du mangler, under filteret <em>“Mangler tip”</em> eller via <Link to="/">forsidens</Link> “Mine opgaver”.
      </Section>

      <Section emoji="🎯" title="Sådan får du point">
        <PointRules />
      </Section>

      <Section emoji="🎁" title="Bonusspørgsmål">
        På <Link to="/bonus">Bonus</Link> svarer du på sæson- og klassements-spørgsmål, fx hvem
        der vinder den samlede Tour eller bjergtrøjen. Hvert spørgsmål giver det antal point,
        der står ved spørgsmålet, hvis du svarer rigtigt. Spørgsmålene har deres egen deadline og låses derefter.
      </Section>

      <Section emoji="🏆" title="Mini-ligaer">
        På <Link to="/ligaer">Ligaer</Link> kan du oprette en liga (du får en join-kode) eller
        tilmelde dig en eksisterende. I en liga dyster I på en stilling, og ligaens manager kan stille
        <strong> ligaens egne bonusspørgsmål</strong>. Husk at svare på dem – de tæller kun i den liga.
        Mangler du svar i en liga, vises det på forsidens “Mine opgaver”.
      </Section>

      <Section emoji="📋" title="Mine opgaver">
        På <Link to="/">forsiden</Link> samler “Mine opgaver” alt, du mangler at svare på inden deadline:
        utippede etaper, åbne bonusspørgsmål og liga-bonus på tværs af dine ligaer. Tallet i menuen
        viser, hvor meget der mangler i alt.
      </Section>

      <Section emoji="💬" title="Skriv sammen">
        I har to steder at snakke: <Link to="/beskeder">Beskeder</Link> er private 1-til-1-beskeder
        mellem spillere, og hver liga har sin egen <strong>væg</strong>, hvor I kan kommentere og
        sætte emoji-reaktioner. Et rødt tal ved “Beskeder” viser ulæste beskeder.
      </Section>

      <Section emoji="✉️" title="E-mail-påmindelser">
        Du får automatisk en <strong>e-mail-påmindelse</strong> på etapedage, hvis du mangler at tippe.
        Vil du være fri, kan du slå dem fra under <Link to="/profil">Profil</Link> (“Send mig
        e-mail-påmindelser …”).
      </Section>

      <Section emoji="🙂" title="Din profil & avatar">
        På <Link to="/profil">Profil</Link> kan du vælge et <strong>emoji som profilbillede</strong> i
        stedet for dine initialer, sætte dit yndlingshold og styre dine e-mail-præferencer.
      </Section>
    </div>
  );
}

export default function HelpPage() {
  return PLATFORM_MODE ? <PlatformHelp /> : <TourHelp />;
}
