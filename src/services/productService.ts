import { query, queryOne } from '../config/database';
import { WALReferenceGenerator } from './referenceGenerator';
import {
  Product, CreateProductDTO, ProductFilters, PaginatedResponse,
  StockMovement, StockMovementDTO
} from '../models/types';

export class ProductService {

  static async findAll(filters: ProductFilters): Promise<PaginatedResponse<Product>> {
    const page = filters.page ?? 1;
    const limit = Math.min(filters.limit ?? 20, 100);
    const offset = (page - 1) * limit;
    const sortBy = filters.sort_by ?? 'created_at';
    const sortOrder = filters.sort_order ?? 'DESC';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIdx = 1;

    if (filters.search) {
      conditions.push(`(
        p.name ILIKE $${paramIdx} OR 
        p.wal_reference ILIKE $${paramIdx} OR
        p.variant ILIKE $${paramIdx} OR
        p.barcode ILIKE $${paramIdx} OR
        cat.name ILIKE $${paramIdx} OR
        cat.wal_code ILIKE $${paramIdx}
      )`);
      params.push(`%${filters.search}%`);
      paramIdx++;
    }

    if (filters.sector_id) {
      conditions.push(`p.sector_id = $${paramIdx}`);
      params.push(filters.sector_id);
      paramIdx++;
    }

    if (filters.category_id) {
      conditions.push(`p.category_id = $${paramIdx}`);
      params.push(filters.category_id);
      paramIdx++;
    }

    if (filters.supplier_id) {
      conditions.push(`p.supplier_id = $${paramIdx}`);
      params.push(filters.supplier_id);
      paramIdx++;
    }

    if (filters.is_active !== undefined) {
      conditions.push(`p.is_active = $${paramIdx}`);
      params.push(filters.is_active);
      paramIdx++;
    }

    if (filters.low_stock) {
      conditions.push(`p.quantity_in_stock <= p.min_stock_alert AND p.min_stock_alert > 0`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const allowedSorts = ['name', 'wal_reference', 'quantity_in_stock', 'created_at'];
    const safeSortBy = allowedSorts.includes(sortBy) ? `p.${sortBy}` : 'p.created_at';

    const dataQuery = `
      SELECT 
        p.*,
        s.code as sector_code, s.name as sector_name, s.icon as sector_icon, s.wal_code as sector_wal_code,
        cat.code as category_code, cat.name as category_name, cat.wal_code as category_wal_code,
        sup.name as supplier_name, sup.code as supplier_code, sup.phone as supplier_phone,
        sup.email as supplier_email, sup.city as supplier_city
      FROM products p
      LEFT JOIN sectors s ON p.sector_id = s.id
      LEFT JOIN product_categories cat ON p.category_id = cat.id
      LEFT JOIN suppliers sup ON p.supplier_id = sup.id
      ${whereClause}
      ORDER BY ${safeSortBy} ${sortOrder}
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM products p
      LEFT JOIN product_categories cat ON p.category_id = cat.id
      ${whereClause}
    `;

    const [rows, countResult] = await Promise.all([
      query<Record<string, unknown>>(dataQuery, [...params, limit, offset]),
      queryOne<{ total: string }>(countQuery, params),
    ]);

    const total = parseInt(countResult?.total ?? '0', 10);

    const products = rows.map(r => this.mapRowToProduct(r));

    return {
      data: products,
      pagination: {
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit),
      },
    };
  }

  static async findById(id: string): Promise<Product | null> {
    const row = await queryOne<Record<string, unknown>>(
      `SELECT 
        p.*,
        s.code as sector_code, s.name as sector_name, s.icon as sector_icon, s.wal_code as sector_wal_code,
        cat.code as category_code, cat.name as category_name, cat.wal_code as category_wal_code,
        sup.name as supplier_name, sup.code as supplier_code, sup.phone as supplier_phone,
        sup.email as supplier_email, sup.city as supplier_city, sup.address as supplier_address,
        sup.country as supplier_country
      FROM products p
      LEFT JOIN sectors s ON p.sector_id = s.id
      LEFT JOIN product_categories cat ON p.category_id = cat.id
      LEFT JOIN suppliers sup ON p.supplier_id = sup.id
      WHERE p.id = $1`,
      [id]
    );

    if (!row) return null;

    const product = this.mapRowToProduct(row);

    // Fetch sub-products
    const subProducts = await query<Record<string, unknown>>(
      `SELECT * FROM sub_products WHERE parent_product_id = $1 AND is_active = true ORDER BY created_at ASC`,
      [id]
    );
    product.sub_products = subProducts.map(sp => ({
      id: String(sp.id),
      wal_reference: String(sp.wal_reference),
      parent_product_id: String(sp.parent_product_id),
      name: String(sp.name),
      description: sp.description ? String(sp.description) : undefined,
      unit: String(sp.unit),
      quantity_in_stock: Number(sp.quantity_in_stock),
      purchase_price: sp.purchase_price ? Number(sp.purchase_price) : undefined,
      selling_price: sp.selling_price ? Number(sp.selling_price) : undefined,
      currency: String(sp.currency),
      image_url: sp.image_url ? String(sp.image_url) : undefined,
      image_public_id: sp.image_public_id ? String(sp.image_public_id) : undefined,
      is_active: Boolean(sp.is_active),
      notes: sp.notes ? String(sp.notes) : undefined,
      created_at: String(sp.created_at),
      updated_at: String(sp.updated_at),
    }));

    return product;
  }

  static async findByWalCode(walCode: string): Promise<Product[]> {
    const cleanCode = walCode.trim().toUpperCase();
    
    // Search for products by category code prefix
    // This will find all products in a category and its sub-categories
    // Example: W/AGR/MIL will find all mil products (mil blanc, mil rouge, etc.)
    const rows = await query<Record<string, unknown>>(
      `SELECT
        p.*,
        s.code as sector_code, s.name as sector_name, s.icon as sector_icon, s.wal_code as sector_wal_code,
        cat.code as category_code, cat.name as category_name, cat.wal_code as category_wal_code,
        sup.name as supplier_name, sup.code as supplier_code,
        parent_cat.name as parent_category_name, parent_cat.wal_code as parent_category_wal_code
      FROM products p
      LEFT JOIN sectors s ON p.sector_id = s.id
      LEFT JOIN product_categories cat ON p.category_id = cat.id
      LEFT JOIN product_categories parent_cat ON cat.parent_category_id = parent_cat.id
      LEFT JOIN suppliers sup ON p.supplier_id = sup.id
      WHERE (p.wal_reference ILIKE $1 OR cat.wal_code ILIKE $1 OR parent_cat.wal_code ILIKE $1)
      ORDER BY p.wal_reference ASC
      LIMIT 100`,
      [`${cleanCode}%`]
    );
    return rows.map(r => this.mapRowToProduct(r));
  }

  /**
   * Get products by category ID, including sub-categories
   */
  static async findByCategoryId(categoryId: string): Promise<Product[]> {
    const rows = await query<Record<string, unknown>>(
      `WITH RECURSIVE category_tree AS (
        SELECT id, code, wal_code, name, parent_category_id
        FROM product_categories
        WHERE id = $1
        UNION ALL
        SELECT pc.id, pc.code, pc.wal_code, pc.name, pc.parent_category_id
        FROM product_categories pc
        INNER JOIN category_tree ct ON pc.parent_category_id = ct.id
      )
      SELECT
        p.*,
        s.code as sector_code, s.name as sector_name, s.icon as sector_icon, s.wal_code as sector_wal_code,
        cat.code as category_code, cat.name as category_name, cat.wal_code as category_wal_code,
        sup.name as supplier_name, sup.code as supplier_code
      FROM products p
      LEFT JOIN sectors s ON p.sector_id = s.id
      LEFT JOIN product_categories cat ON p.category_id = cat.id
      LEFT JOIN suppliers sup ON p.supplier_id = sup.id
      WHERE cat.id IN (SELECT id FROM category_tree) AND p.is_active = true
      ORDER BY p.wal_reference ASC`,
      [categoryId]
    );
    return rows.map(r => this.mapRowToProduct(r));
  }

  static async findBySupplierCode(supplierCode: string): Promise<Product[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT
        p.*,
        s.code as sector_code, s.name as sector_name, s.icon as sector_icon, s.wal_code as sector_wal_code,
        cat.code as category_code, cat.name as category_name, cat.wal_code as category_wal_code,
        sup.name as supplier_name, sup.code as supplier_code
      FROM products p
      LEFT JOIN sectors s ON p.sector_id = s.id
      LEFT JOIN product_categories cat ON p.category_id = cat.id
      LEFT JOIN suppliers sup ON p.supplier_id = sup.id
      WHERE sup.code = $1 AND p.is_active = true
      ORDER BY p.wal_reference ASC
      LIMIT 100`,
      [supplierCode]
    );
    return rows.map(r => this.mapRowToProduct(r));
  }

  static async create(dto: CreateProductDTO, imageBuffer?: Buffer): Promise<Product> {
    // Get sector and category codes for WAL reference
    const category = await queryOne<{ code: string; wal_code: string; sector_code: string }>(
      `SELECT cat.code, cat.wal_code, s.code as sector_code
       FROM product_categories cat
       JOIN sectors s ON cat.sector_id = s.id
       WHERE cat.id = $1`,
      [dto.category_id]
    );

    if (!category) throw new Error('Category not found');

    // Generate WAL reference
    const walReference = await WALReferenceGenerator.generateProductReference(
      category.sector_code,
      category.code,
      dto.variant ? dto.variant.charAt(0).toUpperCase() : undefined
    );

    // Upload image if provided
    let imageUrl: string | undefined;
    let imagePublicId: string | undefined;

    if (imageBuffer) {
      const { uploadToCloudinary } = await import('../config/cloudinary');
      const uploaded = await uploadToCloudinary(
        imageBuffer,
        'products',
        walReference.replace(/[^a-zA-Z0-9-]/g, '_')
      );
      imageUrl = uploaded.url;
      imagePublicId = uploaded.public_id;
    }

    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO products (
        wal_reference, sector_id, category_id, supplier_id, name, variant, description,
        unit, barcode, quantity_in_stock, min_stock_alert, purchase_price, selling_price,
        currency, image_url, image_public_id, origin_country, origin_region,
        batch_number, expiry_date, manufacture_date, notes
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22
      ) RETURNING id`,
      [
        walReference, dto.sector_id, dto.category_id, dto.supplier_id,
        dto.name, dto.variant, dto.description, dto.unit, dto.barcode,
        dto.quantity_in_stock ?? 0, dto.min_stock_alert ?? 0,
        dto.purchase_price, dto.selling_price, dto.currency ?? 'XOF',
        imageUrl, imagePublicId, dto.origin_country, dto.origin_region,
        dto.batch_number || null, dto.expiry_date || null, dto.manufacture_date || null, dto.notes
      ]
    );


    // Record initial stock movement
    if ((dto.quantity_in_stock ?? 0) > 0) {
      await this.recordStockMovement({
        product_id: String(row!.id),
        movement_type: 'ENTRY',
        quantity: dto.quantity_in_stock!,
        unit: dto.unit,
        unit_price: dto.purchase_price,
        reason: 'Stock initial',
        operator_name: 'System',
      });
    }

    const product = await this.findById(String(row!.id));
    return product!;
  }

