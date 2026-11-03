/**
 * 📊 Grupper — turneringens gruppetabeller (Håndbold-VM 2027).
 *
 * GATE: evnen harGrupper(game) (src/lib/grupper.js) — fanen, render-grenen i
 * GamePage, kampkortets mærke og guidens sætninger spørger alle den samme.
 *
 * HVAD TALLENE ER. Stillingen REGNES her af kampenes facit i spillet
 * (grupperOversigt → gruppeStilling, IHF's tiebreak). Den er ikke en
 * officiel tabel og kaldes ikke det: ⚽ Tabel er den officielle (synket)
 * stilling, og denne flade har ingen kildelinje at give.
 *
 * HVEM DER GÅR VIDERE, afgør IHF — via de kampe, ejeren lægger ind i næste
 * fase (QC Q1). Indtil da tegnes stregen efter vores placering, og den
 * siger «De 3 øverste går videre …» som en regel, ikke som en dom. Når
 * næste fases hold kendes (videreHold), markeres de FAKTISKE hold med ✓, og
 * stregen står kun, hvor de faktisk er de øverste. Er stillingen og de
 * indlagte hold uenige, siger ⚠️ i Spil-tidsplan det til admin.
 *
 * ORDENE. «Gruppe», aldrig ordet for semifinalist-tippet — det er en anden
 * fane med et andet spørgsmål. Nr. 4 kaldes ALDRIG «ude» (Spilfører): pulsen
 * på 🎖️-fanen siger «stadig med», indtil næste fases kampe er lagt ind, og
 * de to må ikke modsige hinanden på samme skærm.
 *
 * 🎖️ står ved de hold, spilleren selv har tippet til semifinalerne (eget
 * tip, useEgetPuljeBet — samme læsning som 🎖️-fanen). Ingen andres tip.
 */
import { useMemo } from 'react';
import { grupperOversigt } from '../../../lib/grupper';
import { fmtFaseStart } from '../../../lib/faser';
import { antalOrd } from '../../../lib/puljeFacit';
import { useAuth } from '../../../context/AuthContext';
import { teamsOf } from './teamInfo';
import TabelRaekke, { TabelHoved } from './TabelRaekke';
import { useEgetPuljeBet } from './useEgetPuljeBet';

// Q6: noten lover kun de kriterier, vi kan stå inde for at have regnet.
export const DELT_NOTE = 'Hold med samme placering står lige på point, indbyrdes kampe og målforskel.';

const lille = { color: 'var(--c-muted)', fontSize: '0.8rem', margin: '0.4rem 0 0' };

/** Fasens bestemte form fra kalenderen («Hovedrunden»), eller navnet. */
function bestemt(game, navn) {
  const f = (game.faser || []).find((x) => x.navn === navn);
  return f?.bestemt || navn;
}

/** Den næste kalenderfases bestemte form med lille begyndelsesbogstav («kvartfinalerne»), eller ''. */
function naesteBestemt(game, navn) {
  const i = (game.faser || []).findIndex((f) => f.navn === navn);
  const n = i >= 0 ? game.faser[i + 1] : null;
  return n ? (n.bestemt || n.navn).toLowerCase() : '';
}

/**
 * Hvor står stregen (efter hvor mange rækker)? null = ingen streg.
 *   - Næste fases hold kendt: efter dem, men KUN hvis de er de øverste i
 *     vores stilling. Ellers ingen streg — ✓ viser, hvem der gik videre.
 *   - Ellers: efter nr. `videre`, når der er placeringer, og stregen ikke
 *     skærer en delt plads over.
 */
export function stregEfter(raekker, videre, videreHold) {
  if (!Array.isArray(raekker) || raekker.length <= videre) return null;
  if (videreHold) {
    const top = raekker.slice(0, videre).map((r) => r.teamName);
    return top.every((h) => videreHold.includes(h)) ? videre : null;
  }
  const sidst = raekker[videre - 1];
  const naeste = raekker[videre];
  // To regler, én vagt hver: ingen placeringer endnu (før første facit) …
  if (sidst.rank == null) return null;
  // … og en delt plads hen over stregen.
  if (naeste.rank != null && naeste.rank === sidst.rank) return null;
  return videre;
}

