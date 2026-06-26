/**
 * MessagesPage — private 1:1-beskeder mellem brugere.
 *  - Liste over igangværende samtaler (nyeste øverst)
 *  - Start en ny samtale ved at vælge en spiller
 *  - Trådvisning med beskeder + skrivefelt
 */
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useStandings } from '../features/leaderboard/useStandings';
import { useLeagues } from '../features/leagues/useLeagues';
import { buildContactLeagues } from '../features/comments/contactLeagues';
import { useMyMessages, groupConversations } from '../features/comments/useMessages';
import { sendMessage, deleteMessage } from '../features/comments/commentActions';
import { formatTimestamp } from '../features/comments/formatTimestamp';
import { markConversationSeen } from '../features/comments/dmRead';
import EmojiPicker from '../features/comments/EmojiPicker';
import Avatar from '../components/Avatar';

// ── Trådvisning ───────────────────────────────────────────────────────────────
// Beskederne kommer fra forælderens samlede abonnement (useMyMessages) og
// filtreres til denne samtale — det undgår en separat query, som ellers ville
// blive afvist af sikkerhedsreglerne (de tillader læsning via participants).
function Thread({ meUid, otherUid, nameOf, otherUser, messages, loading, leagueId }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await sendMessage({ from: meUid, to: otherUid, text, leagueId });
      setText('');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3 className="card__title mb-2" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Avatar uid={otherUid} name={nameOf(otherUid)} emoji={otherUser?.avatarEmoji} favoriteTeam={otherUser?.favoriteTeam} size={28} />
        Samtale med {nameOf(otherUid)}
      </h3>

      {loading ? (
        <div className="spinner" role="status" aria-label="Indlæser" />
      ) : messages.length === 0 ? (
        <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>
          Ingen beskeder endnu. Skriv den første nedenfor.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 420, overflowY: 'auto' }}>
          {messages.map((m) => {
            const mine = m.from === meUid;
            return (
              <li
                key={m.id}
                data-testid="dm-message"
                style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}
              >
                <div
                  style={{
                    maxWidth: '80%',
                    background: mine ? 'var(--c-pitch)' : 'var(--c-surface-2, #f0f0f0)',
                    color: mine ? '#fff' : 'inherit',
                    borderRadius: 12,
                    padding: '0.45rem 0.7rem',
                  }}
                >
                  <div style={{ fontSize: '0.92rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.text}</div>
                  <div style={{ fontSize: '0.68rem', opacity: 0.75, marginTop: '0.15rem', display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', alignItems: 'center' }}>
                    {formatTimestamp(m.createdAt)}
                    {mine && (
                      <button
                        title="Slet besked"
                        aria-label="Slet besked"
                        onClick={() => deleteMessage(m.id).catch((e) => alert(e.message))}
                        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, opacity: 0.8 }}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {leagueId ? (
        <form onSubmit={handleSend} style={{ marginTop: '0.75rem' }}>
          <textarea
            className="input"
            rows={2}
            placeholder={`Skriv til ${nameOf(otherUid)}…`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            aria-label="Ny privat besked"
            style={{ resize: 'vertical' }}
          />
          {error && <p className="form-error mt-1">{error}</p>}
          <div className="flex gap-1 mt-1" style={{ alignItems: 'center' }}>
            <EmojiPicker onSelect={(e) => setText((t) => t + e)} />
            <button className="btn btn--sm" type="submit" disabled={busy || !text.trim()}>
              {busy ? 'Sender…' : 'Send'}
            </button>
          </div>
        </form>
      ) : (
        <p style={{ marginTop: '0.75rem', color: 'var(--c-muted)', fontSize: '0.85rem' }}>
          I deler ikke længere en liga, så du kan ikke skrive nye beskeder her.
        </p>
      )}
    </div>
  );
}

// ── Hoved-komponent ───────────────────────────────────────────────────────────
export default function MessagesPage() {
  const { user } = useAuth();
  const meUid = user?.uid;
  const { standings } = useStandings();
  const { leagues } = useLeagues(meUid);
  const { messages, loading } = useMyMessages(meUid);
  const [activeUid, setActiveUid] = useState(null);
  const [pick, setPick] = useState('');

  // Hvem deler man en liga med? (otherUid → delt liga-id). Privat-beskeder er
  // begrænset til disse — håndhæves også af Security Rules.
  const contactLeagues = useMemo(() => buildContactLeagues(leagues, meUid), [leagues, meUid]);

  const userOf = (uid) => standings.find((u) => u.uid === uid) || null;
  const nameOf = (uid) => userOf(uid)?.displayName || '(ukendt)';

  const conversations = useMemo(
    () => groupConversations(messages, meUid),
    [messages, meUid],
  );

  // Beskeder i den aktive samtale (udledt af mine beskeder)
  const threadMessages = useMemo(
    () => (activeUid ? messages.filter((m) => m.participants?.includes(activeUid)) : []),
    [messages, activeUid],
  );

  // Markér aktiv samtale som læst (når den åbnes, og når nye beskeder kommer ind)
  useEffect(() => {
    if (!activeUid) return;
    markConversationSeen(activeUid);
  }, [activeUid, threadMessages.length]);

  // Spillere man kan skrive til: kun dem man deler en liga med
  const others = standings.filter((u) => u.uid !== meUid && contactLeagues[u.uid]);

  function startConversation(uid) {
    if (!uid) return;
    setActiveUid(uid);
    setPick('');
  }

  return (
    <div>
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.4rem', fontWeight: 800 }}>✉️ Beskeder</h1>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Venstre: samtaler + ny besked */}
        <div className="card">
          <h3 className="card__title mb-2">Samtaler</h3>

          {/* Ny besked */}
          <div className="flex gap-1 mb-2" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
            <select
              className="select"
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              aria-label="Vælg modtager"
              style={{ maxWidth: 200 }}
            >
              <option value="">– Ny samtale med… –</option>
              {others.map((u) => (
                <option key={u.uid} value={u.uid}>{u.displayName || '(ukendt)'}</option>
              ))}
            </select>
            <button className="btn btn--sm" disabled={!pick} onClick={() => startConversation(pick)}>
              Start
            </button>
          </div>

          {/* Liste */}
          {loading ? (
            <div className="spinner" role="status" aria-label="Indlæser" />
          ) : conversations.length === 0 ? (
            <p style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>
              Ingen samtaler endnu. Vælg en spiller ovenfor for at starte.
            </p>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
              {conversations.map((c) => {
                const active = c.otherUid === activeUid;
                return (
                  <li key={c.otherUid}>
                    <button
                      onClick={() => setActiveUid(c.otherUid)}
                      data-testid="dm-conversation"
                      style={{
                        width: '100%', textAlign: 'left', cursor: 'pointer',
                        background: active ? 'var(--c-pitch)' : 'transparent',
                        color: active ? '#fff' : 'inherit',
                        border: '1px solid var(--c-border)', borderRadius: 8, padding: '0.45rem 0.6rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
                        <strong style={{ fontSize: '0.9rem', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                          <Avatar uid={c.otherUid} name={nameOf(c.otherUid)} emoji={userOf(c.otherUid)?.avatarEmoji} favoriteTeam={userOf(c.otherUid)?.favoriteTeam} size={22} />
                          {nameOf(c.otherUid)}
                        </strong>
                        <span style={{ fontSize: '0.68rem', opacity: 0.8 }}>{formatTimestamp(c.last?.createdAt)}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.last?.from === meUid ? 'Du: ' : ''}{c.last?.text}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Højre: aktiv tråd */}
        {activeUid ? (
          <Thread meUid={meUid} otherUid={activeUid} nameOf={nameOf} otherUser={userOf(activeUid)}
            messages={threadMessages} loading={loading} leagueId={contactLeagues[activeUid] || null} />
        ) : (
          <div className="card" style={{ color: 'var(--c-muted)' }}>
            Vælg en samtale eller start en ny for at skrive beskeder.
          </div>
        )}
      </div>
    </div>
  );
}
