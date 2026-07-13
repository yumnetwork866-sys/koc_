const test = require('node:test');
const assert = require('node:assert/strict');

const { mockModule } = require('./helpers/mockModule');

const modelsPath = require.resolve('../src/models');
const passwordPath = require.resolve('../src/lib/password');
const authControllerPath = require.resolve('../src/controllers/authController');

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

test('auth route wires POST /login to the login controller', (t) => {
  const restoreModels = mockModule(modelsPath, {
    User: {},
  });

  t.after(restoreModels);

  const authRoutes = require('../src/routes/authRoutes');
  const { login } = require('../src/controllers/authController');

  const loginLayer = authRoutes.stack.find((layer) => layer.route?.path === '/login');

  assert.ok(loginLayer);
  assert.equal(Boolean(loginLayer.route.methods.post), true);
  assert.equal(loginLayer.route.stack[0].handle, login);

  t.after(() => {
    delete require.cache[authControllerPath];
  });
});

test('POST /login controller returns a token for a created user', async (t) => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_PASSWORD;
  process.env.SESSION_SECRET = 'session-secret';

  const restorePassword = mockModule(passwordPath, {
    verifyPassword: async (password, passwordHash) => password === 'leader-secret' && passwordHash === 'hashed-password',
  });
  const restoreModels = mockModule(modelsPath, {
    User: {
      unscoped() {
        return {
          findOne: async () => ({
            id: 1,
            name: 'Mai Leader',
            email: 'leader@example.com',
            role: 'leader',
            password_hash: 'hashed-password',
            get() {
              return {
                id: 1,
                name: 'Mai Leader',
                email: 'leader@example.com',
                role: 'leader',
                password_hash: 'hashed-password',
              };
            },
          }),
        };
      },
    },
  });

  t.after(() => {
    restorePassword();
    restoreModels();
    delete require.cache[authControllerPath];
    if (originalAdminPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    }
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  delete require.cache[authControllerPath];
  const { login } = require('../src/controllers/authController');
  const req = {
    body: {
      identifier: 'leader@example.com',
      password: 'leader-secret',
    },
  };
  const res = makeResponse();

  await login(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.match(res.body.token, /^[^.]+\.[^.]+$/);
  assert.equal(res.body.user.email, 'leader@example.com');
  assert.equal(res.body.user.role, 'leader');
  assert.equal(res.body.user.password_hash, undefined);
});

test('POST /login controller still supports bootstrap admin password', async (t) => {
  const originalAdminPassword = process.env.ADMIN_PASSWORD;
  const originalSessionSecret = process.env.SESSION_SECRET;
  process.env.ADMIN_PASSWORD = 'admin-secret';
  process.env.SESSION_SECRET = 'session-secret';

  const restoreModels = mockModule(modelsPath, {
    User: {
      unscoped() {
        return {
          findOne: async () => ({
            id: 1,
            name: 'Admin User',
            email: 'admin@example.com',
            role: 'admin',
            password_hash: null,
            get() {
              return {
                id: 1,
                name: 'Admin User',
                email: 'admin@example.com',
                role: 'admin',
                password_hash: null,
              };
            },
          }),
        };
      },
    },
  });

  t.after(() => {
    restoreModels();
    delete require.cache[authControllerPath];
    if (originalAdminPassword === undefined) {
      delete process.env.ADMIN_PASSWORD;
    } else {
      process.env.ADMIN_PASSWORD = originalAdminPassword;
    }
    if (originalSessionSecret === undefined) {
      delete process.env.SESSION_SECRET;
    } else {
      process.env.SESSION_SECRET = originalSessionSecret;
    }
  });

  delete require.cache[authControllerPath];
  const { login } = require('../src/controllers/authController');
  const req = {
    body: {
      identifier: 'admin@example.com',
      password: 'admin-secret',
    },
  };
  const res = makeResponse();

  await login(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(typeof res.body.token, 'string');
  assert.match(res.body.token, /^[^.]+\.[^.]+$/);
  assert.equal(res.body.user.email, 'admin@example.com');
  assert.equal(res.body.user.role, 'admin');
  assert.equal(res.body.user.password_hash, undefined);
});
