/**
 * Rene hjælpefunktioner til ligaer.
 * Ingen Firebase-afhængigheder – nemme at teste isoleret.
 */

/**
 * Genererer en tilfældig join-kode (6 store bogstaver/tal).
 * Eksempel: "X4KR2M"
 * @returns {string}
 */
export function generateJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // fjerner tvetydige (0/O, 1/I)
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Filtrerer en liste af brugere til kun dem, der er med i memberUids.
 *
 * @param {Array<{uid: string}>} users
 * @param {string[]} memberUids
 * @returns {Array<{uid: string}>}
 */
export function filterUsersByLeague(users, memberUids) {
  if (!memberUids || memberUids.length === 0) return [];
  const set = new Set(memberUids);
  return users.filter((u) => set.has(u.uid));
}
