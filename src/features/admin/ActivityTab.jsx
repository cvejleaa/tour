// Admin-fane: Aktivitet — hvem bruger siden, hvor ofte, og hvad kigger de på.
// Læser presence-collection (kun admin kan læse alles) og fletter med
// brugerlisten. Perfekt til at spotte hvem der er faldet fra og skal prikkes.
import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../../firebase';
import { COL } from '../../lib/constants';
import { useUsers } from './useUsers';
import { activityRows, dayKeyCopenhagen } from '../presence/presence';
import { formatTimestamp } from '../comments/formatTimestamp';

export default function ActivityTab() {
  const { users, loading: usersLoading } = useUsers();
  const [presence, setPresence] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, COL.PRESENCE),
      (snap) => {
        setPresence(snap.docs.map((d) => ({ ...d.data(), uid: d.id })));
        setLoading(false);
      },
      (err) => {
        console.error('ActivityTab fejl:', err);
        setError('Kunne ikke hente besøgsstatistik.');
        setLoading(false);
      },
    );
    return unsub;
  }, []);

  const rows = useMemo(() => activityRows(users, presence), [users, presence]);

  const today = dayKeyCopenhagen();
  const activeToday = useMemo(
    () => presence.filter((p) => (p.days || {})[today] > 0).length,
    [presence, today],
  );
  const active24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 3600 * 1000;
    return rows.filter((r) => r.lastSeenMs >= cutoff).length;
  }, [rows]);
  const neverSeen = rows.filter((r) => !r.lastSeenMs).length;

  if (loading || usersLoading) return <p style={{ color: 'var(--c-muted)' }}>Henter besøgsstatistik…</p>;
  if (error) return <p className="badge badge--red" role="alert">{error}</p>;

  return (
    <div data-testid="activity-tab">
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.9rem' }}>
        <span className="badge badge--green">🟢 {activeToday} på besøg i dag</span>
        <span className="badge badge--blue">🕐 {active24h} inden for 24 timer</span>
        {neverSeen > 0 && <span className="badge badge--muted">💤 {neverSeen} aldrig set (siden målingen startede)</span>}
      </div>

      <p style={{ fontSize: '0.8rem', color: 'var(--c-muted)', margin: '0 0 0.75rem' }}>
        Et besøg tælles når en spiller er aktiv efter mindst 30 minutters pause.
        Målingen startede da denne funktion blev sat i drift — historik før da findes ikke.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table className="table" style={{ width: '100%', fontSize: '0.86rem' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Spiller</th>
              <th style={{ textAlign: 'left' }}>Sidst set</th>
              <th style={{ textAlign: 'right' }} title="Antal besøg i alt">Besøg</th>
              <th style={{ textAlign: 'right' }} title="Antal forskellige dage med besøg">Dage</th>
              <th style={{ textAlign: 'left' }}>Mest brugte sider</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} data-testid="activity-row">
                <td style={{ fontWeight: 600 }}>{r.name}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {r.lastSeenAt ? formatTimestamp(r.lastSeenAt) : <span style={{ color: 'var(--c-muted)' }}>aldrig</span>}
                </td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.visits}</td>
                <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.activeDays}</td>
                <td style={{ color: 'var(--c-muted)' }}>
                  {r.topPages.length
                    ? r.topPages.map((p) => `${p.label} (${p.count})`).join(' · ')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
