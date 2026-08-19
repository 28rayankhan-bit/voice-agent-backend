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
  const incomingHeader = req.headers['x-vapi-secret'];

  console.log('--- Auth check ---');
  console.log('Route:', req.path);
  console.log('Raw incoming secret:', JSON.stringify(incomingHeader));
  console.log('Expected secret:', JSON.stringify(expectedSecret));

  // If no secret is configured on Render, allow the request.
  if (!expectedSecret) {
    console.log('No VAPI_WEBHOOK_SECRET set on server - skipping check.');
    return next();
  }

  let incomingValues = [];

  if (Array.isArray(incomingHeader)) {
    incomingValues = incomingHeader;
  } else if (typeof incomingHeader === 'string') {
    incomingValues = incomingHeader.split(',');
  }

  incomingValues = incomingValues
    .map(function (value) {
      return String(value).trim();
    })
    .filter(function (value) {
      return value.length > 0;
    });

  console.log(
    'Normalized secret values:',
    JSON.stringify(incomingValues)
  );

  // Require exactly one valid secret.
  if (
    incomingValues.length !== 1 ||
    incomingValues[0] !== expectedSecret
  ) {
    console.log('MISMATCH - rejecting request with 401.');

    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  console.log('Secret matched - proceeding.');

  next();
}

// ---------------------------------------------------------------------
// SAFELY READ VAPI FUNCTION ARGUMENTS
// ---------------------------------------------------------------------
function getToolArguments(toolCall) {
  const rawArguments =
    toolCall &&
    toolCall.function &&
    toolCall.function.arguments;

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
      console.log(
        'Could not parse tool arguments:',
        rawArguments
      );

      return {};
    }
  }

  return {};
}

// ---------------------------------------------------------------------
// STANDARD VAPI TOOL RESPONSE
// ---------------------------------------------------------------------
function toolResponse(toolCallId, resultText) {
  return {
    results: [
      {
        toolCallId: toolCallId,
        result: resultText
      }
    ]
  };
}

// ---------------------------------------------------------------------
// TOOL 1: LOOKUP ORDER
// ---------------------------------------------------------------------
app.post(
  '/api/vapi/lookup-order',
  verifyVapiSecret,
  function (req, res) {
    console.log('lookup_order request received.');

    const toolCalls =
      req.body &&
      req.body.message &&
      req.body.message.toolCalls;

    const toolCall =
      Array.isArray(toolCalls) ? toolCalls[0] : null;

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

    let resultText;

    if (order) {
      resultText =
        'Order ' +
        order.number +
        ' is ' +
        order.status +
        ', arriving ' +
        order.eta +
        ', containing ' +
        order.items +
        '.';
    } else {
      resultText =
        "I couldn't find an order with that number. Could you double check it?";
    }

    console.log('lookup_order result:', resultText);

    return res.json(
      toolResponse(toolCall.id, resultText)
    );
  }
);

// ---------------------------------------------------------------------
// TOOL 2: LOOKUP ACCOUNT
// ---------------------------------------------------------------------
app.post(
  '/api/vapi/lookup-account',
  verifyVapiSecret,
  function (req, res) {
    console.log('lookup_account request received.');

    const toolCalls =
      req.body &&
      req.body.message &&
      req.body.message.toolCalls;

    const toolCall =
      Array.isArray(toolCalls) ? toolCalls[0] : null;

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

    let resultText;

    if (account) {
      resultText =
        'Found the account for ' +
        account.name +
        ', on the ' +
        account.plan +
        ' plan, status ' +
        account.status +
        '.';
    } else {
      resultText =
        "I couldn't find an account with that phone number or email.";
    }

    console.log('lookup_account result:', resultText);

    return res.json(
      toolResponse(toolCall.id, resultText)
    );
  }
);

// ---------------------------------------------------------------------
// TOOL 3: CREATE SUPPORT TICKET
// ---------------------------------------------------------------------
app.post(
  '/api/vapi/create-ticket',
  verifyVapiSecret,
  function (req, res) {
    console.log('create_support_ticket request received.');

    const toolCalls =
      req.body &&
      req.body.message &&
      req.body.message.toolCalls;

    const toolCall =
      Array.isArray(toolCalls) ? toolCalls[0] : null;

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
        "Got it, I've logged a ticket about that and someone will follow up."
      )
    );
  }
);

// ---------------------------------------------------------------------
// CALL EVENTS WEBHOOK
// ---------------------------------------------------------------------
app.post(
  '/api/vapi/call-events',
  verifyVapiSecret,
  function (req, res) {
    const event =
      req.body && req.body.message;

    console.log(
      'Call event:',
      event && event.type
    );

    return res.sendStatus(200);
  }
);

// ---------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------
app.get('/', function (req, res) {
  res.send('Voice agent backend is running.');
});

// ---------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------
app.listen(PORT, function () {
  console.log(
    'Voice agent backend listening on port ' + PORT
  );
});
```
