/**
 * TroejeOversigt — alle spillets hold med deres tre trøjer.
 *
 * Ligger nederst på "Mit hold", fordi man dér i forvejen skal VÆLGE et hold:
 * oversigten er den hjælp, valget mangler. Den er ikke et katalog for sig selv.
 *
 * TRØJERNE HENTES VIA `badgeFor`, ikke fra rådata. Det er det eneste sted,
 * admin-overrides (`games/{id}.teamStyles`) læses — læste vi holdet direkte,
 * kunne en klub stå i én farve på kampkortet og en anden her, så snart ejeren
 * havde rettet en farve i hånden.
 *
 * HVAD SIDEN IKKE PÅSTÅR. Den siger ikke, at hver farve er efterprøvet. De
 * danske hjemmetrøjer og elleve ude-/tredjefelter er målt på klubbernes egne
 * fotos (`scripts/superliga-ude-tredje.mjs`); resten er hentet fra en kilde,
 * men ikke målt. Det, siden DERIMOD kan se, er når et holds trøjer har samme
 * farve — så er den ene ikke en trøje, men en pladsholder. Hull City har
 * #FFFFFF som både ude og tredje, Coventry to næsten ens hvide, og Crystal
 * Palace hjemme og tredje inden for 2 i afstand. Dét siges højt.
 */
import { useMemo } from 'react';
import ClubBadge from '../../../components/ClubBadge';
import { badgeFor, matchBadges } from './badges';
import { teamsOf } from './teamInfo';
import { colorDistance } from '../../../lib/contrastText';

/**
 * To trøjer er "den samme", når farverne ikke kan skelnes. Tærsklen er den
 * samme, `badgeFarver.test.js` bruger til at kalde Hull og Coventry
 * pladsholdere — ét tal, ét sted, så de to ikke kan drive fra hinanden.
 */
export const SAMME_FARVE = 20;

const SLOTS = [
  { key: 'home', navn: 'Hjemme' },
  { key: 'away', navn: 'Ude' },
  { key: 'third', navn: '3. trøje' },
];

/**
 * Et konkret eksempel på tredjetrøje-reglen, REGNET UD AF SPILLETS EGNE HOLD.
 *
 * Et håndskrevet eksempel ville blive forkert, næste gang en farve rettes —
 * og det er præcis sket for de tal, der begrundede mønstrene. Her findes parret
 * ved at spørge `matchBadges`, altså den regel teksten beskriver.
 *
 * Vælger det par, hvor skiftet gør mest forskel, så eksemplet er det tydeligste
 * og ikke bare det første i alfabetet.
 *
 * UAFGJORT AFGØRES PÅ NAVNET, ikke på listens rækkefølge. AGF og F.C. København
 * spiller begge i #FFFFFF, så flere par giver PRÆCIS samme gevinst — og så
 * afhang svaret af, om holdene kom sorteret ind eller ej. Komponenten sorterer
 * på visningsnavn, testen gjorde ikke, og de to fik hver sit eksempel. Et
 * eksempel, der skifter med kaldets rækkefølge, er ikke et eksempel.
 */
export function findEksempel(teams, styles) {
  let bedst = null;
  for (const h of teams) {
    for (const a of teams) {
      if (h.name === a.name) continue;
      const { a: valgt } = matchBadges(teams, h.name, a.name, styles);
      const ude = badgeFor(teams, a.name, styles, 'away');
      if (valgt.color === ude.color) continue;      // ingen skift her
      const hjemme = badgeFor(teams, h.name, styles, 'home');
      const gevinst = colorDistance(valgt.color, hjemme.color)
        - colorDistance(ude.color, hjemme.color);
      const navn = `${hjemme.navn}–${valgt.navn}`;
      const bedre = !bedst || gevinst > bedst.gevinst
        || (gevinst === bedst.gevinst && navn.localeCompare(`${bedst.hjemme}–${bedst.ude}`, 'da') < 0);
      if (bedre) {
        bedst = { hjemme: hjemme.navn, ude: valgt.navn, gevinst, hjemmeFarve: hjemme, udeFarve: ude, valgt };
      }
    }
  }
  return bedst;
}

/** Trøjer, hvis farve ikke kan skelnes fra en anden af holdets egne. */
function dubletter(troejer) {
  const ud = {};
  for (let i = 0; i < troejer.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      if (colorDistance(troejer[i].b.color, troejer[j].b.color) < SAMME_FARVE) {
        ud[troejer[i].key] = troejer[j].navn;
      }
    }
  }
  return ud;
}

export default function TroejeOversigt({ game }) {
  const styles = game?.teamStyles;
  const hold = useMemo(() => {
    if (game?.type !== 'football') return [];
    return [...teamsOf(game)].sort((a, b) => (a.vis || a.name).localeCompare(b.vis || b.name, 'da'));
  }, [game]);

  const eksempel = useMemo(
    () => (hold.length ? findEksempel(hold, styles) : null),
    [hold, styles],
  );

  // Gaten er på SPILTYPEN, ikke på holdlisten: `teamsOf` falder tilbage på
  // Superligaens tolv, og det er nøjagtig den liste, holdvælgeren lige over
  // viser. Ellers ville de to sige forskellige ting på det samme kort.
  if (!hold.length) return null;

  return (
    <div className="troejer">
      <h4 className="troejer__titel">👕 Alle trøjer i {game?.name || 'spillet'}</h4>

      {/* TEKSTEN HANDLER OM BADGEN, IKKE OM TRØJEN PÅ BANEN. Skrev vi "holdet
          spiller i", modsagde vi tv-billedet: reglen afgør kun, hvilken farve
          KORTET tegner udeholdet i. */}
      <p className="troejer__hjaelp">
        Sådan tegnes holdene på kampkortet. Udeholdet vises i sin udetrøje —
        men skifter til 3. trøje, når udefarven ligger for tæt på hjemmeholdets,
        så de to badges kan skelnes.
        {eksempel && (
          <>
            {' '}Fx <strong>{eksempel.hjemme}–{eksempel.ude}</strong>: dér tegnes{' '}
            {eksempel.ude} i 3. trøje.
          </>
        )}
      </p>

      <ul className="troejer__liste">
        {hold.map((t) => {
          const troejer = SLOTS.map((s) => ({ ...s, b: badgeFor(hold, t.name, styles, s.key) }));
          const ens = dubletter(troejer);
          return (
            <li key={t.name} className="troejer__hold">
              <span className="troejer__navn">{t.vis || t.name}</span>
              <span className="troejer__saet">
              {troejer.map(({ key, navn, b }) => (
                <span key={key} className="troejer__et">
                  <ClubBadge
                    variant="troeje" code={b.code} color={b.color} size={30}
                    color2={b.color2} moenster={b.moenster} aerme={b.aerme}
                    title={`${t.vis || t.name} – ${navn}`}
                  />
                  <span className="troejer__mrk">
                    {navn}
                    {/* EN TRØJE, DER ER MAGEN TIL EN ANDEN, ER IKKE EN TRØJE.
                        Hull City har #FFFFFF som både ude og 3.; uden den her
                        linje ville siden vise to ens badges og påstå, at klubben
                        har to hvide trøjer. */}
                    {ens[key] && (
                      <span className="troejer__mangler"> · mangler, viser {ens[key].toLowerCase()}</span>
                    )}
                  </span>
                </span>
              ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
