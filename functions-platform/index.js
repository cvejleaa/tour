// ---------------------------------------------------------------------------
// functions-platform/index.js — Cloud Functions for den SAMLEDE tippeplatform
// (projekt spil-89af9 / tip.vejleaa.dk).
//
// Egen codebase ("platform" i firebase.json), adskilt fra Tour-motoren
// ("default" → tour-85928): Firebase-CLI'en validerer ALLE en codebases
// secrets mod målprojektet ved deploy, så Tour-funktionernes secrets
// (SMTP_PASSWORD m.fl., som kun findes i tour-85928) må ikke ligge i den
// codebase der deployes til spil-89af9 — og omvendt skal spil-afregningen
// ikke med i Tour-deploys.
// ---------------------------------------------------------------------------

'use strict';

const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { initializeApp } = require('firebase-admin/app');

const { recomputeGameMatchCore, recomputeSeasonElo } = require('./gameScoring');

initializeApp();

const REGION = 'europe-west1';

// recomputeGameMatch — afregn point i den samlede platform når en kamps facit
// (result) sættes: score alle bets på kampen (1X2 + Chancen) og genberegn hver
// berørt spillers total. Spejler Tour-motorens recomputeStage, men spil-scoped.
exports.recomputeGameMatch = onDocumentWritten(
  { document: 'games/{gameId}/matches/{matchId}', region: REGION },
  async (event) => {
    const db = getFirestore();
    const { gameId, matchId } = event.params;
    const after = event.data?.after?.data();
    if (!after || !after.result) return;
    const before = event.data?.before?.data();
    // Kør kun når facit reelt ændrer sig (undgå løkker ved andre felt-skriv).
    if (before?.result === after.result) return;
    await recomputeGameMatchCore(db, FieldValue, gameId, matchId, after);
    // Levende Elo: opdatér ratings + friske odds på fremtidige kampe.
    // (Odds-skriv på kampe uden facit gen-udløser IKKE denne funktion.)
    await recomputeSeasonElo(db, FieldValue, gameId, Date.now());
  },
);
