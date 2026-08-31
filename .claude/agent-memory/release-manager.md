# Release Manager — hukommelse

## Mønstre jeg har brudt og skal aldrig gentage

### 1. Game ID'er — det korte kaldenavn er ikke spil-IDet
**Fejl jeg lavede:** Jeg brugte `sl` som game ID (`/spil/sl?fane=elo`), men det rigtige game ID er `superliga2627`.

**Korrekte game ID'er:**
- Superligaen 2026/27: `superliga2627` (findes i `scripts/games.mjs:69`)
- Premier League efterår: `pl2627-efteraar` (findes i `scripts/games.mjs:84`)
- Tour 2026: `tour2026`
- VM 2026: `vm2026`

**Den rigtige regel (CLAUDE.md):**
> En klik-sti i en plan skal være sporet, ikke antaget. Release Managers verifikationsplan henviste til en knap, der ikke fandtes for det spil, planen handlede om.

**For mig:** Slå ALTID game ID'erne op i `scripts/games.mjs` før jeg skriver en URL. Ikke "jeg tror det er `sl`" — det er det ikke.

---

### 2. Bundel-probe — grep på UI-streng, ikke symbolnavn
**Fejl jeg lavede:** Jeg foreslod `grep -o "HoldXgListe" dist/index-*.js`, som returnerer falsk negativ, fordi komponent-navne overlever ikke minificering.

**Den rigtige metode:**
```bash
grep -l "hold for hold" dist/assets/*.js
```
Søg efter en tekst-streng, brugeren KAN SE i UI'et — ikke et symbolnavn fra koden.

**Bundel-struktur:**
- Build ligger i `dist/assets/` (grep over ALLE chunks: `dist/assets/*.js`)
- Søg efter en streng fra den nye kode, som brugeren ville se

**Lektionen (anden gang jeg skulle have lært det — PR #181):**
- `adminActions.js` lå i en chunk, ingen ville gætte. Grep på en streng brugeren ser.
- `HoldXgListe` overlever ikke minificering, men `"hold for hold"` gør.

---

## Checkpoints for verifikation

Når jeg skriver en Release Manager-plan:

1. **Game ID'er** – slå dem op i `scripts/games.mjs`, aldrig gæt
2. **Linjetal** – søg eller tæl i filen (`src/pages/GamePage.jsx:188`), aldrig gæt på filen kan være kortere end antaget
3. **Bundel-probe** – grep på en UI-streng over alle chunks (`dist/assets/*.js`), ikke på et symbolnavn
4. **Klik-stier** – trace til render-betingelse (fil:linje) eller bund ikke planen
5. **Måling** – hvis en påstand afhænger af live-data, kør scriptet selv

---

## Instruks fra koordinator (30/8 2026)

Tre fejl blev fanget efter jeg skrev første version af udrulningsplanen for PR #186:

1. Game ID'erne var forkert (`sl` i stedet for `superliga2627` og `pl2627-efteraar`)
2. Linjenummer var forkert (skrev 774, filen er kun 209 linjer; det rigtige er 188 i `src/pages/GamePage.jsx`)
3. Bundel-probe var falsk negativ (grep på komponent-navn i stedet for på UI-strengen brugeren ser)

Test Manager og Quality Control bekræftede, at mønsterne holder, og at `grep -l "hold for hold" dist/assets/*.js` virker korrekt.

---

## Instruks fra koordinator (31/8 2026)

Fire fejl i udrulningsplanen for PR skala-ændring blev fanget:

1. **Bundel-proben skal bruge en streng, der er NY i PR'en — ikke bare synlig i UI**
   - **Fejl jeg lavede:** Jeg søgte efter `"ikke klar"`, der findes ALLEREDE på main (2 forekomster). Proben kunne både før og efter deployet — beviser ingenting.
   - **Den rigtige metode:** Brug en streng, der er tilføjet i denne PR, og verificer med:
     ```bash
     git show origin/main:src/features/games/GameStandings.jsx | grep -c "spillets egen skala"  # skal være 0
     grep -l "spillets egen skala" dist/assets/*.js                                             # skal være i bundlen efter
     ```
   - **De rigtige strenge for denne PR:**
     - `"spillets egen skala"` (ny skala-forklaring)
     - `"Tallene herunder"` (spillerpanelets sætning)
   - **Læring:** En UI-streng er nødvendig, men ikke tilstrækkelig. Den skal være NY i PR'en.

2. **Afterprøv aldrig at et værktøj HAR en tør-kørsel, før du foreskriver den**
   - **Fejl jeg lavede:** Jeg foreslod at ejeren køres 🔄 Genberegn point med "tør-kørslen først (default)". Det findes ikke.
   - **Fakta:** Knappen i `GameScheduleTab.jsx:533` kalder `recalc` direkte og skriver med det samme. Intet dryRun-flag.
   - **Læring:** Søg i koden (fil linje) efter `dryRun`-logik eller "preview"-tekst. Hvis den ikke er der, er der ingen tør-kørsel. Tell ejeren præcis hvad der sker.

3. Opret aldrig test-data i produktionen som verifikationstrin — ejeren har allerede det ægte fixture.

4. Verifikation skal foregå på det spil, hvor fejlen ses — ikke et anderledes spil.

---
