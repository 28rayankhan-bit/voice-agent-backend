require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// TEMPORARY MOCK DATA
// Replace these two objects with real calls to your DB / Shopify / CRM
// once the basic flow is working end to end.
// ---------------------------------------------------------------------
const MOCK_ORDERS = {
  '12345': { number: '12345', status: 'shipped', eta: 'tomorrow', items: '2 items' },
  '67890': { number: '67890', status: 'processing', eta: 'in 3 days', items: '1 item' }
};

const MOCK_ACCOUNTS = {
  'jane@example.com': { name: 'Jane Doe', plan: 'Pro', status: 'active' }
};

// ---------------------------------------------------------------------
// Simple security check.
// Vapi sends a secret header you configure in the Vapi dashboard
// (Tools > your tool > Authorization > Custom Credential).
// This rejects any request that doesn't have it.
// ---------------------------------------------------------------------
function verifyVapiSecret(req, res, next) {
  const incomingSecret = req.headers['x-vapi-secret'];
  if (!process.env.VAPI_WEBHOOK_SECRET) {
    // No secret configured yet (fine for local testing) — skip check.
    return next();
  }
  if (incomingSecret !== process.env.VAPI_WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Helper: every Vapi tool-call response must be shaped like this,
// matched to the toolCallId Vapi sent.
function toolResponse(toolCallId, resultText) {
  return { results: [{ toolCallId, result: resultText }] };
}

// ---------------------------------------------------------------------
// TOOL 1: lookup_order
// ---------------------------------------------------------------------
app.post('/api/vapi/lookup-order', verifyVapiSecret, (req, res) => {
  const toolCall = req.body.message.toolCalls[0];
  const args = toolCall.function.arguments;
  const order = MOCK_ORDERS[args.order_number];

  const resultText = order
    ? `Order ${order.number} is ${order.status}, arriving ${order.eta}, containing ${order.items}.`
    : `I couldn't find an order with that number. Could you double check it?`;

  res.json(toolResponse(toolCall.id, resultText));
});

// ---------------------------------------------------------------------
// TOOL 2: lookup_account
// ---------------------------------------------------------------------
app.post('/api/vapi/lookup-account', verifyVapiSecret, (req, res) => {
  const toolCall = req.body.message.toolCalls[0];
  const args = toolCall.function.arguments;
  const account = MOCK_ACCOUNTS[args.phone_or_email];

  const resultText = account
    ? `Found the account for ${account.name}, on the ${account.plan} plan, status ${account.status}.`
    : `I couldn't find an account with that phone number or email.`;

  res.json(toolResponse(toolCall.id, resultText));
});

// ---------------------------------------------------------------------
// TOOL 3: create_support_ticket
// ---------------------------------------------------------------------
app.post('/api/vapi/create-ticket', verifyVapiSecret, (req, res) => {
  const toolCall = req.body.message.toolCalls[0];
  const args = toolCall.function.arguments;

  // TODO: replace with a real call to Zendesk/Freshdesk/your ticketing system
  console.log('New ticket:', args);

  res.json(toolResponse(toolCall.id, `Got it, I've logged a ticket about that and someone will follow up.`));
});

// ---------------------------------------------------------------------
// CALL EVENTS webhook — Vapi sends call lifecycle events here
// (call started, transcript updates, call ended, etc). Useful for
// logging transcripts and building your pitch metrics later.
// ---------------------------------------------------------------------
app.post('/api/vapi/call-events', verifyVapiSecret, (req, res) => {
  const event = req.body.message;
  console.log('Call event:', event?.type);
  // TODO: write event to your own database for analytics
  res.sendStatus(200);
});

// Health check — visit this URL in a browser to confirm the server is up
app.get('/', (req, res) => {
  res.send('Voice agent backend is running.');
});

app.listen(PORT, () => {
  console.log(`Voice agent backend listening on port ${PORT}`);
});
