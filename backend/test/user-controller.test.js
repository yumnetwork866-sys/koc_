const test = require('node:test');
const assert = require('node:assert/strict');

const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const passwordPath = require.resolve('../src/lib/password');
const userControllerPath = require.resolve('../src/controllers/userController');

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

test('PUT /users/:id updates user profile fields and password', async (t) => {
  const updateCalls = [];
  const restorePassword = mockModule(passwordPath, {
    hashPassword: async (password) => `hashed:${password}`,
  });
  const restoreModels = mockModule(modelsPath, {
    Role: { findByPk: async () => ({ key: 'leader' }) },
    User: {
      update: async (payload, options) => {
        updateCalls.push({ payload, options });
        return [1];
      },
      findByPk: async (id) => ({
        id: Number(id),
        name: 'Updated User',
        email: 'updated@example.com',
        role: 'leader',
        password_hash: 'hashed:secret123',
        get() {
          return {
            id: Number(id),
            name: 'Updated User',
            email: 'updated@example.com',
            role: 'leader',
            password_hash: 'hashed:secret123',
          };
        },
      }),
    },
  });

  t.after(() => {
    restorePassword();
    restoreModels();
    delete require.cache[userControllerPath];
  });

  delete require.cache[userControllerPath];
  const { updateUser } = require('../src/controllers/userController');
  const req = {
    params: { id: '7' },
    body: {
      name: 'Updated User',
      email: 'updated@example.com',
      role: 'leader',
      password: 'secret123',
    },
  };
  const res = makeResponse();

  await updateUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    id: 7,
    name: 'Updated User',
    email: 'updated@example.com',
    role: 'leader',
  });
  assert.deepEqual(updateCalls[0].payload, {
    name: 'Updated User',
    email: 'updated@example.com',
    role: 'leader',
    password_hash: 'hashed:secret123',
  });
});

test('PUT /users/:id rejects empty updates', async (t) => {
  const restoreModels = mockModule(modelsPath, {
    User: {
      update: async () => [1],
      findByPk: async () => null,
    },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[userControllerPath];
  });

  delete require.cache[userControllerPath];
  const { updateUser } = require('../src/controllers/userController');
  const req = {
    params: { id: '7' },
    body: {},
  };
  const res = makeResponse();

  await updateUser(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, 'No update fields provided');
});
