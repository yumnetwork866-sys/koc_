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
    sequelize: {
      transaction: async (callback) => callback({ id: 'transaction' }),
    },
    User: {
      findByPk: async (id) => ({
        id: Number(id),
        name: 'Updated User',
        email: 'updated@example.com',
        role: 'leader',
        password_hash: 'hashed:secret123',
        async update(payload, options) {
          updateCalls.push({ payload, options });
          return this;
        },
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
  assert.equal(updateCalls[0].options.validate, true);
  assert.deepEqual(updateCalls[0].options.transaction, { id: 'transaction' });
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

test('PUT /users/:id saves centralized team and normalized hashtags', async (t) => {
  const attributionCalls = [];
  const user = {
    id: 7,
    name: 'Content User',
    email: 'content@example.com',
    role: 'member',
    get() {
      return {
        id: this.id,
        name: this.name,
        email: this.email,
        role: this.role,
        content_attribution: {
          user_id: this.id,
          team_id: 4,
          hashtags: ['#alice'],
          team: { id: 4, name: 'Creative' },
        },
      };
    },
  };
  const restoreModels = mockModule(modelsPath, {
    Role: { findByPk: async () => ({ key: 'member' }) },
    ContentTeam: { findByPk: async (id) => ({ id: Number(id), name: 'Creative' }) },
    UserContentAttribution: {
      findByPk: async () => null,
      upsert: async (payload, options) => {
        attributionCalls.push({ payload, options });
      },
    },
    sequelize: {
      transaction: async (callback) => callback({ id: 'transaction' }),
    },
    User: {
      findByPk: async () => user,
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
    body: {
      content_team_id: '4',
      content_hashtags: 'Alice, #ALICE',
    },
  };
  const res = makeResponse();

  await updateUser(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(attributionCalls[0].payload, {
    user_id: 7,
    team_id: 4,
    hashtags: ['#alice'],
    updated_at: attributionCalls[0].payload.updated_at,
  });
  assert.equal(attributionCalls[0].payload.updated_at instanceof Date, true);
  assert.equal(res.body.content_attribution.team.name, 'Creative');
});
