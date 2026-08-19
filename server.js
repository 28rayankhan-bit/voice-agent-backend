rrequire('dotenv').config();

const express = require('express');
const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------
// NOVA MOCK DATA
// Replace this later with Nova's real API integration.
// ---------------------------------------------------------------------

const MOCK_NOVA_CUSTOMERS = {
  '03001234567': {
    customer_id: 'NOVA-1001',
    name: 'Ahmed Khan',
    phone: '03001234567',
    address: 'House 123, Islamabad',
    customer_since: '2005',

    cable: {
      status: 'active',
      package: 'Nova Cable Basic'
    },

    internet: {
      status: 'not_subscribed'
    },

    current_bill: {
      amount: 2150,
      currency: 'PKR',
      due_date: '2026-08-25'
    },

    complaints: []
  },

  '03007654321': {
    customer_id: 'NOVA-1002',
    name: 'Usman Ali',
    phone: '03007654321',
    address: 'Street 10, Islamabad',
    customer_since: '2021',

    cable: {
      status: 'active',
      package: 'Nova Cable Premium'
    },

    internet: {
      status: 'active',
      package: 'Nova Internet 20 Mbps'
    },

    current_bill: {
      amount: 3200,
      currency: 'PKR',
      due_date: '2026-08-28'
    },

    complaints: [
      {
        complaint_id: 'CMP-10001',
        status: 'open',
        subject: 'Internet speed issue'
      }
    ]
  }
};

// ---------------------------------------------------------------------
// MOCK SERVICE AVAILABILITY
// ---------------------------------------------------------------------

const MOCK_SERVICE_AREA = {
  'House 123, Islamabad': {
    internet_available: true,
    cable_available: true
  },

  'Street 10, Islamabad': {
    internet_available: true,
    cable_available: true
  }
};

const MOCK_COMPLAINTS = [];

// ---------------------------------------------------------------------
// VAPI AUTHENTICATION
// ---------------------------------------------------------------------

function verifyVapiSecret(req, res, next) {
  const expectedSecret = process.env.VAPI_WEBHOOK_SECRET;
  const incomingHeader = req.headers['x-vapi-secret'];

  if (!expectedSecret) {
    console.warn(
      'WARNING: VAPI_WEBHOOK_SECRET is not configured.'
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
    .map(value => String(value).trim())
    .filter(value => value.length > 0);

  if (
    incomingValues.length !== 1 ||
    incomingValues[0] !== expectedSecret
  ) {
    return res.status(401).json({
      error: 'Unauthorized'
    });
  }

  next();
}

// ---------------------------------------------------------------------
// VAPI TOOL HELPERS
// ---------------------------------------------------------------------

function getToolCall(req) {
  const message = req.body && req.body.message;

  if (!message) {
    return null;
  }

  if (
    Array.isArray(message.toolCallList) &&
    message.toolCallList.length > 0
  ) {
    return message.toolCallList[0];
  }

  if (
    Array.isArray(message.toolCalls) &&
    message.toolCalls.length > 0
  ) {
    return message.toolCalls[0];
  }

  return null;
}

function getToolArguments(toolCall) {
  if (!toolCall) {
    return {};
  }

  const possibleArguments = [
    toolCall.arguments,
    toolCall.function &&
      toolCall.function.arguments,
    toolCall.parameters
  ];

  for (const raw of possibleArguments) {
    if (raw && typeof raw === 'object') {
      return raw;
    }

    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw);
      } catch (error) {
        // Try next format.
      }
    }
  }

  return {};
}

function toolResponse(toolCallId, resultText) {
  return {
    results: [
      {
        toolCallId,
        result: String(resultText)
      }
    ]
  };
}

// ---------------------------------------------------------------------
// PHONE NORMALIZATION
// ---------------------------------------------------------------------

function normalizePhone(phone) {
  return String(phone || '')
    .replace(/[^\d+]/g, '')
    .trim();
}

// ---------------------------------------------------------------------
// FIND CUSTOMER
// ---------------------------------------------------------------------

function getCustomerByPhone(phone) {
  const normalized = normalizePhone(phone);

  return MOCK_NOVA_CUSTOMERS[normalized] || null;
}

