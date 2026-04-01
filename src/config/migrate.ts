import { pool } from './database';
import dotenv from 'dotenv';

dotenv.config();

const MIGRATION_SQL = `
-- =============================================================
-- WAL PRODUCT MANAGEMENT SYSTEM - DATABASE SCHEMA
-- =============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================
-- SECTORS TABLE
-- Secteurs : Agriculture, Elevage, Habillement, etc.
-- Code W/AGR, W/ELV, W/HAB, etc.
-- =============================================================
CREATE TABLE IF NOT EXISTS sectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(10) NOT NULL UNIQUE,           -- AGR, ELV, HAB
  wal_code VARCHAR(20) NOT NULL UNIQUE,        -- W/AGR
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50),                            -- emoji or icon name
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- SUPPLIERS TABLE
-- Fournisseurs avec traçabilité complète
-- =============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  code VARCHAR(20) NOT NULL UNIQUE,            -- W/FRN-001
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
-- Catégories de produits par secteur
-- W/AGR/RIZ, W/AGR/MIL, W/ELV/BOV, etc.
-- =============================================================
CREATE TABLE IF NOT EXISTS product_categories (
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
-- Produits avec codes de référence complets
-- W/AGR/RIZ-001
-- =============================================================
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Référence complète WAL
  wal_reference VARCHAR(50) NOT NULL UNIQUE,   -- W/AGR/RIZ-001
  sector_id UUID NOT NULL REFERENCES sectors(id),
  category_id UUID NOT NULL REFERENCES product_categories(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  
  -- Identité produit
  name VARCHAR(200) NOT NULL,
  variant VARCHAR(100),                        -- ex: "Long grain", "Parfumé"
  description TEXT,
  
  -- Classification
  unit VARCHAR(30) NOT NULL DEFAULT 'kg',      -- kg, L, m, pièce, sac
  barcode VARCHAR(50),
  
  -- Stock & Prix
  quantity_in_stock DECIMAL(12,3) DEFAULT 0,
  min_stock_alert DECIMAL(12,3) DEFAULT 0,
  purchase_price DECIMAL(12,2),
  selling_price DECIMAL(12,2),
  currency VARCHAR(5) DEFAULT 'XOF',
  
  -- Images (Cloudinary)
  image_url TEXT,
  image_public_id TEXT,
  
  -- Traçabilité
  origin_country VARCHAR(100),
  origin_region VARCHAR(100),
  batch_number VARCHAR(50),
  expiry_date DATE,
  manufacture_date DATE,
  
  -- Statut
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- SUB-PRODUCTS TABLE
-- Sous-produits liés à un produit principal
-- W/AGR/MIL-001 -> sous-produit: Son de mil, Mil décortiqué, etc.
-- =============================================================
CREATE TABLE IF NOT EXISTS sub_products (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  wal_reference VARCHAR(60) NOT NULL UNIQUE,   -- W/AGR/MIL-001-SP01
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
-- Traçabilité des mouvements de stock (entrées/sorties)
-- =============================================================
CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  product_id UUID REFERENCES products(id),
  sub_product_id UUID REFERENCES sub_products(id),
  
  movement_type VARCHAR(20) NOT NULL,          -- ENTRY, EXIT, ADJUSTMENT, RETURN
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(30) NOT NULL,
  unit_price DECIMAL(12,2),
  
  reference_doc VARCHAR(100),                  -- numéro bon de livraison, etc.
  reason TEXT,
  operator_name VARCHAR(100),
  
  stock_before DECIMAL(12,3),
  stock_after DECIMAL(12,3),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  CHECK (product_id IS NOT NULL OR sub_product_id IS NOT NULL)
);

-- =============================================================
-- REFERENCE COUNTERS TABLE
-- Compteurs pour la génération des codes de référence
-- =============================================================
CREATE TABLE IF NOT EXISTS reference_counters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  counter_key VARCHAR(50) NOT NULL UNIQUE,     -- W/AGR/RIZ, W/FRN, etc.
  current_value INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- AUDIT LOG TABLE
-- Log complet de toutes les modifications
-- =============================================================
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_name VARCHAR(50) NOT NULL,
  record_id UUID NOT NULL,
  action VARCHAR(20) NOT NULL,                 -- CREATE, UPDATE, DELETE
  old_values JSONB,
  new_values JSONB,
  operator_name VARCHAR(100),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================
-- INDEXES for performance
-- =============================================================
CREATE INDEX IF NOT EXISTS idx_products_wal_ref ON products(wal_reference);
CREATE INDEX IF NOT EXISTS idx_products_sector ON products(sector_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products USING gin(to_tsvector('french', name));
CREATE INDEX IF NOT EXISTS idx_sub_products_parent ON sub_products(parent_product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
CREATE INDEX IF NOT EXISTS idx_stock_movements_date ON stock_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);

-- =============================================================
-- SEED DATA - Secteurs initiaux
-- =============================================================
INSERT INTO sectors (code, wal_code, name, description, icon) VALUES
  ('AGR', 'W/AGR', 'Agriculture', 'Produits agricoles, céréales, légumes, fruits', '🌾'),
  ('ELV', 'W/ELV', 'Élevage', 'Produits d''élevage, viande, lait, œufs', '🐄'),
  ('HAB', 'W/HAB', 'Habillement', 'Vêtements, textiles, accessoires vestimentaires', '👕'),
  ('PEC', 'W/PEC', 'Pêche', 'Produits de la mer, poissons, crustacés', '🐟'),
  ('IND', 'W/IND', 'Industrie', 'Produits industriels, matières premières', '🏭'),
  ('ALM', 'W/ALM', 'Alimentation', 'Produits alimentaires transformés', '🍽️'),
  ('PHR', 'W/PHR', 'Pharmacie', 'Médicaments, produits pharmaceutiques', '💊'),
  ('BTP', 'W/BTP', 'BTP & Construction', 'Matériaux de construction, bâtiment', '🏗️')
ON CONFLICT (code) DO NOTHING;

-- Catégories Agriculture
INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'RIZ', 'W/AGR/RIZ', 'Riz', id FROM sectors WHERE code = 'AGR'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'MIL', 'W/AGR/MIL', 'Mil / Sorgho', id FROM sectors WHERE code = 'AGR'
ON CONFLICT (wal_code) DO NOTHING;

-- Sous-catégories de Mil
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'MIB', 'W/AGR/MIL/MIB', 'Mil blanc', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/MIL'
ON CONFLICT (wal_code) DO UPDATE SET name = EXCLUDED.name, sector_id = EXCLUDED.sector_id, parent_category_id = EXCLUDED.parent_category_id;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'MIR', 'W/AGR/MIL/MIR', 'Mil rouge', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/MIL'
ON CONFLICT (wal_code) DO UPDATE SET name = EXCLUDED.name, sector_id = EXCLUDED.sector_id, parent_category_id = EXCLUDED.parent_category_id;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'MIS', 'W/AGR/MIL/MIS', 'Mil sorgho', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/MIL'
ON CONFLICT (wal_code) DO UPDATE SET name = EXCLUDED.name, sector_id = EXCLUDED.sector_id, parent_category_id = EXCLUDED.parent_category_id;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'MAI', 'W/AGR/MAI', 'Maïs', id FROM sectors WHERE code = 'AGR'
ON CONFLICT (wal_code) DO NOTHING;

-- Sous-catégories de Maïs
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'MAJ', 'W/AGR/MAI/MAJ', 'Maïs jaune', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/MAI'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'MAB', 'W/AGR/MAI/MAB', 'Maïs blanc', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/MAI'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'ARC', 'W/AGR/ARC', 'Arachide', id FROM sectors WHERE code = 'AGR'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'FRU', 'W/AGR/FRU', 'Fruits', id FROM sectors WHERE code = 'AGR'
ON CONFLICT (wal_code) DO NOTHING;

-- Sous-catégories de Fruits
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'MAG', 'W/AGR/FRU/MAG', 'Mangues', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/FRU'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'PAP', 'W/AGR/FRU/PAP', 'Papayes', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/FRU'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'BAN', 'W/AGR/FRU/BAN', 'Bananes', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/FRU'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'LEG', 'W/AGR/LEG', 'Légumes', id FROM sectors WHERE code = 'AGR'
ON CONFLICT (wal_code) DO NOTHING;

-- Sous-catégories de Légumes
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'TOM', 'W/AGR/LEG/TOM', 'Tomates', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/LEG'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'OIG', 'W/AGR/LEG/OIG', 'Oignons', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/LEG'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'POM', 'W/AGR/LEG/POM', 'Pommes de terre', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'AGR' AND pc.wal_code = 'W/AGR/LEG'
ON CONFLICT (wal_code) DO NOTHING;

-- Catégories Élevage
INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'BOV', 'W/ELV/BOV', 'Bovins', id FROM sectors WHERE code = 'ELV'
ON CONFLICT (wal_code) DO NOTHING;

-- Sous-catégories de Bovins
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'TAU', 'W/ELV/BOV/TAU', 'Taureaux', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'ELV' AND pc.wal_code = 'W/ELV/BOV'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'VAC', 'W/ELV/BOV/VAC', 'Vaches', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'ELV' AND pc.wal_code = 'W/ELV/BOV'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'OVI', 'W/ELV/OVI', 'Ovins / Caprins', id FROM sectors WHERE code = 'ELV'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'VOL', 'W/ELV/VOL', 'Volaille', id FROM sectors WHERE code = 'ELV'
ON CONFLICT (wal_code) DO NOTHING;

-- Sous-catégories de Volaille
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'POU', 'W/ELV/VOL/POU', 'Poulets', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'ELV' AND pc.wal_code = 'W/ELV/VOL'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'DIN', 'W/ELV/VOL/DIN', 'Dindes', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'ELV' AND pc.wal_code = 'W/ELV/VOL'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'LAI', 'W/ELV/LAI', 'Produits Laitiers', id FROM sectors WHERE code = 'ELV'
ON CONFLICT (wal_code) DO NOTHING;

-- Catégories Habillement
INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'VET', 'W/HAB/VET', 'Vêtements', id FROM sectors WHERE code = 'HAB'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'TIS', 'W/HAB/TIS', 'Tissus', id FROM sectors WHERE code = 'HAB'
ON CONFLICT (wal_code) DO NOTHING;

-- Catégories Pêche
INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'POI', 'W/PEC/POI', 'Poissons', id FROM sectors WHERE code = 'PEC'
ON CONFLICT (wal_code) DO NOTHING;

-- Sous-catégories de Poissons
INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'MER', 'W/PEC/POI/MER', 'Poissons de mer', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'PEC' AND pc.wal_code = 'W/PEC/POI'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id, parent_category_id)
SELECT 'DOU', 'W/PEC/POI/DOU', 'Poissons d''eau douce', s.id, pc.id
FROM sectors s, product_categories pc
WHERE s.code = 'PEC' AND pc.wal_code = 'W/PEC/POI'
ON CONFLICT (wal_code) DO NOTHING;

INSERT INTO product_categories (code, wal_code, name, sector_id)
SELECT 'CRU', 'W/PEC/CRU', 'Crustacés', id FROM sectors WHERE code = 'PEC'
ON CONFLICT (wal_code) DO NOTHING;

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
  ('W/PEC/CRU', 0)
ON CONFLICT (counter_key) DO NOTHING;
`;

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('🚀 Starting WAL database migration...');
    await client.query(MIGRATION_SQL);
    console.log('✅ Migration completed successfully!');
    console.log('📊 Tables created: sectors, suppliers, product_categories, products, sub_products, stock_movements, reference_counters, audit_logs');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();