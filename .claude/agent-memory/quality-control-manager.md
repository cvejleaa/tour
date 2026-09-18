# Quality Control — varig hukommelse

Kun MØNSTRE. Et afsnit navngivet efter en commit eller et PR-nummer hører i
PR-teksten, ikke her.
(Destilleret 1/9-2026 og igen 18/9-2026: 60 KB / 11 afsnit → dette.)

## Plan-gennemgange: de dyre fund er designfejl, ikke kodefejl

- **Modsiger tallet noget lige ved siden af?** Et kampkort viste "hvem er
  stærkest" af ren ratingforskel, mens odds lægger 60 point hjemmebanefordel
  oveni — pilen modsagde 1X2-knapperne under sig.
- **Lover teksten mere end handlingen giver?** "Åbn ligaen →" landede på en
  liste over ALLE ligaer, foldet sammen. Samme fælde i en bekræftelsesdialog:
  "Dine point, tips og liga-medlemskab slettes" er kun sandt, hvis koden
  faktisk sletter dem.
- **Et NYT tal, der duplikerer et tal fladen allerede viser fra en ANDEN
  kilde, er en modsigelse med forsinkelse.** Vis det nye KUN hvor det afviger
  fra det gamle, så det bærer information i stedet for støj.
- **Fladen har som regel allerede sagt det.** Optæl kortets eksisterende
  udsagn FØR nyt lægges på; nyt indhold skal fortrænge noget eller lægge sig
  som kvalifikator på et tal, der allerede står der.
- **En AFSLØRING skæres pr. LIGA, aldrig pr. union af mine ligaer.**
  `useGameStandings().standings` er unionen af mine ligaer — rigtig som
  læse-afgrænsning, forkert som RANGLISTE. Ved nul/én liga: enten "spring
  over" eller "bliv med i en liga" — en etrækkers rangliste er ingen af
  delene.
- **En ny udfoldning skal måles mod at kunne læses højt, ikke mod
  bekvemmelighed.** Det interessante skal stå over listen som én sætning;
  fold kun det, ingen leder efter.
- **Et statusfelt, der overskrives, kan ikke bære en alarm.** Kræver en
  hændelse menneskelig handling, skal den persisteres og kvitteres — en alarm
  må aldrig kombinere `kraeverKvittering: true` med selv-lukning.
- **ALARM eller ADVARSEL?** Kan tilstanden være permanent og legitim, hører
  den i drift-kortets linje (et tal der skal mod nul), ikke i alarmen.
  Alarmen tager det SYSTEMISKE ("alle fejler", "tælleren står stille").
- **Flere skrivepunkter i ét dokument = sidste skriv vinder.** Saml status i
  hukommelsen, skriv ÉN gang med `niveau = værste(...)`.
- **Et dashboard, der kun tegner kort for dokumenter der FINDES, er blindt for
  den værste fejl.** Tegn kort pr. FORVENTET type + en fallback for uventede.
- **Tør-kørsel må aldrig kvittere som en rigtig kørsel.**
- **Tærskler hører dér, hvor sandheden bor** — serveren skriver dem, klienten
  hardkoder ikke en cron.
- **En admin-flade over PRIVATE data: efterprøv LÆSE-vejen, ikke kun
  skrive-vejen.** Spørg: hvilken query fylder listen, og hvilken regel-gren
  tillader den?
- **En ny admin-fane/knap skal navne-tjekkes mod fladens EGEN fanerække** —
  og mod dens egne spejlede lister (fx en hardkodet kopi i et script, en
  anden kopi i en guide). To spejle af samme liste skal rettes i samme PR.
- **Interaktivitet gør en flades latente løgne synlige.** Et statisk element
  kan bære en tom/forkert kasse i årevis; i samme øjeblik man kan KLIKKE på
  den, forlanger den rigtigt indhold. Gennemgå datakilden FØR interaktionen.
- **En layoutfunktion, der placerer efter INDEX/GRAD i en liste, kan ikke
  bære en filtrering eller en positions-konvention på tværs af niveauer
  uden at blive efterprøvet dér.** Fokus/udfoldning skal MASKERE (behold
  positioner, sluk indhold), ikke omberegne — og en fast forklaringstekst
  ("nederst = fundament") kan være sand på ét niveau og falsk på et
  udfoldet under-niveau. En "fold ud"-visning måles i STREGER (nye kanter
  oveni), ikke i kasser — tæl også de kanter der bliver INDEN I den nye
  gruppe, ikke kun til den.
