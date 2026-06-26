# Arkitektur & datamodel

> Dette er fundamentets kontrakt. Alle moduler/agenter retter sig efter denne
> datamodel. Udvid gerne, men bryd ikke eksisterende felter uden at opdatere alt.

## Overblik
```
React + Vite (vm.vejleaa.dk)
   │  Firebase SDK (auth, firestore, functions)
   ▼
Firebase
   ├─ Authentication  (email/password)
   ├─ Cloud Firestore (data + Security Rules)
   └─ Cloud Functions (region: europe-west1)
        ├─ onUserCreate        → opretter users/{uid} som pending
        ├─ recomputeMatch      → beregner point for alle tips når resultat sættes
        ├─ buildKnockout       → opretter knockout-kampe når grupper er afgjort
        └─ recomputeStandings  → opdaterer samlet + dags-rangering
```

## Firestore-collections

### `users/{uid}`
| Felt | Type | Note |
|---|---|---|
| displayName | string | spillernavn |
| email | string | |
| role | string | `owner` \| `globalAdmin` \| `player` |
| status | string | `pending` \| `approved` \| `rejected` |
| totalPoints | number | denormaliseret, sat af Functions |
| createdAt | timestamp | |

### `matches/{matchId}`
| Felt | Type | Note |
|---|---|---|
| round | string | `group`/`r32`/`r16`/`qf`/`sf`/`bronze`/`final` |
| groupName | string\|null | fx "A" (kun gruppespil) |
| homeTeam / awayTeam | string\|null | landekode; null hvis ukendt knockout |
| homePlaceholder / awayPlaceholder | string\|null | fx "Vinder gruppe A" |
| kickoff | timestamp | UTC; deadline for tips |
| status | string | `scheduled`/`pendingTeams`/`live`/`finished` |
| result | {home,away,advance?}\|null | sat af admin |
| stadium / city | string | |

### `bets/{uid}_{matchId}`
| Felt | Type | Note |
|---|---|---|
| uid / matchId | string | |
| home / away | number | tippet score |
| advance | string\|null | tippet videregående hold (knockout) |
| points | number\|null | sat af Functions efter kampen |
| updatedAt | timestamp | må kun skrives før kickoff (Rules) |

### `bonusQuestions/{id}`
| Felt | Type | Note |
|---|---|---|
| type | string | `topScorer` \| `groupWinner` |
| label | string | spørgsmålstekst |
| groupName | string\|null | for gruppevinder |
| deadline | timestamp | låsetidspunkt (1. relevante kamps kickoff) |
| facit | string\|null | korrekt svar (sat af admin) |
| options | string[]\|null | valgmuligheder |

### `bonusBets/{uid}_{questionId}`
answer (string), points (number\|null), updatedAt.

### `leagues/{leagueId}`
| Felt | Type | Note |
|---|---|---|
| name | string | |
| ownerUid | string | opretteren |
| joinCode | string | unik kode til at tilmelde sig |
| memberUids | string[] | medlemmer |
| createdAt | timestamp | |

### `config/tournament`
Globale indstillinger (pointregler-spejl, turneringsnavn, startdato).

## Pointlogik
Autoritativ kilde: `functions/scoring.js` (spejler `src/lib/scoring.js` 1:1).
Klienten viser kun *mulige* point; de endelige sættes server-side så de ikke
kan manipuleres.

## Sikkerhedsprincipper
- Spillere kan kun læse/skrive **egne** `bets`/`bonusBets`, og kun **før** deadline.
- `points`, `role`, `status`, `result`, `facit` kan **aldrig** skrives af spillere.
- Kun `globalAdmin`/`owner` skriver `matches`, `result`, `facit`.
- `globalAdmin`/`owner` kan ændre brugeres `status` (godkende/afvise); kun `owner` ændrer `role`.
- Knockout-kampe og pointberegning køres af Cloud Functions (admin-context).
