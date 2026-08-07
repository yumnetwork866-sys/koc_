const up = async ({ sequelize, transaction }) => {
  // Remove the retired permission from existing role records without removing
  // Messenger or WhatsApp data and functionality.
  await sequelize.query(
    "UPDATE roles SET permissions = permissions - 'chatbots'::text",
    { transaction },
  );
};

const down = async () => {
  // The retired permission is intentionally not restored on rollback.
};

module.exports = { name: '058_remove_chatbots_permission', up, down };
