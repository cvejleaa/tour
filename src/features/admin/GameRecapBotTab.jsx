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
import { formatKickoff } from '../../lib/daDate';
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
  // Ret-panelet har sin EGEN besked. Delte de to paneler én, dukkede svaret på
  // et klik nederst op langt oppe i fanen — måske uden for skærmen.
  const [retMsg, setRetMsg] = useState(null);

  // Et udkast hører til ét spil. Skifter man spil i vælgeren uden at rydde det,
  // står forhåndsvisningen for spil A tilbage, mens knappen nu skriver i spil B.
  useEffect(() => {
    setPreview(null); setRettelser(null); setBotMsg(null); setRetMsg(null);
  }, [gameId]);

  async function retOpslag(dryRun) {
    if (!dryRun && !window.confirm('Tag de gamle opslag ned på liga-væggene og erstat dem? Spillerne har allerede læst dem.')) return;
    setBusy(dryRun ? 'ret-preview' : 'ret-skriv'); setRetMsg(null);
    const res = await callRetGamleRundeOpslag({ gameId, dryRun });
    if (!res.ok) setRetMsg({ kind: 'err', text: res.error });
    else if (res.data?.reason === 'ingen-gamle-opslag') {
      setRettelser(null);
      setRetMsg({ kind: 'ok', text: 'Ingen gamle opslag tilbage — alt på væggene er postet efter rettelsen.' });
    } else if (dryRun) {
      setRettelser(res.data);
      const n = res.data.udkast?.length ?? 0;
      const rammes = res.data.udkast?.filter((u) => u.nyTekst).length ?? 0;
      setRetMsg({ kind: 'ok', text: `${n} opslag fundet, ${rammes} bliver erstattet — intet er skrevet endnu. Kontrollér antal og tidspunkter, før du skriver.` });
    } else {
      setRettelser(null);
      setRetMsg({ kind: 'ok', text: `Erstattede ${res.data.rettede} opslag. Den oprindelige tekst er gemt i oprindeligTekst på hver besked.` });
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
    } else if (res.data?.dryRun && !res.data?.reason) {
      // Runden er fin, men ingen liga gav en tekst: enten har ingen liga to
      // deltagere, eller også kom AI-teksten tom tilbage for dem alle. Uden
      // denne gren lander en tør-kørsel, der aldrig skulle poste noget, på
      // "ukendt årsag" — og det var netop den besked, der sendte mig på jagt
      // efter en fejl, der ikke fandtes.
      setBotMsg({ kind: 'err', text: 'Ingen liga gav en tekst — enten er der ingen liga med mindst to deltagere, eller AI-teksten kom tom tilbage. Prøv igen.' });
    } else {
      const why = {
        'no-settled-round': 'Ingen runde er helt afgjort endnu.',
        'round-not-settled': 'Runden er ikke helt afgjort endnu.',
        already: `Runde ${res.data?.round} har allerede fået sit opslag.`,
        'too-few-players': 'For få deltagere i spillet.',
        disabled: 'Botten er slået fra for dette spil.',
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
        <label className="form-label" htmlFor="bot-game">Spil</label>
        <select
          id="bot-game"
          className="select"
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
        <div style={{ borderTop: '1px dashed var(--c-border)', marginTop: '1.4rem', paddingTop: '0.8rem' }}>
          <h3 style={{ marginTop: 0 }}>✍️ Ret de gamle opslag</h3>
          <p style={{ color: 'var(--c-muted)', fontSize: '0.86rem', marginTop: 0 }}>
            De første opslag nævnte spillere fra andre ligaer, fordi botten byggede dem af hele
            spillets felt. De <strong>tages ned</strong> og erstattes af en fast tekst — ikke af et
            nyt runde-referat, for stillingen har flyttet sig siden. Kun opslag fra før rettelsen
            blev rullet ud rammes; <strong>læs tidspunktet på hvert enkelt</strong>, og kontrollér i
            den gamle tekst, at der faktisk står fremmede navne. Den oprindelige tekst gemmes i
            feltet <code>oprindeligTekst</code> på beskeden — der er ingen fortryd-knap, så
            gendannelse sker i Firestore-konsollen (se <code>docs/drift.md</code>).
          </p>

          {retMsg && (
            <p className={`badge ${retMsg.kind === 'ok' ? 'badge--green' : 'badge--red'} mb-2`} style={{ display: 'block' }}>
              {retMsg.text}
            </p>
          )}
          {rettelser && (
            <div className="card mb-2" style={{ padding: '0.75rem 1rem' }}>
              {rettelser.udkast.map((u) => (
                <div key={u.messageId} style={{ marginBottom: '0.9rem' }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--c-muted)' }}>
                    <strong>{u.navn || u.leagueId || '—'}</strong>
                    {u.createdAtMs != null && <> · postet {formatKickoff(u.createdAtMs)}</>}
                    {u.reason && <span className="badge badge--yellow" style={{ marginLeft: 6 }}>{u.reason}</span>}
                  </div>
                  {u.gammelTekst && (
                    <details style={{ marginTop: 4 }}>
                      <summary style={{ cursor: 'pointer', fontSize: '0.82rem' }}>Vis det gamle opslag</summary>
                      <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.86rem', opacity: 0.7, marginTop: 4 }}>
                        {u.gammelTekst}
                      </div>
                    </details>
                  )}
                  {u.nyTekst && (
                    <div style={{ whiteSpace: 'pre-wrap', fontSize: '0.92rem', lineHeight: 1.5, marginTop: 6 }}>
                      {u.nyTekst}
                    </div>
                  )}
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
              // `.some(nyTekst)` og ikke `.length`: et udkast kan være en post,
              // der netop IKKE skal røres (uden tidsstempel, uden tekst).
              disabled={!gameId || busy || !rettelser?.udkast?.some((u) => u.nyTekst)}
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
