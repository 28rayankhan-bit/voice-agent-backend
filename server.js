require('dotenv').config();
const express = require('express');
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// TEMPORARY MOCK DATA
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
// ---------------------------------------------------------------------
function verifyVapiSecret(req, res, next) {
  const incomingSecret = req.headers['x-vapi-secret'];

  // TEMP DEBUG LOGGING — remove once the auth issue is confirmed fixed.
  console.log('--- Auth check ---');
  console.log('Route:', req.path);
  console.log('Incoming secret:', JSON.stringify(incomingSecret));
  console.log('Expected secret:', JSON.stringify(process.env.VAPI_WEBHOOK_SECRET));

  if (!process.env.VAPI_WEBHOOK_SECRET) {
    console.log('No VAPI_WEBHOOK_SECRET set on server — skipping check.');
    return next();
  }
  if (incomingSecret !== process.env.VAPI_WEBHOOK_SECRET) {
    console.log('MISMATCH — rejecting request with 401.');
    return res.status(401).json({ error: 'Unauthorized' });
  }
  console.log('Secret matched — proceeding.');
  next();
}

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

  console.log('New ticket:', args);

  res.json(toolResponse(toolCall.id, `Got it, I've logged a ticket about that and someone will follow up.`));
});

// ---------------------------------------------------------------------
// CALL EVENTS webhook
// ---------------------------------------------------------------------
app.post('/api/vapi/call-events', verifyVapiSecret, (req, res) => {
  const event = req.body.message;
  console.log('Call event:', event?.type);
  res.sendStatus(200);
});

// Health check
app.get('/', (req, res) => {
  res.send('Voice agent backend is running.');
});

app.listen(PORT, () => {
  console.log(`Voice agent backend listening on port ${PORT}`);
});