- **En NY genvej fra flade A til flade B skal efterprøves mod B's EGEN
  filtrering** (startrunde-gate, kampe uden runde, medlems-gate). Spørg:
  hvilke rækker på A kan B ikke vise — og er A's egen liste sand (viser den
  kun det, den selv hævder at vise)?
- **Retter du en manglende gate på ÉN flade, så tæl de øvrige FORBRUGERE af
  samme rå liste/data.** Grep gaten (fx `fraStartRunde`), ikke fladen — den
  ungatede indeholder pr. definition ikke gatens navn.
- **En ny sætning i en guide skal gates som sine NABOAFSNIT i samme fil** —
  ellers forklarer regelbogen et tal, spillet aldrig får.
- **En ny visuel markering skal tjekkes mod spillets/kortets eksisterende
  farvesprog** (en accent-farve, en donut-form) og mod modifikatorer der kan
  optræde SAMTIDIG (fx `opacity` der danner stacking context og dæmper børn
  mere end forælderen).
- **En effekt, der ruller eller fokuserer, må ikke hænge på et polling-ur** —
  den trækker brugeren tilbage hvert tick. Og en test på den skal stubbe den
  rigtige DOM-API og assertere PRÆCIS target, ikke kun at en funktion findes.
- **Et nyt link, der omslutter en hel række, ændrer betydningen af det ord
  det omslutter** (nestede anchors findes ikke) — er husets mønster "et
  holdnavn linker til holdsiden", kan modstanderen i samme række ikke også
  være sit eget link. Skriv valget ind i den dispositionerede test-liste for
  emnet, og ret evt. hjælpetekst i samme PR.
- **En tæller/aggregat over en filtreret liste skal bruge SAMME kildeliste
  som `.map()`'et, der tegner kortene** — ikke en tidligere, snævrere
  variabel i samme funktion. Modstykket: ikke enhver brug af den snævre liste
  er en fejl, kun der hvor tælleren skal beskrive noget spilleren SER.

## Gates, evner og proxier

- **En proxy-gate findes ikke ved grep — den indeholder ikke evnens navn.**
  (`puljeLockRound` som proxy for "har kickoff-synk"; `exists()` som proxy
  for "er aktiv deltager", indtil et dokument kunne overleve medlemskabet.)
  Gate på en delt evne-funktion (`harX()`), aldrig på noget der blot plejer
  at følges med evnen — og gør en evne "kan forlades/deaktiveres uden
  sletning", skal HVER `exists()`-gate (rules, server, klient) erstattes af
  en delt "er AKTIV"-funktion.
- **Klient og server skal gates på SAMME nøgle**, og en evne hvis
  konfiguration er PR. SPIL må ikke gates på PROVIDER (en tredje kilde er
  ortogonal). Læser den ene game-doc'et og den anden en statisk liste, kan de
  divergere i begge retninger (knap uden server, eller server uden knap).
- **En gate, der er tjekket med en dialogs render-BETINGELSE ét sted, skal
  spejles ORD FOR ORD, aldrig strengere, hvor den bruges igen** (fx en
  Forlad-knap gatet på `status` i stedet for det faktiske sletbarheds-
  prædikat i rules — samme spiller mistede adgang, koden gav en generisk
  fejl frem for den handlings egen tekst).
- **En klient-sletning/oprydning kan ikke rydde op i alt — og en anden
  skrivevej kan genoplive det slettede.** Spørg ved enhver
  "fjern/forlad/slet"-flade: hvilke SAMLINGER nævner uid'et stadig bagefter,
  og findes der et job (typisk et `tx.set(..., {merge/mergeFields})` et
  andet sted), der skriver dokumentet tilbage ved næste afgjorte kamp/andet
  event? Rækkefølgen er ofte svaret: underliggende data først, ejer-
  dokumentet sidst, og kun fra serveren. Retter man ét hul i en DELT
  oprydnings-helper (rører fx to samlinger), så spørg om en TREDJE samling
  også kan skrive dokumentet tilbage.
- **En test kan fastfryse en fejl.** Søg `not.toBeInTheDocument`, `toBeNull`,
  `understoettet:false`, `toEqual([])` om netop det du udvider, og vend dem
  bevidst. Strukturelle "præcis ét element"-assertions er derimod nyttige
  tripwires, ikke fejl.
- **Et delt prædikat, kopieret ind i en test i stedet for importeret, er en
  umålt divergensrisiko** — særligt ironisk i en test der hedder "fladen
  tilbyder ⇔ reglerne tillader". Eksportér prædikatet, når en tredje
  forbruger dukker op.
