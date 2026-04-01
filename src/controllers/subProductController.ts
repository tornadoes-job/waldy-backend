import { Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { WALReferenceGenerator } from '../services/referenceGenerator';
import { CreateSubProductDTO } from '../models/types';

export class SubProductController {

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const dto: CreateSubProductDTO = {
        parent_product_id: req.params.productId,
        name: req.body.name,
        description: req.body.description,
        unit: req.body.unit,
        quantity_in_stock: parseFloat(req.body.quantity_in_stock) || 0,
        purchase_price: req.body.purchase_price ? parseFloat(req.body.purchase_price) : undefined,
        selling_price: req.body.selling_price ? parseFloat(req.body.selling_price) : undefined,
        currency: req.body.currency || 'XOF',
        notes: req.body.notes,
      };

      if (!dto.name || !dto.unit) {
        res.status(400).json({ success: false, error: 'name and unit are required' });
        return;
      }

      const parent = await queryOne<{ wal_reference: string }>(
        `SELECT wal_reference FROM products WHERE id = $1`, [dto.parent_product_id]
      );
      if (!parent) {
        res.status(404).json({ success: false, error: 'Parent product not found' });
        return;
      }

      const walRef = await WALReferenceGenerator.generateSubProductReference(parent.wal_reference);

      let imageUrl: string | undefined;
      let imagePublicId: string | undefined;
      if (req.file?.buffer) {
        const { uploadToCloudinary } = await import('../config/cloudinary');
        const uploaded = await uploadToCloudinary(req.file.buffer, 'sub-products', walRef.replace(/[^a-zA-Z0-9-]/g, '_'));
        imageUrl = uploaded.url;
        imagePublicId = uploaded.public_id;
      }

      const row = await queryOne(
        `INSERT INTO sub_products (wal_reference, parent_product_id, name, description, unit,
          quantity_in_stock, purchase_price, selling_price, currency, image_url, image_public_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
        [walRef, dto.parent_product_id, dto.name, dto.description, dto.unit,
         dto.quantity_in_stock ?? 0, dto.purchase_price, dto.selling_price,
         dto.currency, imageUrl, imagePublicId, dto.notes]
      );

      res.status(201).json({ success: true, data: row, message: `Sub-product created: ${walRef}` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ success: false, error: msg });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const row = await queryOne(
        `UPDATE sub_products SET
          name = COALESCE($1, name),
          description = COALESCE($2, description),
          unit = COALESCE($3, unit),
          purchase_price = COALESCE($4, purchase_price),
          selling_price = COALESCE($5, selling_price),
          notes = COALESCE($6, notes),
          updated_at = NOW()
         WHERE id = $7 RETURNING *`,
        [req.body.name, req.body.description, req.body.unit,
         req.body.purchase_price, req.body.selling_price, req.body.notes, req.params.id]
      );
      if (!row) {
        res.status(404).json({ success: false, error: 'Sub-product not found' });
        return;
      }
      res.json({ success: true, data: row });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async delete(req: Request, res: Response): Promise<void> {
    try {
      const result = await query(
        `UPDATE sub_products SET is_active = false WHERE id = $1 RETURNING id`, [req.params.id]
      );
      if (result.length === 0) {
        res.status(404).json({ success: false, error: 'Sub-product not found' });
        return;
      }
      res.json({ success: true, message: 'Sub-product deactivated' });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async recordStock(req: Request, res: Response): Promise<void> {
    try {
      const { movement_type, quantity, unit, unit_price, reason, operator_name } = req.body;
      const subProductId = req.params.id;

      const sp = await queryOne<{ quantity_in_stock: number; unit: string }>(
        `SELECT quantity_in_stock, unit FROM sub_products WHERE id = $1`, [subProductId]
      );
      if (!sp) {
        res.status(404).json({ success: false, error: 'Sub-product not found' });
        return;
      }

      const stockBefore = sp.quantity_in_stock;
      let stockAfter = stockBefore;
      if (movement_type === 'ENTRY' || movement_type === 'RETURN') stockAfter += parseFloat(quantity);
      else if (movement_type === 'EXIT') stockAfter -= parseFloat(quantity);
      else stockAfter = parseFloat(quantity);

      await query(`UPDATE sub_products SET quantity_in_stock = $1, updated_at = NOW() WHERE id = $2`, [stockAfter, subProductId]);

      const row = await queryOne(
        `INSERT INTO stock_movements (sub_product_id, movement_type, quantity, unit, unit_price, reason, operator_name, stock_before, stock_after)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
        [subProductId, movement_type, parseFloat(quantity), unit || sp.unit, unit_price, reason, operator_name, stockBefore, stockAfter]
      );

      res.status(201).json({ success: true, data: row });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}