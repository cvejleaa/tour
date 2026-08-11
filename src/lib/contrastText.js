/** WCAG relativ luminans (0-1) af en hex-farve. `null` hvis hex er ugyldig. */
export function relativLuminans(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return null;
  const lin = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [0, 2, 4].map((i) => lin(parseInt(h.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * WCAG kontrastforhold mellem to farver — 1 (ens) til 21 (sort/hvid).
 *
 * DEN HER FANDTES I FORVEJEN, men kun som en lokal hjælper inde i
 * `TeamThemePicker.test.jsx`. Så længe den kun boede i en testfil, kunne KODEN
 * ikke måle sig selv — og temaerne blev derfor holdt i hånden i CSS uden at
 * nogen kunne regne efter. Den bor her nu, så både `accentTema` og testene
 * bruger nøjagtig samme regnestykke.
 */
export function kontrast(a, b) {
  const la = relativLuminans(a);
  const lb = relativLuminans(b);
  if (la === null || lb === null) return 1;
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Auto-kontrast tekstfarve på en vilkårlig baggrundsfarve (til klub-badges).
 * Bruger WCAG relativ luminans; tærskel ~0.55 rammer brandfarver pænt.
 *
 * BRUG IKKE DEN HER TIL TEMA-BLÆK. Tærsklen 0.55 er valgt i øjemål og lover
 * ikke 4,5:1 — den vælger bare den pæneste af de to. `accentTema` kræver et
 * bevis og bruger `bedsteBlaek` i stedet.
 */
export function textOn(hex) {
  const L = relativLuminans(hex);
  if (L === null) return '#ffffff';
  return L > 0.55 ? '#10151b' : '#ffffff';
}

/** RGB-værdier [0-255] fra hex, eller null hvis ugyldig. */
function rgb(hex) {
  const h = String(hex || '').replace('#', '');
  if (h.length < 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/**
 * KULØR — hvor langt der er mellem den kraftigste og svageste RGB-kanal (0-1).
 *
 * Bruges til ét spørgsmål: BÆRER farven overhovedet en farve, man kan tone en
 * side med? Hvid, sort og grå gør ikke, og de er ikke sjældne i en holdliste:
 * FCK, AGF og Leeds spiller alle i hvidt, FC Midtjylland i næsten sort
 * (#0B0807, kulør 0,016).
 *
 * MÆTNING (HSL-S) DUER IKKE TIL DET SPØRGSMÅL, og det var mit første forsøg:
 * #0B0807 har mætning 0,22, fordi de tre kanaler ligger 4 trin fra hinanden i
 * et interval, der samlet kun er 11 trin højt. Mætning måler forholdet, kulør
 * måler afstanden — og det er afstanden, der afgør, om et menneske kan se en
 * kulør. Gulvet står i `KULOER_GULV`.
 */
export function kuloer(hex) {
  const c = rgb(hex);
  if (!c) return 0;
  return (Math.max(...c) - Math.min(...c)) / 255;
}

/** Euklidisk RGB-afstand mellem to farver (0–441). */
export function colorDistance(a, b) {
  const x = rgb(a);
  const y = rgb(b);
  if (!x || !y) return Infinity;
  return Math.sqrt((x[0] - y[0]) ** 2 + (x[1] - y[1]) ** 2 + (x[2] - y[2]) ** 2);
}

/**
 * Er to farver "for tæt på hinanden" (trøje-clash)? Standard-tærskel ~120 af 441
 * fanger samme farvefamilie (hvid/hvid, navy/sort, rød/rød).
 */
export function colorsClash(a, b, threshold = 120) {
  return colorDistance(a, b) < threshold;
}
