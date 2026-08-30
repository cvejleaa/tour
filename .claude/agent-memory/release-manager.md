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

**For mig:** Slå ALTID game ID'erne op i `scripts/games.mjs` før jeg skriver en URL. Ikke "jeg tror det er `sl`" — det er det ikke. Testen bruger fixture-data med andre ID'er end produktion.

---

### 2. Bundel-probe — grep på UI-streng, ikke symbolnavn
**Fejl jeg lavede:** Jeg foreslod `grep -o "HoldXgListe" dist/index-*.js`, som returnerer falsk negativ, fordi komponent-navne overlever ikke minificering.

**Den rigtige metode:**
```bash
grep -l "hold for hold" dist/assets/*.js
```
Søg efter en tekst-streng, brugeren KAN SE i UI'et — ikke et symbolnavn fra koden.

**Lektionen (anden gang jeg skulle have lært det):**
- `PR #181`: `adminActions.js` lå i en chunk, ingen ville gætte. Grep på en streng brugeren ser.
- Her: `HoldXgListe` overlever ikke minificering, men "hold for hold" gør.

**Bundel-struktur:**
- Build ligger i `dist/assets/` (mindst 27 chunks), ikke under `functions-platform/`
- Søg over alle chunks: `dist/assets/*.js`

---

## Checkpoints for verifikation

Når jeg skriver en Release Manager-plan:

1. **Game ID'er** – slå dem op i `scripts/games.mjs` eller `src/features/games/`
2. **Linjetal** – tæl eller search, aldrig gæt (filen kan være kortere end jeg tror)
3. **Bundle-probe** – grep på en UI-streng fra den nye kode, som brugeren ville se
4. **Klik-stier** – trace til render-betingelse (fil:linje) eller bund ikke planen
5. **Måling** – hvis en påstand afhænger af live-data, kør scriptet selv

---

## Instruks fra koordinator (30/8 2026)

Tre fejl blev fanget efter jeg skrev første version:
1. Game ID'erne var forkert (`sl` i stedet for `superliga2627` og `pl2627-efteraar`)
2. Linjenummer var forkert (skrev 774, filen er kun 209 linjer; det rigtige er 188)
3. Bundel-probe var falsk negativ (grep på `HoldXgListe` i stedet for på UI-strengen `"hold for hold"`)

**Mønstre jeg skal gemme:**
- Game ID'er slåes op i `scripts/games.mjs` IKKE gættet
- Bundel-probe grep på en streng brugeren ser, ikke et symbolnavn fra koden
