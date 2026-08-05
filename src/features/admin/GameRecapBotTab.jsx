/**
 * GameRecapBotTab (kun platform) — alt om Runde-Botten ét sted.
 *
 * Botten skriver et opslag på hver ligavæg, når rundens kupon er afgjort. Den
 * lå før nede under Påmindelser, fordi begge dele er "noget serveren sender af
 * sig selv" — men det er en teknisk lighed, ikke den, man leder efter. En
 * påmindelse tikker ind til dig; botten skriver på en væg. Se CLAUDE.md 0b.
 */
import { useEffect, useMemo, useState } from 'react';
import { useGames } from '../games/useGames';
import { callGenerateGameRecapNow, callRetGamleRundeOpslag } from './adminActions';
import { GAME_STATUS } from '../../lib/constants';

export default function GameRecapBotTab() {
  const { games, loading } = useGames();
  const eligible = useMemo(
    () => (games || []).filter((g) => g.type === 'football' && g.status !== GAME_STATUS.FINISHED),
    [games],
  );
  const [gameId, setGameId] = useState('');
  useEffect(() => {
    if (eligible.length && !eligible.some((g) => g.id === gameId)) setGameId(eligible[0].id);
  }, [eligible, gameId]);

  const [busy, setBusy] = useState(null); // 'bot-preview' | 'bot-post' | 'ret-preview' | 'ret-skriv'
  const [botMsg, setBotMsg] = useState(null);   // { kind, text }
  const [preview, setPreview] = useState(null); // { round, text }

  const [rettelser, setRettelser] = useState(null);

  // Et udkast hører til ét spil. Skifter man spil i vælgeren uden at rydde det,
  // står forhåndsvisningen for spil A tilbage, mens knappen nu skriver i spil B.
  useEffect(() => { setPreview(null); setRettelser(null); setBotMsg(null); }, [gameId]);

  async function retOpslag(dryRun) {
    if (!dryRun && !window.confirm('Erstat de gamle opslag på liga-væggene? Spillerne har allerede læst dem.')) return;
    setBusy(dryRun ? 'ret-preview' : 'ret-skriv'); setBotMsg(null);
    const res = await callRetGamleRundeOpslag({ gameId, dryRun });
    if (!res.ok) setBotMsg({ kind: 'err', text: res.error });
    else if (res.data?.reason === 'ingen-gamle-opslag') {
      setRettelser(null);
      setBotMsg({ kind: 'ok', text: 'Ingen gamle opslag tilbage — alt på væggene er postet efter rettelsen.' });
    } else if (dryRun) {
      setRettelser(res.data);
      setBotMsg({ kind: 'ok', text: `${res.data.udkast?.length ?? 0} gamle opslag fundet — intet er skrevet endnu.` });
    } else {
      setRettelser(null);
      setBotMsg({ kind: 'ok', text: `Erstattede ${res.data.rettede} opslag. Den oprindelige tekst er gemt på hver besked.` });
    }
    setBusy(null);
  }

  async function runBot(dryRun) {
    if (!dryRun && !window.confirm('Post runde-opslaget på ALLE liga-vægge i spillet nu?')) return;
    setBusy(dryRun ? 'bot-preview' : 'bot-post'); setBotMsg(null);
    if (dryRun) setPreview(null);
    const res = await callGenerateGameRecapNow({ gameId, dryRun });
    if (!res.ok) {
      setBotMsg({ kind: 'err', text: res.error });
    } else if (res.data?.udkast?.length && res.data?.dryRun) {
      // ÉT udkast pr. liga. Botten bygger nu opslaget af den enkelte ligas
      // medlemmer, så der findes ikke længere én tekst for hele spillet.
      setPreview({ round: res.data.round, udkast: res.data.udkast });
      setBotMsg({ kind: 'ok', text: `Forhåndsvisning klar for ${res.data.udkast.length} liga${res.data.udkast.length === 1 ? '' : 'er'} — intet er postet.` });
    } else if (res.data?.posted > 0) {
      setPreview(null);
      setBotMsg({ kind: 'ok', text: `Postet på ${res.data.posted} liga-væg${res.data.posted === 1 ? '' : 'ge'} (runde ${res.data.round}).` });
    } else {
      const why = {
        'no-settled-round': 'Ingen runde er helt afgjort endnu.',
        'round-not-settled': 'Runden er ikke helt afgjort endnu.',
        already: `Runde ${res.data?.round} har allerede fået sit opslag.`,
        'too-few-players': 'For få deltagere i spillet.',
        disabled: 'Botten er slået fra for dette spil.',
        'empty-text': 'AI-teksten kom tom tilbage — prøv igen.',
      }[res.data?.reason] || `Intet postet (${res.data?.reason || 'ukendt årsag'}).`;
      setBotMsg({ kind: 'err', text: why });
    }
    setBusy(null);
  }

  if (loading) return <div className="card">Henter spil…</div>;
  if (!eligible.length) return <div className="card">Ingen aktive fodbold-spil.</div>;

  return (
    <div className="card">
      <div className="form-group" style={{ maxWidth: 340 }}>
        <label className="label" htmlFor="bot-game">Spil</label>
        <select
          id="bot-game"
          className="input"
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
        >
          {eligible.map((g) => <option key={g.id} value={g.id}>{g.name || g.id}</option>)}
        </select>
      </div>

      <div>
        <h3 style={{ marginTop: 0 }}>🤖 Runde-Botten</h3>
        <p style={{ color: 'var(--c-muted)' }}>
          Poster automatisk et AI-opslag på spillets liga-vægge, når <strong>sidste kamp i en
          runde</strong> er afregnet: rundens resultater, stillingen og en kærlig stikpille til
          rundens bedste. <strong>Forhåndsvis</strong> genererer teksten uden at poste;
          <strong> Post nu</strong> lægger den på alle liga-vægge (kun én gang pr. runde).
        </p>

        {botMsg && (
          <p className={`badge ${botMsg.kind === 'ok' ? 'badge--green' : 'badge--red'} mb-2`} style={{ display: 'block' }}>
            {botMsg.text}
          </p>
        )}
        {preview && preview.udkast.map((u) => (
          <div className="card mb-2" style={{ padding: '0.75rem 1rem' }} key={u.leagueId}>
            <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)', marginBottom: 4 }}>
              🤖 Runde-Botten · runde {preview.round} · <strong>{u.navn}</strong> ({u.medlemmer} medlemmer)
            </div>
            <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem', lineHeight: 1.5 }}>{u.text}</div>
          </div>
        ))}

        <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
          <button className="btn btn--ghost" disabled={!gameId || busy} onClick={() => runBot(true)}>
            {busy === 'bot-preview' ? 'Genererer…' : '🧪 Forhåndsvis runde-opslag'}
          </button>
          <button className="btn" disabled={!gameId || busy} onClick={() => runBot(false)}>
            {busy === 'bot-post' ? 'Poster…' : 'Post runde-opslag nu'}
          </button>
        </div>

        {/* De opslag, der ALLEREDE står på væggene, blev bygget af hele spillets
            spillere. De kan ikke genskrives troværdigt to dage efter — point og
            optakt ville blive nye tal på et gammelt opslag — så de erstattes af
            én fast tekst, der siger hvad der gik galt. */}
        <div style={{ borderTop: '1px dashed var(--c-border)', marginTop: '1rem', paddingTop: '0.8rem' }}>
          <p style={{ color: 'var(--c-muted)', fontSize: '0.86rem', marginTop: 0 }}>
            <strong>Ret gamle opslag.</strong> De første opslag nævnte spillere fra andre ligaer,
            fordi botten byggede dem af hele spillets felt. De erstattes af en fast rettelsestekst
            — ikke af et nyt runde-referat, for stillingen har flyttet sig siden. Den oprindelige
            tekst gemmes på beskeden, så det kan rulles tilbage.
          </p>
          {rettelser && (
            <div className="card mb-2" style={{ padding: '0.75rem 1rem' }}>
              {rettelser.udkast.map((u) => (
                <div key={u.messageId} style={{ marginBottom: '0.9rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                    <strong>{u.navn || u.leagueId || '—'}</strong>
                  </div>
                  <details style={{ marginTop: 4 }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>Vis det gamle opslag</summary>
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.86rem', opacity: 0.7, marginTop: 4 }}>
                      {u.gammelTekst}
                    </div>
                  </details>
                  <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem', lineHeight: 1.5, marginTop: 6 }}>
                    {u.nyTekst}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
            <button className="btn btn--ghost" disabled={!gameId || busy} onClick={() => retOpslag(true)}>
              {busy === 'ret-preview' ? 'Henter…' : '🧪 Forhåndsvis rettelse af gamle opslag'}
            </button>
            <button
              className="btn"
              disabled={!gameId || busy || !rettelser?.udkast?.length}
              onClick={() => retOpslag(false)}
            >
              {busy === 'ret-skriv' ? 'Erstatter…' : '✍️ Erstat de gamle opslag'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
