# Spilbalance — hvem vinder, og hvorfor

Dette dokument handler om ét spørgsmål: **kan man vinde ligaen ved at vælge den
rigtige strategi frem for ved at gætte bedre?**

Tallene her er målt, ikke udledt. De reproduceres med

```bash
node scripts/maal-odds-loft.mjs                  # begge ligaer
node scripts/maal-odds-loft.mjs --liga superliga
```

Vi har taget fejl af det her tre gange, og hver gang var fejlen i *målingen*,
ikke i spillet. Afsnittet "Fælder" til sidst er derfor ikke pynt — læs det, før
du stoler på et nyt tal.

## Det vigtigste resultat først

**Den største fordel i spillet er ikke at være modig eller forsigtig. Den er at
tippe anderledes end de andre.**

En spiller, der tipper favoritter i et felt, hvor alle tipper favoritter, vinder
sæsonen 8,3 % af gangene — præcis sin retfærdige andel af tolv. Enhver anden
strategi lander på 20–35 %, altså to til fire gange så meget. Ikke fordi de
strategier er bedre: deres forventede pointsum er den samme. Men i et
vinderen-tager-alt-spil er det en fordel i sig selv, at ens point ikke svinger i
takt med flokkens.

Det betyder, at spillet **ikke kan gøres "retfærdigt" med en odds-justering**.
Så længe man kan vælge at tippe anderledes end flertallet, er der en gevinst ved
det. Det, vi kan sikre, er noget snævrere og mere opnåeligt: at ingen enkelt
strategi bliver **straffet** af en teknisk detalje.

## De seks arketyper

En arketype skal svare til noget, et menneske faktisk gør. En model, ingen
spiller ligner, måler ikke spillet — den måler modellen.

| Arketype | Tipper | Svarer til |
|---|---|---|
| **favoritten** | altid det mest sandsynlige udfald | den forsigtige. Rammer tit, får lidt pr. gang |
| **underhunden** | altid at det svageste hold VINDER — aldrig uafgjort | den ægte modige |
| **uafgjort** | altid X | en reel vane i 1X2, og den betaler højt |
| **hjemmebanen** | altid 1 | den mest udbredte tommelfingerregel der findes |
| **værdijægeren** | højeste odds blandt udfald med mindst 20 % chance | tager chancer, men spiller ikke lotteri |
| **fornemmelsen** | tilfældigt, vægtet efter sandsynlighed | den, der tipper uden system |

**`underhunden` er den, der manglede.** Tidligere hed den bare "outsider" og var
defineret som det *mindst sandsynlige* udfald. Det lyder som den modige, men det
mindst sandsynlige udfald **er uafgjort i 97 % af Superligaens kampe**. Vi målte
altså uafgjort-spilleren to gange og troede, vi målte to forskellige strategier
— og fordi de delte den samme strategis resultater mellem sig, så begge svagere
ud, end de var.

Scriptet tjekker nu overlappet mellem alle par og **nægter at rapportere**, hvis
to arketyper vælger det samme i over 80 % af kampene. Højeste reelle overlap er
`favoritten`/`hjemmebanen` på 65-67 %, hvilket er som forventet: hjemmeholdet
*er* som regel favoritten.

## Superligaen — 132 kampe, felt på 12

Hver arketype **alene** mod elleve favorit-spillere. Kun 1X2-benet, som er det,
odds-loftet rammer:

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 4 | 8,5 % | 22,9 % | 6,7 % | 23,4 % | 21,7 % | 18,0 % |
| 5 | 8,7 % | 27,3 % | 21,2 % | 22,5 % | 32,1 % | 23,2 % |
| **6** *(gammelt)* | 8,3 % | 30,6 % | **28,2 %** | 22,5 % | 31,1 % | 25,6 % |
| 7 | 7,6 % | 31,1 % | 31,2 % | 20,8 % | 31,1 % | 26,2 % |
| **8** *(nu)* | 7,7 % | 31,3 % | **33,1 %** | 21,8 % | 30,9 % | 26,2 % |
| 10 | 8,5 % | 30,6 % | 33,2 % | 20,9 % | 32,8 % | 26,7 % |
| intet | 8,0 % | 31,8 % | 33,4 % | 20,8 % | 30,7 % | 26,4 % |

Læg mærke til tre ting:

1. **`favoritten` ligger på 8,3 % hele vejen ned.** Det er kontrollen. Ligger
   den ikke der, er der noget galt med målingen, ikke med spillet.
2. **Loftet ramte uafgjort-spilleren hårdest.** Ved loft 4 var han nede på 6,7 %
   — under sin retfærdige andel. Det er ikke et designvalg, det er en bivirkning
   af, at loftet kun klipper høje odds, og at høje odds er hans hele indtægt.
3. **Kurven er flad fra 8 og opefter.** Derfra flytter et højere loft ingenting.
   Det er grunden til, at Superligaen står på 8: det er det laveste tal, hvor
   loftet holder op med at forvride.

