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

  console.log('----------------------------------------');
  console.log('VAPI AUTH CHECK');
  console.log('Route:', req.path);
  console.log(
    'Incoming secret:',
    JSON.stringify(incomingHeader)
  );
  console.log(
    'Expected secret:',
    JSON.stringify(expectedSecret)
  );

  // Allow requests if no secret is configured.
  if (!expectedSecret) {
    console.log(
      'No VAPI_WEBHOOK_SECRET configured - skipping auth.'
    );

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

  if (
    incomingValues.length !== 1 ||
    incomingValues[0] !== expectedSecret
  ) {
    console.log('AUTH FAILED');

    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  console.log('AUTH SUCCESS');

  next();
}

// ---------------------------------------------------------------------
// GET VAPI TOOL CALL
// Supports current Vapi format + older format
// ---------------------------------------------------------------------

function getToolCall(req) {
  const message = req.body && req.body.message;

  if (!message) {
    return null;
  }

  // Current Vapi format
  if (
    Array.isArray(message.toolCallList) &&
    message.toolCallList.length > 0
  ) {
    return message.toolCallList[0];
  }

  // Older/alternate format
  if (
    Array.isArray(message.toolCalls) &&
    message.toolCalls.length > 0
  ) {
    return message.toolCalls[0];
  }

  return null;
}

// ---------------------------------------------------------------------
// GET TOOL ARGUMENTS
// Supports current Vapi format + older format
// ---------------------------------------------------------------------

function getToolArguments(toolCall) {
  if (!toolCall) {
    return {};
  }

  // ---------------------------------------------------------------
  // Current Vapi format:
  //
  // {
  //   "id": "...",
  //   "name": "lookup_order",
  //   "arguments": {
  //      "order_number": "12345"
  //   }
  // }
  // ---------------------------------------------------------------

  if (toolCall.arguments) {
    if (typeof toolCall.arguments === 'object') {
      return toolCall.arguments;
    }

    if (typeof toolCall.arguments === 'string') {
      try {
        return JSON.parse(toolCall.arguments);
      } catch (error) {
        console.log(
          'Could not parse toolCall.arguments:',
          toolCall.arguments
        );

        return {};
      }
    }
  }

  // ---------------------------------------------------------------
  // Alternate format:
  //
  // function.arguments
  // ---------------------------------------------------------------

  if (
    toolCall.function &&
    toolCall.function.arguments
  ) {
    const rawArguments = toolCall.function.arguments;

    if (typeof rawArguments === 'object') {
      return rawArguments;
    }

    if (typeof rawArguments === 'string') {
      try {
        return JSON.parse(rawArguments);
      } catch (error) {
        console.log(
          'Could not parse function.arguments:',
          rawArguments
        );

        return {};
      }
    }
  }

  // ---------------------------------------------------------------
  // Some Vapi payloads may use parameters
  // ---------------------------------------------------------------

  if (toolCall.parameters) {
    if (typeof toolCall.parameters === 'object') {
      return toolCall.parameters;
    }

    if (typeof toolCall.parameters === 'string') {
      try {
        return JSON.parse(toolCall.parameters);
      } catch (error) {
        console.log(
          'Could not parse toolCall.parameters:',
          toolCall.parameters
        );

        return {};
      }
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
        result: String(resultText)
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
    console.log('');
    console.log('========================================');
    console.log('LOOKUP ORDER REQUEST');
    console.log('========================================');

    console.log(
      'Full request body:',
      JSON.stringify(req.body, null, 2)
    );

    const toolCall = getToolCall(req);

    if (!toolCall) {
      console.log('ERROR: No tool call found.');

      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    console.log(
      'Tool call:',
      JSON.stringify(toolCall, null, 2)
    );

    const args = getToolArguments(toolCall);

    console.log(
      'Parsed arguments:',
      JSON.stringify(args, null, 2)
    );

    const orderNumber = String(
      args.order_number || ''
    ).trim();

    console.log(
      'ORDER NUMBER RECEIVED:',
      JSON.stringify(orderNumber)
    );

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

      console.log(
        'ORDER FOUND:',
        JSON.stringify(order, null, 2)
      );
    } else {
      resultText =
        "I couldn't find an order with that number. Could you double check it?";

      console.log(
        'ORDER NOT FOUND:',
        JSON.stringify(orderNumber)
      );
    }

    console.log(
      'RESULT SENT TO VAPI:',
      resultText
    );

    return res.status(200).json(
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
    console.log('');
    console.log('========================================');
    console.log('LOOKUP ACCOUNT REQUEST');
    console.log('========================================');

    console.log(
      'Full request body:',
      JSON.stringify(req.body, null, 2)
    );

    const toolCall = getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    console.log(
      'Parsed account arguments:',
      JSON.stringify(args, null, 2)
    );

    const phoneOrEmail = String(
      args.phone_or_email || ''
    ).trim();

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

    console.log(
      'ACCOUNT RESULT:',
      resultText
    );

    return res.status(200).json(
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
    console.log('');
    console.log('========================================');
    console.log('CREATE SUPPORT TICKET REQUEST');
    console.log('========================================');

    console.log(
      'Full request body:',
      JSON.stringify(req.body, null, 2)
    );

    const toolCall = getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    console.log(
      'NEW TICKET:',
      JSON.stringify(args, null, 2)
    );

    const resultText =
      "Got it, I've logged a ticket about that and someone will follow up.";

    return res.status(200).json(
      toolResponse(
        toolCall.id,
        resultText
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
      'CALL EVENT:',
      event && event.type
    );

    return res.sendStatus(200);
  }
);

// ---------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------

app.get('/', function (req, res) {
  res.send(
    'Voice agent backend is running.'
  );
});

// ---------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------

app.listen(PORT, function () {
  console.log(
    'Voice agent backend listening on port ' +
    PORT
  );
});