function GruppeTabel({ g, videre, hold, egne }) {
  const streg = stregEfter(g.raekker, videre, g.videreHold);
  const delt = g.raekker.some((r) => r.delt);
  return (
    <div className="card grupper__kort" data-testid={`gruppe-${g.navn}`} data-status="klar">
      <h3 className="card__title" style={{ marginTop: 0 }}>Gruppe {g.navn}</h3>
      <div className="sltab-wrap">
        <table className="sltab">
          <TabelHoved />
          <tbody>
            {g.raekker.map((r, i) => {
              const gikVidere = g.videreHold?.includes(r.teamName);
              const egen = egne.has(r.teamName);
              return (
                <TabelRaekke
                  key={r.teamName} r={r} teams={hold}
                  className={streg === i + 1 ? 'grupper__streg' : undefined}
                  data-videre={gikVidere ? 'true' : undefined}
                  maerke={(gikVidere || egen) ? (
                    <>
                      {gikVidere && <span className="grupper__videre" data-testid="gik-videre" aria-label="gik videre">✓</span>}
                      {egen && <span className="grupper__egen" data-testid="egen-semifinalist" aria-label="dit semifinaletip">🎖️</span>}
                    </>
                  ) : null}
                />
              );
            })}
          </tbody>
        </table>
      </div>
      {delt && <p style={lille} data-testid="delt-note">{DELT_NOTE}</p>}
    </div>
  );
}

function Venter({ g, foerste }) {
  return (
    <div className="card grupper__kort" data-testid={`gruppe-${g.navn}`} data-status="venter">
      <p style={{ margin: 0, fontWeight: 600 }}>
        {`Gruppe ${g.navn} · de ${antalOrd(foerste.videre)} bedste fra gruppe ${g.fra.join(' og ')}`}
      </p>
    </div>
  );
}

export default function Grupper({ game, matches }) {
  const { user } = useAuth();
  const hold = teamsOf(game);
  const oversigt = useMemo(() => grupperOversigt(game, matches), [game, matches]);
  // Eget semifinaletip — kun i et spil, der HAR tippet (ingen lytter ellers).
  const bet = useEgetPuljeBet(game?.pulje ? game.id : null, user?.uid ?? null);
  const egne = useMemo(
    () => new Set(Array.isArray(bet?.championship) ? bet.championship : []),
    [bet],
  );

  const [foerste, anden] = oversigt;
  if (!foerste) return null; // fanen er gated på harGrupper; hertil når man ikke uden
  const visAnden = anden && anden.grupper.some((g) => g.hold.length > 0);

  // Reglen og ✓-forklaringen: tallet fra `videre`, fasen fra kalenderen.
  const regel = (f) => (naesteBestemt(game, f.fase) ? `De ${f.videre} øverste går videre til ${naesteBestemt(game, f.fase)}.` : '');
  const flueben = (f) => (f.grupper.some((g) => g.videreHold)
    ? ` ✓ står ved de hold, der er lagt ind i ${naesteBestemt(game, f.fase)}.` : '');

  return (
    <div>
      <div className="card mb-2">
        <h3 className="card__title" style={{ marginTop: 0 }}>📊 Grupperne</h3>
        <p style={{ color: 'var(--c-muted)', margin: 0 }}>
          Stillingen regnes af kampenes resultater her i spillet: <strong>{game.grupper.point.sejr} point for en
          sejr</strong>, {game.grupper.point.uafgjort} for uafgjort. Står holdene lige, tæller de indbyrdes
          kampe først, så målforskellen.
          {egne.size > 0 && <> 🎖️ står ved de hold, du har tippet til semifinalerne.</>}
        </p>
      </div>

      {visAnden && (
        <section className="mb-2" data-testid="gruppefase-2" aria-label={anden.fase}>
          <h3 className="card__title">{anden.fase}</h3>
          <p style={{ color: 'var(--c-muted)', margin: '0 0 0.75rem' }}>
            {/* Q2: startdatoen ÉN gang — grupperne begynder ikke samme dag. */}
            {fmtFaseStart(anden.start) && `${bestemt(game, anden.fase)} spilles fra ${fmtFaseStart(anden.start)}. `}
            {regel(anden)}
            {anden.grupper.some((g) => g.status === 'klar') && (
              ` Resultaterne fra ${bestemt(game, foerste.fase).toLowerCase()} mod de ${antalOrd(foerste.videre - 1)} andre hold fra samme gruppe, der også gik videre, tæller med.`
            )}
            {flueben(anden)}
          </p>
          <div className="grid-2">
            {anden.grupper.map((g) => (g.status === 'klar'
              ? <GruppeTabel key={g.navn} g={g} videre={anden.videre} hold={hold} egne={egne} />
              : <Venter key={g.navn} g={g} foerste={foerste} />))}
          </div>
        </section>
      )}

      <section data-testid="gruppefase-1" aria-label={foerste.fase}>
        <h3 className="card__title">{foerste.fase}</h3>
        <p style={{ color: 'var(--c-muted)', margin: '0 0 0.75rem' }}>
          {regel(foerste)}
          {flueben(foerste)}
        </p>
        <div className="grid-2">
          {foerste.grupper.map((g) => (
            <GruppeTabel key={g.navn} g={g} videre={foerste.videre} hold={hold} egne={egne} />
          ))}
        </div>
      </section>
    </div>
  );
}
