// ---------------------------------------------------------------------------
// functions/knockout.js — ren, testbar logik til at bygge 1/16-finalerne (r32)
// ud fra grupperesultater. Holdt adskilt fra Cloud Function-skallen, så den
// kan testes uden emulator og uden HTTP.
// ---------------------------------------------------------------------------
'use strict';

const { computeGroupStandings, pickBestThirds } = require('./standings');

const EXPECTED_GROUPS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'];

// Hjælpere til at beskrive en plads i bracketten
const rank = (group, r) => ({ kind: 'rank', group, r });
const third = (...groups) => ({ kind: 'third', groups });

// Officiel r32-opstilling. id'erne SKAL matche data/group-stage.json (ko_r32_N).
const R32_SPEC = [
  { id: 'ko_r32_1',  home: rank('A', 1), away: rank('B', 2) },
  { id: 'ko_r32_2',  home: rank('C', 1), away: third('D', 'E', 'F') },
  { id: 'ko_r32_3',  home: rank('B', 1), away: third('A', 'D', 'E') },
  { id: 'ko_r32_4',  home: rank('D', 1), away: rank('C', 2) },
  { id: 'ko_r32_5',  home: rank('E', 1), away: third('A', 'B', 'C') },
  { id: 'ko_r32_6',  home: rank('G', 1), away: rank('H', 2) },
  { id: 'ko_r32_7',  home: rank('F', 1), away: third('A', 'B', 'D') },
  { id: 'ko_r32_8',  home: rank('H', 1), away: rank('G', 2) },
  { id: 'ko_r32_9',  home: rank('I', 1), away: rank('J', 2) },
  { id: 'ko_r32_10', home: rank('K', 1), away: third('I', 'J', 'L') },
  { id: 'ko_r32_11', home: rank('J', 1), away: third('H', 'I', 'K') },
  { id: 'ko_r32_12', home: rank('L', 1), away: rank('K', 2) },
  { id: 'ko_r32_13', home: rank('E', 2), away: third('F', 'G', 'H') },
  { id: 'ko_r32_14', home: rank('I', 2), away: third('G', 'H', 'L') },
  { id: 'ko_r32_15', home: rank('F', 2), away: rank('L', 2) },
  { id: 'ko_r32_16', home: rank('D', 2), away: third('C', 'E', 'F') },
];

/**
 * Omsæt grupperangering + bedste 3'ere til konkrete r32-kampe.
 * @param {Record<string, Array<{team:string}>>} groupStandings
 * @param {Array<{team:string, groupName:string}>} best8Thirds
 * @returns {Array<{id:string, home:string|null, away:string|null}>}
 */
function computeR32Assignments(groupStandings, best8Thirds) {
  const getTeam = (group, r) => {
    const s = groupStandings[group];
    return s ? (s[r - 1]?.team || null) : null;
  };
  const getThird = (groups) => {
    const cand = best8Thirds.filter((t) => groups.includes(t.groupName));
    return cand.length > 0 ? cand[0].team : null;
  };
  const resolve = (slot) =>
    slot.kind === 'rank' ? getTeam(slot.group, slot.r) : getThird(slot.groups);

  return R32_SPEC.map((s) => ({ id: s.id, home: resolve(s.home), away: resolve(s.away) }));
}

/**
 * Byg r32 ud fra alle færdigspillede gruppekampe.
 * @param {Array<object>} finishedGroupMatches  kampe med groupName, homeTeam, awayTeam, result
 * @returns {{
 *   assignments: Array<{id:string, home:string|null, away:string|null}>,
 *   groupStandings: object,
 *   best8ThirdsGroups: string[],
 *   missingGroups: string[],
 * }}
 */
function buildR32FromGroupMatches(finishedGroupMatches) {
  const byGroup = {};
  for (const m of finishedGroupMatches) {
    (byGroup[m.groupName] ||= []).push(m);
  }

  const missingGroups = EXPECTED_GROUPS.filter(
    (g) => !byGroup[g] || byGroup[g].length < 6,
  );

  const groupStandings = {};
  const allThirds = [];
  for (const g of EXPECTED_GROUPS) {
    const gm = byGroup[g] || [];
    const teamSet = new Set();
    for (const m of gm) { teamSet.add(m.homeTeam); teamSet.add(m.awayTeam); }
    const standings = computeGroupStandings([...teamSet], gm);
    groupStandings[g] = standings;
    if (standings[2]) allThirds.push({ ...standings[2], groupName: g });
  }

  const best8Thirds = pickBestThirds(allThirds);
  const assignments = computeR32Assignments(groupStandings, best8Thirds);

  return {
    assignments,
    groupStandings,
    best8ThirdsGroups: best8Thirds.map((t) => t.groupName),
    missingGroups,
  };
}

module.exports = {
  EXPECTED_GROUPS,
  R32_SPEC,
  computeR32Assignments,
  buildR32FromGroupMatches,
};
