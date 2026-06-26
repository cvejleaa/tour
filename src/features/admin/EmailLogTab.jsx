// Mail-log: viser de seneste udsendte mails (afsendt af Cloud Functions).
import { useEmailLog } from './useEmailLog';
import { formatTimestamp } from './adminActions';

const TYPE_LABELS = {
  reminder: 'Påmindelse',
  'test-reminder': 'Test-påmindelse',
  'password-reset': 'Kodeord-nulstilling',
  other: 'Andet',
};

export default function EmailLogTab() {
  const { entries, loading, error } = useEmailLog(150);

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>Henter mail-log…</p>;
  if (error) return <p role="alert" style={{ color: 'var(--c-err)' }}>{error}</p>;

  return (
    <div>
      <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem', marginTop: 0 }}>
        Seneste udsendte mails (påmindelser, kodeord-nulstilling m.m.). Logges automatisk når en mail sendes.
      </p>

      {entries.length === 0 ? (
        <p style={{ color: 'var(--c-muted)' }}>Ingen mails sendt endnu.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', color: 'var(--c-muted)' }}>
                <th style={{ padding: '0.35rem 0.5rem' }}>Tidspunkt</th>
                <th style={{ padding: '0.35rem 0.5rem' }}>Type</th>
                <th style={{ padding: '0.35rem 0.5rem' }}>Modtager</th>
                <th style={{ padding: '0.35rem 0.5rem' }}>Emne</th>
                <th style={{ padding: '0.35rem 0.5rem' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ borderTop: '1px solid var(--c-border)' }}>
                  <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap', color: 'var(--c-muted)' }}>
                    {formatTimestamp(e.createdAt)}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {TYPE_LABELS[e.type] ?? e.type ?? '–'}
                  </td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{e.to}</td>
                  <td style={{ padding: '0.35rem 0.5rem' }}>{e.subject}</td>
                  <td style={{ padding: '0.35rem 0.5rem', whiteSpace: 'nowrap' }}>
                    {e.status === 'sent'
                      ? <span style={{ color: 'var(--c-ok)' }}>✓ Sendt</span>
                      : <span style={{ color: 'var(--c-err)' }} title={e.error || ''}>✗ Fejl</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
