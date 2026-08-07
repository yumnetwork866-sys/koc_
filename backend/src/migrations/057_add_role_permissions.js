const { ALL_PERMISSIONS } = require('../lib/permissions');

const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    "ALTER TABLE roles ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb",
    { transaction },
  );

  // Only `admin` remains a system role; the rest become manageable like custom roles.
  await sequelize.query("UPDATE roles SET is_system = (key = 'admin')", { transaction });

  await sequelize.query(
    `UPDATE roles SET permissions = CASE
      WHEN key = 'admin' THEN '${JSON.stringify(ALL_PERMISSIONS)}'::jsonb
      ELSE '["reports"]'::jsonb
    END`,
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE roles DROP COLUMN IF EXISTS permissions', { transaction });
};

module.exports = { name: '057_add_role_permissions', up, down };
