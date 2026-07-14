const up = async ({ sequelize, transaction }) => {
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS roles (
      key VARCHAR(64) PRIMARY KEY,
      label VARCHAR(100) NOT NULL,
      description TEXT,
      is_system BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `, { transaction });

  await sequelize.query(`
    INSERT INTO roles (key, label, description, is_system)
    VALUES
      ('admin', 'Admin', 'Toàn quyền quản trị hệ thống', TRUE),
      ('leader', 'Leader', 'Quản lý và theo dõi hoạt động nhóm', TRUE),
      ('member', 'Member', 'Tài khoản thành viên tiêu chuẩn', TRUE),
      ('koc', 'KOC', 'Tài khoản nhà sáng tạo nội dung', TRUE)
    ON CONFLICT (key) DO NOTHING
  `, { transaction });
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS roles', { transaction });
};

module.exports = { name: '018_create_roles', up, down };