- **En optimering/genvej sekventeret EFTER en skrivning, det gamle forbud
  beskyttede (fx "aldrig skriv facit fra synk X"), er en anden risikoklasse
  end en genvej PÅ selve facit-stien** — men et eksisterende sikkerhedsnet
  et andet sted (et sweep, der samler op en time senere) fritager IKKE for
  husets "kan ikke fejle tavst": fejler genvejen KONSEKVENT, kan ingen se
  forskel på "virker" og "altid død", bare langsommere. Kræv et letvægts-
  signal EFTER trinnet, aldrig før (det ville bryde den orden sikkerheden
  hviler på).
- **To skrivepunkter/læsesteder, der deler samme tæller/felt, skal give
  SAMME dom.** Rettes klientens tekst/alvorlighed for en tilstand, så find
  den ANDEN flade (typisk et automatisk sweep, der skriver samme felt til et
  drift-kort) og spørg, om DEN drager samme konklusion — dens
  advarselsbetingelse kan stadig tjekke en delmængde af de samme flag.
- **Et miljøflag navngivet efter én virkning kan slå ALLE virkninger til**
  (`NODE_ENV=development` for at bevare debug-source slog samtidig
  StrictMode til og dobbelt-kaldte mount-effekter). Spørg ved ethvert flag:
  hvad ELLERS læser det?
- **En ny undtagelseskonvention skal anvendes på sit eget motiverende
  eksempel** — en regel, der ikke gælder det første tilfælde den blev
  skrevet for, bliver aldrig fulgt.
- **Et delt handler mellem to konceptuelt forskellige knapper kan navigere
  væk, før en on-page-assertion ser sit vindue** — en implicit timing-
  antagelse (fx at en optimistisk lokal skrivning når at opdatere en
  listener FØR et await løses), ikke en garanti fra koden.

## Data, kilder og målinger

- **Et felt i en plan-tabel uden en målt kilde er en påstand.** Kræv
  fil:linje i måle-scriptet eller en committet payload — ikke en kolonne der
  blot NÆVNER et feltnavn.
- **Et citeret "målt i scripts/X" skal efterprøves ved at LÆSE scriptet, ikke
  ved at tro på filnavnet.** Et script kan hedde noget der lyder som en
  tidsmåling og indeholde nul kald til `Date.now`/`performance.now`.
- **En prøve på ÉN post beviser en kildes eksistens, ikke dens dækning.**
  En whitelist plus "ét brud → afvis hele posten" gør whitelisten til en
  DÆKNINGSGRAD — kræv afvisningsraten målt over en hel sæson, ellers ved
  ingen om fladen er tom for 2 % eller 40 % af kampene.
- **Klient-beregnet facit og server-skrevet facit er TO kilder til samme
  tal, og de skifter ikke samtidig.** Vælg ÉN kilde for et nyt pulje-/
  sæsonslut-tal; siger det noget andet end nabokortet, er det en modsigelse.
- **Et "har-vi-det-allerede"-filter uden en AFVIST-markering er en
  giftpille** — en post der permanent fejler valideringen hentes igen for
  evigt og æder loftet. Skriv en `…AfvistAt`, så retryet backer af.
- **Skil FEJLARTERNE i en tæller.** "Vores facit ≠ deres facit" (datahændelse)
  og "vi kunne ikke parse deres data" (vores kode) er to forskellige
  incidents; ét fælles tal kan ikke fortælle hvilken.
- **Et tal uden kode er en påstand — også i et JSDoc eller en kode-kommentar,
  og også når det er PRÆCIST.** Et præcist tal ældes ("13 ud af 37"); brug
  den kvalitative form, med mindre tallet regenereres automatisk. En
  kommentar der PÅSTÅR en udledning (fx "halvdelen af X's budget") uden at
  koden faktisk regner den, er en skjult kobling der stille bliver forkert.
- **Et NYT statustal (dæknings-/kvalitetsmåling) skal have en
  SELV-CHECKENDE invariant** (fx "aktiveret ⇒ renderet"), ikke kun en
  "der er poster"-vagt — en vagt der blot tæller logposter kan være grøn,
  mens selve krediteringen falder på gulvet for en ny type. Tæl pr. TYPE,
  ikke pr. linje, når en delt log får en ny posttype. Og spørg altid: ville
  DETTE tal have fanget de sidste to ægte fejl der slap igennem? Et
  kvalitetsmål skal selv skrive, hvad det IKKE kan se (regler, server,
  tallenes rigtighed) — ellers sælger det ro, der ikke er dækning for.
