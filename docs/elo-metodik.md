# Elo-metodik — vores "elo-lite" vs. World Football Elo Ratings

Denne note dokumenterer vores Elo-model, sammenligner den med den anerkendte
metode fra [eloratings.net](http://eloratings.net/), og forklarer de bevidste
valg. Baseret på en ekspertvurdering (juli 2026).

Kode: `src/lib/superligaScoring.js` (spejlet i `functions-platform/superligaScoring.js`),
funktionerne `eloExpectedHome`, `outcomeProbabilities`, `fairOdds`, `outcomeOdds`,
`updateElo` samt konstanterne `ELO`.

## Formål (hvorfor modellen ser ud som den gør)
Elo bruges til to ting i tippespillet:
1. **Generere "fair" 1X2-odds pr. kamp.** Odds fryses pr. kamp — men først når
   kampen låser (kickoff). Efter hver spillet kamp genberegner
   `recomputeSeasonElo` ratings og friskner odds på de kampe, der endnu ikke er
   låst. En kamp langt ude i fremtiden kan altså have andre odds i dag end i
   går; en kamp, der er gået i gang, kan ikke.
2. **Følge holdenes styrke gennem sæsonen** (Elo-tabellen, ny kolonne pr. runde,
   og de seneste udviklingspunkter på hvert kampkort).

Bemærk forskellen på de to visninger: `eloHistory` — som både Elo-tabellen og
kampkortet læser — får kun et snapshot, når en **hel runde** er spillet, mens
`eloCurrent` og kampenes egne `eloHome`/`eloAway` opdateres efter hver kamp.
Ratingen på kampkortet er derfor "efter seneste hele runde", ikke nødvendigvis
den, kampens odds blev regnet på. Odds bygger desuden på forskellen **plus 60
points hjemmebanefordel** (`HFA` i `superligaScoring.js`), så ratingerne alene
afgør ikke, hvem der er favorit.

Hvert holds **start-rating er seedet** ud fra de sidste ~3 års resultater +
styrkevurdering (ikke 1500 for alle). Kun 1X2-udfaldet bruges til at opdatere
Elo (`actualHome` = 1 / 0,5 / 0).

## Sammenligning med eloratings.net

| Element | eloratings.net | Vores model | Vurdering |
|---|---|---|---|
| Win-expectancy `We` | `1/(10^(−dr/400)+1)`, `dr` = ratingforskel + **100** (hjemme) | Samme logistiske /400-formel, `dr` = ratingforskel + **60** (`HFA`) | **Matematisk identisk formel**, kun hjemme-konstanten er tunet |
| Hjemmefordel | +100 Elo-point (~64 % forventning ved lige hold) | +60 Elo-point (~58,6 % forventning) | **60 er bedre for klubfodbold**; 100 er kalibreret til landshold |
| K-faktor | 20–60 efter kamptype **+** målforskel-vægt | Fast **20**, ingen målforskel | Kamptype er irrelevant i én liga; se nedenfor |
| Opdatering | `Rn = Ro + K·(W − We)` | Samme, nul-sum, `W ∈ {1, ½, 0}` | **Fuldt konformt** |
| 1X2-odds | Findes ikke (kun `We`) | Ekstra uafgjort-model (`DRAW_BASE/DRAW_DECAY`) | Vores **tilføjelse**, ikke en afvigelse |
| Margin/overround | — | `fairOdds = 1/p` (100 %-bog, ingen hus-take) | Korrekt for et retfærdigt vennespil |

### Hvorfor 60 og ikke 100 i hjemmefordel
Ved lige stærke hold giver `HFA=60` en hjemme-forventning på
`1/(1+10^(−60/400)) = 0,586` (≈ +0,09 over 50/50). eloratings' +100 giver 0,640.
Moderne klub-hjemmefordel ligger nærmere 0,55–0,59 — så **60 er mere retvisende
for Superligaen** end referencens landsholds-tal.

### Hvorfor fast K=20
Med ~32 kampe pr. hold pr. sæson **og** en allerede seedet start-rating er
holdene reelt "konvergerede" fra dag 1 (eloratings' "<30 kampe = foreløbig"
gælder derfor ikke for os). En lav, fast K undgår overreaktion på enkeltkampe i
en kort sæson. K=20 er samme værdi som venskabskampe hos eloratings og som
FiveThirtyEights klub-Elo.

### Målforskel-vægtning bevidst udeladt
eloratings øger K med målforskellen (+50 % ved 2 mål osv.). Det ville kun gøre
**Elo-tabellen** en anelse mere retvisende gennem sæsonen. Effekten er altså
i praksis kosmetisk for vores kerneformål, og vi fører kun 1X2-udfald ind i
opdateringen.

(Her stod tidligere, at det ikke rørte ved point, "fordi oddsene er frosset ved
seeding". Det er forkert og modsiger afsnittet ovenfor: oddsene friskes op
efter hvert resultat, helt frem til kampen låser. En ændring i Elo-modellen
ville derfor godt kunne flytte oddsene — bare ikke på kampe, der er gået i
gang.)

## Uafgjort-modellen og kalibreringen (juli 2026)
eloratings har ingen uafgjort-model; vi tilføjer én for at kunne lave 1X2-odds:

```
e      = eloExpectedHome(home, away, HFA)   // MED hjemmebane — fordeler 1 vs 2
eLevel = eloExpectedHome(home, away, 0)      // UDEN hjemmebane — former uafgjort
skew   = |2·eLevel − 1|                       // 0 ved reelt lige hold
pDraw  = DRAW_BASE · e^(−DRAW_DECAY · skew · 2)
1 = (1−pDraw)·e   ·   X = pDraw   ·   2 = (1−pDraw)·(1−e)
```

**Rettelse (P1 fra ekspertvurderingen):** tidligere blev `skew` målt på `e`
(inkl. hjemmebane), så uafgjort toppede når udeholdet var ~60 point stærkere —
ikke ved reelt lige hold — og det generelle niveau blev for lavt (~23 %). Nu
måles `skew` på den **hjemmebane-frie** forventning, og `DRAW_BASE` er sat til
**0,26**. Resultatet matcher Superligaens historiske rater:

| Kamp | 1 | X | 2 |
|---|---|---|---|
| Lige hold (1500–1500) | 43,3 % | **26,0 %** | 30,7 % |
| Let hjemmefavorit (1550–1450) | 57,9 % | 19,1 % | 23,0 % |
| Storfavorit hjemme (1900–1300) | 88,8 % | 9,3 % | 2,0 % |

(Superligaens historiske basis: ca. 43–45 % / 25–27 % / 28–30 %.)

## Dom
Vores "elo-lite" er **fagligt forsvarlig — faktisk mere end det**. Kernen er ikke
en tilnærmelse af eloratings.net; det **er** samme formel, med to bevidste,
velbegrundede tunings (HFA 60, K 20) der begge passer bedre til dansk klubfodbold
end referencens landsholds-konstanter. Den eneste reelle svaghed (skæv
uafgjort-kalibrering) er rettet, jf. ovenfor.

### Udestående (P2, lav prioritet)
- **Målforskel-vægtet K** i `updateElo` ville gøre Elo-*tabellen* mere retvisende
  gennem sæsonen, men påvirker ikke odds/point (frosne) — ren visnings-gevinst.
- Evt. sænke `HFA` mod ~50, hvis data viser lavere hjemmefordel. 60 er allerede godt.
