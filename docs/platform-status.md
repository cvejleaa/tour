# Platform-status — tip.vejleaa.dk

> ⚠️ **FORÆLDET (skrevet juli 2026).** Statusdelen er overhalet af
> udviklingen — Fase B er leveret. Se [architecture.md](architecture.md) for
> hvordan systemet ser ud nu, og [drift.md](drift.md) for hvordan det køres.
> Bevaret som historik.

Levende overblik over, hvor langt vi er med den samlede tippeplatform.
Opdateres løbende. Se også `samlet-platform.md` (planen) og
`app-sammenligning.md` (VM vs. Tour).

**Kort sagt:** Platformen er LIVE på <https://tip.vejleaa.dk>. Skelettet virker
(én konto → spiloversigt → deltag), de eksisterende Tour-spillere er migreret,
og brandingen er ryddet op. Næste store blok er Fase B: de rigtige spil-sider.

---

## ✅ Færdigt (Fase A — fundament)

- [x] **Firebase-projekt `spil-89af9`** oprettet (Auth med e-mail + Google,
      Firestore, Hosting, Blaze, secrets, e-mail-afsender `tip@vejleaa.dk`).
- [x] **Domæne `tip.vejleaa.dk`** oprettet og live med SSL.
- [x] **Datamodel:** `games/{gameId}` + `games/{gameId}/players/{uid}` som
      opt-in-deltagelse. Security rules + 13 emulator-tests.
- [x] **Login:** e-mail/adgangskode **og** Google — samme konto virker begge
      veje. Selvbetjent godkendelse bevaret.
- [x] **Spiloversigt** (`/spil`): "Mine spil" / "Åbne spil — deltag", ét-kliks
      tilmelding, forlad-igen (uden point).
- [x] **De tre spil seedet:** VM 2026 (afsluttet), Tour de France 2026
      (afsluttet), Superligaen 2026/27 (åben). Status sættes i Admin →
      🗓️ Spil-tidsplan; seedet rører den ikke på spil, der allerede findes.
- [x] **Bruger-migrering:** 20 Tour-konti importeret til platformen med
      **bevarede kodeord** + profiler. Eksisterende spillere kan logge ind nu.
- [x] **Branding ryddet op** i platform-tilstand: neutral login/menu/profil,
      neutrale avatar-emojier, admin uden Tour-faner, Tour-spilsider skjult
      (redirect til spiloversigten), fane-titel "Vejleaa Tip".
- [x] **Deploy-pipeline:** GitHub-workflow deployer platformen med ét klik.
- [x] **Afslutnings-feature** (pause-kontakt + takke-mail) porteret til motoren.
- [x] **Superliga-datakilde:** Flashscore-modul i proxy-servicen (verificeret).

## 🔜 Næste (Fase B — spil-modulerne)

- [ ] **Spil-sider under `/spil/{gameId}`** pr. spiltype: fodbold (kampe/runder/
      knockout) og cykling (etaper/ryttere/klassementer) — flyt tips, stilling,
      bonus og ligaer ind under det enkelte spil.
- [ ] **Superligaen live:** koble Flashscore-modulet på, seede kampprogram
      (sæsonstart 24/7), åbne for tips.
- [ ] **Per-spil-scoring & stilling** oven på `games/{gameId}/players`.
- [ ] **Admin pr. spil:** Tour/Bonus/Ligaer/Ryttertyper flyttes ind under
      det enkelte spils admin.

## 📅 Efter Touren (26/7)

- [ ] **Migrér Tour-spildata** (tips/point/ligaer) til `games/tour2026/…` og
      re-synkronisér brugerne (fanger nye tilmeldinger siden 20/7).
- [ ] **Migrér VM-spildata** til `games/vm2026/…`.
- [ ] Redirect `vm.vejleaa.dk` og `tour.vejleaa.dk` → `tip.vejleaa.dk/spil/…`.

## 🧹 Løbende finpudsning

- [ ] Fælles huller fra motoren: lazy loading / code-splitting + error
      boundaries; autentificeret e2e-test.
- [ ] Rester af Tour-tekst der måtte dukke op (meldes/rettes ad hoc).

---

## 📚 Dokument-oversigt (så vi holder styr på det)

| Dokument | Hvad det er |
|---|---|
| **`platform-status.md`** (denne) | LIVE status/roadmap — "hvor er vi". Opdateres løbende. |
| `samlet-platform.md` | PLANEN/arkitekturen — målbillede, datamodel, migreringsplan. |
| `app-sammenligning.md` | VM- vs. Tour-appen: forbedringer på tværs. |
| `platform-deploy.md` | Sådan deployes platformen (workflow, secrets, owner). |

**Arbejdsdisciplin (så intet stikker af):** alt arbejde committes på arbejds-
branchen, samles i en PR og **merges ind på hovedbranchen** — mainline skal
altid matche det, der kører live. Platform-deploys sker fra hovedbranchen.

*Hvordan følge med live:* denne fil på GitHub
(<https://github.com/cvejleaa/tour/blob/claude/tour-de-france-game-knyiqq/docs/platform-status.md>)
opdateres, når vi rykker.
