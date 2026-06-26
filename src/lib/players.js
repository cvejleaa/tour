// Hjælpere til spiller-info fra football-data.org.

/** Alder i hele år ud fra en ISO-fødselsdato ("2000-01-31"), ellers null. */
export function playerAge(dateOfBirth, now = new Date()) {
  if (!dateOfBirth) return null;
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getFullYear() - dob.getFullYear();
  const m = now.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}

// Football-data positioner (engelsk) → kort dansk kategori.
const POSITION_DA = {
  'Goalkeeper': 'Målmand',
  'Defence': 'Forsvar', 'Centre-Back': 'Forsvar', 'Left-Back': 'Back', 'Right-Back': 'Back',
  'Left Back': 'Back', 'Right Back': 'Back',
  'Midfield': 'Midtbane', 'Defensive Midfield': 'Midtbane', 'Central Midfield': 'Midtbane',
  'Attacking Midfield': 'Midtbane', 'Left Midfield': 'Midtbane', 'Right Midfield': 'Midtbane',
  'Offence': 'Angreb', 'Centre-Forward': 'Angriber', 'Left Winger': 'Kant', 'Right Winger': 'Kant',
  'Left Wing': 'Kant', 'Right Wing': 'Kant',
};

/** Dansk position-label (falder tilbage til det rå navn). */
export function positionDa(position) {
  if (!position) return null;
  return POSITION_DA[position] ?? position;
}
