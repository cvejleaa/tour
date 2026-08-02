'use strict';
// ---------------------------------------------------------------------------
// thankYouEmail.js — bygger den afsluttende takke-mail (ren HTML-streng) og
// beregner liga-slutstillinger. Ingen Firestore/IO; index.js henter data og
// kalder render. Mail-sikker HTML: tabeller + inline styles.
// ---------------------------------------------------------------------------
const { leagueTotal } = require('./leagueRecap');

// Scoring-normalisering — server-side spejl af frontendens leagueFormat.js, så
// hver ligas AKTIVEREDE dele bruges (og gamle `format`-ligaer håndteres korrekt).
const DEFAULT_SCORING = { stage: true, bonus: true, leagueBonus: true };
const LEAGUE_FORMAT = { FULL: 'full', BONUS_ONLY: 'bonusOnly', STAGE_ONLY: 'stageOnly' };

function fromLegacyFormat(format) {
  switch (format) {
    case LEAGUE_FORMAT.BONUS_ONLY: return { stage: false, bonus: true, leagueBonus: true };
    case LEAGUE_FORMAT.STAGE_ONLY: return { stage: true, bonus: false, leagueBonus: true };
    case LEAGUE_FORMAT.FULL:
    default: return { ...DEFAULT_SCORING };
  }
}

/** Ligaens faktiske scoring: ny `scoring` (udfyldt med defaults) ellers gammelt `format`. */
function normalizeScoring(league) {
  if (league && league.scoring && typeof league.scoring === 'object') {
    return { ...DEFAULT_SCORING, ...league.scoring };
  }
  if (league && league.format) return fromLegacyFormat(league.format);
  return { ...DEFAULT_SCORING };
}

const C = {
  pitch: '#0b6e4f', pitch2: '#0e8a63', gold: '#c99a2e', goldSoft: '#f6ecd0',
  ink: '#12211b', muted: '#5b6b60', line: '#e2ebe3', page: '#eef3ee', you: '#eaf5ee',
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Beregn en ligas slutstilling ud fra medlemmernes point og ligaens scoring.
 * Liga-bonus lægges til når ligaen bruger den (scoring.leagueBonus) — samme
 * grundlag som app'ens leaderboard (leagueScore). leagueTotal håndterer selv
 * scoring-valget, inkl. 3. argument (liga-bonus).
 * @param {object} league  { name, memberUids, scoring }
 * @param {Object<string,object>} membersById  uid → { displayName, stagePoints, bonusPoints }
 * @param {Object<string,number>} [leagueBonusByUid]  uid → liga-bonuspoint
 * @returns {{ name, memberCount, rows: Array<{uid,name,points,rank}> }}
 */
function leagueStandings(league, membersById, leagueBonusByUid = {}) {
  const scoring = normalizeScoring(league);
  const uids = Array.isArray(league && league.memberUids) ? league.memberUids : [];
  const sorted = uids
    .map((uid) => {
      const u = membersById[uid];
      if (!u) return null;
      const points = leagueTotal(u, scoring, leagueBonusByUid[uid] || 0);
      return { uid, name: u.displayName || 'Spiller', points };
    })
    .filter(Boolean)
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name, 'da'));

  // Standard konkurrence-rangering ("1224"): lige mange point → samme, bedste
  // placering. Næste placering springer frem svarende til antal delinger.
  let prevPoints = null;
  let prevRank = 0;
  const rows = sorted.map((r, i) => {
    const rank = (prevPoints !== null && r.points === prevPoints) ? prevRank : i + 1;
    prevPoints = r.points;
    prevRank = rank;
    return { ...r, rank };
  });
  return { name: (league && league.name) || 'Liga', memberCount: rows.length, rows };
}

// ── HTML-fragmenter ─────────────────────────────────────────────────────────
function statTile(num, lbl) {
  return `<td width="33%" style="padding:5px" align="center">
    <div style="background:#f6faf7;border:1px solid ${C.line};border-radius:12px;padding:12px 6px">
      <div style="font-size:21px;font-weight:800;color:${C.ink}">${esc(num)}</div>
      <div style="font-size:11px;color:${C.muted};margin-top:2px">${esc(lbl)}</div>
    </div></td>`;
}

function factRow(k, v) {
  return `<tr>
    <td style="padding:8px 0;border-top:1px solid ${C.line};font-size:13.5px;color:${C.muted}">${k}</td>
    <td style="padding:8px 0;border-top:1px solid ${C.line};font-size:13.5px;font-weight:700;text-align:right;white-space:nowrap">${v}</td>
  </tr>`;
}

const MEDALS = { 1: '🥇', 2: '🥈', 3: '🥉' };