- **Et filter på en MÅLING skal være en OVERMÆNGDE af det, der måles** —
  under-rapportering giver falsk alarm i den alvorlige kategori. Og en
  sti→gruppe-tabel uden fallback-gruppe taber elementer tavst; kræv en
  "Andet"-gruppe + en test på gruppesum == total (og at totalen vises). En
  'ukendt sti'-fallback kan i praksis skjule en RIGTIG mappe, der blot ikke
  stod på listen — spor den til dens faktiske forbrugere.
- **Et cachet id/felt, der springer et frisk opslag over ved blot
  formatgyldighed, mister en gratis selvhelbredelse** hvis kilden
  omdøber/genudsteder det — spørg hvilken fejlgren rammer et forældet men
  gyldigt-formateret id, og om DEN gren har en udgang/karantæne.
- **En test, der kun tjekker at noget blev VIST, beviser ikke hvad der
  stod** (CLAUDE.md) — men omvendt beviser et fil:linje-citat i en
  test-kommentar heller ikke noget, hvis det peger på en NABO-kode-sti med
  samme overskrift/navn frem for den kode, der faktisk implementerer
  påstanden. Og en invarianttest opkaldt efter en historisk bug skal
  reproducere den PRÆCISE handling buggen brugte (samme kald/felt/sti), ikke
  en beslægtet skrivning.
- **Et dokument kan modsige sig selv i to afsnit** — en kort "sådan gør du"
  et sted og et udførligt, opdateret afsnit et andet sted i SAMME fil. Tjek
  ALLE forekomster af en ændret kommando/sti/påstand i filen, ikke kun den
  diffen rørte.
- **Et allerede afsendt/postet dokument (mail, opslag) må ikke rettes i sin
  arkiverede form uden en RETTET-markør.** Husets eget precedent
  (Runde-Bottens `oprindeligTekst`/`rettetAt` i drift.md) er at bevare
  originalen ved siden af rettelsen. Redigeres en "skrevet til at sendes"-fil
  (fx `docs/mail-*.md`) måneder efter afsendelse — selv for at rette en reel
  unøjagtighed — uden en dateret markør, lyver arkivet om hvad modtageren
  faktisk fik at vide. Et rent internt referenceafsnit i samme fil (tydeligt
  mærket "ikke til mailen") kan til gengæld frit opdateres.

## Nye tal og ny skala på en eksisterende flade

- **Et nyt aggregat-tal skal komme af den samme KILDE som fladens
  eksisterende tal om samme ting** (fx "favorit" af odds, aldrig af rå
  ratingforskel — odds har hjemmebanefordel oveni). Aggregér ODDS-VÆRDIER
  aldrig over tid, hvis modellen kan ændre sig midt i sæsonen (kun ulåste
  kampe genprises) — tæl i stedet model-invariante ting (favorit-identitet).
- **Retrospektivt må aldrig klistres ind i det prospektive** — et nyt
  retrospektivt tal (halvleg, målscorere) hører i sin egen blok, gatet på
  facit + felternes eksistens, ikke sammenblandet med et "hvem vinder"-tal.
- **To gates om to spørgsmål:** et TAL pr. kamp gates på felterne (er de
  hentet endnu), en FORKLARING i guiden gates på EVNEN (har spillet den
  overhovedet) — en regelbog må ikke forklare et tal, spillet aldrig får.
- **Et tal uden fortegn måler ANSEELSE, ikke PRÆSTATION** ("mest overraskende"
  kan vise en positiv værdi for noget der faktisk var negativt, hvis vagten
  kun tjekker "forskellig fra bedst").
- **Procent-reglen:** om DIG SELV er ok, om NAVNGIVNE ANDRE er forbudt,
  kollektive tal skal være en brøk. Et tal om et HOLD (ikke en person) er
  uden for den regel.
- **En SKALA-forskel er en anden fælde end en TILGÆNGELIGHEDS-gate.** "Er der
  noget at vælge" (fx `antal <= 1`) kan være sandt om HVEM men falsk om
  hvilket REGNESTYKKE der gælder (spillets total vs. en ligas startRound-
  afgrænsede sum) — spørg altid: identiske i VÆRDI, eller kun i MÆNGDE? En
  forklaring, der er gatet på det SAMME som selve fænomenet, vises aldrig
  hvor den behøves — læs de to render-betingelser side om side. Rettes
  skalaen ét sted, tæl ALLE flader der viser samme spillers tal (typisk
  flere end man tror, og especially farlig er en visning der forlader appen
  — en delt tekst, et referat). En mocket hook (fx `leagues: []` overalt)
  kan skjule, at en hel skala-gren i testene aldrig faktisk kørte.