Ved loft 6 var der desuden **10 af 132 kampe**, hvor to udfald blev klippet ned
til nøjagtig samme pris — altså hvor to vidt forskellige gæt betalte det samme.
I FCK–Lyngby var både uafgjort og udesejr sat til 6,00, selv om de var 7,49 og
7,80 værd. Ved loft 8 sker det i nul kampe.

## Premier League — 380 kampe, felt på 12

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 6 | 8,2 % | 19,6 % | 18,7 % | 20,3 % | 29,8 % | 22,4 % |
| 8 | 8,4 % | 24,4 % | 30,6 % | 21,9 % | 29,9 % | 24,9 % |
| 10 | 8,0 % | 29,1 % | 33,2 % | 22,6 % | 29,3 % | 25,6 % |
| **12** | 8,5 % | 29,6 % | 33,4 % | 22,4 % | 29,3 % | 25,7 % |
| intet | 8,3 % | 31,8 % | 32,4 % | 22,0 % | 29,3 % | 26,0 % |

Premier League har et langt bredere felt, så loftet binder meget oftere. Ved 6
ville det halvere underhund-spillerens chance (19,6 % mod 31,8 % uden loft) —
derfor 12 og ikke 8. Kurven er stort set flad fra 10.

## Combi-bonussen ændrer billedet — og loftet rører den ikke

Combi ganger de **rene** odds og er omtrent halvdelen af pointene. Måler man kun
1X2, ser loftet ud til at udligne spillet. Det gør det ikke.

Superligaen, hele pointreglen:

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 6 | 8,2 % | 30,5 % | 20,0 % | 25,5 % | 30,1 % | 26,6 % |
| 8 | 8,2 % | 31,3 % | 21,7 % | 25,2 % | 29,7 % | 27,8 % |
| intet | 8,6 % | 31,7 % | 21,6 % | 24,7 % | 28,8 % | 27,7 % |

Uafgjort-spilleren falder fra 33,1 % til 21,7 %, når combi'en tælles med. Combi
belønner den, der rammer **mange** kampe i samme runde, og det gør han sjældent.
Underhund-spilleren er derimod stort set upåvirket.

I Premier League trækker combi den anden vej: underhunden går fra 24,4 % (kun
1X2) til 35,0 % ved loft 8, fordi de større odds giver en større combi.

**Konklusion:** loftet retter det ene ben. Combi'en har sin egen skævhed, og den
er ikke målt færdig. Det er en åben opgave — se nedenfor.

## Fælder, vi er faldet i

Alle fire har kostet et forkert tal, som nåede at blive skrevet ned som sandhed.

1. **`outcomeReward` tager et odds-objekt, ikke et tal.** Sender man et tal,
   falder den tavst tilbage på `DEFAULT_POINTS` (2/4/3). Alle tal bliver
   forkerte, uden en eneste fejlbesked.
2. **To arketyper kan bære hvert sit navn og være samme strategi.** Se
   `underhunden` ovenfor. Scriptet tjekker nu overlappet som en port.
3. **Støjen skal være symmetrisk.** Første udgave gav kun de elleve spillere
   støj og lod den afvigende tippe fejlfrit. Bedste-af-elleve-støjende slår den
   støjfrie næsten altid: to *identiske* arketyper gav 0,2 % i stedet for 8,3 %.
   Hele tabellen var målt mod en nulhypotese, harnessen ikke kunne ramme.
   Scriptet kører nu den kontrol **først** og nægter at rapportere, hvis den
   fejler.
4. **Combi var ikke med i modellen.** Se ovenfor.

Dertil to tekniske: tilfældighedsgeneratoren var en klassisk LCG, hvis lave bit
er stærkt korrelerede — og det var netop dem, `Math.floor(rnd() * 3)` trak på.
Og uafgjorte sæsoner talte som tab for alle tolv, så summen ikke kunne give
100 %. Begge er rettet; frøet er fast, så to kørsler kan sammenlignes.

**Om usikkerhed:** ved 8.000 sæsoner er standardfejlen ca. 0,5 procentpoint.
Forskelle under ~1,5 pp skal ikke tolkes.

## Hvad der stadig er åbent

- **Combi-skævheden.** Loftet er justeret færdigt; combi'en er ikke undersøgt
  som en balanceskrue. `COMBI.LOFT` på 25 rammer desuden oftere for
  underhund-spilleren end for favoritten, hvilket spiser en del af den gevinst,
  et højere odds-loft giver.
- **Live-Elo.** Alle tal her er regnet på **seed-Elo**. Produktionen ompriser
  fremtidige kampe fra den løbende Elo, og Superligaens margen til loftet er kun
  ~6 Elo-point. "Loftet binder på nul udfald" kan altså holde op med at være
  sandt midt i sæsonen, uden at nogen test bliver rød.
- **Feltet er en model.** Elleve ens spillere plus én afvigende er ikke ligaen.
  Rigtige spillere ligner hinanden mindre, så fordelen ved at stå alene er
  formentlig mindre end 2-4× i praksis. Retningen og sammenligningen mellem
  lofter er robust; det absolutte tal er det ikke.
