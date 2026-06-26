// Klar, fast definition af "🎯 Skarpskytten" — vises på Stilling-siden og holdes
// på linje med opslaget VM-Botten slår op på væggene.
import { fmtPenalty } from './sharpFormat';

/**
 * @param {object} props
 * @param {number} props.penalty  straf for utippet kamp (positivt tal, fx 2)
 * @param {boolean} [props.compact]  mindre variant
 */
export default function SharpshooterInfo({ penalty = 2, compact = false }) {
  return (
    <div
      className="card card--flat"
      style={{ background: 'var(--c-surface-2, #f7f7f7)', fontSize: compact ? '0.82rem' : '0.88rem', lineHeight: 1.55, marginBottom: '0.9rem' }}
    >
      <h3 style={{ margin: '0 0 0.4rem', fontSize: compact ? '0.95rem' : '1.05rem', color: 'var(--c-pitch)' }}>
        🎯 Sådan virker Skarpskytten
      </h3>
      <p style={{ margin: '0 0 0.5rem' }}>
        Skarpskytten belønner dig for at ramme <strong>antal mål for hvert hold</strong> i hver
        afsluttet kamp — ikke kun hvem der vinder.
      </p>
      <ul style={{ margin: 0, paddingLeft: '1.2rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        <li><strong>Rigtigt antal mål</strong> for et hold: <strong>+(antal + 1)</strong> point (rammer du fx 3 mål = +4). Rigtigt <strong>0</strong> = +1.</li>
        <li><strong>Forkert antal:</strong> minus forskellen — men <strong>højst −2 pr. hold</strong>, så en enkelt vild kamp ikke ødelægger alt.</li>
        <li><strong>+1 bonus</strong> hvis du rammer kampens <strong>udfald</strong> (hjemmesejr, uafgjort eller udesejr).</li>
        <li><strong>Ikke tippet</strong> en kamp: <strong>{fmtPenalty(penalty)}</strong> point.</li>
      </ul>
      <p style={{ margin: '0.5rem 0 0', color: 'var(--c-muted)' }}>
        Point lægges sammen over <strong>alle afsluttede kampe</strong>. Hvert hold tæller for sig.
      </p>
    </div>
  );
}
