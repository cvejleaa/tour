/**
 * Indbyrdes — sæsonens opgør mellem MIG og én anden spiller.
 *
 * HVOR DEN BOR OG HVORFOR: inde i SpillerDetalje, altså det panel, der allerede
 * åbner, når man klikker på et navn i Stilling. Ikke en tiende fane — der er ni
 * i forvejen, og de brydes allerede til to rækker på smalle skærme. Og ikke en
 * stående tavle: den, der er 3-5 nede siden oktober, skal ikke have et
 * permanent opslag om et privat nederlag. Et panel, man selv folder ud om en
 * ven, man selv valgte, er et opslag — ikke en væg med skam.
 *
 * DATA: `players/{uid}/detalje/opdeling` for BEGGE parter — to
 * dokumentlæsninger, ingen forespørgsel. Vejen er valgt, fordi reglen på `bets`
 * slår kampens kickoff op PR. DOKUMENT, og Firestore kun tillader 10 sådanne
 * opslag i én forespørgsel: en sæsonlang bets-query ville blive afvist HELT og
 * vise en tom side uden fejlbesked (firestore.rules:741-744 siger det selv).
 *
 * Begge sider hentes fra SAMME kilde med vilje. Blandede man sit eget levende
 * tipssæt ind for den ene part, ville den side også rumme kampe uden facit, og
 * uenigheds-tællingen ville være skæv i ens egen favør.
 */
import { useMemo, useState } from 'react';
import { bygIndbyrdes, indbyrdesLinje, udenForLinje } from './h2h';
import { useSpillerOpdeling } from './useSpillerOpdeling';
import { visOf } from './teamInfo';
import { fmtSignedPoints } from '../../../lib/daNum';

/** Ét resultat som 1/X/2 med et mærke for, hvem der ramte. */
function Valg({ pick, ret }) {
  return (
    <span
      className={`badge ${ret ? 'badge--green' : 'badge--muted'}`}
      style={{ fontWeight: 700, minWidth: '1.6rem', display: 'inline-block', textAlign: 'center' }}
      title={ret ? 'Ramte' : 'Ramte ikke'}
    >
      {pick}
    </span>
  );
}

/**
 * @param {{game:object, rounds:Array, minUid:string, dueUid:string,
 *          dueNavn:string, teams?:object}} props
 *   `rounds` er ALLEREDE gate't til SPILLETS startrunde af kalderen — gaten
 *   hører ét sted, og det er ikke her. Spillets, ikke ligaens: se h2h.js.
 */
export default function Indbyrdes({ game, rounds, minUid, dueUid, dueNavn, teams = null }) {
  const [aaben, setAaben] = useState(false);
  // Hentes først, når nogen folder ud: to læsninger skal ikke betales af alle,
  // der bare kigger på en spillers runder.
  const mine = useSpillerOpdeling(aaben ? game?.id : null, minUid);
  const deres = useSpillerOpdeling(aaben ? game?.id : null, dueUid);

  const r = useMemo(
    () => bygIndbyrdes({ rounds, mine: mine.kampe || {}, deres: deres.kampe || {} }),
    [rounds, mine.kampe, deres.kampe],
  );

  // Sig ikke "opgør mod dig selv". Panelet kan åbnes på ens eget navn.
  if (!minUid || !dueUid || minUid === dueUid) return null;

  const laeser = mine.loading || deres.loading;
  const fejl = mine.error || deres.error;

  return (
    <div style={{ marginTop: '0.8rem', borderTop: '1px solid var(--c-line)', paddingTop: '0.6rem' }}>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => setAaben((v) => !v)}
        aria-expanded={aaben}
      >
        {aaben ? '▾' : '▸'} ⚔️ Jer to imellem
      </button>

      {aaben && laeser && <div className="spinner" role="status" aria-label="Indlæser" />}

      {/* En afvist læsning er den forventede fejl — sig hvad der skete i stedet
          for at vise en tom liste. Samme valg som resten af panelet. */}
      {aaben && fejl && (
        <p className="badge badge--red" style={{ marginTop: '0.5rem' }}>{fejl}</p>
      )}

      {aaben && !laeser && !fejl && (
        <div style={{ marginTop: '0.5rem' }}>
          <p style={{ margin: '0 0 0.4rem', fontWeight: 600 }}>
            {indbyrdesLinje(r, dueNavn)}
          </p>

          {/* Enigheden er ÉT tal og ikke en liste: de kampe, hvor I tippede
              ens, siger intet om jer to — I stod side om side. */}
          {r.afgjorteSammen > 0 && (
            <p style={{ color: 'var(--c-muted)', margin: '0 0 0.6rem', fontSize: '0.9rem' }}>
              I var enige om {r.enige} af {r.afgjorteSammen} afgjorte kampe, I begge tippede.
              {r.ingen > 0 && ` I ${r.ingen} af uenighederne tog I begge fejl.`}
            </p>
          )}

          {r.uenige.length === 0 ? (
            <p style={{ color: 'var(--c-muted)', margin: 0 }}>
              {r.afgjorteSammen === 0
                ? 'I har endnu ikke tippet nogen af de samme afgjorte kampe.'
                : 'I har tippet ens hver gang indtil videre.'}
            </p>
          ) : (
            <div className="table-wrap">
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Runde</th>
                    <th style={{ textAlign: 'left' }}>Kamp</th>
                    <th>Dig</th>
                    <th>{dueNavn}</th>
                    <th style={{ textAlign: 'right' }}>Point</th>
                  </tr>
                </thead>
                <tbody>
                  {r.uenige.map((u) => (
                    <tr key={u.id}>
                      <td>{u.round}</td>
                      <td>{visOf(teams, u.home)}–{visOf(teams, u.away)}</td>
                      {/* data-side binder kolonnen til PARTEN, ikke til
                          rækkefølgen. Uden det kunne de to kolonner byttes om,
                          uden at en test blev rød — og en spiller ville se sit
                          eget resultat stå som modstanderens. */}
                      <td data-side="mig" style={{ textAlign: 'center' }}><Valg pick={u.minPick} ret={u.minRet} /></td>
                      <td data-side="dem" style={{ textAlign: 'center' }}><Valg pick={u.deresPick} ret={u.deresRet} /></td>
                      {/* Begge tal, så forskellen kan ses — ikke kun et delta,
                          der skjuler, hvem der fik hvad. */}
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span data-side="mig">{fmtSignedPoints(u.minPoint)}</span>
                        {' / '}
                        <span data-side="dem">{fmtSignedPoints(u.deresPoint)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Kampe, kun den ene tippede, er ikke et opgør — men de skal ikke
              forsvinde tavst, ellers ser regnestykket forkert ud. Sætningen
              bygges i h2h, så begge sider kan bevises hver for sig: skrevet
              direkte her gav kunMig=0 en halv sætning uden udsagnsord. */}
          {udenForLinje(r, dueNavn) && (
            <p style={{ color: 'var(--c-muted)', margin: '0.6rem 0 0', fontSize: '0.85rem' }}>
              {udenForLinje(r, dueNavn)}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
