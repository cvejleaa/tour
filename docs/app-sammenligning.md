# Sammenligning: VM-appen vs. Tour-appen

Systematisk sammenligning af `cvejleaa/vm` (original-motoren) og `cvejleaa/tour`
(nyeste fork). Formål: finde forbedringer, der skal på tværs — nu eller når den
fælles platform bygges (se `samlet-platform.md`). Domæne-specifikt (fodbold
vs. cykling) holdes ude; det lever videre i hvert sit spil-modul.

---

## 1. Vigtigste enkeltfund: tipping kræver ikke godkendelse i Tour

I VM's security rules kræver skrivning af tips `isApproved()`; i Tour kræver
`bets`/`stageBets`/`bonusBets` kun `isSignedIn()`. En oprettet-men-ikke-godkendt
bruger kan altså tippe i Tour. Skal afklares: bevidst valg (man må gerne tippe,
mens man venter) eller en regression? VM guarder desuden `createdAt` mod
opdatering; det gør Tour ikke.

**Anbefaling:** Beslut bevidst; i den fælles platform bør udgangspunktet være
VM's strammere `isApproved()`-gate.

## 2. Hvad VM bør arve fra Tour (generiske forbedringer)

| # | Forbedring | Hvor i Tour | Værdi |
|---|---|---|---|
| 1 | **Privat e-mail via `userContacts`** + `migrateEmailPrivacy` | `features/auth/useAuthActions.js`, `functions/index.js` | E-mails væk fra offentlige profiler, men stadig tilgængelige for admin/broadcast. VM's Auth-only-model kan ikke det. |
| 2 | **Broadcast-mail** (`sendBroadcastEmail` + `BroadcastTab` + skabelon) | `functions/index.js` ~L1009, `features/admin/BroadcastTab.jsx` | Admin kan skrive til spillerne — VM har ingen broadcast. |
| 3 | **Liga-joinlinks + `/tilmeld`** (`joinLink.js`, `JoinPage.jsx`) | `features/leagues/`, `pages/JoinPage.jsx` | Delbart invite-link der overlever login/signup (localStorage, 7 dages TTL). Stærk onboarding. |
| 4 | **Sikkerhed i AI-recap:** `sanitizeName()` mod prompt-injection | `functions/leagueRecap.js` | VM's leagueRecap sender rå displayNames ind i AI-prompten. Lav indsats, bør backportes straks. |
| 5 | **Afviste brugere blokeres i invite-flowet** | `functions/invites.js` (`getUserStatus`-tjek) | I VM kan en `rejected` bruger godkende sig selv igen med en gyldig kode. |
| 6 | **Rules-hardening: sammensatte doc-ID'er** (`uid_stageId` m.fl.) | `firestore.rules` | Forhindrer strukturelt dublet-tips/-svar. VM pinner ikke doc-ID'er. |
| 7 | **Presence-statistik + ActivityTab** | `features/presence/`, `features/admin/ActivityTab.jsx` | Privatlivsvenlig førsteparts "hvem er aktive"-indsigt til at spotte frafaldne spillere. |
| 8 | **Hosting cache-headers** (`no-cache` på index.html, `immutable` på assets) | `firebase.json` | Undgår at brugere hænger på en gammel SPA-shell efter deploy. VM mangler dem. |
| 9 | **Sæson-dimension** i data/indexes (`season` på stageBets/bonusBets) | `firestore.indexes.json`, rules | Gør motoren flerårig — direkte relevant for platformens genbrugs-tanke. |
| 10 | Team-temavælger (`TeamThemePicker`) og point-breakdown i stillingen | `features/profile/`, `features/leaderboard/` | Generisk UX-mønster; kolonnerne mappes pr. spiltype. |

## 3. Hvad Tour bør arve fra VM (generiske forbedringer)

