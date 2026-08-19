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

  // DO NOT log the actual secret.
  console.log(
    'Incoming header present:',
    Boolean(incomingHeader)
  );

  console.log(
    'Expected secret configured:',
    Boolean(expectedSecret)
  );

  // If no secret is configured on Render,
  // allow the request.
  if (!expectedSecret) {
    console.log(
      'WARNING: VAPI_WEBHOOK_SECRET is not configured. Authentication skipped.'
    );

    return next();
  }

  let incomingValues = [];

  // Node can provide a header as an array.
  if (Array.isArray(incomingHeader)) {
    incomingValues = incomingHeader;
  }

  // Normally Node provides it as a string.
  else if (typeof incomingHeader === 'string') {
    incomingValues = incomingHeader.split(',');
  }

  // Clean up the values.
  incomingValues = incomingValues
    .map(function (value) {
      return String(value).trim();
    })
    .filter(function (value) {
      return value.length > 0;
    });

  console.log(
    'Number of normalized secret values:',
    incomingValues.length
  );

  // IMPORTANT:
  // Render previously showed:
  //
  // Incoming secret: ", mysecret123"
  //
  // After split(',') this becomes:
  //
  // ["", " mysecret123"]
  //
  // After trim/filter it becomes:
  //
  // ["mysecret123"]
  //
  // Therefore this handles that situation correctly.

  const secretMatched =
    incomingValues.length === 1 &&
    incomingValues[0] === expectedSecret.trim();

  if (!secretMatched) {
    console.log(
      'MISMATCH - rejecting request with 401.'
    );

    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  console.log(
    'Secret matched - proceeding.'
  );

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

  // Some Vapi requests can provide arguments as an object.
  if (typeof rawArguments === 'object') {
    return rawArguments;
  }

  // Some Vapi requests provide arguments as JSON text.
  if (typeof rawArguments === 'string') {
    try {
      return JSON.parse(rawArguments);
    } catch (error) {
      console.log(
        'Could not parse tool arguments.'
      );

      return {};
    }
  }

  return {};
}

// ---------------------------------------------------------------------
// GET FIRST VAPI TOOL CALL
// ---------------------------------------------------------------------

function getToolCall(req) {
  const toolCalls =
    req.body &&
    req.body.message &&
    req.body.message.toolCalls;

  if (!Array.isArray(toolCalls)) {
    return null;
  }

  return toolCalls[0] || null;
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
    console.log(
      'lookup_order request received.'
    );

    const toolCall = getToolCall(req);

    if (!toolCall) {
      console.log(
        'No tool call found in request body.'
      );

      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    const orderNumber =
      args.order_number != null
        ? String(args.order_number).trim()
        : '';

    console.log(
      'Order number:',
      orderNumber
    );

    const order =
      MOCK_ORDERS[orderNumber];

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

    console.log(
      'lookup_order completed.'
    );

    return res.json(
      toolResponse(
        toolCall.id,
        resultText
      )
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
    console.log(
      'lookup_account request received.'
    );

    const toolCall = getToolCall(req);

    if (!toolCall) {
      console.log(
        'No tool call found in request body.'
      );

      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    const phoneOrEmail =
      args.phone_or_email != null
        ? String(args.phone_or_email)
            .trim()
            .toLowerCase()
        : '';

    console.log(
      'Account lookup requested.'
    );

    const account =
      MOCK_ACCOUNTS[phoneOrEmail];

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

    console.log(
      'lookup_account completed.'
    );

    return res.json(
      toolResponse(
        toolCall.id,
        resultText
      )
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
    console.log(
      'create_support_ticket request received.'
    );

    const toolCall = getToolCall(req);

    if (!toolCall) {
      console.log(
        'No tool call found in request body.'
      );

      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    console.log(
      'New support ticket received.'
    );

    console.log(
      'Ticket fields:',
      Object.keys(args)
    );

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
      req.body &&
      req.body.message;

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

app.get(
  '/',
  function (req, res) {
    res.status(200).send(
      'Voice agent backend is running.'
    );
  }
);

// Additional health endpoint.
app.get(
  '/health',
  function (req, res) {
    res.status(200).json({
      status: 'ok',
      service: 'voice-agent-backend'
    });
  }
);

// ---------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------

app.listen(
  PORT,
  '0.0.0.0',
  function () {
    console.log(
      'Voice agent backend listening on port ' +
      PORT
    );
  }
);
