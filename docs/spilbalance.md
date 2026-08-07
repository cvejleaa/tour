# Spilbalance — hvem vinder, og hvorfor

Dette dokument handler om ét spørgsmål: **kan man vinde ligaen ved at vælge den
rigtige strategi frem for ved at gætte bedre?**

Tallene her er målt, ikke udledt. De reproduceres med

```bash
node scripts/maal-spilbalance.mjs                  # begge ligaer
node scripts/maal-spilbalance.mjs --liga superliga
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

Retfærdig andel pr. arketype er 2 af 12 = **16,7 %**. Kun 1X2-benet:

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 4 | **22,5 %** | 10,9 % | **10,2 %** | 19,3 % | 16,9 % | 20,2 % |
| 6 *(det gamle)* | 14,1 % | 16,4 % | 21,6 % | 13,2 % | 16,1 % | 18,6 % |
| 8 | 14,6 % | 18,1 % | 21,4 % | 12,2 % | 14,4 % | 19,3 % |
| **intet** *(nu)* | 14,0 % | 17,6 % | 22,1 % | 12,7 % | 14,9 % | 18,8 % |

Læg mærke til, hvor lidt loftet flytter fra 6 og opefter. Det er ikke, fordi
loftet er harmløst — det er, fordi **uafgjort-modellen blev rettet samtidig**.
Med den gamle `DRAW_BASE` på 0,26 kostede loft 6 uafgjort-spilleren 4
procentpoint; med den rigtige model på 0,305 falder uafgjort-oddsene under 6 i
de skæve kampe af sig selv, og loftet får næsten intet at klippe i. Antallet af
kampe, hvor to udfald stod til nøjagtig samme pris, gik fra 10 til 4 alene af
den grund. (Kalibreringen er beskrevet i [elo-metodik.md](elo-metodik.md); de
6.143 kampe bag den er opgjort sæson for sæson i
[uafgjort-grundlag.md](uafgjort-grundlag.md).)

Ved loft 4 ses det tydeligt, hvad et stramt loft gør: favoritten vinder 22,5 %
mod uafgjort-spillerens 10,2 %. Loftet klipper kun høje odds, og høje odds er
uafgjort- og underhund-spillerens hele indtægt.

## Premier League — samme opstilling

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 4 | **36,4 %** | 1,8 % | **2,2 %** | 16,9 % | 23,9 % | 18,8 % |
| 6 | 17,4 % | 9,6 % | 18,6 % | 13,7 % | 20,3 % | 20,4 % |
| 8 | 15,0 % | 12,8 % | 24,1 % | 13,7 % | 15,3 % | 19,1 % |
| 12 | 13,0 % | 18,3 % | 23,2 % | 12,7 % | 14,5 % | 18,3 % |
| **intet** *(nu)* | 12,9 % | 19,3 % | 22,8 % | 12,7 % | 14,3 % | 17,9 % |

Premier League har et langt bredere felt, så loftet bider meget hårdere. Ved 6
vinder favoritten 17,4 % mod underhundens 9,6 %; uden loft er det vendt til
12,9 % mod 19,3 %. Det er grunden til, at ét fælles loft ikke kunne fungere:
et tal, der var mildt i Superligaen, halverede underhundens chance i England.

## Det, der afgjorde at loftet skulle helt væk: Chancen

Ovenstående er 1X2-benet. Den virkelige skade lå i **Chancen**, som ganger
indsatsen med `odds − 1`. Et loft klipper kun **gevinsten**, aldrig indsatsen —
så en Chance på høje odds havde ikke bare lavere gevinst, den havde **negativ
forventning**. Oddsene er fair, så en Chance skal give nul; klippes
udbetalingen, betaler man for at satse.

Målt over 3.000 simulerede Premier League-sæsoner med tolv spillere, tre pr.
Chancen-strategi (retfærdig andel 25 %):

| loft | ingen Chance | sikker | moderat | modig | modiges udbytte pr. sæson |
|---|---|---|---|---|---|
| 6 | 27,6 % | 41,5 % | 15,5 % | **15,5 %** | **−34 point** |
| 8 | 11,7 % | 26,5 % | 39,1 % | 22,7 % | −47 point |
| 12 | 9,3 % | 27,0 % | 33,3 % | 30,3 % | −27 point |
| **intet** | 8,6 % | 24,8 % | 30,6 % | **36,1 %** | **−2 point** |

Ved loft 6 vandt den, der **slet ikke brugte Chancen**, oftere (27,6 %) end den,
der brugte den modigt (15,5 %). Loftet gjorde altså funktionen uklog at bruge —
det stik modsatte af, hvad den er til for.

Dertil kom, at 46 udfald i Premier League lå på nøjagtig 6,00. Kortet viste
samme pris for et udfald med 17 % chance og et med 4 %, så den, der ville satse
modigt, valgte i blinde og ramte systematisk det dårligste.

**Prisen er bevidst valgt.** Højeste odds i Premier League er 24,39
(Arsenal–Hull ude), så én Chance kan give op til 187 point. Det sker 4,1 % af
gangene, og de øvrige 95,9 % koster indsatsen. Simuleringen siger, at det ikke
gør sæsonen til et lotteri: den modige vinder 36 %, ikke 80 %.

**En forkastet idé, værd at kende.** At skalere INDSATSEN med oddsene
(`maxStake = min(8, 15 % bank, gulv(40/(odds−1)))`) lyder som en pæn
mellemvej. Den er det ikke: med heltalsindsatser giver odds 6,00 så maks 40
point, mens odds 24,39 kun giver 23,4. Langskuddet ville blive **dårligere** end
den sikre kamp — det modsatte af hensigten.

## Combi-bonussen ændrer billedet

Combi ganger de **rene** odds og er omtrent halvdelen af pointene. Måler man kun
1X2, ser man kun det ene ben.

Superligaen, hele pointreglen:

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 6 | 14,2 % | 16,0 % | 16,9 % | 15,5 % | 15,4 % | 22,0 % |
| **intet** | 13,6 % | 17,0 % | 16,2 % | 15,8 % | 15,4 % | **22,0 %** |

Premier League:

| loft | favoritten | underhunden | uafgjort | hjemmebanen | værdijægeren | fornemmelsen |
|---|---|---|---|---|---|---|
| 6 | 15,1 % | 11,9 % | 13,7 % | 18,4 % | 17,5 % | 23,3 % |
| **intet** | 12,1 % | **18,5 %** | 16,6 % | 17,0 % | 14,3 % | 21,5 % |

To ting springer i øjnene. **`fornemmelsen` er stærkest i begge ligaer** når
combi'en tælles med — den, der tipper uden system, rammer et spredt sæt kampe
og får derfor en combi, der ikke ligner nogen andens. Og uafgjort-spilleren
taber på combi'en (22,1 % → 16,2 % i Superligaen), fordi combi belønner den,
der rammer **mange** kampe i samme runde, og det gør han sjældent.

**Konklusion:** uden loft ligger alle seks arketyper mellem 12 % og 22 % mod en
retfærdig andel på 16,7 %. Det er ikke perfekt balance, og det bliver det
aldrig — se hovedresultatet øverst. Men ingen strategi bliver længere straffet
af en teknisk detalje.

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

- **Combi-skævheden.** Odds-loftet er væk; combi'en er ikke undersøgt som en
  balanceskrue. `COMBI.LOFT` på 25 er nu det **eneste** loft tilbage i
  pointreglen, og det rammer oftere for underhund-spilleren end for favoritten
  — altså spiser det en del af den gevinst, fjernelsen af odds-loftet gav. Det
  er den næste, der bør måles.
- **Live-Elo.** Alle tal her er regnet på **seed-Elo**. Produktionen ompriser
  fremtidige kampe fra den løbende Elo, så de højeste odds kan blive større end
  de 24,39, der står ovenfor: et hold, der taber ti i træk, får en lavere rating
  end nogen seedning gav det. Uden loft er der ikke længere en grænse, der kan
  overskrides i stilhed — men der er heller ikke længere noget, der fanger et
  ekstremt odds, hvis Elo skulle løbe løbsk. Det er en bevidst afvejning, ikke
  et overset hjørne.
- **Feltet er en model.** Elleve ens spillere plus én afvigende er ikke ligaen.
  Rigtige spillere ligner hinanden mindre, så fordelen ved at stå alene er
  formentlig mindre end 2-4× i praksis. Retningen og sammenligningen mellem
  lofter er robust; det absolutte tal er det ikke.
