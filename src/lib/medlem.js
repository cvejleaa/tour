// Én helper for "er du med i spillet?" — spejlet af reglernes erAktivDeltager():
// dokumentet findes, og forladt er ikke sat. Fandtes før som tre kopier
// (useGame.js, en test-mock og invariant-testen), og hele pointen med
// invarianten "fladen tilbyder ⇔ reglerne tillader" er, at fladens halvdel
// ikke må drive fra reglernes. Ren funktion uden Firebase, så rules-testen
// kan importere den uden at trække klientens firebase-init ind.
export function erAktivtMedlem(me) {
  return me != null && me.forladt !== true;
}
