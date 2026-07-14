-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Table: businesses
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_businesses_updated_at
BEFORE UPDATE ON businesses
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Table: stores
CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ebay', 'other')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_stores_updated_at
BEFORE UPDATE ON stores
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Table: users
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    auth_user_id TEXT NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'bookkeeper', 'client')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TRIGGER update_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Safeguard: enforce at least one active admin
CREATE OR REPLACE FUNCTION check_active_admin_exists()
RETURNS TRIGGER AS $$
DECLARE
    active_admin_count INTEGER;
BEGIN
    -- Count active admin users left in the table
    SELECT COUNT(*) INTO active_admin_count
    FROM users
    WHERE role = 'admin' AND status = 'active';

    -- Enforce on delete
    IF (TG_OP = 'DELETE' AND OLD.role = 'admin' AND OLD.status = 'active') THEN
        IF active_admin_count <= 1 THEN
            RAISE EXCEPTION 'At least one active admin user must exist at all times.';
        END IF;
    -- Enforce on update
    ELSIF (TG_OP = 'UPDATE' AND OLD.role = 'admin' AND OLD.status = 'active') THEN
        IF (NEW.status != 'active' OR NEW.role != 'admin') THEN
            IF active_admin_count <= 1 THEN
                RAISE EXCEPTION 'At least one active admin user must exist at all times.';
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_active_admin_on_delete_or_update
BEFORE DELETE OR UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION check_active_admin_exists();

-- Table: user_business_access
CREATE TABLE IF NOT EXISTS user_business_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL CHECK (access_level IN ('read', 'write')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, business_id)
);

-- Table: user_store_access
CREATE TABLE IF NOT EXISTS user_store_access (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    access_level TEXT NOT NULL CHECK (access_level IN ('read', 'write')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, store_id)
);

-- Table: user_module_permissions
CREATE TABLE IF NOT EXISTS user_module_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module_name TEXT NOT NULL CHECK (module_name IN ('market_orders', 'supplier_orders', 'order_matching', 'transactions', 'expense', 'income', 'import_center', 'reporting', 'settings')),
    can_view BOOLEAN NOT NULL DEFAULT false,
    can_edit BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (user_id, module_name)
);

-- Table: custom_field_options
CREATE TABLE IF NOT EXISTS custom_field_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    field_key TEXT NOT NULL CHECK (field_key IN ('dispute_status', 'order_tracker', 'va_team', 'review_status', 'dispute_reason')),
    option_label TEXT NOT NULL,
    excludes_from_calculations BOOLEAN NOT NULL DEFAULT false,
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (field_key, option_label)
);

CREATE TRIGGER update_custom_field_options_updated_at
BEFORE UPDATE ON custom_field_options
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- Seed initial custom_field_options data
INSERT INTO custom_field_options (field_key, option_label, excludes_from_calculations, is_active, sort_order) VALUES
-- dispute_status
('dispute_status', 'None', false, true, 1),
('dispute_status', 'Disputed', true, true, 2),
('dispute_status', 'Resolved', false, true, 3),
-- order_tracker
('order_tracker', 'New', false, true, 1),
('order_tracker', 'In Progress', false, true, 2),
('order_tracker', 'Completed', false, true, 3),
('order_tracker', 'On Hold', false, true, 4),
-- va_team
('va_team', 'Unassigned', false, true, 1),
-- review_status
('review_status', 'Pending Review', false, true, 1),
('review_status', 'Reviewed', false, true, 2),
('review_status', 'Flagged', false, true, 3),
-- dispute_reason
('dispute_reason', 'Item Not Received', false, true, 1),
('dispute_reason', 'Item Not As Described', false, true, 2),
('dispute_reason', 'Damaged', false, true, 3),
('dispute_reason', 'Wrong Item', false, true, 4),
('dispute_reason', 'Other', false, true, 5)
ON CONFLICT (field_key, option_label) DO NOTHING;


-- ==========================================
-- ROW-LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on business-data tables
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_business_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_store_access ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_module_permissions ENABLE ROW LEVEL SECURITY;

-- Helper function to check if the current user is an admin
CREATE OR REPLACE FUNCTION is_admin(user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM users
        WHERE id = user_id AND role = 'admin' AND status = 'active'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy for businesses
CREATE POLICY business_access_policy ON businesses
FOR ALL
USING (
    -- Admins bypass
    is_admin(NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    OR
    -- Non-admins must have business-level access
    id IN (
        SELECT business_id FROM user_business_access
        WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
    OR
    -- Or have explicit store access under this business
    id IN (
        SELECT s.business_id FROM stores s
        JOIN user_store_access usa ON s.id = usa.store_id
        WHERE usa.user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
);

-- Policy for stores
CREATE POLICY store_access_policy ON stores
FOR ALL
USING (
    -- Admins bypass
    is_admin(NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    OR
    -- Non-admins must have store-level access
    id IN (
        SELECT store_id FROM user_store_access
        WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
    OR
    -- Or have business-level access
    business_id IN (
        SELECT business_id FROM user_business_access
        WHERE user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
    )
);

-- Policy for user_business_access
CREATE POLICY user_business_access_policy ON user_business_access
FOR ALL
USING (
    is_admin(NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    OR
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
);

-- Policy for user_store_access
CREATE POLICY user_store_access_policy ON user_store_access
FOR ALL
USING (
    is_admin(NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    OR
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
);

-- Policy for user_module_permissions
CREATE POLICY user_module_permissions_policy ON user_module_permissions
FOR ALL
USING (
    is_admin(NULLIF(current_setting('app.current_user_id', true), '')::UUID)
    OR
    user_id = NULLIF(current_setting('app.current_user_id', true), '')::UUID
);
