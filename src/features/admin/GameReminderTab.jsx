/**
 * GameReminderTab (kun platform) — per-spil tip-påmindelser. Vælg FØRST spillet,
 * send så en testmail til dig selv, eller udløs den rigtige udsendelse nu til
 * alle deltagere der mangler at tippe på kampe det næste døgn. Der kører også et
 * automatisk dagligt job kl. 09.00 for aktive fodbold-spil.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGames } from '../games/useGames';
import { callSendGameTipRemindersNow, callSendGameTestReminderToMe } from './adminActions';

export default function GameReminderTab() {
  const { games, loading } = useGames();
  // Kun spil med et kampprogram (fodbold-spil) kan have tip-påmindelser.
  const eligible = useMemo(
    () => (games || []).filter((g) => g.type === 'football' && g.status !== 'finished'),
    [games],
  );

  const [gameId, setGameId] = useState('');
  useEffect(() => {
    if (eligible.length && !eligible.some((g) => g.id === gameId)) setGameId(eligible[0].id);
  }, [eligible, gameId]);

  const [busy, setBusy] = useState(null); // 'test' | 'now' | null
  const [msg, setMsg] = useState(null);   // { kind, text }

  async function sendTest() {
    setBusy('test'); setMsg(null);
    const res = await callSendGameTestReminderToMe(gameId);
    setMsg(res.ok
      ? { kind: 'ok', text: `Testmail sendt til dig (${res.data?.matches ?? '?'} kommende kampe).` }
      : { kind: 'err', text: res.error });
    setBusy(null);
  }
  async function sendNow() {
    if (!window.confirm('Send de rigtige påmindelser nu til alle med manglende tips i dette spil?')) return;
    setBusy('now'); setMsg(null);
    const res = await callSendGameTipRemindersNow(gameId);
    if (res.ok) {
      const d = res.data || {};
      setMsg({ kind: 'ok', text: d.reason
        ? `Sendte 0 — ${d.reason === 'no-matches' ? 'ingen kampe inden for det næste døgn.' : d.reason}`
        : `Sendte ${d.sent} påmindelse${d.sent === 1 ? '' : 'r'} (${d.upcoming} kommende kampe).` });
    } else setMsg({ kind: 'err', text: res.error });
    setBusy(null);
  }

  if (loading) return <div className="spinner" role="status" aria-label="Indlæser" />;

  return (
    <div>
      <h3 style={{ marginTop: 0 }}>🔔 Tip-påmindelser</h3>

      <div className="form-group" style={{ maxWidth: 340 }}>
        <label className="form-label" htmlFor="reminder-game">Spil</label>
        {eligible.length === 0 ? (
          <p style={{ color: 'var(--c-muted)' }}>Ingen aktive fodbold-spil.</p>
        ) : (
          <select id="reminder-game" className="select" value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {eligible.map((g) => <option key={g.id} value={g.id}>{g.emoji ? `${g.emoji} ` : ''}{g.name}</option>)}
          </select>
        )}
      </div>

      <p style={{ color: 'var(--c-muted)' }}>
        Deltagere får automatisk en mail <strong>kl. 09.00</strong>, hvis de mangler at tippe på kampe
        inden for det næste døgn. <strong>Send testmail</strong> går kun til dig; <strong>Send nu</strong> kører
        den rigtige udsendelse til alle med manglende tips i det valgte spil.
      </p>

      {msg && (
        <p className={`badge ${msg.kind === 'ok' ? 'badge--green' : 'badge--red'} mb-2`} style={{ display: 'block' }}>
          {msg.text}
        </p>
      )}

      <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
        <button className="btn btn--ghost" disabled={!gameId || busy} onClick={sendTest}>
          {busy === 'test' ? 'Sender…' : '🧪 Send testmail til mig'}
        </button>
        <button className="btn" disabled={!gameId || busy} onClick={sendNow}>
          {busy === 'now' ? 'Sender…' : 'Send påmindelser nu'}
        </button>
      </div>
    </div>
  );
}