function leagueBlock(std, youUid) {
  const rows = std.rows.map((r) => {
    const isYou = r.uid === youUid;
    const isWin = r.rank === 1;
    const bg = isWin ? C.goldSoft : isYou ? C.you : '#ffffff';
    const weight = isWin || isYou ? '700' : '400';
    const rankCell = MEDALS[r.rank] || String(r.rank);
    const youTag = isYou ? ` <span style="color:${C.pitch};font-size:11px;font-weight:700">· dig</span>` : '';
    return `<tr>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};background:${bg};text-align:right;width:1%;white-space:nowrap;font-weight:${weight}">${rankCell}</td>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};background:${bg};font-size:13.5px;font-weight:${weight}">${esc(r.name)}${youTag}</td>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};background:${bg};text-align:right;font-weight:700;white-space:nowrap">${r.points}</td>
    </tr>`;
  }).join('');
  return `<div style="border:1px solid ${C.line};border-radius:12px;overflow:hidden;margin-top:16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr><td colspan="3" style="padding:11px 14px;background:#f6faf7;border-bottom:1px solid ${C.line};font-size:14.5px;font-weight:700">
        ${esc(std.name)} <span style="font-size:11.5px;color:${C.muted};font-weight:500">· ${std.memberCount} deltagere</span>
      </td></tr>
      ${rows}
    </table></div>`;
}

function section(title, subtitle) {
  return `<h2 style="font-family:Georgia,serif;font-size:18px;margin:30px 0 2px;color:${C.pitch}">${title}</h2>
    ${subtitle ? `<p style="margin:0 0 12px;font-size:12.5px;color:${C.muted}">${esc(subtitle)}</p>` : ''}`;
}

// Én trøje-celle: farvet cirkel + trøjenavn + vinderens navn.
function jerseyCell(emoji, lbl, name) {
  return `<td width="25%" align="center" valign="top" style="padding:10px 3px">
    <div style="font-size:26px;line-height:1">${emoji}</div>
    <div style="font-size:10.5px;color:${C.muted};text-transform:uppercase;letter-spacing:0.5px;margin-top:5px">${esc(lbl)}</div>
    <div style="font-size:12.5px;font-weight:700;margin-top:2px;line-height:1.25">${esc(name || '—')}</div>
  </td>`;
}

/**
 * Byg hele takke-mailens HTML.
 * @param {object} data
 * @param {string} data.displayName
 * @param {object|null} data.gcPodium  fra computeGcPodium ({afterStage, rows})
 * @param {object|null} data.jerseys   fra computeJerseyWinners
 * @param {object} data.facts          fra computeFacts
 * @param {Array}  data.stageWins      fra computeStageWins
 * @param {Array}  data.leagues        [{ name, memberCount, rows }] (allerede standings)
 * @param {string} data.youUid
 * @param {string} [data.appUrl]
 * @returns {string}
 */
