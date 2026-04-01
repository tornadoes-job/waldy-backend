// =============================================================
// WAL PRODUCT MANAGEMENT - TYPES & INTERFACES
// =============================================================

export interface Sector {
  id: string;
  code: string;
  wal_code: string;
  name: string;
  description?: string;
  icon?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Supplier {
  id: string;
  code: string;
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country: string;
  sector_id?: string;
  sector?: Sector;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface ProductCategory {
  id: string;
  code: string;
  wal_code: string;
  name: string;
  sector_id: string;
  sector?: Sector;
  parent_category_id?: string;
  parent_category?: ProductCategory;
  description?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Product {
  id: string;
  wal_reference: string;
  sector_id: string;
  category_id: string;
  supplier_id: string;
  sector?: Sector;
  category?: ProductCategory;
  supplier?: Supplier;
  name: string;
  variant?: string;
  description?: string;
  unit: string;
  barcode?: string;
  quantity_in_stock: number;
  min_stock_alert: number;
  purchase_price?: number;
  selling_price?: number;
  currency: string;
  image_url?: string;
  image_public_id?: string;
  origin_country?: string;
  origin_region?: string;
  batch_number?: string;
  expiry_date?: string;
  manufacture_date?: string;
  is_active: boolean;
  notes?: string;
  sub_products?: SubProduct[];
  created_at: string;
  updated_at: string;
}

export interface SubProduct {
  id: string;
  wal_reference: string;
  parent_product_id: string;
  parent_product?: Pick<Product, 'id' | 'name' | 'wal_reference'>;
  name: string;
  description?: string;
  unit: string;
  quantity_in_stock: number;
  purchase_price?: number;
  selling_price?: number;
  currency: string;
  image_url?: string;
  image_public_id?: string;
  is_active: boolean;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface StockMovement {
  id: string;
  product_id?: string;
  sub_product_id?: string;
  product?: Pick<Product, 'id' | 'name' | 'wal_reference'>;
  movement_type: 'ENTRY' | 'EXIT' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  unit: string;
  unit_price?: number;
  reference_doc?: string;
  reason?: string;
  operator_name?: string;
  stock_before?: number;
  stock_after?: number;
  created_at: string;
}

// DTOs for creation
export interface CreateSupplierDTO {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  country?: string;
  sector_id?: string;
  notes?: string;
}

export interface CreateProductCategoryDTO {
  code: string;
  name: string;
  sector_id: string;
  description?: string;
}

export interface CreateProductDTO {
  sector_id: string;
  category_id: string;
  supplier_id: string;
  name: string;
  variant?: string;
  description?: string;
  unit: string;
  barcode?: string;
  quantity_in_stock?: number;
  min_stock_alert?: number;
  purchase_price?: number;
  selling_price?: number;
  currency?: string;
  origin_country?: string;
  origin_region?: string;
  batch_number?: string;
  expiry_date?: string;
  manufacture_date?: string;
  notes?: string;
}

export interface CreateSubProductDTO {
  parent_product_id: string;
  name: string;
  description?: string;
  unit: string;
  quantity_in_stock?: number;
  purchase_price?: number;
  selling_price?: number;
  currency?: string;
  notes?: string;
}

export interface StockMovementDTO {
  product_id?: string;
  sub_product_id?: string;
  movement_type: 'ENTRY' | 'EXIT' | 'ADJUSTMENT' | 'RETURN';
  quantity: number;
  unit: string;
  unit_price?: number;
  reference_doc?: string;
  reason?: string;
  operator_name?: string;
}

// Query params
export interface ProductFilters {
  search?: string;
  sector_id?: string;
  category_id?: string;
  supplier_id?: string;
  is_active?: boolean;
  low_stock?: boolean;
  page?: number;
  limit?: number;
  sort_by?: 'name' | 'wal_reference' | 'quantity_in_stock' | 'created_at';
  sort_order?: 'ASC' | 'DESC';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    total_pages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

// WAL Reference generation
export interface WALReferenceComponents {
  sector_code: string;     // AGR
  category_code: string;   // RIZ
  sequence: string;        // 0001
  variant_suffix?: string; // A, B, C
}