  static async update(id: string, dto: Partial<CreateProductDTO>, imageBuffer?: Buffer): Promise<Product | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    let imageUrl = existing.image_url;
    let imagePublicId = existing.image_public_id;

    if (imageBuffer) {
      const { uploadToCloudinary, deleteFromCloudinary } = await import('../config/cloudinary');
      if (existing.image_public_id) {
        await deleteFromCloudinary(existing.image_public_id);
      }
      const uploaded = await uploadToCloudinary(imageBuffer, 'products', existing.wal_reference.replace(/[^a-zA-Z0-9-]/g, '_'));
      imageUrl = uploaded.url;
      imagePublicId = uploaded.public_id;
    }

    await query(
      `UPDATE products SET
        sector_id = COALESCE($1, sector_id),
        category_id = COALESCE($2, category_id),
        name = COALESCE($3, name),
        variant = COALESCE($4, variant),
        description = COALESCE($5, description),
        unit = COALESCE($6, unit),
        barcode = COALESCE($7, barcode),
        min_stock_alert = COALESCE($8, min_stock_alert),
        purchase_price = COALESCE($9, purchase_price),
        selling_price = COALESCE($10, selling_price),
        origin_country = COALESCE($11, origin_country),
        origin_region = COALESCE($12, origin_region),
        batch_number = COALESCE($13, batch_number),
        expiry_date = COALESCE($14, expiry_date),
        manufacture_date = COALESCE($15, manufacture_date),
        notes = COALESCE($16, notes),
        supplier_id = COALESCE($17, supplier_id),
        image_url = $18,
        image_public_id = $19,
        updated_at = NOW()
      WHERE id = $20`,
      [
        dto.sector_id, dto.category_id,
        dto.name, dto.variant, dto.description, dto.unit, dto.barcode,
        dto.min_stock_alert, dto.purchase_price, dto.selling_price,
        dto.origin_country, dto.origin_region, dto.batch_number,
        dto.expiry_date || null, dto.manufacture_date || null, dto.notes,
        dto.supplier_id, imageUrl, imagePublicId, id
      ]
    );


