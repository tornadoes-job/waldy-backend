import { Request, Response } from 'express';
import { query, queryOne } from '../config/database';
import { WALReferenceGenerator } from '../services/referenceGenerator';
import { CreateSupplierDTO } from '../models/types';

export class SupplierController {

  static async getAll(req: Request, res: Response): Promise<void> {
    try {
      const search = req.query.search as string;
      const sector_id = req.query.sector_id as string;
      const is_active = req.query.is_active !== 'false';

      const conditions = [`sup.is_active = $1`];
      const params: unknown[] = [is_active];
      let idx = 2;

      if (search) {
        conditions.push(`(sup.name ILIKE $${idx} OR sup.code ILIKE $${idx} OR sup.city ILIKE $${idx})`);
        params.push(`%${search}%`);
        idx++;
      }
      if (sector_id) {
        conditions.push(`sup.sector_id = $${idx}`);
        params.push(sector_id);
        idx++;
      }

      const rows = await query(
        `SELECT sup.*, s.name as sector_name, s.icon as sector_icon, s.wal_code as sector_wal_code
         FROM suppliers sup
         LEFT JOIN sectors s ON sup.sector_id = s.id
         WHERE ${conditions.join(' AND ')}
         ORDER BY sup.name ASC`,
        params
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const row = await queryOne(
        `SELECT sup.*, s.name as sector_name, s.icon as sector_icon
         FROM suppliers sup
         LEFT JOIN sectors s ON sup.sector_id = s.id
         WHERE sup.id = $1`,
        [req.params.id]
      );
      if (!row) {
        res.status(404).json({ success: false, error: 'Supplier not found' });
        return;
      }

      // Get all products from this supplier
      const products = await query(
        `SELECT p.id, p.wal_reference, p.name, p.variant, p.quantity_in_stock, p.unit,
                s.name as sector_name, s.icon as sector_icon, cat.name as category_name
         FROM products p
         JOIN sectors s ON p.sector_id = s.id
         JOIN product_categories cat ON p.category_id = cat.id
         WHERE p.supplier_id = $1 AND p.is_active = true
         ORDER BY p.wal_reference`,
        [req.params.id]
      );

      res.json({ success: true, data: { ...row, products } });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const dto: CreateSupplierDTO = req.body;
      if (!dto.name) {
        res.status(400).json({ success: false, error: 'Supplier name is required' });
        return;
      }

      const code = await WALReferenceGenerator.generateSupplierReference();

      const row = await queryOne(
        `INSERT INTO suppliers (code, name, contact_person, email, phone, address, city, country, sector_id, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         RETURNING *`,
        [code, dto.name, dto.contact_person, dto.email, dto.phone, dto.address, dto.city,
         dto.country ?? 'Sénégal', dto.sector_id, dto.notes]
      );

      res.status(201).json({ success: true, data: row, message: `Supplier created with code: ${code}` });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ success: false, error: msg });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const row = await queryOne(
        `UPDATE suppliers SET
          name = COALESCE($1, name),
          contact_person = COALESCE($2, contact_person),
          email = COALESCE($3, email),
          phone = COALESCE($4, phone),
          address = COALESCE($5, address),
          city = COALESCE($6, city),
          country = COALESCE($7, country),
          sector_id = COALESCE($8, sector_id),
          notes = COALESCE($9, notes),
          updated_at = NOW()
         WHERE id = $10 RETURNING *`,
        [req.body.name, req.body.contact_person, req.body.email, req.body.phone,
         req.body.address, req.body.city, req.body.country, req.body.sector_id,
         req.body.notes, req.params.id]
      );
      if (!row) {
        res.status(404).json({ success: false, error: 'Supplier not found' });
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
        `UPDATE suppliers SET is_active = false, updated_at = NOW() WHERE id = $1 RETURNING id`,
        [req.params.id]
      );
      if (result.length === 0) {
        res.status(404).json({ success: false, error: 'Supplier not found' });
        return;
      }
      res.json({ success: true, message: 'Supplier deactivated' });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }
}