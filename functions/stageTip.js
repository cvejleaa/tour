// ---------------------------------------------------------------------------
// AI ekspert-tips pr. etape (Tour de France-tippekonkurrence).
//
// Ren, Firebase-uafhængig kernelogik: prompt-bygning + generering + skrivning
// af expertTip på etape-dokumentet. index.js wirer en onCall ('generateStageTip')
// op om dette. Anthropic-SDK'en og modellen er IDENTISKE med AI-morgenopslaget.
// ---------------------------------------------------------------------------

'use strict';

const { activeQuestionsForStage } = require('./tourScoring');

// Samme model som generateRecapText bruger (AI-morgenopslaget). Hold dem ens.
const STAGE_TIP_MODEL = 'claude-opus-4-8';

const STAGE_TYPE_LABEL_DA = {
  flat: 'flad etape',
  hilly: 'kuperet etape',
  mountain: 'bjergetape',
  itt: 'enkeltstart',
  ttt: 'holdtidskørsel',
  unknown: 'etape',
};

const QUESTION_LABEL_DA = {
  winnerTeam: 'etapevinderens hold',
  gcTeam: 'bedste hold på de første ryttere',
  mountainTeam: 'flest bjergpoint',
  sprintTeam: 'flest sprintpoint',
};

const STAGE_TIP_SYSTEM = [
  'Du er en dansk cykelekspert, der hjælper deltagere i et HOLD-baseret',
  'Tour de France-tippespil. Spillerne tipper på cykelHOLD (ikke enkeltryttere):',
  'hvilket hold etapevinderen kører for, hvilket hold der har de bedste ryttere',
  'samlet, og hvilke hold der tager flest bjerg- og sprintpoint.',
  '',
  'Skriv et KORT ekspert-tip på dansk (2-4 sætninger) til ÉN etape. Forklar',
  'hvad slags etape det er, hvilken type hold/rytterprofil der typisk vinder',
  'eller tager sprint-/bjergpoint, og hvad man bør overveje når man tipper hold.',
  '',
  'VIGTIGT: Find ALDRIG på konkrete 2026-resultater, rytternavne eller holdnavne',
  'du ikke kan kende. Hold dig til generelle, taktiske betragtninger ud fra',
  'etapens profil. Svar KUN med selve tip-teksten — ingen overskrift, ingen',
  'punktopstilling, ingen anførselstegn.',
].join('\n');

/**
 * Byg de fakta om en etape, som prompten bygges af (rene felter, ingen Firebase).
 * @param {object} stage  rå etape-data (number, type, km, elevation, byer, …)
 */
function buildStageTipFacts(stage = {}) {
  const active = activeQuestionsForStage(stage);
  const activeQuestions = Object.keys(QUESTION_LABEL_DA)
    .filter((k) => active[k])
    .map((k) => QUESTION_LABEL_DA[k]);
  const typeKey = STAGE_TYPE_LABEL_DA[stage.type] ? stage.type : 'unknown';
  return {
    number: stage.number != null ? Number(stage.number) : null,
    type: stage.type || 'unknown',
    typeLabel: STAGE_TYPE_LABEL_DA[typeKey],
    km: stage.km != null ? stage.km : null,
    elevation: stage.elevation != null ? stage.elevation : null,
    startCity: stage.startCity || null,
    finishCity: stage.finishCity || null,
    description: stage.description || null,
    climbs: Array.isArray(stage.climbs) ? stage.climbs : [],
    sprints: Array.isArray(stage.sprints) ? stage.sprints : [],
    activeQuestions,
  };
}

// "kat. HC", "kat. 1" … til prompten.
function climbLabel(c) {
  const cat = c && c.category ? String(c.category) : '';
  const catTxt = cat ? `kat. ${cat}` : 'stigning';
  return c && c.name ? `${c.name} (${catTxt})` : catTxt;
}

/**
 * Byg user-prompten (dansk) ud fra etape-fakta.
 */
