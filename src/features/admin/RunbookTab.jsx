// Køreplan-fanen i admin-panelet — en kort, praktisk guide til Touren.
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
        <h2 style={h2Style}>🚴 1. Seed ruten (én gang)</h2>
        <p style={pStyle}>
          Inden Touren går i gang: åbn <Kbd>🚴 Tour</Kbd>-fanen og tryk <Kbd>Seed 2026-rute (21 etaper)</Kbd>.
          Det opretter alle etaperne med datoer, så spillerne kan tippe hold på dem.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>📡 2. Under etaperne (automatisk)</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li style={liStyle}>Resultater hentes automatisk fra <Kbd>letour.fr</Kbd> hvert 5. minut i tidsrummet <Kbd>kl. 17–22</Kbd> under etaperne — etapevinder, klassementer og holdresultater udfyldes selv.</li>
          <li style={liStyle}>Når en etapes facit er hentet, beregnes point automatisk for alle tip.</li>
          <li style={liStyle}>Vil du ikke vente på det næste 5-minutters-tjek, så tryk <Kbd>⬇️ Synk resultater nu</Kbd> i <Kbd>🚴 Tour</Kbd>-fanen.</li>
        </ul>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🏷️ 3. Hold udfyldes af sig selv</h2>
        <p style={pStyle}>
          Cykelholdene oprettes automatisk ud fra de hentede resultater — du skal ikke
          indtaste holdlister manuelt. De dukker op, efterhånden som etaperne afgøres.
        </p>
      </section>

      <section style={sectionStyle}>
        <h2 style={h2Style}>🎁 4. Bonus-facit</h2>
        <p style={pStyle}>
          Sæson- og klassements-bonus (fx samlet Tour-vinder, bjerg- og pointtrøje) sættes
          manuelt i <Kbd>Bonus</Kbd>-fanen, når svaret er kendt. Point for bonus beregnes,
          så snart du gemmer facit.
        </p>
      </section>

      <section style={{ ...sectionStyle, marginBottom: 0 }}>
        <h2 style={h2Style}>🚑 5. Hvis noget driller</h2>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li style={liStyle}>Mangler en etape sit resultat? Åbn <Kbd>🚴 Tour</Kbd>-fanen og tryk <Kbd>⬇️ Synk resultater nu</Kbd> for at hente med det samme.</li>
          <li style={liStyle}>Tjek beskeden i Tour-fanens synk-status — den fortæller, hvad der sidst blev hentet, og om der var en fejl.</li>
          <li style={liStyle}>Du kan altid rette point ved at synke igen, når kilden er opdateret.</li>
        </ul>
      </section>
    </div>
  );
}
