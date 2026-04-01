import { query, queryOne } from '../config/database';

// =============================================================
// WAL REFERENCE CODE GENERATOR
// New Format (starts with W/):
// - Category Code: W/{sectorCode}/{categoryCode} (e.g., W/AGR/MIL for Mil)
// - Product Code: W/{sectorCode}/{categoryCode}-{sequence} (e.g., W/AGR/MIL-001)
// - Sub-Product Code: {parentReference}-SP{sequence} (e.g., W/AGR/MIL-001-SP01)
//
// Sector mapping:
//   AGR = Agriculture
//   ALM = Alimentation
//   BTP = BTP & Construction
//   HAB = Habillement
//   IND = Industrie
//   PHR = Pharmacie
//   PEC = Pêche
//   ELV = Élevage
//
// Examples:
//   W/AGR/MIL = Category Mil
//   W/AGR/MIL-001 = Product Mil, sequence 001
//   W/AGR/MIL-001-SP01 = Sub-product of Mil
// =============================================================

const SECTOR_CODES: Record<string, string> = {
  'AGR': 'AGR',
  'ALM': 'ALM',
  'BTP': 'BTP',
  'HAB': 'HAB',
  'IND': 'IND',
  'PHR': 'PHR',
  'PEC': 'PEC',
  'ELV': 'ELV',
};

export class WALReferenceGenerator {

  /**
   * Get sector code from sector code (pas de conversion)
   */
  private static getSectorCode(sectorCode: string): string {
    return SECTOR_CODES[sectorCode.toUpperCase()] || 'UNK';
  }

  /**
   * Get and increment counter for a given key
   */
  private static async getNextCounter(counterKey: string): Promise<number> {
    const result = await queryOne<{ current_value: number }>(
      `INSERT INTO reference_counters (counter_key, current_value)
       VALUES ($1, 1)
       ON CONFLICT (counter_key) DO UPDATE
         SET current_value = reference_counters.current_value + 1,
             updated_at = NOW()
       RETURNING current_value`,
      [counterKey]
    );
    return result?.current_value ?? 1;
  }

  /**
   * Generate WAL reference for a product
   * Format: W/{sectorCode}/{categoryCode}-{sequence}
   * Example: W/AGR/MIL-001 (Secteur Agriculture, Catégorie Mil, Séquence 001)
   */
  static async generateProductReference(
    sectorCode: string,
    categoryCode: string,
    variantSuffix?: string
  ): Promise<string> {
    const sector = this.getSectorCode(sectorCode);
    const category = categoryCode.toUpperCase();

    // Build the base code: W/{sector}/{category}
    // Example: W/AGR/MIL
    const baseCode = `W/${sector}/${category}`;

    // Get sequence counter
    const counterKey = `${baseCode}`;
    const counter = await this.getNextCounter(counterKey);
    const sequence = String(counter).padStart(3, '0');

    return `${baseCode}-${sequence}`;
  }

  /**
   * Generate WAL reference for a supplier
   * Format: W/FRN-{sequence}
   */
  static async generateSupplierReference(): Promise<string> {
    const counter = await this.getNextCounter('W/FRN');
    const sequence = String(counter).padStart(4, '0');
    return `W/FRN-${sequence}`;
  }

  /**
   * Generate WAL reference for a sub-product
   * Format: {parentReference}-SP{sequence}
   */
  static async generateSubProductReference(parentReference: string): Promise<string> {
    const key = `SP-${parentReference}`;
    const counter = await this.getNextCounter(key);
    const sequence = String(counter).padStart(2, '0');
    return `${parentReference}-SP${sequence}`;
  }

  /**
   * Decode a WAL reference into its components
   */
  static decodeReference(reference: string): {
    prefix: string;
    sector?: string;
    category?: string;
    sequence?: string;
    isSubProduct?: boolean;
    subProductIndex?: string;
    type: 'product' | 'supplier' | 'sub_product' | 'unknown';
  } {
    // Supplier: W/FRN-0001
    if (reference.startsWith('W/FRN-')) {
      return { prefix: 'W', type: 'supplier', sequence: reference.split('-')[1] };
    }

    // Sub-product: W/AGR/MIL-001-SP01
    const spIndex = reference.lastIndexOf('-SP');
    if (spIndex !== -1) {
      const parentRef = reference.substring(0, spIndex);
      const parts = parentRef.split('/');
      return {
        prefix: 'W',
        sector: parts[1],
        category: parts[2]?.split('-')[0],
        sequence: parts[2]?.split('-')[1],
        isSubProduct: true,
        subProductIndex: reference.substring(spIndex + 1),
        type: 'sub_product',
      };
    }

    // Product: W/AGR/MIL-001
    if (reference.startsWith('W/') && reference.includes('/')) {
      const parts = reference.split('/');
      const lastPart = parts[parts.length - 1];
      const lastParts = lastPart.split('-');
      return {
        prefix: 'W',
        sector: parts[1],
        category: lastParts[0],
        sequence: lastParts[1],
        type: 'product',
      };
    }

    return { prefix: 'W', type: 'unknown' };
  }

  /**
   * Parse search code for autocomplete
   */
  static parseSearchCode(input: string): {
    sector?: string;
    category?: string;
    sequence?: string;
  } {
    const clean = input.trim().toUpperCase();
    
    // Handle W/AGR/MIL format
    if (clean.startsWith('W/')) {
      const parts = clean.split('/');
      if (parts.length >= 3) {
        const lastParts = parts[2].split('-');
        return {
          sector: parts[1],
          category: lastParts[0],
          sequence: lastParts[1],
        };
      }
    }
    
    return {
      sector: undefined,
      category: undefined,
      sequence: undefined,
    };
  }
}