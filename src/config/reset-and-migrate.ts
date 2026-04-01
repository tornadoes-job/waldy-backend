import { pool } from './database';

const RESET_AND_MIGRATE_SQL = `
-- Drop all tables (in correct order due to foreign keys)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS stock_movements CASCADE;
DROP TABLE IF EXISTS sub_products CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS product_categories CASCADE;
DROP TABLE IF EXISTS suppliers CASCADE;
DROP TABLE IF EXISTS reference_counters CASCADE;
DROP TABLE IF EXISTS sectors CASCADE;

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- SECTORS TABLE
-- =============================================================
CREATE TABLE sectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) NOT NULL UNIQUE,
  wal_code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- SUPPLIERS TABLE
-- =============================================================
CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL UNIQUE,
  name VARCHAR(150) NOT NULL,
  contact_person VARCHAR(100),
  email VARCHAR(150),
  phone VARCHAR(30),
  address TEXT,
  city VARCHAR(100),
  country VARCHAR(100) DEFAULT 'Sénégal',
  sector_id UUID REFERENCES sectors(id),
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- PRODUCT CATEGORIES TABLE
-- =============================================================
CREATE TABLE product_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) NOT NULL,
  wal_code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL,
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE RESTRICT,
  parent_category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT unique_code_sector UNIQUE (code, sector_id)
);

-- =============================================================
-- PRODUCTS TABLE
-- =============================================================
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wal_reference VARCHAR(50) NOT NULL UNIQUE,
  sector_id UUID NOT NULL REFERENCES sectors(id),
  category_id UUID NOT NULL REFERENCES product_categories(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  name VARCHAR(200) NOT NULL,
  variant VARCHAR(100),
  description TEXT,
  unit VARCHAR(30) NOT NULL DEFAULT 'kg',
  barcode VARCHAR(50),
  quantity_in_stock DECIMAL(12,3) DEFAULT 0,
  min_stock_alert DECIMAL(12,3) DEFAULT 0,
  purchase_price DECIMAL(12,2),
  selling_price DECIMAL(12,2),
  currency VARCHAR(5) DEFAULT 'XOF',
  image_url TEXT,
  image_public_id TEXT,
  origin_country VARCHAR(100),
  origin_region VARCHAR(100),
  batch_number VARCHAR(50),
  expiry_date DATE,
  manufacture_date DATE,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- SUB-PRODUCTS TABLE
-- =============================================================
CREATE TABLE sub_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  wal_reference VARCHAR(60) NOT NULL UNIQUE,
  parent_product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  unit VARCHAR(30) NOT NULL DEFAULT 'kg',
  quantity_in_stock DECIMAL(12,3) DEFAULT 0,
  purchase_price DECIMAL(12,2),
  selling_price DECIMAL(12,2),
  currency VARCHAR(5) DEFAULT 'XOF',
  image_url TEXT,
  image_public_id TEXT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- STOCK MOVEMENTS TABLE
-- =============================================================
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  product_id UUID REFERENCES products(id),
  sub_product_id UUID REFERENCES sub_products(id),
  movement_type VARCHAR(20) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(30) NOT NULL,
  unit_price DECIMAL(12,2),
  reference_doc VARCHAR(100),
  reason TEXT,
  operator_name VARCHAR(100),
  stock_before DECIMAL(12,3),
  stock_after DECIMAL(12,3),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (product_id IS NOT NULL OR sub_product_id IS NOT NULL)
);

-- =============================================================
-- REFERENCE COUNTERS TABLE
-- =============================================================
CREATE TABLE reference_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  counter_key VARCHAR(50) NOT NULL UNIQUE,
  current_value INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- AUDIT LOG TABLE
-- =============================================================
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name VARCHAR(50) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,
  old_values JSONB,
  new_values JSONB,
  operator_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- INDEXES
-- =============================================================
CREATE INDEX idx_products_wal_ref ON products(wal_reference);
CREATE INDEX idx_products_sector ON products(sector_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_supplier ON products(supplier_id);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('french', name));
CREATE INDEX idx_sub_products_parent ON sub_products(parent_product_id);
CREATE INDEX idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX idx_stock_movements_date ON stock_movements(created_at);
CREATE INDEX idx_audit_logs_table_record ON audit_logs(table_name, record_id);

-- =============================================================
-- SEED DATA
-- =============================================================
INSERT INTO sectors (code, wal_code, name, description, icon) VALUES
  ('AGR', 'W/AGR', 'Agriculture', 'Produits agricoles, céréales, légumes, fruits', '🌾'),
  ('ELV', 'W/ELV', 'Élevage', 'Produits d''élevage, viande, lait, œufs', '🐄'),
  ('HAB', 'W/HAB', 'Habillement', 'Vêtements, textiles, accessoires vestimentaires', '👕'),
  ('PEC', 'W/PEC', 'Pêche', 'Produits de la mer, poissons, crustacés', '🐟'),
  ('IND', 'W/IND', 'Industrie', 'Produits industriels, matières premières', '🏭'),
  ('ALM', 'W/ALM', 'Alimentation', 'Produits alimentaires transformés', '🍽️'),
  ('PHR', 'W/PHR', 'Pharmacie', 'Médicaments, produits pharmaceutiques', '💊'),
  ('BTP', 'W/BTP', 'BTP & Construction', 'Matériaux de construction, bâtiment', '🏗️');

-- Catégories Agriculture
INSERT INTO product_categories (code, wal_code, name, sector_id) VALUES
  ('RIZ', 'W/AGR/RIZ', 'Riz', (SELECT id FROM sectors WHERE code = 'AGR')),
  ('MIL', 'W/AGR/MIL', 'Mil / Sorgho', (SELECT id FROM sectors WHERE code = 'AGR')),
  ('MAI', 'W/AGR/MAI', 'Maïs', (SELECT id FROM sectors WHERE code = 'AGR')),
  ('ARC', 'W/AGR/ARC', 'Arachide', (SELECT id FROM sectors WHERE code = 'AGR')),
  ('FRU', 'W/AGR/FRU', 'Fruits', (SELECT id FROM sectors WHERE code = 'AGR')),
  ('LEG', 'W/AGR/LEG', 'Légumes', (SELECT id FROM sectors WHERE code = 'AGR'));

-- Sous-catégories de Mil
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id) VALUES
  ('MIB', 'W/AGR/MIL/MIB', 'Mil blanc', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/MIL')),
  ('MIR', 'W/AGR/MIL/MIR', 'Mil rouge', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/MIL')),
  ('MIS', 'W/AGR/MIL/MIS', 'Mil sorgho', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/MIL'));

-- Sous-catégories de Maïs
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id) VALUES
  ('MAJ', 'W/AGR/MAI/MAJ', 'Maïs jaune', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/MAI')),
  ('MAB', 'W/AGR/MAI/MAB', 'Maïs blanc', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/MAI'));

-- Sous-catégories de Fruits
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id) VALUES
  ('MAG', 'W/AGR/FRU/MAG', 'Mangues', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/FRU')),
  ('PAP', 'W/AGR/FRU/PAP', 'Papayes', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/FRU')),
  ('BAN', 'W/AGR/FRU/BAN', 'Bananes', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/FRU'));

-- Sous-catégories de Légumes
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id) VALUES
  ('TOM', 'W/AGR/LEG/TOM', 'Tomates', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/LEG')),
  ('OIG', 'W/AGR/LEG/OIG', 'Oignons', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/LEG')),
  ('POM', 'W/AGR/LEG/POM', 'Pommes de terre', (SELECT id FROM sectors WHERE code = 'AGR'), (SELECT id FROM product_categories WHERE wal_code = 'W/AGR/LEG'));

-- Catégories Élevage
INSERT INTO product_categories (code, wal_code, name, sector_id) VALUES
  ('BOV', 'W/ELV/BOV', 'Bovins', (SELECT id FROM sectors WHERE code = 'ELV')),
  ('OVI', 'W/ELV/OVI', 'Ovins / Caprins', (SELECT id FROM sectors WHERE code = 'ELV')),
  ('VOL', 'W/ELV/VOL', 'Volaille', (SELECT id FROM sectors WHERE code = 'ELV')),
  ('LAI', 'W/ELV/LAI', 'Produits Laitiers', (SELECT id FROM sectors WHERE code = 'ELV'));

-- Sous-catégories de Bovins
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id) VALUES
  ('TAU', 'W/ELV/BOV/TAU', 'Taureaux', (SELECT id FROM sectors WHERE code = 'ELV'), (SELECT id FROM product_categories WHERE wal_code = 'W/ELV/BOV')),
  ('VAC', 'W/ELV/BOV/VAC', 'Vaches', (SELECT id FROM sectors WHERE code = 'ELV'), (SELECT id FROM product_categories WHERE wal_code = 'W/ELV/BOV'));

-- Sous-catégories de Volaille
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id) VALUES
  ('POU', 'W/ELV/VOL/POU', 'Poulets', (SELECT id FROM sectors WHERE code = 'ELV'), (SELECT id FROM product_categories WHERE wal_code = 'W/ELV/VOL')),
  ('DIN', 'W/ELV/VOL/DIN', 'Dindes', (SELECT id FROM sectors WHERE code = 'ELV'), (SELECT id FROM product_categories WHERE wal_code = 'W/ELV/VOL'));

-- Catégories Habillement
INSERT INTO product_categories (code, wal_code, name, sector_id) VALUES
  ('VET', 'W/HAB/VET', 'Vêtements', (SELECT id FROM sectors WHERE code = 'HAB')),
  ('TIS', 'W/HAB/TIS', 'Tissus', (SELECT id FROM sectors WHERE code = 'HAB'));

-- Catégories Pêche
INSERT INTO product_categories (code, wal_code, name, sector_id) VALUES
  ('POI', 'W/PEC/POI', 'Poissons', (SELECT id FROM sectors WHERE code = 'PEC')),
  ('CRU', 'W/PEC/CRU', 'Crustacés', (SELECT id FROM sectors WHERE code = 'PEC'));

-- Sous-catégories de Poissons
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id) VALUES
  ('MER', 'W/PEC/POI/MER', 'Poissons de mer', (SELECT id FROM sectors WHERE code = 'PEC'), (SELECT id FROM product_categories WHERE wal_code = 'W/PEC/POI')),
  ('DOU', 'W/PEC/POI/DOU', 'Poissons d''eau douce', (SELECT id FROM sectors WHERE code = 'PEC'), (SELECT id FROM product_categories WHERE wal_code = 'W/PEC/POI'));

-- Compteurs initiaux
INSERT INTO reference_counters (counter_key, current_value) VALUES
  ('W/FRN', 0),
  ('W/AGR/RIZ', 0),
  ('W/AGR/MIL', 0),
  ('W/AGR/MAI', 0),
  ('W/AGR/ARC', 0),
  ('W/AGR/FRU', 0),
  ('W/AGR/LEG', 0),
  ('W/ELV/BOV', 0),
  ('W/ELV/OVI', 0),
  ('W/ELV/VOL', 0),
  ('W/ELV/LAI', 0),
  ('W/HAB/VET', 0),
  ('W/HAB/TIS', 0),
  ('W/PEC/POI', 0),
  ('W/PEC/CRU', 0);
`;

async function resetAndMigrate() {
  const client = await pool.connect();
  try {
    console.log('🗑️  Dropping existing tables...');
    await client.query(RESET_AND_MIGRATE_SQL);
    console.log('✅ Database reset and migration completed successfully!');
    console.log('📊 Tables created: sectors, suppliers, product_categories, products, sub_products, stock_movements, reference_counters, audit_logs');
    console.log('🌱 Seed data inserted: 8 sectors, 23 categories (with sub-categories)');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

resetAndMigrate();
