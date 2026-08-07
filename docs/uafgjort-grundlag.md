# Grundlaget bag uafgjort-kalibreringen

`DRAW_BASE` blev sat til 0,305 ud fra **6.143 spillede kampe** med **1.493
uafgjorte**. Det er de to tal, hele ændringen hviler på, og de står i både
`src/lib/superligaScoring.js`, [elo-metodik.md](elo-metodik.md) og
[spilbalance.md](spilbalance.md).

Denne side findes, så de kan **efterprøves uden at hente rådata ned igen**.
Rådataen er ~2 MB fra to eksterne API'er, og hverken de eller `/tmp` overlever
særlig længe. Uden tabellen nedenfor er "6.143 kampe" bare et tal, nogen har
skrevet ned.

Tabellen er kopieret direkte fra `node scripts/maal-uafgjort.mjs` (afsnittet
`GRUNDLAG PR. SÆSON`). Headeren i det script har curl-kommandoerne til at hente
sæsonerne igen, hvis tallene skal genskabes fra bunden.

## Hvorfor "brugt" er mindre end "færdigspillet"

Elo skal varmes op. De første **200 kampe** i hver liga bruges kun til at flytte
ratings fra 1500 mod noget retvisende; de tælles ikke med i kalibreringen, fordi
en kamp mellem to hold, der begge står på startværdien, ikke siger noget om
sammenhængen mellem styrkeforskel og uafgjort. Derfor mangler Superligaens
første sæson helt (198 kampe, alle inden for opvarmningen) og Premier Leagues
2016 er halveret.

## Superligaen — 13 sæsoner

| sæson-id | færdigspillet | brugt | uafgjort | rate |
|---|---|---|---|---|
| 7677 | 198 | 0 | 0 | — (opvarmning) |
| 8559 | 198 | 196 | 49 | 25,0 % |
| 9524 | 198 | 198 | 42 | 21,2 % |
| 10392 | 251 | 251 | 67 | 26,7 % |
| 11488 | 251 | 251 | 64 | 25,5 % |
| 12725 | 247 | 247 | 68 | 27,5 % |
| 13958 | 242 | 242 | 55 | 22,7 % |
| 15429 | 193 | 193 | 49 | 25,4 % |
| 16387 | 193 | 193 | 59 | 30,6 % |
| 17703 | 193 | 193 | 54 | 28,0 % |
| 20962 | 193 | 193 | 49 | 25,4 % |
| 23624 | 193 | 193 | 54 | 28,0 % |
| 27018 | 193 | 193 | 45 | 23,3 % |
| **I alt** | **2.743** | **2.543** | **655** | **25,8 %** |

## Premier League — 10 sæsoner

| sæson | færdigspillet | brugt | uafgjort | rate |
|---|---|---|---|---|
| 2016 | 380 | 180 | 39 | 21,7 % |
| 2017 | 380 | 380 | 99 | 26,1 % |
| 2018 | 380 | 380 | 71 | 18,7 % |
| 2019 | 380 | 380 | 92 | 24,2 % |
| 2020 | 380 | 380 | 83 | 21,8 % |
| 2021 | 380 | 380 | 88 | 23,2 % |
| 2022 | 380 | 380 | 87 | 22,9 % |
| 2023 | 380 | 380 | 82 | 21,6 % |
| 2024 | 380 | 380 | 93 | 24,5 % |
| 2025 | 380 | 380 | 104 | 27,4 % |
| **I alt** | **3.800** | **3.600** | **838** | **23,3 %** |

## Samlet

| | brugt | uafgjort |
|---|---|---|
| Superligaen | 2.543 | 655 |
| Premier League | 3.600 | 838 |
| **I alt** | **6.143** | **1.493** |

Modellen med `DRAW_BASE` 0,305 og `DRAW_DECAY` 0,55 forventer 1.493 uafgjorte
mod de 1.493 faktiske. Den gamle `DRAW_BASE` på 0,26 forventede 1.362 — 9 % for
få.

## Hvad tabellen også afslører

**Ligaerne er ikke ens.** Superligaen ligger på 25,8 % uafgjort, Premier League
på 23,3 %. Forskellen er reel og ikke støj (2,5 procentpoint over ~6.000 kampe),
men vi bruger med vilje **én fælles model** til begge: forskellen skyldes i høj
grad, at Premier League har flere skæve kampe, og det fanger `DRAW_DECAY`
allerede. En liga-specifik `DRAW_BASE` ville fitte de sidste par tiendedele på
bekostning af, at de to spil så ikke længere kunne sammenlignes.

**Enkeltsæsoner svinger meget.** 18,7 % (PL 2018) mod 30,6 % (Superligaen 16387)
er et spænd på 12 procentpoint. Det er hele grunden til, at kalibreringen kræver
mange sæsoner: havde vi ramt to sæsoner i den ene ende, ville vi have fittet mod
et tilfælde.
