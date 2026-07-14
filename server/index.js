import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import 'dotenv/config';
import * as db from './db.js';

const app = express();
const port = process.env.PORT || 3001;

// Middlewares
app.use(cors());
app.use(express.json());

// Bootstrapping: Ensure at least one active Admin user exists
async function bootstrapAdmin() {
  try {
    const { rows } = await db.query("SELECT COUNT(*) FROM users WHERE role = 'admin' AND status = 'active'");
    const adminCount = parseInt(rows[0].count || rows[0]['COUNT(*)'] || '0');
    if (adminCount === 0) {
      console.log('No active admin found. Creating default admin user...');
      const adminId = crypto.randomUUID();
      await db.query(
        `INSERT INTO users (id, email, auth_user_id, full_name, role, status)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING`,
        [adminId, 'admin@x360.com', 'admin-auth-id', 'Default Admin', 'admin', 'active']
      );
      console.log('Default admin seeded successfully: admin@x360.com / auth_id: admin-auth-id');
    }
  } catch (err) {
    console.error('Error bootstrapping admin:', err);
  }
}

// Security Middlewares

// 1. Require Authenticated User (supports simulated tokens and real JWT token verification)
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-auth-user-id'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  let authUserId = null;

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET;

    if (jwtSecret) {
      try {
        // Securely verify signature in production
        const decoded = jwt.verify(token, jwtSecret);
        authUserId = decoded.sub || decoded.auth_user_id;
      } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired managed authentication token' });
      }
    } else {
      // In development/test mode without a JWT secret configured, decode the token payload or treat it as authUserId
      try {
        const decoded = jwt.decode(token);
        authUserId = decoded ? (decoded.sub || decoded.auth_user_id) : token;
      } catch (err) {
        authUserId = token;
      }
    }
  } else {
    // Falls back to direct dev auth header
    authUserId = authHeader;
  }

  if (!authUserId) {
    return res.status(401).json({ error: 'Invalid authentication claims' });
  }

  try {
    // Run auth check query
    const { rows } = await db.query('SELECT * FROM users WHERE auth_user_id = $1', [authUserId]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    const user = rows[0];
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'User account is disabled' });
    }

    req.user = user;
    next();
  } catch (err) {
    console.error('Auth check error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// 2. Fetch User Access Helper
async function getUserAccess(userId) {
  const businessAccessQuery = 'SELECT business_id, access_level FROM user_business_access WHERE user_id = $1';
  const storeAccessQuery = 'SELECT store_id, access_level FROM user_store_access WHERE user_id = $1';

  const bRes = await db.query(businessAccessQuery, [userId]);
  const sRes = await db.query(storeAccessQuery, [userId]);

  return {
    businesses: bRes.rows, // Array of { business_id, access_level }
    stores: sRes.rows      // Array of { store_id, access_level }
  };
}

// 3. Compile list of accessible Store & Business IDs
async function getAccessibleResources(user) {
  if (user.role === 'admin') {
    // Admin has full access
    const bRes = await db.query('SELECT id FROM businesses');
    const sRes = await db.query('SELECT id FROM stores');
    return {
      businessIds: bRes.rows.map(r => r.id),
      storeIds: sRes.rows.map(r => r.id)
    };
  }

  const access = await getUserAccess(user.id);
  const businessIds = access.businesses.map(b => b.business_id);
  const directStoreIds = access.stores.map(s => s.store_id);

  // If user has business-level access, expand it to all stores under those businesses
  let storeIds = [...directStoreIds];
  if (businessIds.length > 0) {
    const placeholders = businessIds.map((_, i) => `$${i + 1}`).join(',');
    const storesInBusinesses = await db.query(
      `SELECT id FROM stores WHERE business_id IN (${placeholders})`,
      businessIds
    );
    const expandedStoreIds = storesInBusinesses.rows.map(r => r.id);
    storeIds = Array.from(new Set([...storeIds, ...expandedStoreIds]));
  }

  return {
    businessIds,
    storeIds
  };
}

// 4. Enforce Module Permission Middleware (Section 4.1 Roles & User Modules)
function enforcePermission(moduleName, requiredAction = 'view') {
  return async (req, res, next) => {
    const user = req.user;

    // Admin has override access to everything
    if (user.role === 'admin') {
      return next();
    }

    // Role hard ceilings (Section 4.1)
    if (user.role === 'client') {
      // Client role only has read access to Reporting. No access to other modules.
      if (moduleName !== 'reporting' || requiredAction !== 'view') {
        return res.status(403).json({ error: 'Client role is limited to read-only Reporting only.' });
      }
    }

    if (user.role === 'bookkeeper') {
      // Bookkeeper cannot access Settings or User management (admin screens)
      if (moduleName === 'settings' || moduleName === 'users') {
        return res.status(403).json({ error: 'Bookkeeper cannot access settings or user management.' });
      }
    }

    // Query specific user module permissions
    try {
      const { rows } = await db.query(
        'SELECT can_view, can_edit FROM user_module_permissions WHERE user_id = $1 AND module_name = $2',
        [user.id, moduleName]
      );

      const perm = rows[0] || { can_view: false, can_edit: false };

      if (requiredAction === 'view' && !perm.can_view) {
        return res.status(403).json({ error: `You do not have permission to view ${moduleName}.` });
      }

      if (requiredAction === 'edit' && !perm.can_edit) {
        return res.status(403).json({ error: `You do not have permission to edit ${moduleName}.` });
      }

      next();
    } catch (err) {
      console.error('Error checking permissions:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  };
}

// --- API ENDPOINTS ---

// Auth Endpoints (Simulator / Identity mapping)
app.post('/api/auth/login', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = rows[0];
    if (user.status !== 'active') {
      return res.status(403).json({ error: 'Account is disabled' });
    }

    // Update last login
    await db.query('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = $1', [user.id]);

    // Securely issue a cryptographically signed JWT session token
    const jwtSecret = process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || 'dev_secret_only';
    const token = jwt.sign(
      { sub: user.auth_user_id, email: user.email, role: user.role, auth_user_id: user.auth_user_id },
      jwtSecret,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role,
        auth_user_id: user.auth_user_id
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Self Profile Information
app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// Business Endpoints (Uses db.queryWithUser to enforce PostgreSQL RLS)
app.get('/api/businesses', requireAuth, async (req, res) => {
  try {
    const { businessIds } = await getAccessibleResources(req.user);
    if (businessIds.length === 0) {
      return res.json([]);
    }

    const placeholders = businessIds.map((_, i) => `$${i + 1}`).join(',');
    const { rows } = await db.queryWithUser(
      req.user.id,
      `SELECT * FROM businesses WHERE id IN (${placeholders}) AND is_active = true ORDER BY name ASC`,
      businessIds
    );
    res.json(rows);
  } catch (err) {
    console.error('GET businesses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/businesses', requireAuth, enforcePermission('settings', 'edit'), async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'Business name is required' });
  }

  try {
    const id = crypto.randomUUID();
    await db.queryWithUser(req.user.id, 'INSERT INTO businesses (id, name) VALUES ($1, $2)', [id, name]);
    res.status(201).json({ id, name });
  } catch (err) {
    console.error('POST businesses error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Store Endpoints (Uses db.queryWithUser to enforce PostgreSQL RLS)
app.get('/api/stores', requireAuth, async (req, res) => {
  const { business_id } = req.query;
  try {
    const { storeIds, businessIds } = await getAccessibleResources(req.user);
    if (storeIds.length === 0) {
      return res.json([]);
    }

    let queryText = 'SELECT * FROM stores WHERE id IN (' + storeIds.map((_, i) => `$${i + 1}`).join(',') + ') AND is_active = true';
    let params = [...storeIds];

    if (business_id) {
      if (!businessIds.includes(business_id)) {
        return res.status(403).json({ error: 'Access denied to this business' });
      }
      queryText += ` AND business_id = $${params.length + 1}`;
      params.push(business_id);
    }

    queryText += ' ORDER BY name ASC';
    const { rows } = await db.queryWithUser(req.user.id, queryText, params);
    res.json(rows);
  } catch (err) {
    console.error('GET stores error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/stores', requireAuth, enforcePermission('settings', 'edit'), async (req, res) => {
  const { name, business_id, platform } = req.body;
  if (!name || !business_id || !platform) {
    return res.status(400).json({ error: 'All fields (name, business_id, platform) are required' });
  }

  if (platform !== 'ebay' && platform !== 'other') {
    return res.status(400).json({ error: "Platform must be 'ebay' or 'other'" });
  }

  try {
    const id = crypto.randomUUID();
    await db.queryWithUser(
      req.user.id,
      'INSERT INTO stores (id, name, business_id, platform) VALUES ($1, $2, $3, $4)',
      [id, name, business_id, platform]
    );
    res.status(201).json({ id, name, business_id, platform });
  } catch (err) {
    console.error('POST stores error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Route: User Management list
app.get('/api/admin/users', requireAuth, enforcePermission('settings', 'view'), async (req, res) => {
  try {
    const { rows: users } = await db.query('SELECT id, email, auth_user_id, full_name, role, status, last_login_at FROM users ORDER BY full_name ASC');

    // For each user, attach their access lists and module permissions
    const detailedUsers = [];
    for (const u of users) {
      const access = await getUserAccess(u.id);
      const { rows: modulePerms } = await db.query('SELECT module_name, can_view, can_edit FROM user_module_permissions WHERE user_id = $1', [u.id]);
      detailedUsers.push({
        ...u,
        access,
        permissions: modulePerms
      });
    }

    res.json(detailedUsers);
  } catch (err) {
    console.error('GET admin users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Route: Create User
app.post('/api/admin/users', requireAuth, enforcePermission('settings', 'edit'), async (req, res) => {
  const { email, auth_user_id, full_name, role, status, access, permissions } = req.body;
  if (!email || !auth_user_id || !full_name || !role) {
    return res.status(400).json({ error: 'Missing required user fields' });
  }

  try {
    const userId = crypto.randomUUID();

    // Create user record
    await db.query(
      'INSERT INTO users (id, email, auth_user_id, full_name, role, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, email, auth_user_id, full_name, role, status || 'active']
    );

    // If access lists are provided
    if (access) {
      if (access.businesses) {
        for (const b of access.businesses) {
          await db.query(
            'INSERT INTO user_business_access (id, user_id, business_id, access_level) VALUES ($1, $2, $3, $4)',
            [crypto.randomUUID(), userId, b.business_id, b.access_level]
          );
        }
      }
      if (access.stores) {
        for (const s of access.stores) {
          await db.query(
            'INSERT INTO user_store_access (id, user_id, store_id, access_level) VALUES ($1, $2, $3, $4)',
            [crypto.randomUUID(), userId, s.store_id, s.access_level]
          );
        }
      }
    }

    // Seed default module permissions
    const modules = ['market_orders', 'supplier_orders', 'order_matching', 'transactions', 'expense', 'income', 'import_center', 'reporting', 'settings'];
    for (const m of modules) {
      const p = permissions ? permissions.find(x => x.module_name === m) : null;
      const canView = p ? !!p.can_view : (role === 'admin' || role === 'bookkeeper' || (role === 'client' && m === 'reporting'));
      const canEdit = p ? !!p.can_edit : (role === 'admin' || (role === 'bookkeeper' && m !== 'settings'));

      await db.query(
        'INSERT INTO user_module_permissions (id, user_id, module_name, can_view, can_edit) VALUES ($1, $2, $3, $4, $5)',
        [crypto.randomUUID(), userId, m, canView, canEdit]
      );
    }

    res.status(201).json({ id: userId, email, full_name, role, status });
  } catch (err) {
    console.error('POST admin users error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Admin Route: Edit User Details and permissions
app.put('/api/admin/users/:id', requireAuth, enforcePermission('settings', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { full_name, role, status, access, permissions } = req.body;

  try {
    // 1. Update basic fields
    await db.query(
      'UPDATE users SET full_name = $1, role = $2, status = $3 WHERE id = $4',
      [full_name, role, status, id]
    );

    // 2. Refresh business and store access levels
    if (access) {
      await db.query('DELETE FROM user_business_access WHERE user_id = $1', [id]);
      await db.query('DELETE FROM user_store_access WHERE user_id = $1', [id]);

      if (access.businesses) {
        for (const b of access.businesses) {
          await db.query(
            'INSERT INTO user_business_access (id, user_id, business_id, access_level) VALUES ($1, $2, $3, $4)',
            [crypto.randomUUID(), id, b.business_id, b.access_level]
          );
        }
      }

      if (access.stores) {
        for (const s of access.stores) {
          await db.query(
            'INSERT INTO user_store_access (id, user_id, store_id, access_level) VALUES ($1, $2, $3, $4)',
            [crypto.randomUUID(), id, s.store_id, s.access_level]
          );
        }
      }
    }

    // 3. Update module permissions
    if (permissions) {
      for (const p of permissions) {
        await db.query(
          `INSERT INTO user_module_permissions (id, user_id, module_name, can_view, can_edit)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (user_id, module_name) DO UPDATE
           SET can_view = EXCLUDED.can_view, can_edit = EXCLUDED.can_edit`,
          [crypto.randomUUID(), id, p.module_name, !!p.can_view, !!p.can_edit]
        );
      }
    }

    res.json({ success: true });
  } catch (err) {
    console.error('PUT admin users error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Admin Route: Delete User
app.delete('/api/admin/users/:id', requireAuth, enforcePermission('settings', 'edit'), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE admin user error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

// Custom Field Options Endpoints
app.get('/api/custom-field-options', requireAuth, async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM custom_field_options ORDER BY field_key ASC, sort_order ASC, option_label ASC');
    res.json(rows);
  } catch (err) {
    console.error('GET custom field options error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/custom-field-options', requireAuth, enforcePermission('settings', 'edit'), async (req, res) => {
  const { field_key, option_label, excludes_from_calculations, is_active, sort_order } = req.body;
  if (!field_key || !option_label) {
    return res.status(400).json({ error: 'field_key and option_label are required' });
  }

  try {
    const id = crypto.randomUUID();
    await db.query(
      `INSERT INTO custom_field_options (id, field_key, option_label, excludes_from_calculations, is_active, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, field_key, option_label, !!excludes_from_calculations, is_active !== false, sort_order || 0]
    );
    res.status(201).json({ id, field_key, option_label, excludes_from_calculations, is_active, sort_order });
  } catch (err) {
    console.error('POST custom field options error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.put('/api/custom-field-options/:id', requireAuth, enforcePermission('settings', 'edit'), async (req, res) => {
  const { id } = req.params;
  const { option_label, excludes_from_calculations, is_active, sort_order } = req.body;

  try {
    await db.query(
      `UPDATE custom_field_options
       SET option_label = $1, excludes_from_calculations = $2, is_active = $3, sort_order = $4
       WHERE id = $5`,
      [option_label, !!excludes_from_calculations, is_active !== false, sort_order || 0, id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('PUT custom field options error:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
});

app.delete('/api/custom-field-options/:id', requireAuth, enforcePermission('settings', 'edit'), async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM custom_field_options WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err) {
    console.error('DELETE custom field option error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fallback to React Frontend in Production
const distPath = path.join(process.cwd(), 'dist');
app.use(express.static(distPath));

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }

  const indexHtmlPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexHtmlPath)) {
    res.sendFile(indexHtmlPath);
  } else {
    res.send('x360 Ecom Finance App backend is running. Build the frontend to view the UI.');
  }
});

// Start Server
app.listen(port, () => {
  console.log(`x360 Ecom Finance App server running on port ${port}`);
  bootstrapAdmin();
});
