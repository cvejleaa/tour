/**
 * HelpPage — "Sådan virker det". Indholdet skifter efter PLATFORM_MODE:
 *  - Platform (Vejleaa Tip / Superliga): fuld guide til fodbold-tipning.
 *  - Tour (standalone): den oprindelige cykel-guide.
 * Pointreglerne for Tour genbruges fra den centrale PointRules.
 */
import { Link } from 'react-router-dom';
import PointRules from '../components/PointRules';
import { PLATFORM_MODE } from '../lib/platform';
import { useGames, splitGames } from '../features/games/useGames';
import { GAME_STATUS_LABEL } from '../lib/constants';

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

// Redaktionelle beskrivelser pr. spil-id. BEVIDST evne-frie ud over spillets
// grundform: pulje-tippet (det felt, der skifter navn og form pr. spil)
// AFLEDES af game.pulje.labels nedenfor, så teksten ikke kan drifte fra
// virkeligheden ("et spejl af levende data er en løgn med forsinkelse").
// Et spil uden nøgle får en generisk hale — det kan mangle tekst, aldrig lyve.
const BLURBS = {
  superliga2627: (
    <>Tip fodboldkampene runde for runde (1X2). Point <strong>følger oddsene</strong>, og der er bonus
    for at ramme rundens kupon og et lille væddemål (Chancen). Følg holdenes Elo og dyst i mini-ligaer.</>
  ),
  'pl2627-efteraar': (
    <>Tip Premier League-kampene runde for runde (1X2). Point <strong>følger oddsene</strong>, med
    runde-bonus og Chancen — og følg holdenes Elo og dyst i mini-ligaer.</>
  ),
  tour2026: (
    <>Cykel-tipning etape for etape: hold på etapevinderen, bedste hold, bjerg- og sprintpoint.</>
  ),
  vm2026: (
    <>Vores fodbold-VM-tipning fra sommeren.</>
  ),
};

/** "Spillene lige nu" — AFLEDT af den levende games-collection via splitGames,
 *  så hjælpen pr. konstruktion viser præcis de spil, brugeren også ser under
 *  🎮 Spil: aldrig et skjult spil, aldrig en forkert status. Den hardkodede
 *  liste her stod med Touren som "i gang" efter sin afslutning og uden PL —
 *  det var netop den "lige nu"-løgn, reglen i CLAUDE.md er opkaldt efter. */
function SpilleneLigeNu() {
  const { games, myGameIds, loading } = useGames();
  const { mine, open, external } = splitGames(games, myGameIds);
  const synlige = [...mine, ...open, ...external]
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  if (loading) return <p style={{ margin: 0 }}>Henter spillene …</p>;
  if (synlige.length === 0) {
    return <p style={{ margin: 0 }}>Se alle spil under <Link to="/spil">🎮 Spil</Link>.</p>;
  }
  return (
    <>
      <p style={{ margin: '0 0 0.25rem', fontSize: '0.85rem' }}>
        Dine spil — og dem, du kan tilmelde dig (samme liste som under <Link to="/spil">🎮 Spil</Link>):
      </p>
      {synlige.map((g) => {
        const labels = g.pulje?.labels;
        return (
          <GameBlurb key={g.id} emoji={g.emoji} name={g.name} status={GAME_STATUS_LABEL[g.status] ?? null}>
            {BLURBS[g.id]}
            {/* Pulje-linjen afledes af spillets egne labels — PL's "juletabel"
                og SL's mesterskabsspil får hver deres ord uden håndskrift. */}
            {labels?.top && (
              <> Dertil et pulje-tip: de {g.pulje.poolSize} hold i <strong>{labels.top}</strong>
              {g.pulje.nedSize > 0 && labels.ned ? <> — og de {g.pulje.nedSize} i <strong>{labels.ned}</strong></> : null}.</>
            )}
            {/* Halen lover kun det, spillet kan holde: Guide-fanen findes kun
                for medlemmer (ellers ses kun Deltag-kortet), og eksterne spil
                åbnes i deres egen app. */}
            {g.externalUrl ? (
              <> Kører i sin egen app — <a href={g.externalUrl} target="_blank" rel="noopener noreferrer">åbn spillet ↗</a>.</>
            ) : myGameIds.has(g.id) ? (
              <> Fuld guide inde i spillet under <strong>❓ Guide</strong>.</>
            ) : (
              <> Tryk <strong>Deltag</strong> under <Link to="/spil">🎮 Spil</Link> for at være med.</>
            )}
          </GameBlurb>
        );
      })}
    </>
  );
}

// ── Platform-hjælp (samlesiden) — handler om HELE platformen, ikke ét spil ────
function PlatformHelp() {
  return (
    <div className="container">
      <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.5rem' }}>❓ Velkommen til Vejleaa Tip</h1>
      <p style={{ color: 'var(--c-muted)', margin: '0 0 1.25rem', fontSize: '0.95rem' }}>
        Én konto — flere tippespil. Her forklarer vi, hvordan platformen hænger sammen. Hjælp til det
        <strong> enkelte spil</strong> finder du inde i spillet under fanen <strong>❓ Guide</strong>.
      </p>

      <Section emoji="🎮" title="Én bruger, flere spil">
        Du har <strong>én konto</strong> til det hele. Under <Link to="/spil">🎮 Spil</Link> ser du alle
        tippespil: dem du er med i, og dem du kan <strong>tilmelde dig</strong>. Tryk <strong>Deltag</strong>
        {' '}på et spil, så er du med — du kan sagtens være med i flere på én gang. Hvert spil har sin
        <strong> egen stilling, sine egne point og sine egne mini-ligaer</strong>, så de blander sig ikke.
      </Section>

      <Section emoji="🏟️" title="Spillene lige nu">
        <SpilleneLigeNu />
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
