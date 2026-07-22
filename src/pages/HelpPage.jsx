/**
 * HelpPage — "Sådan virker det". Indholdet skifter efter PLATFORM_MODE:
 *  - Platform (Vejleaa Tip / Superliga): fuld guide til fodbold-tipning.
 *  - Tour (standalone): den oprindelige cykel-guide.
 * Pointreglerne for Tour genbruges fra den centrale PointRules.
 */
import { Link } from 'react-router-dom';
import PointRules from '../components/PointRules';
import { PLATFORM_MODE } from '../lib/platform';

function Section({ emoji, title, children }) {
  return (
    <div className="card" style={{ marginBottom: '1rem' }}>
      <h2 className="card__title" style={{ marginTop: 0 }}>{emoji} {title}</h2>
      <div style={{ color: 'var(--c-text)', fontSize: '0.92rem', lineHeight: 1.7 }}>{children}</div>
    </div>
  );
}

/** Kort til ét spil i "Spillene lige nu"-oversigten. */
function GameBlurb({ emoji, name, status, children }) {
  return (
    <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', padding: '0.5rem 0' }}>
      <span aria-hidden="true" style={{ fontSize: '1.4rem', lineHeight: 1 }}>{emoji}</span>
      <div>
        <div style={{ fontWeight: 600 }}>
          {name}
          {status && <span className="badge badge--muted" style={{ marginLeft: '0.4rem', fontWeight: 400 }}>{status}</span>}
        </div>
        <div style={{ color: 'var(--c-muted)' }}>{children}</div>
      </div>
    </div>
  );
}

// ── Platform-hjælp (samlesiden) — handler om HELE platformen, ikke ét spil ────
function PlatformHelp() {
  return (
    <div className="container">
      <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.5rem' }}>❓ Velkommen til Vejleaa Tip</h1>
      <p style={{ color: 'var(--c-muted)', margin: '0 0 1.25rem', fontSize: '0.95rem' }}>
        Én konto — flere tippespil. Her forklarer vi, hvordan platformen hænger sammen. Hjælp til det
        <strong> enkelte spil</strong> finder du inde i spillet under fanen <strong>❓ Hjælp</strong>.
      </p>

      <Section emoji="🎮" title="Én bruger, flere spil">
        Du har <strong>én konto</strong> til det hele. Under <Link to="/spil">🎮 Spil</Link> ser du alle
        tippespil: dem du er med i, og dem du kan <strong>tilmelde dig</strong>. Tryk <strong>Deltag</strong>
        {' '}på et spil, så er du med — du kan sagtens være med i flere på én gang. Hvert spil har sin
        <strong> egen stilling, sine egne point og sine egne mini-ligaer</strong>, så de blander sig ikke.
      </Section>

      <Section emoji="🏟️" title="Spillene lige nu">
        <GameBlurb emoji="⚽" name="Superligaen 2026/27" status="åben">
          Tip fodboldkampene runde for runde (1X2). Point <strong>følger oddsene</strong>, og der er bonus
          for at ramme hele runden (combi), et lille væddemål (Chancen) og et pulje-tip om, hvem der når
          mesterskabsspillet. Følg holdenes Elo og dyst i mini-ligaer. Fuld guide inde i spillet under
          {' '}<strong>❓ Hjælp</strong>.
        </GameBlurb>
        <GameBlurb emoji="🚴" name="Tour de France 2026" status="i gang">
          Cykel-tipning etape for etape: hold på etapevinderen, bedste hold, bjerg- og sprintpoint. Kører i
          sin egen app — åbn den fra <Link to="/spil">🎮 Spil</Link> (“Åbn spillet ↗”).
        </GameBlurb>
        <GameBlurb emoji="⚽" name="VM 2026" status="afsluttet">
          Vores fodbold-VM-tipning. Spillet er slut, men du kan stadig se{' '}
          <a href="https://vm.vejleaa.dk" target="_blank" rel="noopener noreferrer">stillingen i VM-appen ↗</a>.
        </GameBlurb>
      </Section>

      <Section emoji="🙂" title="Din profil & login">
        Du logger ind med <strong>Google</strong> eller e-mail. På <Link to="/profil">Profil</Link> kan du
        vælge et <strong>emoji som profilbillede</strong> og styre dine e-mail-påmindelser. Profilen følger
        dig på tværs af alle spillene — dit <strong>yndlingshold vælger du inde i det enkelte spil</strong>
        {' '}(holdene er jo forskellige fra spil til spil).
      </Section>

      <Section emoji="💬" title="Skriv sammen">
        <Link to="/beskeder">Beskeder</Link> er private 1-til-1-beskeder mellem spillere. Derudover har hver
        mini-liga sin egen <strong>væg</strong> inde i det spil, ligaen hører til. Et rødt tal ved “Beskeder”
        viser ulæste beskeder.
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
