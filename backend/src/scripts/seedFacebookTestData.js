const { sequelize } = require('../models');

const TEMP = {
  users: [
    {
      email: 'temp.user.one@example.com',
      name: 'Temp User One',
      sid: 'temp-fb-sid-1',
      fbUserId: '123456789012345',
      fbUserName: 'Temp User One',
      pages: [
        { id: 'fb_page_demo_1', name: 'Temp User One Shop', token: 'temp-page-token-1' },
        { id: 'fb_page_demo_2', name: 'Temp User One Support', token: 'temp-page-token-2' },
      ],
    },
    {
      email: 'temp.user.two@example.com',
      name: 'Temp User Two',
      sid: 'temp-fb-sid-2',
      fbUserId: '987654321098765',
      fbUserName: 'Temp User Two',
      pages: [
        { id: 'fb_page_demo_3', name: 'Temp User Two Shop', token: 'temp-page-token-3' },
        { id: 'fb_page_demo_4', name: 'Temp User Two Support', token: 'temp-page-token-4' },
      ],
    },
  ],
  docTitles: ['Shipping Temp', 'Returns Temp'],
};

const now = new Date();
const plusDays = (days) => new Date(Date.now() + days * 24 * 60 * 60 * 1000);

async function exec(sql, bind, transaction) {
  return sequelize.query(sql, {
    bind,
    transaction,
  });
}

async function removeExistingRows(transaction) {
  const pageIds = TEMP.users.flatMap((user) => user.pages.map((page) => page.id));
  const senderIds = TEMP.users.flatMap((user) => user.pages.map((page) => `customer_${page.id}`));
  const userEmails = TEMP.users.map((user) => user.email);
  const userSids = TEMP.users.map((user) => user.sid);

  await exec('DELETE FROM chatbot_messages WHERE sender_id = ANY($1::text[])', [senderIds], transaction);
  await exec('DELETE FROM chatbot_orders WHERE sender_id = ANY($1::text[])', [senderIds], transaction);
  await exec('DELETE FROM chatbot_knowledge_docs WHERE title = ANY($1::text[])', [TEMP.docTitles], transaction);
  await exec('DELETE FROM facebook_pages WHERE id = ANY($1::text[])', [pageIds], transaction);
  await exec('DELETE FROM facebook_user_sessions WHERE sid = ANY($1::text[])', [userSids], transaction);
  await exec('DELETE FROM users WHERE email = ANY($1::text[])', [userEmails], transaction);
  await exec('DELETE FROM chatbot_settings WHERE id = 1', undefined, transaction);
}

async function seed() {
  await sequelize.authenticate();

  await sequelize.transaction(async (transaction) => {
    await removeExistingRows(transaction);

    for (const userSeed of TEMP.users) {
      await exec(
        `
          INSERT INTO users (name, email, role, password_hash)
          VALUES ($1, $2, $3, $4)
        `,
        [userSeed.name, userSeed.email, 'member', null],
        transaction,
      );

      await exec(
        `
          INSERT INTO facebook_user_sessions (sid, user_id, user_name, user_token_encrypted, expires_at, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (sid) DO UPDATE
          SET user_id = EXCLUDED.user_id,
              user_name = EXCLUDED.user_name,
              user_token_encrypted = EXCLUDED.user_token_encrypted,
              expires_at = EXCLUDED.expires_at,
              created_at = EXCLUDED.created_at
        `,
        [userSeed.sid, userSeed.fbUserId, userSeed.fbUserName, 'temp-facebook-user-token', plusDays(7), now],
        transaction,
      );

      for (const page of userSeed.pages) {
        await exec(
          `
            INSERT INTO facebook_pages (
              id,
              name,
              access_token_encrypted,
              owner_id,
              owner_name,
              connected_at,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE
            SET name = EXCLUDED.name,
                access_token_encrypted = EXCLUDED.access_token_encrypted,
                owner_id = EXCLUDED.owner_id,
                owner_name = EXCLUDED.owner_name,
                connected_at = EXCLUDED.connected_at,
                updated_at = EXCLUDED.updated_at
          `,
          [page.id, page.name, page.token, userSeed.fbUserId, userSeed.fbUserName, now, now],
          transaction,
        );

        await exec(
          `
            INSERT INTO chatbot_messages (
              sender_id,
              page_id,
              direction,
              text,
              via,
              created_at
            )
            VALUES
              ($1, $2, 'in', $3, 'customer', $4),
              ($1, $2, 'out', $5, 'bot', $4)
          `,
          [
            `customer_${page.id}`,
            page.id,
            'Hi, can I check the shipping fee?',
            now,
            'Sure, shipping fee depends on your location.',
          ],
          transaction,
        );

        await exec(
          `
            INSERT INTO chatbot_orders (
              sender_id,
              page_id,
              raw,
              name,
              phone,
              address,
              status,
              created_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `,
          [
            `customer_${page.id}`,
            page.id,
            'Order for a sample item',
            userSeed.name,
            '0900000000',
            '123 Test St',
            'new',
            now,
          ],
          transaction,
        );
      }
    }

    await exec(
      `
        INSERT INTO chatbot_knowledge_docs (title, content, embedding, created_at)
        VALUES ($1, $2, $3, $4)
      `,
      ['Shipping Temp', 'Orders are shipped within 2-4 business days.', null, now],
      transaction,
    );

    await exec(
      `
        INSERT INTO chatbot_knowledge_docs (title, content, embedding, created_at)
        VALUES ($1, $2, $3, $4)
      `,
      ['Returns Temp', 'Returns are accepted within 7 days if items are unused.', null, now],
      transaction,
    );

    await exec(
      `
        INSERT INTO chatbot_settings (id, provider, model, ollama_host, updated_at)
        VALUES ($1, $2, $3, $4, $5)
      `,
      [1, 'gemini', 'gemma-3-27b-it', 'http://127.0.0.1:11434', now],
      transaction,
    );
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        users: TEMP.users.map((user) => ({
          email: user.email,
          sid: user.sid,
          pages: user.pages.map((page) => page.id),
        })),
      },
      null,
      2,
    ),
  );
}

seed()
  .then(() => sequelize.close())
  .catch(async (error) => {
    console.error(error);
    try {
      await sequelize.close();
    } catch {
      // ignore close errors
    }
    process.exitCode = 1;
  });