- **En sætning, der navngiver et objekt med `{navn}` foran et substantiv,
  skal bøjes (genitiv-s)** — ellers er den grammatisk forkert for netop de
  navne, der ikke tilfældigvis allerede ender rigtigt. Foretræk at UNDGÅ at
  navngive ("ligaens medlemmer" frem for "{liga.name}s medlemmer"), hvis
  fladen allerede har et mønster for det.
- **En tæller, der IKKE kan skelne "0 point" fra "deltog ikke"**, og et
  gulvet total-felt, betyder at `total − total_uden_X ≠ delta[X]` generelt.
  Spørg om en ny beregning implicit antager, den kan trække to gemte,
  gulvede/nullable tal fra hinanden.

## Tests, målinger og selectorer

- **En Playwright-selector skal verificeres mod den ÆGTE komponent**, ikke
  antages fra testens egen tekst — grep den i `src/`, og tjek at testens
  udnyttede render-BETINGELSE (ikke bare selectoren) rent faktisk styrer
  elementet.
- **En stabil nøgle i en flade-vagt er kun stabil mod redigeringer ANDRE
  steder** — en NY duplikat med samme (fil, komponent, tag, tekst) indsat
  FØR en kendt urørt makker forskyder hele nummerrækken: den nye, utestede
  knap arver den gamles "kendt"-nummer, og den gamle glider ud som "ny".
  Spørg ved en knap der deler tekst med en søster: kom den FØR søsteren i
  kildeteksten? Og læs en auto-opdaterings-diff linje for linje som en liste
  af ægte nye elementer, ikke kun et antal.
- **"Vist" i jsdom betyder kun "i DOM'en", ikke synligt** — et element i en
  lukket `<details>` tæller som vist, fordi jsdom ikke har layout. Navngiv
  målingen efter det den faktisk kan se, eller skriv begrænsningen ved
  tallet.
- **React committer et helt undertræ som ÉN MutationObserver-record** — en
  observer der ikke selv går børnene igennem ser kun det yderste element.
- **To afkrydsninger med INDLEJREDE prædikater (A ⊃ B) skal være
  radioknapper/en valgliste**, ikke to uafhængige checkbokse; og et nyt
  badge-ordforråd skal beholde det ord, et eksisterende filter allerede
  bruger.
- **Et nyt Vite-mode/`.env.<mode>` skal spores gennem `loadEnv`s fletning**
  (tom prefix = alle vars) og efterprøves for kollision med eksisterende
  build/deploy-trin — en dummy-outDir må aldrig kunne forveksles med den
  rigtige (`firebase.json` peger fortsat på den ægte `dist`).
- **En bar `<table>` uden wrapper arver mobil-bredde-risiko**, fordi jsdom
  ikke ser ombrydning — og to identiske emoji med forskellig betydning på
  samme skærm løses ikke af en hjælpetekst; svaret er et andet symbol.

## Faste steder og konkrete tal (efterprøv, gæt ikke — ikke udtømmende)

- `MatchElo.jsx` bruger odds for favorit, aldrig rå ratingforskel.
  `outcomeOdds` er FAIR odds af egen Elo, uden vig — "markedets syn" findes
  ikke i dette repo.
- `firestore.rules` er ÉN fil for BEGGE projekter (tip + tour). En rules-test
  på `getDoc` beviser ikke en `getDocs`: en flade der henter en HEL samling
  er en `list`, og hele forespørgslen falder, hvis reglen afviser ét
  dokument i den.
- `kickoff`-feltet er selve tip-vinduet (`request.time < kickoff`) — ingen
  berigelses-kilde må skrive det.
- Sweep-/synk-budgetter er eksplicit afsatte tidsbudgetter pr. spil inden for
  en fælles function-timeout; nyt arbejde i et sweep skal have sit EGET
  budget skrevet ud af helheden og lægges SIDST i løkken, efter
  sikkerhedsnettene — en platform-timeout kan ikke fanges af try/catch, og
  rammer den, mister BÅDE dette og det næste spil i løkken deres alarm.
- Manuelle "kør nu"-callables skal have SAMME timeout i klient og server.
- Manuelle synk-knapper for kampdata bor samlet i spillets Spil-tidsplan-fane
  — det er dér en administrator leder efter dem.
- Liga-medlemskab er ÉN server-side skrivning, spejlet ud til flere felter
  (spillerens `leagueIds`, samme felt på ALLE spillerens bets) — en
  medlemskabsændring har derfor et asynkront vindue, hvor andre flader endnu
  viser den gamle tilstand.
- Global admin har klient-læse-bypass på de fleste samlinger, men ikke
  nødvendigvis alle — tjek den konkrete samling, antag det ikke.
