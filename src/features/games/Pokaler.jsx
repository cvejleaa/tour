/**
 * Pokaler — sæsonens to ANDRE trofæer ved siden af tabellen.
 *
 * HVORFOR: tabellen er ofte afgjort i december. Rundekongen skifter hånd hver
 * uge, og føreren har den tit ikke — man kan vinde fire runder og stadig ligge
 * nummer fem. Chance-kongen er det mest personlighedsafslørende tal i spillet.
 * Tilsammen betyder de, at nummer sidst i november stadig har noget at spille
 * om i marts.
 *
 * IKKE SOM KOLONNER I TABELLEN. Stillingslisten er en bar <table> med tre
 * kolonner og UDEN .table-wrap (GameStandings), så to nye kolonner ville
 * knække den på en telefon uden vandret scroll. Derfor kort.
 *
 * KUN EN TOPVISNING FOR RUNDEKONGEN, ikke en rangliste ned til sidst. Et tal
 * om andre må kun vises, hvis det at ligge nederst i det er en HISTORIE — og
 * "0 rundesejre" er sæsonens normale flertalstilstand for de fleste, ikke en
 * historie. Chancen er en undtagelse: et dybt minus dér er mod, ikke en dom,
 * og derfor vises både bedst og værst.
 *
 * NAVNET ER "Chance-kongen", ikke "Chancen". Opdelings-tabellen på samme fane
 * har allerede en rubrik, der hedder Chancen, og to ting med samme navn på én
 * skærm er tvetydige — også for den, der læser dem. En titel kan desuden bæres
 * og drilles; en rubrik kan ikke.
 *
 * SKALAEN SKAL STÅ I SELVE LABELEN. Rundesejre kan afgrænses til ligaens
 * startrunde, men `opdeling.chance` er SPIL-scoped og findes ikke pr. runde
 * (pointOpdeling lægger 1X2, chance og combi sammen i perRunde). I en liga med
 * startrunde er de to pokaler altså på hver sin skala. En grå fodnote er ikke
 * nok, når en enkelt person hænges op som "bedst": så tror man, trofæet er
 * ligaens. Derfor står "hele sæsonen" i overskriften — og kun når ligaen
 * faktisk tæller fra en senere runde.
 */
import { useMemo } from 'react';
import { rundeSejre, faerdigeRunder } from './rundeSejre';
import { fmtSignedPoints } from '../../lib/daNum';

/** Navnene på dem, der deler en pokal. Aldrig en tom streng. */
function navneAf(rows, uids) {
  const navn = new Map((rows || []).map((r) => [r.uid, r.name]));
  return (uids || []).map((u) => navn.get(u) || u).join(', ');
}

function Kort({ ikon, titel, skala, children }) {
  return (
    <div className="card" style={{ flex: '1 1 14rem', minWidth: 0 }}>
      <p style={{ margin: 0, fontWeight: 700 }}>
        {ikon} {titel}
        {skala && (
          <span style={{ fontWeight: 400, color: 'var(--c-muted)', fontSize: '0.85rem' }}>
            {' '}({skala})
          </span>
        )}
      </p>
      {children}
    </div>
  );
}

const TOM = { color: 'var(--c-muted)', margin: '0.3rem 0 0', fontSize: '0.9rem' };
const VINDER = { margin: '0.3rem 0 0' };

/**
 * @param {{rows:Array, matches:Array, startRunde:number|null}} props
 *   `rows` er stillingen som den må vises (uid, name, perRound, opdeling).
 *   `startRunde` er ligaens; null når hele spillet vises.
 */
export default function Pokaler({ rows = [], matches = [], startRunde = null }) {
  const runder = useMemo(() => faerdigeRunder(matches), [matches]);
  const sejre = useMemo(() => rundeSejre(rows, startRunde, runder), [rows, startRunde, runder]);

  const konge = useMemo(() => {
    let flest = 0;
    let uids = [];
    for (const [uid, n] of sejre) {
      if (n > flest) { flest = n; uids = [uid]; } else if (n === flest && n > 0) uids.push(uid);
    }
    return flest > 0 ? { flest, uids } : null;
  }, [sejre]);

  // Chancen: kun spillere, der FAKTISK har brugt den. En saldo på 0 kan både
  // betyde "aldrig turdet" og "gik lige op", og de to skal ikke stå side om
  // side som om de var det samme.
  const chance = useMemo(() => {
    const brugt = (rows || [])
      .map((r) => ({ uid: r.uid, name: r.name, v: Number(r.opdeling?.chance) }))
      .filter((x) => Number.isFinite(x.v) && x.v !== 0);
    if (!brugt.length) return null;
    const sorteret = [...brugt].sort((a, b) => b.v - a.v);
    return { bedst: sorteret[0], vaerst: sorteret[sorteret.length - 1] };
  }, [rows]);

  // Er ligaen på en anden skala end Chancen? Så skal det stå i overskriften.
  const anden = Number.isFinite(startRunde);

  return (
    <div style={{ display: 'flex', gap: '0.6rem', flexWrap: 'wrap', marginBottom: '0.8rem' }}>
      <Kort ikon="👑" titel="Rundekongen" skala={anden ? `fra runde ${startRunde}` : null}>
        {konge ? (
          <p style={VINDER}>
            <strong>{navneAf(rows, konge.uids)}</strong>
            {' — '}
            {konge.flest} {konge.flest === 1 ? 'rundesejr' : 'rundesejre'}
            {konge.uids.length > 1 && ' (delt)'}
          </p>
        ) : (
          <p style={TOM}>
            {runder.length === 0
              ? 'Ingen runder er spillet færdig endnu.'
              : 'Ingen har vundet en runde endnu.'}
          </p>
        )}
      </Kort>

      <Kort ikon="⚡" titel="Chance-kongen" skala={anden ? 'hele sæsonen' : null}>
        {chance ? (
          <>
            <p style={VINDER}>
              Bedst: <strong>{chance.bedst.name}</strong> {fmtSignedPoints(chance.bedst.v)}
            </p>
            {chance.vaerst.uid !== chance.bedst.uid && (
              <p style={{ ...VINDER, color: 'var(--c-muted)', fontSize: '0.9rem' }}>
                Modigst i minus: <strong>{chance.vaerst.name}</strong> {fmtSignedPoints(chance.vaerst.v)}
              </p>
            )}
          </>
        ) : (
          <p style={TOM}>Ingen har brugt Chancen endnu.</p>
        )}
      </Kort>
    </div>
  );
}
