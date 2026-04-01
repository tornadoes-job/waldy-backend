import { Router } from 'express';
import { ProductController } from '../controllers/productController';
import { SupplierController } from '../controllers/supplierController';
import { SectorController } from '../controllers/sectorController';
import { SubProductController } from '../controllers/subProductController';
import { upload } from '../config/cloudinary';

const router = Router();

// =============================================================
// SECTORS
// =============================================================
router.get('/sectors', SectorController.getAll);
router.get('/sectors/:sectorId/categories', SectorController.getCategories);
router.get('/categories', SectorController.getAllCategories);
router.post('/categories', SectorController.createCategory);

// =============================================================
// SUPPLIERS
// =============================================================
router.get('/suppliers', SupplierController.getAll);
router.get('/suppliers/:id', SupplierController.getById);
router.post('/suppliers', SupplierController.create);
router.put('/suppliers/:id', SupplierController.update);
router.delete('/suppliers/:id', SupplierController.delete);

// =============================================================
// PRODUCTS - CRUD + FEATURES
// =============================================================
router.get('/products', ProductController.getAll);
router.get('/products/search-by-code', ProductController.searchByWalCode); // ?code=W/AGR/MIL
router.get('/products/by-category/:categoryId', ProductController.getByCategory); // /W/AGR/MIL
router.get('/products/by-supplier/:supplierCode', ProductController.getBySupplierCode); // /W/FRN-0001
router.get('/products/:id', ProductController.getById);
router.post('/products', upload.single('image'), ProductController.create);
router.put('/products/:id', upload.single('image'), ProductController.update);
router.delete('/products/:id', ProductController.delete);

// Traceability
router.get('/products/:id/trace', ProductController.getTraceability);

// Stock
router.get('/products/:id/stock', ProductController.getStockMovements);
router.post('/products/:id/stock', ProductController.recordStockMovement);

// =============================================================
// SUB-PRODUCTS
// =============================================================
router.post('/products/:productId/sub-products', upload.single('image'), SubProductController.create);
router.put('/sub-products/:id', SubProductController.update);
router.delete('/sub-products/:id', SubProductController.delete);
router.post('/sub-products/:id/stock', SubProductController.recordStock);

export default router;