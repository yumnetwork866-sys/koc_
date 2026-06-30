const statements = [
  `CREATE TABLE IF NOT EXISTS facebook_pages (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    access_token_encrypted TEXT NOT NULL,
    owner_id VARCHAR(255),
    owner_name VARCHAR(255),
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS facebook_oauth_states (
    state VARCHAR(255) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS facebook_user_sessions (
    sid VARCHAR(255) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    user_name VARCHAR(255),
    user_token_encrypted TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS chatbot_messages (
    id SERIAL PRIMARY KEY,
    sender_id VARCHAR(255) NOT NULL,
    page_id VARCHAR(255) REFERENCES facebook_pages(id) ON DELETE SET NULL,
    display_name VARCHAR(255),
    avatar_url TEXT,
    direction VARCHAR(16) NOT NULL,
    text TEXT NOT NULL,
    via VARCHAR(32) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `ALTER TABLE chatbot_messages ADD COLUMN IF NOT EXISTS display_name VARCHAR(255)`,
  `ALTER TABLE chatbot_messages ADD COLUMN IF NOT EXISTS avatar_url TEXT`,
  `CREATE TABLE IF NOT EXISTS chatbot_orders (
    id SERIAL PRIMARY KEY,
    sender_id VARCHAR(255) NOT NULL,
    page_id VARCHAR(255) REFERENCES facebook_pages(id) ON DELETE SET NULL,
    raw TEXT NOT NULL,
    name VARCHAR(255),
    phone VARCHAR(64),
    address TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'new',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS chatbot_knowledge_docs (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    embedding JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS chatbot_messages_sender_created_idx ON chatbot_messages(sender_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS chatbot_messages_page_created_idx ON chatbot_messages(page_id, created_at)`,
  `CREATE INDEX IF NOT EXISTS chatbot_orders_status_created_idx ON chatbot_orders(status, created_at)`,
];

const up = async ({ sequelize, transaction }) => {
  for (const statement of statements) {
    await sequelize.query(statement, { transaction });
  }
};

const down = async ({ sequelize, transaction }) => {
  await sequelize.query(
    `DROP TABLE IF EXISTS
      chatbot_knowledge_docs,
      chatbot_orders,
      chatbot_messages,
      facebook_user_sessions,
      facebook_oauth_states,
      facebook_pages
    CASCADE`,
    { transaction },
  );
};

module.exports = { name: '005_add_facebook_chatbot_tables', up, down };
