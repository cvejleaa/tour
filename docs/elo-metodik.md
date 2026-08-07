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
ikke ved reelt lige hold. Nu måles `skew` på den **hjemmebane-frie**
forventning.

### DRAW_BASE: 0,26 → 0,305 (august 2026)

Den første kalibrering satte `DRAW_BASE` til 0,26, så modellen ramte
Superligaens **gennemsnitlige** uafgjort-rate på ~26 %. Det var det forkerte
mål, og fejlen var usynlig af netop den grund: modellen ramte gennemsnittet ved
at være **for høj i de jævnbyrdige kampe og for lav i de skæve**, og et
gennemsnit kan ikke se forskel på det og en rigtig kurve.

Målt på **6.143 spillede kampe** — 13 sæsoner af Superligaen og 10 af Premier
League, hvert holdpar vurderet med de ratings, de havde *før* kampen:

| model | forventede uafgjorte | faktiske |
|---|---|---|
| 0,260 / 0,550 | 1.362 | 1.493 → **9 % for få** |
| **0,305 / 0,550** | 1.493 | 1.493 → rammer |

**`DRAW_DECAY` er efterprøvet og uændret.** 95 %-intervallet over alle 6.143
kampe er 0,35–0,63, og 0,55 ligger midt i det. Låser man decay og fitter kun
base, fanger man næsten hele forbedringen (log-likelihood 3407,1 → 3384,1 mod
3383,7 for et frit fit af begge) — én parameter er nok.

Kurven passer nu hele vejen. Begge ligaer samlet, otte lige store bånd efter
styrkeforskel:

| skew | Δelo | kampe | faktisk | model |
|---|---|---|---|---|
| 0,00–0,04 | 7 | 767 | 27,6 % ±3,2 | 29,8 % |
| 0,04–0,09 | 22 | 767 | 25,3 % ±3,1 | 28,4 % |
| 0,09–0,13 | 38 | 767 | 28,3 % ±3,2 | 27,1 % |
| 0,13–0,18 | 55 | 767 | 26,1 % ±3,1 | 25,6 % |
| 0,18–0,25 | 76 | 767 | 26,6 % ±3,1 | 24,1 % |
| 0,25–0,33 | 103 | 767 | 22,7 % ±3,0 | 22,2 % |
| 0,33–0,43 | 138 | 767 | 21,0 % ±2,9 | 20,1 % |
| 0,43–0,82 | 207 | 774 | 16,9 % ±2,6 | 17,0 % |

Modellen ligger inden for usikkerheden i alle otte bånd. Går man længere ud i
halen, hvor der er få kampe, ligger den lidt **højt** — over skew 0,5 forventer
den 69 uafgjorte mod 62 faktiske (+12 %) fordelt på 429 kampe. Det er den pris,
der betales for at ramme rigtigt i de øvrige 5.700, og den ligger inden for
støjen på de bånd (±4–7 procentpoint).

Måles med `scripts/maal-uafgjort.mjs` (headeren har curl-kommandoerne til at
hente sæsonerne). Grundlaget sæson for sæson — så de 6.143 og 1.493 kan
efterprøves uden at hente rådata ned igen — står i
[uafgjort-grundlag.md](uafgjort-grundlag.md). Se også
[spilbalance.md](spilbalance.md).

### Og hvad med 1 og 2?

`DRAW_BASE` blev fittet mod **uafgjort**. Den flytter 4,5 procentpoint ud af 1
og 2 proportionalt, og `HFA: 60` blev oprindeligt sat under det gamle
uafgjort-niveau — så det er et rimeligt spørgsmål, om hjemme/ude-splittet
stadig passer bagefter. Det gør det. Samme 6.143 kampe, hver kamp vurderet med
de ratings, holdene havde før den:

| | Superligaen (2.543) | | Premier League (3.600) | |
|---|---|---|---|---|
| | faktisk | model | faktisk | model |
| **1** | 43,4 % | 43,6 % | 44,4 % | 44,1 % |
| **X** | 25,8 % | 25,1 % | 23,3 % | 23,7 % |
| **2** | 30,9 % | 31,3 % | 32,3 % | 32,2 % |

Alle seks afvigelser ligger under ét standardafvig (|z| ≤ 0,77), største er 17
kampe ud af 2.543. Hjemmebanefordelen på 60 er altså stadig rigtig efter
uafgjort-rettelsen, og der er ikke noget at skrue på.

**En blindgyde, der er værd at kende.** Undervejs blev `DRAW_DECAY` foreslået
sænket til 0,25, fittet mod 14 bookmakerpriser. Det var forkert af to grunde:
Superligaen har **ingen** kampe over skew 0,50, så dens historik kan slet ikke
måle henfaldet — og en naiv de-vigning, der fordeler bookmakerens margin
proportionalt over de tre udfald, **overdriver langskuddene systematisk**.
Markedet så fladt ud, fordi metoden gjorde det fladt. 0,25 ville have overprist
uafgjort i de skæve kampe med 49 %. Brug facit, ikke priser.

## Odds-loftet hørte ikke til her — og findes ikke længere

`ODDS.MAX` lignede en Elo-parameter, men var det ikke: den rørte ikke modellen,
kun hvad et udfald *betalte*. Loftet var en balanceskrue på pointreglen, og
skruen er nu fjernet helt — der er kun et **gulv** tilbage (`ODDS.MIN` = 1,10),
så et udfald altid betaler mere end indsatsen.

Kort sagt hvorfor: et loft klipper kun gevinsten, aldrig indsatsen, så en
Chance på høje odds fik negativ forventning. Den fulde måling står i
[docs/spilbalance.md](spilbalance.md).

Det rører **ikke** ved Elo-modellen. Højeste odds er nu 8,01 i Superligaen og
24,39 i Premier League, og de tal falder ud af `DRAW_BASE`/`DRAW_DECAY` og
ratingspredningen — ikke af en grænse.

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
