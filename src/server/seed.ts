import { DEFAULT_PAYMENT_CONFIG, SAMPLE_PRODUCTS } from '../lib/sampleCatalog.ts';
import {
  getPaymentConfig,
  listProducts,
  savePaymentConfig,
  saveProduct,
} from './store.ts';

export { DEFAULT_PAYMENT_CONFIG, SAMPLE_PRODUCTS };

let seedPromise: Promise<void> | null = null;

export async function ensureSeededDatabase(): Promise<void> {
  if (seedPromise) return seedPromise;

  seedPromise = (async () => {
    try {
      const existingProducts = await listProducts(false);
      if (existingProducts.length === 0) {
        for (const product of SAMPLE_PRODUCTS) {
          await saveProduct(product);
        }
      }

      const existingConfig = await getPaymentConfig();
      if (!existingConfig) {
        await savePaymentConfig(DEFAULT_PAYMENT_CONFIG);
      }
    } catch (error) {
      console.error('Database seed warning:', error);
      seedPromise = null;
    }
  })();

  return seedPromise;
}
