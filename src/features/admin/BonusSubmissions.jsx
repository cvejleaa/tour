// Admin-visning af indsendte topscorer-svar med mulighed for manuelt at
// godkende (fejlstavede) svar som korrekte. Viser også hvilke svar der allerede
// tæller (via den fleksible matchning).
import { useState } from 'react';
import { useBonusSubmissions } from './useBonusSubmissions';
import { approveBonusAnswer, removeBonusAnswer } from './adminActions';
import { bonusPoints } from '../../lib/scoring';

export default function BonusSubmissions({ question }) {
  const { submissions, loading } = useBonusSubmissions(question.id);
  const [busy, setBusy] = useState('');
  const accepted = question.acceptedAnswers ?? [];

  async function toggle(answer, isApproved) {
    setBusy(answer);
    try {
      if (isApproved) await removeBonusAnswer(question.id, answer);
      else await approveBonusAnswer(question.id, answer);
    } catch (e) {
      console.error('Kunne ikke opdatere godkendt svar:', e);
    } finally {
      setBusy('');
    }
  }

  // Tæller svaret allerede point (fuzzy mod facit eller via godkendt liste)?
  const scores = (answer) =>
    bonusPoints({ answer, facit: question.facit, type: question.type, acceptedAnswers: accepted }) > 0;

  return (
    <div style={{ marginTop: '0.75rem', background: 'var(--c-bg)', borderRadius: 8, padding: '0.6rem 0.75rem' }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--c-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>
        Indsendte svar
      </div>

      {loading && <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>Henter…</div>}
      {!loading && submissions.length === 0 && (
        <div style={{ fontSize: '0.82rem', color: 'var(--c-muted)' }}>Ingen svar indsendt endnu.</div>
      )}

      {submissions.map(({ answer, count }) => {
        const ok = scores(answer);
        const manuallyApproved = accepted.includes(answer);
        return (
          <div key={answer} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0', flexWrap: 'wrap' }}>
            <span style={{ minWidth: 28, textAlign: 'center' }} className="badge badge--muted">{count}×</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{answer}</span>
            {ok ? (
              <span className="badge badge--green">✓ Tæller</span>
            ) : (
              <span className="badge badge--muted">Tæller ikke</span>
            )}
            {question.facit && (
              manuallyApproved ? (
                <button className="btn btn--ghost btn--sm" disabled={busy === answer} onClick={() => toggle(answer, true)}>
                  Fjern godkendelse
                </button>
              ) : (
                !ok && (
                  <button className="btn btn--sm" disabled={busy === answer} onClick={() => toggle(answer, false)}>
                    Godkend som korrekt
                  </button>
                )
              )
            )}
          </div>
        );
      })}

      {accepted.length > 0 && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.78rem', color: 'var(--c-muted)' }}>
          Manuelt godkendte svar: {accepted.join(', ')}
        </div>
      )}
      {!question.facit && submissions.length > 0 && (
        <div style={{ marginTop: '0.4rem', fontSize: '0.78rem', color: 'var(--c-warn)' }}>
          Sæt facit først – så markeres automatisk de svar der tæller (inkl. små stavefejl).
        </div>
      )}
    </div>
  );
}
