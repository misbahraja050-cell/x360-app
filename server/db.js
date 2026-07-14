import pg from 'pg';
import sqlite3 from 'sqlite3';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;

const isProduction = process.env.NODE_ENV === 'production' || process.env.DATABASE_URL;

let pool = null;
let sqliteDb = null;

// Determine if we are using Postgres or SQLite
const usePostgres = !!process.env.DATABASE_URL;

if (usePostgres) {
  console.log('Using PostgreSQL database connection.');
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
} else {
  console.log('Using SQLite database connection for local testing.');
  const dbPath = path.join(process.cwd(), 'x360_finance.db');
  sqliteDb = new sqlite3.Database(dbPath);
}

// Unified query function
export async function query(text, params = []) {
  if (usePostgres) {
    const res = await pool.query(text, params);
    return { rows: res.rows, rowCount: res.rowCount };
  } else {
    return new Promise((resolve, reject) => {
      // Convert standard PostgreSQL parameters ($1, $2, etc.) to SQLite parameters (?, ?, etc.)
      const sqliteText = text.replace(/\$(\d+)/g, '?');

      const isSelect = sqliteText.trim().toLowerCase().startsWith('select') ||
                       sqliteText.trim().toLowerCase().startsWith('with');

      if (isSelect) {
        sqliteDb.all(sqliteText, params, (err, rows) => {
          if (err) {
            console.error('SQLite SELECT Error:', err, 'Query:', sqliteText, 'Params:', params);
            reject(err);
          } else {
            resolve({ rows: rows || [], rowCount: (rows || []).length });
          }
        });
      } else {
        sqliteDb.run(sqliteText, params, function (err) {
          if (err) {
            console.error('SQLite RUN Error:', err, 'Query:', sqliteText, 'Params:', params);
            reject(err);
          } else {
            resolve({ rows: [], rowCount: this.changes });
          }
        });
      }
    });
  }
}

// Query wrapper that sets the app.current_user_id for Row-Level Security on PostgreSQL
export async function queryWithUser(userId, text, params = []) {
  if (usePostgres) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      if (userId) {
        // Set setting scoped to the transaction
        await client.query("SELECT set_config('app.current_user_id', $1, true)", [userId.toString()]);
      }
      const res = await client.query(text, params);
      await client.query('COMMIT');
      return { rows: res.rows, rowCount: res.rowCount };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } else {
    // Fallback to SQLite for local development
    return query(text, params);
  }
}

// Initialize database schema
export async function initDatabase() {
  if (usePostgres) {
    console.log('Running PostgreSQL migration...');
    const migrationPath = path.join(process.cwd(), 'scripts', 'migration.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    await pool.query(sql);
    console.log('PostgreSQL migration completed successfully.');
  } else {
    console.log('Running SQLite migration...');
    const sql = `
      CREATE TABLE IF NOT EXISTS businesses (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stores (
        id TEXT PRIMARY KEY,
        business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        platform TEXT NOT NULL CHECK (platform IN ('ebay', 'other')),
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        auth_user_id TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'bookkeeper', 'client')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
        last_login_at DATETIME,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS user_business_access (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        business_id TEXT NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
        access_level TEXT NOT NULL CHECK (access_level IN ('read', 'write')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, business_id)
      );

      CREATE TABLE IF NOT EXISTS user_store_access (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        store_id TEXT NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
        access_level TEXT NOT NULL CHECK (access_level IN ('read', 'write')),
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_id, store_id)
      );

      CREATE TABLE IF NOT EXISTS user_module_permissions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        module_name TEXT NOT NULL CHECK (module_name IN ('market_orders', 'supplier_orders', 'order_matching', 'transactions', 'expense', 'income', 'import_center', 'reporting', 'settings')),
        can_view INTEGER NOT NULL DEFAULT 0,
        can_edit INTEGER NOT NULL DEFAULT 0,
        UNIQUE (user_id, module_name)
      );

      CREATE TABLE IF NOT EXISTS custom_field_options (
        id TEXT PRIMARY KEY,
        field_key TEXT NOT NULL CHECK (field_key IN ('dispute_status', 'order_tracker', 'va_team', 'review_status', 'dispute_reason')),
        option_label TEXT NOT NULL,
        excludes_from_calculations INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (field_key, option_label)
      );
    `;

    const statements = sql.split(';').map(s => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      await new Promise((resolve, reject) => {
        sqliteDb.run(stmt, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }

    const seedOptions = [
      ['dispute_status', 'None', 0, 1, 1],
      ['dispute_status', 'Disputed', 1, 1, 2],
      ['dispute_status', 'Resolved', 0, 1, 3],
      ['order_tracker', 'New', 0, 1, 1],
      ['order_tracker', 'In Progress', 0, 1, 2],
      ['order_tracker', 'Completed', 0, 1, 3],
      ['order_tracker', 'On Hold', 0, 1, 4],
      ['va_team', 'Unassigned', 0, 1, 1],
      ['review_status', 'Pending Review', 0, 1, 1],
      ['review_status', 'Reviewed', 0, 1, 2],
      ['review_status', 'Flagged', 0, 1, 3],
      ['dispute_reason', 'Item Not Received', 0, 1, 1],
      ['dispute_reason', 'Item Not As Described', 0, 1, 2],
      ['dispute_reason', 'Damaged', 0, 1, 3],
      ['dispute_reason', 'Wrong Item', 0, 1, 4],
      ['dispute_reason', 'Other', 0, 1, 5]
    ];

    for (const opt of seedOptions) {
      await new Promise((resolve, reject) => {
        sqliteDb.run(
          `INSERT OR IGNORE INTO custom_field_options (id, field_key, option_label, excludes_from_calculations, is_active, sort_order)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(), ...opt],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    console.log('SQLite migration and seeding completed successfully.');
  }
}
