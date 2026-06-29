const statements = [
  `CREATE TABLE IF NOT EXISTS chatbot_settings (
    id INTEGER PRIMARY KEY,
    provider VARCHAR(32) NOT NULL DEFAULT 'gemini',
    model VARCHAR(255) NOT NULL,
    ollama_host TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

const up = async ({ sequelize, transaction }) => {
  for (const statement of statements) {
    await sequelize.query(statement, { transaction });
  }
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('DROP TABLE IF EXISTS chatbot_settings CASCADE', { transaction });
};

module.exports = { name: '006_add_chatbot_settings', up, down };
