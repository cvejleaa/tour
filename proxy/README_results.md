# TdF etaperesultater — efter målstregen

Henter Tour de France **etaperesultat + alle indbyggede konkurrencer** kort efter
hver etape er afsluttet, via `procyclingstats`. Klassementer der dækkes:

| Nøgle    | Konkurrence            | Trøje    |
|----------|------------------------|----------|
| `etape`  | Etaperesultat          | —        |
| `samlet` | Samlet / GC            | gul      |
| `sprint` | Point (sprint)         | grøn     |
| `bjerg`  | Bjerg (KOM)            | prikket  |
| `ungdom` | Ungdom                 | hvid     |
| `hold`   | Holdkonkurrence        | —        |

## Filer
- `tdf_results.py` — service: scraping + cache + finalitet (ingen FastAPI).
- `tdf_api.py` — FastAPI-endpoints + valgfri scheduler + sikret refresh.
- `useStageResults.ts` — SolidJS-hooks (etapeliste, enkelt etape, stillinger).

## Hvorfor det er effektivt og høfligt
En PCS-etapeside indeholder **alle** klassementer i én HTML. Ét request pr.
etape giver dig derfor resultat + alle fem trøjer. Hele Touren = 21 requests,
hver hentet **én gang**: når en etape er afsluttet og resultatet ligger der,
markeres den `final` og hentes aldrig igen. Kun dagens igangværende etape
genhentes (hvert 15. min i aftenvinduet) indtil resultatet er der.

---

## Opsætning

```bash
pip install fastapi "uvicorn[standard]" procyclingstats apscheduler

export RACE_YEAR=2026
export ALLOWED_ORIGINS="https://din-side.web.app,http://localhost:3000"
export REFRESH_TOKEN="et-langt-tilfaeldigt-secret"
export DATA_DIR="./data"            # hvor JSON-cachen ligger
uvicorn tdf_api:app --host 0.0.0.0 --port 8080
```

### Trigge opdatering efter en etape — vælg én

**A. Raspberry Pi / always-on:**
```bash
export ENABLE_SCHEDULER=1
```
APScheduler-jobbet kører automatisk hvert 15. min mellem 16–21 (Europe/Copenhagen)
og henter nyeste etape til den er final. Kør processen under `systemd`
(`Restart=always`).

**B. Cloud Run / serverless:** lad scheduleren være slået fra og lad **Cloud
Scheduler** kalde endpointet på etapedage:
```
POST https://din-proxy.run.app/api/refresh
Header: X-Refresh-Token: <REFRESH_TOKEN>
```
(fx hvert 15. min i et aftenvindue). På Cloud Run skal cachen overleve
skalering — se Postgres-swap nedenfor, ellers mister du JSON-filerne når
instansen genstartes.

---

## Endpoints

| Metode | Sti                | Beskrivelse |
|--------|--------------------|-------------|
| GET    | `/api/stages`      | Etapeoversigt + `has_results`-flag |
| GET    | `/api/stages/{n}`  | Fuld etape: resultat + alle klassementer (425 hvis ikke klar) |
| GET    | `/api/standings`   | Aktuelle stillinger i hvert klassement |
| POST   | `/api/refresh`     | Hent nyeste afsluttede etape (kræver token) |
| POST   | `/api/refresh/{n}` | Hent en specifik etape (kræver token) |

---

## Frontend (SolidJS)

```tsx
import { For, Show } from "solid-js";
import { useStandings } from "./useStageResults";

export default function Standings() {
  const { data } = useStandings("https://din-proxy.run.app", 180_000);
  return (
    <Show when={data()}>
      <p>Efter etape {data()!.after_stage}</p>
      <For each={Object.entries(data()!.classifications)}>
        {([key, c]) => (
          <section>
            <h3>{c.label} {c.jersey !== "—" ? `(${c.jersey} trøje)` : ""}</h3>
            <ol>
              <For each={c.rows.slice(0, 10)}>
                {(r) => <li>{r.rider_name} {r.time ?? r.points ?? ""}</li>}
              </For>
            </ol>
          </section>
        )}
      </For>
    </Show>
  );
}
```

---

## Skift cachen til PostgreSQL (anbefalet på Cloud Run)

JSON-fil-cachen er fin på Pi. På serverless vil du have Postgres. Erstat
`JsonFileCache` i `tdf_results.py` med en klasse med samme fire metoder:

```python
class PgCache:
    def get_stage(self, year, n): ...        # SELECT data FROM stages WHERE year=.. AND n=..
    def set_stage(self, year, n, data): ...  # UPSERT (year, n, jsonb)
    def get_stage_list(self, year): ...
    def set_stage_list(self, year, data): ...
```
Brug `asyncpg` eller SQLAlchemy + en `JSONB`-kolonne. Service-laget rører ikke
andet, så det er et lille, isoleret skift.

---

## Caveats (vær realistisk)
- **Det er scraping.** Når PCS ændrer HTML, kan en parsing-metode fejle. Koden
  sluger fejl pr. klassement (tom liste frem for crash), og du bør holde
  `procyclingstats` opdateret: `pip install procyclingstats --upgrade`.
- **"Lige efter målstregen"** betyder i praksis få minutter efter — PCS skal nå
  at indtaste resultatet. Aftenvinduet/15-min-intervallet rammer det fint.
- **Provisoriske resultater.** Diskvalifikationer/tidsstraffe kan ændre en
  stilling efter første publicering. Dagens etape genhentes derfor resten af
  dagen; først når datoen er passeret fryses den.
- **Privat/hobby.** Hold trafikken lav (det gør finalitets-logikken automatisk)
  og vær en god gæst på PCS.
```
