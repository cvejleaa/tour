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
sæsonen 8,3 % af gangene — præcis sin retfærdige andel af tolv. Sætter man i
stedet én afvigende spiller ind i den samme flok, vinder han 20–35 %, altså to
til fire gange så meget. Ikke fordi den strategi er bedre: forventningen er den
samme for alle, når oddsene er fair. Men i et vinderen-tager-alt-spil er det en
fordel i sig selv, at ens point ikke svinger i takt med flokkens.

Det ses også i den blandede liga: `hjemmebanen` er den svageste af de seks, og
det er ikke fordi hjemmesejr er et dårligt gæt. Den vælger bare det samme som
`favoritten` i to ud af tre kampe.

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

## To målinger, der svarer på hvert sit

Scriptet laver to tabeller, og de må ikke forveksles:

| Tabel | Spørgsmål | Summer til |
|---|---|---|
| **Én blandet liga** | hvem vinder, hvis vi alle spiller forskelligt? | **100 %** |
| **Seks separate ligaer** | hvor meget hjælper det at skille sig ud fra flokken? | ingenting |

Den anden er let at misforstå. Hver søjle dér er sin **egen** simulering: én
spiller med den strategi mod elleve favorit-spillere. Inden for hver søjle giver
det 100 % — men de elleve andre er ikke vist, så summen på tværs af søjlerne
lander omkring 150 %. Det er ikke en fejl, men det er et tal, man ikke skal
lægge sammen. Læs den første tabel, hvis du vil vide, hvem der vinder.

## Superligaen — én blandet liga, to spillere pr. arketype

Retfærdig andel pr. arketype er 2 af 12 = **16,7 %**. Kun 1X2-benet, som er det,
odds-loftet rammer:

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 4 | **25,9 %** | 15,9 % | **2,9 %** | 20,5 % | 15,7 % | 19,0 % |
| 5 | 17,4 % | 17,8 % | 11,2 % | 14,9 % | 19,7 % | 19,1 % |
| **6** *(gammelt)* | 16,0 % | 18,5 % | 18,3 % | 12,2 % | 15,9 % | 19,0 % |
| 7 | 14,5 % | 18,5 % | 21,6 % | 11,4 % | 15,0 % | 19,0 % |
| **8** *(nu)* | 13,9 % | 19,0 % | 22,2 % | 11,7 % | 14,7 % | 18,5 % |
| 10 | 14,8 % | 19,3 % | 22,5 % | 11,3 % | 14,4 % | 17,8 % |
| intet | 13,9 % | 18,9 % | 22,3 % | 12,3 % | 13,7 % | 19,0 % |

Tre ting er værd at hæfte sig ved:

1. **Ved loft 8 er tallene praktisk talt identiske med "intet loft".** Det er
   den præcise betydning af, at loftet ikke længere forvrider. Det er derfor
   Superligaen står på 8: det laveste tal, hvor kurven er fladet ud.
2. **Et lavt loft er et favorit-tilskud.** Ved loft 4 vinder favoritten 25,9 %
   mod uafgjort-spillerens 2,9 %. Loftet klipper kun høje odds, og høje odds er
   uafgjort- og underhund-spillerens hele indtægt.
3. **`hjemmebanen` er svagest (11,7 %)**, og det er ikke fordi strategien er
   dårlig. Den vælger det samme som `favoritten` i 67 % af kampene, så de to er
   delvis korrelerede — og fordelen i spillet er netop at være ukorreleret.

Ved loft 6 var der desuden **10 af 132 kampe**, hvor to udfald blev klippet ned
til nøjagtig samme pris — altså hvor to vidt forskellige gæt betalte det samme.
I FCK–Lyngby var både uafgjort og udesejr sat til 6,00, selv om de var 7,49 og
7,80 værd. Ved loft 8 sker det i nul kampe.

## Premier League — samme opstilling

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 4 | **40,5 %** | 4,0 % | **0,1 %** | 18,7 % | 20,7 % | 15,9 % |
| 6 | 19,4 % | 11,7 % | 11,8 % | 14,3 % | 21,3 % | 21,4 % |
| 8 | 14,3 % | 14,4 % | 23,8 % | 12,1 % | 15,3 % | 20,0 % |
| 10 | 13,8 % | 17,7 % | 25,3 % | 11,7 % | 13,2 % | 18,4 % |
| **12** | 13,5 % | 18,5 % | 25,0 % | 12,2 % | 13,4 % | 17,5 % |
| intet | 12,6 % | 20,7 % | 24,0 % | 11,1 % | 14,0 % | 17,7 % |

Premier League har et langt bredere felt, så loftet binder meget oftere og
hårdere. Ved 6 vinder favoritten 19,4 % mod underhundens 11,7 %; ved 12 er det
vendt til 13,5 % mod 18,5 %, hvilket ligger tæt på "intet loft". Kurven flader
ud omkring 10–12, og **det er begrundelsen for 12** — ikke at det er et pænere
tal end 8.

Bemærk kontrasten til Superligaen: dér er 8 nok, fordi holdene ligger tættere.
Samme loft i begge ligaer ville betyde, at Premier League blev spillet med en
tommelfingerregel, der er indstillet efter dansk fodbold.

## Combi-bonussen ændrer billedet — og loftet rører den ikke

Combi ganger de **rene** odds og er omtrent halvdelen af pointene. Måler man kun
1X2, ser loftet ud til at gøre mere, end det gør.

Superligaen, hele pointreglen:

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 6 | 14,9 % | 20,4 % | 11,4 % | 14,3 % | 16,9 % | 22,1 % |
| 8 | 13,7 % | 20,9 % | 13,5 % | 14,7 % | 15,7 % | 21,6 % |
| intet | 14,0 % | 20,5 % | 13,4 % | 14,9 % | 15,4 % | 21,8 % |

Uafgjort-spilleren falder fra 22,2 % til 13,5 %, når combi'en tælles med. Combi
belønner den, der rammer **mange** kampe i samme runde, og det gør han sjældent.
Underhunden er stort set upåvirket, og `fornemmelsen` bliver den stærkeste.

I Premier League trækker combi den anden vej for underhunden: fra 14,4 % (kun
1X2) til 21,5 % ved loft 8, fordi de større odds giver en større combi.

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
5. **Tabellen så ud som en fordeling uden at være det.** Første udgave viste kun
   "hver type alene mod elleve favorit-spillere" — seks separate simuleringer,
   hvis søjler summer til ca. 150 %. Enhver, der lægger dem sammen, opdager
   straks, at noget er galt, og har ret. Den blandede liga er tilføjet netop
   derfor: den svarer på spørgsmålet, man faktisk stiller, og summer til 100 %.

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