    return this.findById(id);
  }

  static async delete(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE products SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
      [id]
    );
    return result.length > 0;
  }

  static async recordStockMovement(dto: StockMovementDTO): Promise<StockMovement> {
    // Get current stock
    let currentStock = 0;
    if (dto.product_id) {
      const p = await queryOne<{ quantity_in_stock: number }>(
        `SELECT quantity_in_stock FROM products WHERE id = $1`, [dto.product_id]
      );
      currentStock = p?.quantity_in_stock ?? 0;
    } else if (dto.sub_product_id) {
      const sp = await queryOne<{ quantity_in_stock: number }>(
        `SELECT quantity_in_stock FROM sub_products WHERE id = $1`, [dto.sub_product_id]
      );
      currentStock = sp?.quantity_in_stock ?? 0;
    }

    const stockBefore = currentStock;
    let stockAfter = currentStock;

    if (dto.movement_type === 'ENTRY' || dto.movement_type === 'RETURN') {
      stockAfter = currentStock + dto.quantity;
    } else if (dto.movement_type === 'EXIT') {
      stockAfter = currentStock - dto.quantity;
    } else {
      stockAfter = dto.quantity; // ADJUSTMENT = set exact value
    }

    // Update stock
    if (dto.product_id) {
      await query(
        `UPDATE products SET quantity_in_stock = $1, updated_at = NOW() WHERE id = $2`,
        [stockAfter, dto.product_id]
      );
    } else if (dto.sub_product_id) {
      await query(
        `UPDATE sub_products SET quantity_in_stock = $1, updated_at = NOW() WHERE id = $2`,
        [stockAfter, dto.sub_product_id]
      );
    }

    // Record movement
    const row = await queryOne<Record<string, unknown>>(
      `INSERT INTO stock_movements (
        product_id, sub_product_id, movement_type, quantity, unit, unit_price,
        reference_doc, reason, operator_name, stock_before, stock_after
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING *`,
      [
        dto.product_id, dto.sub_product_id, dto.movement_type, dto.quantity,
        dto.unit, dto.unit_price, dto.reference_doc, dto.reason,
        dto.operator_name, stockBefore, stockAfter
      ]
    );

    return row as unknown as StockMovement;
  }

  static async getStockMovements(productId: string): Promise<StockMovement[]> {
    const rows = await query<Record<string, unknown>>(
      `SELECT sm.*, p.name as product_name, p.wal_reference
       FROM stock_movements sm
       LEFT JOIN products p ON sm.product_id = p.id
       WHERE sm.product_id = $1
       ORDER BY sm.created_at DESC
       LIMIT 50`,
      [productId]
    );
    return rows as unknown as StockMovement[];
  }

  // Tracability: trace a product back to its supplier
  static async getTraceability(productId: string) {
    const product = await this.findById(productId);
    if (!product) return null;

    const movements = await this.getStockMovements(productId);
    const subProducts = product.sub_products ?? [];

    return {
      product,
      supplier: product.supplier,
      sector: product.sector,
      category: product.category,
      movements,
      sub_products: subProducts,
      wal_chain: {
        sector: product.sector?.wal_code,
        category: product.category?.wal_code,
        product: product.wal_reference,
        sub_products: subProducts.map(sp => sp.wal_reference),
      }
    };
  }

  private static mapRowToProduct(r: Record<string, unknown>): Product {
    return {
      id: String(r.id),
      wal_reference: String(r.wal_reference),
      sector_id: String(r.sector_id),
      category_id: String(r.category_id),
      supplier_id: String(r.supplier_id),
      name: String(r.name),
      variant: r.variant ? String(r.variant) : undefined,
      description: r.description ? String(r.description) : undefined,
      unit: String(r.unit),
      barcode: r.barcode ? String(r.barcode) : undefined,
      quantity_in_stock: Number(r.quantity_in_stock),
      min_stock_alert: Number(r.min_stock_alert),
      purchase_price: r.purchase_price ? Number(r.purchase_price) : undefined,
      selling_price: r.selling_price ? Number(r.selling_price) : undefined,
      currency: String(r.currency),
      image_url: r.image_url ? String(r.image_url) : undefined,
      image_public_id: r.image_public_id ? String(r.image_public_id) : undefined,
      origin_country: r.origin_country ? String(r.origin_country) : undefined,
      origin_region: r.origin_region ? String(r.origin_region) : undefined,
      batch_number: r.batch_number ? String(r.batch_number) : undefined,
      expiry_date: r.expiry_date ? String(r.expiry_date) : undefined,
      manufacture_date: r.manufacture_date ? String(r.manufacture_date) : undefined,
      is_active: Boolean(r.is_active),
      notes: r.notes ? String(r.notes) : undefined,
      created_at: String(r.created_at),
      updated_at: String(r.updated_at),
      sector: r.sector_code ? {
        id: String(r.sector_id),
        code: String(r.sector_code),
        wal_code: String(r.sector_wal_code),
        name: String(r.sector_name),
        icon: r.sector_icon ? String(r.sector_icon) : undefined,
        is_active: true,
        created_at: '',
        updated_at: '',
      } : undefined,
      category: r.category_code ? {
        id: String(r.category_id),
        code: String(r.category_code),
        wal_code: String(r.category_wal_code),
        name: String(r.category_name),
        sector_id: String(r.sector_id),
        is_active: true,
        created_at: '',
        updated_at: '',
      } : undefined,
      supplier: r.supplier_name ? {
        id: String(r.supplier_id),
        code: String(r.supplier_code ?? ''),
        name: String(r.supplier_name),
        phone: r.supplier_phone ? String(r.supplier_phone) : undefined,
        email: r.supplier_email ? String(r.supplier_email) : undefined,
        city: r.supplier_city ? String(r.supplier_city) : undefined,
        address: r.supplier_address ? String(r.supplier_address) : undefined,
        country: r.supplier_country ? String(r.supplier_country) : 'Sénégal',
        is_active: true,
        created_at: '',
        updated_at: '',
      } : undefined,
    };
  }
}