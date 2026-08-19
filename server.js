```js
require('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// TEMPORARY MOCK DATA
// ---------------------------------------------------------------------
const MOCK_ORDERS = {
  '12345': {
    number: '12345',
    status: 'shipped',
    eta: 'tomorrow',
    items: '2 items'
  },
  '67890': {
    number: '67890',
    status: 'processing',
    eta: 'in 3 days',
    items: '1 item'
  }
};

const MOCK_ACCOUNTS = {
  'jane@example.com': {
    name: 'Jane Doe',
    plan: 'Pro',
    status: 'active'
  }
};

// ---------------------------------------------------------------------
// VAPI AUTHENTICATION
// ---------------------------------------------------------------------
function verifyVapiSecret(req, res, next) {
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;

  // Get the incoming header.
  const incomingHeader = req.headers['x-vapi-secret'];

  // TEMP DEBUG LOGGING — remove after auth is confirmed fixed.
  console.log('--- Auth check ---');
  console.log('Route:', req.path);
  console.log('Raw incoming secret:', JSON.stringify(incomingHeader));
  console.log('Expected secret:', JSON.stringify(expectedSecret));

  // If no secret is configured on Render, skip authentication.
  if (!expectedSecret) {
    console.log('No VAPI_WEBHOOK_SECRET set on server — skipping check.');
    return next();
  }

  // Normalize the incoming header.
  //
  // Node can combine duplicate headers into a comma-separated string.
  // For example:
  //     ", mysecret123"
  //
  // We split that value, remove empty pieces, trim whitespace,
  // and then require exactly ONE actual secret value.
  let incomingValues = [];

  if (Array.isArray(incomingHeader)) {
    incomingValues = incomingHeader;
  } else if (typeof incomingHeader === 'string') {
    incomingValues = incomingHeader.split(',');
  }

  incomingValues = incomingValues
    .map(value => String(value).trim())
    .filter(Boolean);

  console.log('Normalized secret values:', JSON.stringify(incomingValues));

  // Security rule:
  // There must be exactly one non-empty value, and it must match.
  if (
    incomingValues.length !== 1 ||
    incomingValues[0] !== expectedSecret
  ) {
    console.log('MISMATCH — rejecting request with 401.');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('Secret matched — proceeding.');
  next();
}

// ---------------------------------------------------------------------
// Safely read Vapi function arguments.
// Vapi may send arguments as an object or a JSON string.
// ---------------------------------------------------------------------
function getToolArguments(toolCall) {
  const rawArguments = toolCall?.function?.arguments;

  if (!rawArguments) {
    return {};
  }

  if (typeof rawArguments === 'object') {
    return rawArguments;
  }

  if (typeof rawArguments === 'string') {
    try {
      return JSON.parse(rawArguments);
    } catch (error) {
      console.log('Could not parse tool arguments:', rawArguments);
      return {};
    }
  }

  return {};
}

// ---------------------------------------------------------------------
// Standard Vapi tool response
// ---------------------------------------------------------------------
function toolResponse(toolCallId, resultText) {
  return {
    results: [
      {
        toolCallId,
        result: resultText
      }
    ]
  };
}

// ---------------------------------------------------------------------
// TOOL 1: lookup_order
// ---------------------------------------------------------------------
app.post('/api/vapi/lookup-order', verifyVapiSecret, (req, res) => {
  console.log('lookup_order request received.');

  const toolCall = req.body?.message?.toolCalls?.[0];

  if (!toolCall) {
    console.log('No tool call found in request body.');
    return res.status(400).json({
      error: 'No tool call found'
    });
  }

  const args = getToolArguments(toolCall);
  const orderNumber = args.order_number;

  console.log('Order number:', orderNumber);

  const order = MOCK_ORDERS[orderNumber];

  const resultText = order
    ? `Order ${order.number} is ${order.status}, arriving ${order.eta}, containing ${order.items}.`
    : `I couldn't find an order with that number. Could you double check it?`;

  console.log('lookup_order result:', resultText);

  return res.json(
    toolResponse(toolCall.id, resultText)
  );
});

// ---------------------------------------------------------------------
// TOOL 2: lookup_account
// ---------------------------------------------------------------------
app.post('/api/vapi/lookup-account', verifyVapiSecret, (req, res) => {
  console.log('lookup_account request received.');

  const toolCall = req.body?.message?.toolCalls?.[0];

  if (!toolCall) {
    console.log('No tool call found in request body.');
    return res.status(400).json({
      error: 'No tool call found'
    });
  }

  const args = getToolArguments(toolCall);
  const phoneOrEmail = args.phone_or_email;

  console.log('Account lookup:', phoneOrEmail);

  const account = MOCK_ACCOUNTS[phoneOrEmail];

  const resultText = account
    ? `Found the account for ${account.name}, on the ${account.plan} plan, status ${account.status}.`
    : `I couldn't find an account with that phone number or email.`;

  console.log('lookup_account result:', resultText);

  return res.json(
    toolResponse(toolCall.id, resultText)
  );
});

// ---------------------------------------------------------------------
// TOOL 3: create_support_ticket
// ---------------------------------------------------------------------
app.post('/api/vapi/create-ticket', verifyVapiSecret, (req, res) => {
  console.log('create_support_ticket request received.');

  const toolCall = req.body?.message?.toolCalls?.[0];

  if (!toolCall) {
    console.log('No tool call found in request body.');
    return res.status(400).json({
      error: 'No tool call found'
    });
  }

  const args = getToolArguments(toolCall);

  console.log('New ticket:', args);

  return res.json(
    toolResponse(
      toolCall.id,
      `Got it, I've logged a ticket about that and someone will follow up.`
    )
  );
});

// ---------------------------------------------------------------------
// CALL EVENTS WEBHOOK
// ---------------------------------------------------------------------
app.post('/api/vapi/call-events', verifyVapiSecret, (req, res) => {
  const event = req.body?.message;

  console.log('Call event:', event?.type);

  return res.sendStatus(200);
});

// ---------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------
app.get('/', (req, res) => {
  res.send('Voice agent backend is running.');
});

// ---------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------
app.listen(PORT, () => {
  console.log(`Voice agent backend listening on port ${PORT}`);
});
```
