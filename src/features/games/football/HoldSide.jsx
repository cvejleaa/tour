/**
 * HoldSide — ét holds tal i DETTE spil.
 *
 * Bor på Elo-fanen bag `?hold=XXX` frem for på sin egen rute: `/spil/:gameId`
 * er et blad i App.jsx, så en rute skulle selv genskabe GameLayout,
 * fanerækken og isMember-gaten. Query-parameteren arver dem alle.
 *
 * DESIGNET FOR n=1, IKKE n=18. Premier League-spillet åbnede 21/8 med ÉN
 * spillet runde, og hvert hold havde da spillet én kamp. Tynde tal er
 * normaltilstanden hele efteråret, ikke en kant — derfor: rå optællinger,
 * aldrig en rate på ét datapunkt, grundlaget altid på skærmen, og kort der
 * SKJULES under deres gulv frem for at vise et tal, der ligner en statistik.
 */
import { useMemo } from 'react';
import { teamsOf, teamInfo, visOf, teamByShort } from './teamInfo';
import {
  holdetsKampe, holdForm, hjemmeUde, maalforskelFordeling,
  favoritTal, pointModForventning, maalModXg, FORDELING_MINIMUM,
} from './holdStatistik';
import { eloRows } from './eloHistory';
import ClubBadge from '../../../components/ClubBadge';
import { fmtDec } from '../../../lib/daNum';

const UDFALD_KLASSE = { V: 'badge badge--green', U: 'badge', T: 'badge badge--red' };

/** "12 kampe" / "1 kamp" — grundlaget skal kunne stå i en sætning. */
function kampeOrd(n) {
  return `${n} ${n === 1 ? 'kamp' : 'kampe'}`;
}

/** V-U-T som ét læsbart tal-tripel. */
function vutLinje(b) {
  return `${b.v}-${b.u}-${b.t}`;
}

function Kort({ titel, children }) {
  return (
    <div className="card mb-2">
      <h3 className="card__title">{titel}</h3>
      {children}
    </div>
  );
}

