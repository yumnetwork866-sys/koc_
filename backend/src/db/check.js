const { sequelize } = require('../models');

async function main() {
  try {
    const [rows] = await sequelize.query(`
      select
        current_database() as database,
        current_user as "user",
        has_schema_privilege(current_user, 'public', 'USAGE') as public_usage,
        has_schema_privilege(current_user, 'public', 'CREATE') as public_create
    `);
    console.log(rows[0]);
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await sequelize.close();
  }
}

main();