function buildStageTipPrompt(stage = {}) {
  const f = buildStageTipFacts(stage);
  const lines = ['Lav et ekspert-tip til denne etape:'];
  if (f.number != null) lines.push(`Etape: nr. ${f.number}`);
  lines.push(`Type: ${f.typeLabel} (${f.type})`);
  if (f.km != null) lines.push(`Distance: ${f.km} km`);
  if (f.elevation != null) lines.push(`Højdemeter: ${f.elevation} m`);
  if (f.startCity || f.finishCity) {
    lines.push(`Rute: ${f.startCity || '?'} → ${f.finishCity || '?'}`);
  }
  if (f.climbs.length) {
    lines.push(`Kategoriserede stigninger: ${f.climbs.map(climbLabel).join(', ')}.`);
  }
  if (f.sprints.length) {
    lines.push(`Mellemsprint(s): ${f.sprints.map((s) => s.name).filter(Boolean).join(', ')}.`);
  }
  if (f.description) lines.push(`Beskrivelse: ${f.description}`);
  if (f.activeQuestions.length) {
    lines.push(`Aktive holdspørgsmål på etapen: ${f.activeQuestions.join(', ')}.`);
  }
  return lines.join('\n');
}

/**
 * Generér selve tip-teksten via Anthropic. Retry ved midlertidige fejl
 * (samme mønster som AI-morgenopslaget).
 * @param {object} anthropic  Anthropic-klient (anthropic.messages.create)
 * @param {object} stage
 * @returns {Promise<string>}
 */
async function generateStageTipText(anthropic, stage) {
  let attempt = 0;
  for (;;) {
    try {
      const res = await anthropic.messages.create({
        model: STAGE_TIP_MODEL,
        max_tokens: 400,
        system: STAGE_TIP_SYSTEM,
        messages: [{ role: 'user', content: buildStageTipPrompt(stage) }],
      });
      return (res.content || [])
        .filter((b) => b.type === 'text')
        .map((b) => b.text)
        .join('')
        .trim();
    } catch (err) {
      attempt += 1;
      const status = err?.status;
      const retryable = status === 429 || status === 500 || status === 503 || status === 529;
      if (retryable && attempt < 4) {
        await new Promise((r) => setTimeout(r, attempt * 5000));
        continue;
      }
      throw err;
    }
  }
}

/**
 * Generér og gem expertTip for én eller flere etaper.
 *
 * Input enten { stageId } (én etape) eller { all:true, season } (alle etaper i
 * sæsonen UDEN expertTip endnu). Skriver { expertTip, expertTipUpdatedAt } på
 * etape-dokumentet. Én etape der fejler afbryder IKKE et 'all'-kørsel — fejl
 * samles i resultatet.
 *
 * @param {object} db  Firestore (admin SDK)
 * @param {object} anthropic  Anthropic-klient
 * @param {object} opts
 * @param {string} [opts.stageId]
 * @param {boolean} [opts.all]
 * @param {number} [opts.season]
 * @param {*} [opts.serverTimestamp]  FieldValue.serverTimestamp() (injiceres af index.js)
 * @returns {Promise<{ results: Array, errors: Array }>}
 */
async function runGenerateStageTips(db, anthropic, { stageId, all, season, serverTimestamp } = {}) {
  // Saml mål-etaperne (dokument-snapshots).
  const targets = [];
  if (all) {
    let q = db.collection('stages');
    if (season != null) q = q.where('season', '==', Number(season));
    const snap = await q.get();
    for (const d of snap.docs) {
      const data = d.data();
      const tip = data?.expertTip;
      // Kun etaper uden et (ikke-tomt) tip endnu.
      if (typeof tip === 'string' && tip.trim() !== '') continue;
      targets.push({ id: d.id, ref: d.ref, data });
    }
    targets.sort((a, b) => (Number(a.data?.number) || 0) - (Number(b.data?.number) || 0));
  } else {
    if (!stageId) throw new Error('Mangler stageId.');
    const ref = db.collection('stages').doc(stageId);
    const snap = await ref.get();
    if (!snap.exists) throw new Error(`Etape ${stageId} findes ikke.`);
    targets.push({ id: snap.id, ref, data: snap.data() });
  }

  const results = [];
  const errors = [];
  for (const t of targets) {
    try {
      const text = await generateStageTipText(anthropic, t.data || {});
      if (!text) {
        errors.push({ stageId: t.id, error: 'Tomt svar fra AI.' });
        continue;
      }
      await t.ref.set(
        { expertTip: text, expertTipUpdatedAt: serverTimestamp },
        { merge: true },
      );
      results.push({ stageId: t.id, number: t.data?.number ?? null, expertTip: text });
    } catch (err) {
      errors.push({ stageId: t.id, error: err?.message || String(err) });
    }
  }
  return { results, errors };
}

module.exports = {
  STAGE_TIP_MODEL,
  STAGE_TIP_SYSTEM,
  buildStageTipFacts,
  buildStageTipPrompt,
  generateStageTipText,
  runGenerateStageTips,
};
