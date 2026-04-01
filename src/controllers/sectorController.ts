import { Request, Response } from 'express';
import { query, queryOne } from '../config/database';

export class SectorController {
  static async getAll(_req: Request, res: Response): Promise<void> {
    try {
      const rows = await query(
        `SELECT s.*, COUNT(p.id) as product_count
         FROM sectors s
         LEFT JOIN products p ON p.sector_id = s.id AND p.is_active = true
         WHERE s.is_active = true
         GROUP BY s.id
         ORDER BY s.name ASC`
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async getCategories(req: Request, res: Response): Promise<void> {
    try {
      const sectorId = req.params.sectorId;
      const rows = await query(
        `SELECT cat.*, COUNT(p.id) as product_count
         FROM product_categories cat
         LEFT JOIN products p ON p.category_id = cat.id AND p.is_active = true
         WHERE cat.sector_id = $1 AND cat.is_active = true
         GROUP BY cat.id
         ORDER BY cat.name ASC`,
        [sectorId]
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async getAllCategories(_req: Request, res: Response): Promise<void> {
    try {
      const rows = await query(
        `SELECT cat.*, 
                s.name as sector_name, s.icon as sector_icon, s.wal_code as sector_wal_code,
                parent_cat.name as parent_category_name, parent_cat.wal_code as parent_category_wal_code
         FROM product_categories cat
         JOIN sectors s ON cat.sector_id = s.id
         LEFT JOIN product_categories parent_cat ON cat.parent_category_id = parent_cat.id
         WHERE cat.is_active = true
         ORDER BY s.name, cat.wal_code ASC`
      );
      res.json({ success: true, data: rows });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  }

  static async createCategory(req: Request, res: Response): Promise<void> {
    try {
      const { code, name, sector_id, description, parent_category_id } = req.body;
      if (!code || !name || !sector_id) {
        res.status(400).json({ success: false, error: 'code, name, and sector_id are required' });
        return;
      }

      const sector = await queryOne<{ wal_code: string }>(
        `SELECT wal_code FROM sectors WHERE id = $1`, [sector_id]
      );
      if (!sector) {
        res.status(400).json({ success: false, error: 'Sector not found' });
        return;
      }

      // Build WAL code: W/AGR/CODE or W/AGR/PARENT/CODE for sub-categories
      let walCode: string;
      if (parent_category_id) {
        // Get parent category WAL code
        const parent = await queryOne<{ wal_code: string }>(
          `SELECT wal_code FROM product_categories WHERE id = $1`, [parent_category_id]
        );
        if (!parent) {
          res.status(400).json({ success: false, error: 'Parent category not found' });
          return;
        }
        walCode = `${parent.wal_code}/${code.toUpperCase()}`;
      } else {
        walCode = `${sector.wal_code}/${code.toUpperCase()}`;
      }

      const row = await queryOne(
        `INSERT INTO product_categories (code, wal_code, name, sector_id, description, parent_category_id)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [code.toUpperCase(), walCode, name, sector_id, description, parent_category_id || null]
      );

      res.status(201).json({ success: true, data: row });
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Internal server error';
      res.status(500).json({ success: false, error: msg });
    }
  }
}