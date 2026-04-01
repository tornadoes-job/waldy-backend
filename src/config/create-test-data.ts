import { pool } from './database';

async function createTestData() {
  const client = await pool.connect();
  try {
    // Get sector and category IDs
    const sector = await client.query<{id: string}>(
      `SELECT id FROM sectors WHERE code = 'AGR'`
    );
    const sectorId = sector.rows[0].id;

    const category = await client.query<{id: string}>(
      `SELECT id FROM product_categories WHERE wal_code = 'W/AGR/MIL'`
    );
    const categoryId = category.rows[0].id;

    // Create a supplier
    const supplier = await client.query<{id: string}>(
      `INSERT INTO suppliers (code, name, city, country)
       VALUES ('W/FRN-0001', 'Fournisseur Test', 'Dakar', 'Sénégal')
       ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
       RETURNING id`
    );
    const supplierId = supplier.rows[0].id;

    // Create a product
    const product = await client.query<{id: string; wal_reference: string}>(
      `INSERT INTO products (wal_reference, sector_id, category_id, supplier_id, name, unit, quantity_in_stock, selling_price, currency)
       VALUES ('W/AGR/MIL-001', $1, $2, $3, 'Mil Premium', 'kg', 100, 500, 'XOF')
       ON CONFLICT (wal_reference) DO UPDATE SET name = EXCLUDED.name
       RETURNING id, wal_reference`,
      [sectorId, categoryId, supplierId]
    );
    const productId = product.rows[0].id;
    const walRef = product.rows[0].wal_reference;

    console.log(`✅ Produit créé : ${walRef} (ID: ${productId})`);

    // Create sub-products
    const subProducts = [
      { name: 'Son de mil', price: 200 },
      { name: 'Farine de mil', price: 800 },
      { name: 'Mil décortiqué', price: 600 },
    ];

    for (const sp of subProducts) {
      const counter = await client.query<{current_value: number}>(
        `INSERT INTO reference_counters (counter_key, current_value)
         VALUES ($1, 1)
         ON CONFLICT (counter_key) DO UPDATE
           SET current_value = reference_counters.current_value + 1,
               updated_at = NOW()
         RETURNING current_value`,
        [`SP-${walRef}`]
      );
      const seq = String(counter.rows[0].current_value).padStart(2, '0');
      const spWalRef = `${walRef}-SP${seq}`;

      const subProduct = await client.query<{id: string}>(
        `INSERT INTO sub_products (wal_reference, parent_product_id, name, unit, quantity_in_stock, selling_price, currency)
         VALUES ($1, $2, $3, 'kg', 50, $4, 'XOF')
         RETURNING id`,
        [spWalRef, productId, sp.name, sp.price]
      );

      console.log(`   └─ Sous-produit créé : ${spWalRef} - ${sp.name} (${sp.price} XOF)`);
    }

    console.log('\n✅ Données de test créées avec succès !');
    console.log(`\nPour tester dans l'interface :`);
    console.log(`1. Allez sur http://localhost:5173/products`);
    console.log(`2. Cherchez "${walRef}" dans la barre de recherche`);
    console.log(`3. Cliquez sur le produit`);
    console.log(`4. Allez dans l'onglet "Sous-produits"`);

  } catch (error) {
    console.error('❌ Error:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

createTestData();
