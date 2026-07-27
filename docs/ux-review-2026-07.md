# UX-ekspertgennemgang — Vejleaa Tip (juli 2026)

> ⚠️ **HISTORIK (juli 2026).** Statusmarkeringerne er ikke vedligeholdt.

Tre UX-eksperter gennemgik platformen (mobil-først, PLATFORM_MODE, tip.vejleaa.dk):
**navigation & informationsarkitektur**, **indhold & info-placering**, og
**visuel polish & delight**. Nedenfor de vigtigste fund, prioriteret, med
status: ✅ implementeret · ⏳ udestående.

## Branding & fundament
- ✅ **Browserfanens titel** sagde "Tour de France Tip" på platformen → nu
  "Vejleaa Tip" (sat dynamisk efter `PLATFORM_MODE` i `main.jsx`; `index.html`
  har platform-standarden). `site.webmanifest` opdateret til Vejleaa Tip.
- ✅ **Nyt logo/PWA-ikoner**: samlesiden har et **neutralt, spil-uafhængigt
  platform-logo** (`public/logo.svg` — guld/hvidt flueben = "tip/ramt"), mens
  det spil-specifikke **fodbold-mærke** (`public/logo-superliga.svg`) bruges til
  Superligaen (via `game.logo` i spil-header og på spil-kortet). Favicon +
  app-ikoner + maskable genereres fra platform-logoet via
  `scripts/render-icons.mjs`; inkl. apple-touch + OG-tags.

## Navigation
- ✅ **9 faner wrappede i 3 rækker på mobil** → skiftet til det færdige
  vandret-scrollende `.tabs`-underline-system (`GamePage.jsx`).
- ✅ **Fanevalg lå ikke i URL'en** (brudt tilbage-knap/refresh/deling) → nu i
  `?fane=…` via `useSearchParams`.
- ✅ **Navne-kollision med top-nav**: spil-fanerne "Profil"/"Hjælp" → "🙂 Mit
  hold" og "❓ Sådan tipper du". Top-nav "Forside" → "Spil".
- ✅ **"Deltag"** førte ikke ind i spillet → navigerer nu direkte til Tip-fanen.
- ⏳ **Bund-navigation (mobil-tab-bar)** for Spil/Beskeder/Profil — overvej for
  bedre tommelfinger-rækkevidde.
- ⏳ **Kerne-handlingen (tip) er begravet** under forklarings-kort på Tip-fanen —
  overvej at flytte kamp-kortene op og gøre runde-bonus-kortet foldbart.
- ⏳ **Tab-tilgængelighed**: tilføj `aria-controls`/`role="tabpanel"`-kobling.

## Indhold & info-placering
- ✅ **Faktuel fejl**: "doblér din gevinst" (Chancen ganger med oddsene, ikke
  dobler) → rettet i `FootballTip.jsx`.
- ✅ **Per-kamp-lås** var uforklaret → linjen "Hver kamp låser ved sin egen
  kampstart" tilføjet på Tip-fladen.
- ✅ **Chancen-indsats = optjente point** forklares nu i hjælpen.
- ⏳ **Status-labels i platform-hjælpen** er hardkodet tekst ("åben"/"i gang") —
  bør trække fra samme `STATUS_LABEL`-kilde som `GamesPage`.
- ⏳ **Pulje-status undervejs**: vis "3/6 ligger i top-6 pt." før sæsonen er slut
  (data findes i `game.standings`), tydeligt markeret som foreløbigt.
- ⏳ **Saldo på Tip-fladen**: vis spillerens pointsaldo dér hvor Chancen-indsatsen
  besluttes.

## Visuel polish & delight
- ✅ **Manglende `:focus-visible`** på knapper/faner/kort → global fokus-ring.
- ✅ **`.badge` uden farve var "nøgen"** → neutral standard-baggrund + tabular-nums.
- ✅ **Statiske spil-kort** → `.card--link` med hover-løft + snap ved tryk.
- ✅ **Ubrugt `.hero`** → hero øverst på forsiden.
- ✅ **Udefineret `--c-red`-token** → `--c-err` flere steder.
- ✅ **Deadline "snart"** → diskret puls (reduced-motion-venlig).
- ⏳ **Chancen-panelet** bruger rå inline-styles frem for `.select`/en stepper-
  komponent — kunne poleres.
- ⏳ **Nav-links som klasser** (i stedet for inline `linkStyle`) for konsistent
  aktiv-farve med holdtema.

## Samlet
Fundamentet i `theme.css` er stærkt (tokens, dark mode, tabular-nums,
reduced-motion). De største løft var (a) rette den forkerte Tour-branding,
(b) genbruge færdige komponenter (`.tabs`, `.hero`) i stedet for at genopfinde
dem inline, og (c) konsekvent fokus/hover-feedback. Det er implementeret; de
⏳-punkter er noteret til en senere runde.