| # | Forbedring | Hvor i VM | Værdi |
|---|---|---|---|
| 1 | **SyncHealthBanner + `useSyncStatus`** | `features/admin/SyncHealthBanner.jsx`, `config/syncStatus` | Gør en stille-død synk (udløbet token, API-fejl) synlig med det samme. Tour har en synk-pipeline (proxy/tourSync) men nul overvågning af den. |
| 2 | **Integrationstests** (`pipeline.integration.test.js`, `knockout.integration.test.js`) | `functions/` | Tester hele kæden på tværs af moduler + emulator-seedet data; koder en rigtig produktionsbug (NED–MAR straffespark) som permanent regressionstest. Tour har kun unit-tests. |
| 3 | **`deploy.yml`-forbedringer:** self-healing invoker-IAM for Gen2-callables, `onlyFunction`-input, detektion af delvist fejlede functions-deploys | `.github/workflows/deploy.yml` | Tour's deploy er tavs ved delvise fejl og har ingen IAM-reparation. VM's er den kamptestede. |
| 4 | **`docs/learnings.md`** — driftserfaringer/runbook | `docs/learnings.md` (11 KB) | Tour har intet tilsvarende; erfaringerne bør samles ét sted for platformen. |
| 5 | **Statistik-side (tip-præcision)** — hitrates pr. kamp/spiller, "dagens topscorer", "mest overraskende resultat", to-fanet StatsPage | `features/stats/`, `pages/StatsPage.jsx` | Motoren er domæne-agnostisk forudsigelses-analyse; skal blot udtrykkes mod Tour's scoring. Tour har ingen statistik-side. |
| 6 | **`DaySelector`** ◀ dag ▶-navigation | `components/DaySelector.jsx` | Ren generisk komponent med tests; Tour er dag/etape-baseret og mangler den. |
| 7 | **BonusSubmissions** — manuel godkendelse af fritekst-bonussvar (fuzzy-match + acceptedAnswers) | `features/admin/BonusSubmissions.jsx` | Generisk moderations-UX for stavefejl i bonussvar. |
| 8 | **Alternativ/parallel stilling** som mønster (Sharpshooter) | `features/leaderboard/SharpStandings.jsx`, `stats/altStandings.js` | Selve fodbold-formlen portes ikke, men "ekstra pointmodel over samme tips" er et sjovt, genbrugeligt koncept. |

## 4. Fælles huller (ingen af apperne har det)

- **Ingen lazy loading / code-splitting og ingen error boundaries** i nogen af
  apperne (`lazy(`/`Suspense`/`ErrorBoundary`: 0 hits i begge `src/`). Én
  komponent-fejl kan vælte hele appen. Bør løses i platform-skelettet fra dag 1.
- **E2E dækker kun uautentificerede flows** (samme 4 smoke-tests i begge).
  Login → tip → stilling burde med, evt. mod emulator.

## 5. Hvad der forbliver domæne-specifikt (spil-moduler)

- **Fodbold-modulet (fra VM):** gruppespil/knockout-bracket (`standings.js`,
  `knockout.js`), football-data.org-klient + resultatsynk med selvhelende
  90-min-score (`resultsSync.js`, `footballData.js`), fixtureImport, live
  kamp-UX (`MATCH_STATUS`, liveminut), Flag, GroupWinnerDerivedTab, PreviewTab,
  turnerings-/kampsider.
- **Cykel-modulet (fra Tour):** etaper/podie-scoring (`tourScoring.js`),
  PCS/letour-scraping via det eksterne Python-proxy-service (`proxy/`),
  startlistSync, LiveTicker (letour-feed), StagePresentationPage,
  RiderSearch/TeamBadge.
- Python-proxy-mønsteret (eksternt scraper-service med egen cache og tests) er
  værd at genbruge, hvis et fremtidigt spil mangler en ren API.

## 6. Prioriteret rækkefølge

**Straks (små, sikkerhed — kan gøres i VM-repoet uden risiko for spillet):**
1. `sanitizeName()` i VM's leagueRecap (afsnit 2.4).
2. `rejected`-blokering i VM's invites (afsnit 2.5).
3. Afklar `isApproved` vs `isSignedIn` på tipping i Tour (afsnit 1).

**I platform-skelettet (arves fra start):**
- Tour: userContacts, joinlinks, broadcast, rules-hardening, cache-headers,
  sæson-dimension, presence.
- VM: `isApproved`-gate, deploy.yml, integrationstest-disciplin, learnings.md,
  SyncHealthBanner-mønsteret.
- Nyt: lazy loading + error boundaries, autentificeret e2e.

**Efter migreringen (features til glæde for spillerne):**
- Statistik-side og DaySelector til Tour-spillet; BonusSubmissions,
  ActivityTab/presence og TeamThemePicker på tværs; evt. alternativ stilling.
