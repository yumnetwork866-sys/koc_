const up = async ({ sequelize, transaction }) => {
  await sequelize.query(
    'ALTER TABLE chatbot_messages ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)',
    { transaction },
  );
  await sequelize.query(
    'ALTER TABLE chatbot_messages ADD COLUMN IF NOT EXISTS avatar_url TEXT',
    { transaction },
  );
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query('ALTER TABLE chatbot_messages DROP COLUMN IF EXISTS avatar_url', { transaction });
  await sequelize.query('ALTER TABLE chatbot_messages DROP COLUMN IF EXISTS display_name', { transaction });
};

module.exports = { name: '007_add_chatbot_message_profile_fields', up, down };
