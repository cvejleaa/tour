// Køreplan-fanen i admin-panelet — en kort, praktisk guide til turneringen.
// Ligger direkte i appen, så admin altid har den ved hånden (ingen ekstern doc).

const sectionStyle = { marginBottom: '1.5rem' };
const h2Style = { margin: '0 0 0.5rem', fontSize: '1.05rem', color: 'var(--c-pitch)' };
const pStyle = { margin: '0 0 0.5rem', fontSize: '0.92rem', lineHeight: 1.5 };
const liStyle = { fontSize: '0.92rem', lineHeight: 1.6, marginBottom: '0.25rem' };

function Kbd({ children }) {
  return (
    <strong style={{ background: 'var(--c-surface-2, #f3f4f6)', padding: '0 0.3rem', borderRadius: 4, whiteSpace: 'nowrap' }}>
      {children}
    </strong>
  );
}

export default function RunbookTab() {
  return (
    <div>
      <p style={{ ...pStyle, color: 'var(--c-muted)', marginBottom: '1.25rem' }}>
        Det meste kører automatisk. Denne køreplan er din tjekliste, hvis du er i tvivl.
      </p>

      <section style={sectionStyle}>
        <h2 style={h2Style}>⚽ Under kampene (automatisk)</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li style={liStyle}>Resultater hentes fra football-data.org hvert minut — status, live-scores og slutresultater opdateres selv, og point beregnes automatisk.</li>
          <li style={liStyle}>Hold øje med <Kbd>✅ Auto-synk kører</Kbd> øverst på <Kbd>Kampe &amp; resultater</Kbd>. Bliver den gul eller rød, er automatikken stoppet — se nederst.</li>
          <li style={liStyle}>Knockout afgjort på straffespark håndteres automatisk: resultatet gemmes som uafgjort, og det hold der gik videre, sættes som «videre».</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>✏️ Ret et forkert resultat</h2>
        <p style={pStyle}>
          Ret kampen under <Kbd>Kampe &amp; resultater</Kbd>. Din rettelse er «klæbende»: automatikken rører ikke kampen igen.
          Vil du give automatikken kontrollen tilbage, tryk <Kbd>Gendan automatik</Kbd> på kampen.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🏆 Gruppevindere &amp; bonus</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li style={liStyle}>Gruppevindere afgøres automatisk, når en gruppe er færdigspillet. Du kan også trykke <Kbd>🏆 Afgør gruppevindere</Kbd> i <Kbd>Bonus-facit</Kbd> (brug <Kbd>Tør-kør</Kbd> for at se uden at gemme).</li>
          <li style={liStyle}>Topscorer afgøres <em>manuelt</em> i <Kbd>Bonus-facit</Kbd>, når den er kendt (kan ikke udledes af resultaterne alene).</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🔁 Efter gruppespillet</h2>
        <ol style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li style={liStyle}>Når 1/16-lodtrækningen er kendt og holdene er sat på knockout-kampene: tryk <Kbd>{"🔗 Map kamp-id'er"}</Kbd> igen, så de nye kampe kobles til football-data.org.</li>
          <li style={liStyle}>Tryk <Kbd>Byg knockout</Kbd> for at fylde bracketten ud fra grupperesultaterne.</li>
        </ol>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🧪 Tjek før go-live</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li style={liStyle}>Tryk <Kbd>⚽ Synk nu</Kbd> under Auto-resultater for at hente resultater med det samme (ellers kører synken selv hvert minut).</li>
          <li style={liStyle}>Efter den første afsluttede kamp: bekræft at resultatet står som «Afsluttet», og at leaderboardet har opdateret point.</li>
        </ul>
      </section>

      <section style={{ ...sectionStyle, marginBottom: 0 }}>
        <h2 style={h2Style}>🚑 Hvis automatikken er gul/rød</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li style={liStyle}><strong>Gul (forsinket):</strong> vent et par minutter — er den stadig gul, er den planlagte funktion sandsynligvis stoppet.</li>
          <li style={liStyle}><strong>Rød (fejl):</strong> teksten viser fejlen. Typisk årsag: <Kbd>FOOTBALL_DATA_TOKEN</Kbd> mangler/udløbet i Secret Manager (projekt <Kbd>vm2026-tip</Kbd>), eller football-data.org har nedetid.</li>
          <li style={liStyle}>Imens kan du altid rette resultater manuelt — point beregnes med det samme.</li>
        </ul>
      </section>
    </div>
  );
}
