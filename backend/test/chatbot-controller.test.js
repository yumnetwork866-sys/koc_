const test = require('node:test');
const assert = require('node:assert/strict');

const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const chatbotControllerPath = require.resolve('../src/controllers/chatbotController');

const makeResponse = () => ({
  statusCode: 200,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.body = payload;
    return this;
  },
});

const getWhereValues = (whereClause) => {
  const pageIdClause = whereClause?.page_id;
  const symbolKey = pageIdClause && Object.getOwnPropertySymbols(pageIdClause)[0];
  return symbolKey ? pageIdClause[symbolKey] : undefined;
};

test('POST /facebook/revoke distinguishes a missing Facebook login from admin authentication', async (t) => {
  const restoreModels = mockModule(modelsPath, {
    FacebookUserSession: { findByPk: async () => null },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[chatbotControllerPath];
  });

  delete require.cache[chatbotControllerPath];
  const { revokeFacebookAccount } = require('../src/controllers/chatbotController');
  const req = { get: () => null };
  const res = makeResponse();

  await revokeFacebookAccount(req, res);

  assert.equal(res.statusCode, 428);
  assert.deepEqual(res.body, {
    code: 'FACEBOOK_LOGIN_REQUIRED',
    message: 'Facebook login is required',
  });
});

test('POST /facebook/revoke removes every session for the Facebook user', async (t) => {
  const destroyCalls = [];
  const pageDestroyCalls = [];
  const messageDestroyCalls = [];
  const orderDestroyCalls = [];

  const restoreModels = mockModule(modelsPath, {
    FacebookPage: {
      async findAll() {
        return [
          {
            id: 'page-1',
            access_token_encrypted: 'temp-page-token-1',
            async destroy() {
              pageDestroyCalls.push(this.id);
            },
          },
          {
            id: 'page-2',
            access_token_encrypted: 'temp-page-token-2',
            async destroy() {
              pageDestroyCalls.push(this.id);
            },
          },
        ];
      },
    },
    FacebookUserSession: {
      async findByPk(sid) {
        if (sid !== 'sid-current') return null;
        return {
          sid: 'sid-current',
          user_id: 'fb-user-1',
          user_name: 'Alice',
          user_token_encrypted: 'temp-user-token',
          expires_at: new Date(Date.now() + 60_000),
        };
      },
      async findAll(options) {
        assert.deepEqual(options.where, { user_id: 'fb-user-1' });
        return [
          { sid: 'sid-current', user_id: 'fb-user-1', user_name: 'Alice' },
          { sid: 'sid-older', user_id: 'fb-user-1', user_name: 'Alice' },
        ];
      },
      async destroy(options) {
        destroyCalls.push(options);
      },
    },
    ChatbotMessage: {
      async destroy(options) {
        messageDestroyCalls.push(options);
      },
    },
    ChatbotOrder: {
      async destroy(options) {
        orderDestroyCalls.push(options);
      },
    },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[chatbotControllerPath];
  });

  delete require.cache[chatbotControllerPath];
  const { revokeFacebookAccount } = require('../src/controllers/chatbotController');

  const req = {
    get(name) {
      return name === 'x-fb-chatbot-token' ? 'sid-current' : null;
    },
  };
  const res = makeResponse();

  await revokeFacebookAccount(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, revokedPages: 2 });
  assert.deepEqual(destroyCalls, [{ where: { user_id: 'fb-user-1' } }]);
  assert.equal(messageDestroyCalls.length, 1);
  assert.equal(orderDestroyCalls.length, 1);
  assert.deepEqual(pageDestroyCalls.sort(), ['page-1', 'page-2']);
});

test('GET /facebook/me returns the stored avatar url for the active session', async (t) => {
  const restoreModels = mockModule(modelsPath, {
    FacebookUserSession: {
      async findByPk(sid) {
        if (sid !== 'sid-current') return null;
        return {
          sid: 'sid-current',
          user_id: 'fb-user-1',
          user_name: 'Alice',
          avatar_url: 'https://example.com/avatar.jpg',
          user_token_encrypted: 'temp-user-token',
          expires_at: new Date(Date.now() + 60_000),
        };
      },
    },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[chatbotControllerPath];
  });

  delete require.cache[chatbotControllerPath];
  const { getFacebookMe } = require('../src/controllers/chatbotController');

  const req = {
    get(name) {
      return name === 'x-fb-chatbot-token' ? 'sid-current' : null;
    },
  };
  const res = makeResponse();

  await getFacebookMe(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    configured: false,
    loggedIn: true,
    name: 'Alice',
    userId: 'fb-user-1',
    avatarUrl: 'https://example.com/avatar.jpg',
  });
});

test('POST /facebook/revoke deletes chatbot messages and orders for revoked pages', async (t) => {
  const pageDestroyCalls = [];
  const messageDestroyCalls = [];
  const orderDestroyCalls = [];

  const restoreModels = mockModule(modelsPath, {
    FacebookPage: {
      async findAll() {
        return [
          {
            id: 'page-1',
            access_token_encrypted: 'temp-page-token-1',
            async destroy() {
              pageDestroyCalls.push(this.id);
            },
          },
          {
            id: 'page-2',
            access_token_encrypted: 'temp-page-token-2',
            async destroy() {
              pageDestroyCalls.push(this.id);
            },
          },
        ];
      },
    },
    FacebookUserSession: {
      async findByPk(sid) {
        if (sid !== 'sid-current') return null;
        return {
          sid: 'sid-current',
          user_id: 'fb-user-1',
          user_name: 'Alice',
          user_token_encrypted: 'temp-user-token',
          expires_at: new Date(Date.now() + 60_000),
        };
      },
      async findAll(options) {
        assert.deepEqual(options.where, { user_id: 'fb-user-1' });
        return [
          { sid: 'sid-current', user_id: 'fb-user-1', user_name: 'Alice' },
          { sid: 'sid-older', user_id: 'fb-user-1', user_name: 'Alice' },
        ];
      },
      async destroy(options) {
        if (options.where?.user_id) return;
        throw new Error('unexpected session destroy call');
      },
    },
    ChatbotMessage: {
      async destroy(options) {
        messageDestroyCalls.push(options);
        return 4;
      },
    },
    ChatbotOrder: {
      async destroy(options) {
        orderDestroyCalls.push(options);
        return 2;
      },
    },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[chatbotControllerPath];
  });

  delete require.cache[chatbotControllerPath];
  const { revokeFacebookAccount } = require('../src/controllers/chatbotController');

  const req = {
    get(name) {
      return name === 'x-fb-chatbot-token' ? 'sid-current' : null;
    },
  };
  const res = makeResponse();

  await revokeFacebookAccount(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { ok: true, revokedPages: 2 });
  assert.equal(messageDestroyCalls.length, 1);
  assert.equal(orderDestroyCalls.length, 1);
  assert.deepEqual(getWhereValues(messageDestroyCalls[0].where).sort(), ['page-1', 'page-2']);
  assert.deepEqual(getWhereValues(orderDestroyCalls[0].where).sort(), ['page-1', 'page-2']);
  assert.deepEqual(pageDestroyCalls.sort(), ['page-1', 'page-2']);
});
