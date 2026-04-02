import { Request, Response } from 'express';
import { ProductService } from '../services/productService';
import { ProductFilters, CreateProductDTO, StockMovementDTO } from '../models/types';

export class ProductController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const filters: ProductFilters = {
        search: req.query.search as string,
        sector_id: req.query.sector_id as string,
        category_id: req.query.category_id as string,
        supplier_id: req.query.supplier_id as string,
        is_active: req.query.is_active !== undefined ? req.query.is_active === 'true' : true,
        low_stock: req.query.low_stock === 'true',
        page: parseInt(req.query.page as string) || 1,
        limit: parseInt(req.query.limit as string) || 20,
        sort_by: req.query.sort_by as ProductFilters['sort_by'],
        sort_order: (req.query.sort_order as 'ASC' | 'DESC') || 'DESC',
      };

      const result = await ProductService.findAll(filters);
      res.json({ success: true, ...result });
    } catch (error) {
      console.error('Error in getAll products:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const product = await ProductService.findById(req.params.id);
      if (!product) {
        res.status(404).json({ success: false, error: 'Product not found' });
        return;
      }
      res.json({ success: true, data: product });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async searchByWalCode(req: Request, res: Response): Promise<void> {
    try {
      const { code } = req.query;
      if (!code || typeof code !== 'string') {
        res.status(400).json({ success: false, error: 'WAL code is required' });
        return;
      }
      const products = await ProductService.findByWalCode(code);
      res.json({ success: true, data: products });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async getByCategory(req: Request, res: Response): Promise<void> {
    try {
      const { categoryId } = req.params;
      if (!categoryId) {
        res.status(400).json({ success: false, error: 'Category ID is required' });
        return;
      }
      const products = await ProductService.findByCategoryId(categoryId);
      res.json({ success: true, data: products });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async getBySupplierCode(req: Request, res: Response): Promise<void> {
    try {
      const { supplierCode } = req.query;
      if (!supplierCode || typeof supplierCode !== 'string') {
        res.status(400).json({ success: false, error: 'Supplier code is required' });
        return;
      }
      const products = await ProductService.findBySupplierCode(supplierCode);
      res.json({ success: true, data: products });
    } catch (error) {
      console.error('Error in getBySupplierCode:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      console.log('[CREATE] Body fields:', Object.keys(req.body));
      console.log('[CREATE] File:', !!req.file);
      const dto: CreateProductDTO = {
        sector_id: req.body.sector_id || '',
        category_id: req.body.category_id || '',
        supplier_id: req.body.supplier_id || '',
        name: req.body.name || '',
        variant: req.body.variant || '',
        description: req.body.description || '',
        unit: req.body.unit || 'kg',
        barcode: req.body.barcode || '',
        quantity_in_stock: Number(req.body.quantity_in_stock) || 0,
        min_stock_alert: Number(req.body.min_stock_alert) || 0,
        purchase_price: req.body.purchase_price ? Number(req.body.purchase_price) : undefined,
        selling_price: req.body.selling_price ? Number(req.body.selling_price) : undefined,
        currency: req.body.currency || 'XOF',
        origin_country: req.body.origin_country || '',
        origin_region: req.body.origin_region || '',
        batch_number: req.body.batch_number || '',
        expiry_date: req.body.expiry_date || '',
        manufacture_date: req.body.manufacture_date || '',
        notes: req.body.notes || '',
      };

      console.log('[CREATE] DTO quantity:', dto.quantity_in_stock);

      if (!dto.sector_id || !dto.category_id || !dto.supplier_id || !dto.name || !dto.unit) {
        res.status(400).json({ success: false, error: 'Missing required fields: sector_id, category_id, supplier_id, name, unit' });
        return;
      }

      const imageBuffer = req.file?.buffer;
      const product = await ProductService.create(dto, imageBuffer);
      res.status(201).json({ success: true, data: product, message: `Product created with reference: ${product.wal_reference}` });
    } catch (error) {
      console.error('Error creating product:', error);
      const msg = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ success: false, error: msg });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      console.log('[UPDATE] Body fields:', Object.keys(req.body));
      console.log('[UPDATE] File:', !!req.file);
      // Parse body fields from multipart/form-data
      const body = req.body;
      
      const dto: Partial<CreateProductDTO> = {
        sector_id: body.sector_id || undefined,
        category_id: body.category_id || undefined,
        supplier_id: body.supplier_id || undefined,
        name: body.name || undefined,
        variant: body.variant || undefined,
        description: body.description || undefined,
        unit: body.unit || undefined,
        barcode: body.barcode || undefined,
        quantity_in_stock: body.quantity_in_stock !== undefined ? Number(body.quantity_in_stock) || 0 : undefined,
        min_stock_alert: body.min_stock_alert !== undefined ? Number(body.min_stock_alert) || 0 : undefined,
        purchase_price: body.purchase_price !== undefined ? Number(body.purchase_price) || undefined : undefined,
        selling_price: body.selling_price !== undefined ? Number(body.selling_price) || undefined : undefined,
        currency: body.currency || undefined,
        origin_country: body.origin_country || undefined,
        origin_region: body.origin_region || undefined,
        batch_number: body.batch_number || undefined,
        expiry_date: body.expiry_date || undefined,
        manufacture_date: body.manufacture_date || undefined,
        notes: body.notes || undefined,
      };

      console.log('[UPDATE] DTO changes:', dto);

      const imageBuffer = req.file?.buffer;
      const product = await ProductService.update(req.params.id, dto, imageBuffer);
      if (!product) {
        res.status(404).json({ success: false, error: 'Product not found' });
        return;
      }
      res.json({ success: true, data: product, message: 'Product updated successfully' });
    } catch (error) {
      console.error('Error updating product:', error);
      const msg = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ success: false, error: msg });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const success = await ProductService.delete(req.params.id);
      if (!success) {
        res.status(404).json({ success: false, error: 'Product not found' });
        return;
      }
      res.json({ success: true, message: 'Product deactivated successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async getTraceability(req: Request, res: Response): Promise<void> {
    try {
      const trace = await ProductService.getTraceability(req.params.id);
      if (!trace) {
        res.status(404).json({ success: false, error: 'Product not found' });
        return;
      }
      res.json({ success: true, data: trace });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async recordStockMovement(req: Request, res: Response): Promise<void> {
    try {
      const dto: StockMovementDTO = {
        product_id: req.params.id,
        movement_type: req.body.movement_type,
        quantity: parseFloat(req.body.quantity),
        unit: req.body.unit,
        unit_price: req.body.unit_price ? parseFloat(req.body.unit_price) : undefined,
        reference_doc: req.body.reference_doc,
        reason: req.body.reason,
        operator_name: req.body.operator_name,
      };

      if (!dto.movement_type || !dto.quantity || !dto.unit) {
        res.status(400).json({ success: false, error: 'movement_type, quantity, and unit are required' });
        return;
      }

      const movement = await ProductService.recordStockMovement(dto);
      res.status(201).json({ success: true, data: movement });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ success: false, error: msg });
    }
  }

  static async getStockMovements(req: Request, res: Response): Promise<void> {
    try {
      const movements = await ProductService.getStockMovements(req.params.id);
      res.json({ success: true, data: movements });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}