export default function HoldSide({ game, matches, short, onLuk }) {
  const teams = teamsOf(game);
  const hold = useMemo(() => teamByShort(teams, short), [teams, short]);

  // Hooks SKAL stå før ethvert tidligt retur — reglen om hook-rækkefølge
  // gælder også den tomme tilstand nedenfor. Begge tåler et manglende hold.
  const seedElo = useMemo(() => {
    const m = {};
    for (const t of teams) m[t.name] = Number(t.elo) || 0;
    return m;
  }, [teams]);
  const eloRaekke = useMemo(
    () => (hold ? eloRows(teams, game?.eloHistory).rows.find((r) => r.name === hold.name) : null),
    [teams, game?.eloHistory, hold],
  );

  // Ukendt kortkode i URL'en er en TOM TILSTAND, ikke en fejl: nogen har delt
  // et link til et hold, spillet ikke har (eller kortkoden er ændret siden).
  // Sig hvilket hold, der blev spurgt om — ellers kan modtageren ikke gætte,
  // hvad linket skulle have vist.
  if (!hold) {
    return (
      <Kort titel="Holdet findes ikke i dette spil">
        <p style={{ margin: 0 }}>
          Der er ikke noget hold med kortkoden <strong>{String(short || '').toUpperCase()}</strong>
          {' '}i {game?.name || 'dette spil'}.
        </p>
        {onLuk && (
          <button type="button" className="btn btn--sm mt-2" onClick={onLuk}>
            Tilbage til Elo-tabellen
          </button>
        )}
      </Kort>
    );
  }

  const navn = hold.name;
  const vis = visOf(teams, navn);
  const info = teamInfo(teams, navn);

  const kampe = holdetsKampe(matches, navn);
  const form = holdForm(matches, navn, 5);
  const xgTal = maalModXg(matches, navn);
  const hu = hjemmeUde(matches, navn);
  const fordeling = maalforskelFordeling(matches, navn);
  const fav = favoritTal(matches, navn);

  const forventning = pointModForventning(matches, navn, game?.eloHistory, seedElo);

  const spillede = kampe.filter((m) => m.result);
  const maalFor = hu.hjemme.maal + hu.ude.maal;
  const maalImod = hu.hjemme.imod + hu.ude.imod;

  return (
    <div>
      <div className="card mb-2">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', flexWrap: 'wrap' }}>
          <ClubBadge
            variant="troeje" code={hold.short} color={hold.color || info?.color} size={34}
            color2={info?.troejer?.hjemme?.sekundaer} moenster={info?.troejer?.hjemme?.moenster}
            title={vis}
          />
          <h3 className="card__title" style={{ margin: 0 }}>{vis}</h3>
          {onLuk && (
            <button type="button" className="btn btn--sm" style={{ marginLeft: 'auto' }} onClick={onLuk}>
              Luk
            </button>
          )}
        </div>
        {/* "I dette spil", ALDRIG "i sæsonen": Premier League-spillet er runde
            1-18 af 38, og forårets kampe bliver et andet games-dokument. */}
        <p style={{ color: 'var(--c-muted)', margin: '0.6rem 0 0' }}>
          {spillede.length === 0
            ? 'Holdet har ingen spillede kampe i dette spil endnu.'
            : `${kampeOrd(spillede.length)} spillet i dette spil.`}
          {info?.stadion ? ` Hjemmebane: ${info.stadion}.` : ''}
        </p>
      </div>

      {spillede.length > 0 && (
        <>
          <Kort titel="⚽ Form og mål">
            <p style={{ margin: '0 0 0.5rem' }}>
              {form.raekke.map((r) => (
                <span key={r.matchId} className={UDFALD_KLASSE[r.udfald]} style={{ marginRight: '0.3rem' }}>
                  {r.udfald}
                </span>
              ))}
              <span style={{ color: 'var(--c-muted)', fontSize: '0.85rem' }}>
                {' '}seneste {kampeOrd(form.raekke.length)} af {form.ialt}
              </span>
            </p>
            <p style={{ margin: 0 }}>
              Mål i alt: <strong>{maalFor}</strong> for, <strong>{maalImod}</strong> imod
              {' '}({maalFor - maalImod >= 0 ? '+' : ''}{maalFor - maalImod}).
            </p>
          </Kort>

          {/* MÅL MOD MÅLCHANCER.
              BEGGE KOLONNER OVER SAMME KAMPE — se maalModXg. Summerede vi mål
              over alt spillet og målchancer kun over dem, der har tallet,
              ville kortet vise en overpræstation, der kom af databrist.

              INGEN DOM. Ikke "overpræsterer", ikke "heldig", ingen differens
              med fortegn og farve. To rækker tal; læseren slutter selv.
              Målingen (scripts/maal-xg.mjs) viser, at xG er uenig med facit i
              13 af 37 afgjorte kampe — og modellen kommer fra to
              leverandører med mulig forskellig skala. En dom oveni to usikre
              tal er en påstand i tredje led.

              Gulv = 1 kamp, ikke FORDELING_MINIMUM. Det gulv sidder på SEJRE
              og er sat af grafiske grunde (en form kan ikke ses i to søjler);
              her er der ingen graf. Med gulv 5 ville kortet være usynligt for
              alle 20 PL-hold ved lanceringen — PL har ~1,8 spillet kamp pr.
              hold mod Superligaens ~5,3. Grundlaget står i stedet på skærmen. */}
          {xgTal && (
            <Kort titel="🎯 Mål og målchancer (xG)">
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }} aria-label="Række" />
                    <th style={{ textAlign: 'right' }}>Mål</th>
                    <th style={{ textAlign: 'right' }}>Målchancer</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Scoret</td>
                    <td style={{ textAlign: 'right' }}><strong>{xgTal.maal}</strong></td>
                    <td style={{ textAlign: 'right' }}>{fmtDec(xgTal.xg)}</td>
                  </tr>
                  <tr>
                    <td>Lukket ind</td>
                    <td style={{ textAlign: 'right' }}><strong>{xgTal.imod}</strong></td>
                    <td style={{ textAlign: 'right' }}>{fmtDec(xgTal.xgImod)}</td>
                  </tr>
                </tbody>
              </table>
              <p style={{ margin: '0.5rem 0 0', color: 'var(--c-muted)', fontSize: '0.85rem' }}>
                Begge kolonner dækker de samme {kampeOrd(xgTal.kampe)}
                {xgTal.kampe < xgTal.spillede
                  ? ` — holdet har spillet ${kampeOrd(xgTal.spillede)}, og de nyeste får målchancer, når kilden har dem.`
                  : '.'}
              </p>
            </Kort>
          )}

          <Kort titel="🏟️ Hjemme og ude">
            {/* RÅ TAL, aldrig en rate: efter én hjemmekamp ville "100 %
                hjemmesejre" ligne en statistik. "1 kamp: 1-0-0" er sandt. */}
            <p style={{ margin: '0 0 0.35rem' }}>
              <strong>Hjemme</strong> — {kampeOrd(hu.hjemme.kampe)}: {vutLinje(hu.hjemme)}
              {hu.hjemme.kampe > 0 && `, mål ${hu.hjemme.maal}-${hu.hjemme.imod}`}
            </p>
            <p style={{ margin: 0 }}>
              <strong>Ude</strong> — {kampeOrd(hu.ude.kampe)}: {vutLinje(hu.ude)}
              {hu.ude.kampe > 0 && `, mål ${hu.ude.maal}-${hu.ude.imod}`}
            </p>
            <p style={{ color: 'var(--c-muted)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              Læses som sejre-uafgjorte-nederlag.
            </p>
          </Kort>

          {fordeling.sejre > 0 && (
            <Kort titel="📊 Hvor stort vinder de?">
              {/* Gulvet står på SEJRE, ikke på kampe. En graf med to søjler
                  inviterer til at læse en form, der ikke er der. */}
              {fordeling.nokTilGraf ? (
                <div>
                  {fordeling.fordeling.map((f) => (
                    <div key={f.forskel} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                      <span style={{ minWidth: '3.5rem', fontSize: '0.85rem' }}>
                        {f.forskel} mål
                      </span>
                      <span
                        aria-hidden="true"
                        style={{
                          background: 'var(--c-accent, #2563eb)',
                          height: '0.7rem',
                          width: `${(f.antal / fordeling.sejre) * 100}%`,
                          minWidth: '0.4rem',
                          borderRadius: '2px',
                        }}
                      />
                      <span style={{ fontSize: '0.85rem', color: 'var(--c-muted)' }}>{f.antal}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0 }}>
                  {fordeling.fordeling.map((f, i) => (
                    <span key={f.forskel}>
                      {i > 0 && ', '}
                      {f.antal}× med {f.forskel} mål
                    </span>
                  ))}
                  .
                </p>
              )}
              <p style={{ color: 'var(--c-muted)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                {fordeling.nokTilGraf
                  ? `Fordelt på ${fordeling.sejre} sejre.`
                  : `${fordeling.sejre} ${fordeling.sejre === 1 ? 'sejr' : 'sejre'} — for få til en fordeling (der skal ${FORDELING_MINIMUM} til).`}
              </p>
            </Kort>
          )}

          {(fav.harBanker || fav.harDraeber) && (
            <Kort titel="🎯 Mod oddsenes favorit">
              {/* OPTÆLLINGER, aldrig gennemsnit af odds: favorit-identiteten
                  er den samme før og efter modelskiftet, odds-værdierne er
                  ikke. Kortene skjules ved nævner nul frem for at vise 0 af 0
                  — Hull City er favorit i 0 af sine 18 kampe. */}
              {fav.harBanker && (
                <p style={{ margin: '0 0 0.35rem' }}>
                  <strong>Som favorit:</strong> vandt {fav.favoritHoldt} af {fav.favoritI}.
                </p>
              )}
              {fav.harDraeber && (
                <p style={{ margin: 0 }}>
                  <strong>Som udfordrer:</strong> vandt {fav.draebte} af {fav.udfordrerI}.
                </p>
              )}
              <p style={{ color: 'var(--c-muted)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
                Favoritten er den, der havde lavest odds i kampen. Kampe uden
                entydig favorit tæller ikke med.
              </p>
            </Kort>
          )}

          <Kort titel="📐 Mod modellens forventning">
            {/* "MODELLEN", aldrig "oddsene": tallet regnes forfra med den
                nuværende model og ratingen før runden — ikke af de frosne
                odds på kampdokumentet, som bærer to forskellige modeller. */}
            <p style={{ margin: 0, fontSize: '1.05rem' }}>
              <strong>
                {forventning.forskel > 0 ? '+' : ''}{fmtDec(forventning.forskel)} point
              </strong>
              {' '}
              {forventning.forskel > 0 ? 'mere' : forventning.forskel < 0 ? 'mindre' : ''}
              {forventning.forskel === 0 ? 'præcis som modellen ventede' : ', end modellen ventede'}
              {' '}efter {kampeOrd(forventning.kampe)}.
            </p>
            <p style={{ color: 'var(--c-muted)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              Holdet har {forventning.faktiske} point; modellen ventede {fmtDec(forventning.ventede)}.
              Forventningen er regnet af holdenes styrketal før hver runde — ikke
              af de odds, kampene blev prissat med.
            </p>
          </Kort>
        </>
      )}

      {eloRaekke && (
        <Kort titel="📈 Styrketal i dette spil">
          <p style={{ margin: 0 }}>
            Nu: <strong>{eloRaekke.current}</strong> — startede på {eloRaekke.start}
            {' '}({eloRaekke.current - eloRaekke.start >= 0 ? '+' : ''}
            {eloRaekke.current - eloRaekke.start}).
          </p>
          {/* Snapshottet skrives kun, når en HEL runde er spillet, så
              historikken har huller. Rundenumrene skrives ud, så en manglende
              runde er SYNLIG frem for at blive forbundet som om den var der. */}
          {eloRaekke.cells.length > 0 && (
            <p style={{ color: 'var(--c-muted)', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              Målt efter runde {eloRaekke.cells.map((c) => c.round).join(', ')}.
              {' '}En runde uden tal er endnu ikke spillet færdig.
            </p>
          )}
        </Kort>
      )}

      <Kort titel="🗓️ Kampene i dette spil">
        {kampe.length === 0 ? (
          <p style={{ margin: 0 }}>Ingen kampe fundet.</p>
        ) : (
          <div style={{ display: 'grid', gap: '0.3rem' }}>
            {kampe.map((m) => {
              const hjemme = m.home === navn;
              const modstander = visOf(teams, hjemme ? m.away : m.home);
              const raekke = form.raekke.find((r) => r.matchId === m.id);
              return (
                <div key={m.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'baseline', fontSize: '0.9rem' }}>
                  <span style={{ color: 'var(--c-muted)', minWidth: '3.2rem' }}>R{m.round}</span>
                  <span style={{ minWidth: '1.6rem', color: 'var(--c-muted)' }}>{hjemme ? 'H' : 'U'}</span>
                  <span style={{ flex: 1 }}>{modstander}</span>
                  <span>
                    {Number.isFinite(Number(m.homeGoals)) && Number.isFinite(Number(m.awayGoals))
                      ? `${hjemme ? m.homeGoals : m.awayGoals}-${hjemme ? m.awayGoals : m.homeGoals}`
                      : m.result ? '—' : ''}
                  </span>
                  {raekke && <span className={UDFALD_KLASSE[raekke.udfald]}>{raekke.udfald}</span>}
                </div>
              );
            })}
          </div>
        )}
      </Kort>
    </div>
  );
}
