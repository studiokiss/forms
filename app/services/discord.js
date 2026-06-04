// Notifications Discord via webhook de projet.
// Seules les URLs de webhook Discord sont acceptées : le serveur ne doit
// jamais servir de relais HTTP vers une URL arbitraire (SSRF).

// Tokens Discord : base64url, parfois avec des points (tokens d'interaction).
const WEBHOOK_PATTERN = /^https:\/\/discord\.com\/api\/webhooks\/\d+\/[\w.-]+$/;
const TIMEOUT_MS = 5000;
const FIELD_MAX = 1024; // limite Discord par champ d'embed, sinon 400

function clampField(value) {
  const text = String(value);
  return text.length > FIELD_MAX ? text.slice(0, FIELD_MAX - 1) + '…' : text;
}

function isValidWebhookUrl(url) {
  return typeof url === 'string' && WEBHOOK_PATTERN.test(url);
}

async function sendEmbed(webhookUrl, embed) {
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ embeds: [embed] }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Discord a répondu ${res.status}`);
  }
}

// Fire-and-forget : un Discord en panne ne doit jamais faire échouer la
// soumission du client. L'échec est loggé, jamais propagé.
// Métadonnées uniquement — les réponses du client ne sortent pas de l'app.
function notifySubmission({ webhookUrl, projectName, formTitle, isUpdate }) {
  const embed = {
    title: isUpdate ? 'Soumission mise à jour' : 'Nouvelle soumission',
    color: isUpdate ? 0xe67e22 : 0x2ecc71,
    fields: [
      { name: 'Projet', value: clampField(projectName), inline: true },
      { name: 'Formulaire', value: clampField(formTitle), inline: true },
    ],
    timestamp: new Date().toISOString(),
  };
  return sendEmbed(webhookUrl, embed).catch((err) => {
    console.error(`Webhook Discord en échec (projet « ${projectName} ») : ${err.message}`);
  });
}

// Contrairement à notifySubmission, propage l'erreur : l'admin qui teste
// son URL veut savoir si l'envoi a échoué.
function sendTest(webhookUrl) {
  return sendEmbed(webhookUrl, {
    title: 'Test du webhook',
    description: 'Le webhook Kiss Forms fonctionne. Les soumissions finales de ce projet seront notifiées ici.',
    color: 0x3498db,
    timestamp: new Date().toISOString(),
  });
}

module.exports = { isValidWebhookUrl, notifySubmission, sendTest };
