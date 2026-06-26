# Vedligeholdelse: hold afhængigheder opdaterede

## Hvorfor man kan sidde fast på en gammel major
- En version som `"vitest": "^1.6.0"` betyder "≥1.6.0 men <2.0.0" — du får **aldrig**
  v2/v3/v4 automatisk.
- `package-lock.json` + `npm ci` installerer de **eksakte** låste versioner, så selv
  nye minor-versioner kommer først ind, når lockfilen opdateres.
- Major-opdateringer skal derfor hentes **bevidst**.

## Automatisk (anbefalet): Dependabot
`.github/dependabot.yml` får Dependabot til hver mandag at åbne PR'er med
opdateringer for:
- frontend (`/`), Cloud Functions (`/functions`) og GitHub Actions.

Minor/patch samles i grupperede PR'er; **major-opdateringer kommer som separate
PR'er**, så breaking changes kan vurderes enkeltvis. CI kører på hver PR, så du
ser med det samme, om en opdatering bryder noget — merg når CI er grøn.

> Dependabot er aktivt, så snart `.github/dependabot.yml` ligger på
> standard-branchen (efter merge af denne PR).

## Manuelt / on-demand
Se hvad der er forældet (uden at ændre noget):
```bash
npm outdated            # kun rod
npm run deps:check      # rod + functions, viser nyeste tilgængelige majors
```

Hent ALT op på nyeste (inkl. major-spring), og installér:
```bash
npm run deps:upgrade
```
Kør derefter altid testene, før du committer:
```bash
npm run lint && npm test && npm run build
(cd functions && npm test)
```

## Gode vaner
- Tag majors én ad gangen, læs deres changelog (breaking changes), og lad CI verificere.
- Hold `firebase-functions`/`firebase-admin` opdaterede — Firebase CLI advarer ved
  forældede versioner under deploy.
- Slå `npm audit` op ved sikkerhedsadvarsler; brug `overrides` i `package.json` til at
  tvinge en sikker version af en transitiv afhængighed (som vi gør med `glob`).