// ---------------------------------------------------------------------
// TOOL 1: LOOKUP CUSTOMER
// ---------------------------------------------------------------------

app.post(
  '/api/vapi/lookup-customer',
  verifyVapiSecret,
  (req, res) => {

    const toolCall = getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    const phone = normalizePhone(
      args.phone_number
    );

    const customer = getCustomerByPhone(phone);

    let resultText;

    if (!customer) {

      resultText =
        'No Nova customer record was found for that phone number. Do not guess customer information.';

    } else {

      resultText = JSON.stringify({
        found: true,

        customer_id:
          customer.customer_id,

        name:
          customer.name,

        phone:
          customer.phone,

        address:
          customer.address,

        customer_since:
          customer.customer_since,

        cable_status:
          customer.cable.status,

        cable_package:
          customer.cable.package,

        internet_status:
          customer.internet.status,

        internet_package:
          customer.internet.package || null
      });
    }

    return res.status(200).json(
      toolResponse(
        toolCall.id,
        resultText
      )
    );
  }
);

// ---------------------------------------------------------------------
// TOOL 2: LOOKUP BILL
// ---------------------------------------------------------------------

app.post(
  '/api/vapi/lookup-bill',
  verifyVapiSecret,
  (req, res) => {

    const toolCall = getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    const customer =
      getCustomerByPhone(
        args.phone_number
      );

    let resultText;

    if (!customer) {

      resultText =
        'No Nova customer record was found. Do not provide a bill amount.';

    } else {

      resultText = JSON.stringify({
        found: true,

        customer_id:
          customer.customer_id,

        name:
          customer.name,

        amount:
          customer.current_bill.amount,

        currency:
          customer.current_bill.currency,

        due_date:
          customer.current_bill.due_date
      });
    }

    return res.status(200).json(
      toolResponse(
        toolCall.id,
        resultText
      )
    );
  }
);

// ---------------------------------------------------------------------
// TOOL 3: CHECK SERVICE AVAILABILITY
// ---------------------------------------------------------------------

app.post(
  '/api/vapi/check-service-availability',
  verifyVapiSecret,
  (req, res) => {

    const toolCall = getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    const address =
      String(args.address || '').trim();

    const service =
      String(args.service || '')
        .trim()
        .toLowerCase();

    const availability =
      MOCK_SERVICE_AREA[address];

    let resultText;

    if (!availability) {

      resultText =
        'Service availability could not be confirmed for that address.';

    } else if (service === 'internet') {

      resultText = JSON.stringify({
        address,
        service: 'internet',
        available:
          availability.internet_available
      });

    } else if (service === 'cable') {

      resultText = JSON.stringify({
        address,
        service: 'cable',
        available:
          availability.cable_available
      });

    } else {

      resultText =
        'The requested service type is not supported by this tool.';
    }

    return res.status(200).json(
      toolResponse(
        toolCall.id,
        resultText
      )
    );
  }
);

// ---------------------------------------------------------------------
// TOOL 4: CREATE COMPLAINT
// ---------------------------------------------------------------------

app.post(
  '/api/vapi/create-complaint',
  verifyVapiSecret,
  (req, res) => {

    const toolCall = getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args = getToolArguments(toolCall);

    const phone =
      normalizePhone(
        args.phone_number
      );

    const customer =
      getCustomerByPhone(phone);

    if (!customer) {

      return res.status(200).json(
        toolResponse(
          toolCall.id,

          'The customer could not be verified. Do not create a complaint until the customer record is found.'
        )
      );
    }

    const complaintId =
      'CMP-' +
      String(
        MOCK_COMPLAINTS.length + 10001
      );

    const complaint = {

      complaint_id:
        complaintId,

      customer_id:
        customer.customer_id,

      subject:
        String(
          args.subject ||
          'Customer complaint'
        ),

      description:
        String(
          args.description || ''
        ),

      status:
        'open',

      created_at:
        new Date().toISOString()
    };

    MOCK_COMPLAINTS.push(
      complaint
    );

    customer.complaints.push(
      complaint
    );

    const resultText =
      JSON.stringify({
        success: true,

        complaint_id:
          complaintId,

        status:
          'open'
      });

    return res.status(200).json(
      toolResponse(
        toolCall.id,
        resultText
      )
    );
  }
);