function renderThankYouEmail({ displayName, gcPodium, jerseys, facts, stageWins, leagues, youUid, appUrl = 'https://tour.vejleaa.dk' }) {
  const f = facts || {};

  // Gul trøje-banner: løbets samlede vinder + resten af podiet.
  let gcHtml = '';
  if (gcPodium && gcPodium.rows && gcPodium.rows.length) {
    const winner = gcPodium.rows[0];
    const others = gcPodium.rows.slice(1).map((r) => `<div style="font-size:13px;color:#7a5c18;margin-top:3px">
        ${MEDALS[r.rank] || r.rank} ${esc(r.rider || '—')}${r.team ? ` <span style="color:#9c7c30">· ${esc(r.team)}</span>` : ''}${r.time ? ` <span style="color:#9c7c30">· ${esc(r.time)}</span>` : ''}
      </div>`).join('');
    gcHtml = `
    <div style="margin:22px 0 6px;text-align:center;background:linear-gradient(160deg,#fbe98f,#f2cf4e);border:1px solid #e0bf45;border-radius:14px;padding:22px 20px">
      <div style="font-size:34px;line-height:1">🏆</div>
      <div style="font-size:11.5px;letter-spacing:2px;text-transform:uppercase;color:#8a6a12;font-weight:800;margin:8px 0 2px">Vinder af Tour de France 2026</div>
      <div style="font-family:Georgia,serif;font-size:25px;font-weight:700;color:#4a3708">${esc(winner.rider || '—')}</div>
      ${winner.team ? `<div style="font-size:13px;color:#7a5c18;margin-top:4px">${esc(winner.team)}</div>` : ''}
      ${others ? `<div style="margin-top:10px">${others}</div>` : ''}
    </div>`;
  }

  // Trøjevinderne (gul/grøn/prikket/hvid) — indehaverne efter sidste etape.
  const jerseysHtml = jerseys ? `${section('👕 Trøjerne', 'Vinderne af løbets fire klassementer.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;background:#f6faf7;border:1px solid ${C.line};border-radius:12px">
      <tr>
        ${jerseyCell('💛', 'Gul trøje', jerseys.yellow)}
        ${jerseyCell('💚', 'Grøn trøje', jerseys.green)}
        ${jerseyCell('❤️', 'Prikket trøje', jerseys.polka)}
        ${jerseyCell('🤍', 'Hvid trøje', jerseys.white)}
      </tr>
    </table>` : '';

  // Fakta
  const factsList = [
    f.topTeam ? factRow('🏆 Mest vindende hold', `${esc(f.topTeam.team)} · ${f.topTeam.wins} etapesejr${f.topTeam.wins === 1 ? '' : 'e'}`) : '',
    jerseys && jerseys.teamLead ? factRow('👥 Holdkonkurrencen', esc(jerseys.teamLead)) : '',
  ].filter(Boolean).join('');

  const factsHtml = `${section('📊 Løbet i tal', 'Hele Touren, kort fortalt.')}
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>${statTile(f.etaper || 0, 'etaper')}${statTile(f.totalKm != null ? `${f.totalKm} km` : '—', 'samlet distance')}${statTile(f.distinctWinners || 0, 'forskellige etapevindere')}</tr>
    </table>
    ${factsList ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:10px">${factsList}</table>` : ''}`;

  // Etapesejre — flest sejre øverst (top 5).
  let winsHtml = '';
  const wins = (stageWins || []).filter((w) => w.wins > 0).slice(0, 5);
  if (wins.length) {
    const rows = wins.map((w) => `<tr>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};font-size:13.5px;font-weight:700">${esc(w.rider || w.team || '—')}</td>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};font-size:12px;color:${C.muted}">${w.rider && w.team ? esc(w.team) : ''}</td>
      <td style="padding:8px 14px;border-top:1px solid ${C.line};text-align:right;font-weight:700;white-space:nowrap">${w.wins} ${w.wins === 1 ? 'sejr' : 'sejre'}</td>
    </tr>`).join('');
    winsHtml = `${section('🚩 Etapesejre', 'Rytterne med flest etapesejre i årets løb.')}
      <div style="border:1px solid ${C.line};border-radius:12px;overflow:hidden">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${rows}</table>
      </div>`;
  }

  // Ligaer
  const leaguesHtml = (leagues && leagues.length)
    ? `${section('🥇 Dine ligaer', 'Sådan endte slutstillingen dér, hvor du var med.')}
       ${leagues.map((l) => leagueBlock(l, youUid)).join('')}`
    : `${section('🥇 Dine ligaer', '')}<p style="font-size:13.5px;color:${C.muted}">Du var ikke medlem af en liga i denne udgave.</p>`;

  return `<!DOCTYPE html><html lang="da"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${C.page}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.page}"><tr><td align="center" style="padding:24px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;overflow:hidden;border:1px solid ${C.line};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${C.ink};line-height:1.55">
  <tr><td style="background:linear-gradient(160deg,#074b36,#0b6e4f 55%,#0e8a63);padding:32px 30px 28px;text-align:center;color:#fff">
    <div style="font-size:38px;line-height:1">🚴</div>
    <div style="font-family:Georgia,serif;font-size:25px;margin:10px 0 4px">Tak fordi du var med til Tour de France 2026</div>
    <div style="font-size:13px;color:#d8f0df;letter-spacing:0.3px">MÅLSTREG I PARIS · TOUR DE FRANCE 2026</div>
    <div style="width:46px;height:3px;background:${C.gold};border-radius:2px;margin:14px auto 0"></div>
  </td></tr>
  <tr><td style="padding:26px 30px 4px">
    <p style="font-size:15.5px;margin:0 0 6px">Kære <strong>${esc(displayName || 'spiller')}</strong>,</p>
    <p style="margin:0 0 4px;color:${C.muted};font-size:14px">Så er sidste etape kørt i mål, og dermed er der også fløjtet af for vores tippe-dyst. Tak fordi du var med hele vejen — for hvert tip, hver diskussion og hver eftermiddag foran skærmen. Her er et lille tilbageblik.</p>
    ${gcHtml}
    ${jerseysHtml}
    ${factsHtml}
    ${winsHtml}
    ${leaguesHtml}
  </td></tr>
  <tr><td style="padding:22px 30px 26px">
    <p style="font-size:14px;margin:8px 0 0">Tak for et fantastisk løb — for etaperne, for konkurrencen og for det gode selskab undervejs. 🇫🇷🚴</p>
    <p style="font-family:Georgia,serif;font-size:15px;color:${C.pitch};margin:12px 0 0">Vi ses måske til næste udgave!</p>
    <p style="color:${C.muted};font-size:13px;margin:6px 0 0">— Tour de France Tip</p>
  </td></tr>
  <tr><td style="padding:18px 30px 24px;text-align:center;font-size:11.5px;color:${C.muted};border-top:1px solid ${C.line};background:#f8fbf9">
    Du modtager denne mail, fordi du deltog i Tour de France Tip 2026.<br>
    <a href="${esc(appUrl)}" style="color:${C.pitch}">tour.vejleaa.dk</a>
  </td></tr>
</table></td></tr></table></body></html>`;
}

module.exports = { leagueStandings, renderThankYouEmail, normalizeScoring, esc };
