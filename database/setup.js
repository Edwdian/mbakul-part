const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function setupDatabase() {
  const host = process.env.DB_HOST || '127.0.0.1';
  const port = process.env.DB_PORT || 3306;
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASS || '';

  console.log(`Connecting to MySQL on ${host}:${port}...`);
  try {
    const connection = await mysql.createConnection({ host, port, user, password, multipleStatements: true });
    console.log('Connected! Executing database/schema.sql...');
    const schemaSql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
    await connection.query(schemaSql);
    console.log('Database and tables created successfully!');
    await connection.end();
  } catch (err) {
    console.error('Failed to setup database:', err.message);
    process.exit(1);
  }
}

if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase;