// ---------------------------------------------------------------------
// TOOL 5: REQUEST NEW CONNECTION
// ---------------------------------------------------------------------

app.post(
  '/api/vapi/request-new-connection',
  verifyVapiSecret,
  (req, res) => {

    const toolCall =
      getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args =
      getToolArguments(toolCall);

    const phone =
      normalizePhone(
        args.phone_number
      );

    const customer =
      getCustomerByPhone(phone);

    if (!customer) {

      return res.status(200).json(
        toolResponse(
          toolCall.id,

          'The customer could not be verified. Do not submit a connection request.'
        )
      );
    }

    const address =
      String(
        args.address ||
        customer.address
      ).trim();

    const service =
      String(
        args.service ||
        'internet'
      )
        .trim()
        .toLowerCase();

    const availability =
      MOCK_SERVICE_AREA[address];

    if (!availability) {

      return res.status(200).json(
        toolResponse(
          toolCall.id,

          'Service availability could not be confirmed for this address. Do not promise a new connection.'
        )
      );
    }

    const available =
      service === 'internet'
        ? availability.internet_available
        : service === 'cable'
          ? availability.cable_available
          : false;

    if (!available) {

      return res.status(200).json(
        toolResponse(
          toolCall.id,

          `The requested ${service} service is not currently confirmed as available at this address.`
        )
      );
    }

    const requestId =
      'REQ-' +
      String(Date.now()).slice(-8);

    return res.status(200).json(
      toolResponse(
        toolCall.id,

        JSON.stringify({
          success: true,

          request_id:
            requestId,

          customer_id:
            customer.customer_id,

          service,

          address,

          status:
            'request_created'
        })
      )
    );
  }
);

// ---------------------------------------------------------------------
// TOOL 6: REQUEST DISCONNECTION
// ---------------------------------------------------------------------

app.post(
  '/api/vapi/request-disconnection',
  verifyVapiSecret,
  (req, res) => {

    const toolCall =
      getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args =
      getToolArguments(toolCall);

    const phone =
      normalizePhone(
        args.phone_number
      );

    const customer =
      getCustomerByPhone(phone);

    if (!customer) {

      return res.status(200).json(
        toolResponse(
          toolCall.id,

          'The customer could not be verified. Do not submit a disconnection request.'
        )
      );
    }

    const service =
      String(
        args.service || ''
      )
        .trim()
        .toLowerCase();

    if (
      !['internet', 'cable']
        .includes(service)
    ) {

      return res.status(200).json(
        toolResponse(
          toolCall.id,

          'Please specify whether the customer wants to disconnect internet or cable.'
        )
      );
    }

    const requestId =
      'DISC-' +
      String(Date.now()).slice(-8);

    return res.status(200).json(
      toolResponse(
        toolCall.id,

        JSON.stringify({
          success: true,

          request_id:
            requestId,

          customer_id:
            customer.customer_id,

          service,

          status:
            'disconnection_request_created'
        })
      )
    );
  }
);

// ---------------------------------------------------------------------
// TOOL 7: TRANSFER TO HUMAN
// ---------------------------------------------------------------------

app.post(
  '/api/vapi/transfer-to-human',
  verifyVapiSecret,
  (req, res) => {

    const toolCall =
      getToolCall(req);

    if (!toolCall) {
      return res.status(400).json({
        error: 'No tool call found'
      });
    }

    const args =
      getToolArguments(toolCall);

    console.log(
      'Human transfer requested:',
      {
        reason:
          args.reason ||
          'Not specified'
      }
    );

    return res.status(200).json(
      toolResponse(
        toolCall.id,

        'A human support representative should take over this call.'
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
  (req, res) => {

    const event =
      req.body &&
      req.body.message;

    console.log(
      'CALL EVENT:',
      event &&
      event.type
    );

    return res.sendStatus(200);
  }
);

// ---------------------------------------------------------------------
// HEALTH CHECK
// ---------------------------------------------------------------------

app.get('/', (req, res) => {

  res.send(
    'Nova Communications AI backend is running.'
  );
});

// ---------------------------------------------------------------------
// START SERVER
// ---------------------------------------------------------------------

app.listen(PORT, () => {

  console.log(
    'Nova AI backend listening on port ' +
    PORT
  );
});
