// ---------------------------------------------------------------------------
// functions-platform/mailer.js — e-mail-hjælpere for platformen (spil-89af9).
// Sender via egen SMTP (tip@vejleaa.dk). Alt no-op'er pænt, hvis SMTP_PASSWORD-
// secret'en ikke er sat — så functions kan deployes før mail er sat op.
// Sæt secret én gang:  firebase functions:secrets:set SMTP_PASSWORD --project spil-89af9
// ---------------------------------------------------------------------------
const nodemailer = require('nodemailer');
const { FieldValue } = require('firebase-admin/firestore');

const SMTP_HOST = 'send.one.com';
const SMTP_PORT = 465; // implicit TLS
const SMTP_USER = 'tip@vejleaa.dk';
const EMAIL_FROM = 'Vejleaa Tip <tip@vejleaa.dk>';
const APP_URL = 'https://tip.vejleaa.dk';

/** Undslip HTML i brugerindtastede strenge (navne m.m.). */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Byg en SMTP-transporter. null hvis adgangskode mangler → mail springes over. */
function buildTransport(password) {
  if (!password) return null;
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: password },
  });
}

/** Skriv en linje i mail-loggen (emailLog). Fejler aldrig hårdt. */
async function logEmail(db, entry) {
  try {
    await db.collection('emailLog').add({ ...entry, createdAt: FieldValue.serverTimestamp() });
  } catch (e) {
    console.error('logEmail: kunne ikke skrive log', e && e.message ? e.message : e);
  }
}

/** Send én e-mail + log resultatet. Kaster videre ved SMTP-fejl. */
async function sendEmail(db, transporter, { to, subject, html, type }) {
  try {
    await transporter.sendMail({ from: EMAIL_FROM, to, subject, html });
    await logEmail(db, { to, subject, type: type || 'other', status: 'sent', error: null });
  } catch (err) {
    await logEmail(db, { to, subject, type: type || 'other', status: 'failed', error: String((err && err.message) || err) });
    throw err;
  }
}

module.exports = {
  SMTP_HOST, SMTP_PORT, SMTP_USER, EMAIL_FROM, APP_URL,
  escapeHtml, buildTransport, logEmail, sendEmail,
};
