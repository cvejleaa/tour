/**
 * GameLeagueMembersTab (kun platform) — meld spillere ind i og ud af et spils
 * private ligaer.
 *
 * HVORFOR DEN FINDES. `LeaguesAdminTab` kunne det samme, men kun for Tour: den
 * læser top-niveau `leagues`, og fanen er skjult på platformen. Da ligaerne
 * flyttede ind under spillene, blev den en læser af en afløst datamodel, og
 * ingen dispositionerede den. Denne fane er den spil-scopede afløser; den
 * gamle røres ikke, for den virker for Tour.
 *
 * BEGGE VEJE GÅR GENNEM SERVEREN. firestore.rules tillader hverken en admin at
 * LÆSE en liga, han ikke selv er medlem af, eller nogen at ændre `memberUids`
 * ud over "fjern præcis mig selv". Reglerne er ikke åbnet — det er dem, der
 * forhindrer et medlem i at skrive en ny medlemsliste og lukke fremmede ind.
 * Fanens egen gate er derfor kosmetik; autoriteten er vagten i callable'en.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useGames } from '../games/useGames';
import { callHentLigaMedlemmer, callSaetLigaMedlem } from './adminActions';

export default function GameLeagueMembersTab() {
  const { games, loading } = useGames();
  const spil = useMemo(() => (games || []), [games]);

  const [gameId, setGameId] = useState('');
  useEffect(() => {
    if (spil.length && !spil.some((g) => g.id === gameId)) setGameId(spil[0].id);
  }, [spil, gameId]);

  const [data, setData] = useState(null);
  const [henter, setHenter] = useState(false);
  const [fejl, setFejl] = useState('');
  const [besked, setBesked] = useState(null); // { kind, text }
  const [busy, setBusy] = useState('');
  const [valg, setValg] = useState({}); // { [leagueId]: uid }

  const hent = useCallback(async (id) => {
    if (!id) return;
    setHenter(true);
    setFejl('');
    const r = await callHentLigaMedlemmer(id);
    if (r.ok) setData(r.data);
    else { setData(null); setFejl(r.error); }
    setHenter(false);
  }, []);

  // Hentes ved spilskift. Ligaerne er få, og listen SKAL være frisk: den viser,
  // hvem der kan se hvis tips.
  useEffect(() => { hent(gameId); }, [gameId, hent]);

  const navnFor = (uid) => data?.deltagere?.find((d) => d.uid === uid)?.navn || uid;

  async function saet(leagueId, maalUid, medlem, ligaNavn) {
    setBusy(`${leagueId}:${maalUid}`);
    setBesked(null);
    const r = await callSaetLigaMedlem({ gameId, leagueId, maalUid, medlem });
    if (!r.ok) setBesked({ kind: 'err', text: r.error });
    else {
      setBesked({
        kind: 'ok',
        text: r.data?.aendret
          ? `${navnFor(maalUid)} er ${medlem ? 'meldt ind i' : 'meldt ud af'} ${ligaNavn}.`
          : `${navnFor(maalUid)} var allerede ${medlem ? 'medlem' : 'ude'} — intet ændret.`,
      });
      await hent(gameId);
      setValg((v) => ({ ...v, [leagueId]: '' }));
    }
    setBusy('');
  }

  if (loading) return <p style={{ color: 'var(--c-muted)' }}>Henter spil…</p>;
  if (!spil.length) return <p style={{ color: 'var(--c-muted)' }}>Der findes ingen spil endnu.</p>;

  return (
    <div>
      <div className="card mb-2">
        <h3 className="card__title">👥 Liga-medlemmer</h3>
        <p style={{ color: 'var(--c-muted)', margin: '0 0 0.6rem' }}>
          Meld en spiller ind i eller ud af en privat liga. Vælg først spillet.
        </p>
        <label>
          Spil{' '}
          <select aria-label="Vælg spil" value={gameId} onChange={(e) => setGameId(e.target.value)}>
            {spil.map((g) => <option key={g.id} value={g.id}>{g.name || g.id}</option>)}
          </select>
        </label>
      </div>

      {besked && (
        <p role={besked.kind === 'err' ? 'alert' : 'status'}
          className={`badge ${besked.kind === 'err' ? 'badge--red' : 'badge--green'} mb-2`}
          style={{ display: 'inline-block' }}
        >
          {besked.text}
        </p>
      )}

      {henter && <p style={{ color: 'var(--c-muted)' }}>Henter ligaer…</p>}
      {fejl && <p role="alert" style={{ color: 'var(--c-err)' }}>{fejl}</p>}

      {!henter && !fejl && data && data.ligaer.length === 0 && (
        <div className="card">
          <p style={{ margin: 0 }}>
            Der er ingen ligaer i dette spil endnu. En liga oprettes af en spiller
            selv under spillets <strong>👥 Ligaer</strong>-fane.
          </p>
        </div>
      )}

      {!henter && !fejl && data?.ligaer.map((lg) => {
        const medlemsUids = new Set(lg.medlemmer.map((m) => m.uid));
        // Kun spillets DELTAGERE tilbydes. En liga-tilmelding af en, der ikke
        // er i spillet, opretter ham — men listen skal vise det forventede.
        const kanTilfoejes = (data.deltagere || []).filter((d) => !medlemsUids.has(d.uid));
        return (
          <div className="card mb-2" key={lg.id}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', flexWrap: 'wrap' }}>
              <h4 style={{ margin: 0 }}>{lg.navn}</h4>
              <span className="badge badge--muted">
                {lg.medlemmer.length} medlem{lg.medlemmer.length === 1 ? '' : 'mer'}
              </span>
            </div>

            <ul style={{ listStyle: 'none', padding: 0, margin: '0.6rem 0 0' }}>
              {lg.medlemmer.map((m) => {
                const erEjer = m.uid === lg.ownerUid;
                return (
                  <li key={m.uid} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <span>{m.navn}</span>
                    {erEjer && <span className="badge badge--muted">ejer</span>}
                    {/* Ejeren kan ikke fjernes — en ejerløs liga er en tilstand,
                        ingen flade kan rette. Serveren afviser det også. */}
                    {!erEjer && (
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        style={{ marginLeft: 'auto' }}
                        disabled={busy === `${lg.id}:${m.uid}`}
                        onClick={() => {
                          // Konsekvenserne står i dialogen, ikke kun i planen.
                          const ok = window.confirm(
                            `Meld ${m.navn} ud af ${lg.navn}?\n\n`
                            + 'Han mister adgangen til ligaens tips og væg. '
                            + 'Er det hans eneste liga i spillet, ser han en TOM stilling '
                            + 'uden fejlbesked.\n\n'
                            + 'Hans egne opslag på ligavæggen bliver stående.\n\n'
                            + 'Det kan meldes ind igen bagefter — ingen point går tabt.',
                          );
                          if (ok) saet(lg.id, m.uid, false, lg.navn);
                        }}
                      >
                        Meld ud
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.6rem' }}>
              {kanTilfoejes.length === 0 ? (
                <span style={{ color: 'var(--c-muted)', fontSize: '0.9rem' }}>
                  {(data.deltagere || []).length === 0
                    ? 'Ingen deltagere i spillet endnu.'
                    : 'Alle spillets deltagere er allerede medlem.'}
                </span>
              ) : (
                <>
                  <select
                    aria-label={`Vælg spiller til ${lg.navn}`}
                    value={valg[lg.id] || ''}
                    onChange={(e) => setValg((v) => ({ ...v, [lg.id]: e.target.value }))}
                  >
                    <option value="">Vælg spiller…</option>
                    {kanTilfoejes.map((d) => (
                      <option key={d.uid} value={d.uid}>{d.navn}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn--sm"
                    disabled={!valg[lg.id] || busy.startsWith(`${lg.id}:`)}
                    onClick={() => {
                      const uid = valg[lg.id];
                      const navn = kanTilfoejes.find((d) => d.uid === uid)?.navn || 'spilleren';
                      // Knapteksten skal love præcis det, den gør: en
                      // tilføjelse afslører HELE tip-historikken begge veje,
                      // ikke kun fremtidige runder.
                      const ok = window.confirm(
                        `Meld ${navn} ind i ${lg.navn}?\n\n`
                        + 'Han kan så se ALLE ligaens tidligere tips — og ligaen kan se alle hans. '
                        + 'Det gælder hele spillets historik, ikke kun kommende runder.',
                      );
                      if (ok) saet(lg.id, uid, true, lg.navn);
                    }}
                  >
                    Meld ind
                  </button>
                </>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
