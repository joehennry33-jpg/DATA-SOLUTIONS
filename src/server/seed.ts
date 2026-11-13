import type { BusinessPaymentConfig, Product } from '../types/safbundle.ts';
import {
  getPaymentConfig,
  listProducts,
  savePaymentConfig,
  saveProduct,
} from './store.ts';

const NOW = new Date().toISOString();

export const SAMPLE_PRODUCTS: Product[] = [
  {
    id: 'sample_daily_250mb',
    name: 'Sample Daily Starter 250MB',
    category: 'daily',
    dataAllocation: '250 MB',
    validityLabel: '24 Hours',
    description: 'Sample quick-browse package for messaging, email, and light social updates.',
    priceKes: 20,
    supplierSku: 'SKU_SAMPLE_DAILY_250MB',
    isActive: true,
    isFeatured: false,
    isSample: true,
    sortOrder: 10,
    updatedAt: NOW,
  },
  {
    id: 'sample_daily_1gb',
    name: 'Sample Daily 1GB Express',
    category: 'daily',
    dataAllocation: '1 GB',
    validityLabel: '24 Hours',
    description: 'Sample all-day bundle suited for remote work calls, maps, and video streaming.',
    priceKes: 99,
    supplierSku: 'SKU_SAMPLE_DAILY_1GB',
    isActive: true,
    isFeatured: true,
    isSample: true,
    sortOrder: 20,
    updatedAt: NOW,
  },
  {
    id: 'sample_daily_2gb',
    name: 'Sample Daily 2GB Pro',
    category: 'daily',
    dataAllocation: '2 GB',
    validityLabel: '24 Hours',
    description: 'Sample high-capacity 24-hour allowance for heavy downloads and HD streaming.',
    priceKes: 150,
    supplierSku: 'SKU_SAMPLE_DAILY_2GB',
    isActive: true,
    isFeatured: false,
    isSample: true,
    sortOrder: 30,
    updatedAt: NOW,
  },
  {
    id: 'sample_weekly_2gb',
    name: 'Sample Weekly 2GB Value',
    category: 'weekly',
    dataAllocation: '2 GB',
    validityLabel: '7 Days',
    description: 'Sample 7-day data plan tailored for steady daily browsing and WhatsApp.',
    priceKes: 250,
    supplierSku: 'SKU_SAMPLE_WEEKLY_2GB',
    isActive: true,
    isFeatured: true,
    isSample: true,
    sortOrder: 40,
    updatedAt: NOW,
  },
  {
    id: 'sample_weekly_6gb',
    name: 'Sample Weekly 6GB Plus',
    category: 'weekly',
    dataAllocation: '6 GB',
    validityLabel: '7 Days',
    description: 'Sample 7-day high-volume bundle for remote meetings and content creation.',
    priceKes: 500,
    supplierSku: 'SKU_SAMPLE_WEEKLY_6GB',
    isActive: true,
    isFeatured: false,
    isSample: true,
    sortOrder: 50,
    updatedAt: NOW,
  },
  {
    id: 'sample_monthly_10gb',
    name: 'Sample Monthly 10GB',
    category: 'monthly',
    dataAllocation: '10 GB',
    validityLabel: '30 Days',
    description: 'Sample 30-day bundle built for reliable month-long smartphone connectivity.',
    priceKes: 1000,
    supplierSku: 'SKU_SAMPLE_MONTHLY_10GB',
    isActive: true,
    isFeatured: true,
    isSample: true,
    sortOrder: 60,
    updatedAt: NOW,
  },
  {
    id: 'sample_monthly_25gb',
    name: 'Sample Monthly 25GB Work',
    category: 'monthly',
    dataAllocation: '25 GB',
    validityLabel: '30 Days',
    description: 'Sample 30-day heavy-duty data plan for hotspot tethering and cloud workflows.',
    priceKes: 2000,
    supplierSku: 'SKU_SAMPLE_MONTHLY_25GB',
    isActive: true,
    isFeatured: false,
    isSample: true,
    sortOrder: 70,
    updatedAt: NOW,
  },
  {
    id: 'sample_special_night_5gb',
    name: 'Sample Special Off-Peak 5GB',
    category: 'special',
    dataAllocation: '5 GB',
    validityLabel: 'Midnight – 6 AM',
    description: 'Sample promotional off-peak data offer for large backups and downloads.',
    priceKes: 75,
    supplierSku: 'SKU_SAMPLE_SPECIAL_NIGHT5GB',
    isActive: true,
    isFeatured: false,
    isSample: true,
    sortOrder: 80,
    updatedAt: NOW,
  },
  {
    id: 'sample_special_weekend_3gb',
    name: 'Sample Weekend Flex 3GB',
    category: 'special',
    dataAllocation: '3 GB',
    validityLabel: 'Fri – Sun',
    description: 'Sample special weekend offer designed for entertainment and travel.',
    priceKes: 180,
    supplierSku: 'SKU_SAMPLE_SPECIAL_WKND3GB',
    isActive: true,
    isFeatured: true,
    isSample: true,
    sortOrder: 90,
    updatedAt: NOW,
  },
  {
    id: 'sample_airtime_50',
    name: 'Sample Airtime Top-Up KES 50',
    category: 'airtime',
    dataAllocation: 'KES 50 Airtime',
    validityLabel: 'Instant Top-Up',
    description: 'Sample Safaricom airtime voucher for calls, SMS, and direct bundle dialing.',
    priceKes: 50,
    supplierSku: 'SKU_SAMPLE_AIRTIME_50',
    isActive: true,
    isFeatured: false,
    isSample: true,
    sortOrder: 100,
    updatedAt: NOW,
  },
  {
    id: 'sample_airtime_100',
    name: 'Sample Airtime Top-Up KES 100',
    category: 'airtime',
    dataAllocation: 'KES 100 Airtime',
    validityLabel: 'Instant Top-Up',
    description: 'Sample Safaricom airtime recharge delivered straight to the recipient line.',
    priceKes: 100,
    supplierSku: 'SKU_SAMPLE_AIRTIME_100',
    isActive: true,
    isFeatured: true,
    isSample: true,
    sortOrder: 110,
    updatedAt: NOW,
  },
  {
    id: 'sample_airtime_500',
    name: 'Sample Airtime Top-Up KES 500',
    category: 'airtime',
    dataAllocation: 'KES 500 Airtime',
    validityLabel: 'Instant Top-Up',
    description: 'Sample high-value Safaricom airtime recharge for personal or team lines.',
    priceKes: 500,
    supplierSku: 'SKU_SAMPLE_AIRTIME_500',
    isActive: true,
    isFeatured: false,
    isSample: true,
    sortOrder: 120,
    updatedAt: NOW,
  },
];

export const DEFAULT_PAYMENT_CONFIG: BusinessPaymentConfig = {
  businessName: 'SafBundle Kenya',
  paymentMode: 'paybill',
  tillNumber: '000000',
  paybillNumber: '000000',
  accountPrefix: 'SB',
  stkPushEnabled: true,
  tillPaybillEnabled: true,
  supportPhone: '+254 700 000 000',
  supportWhatsapp: '+254 700 000 000',
  supportEmail: 'support@safbundle.co.ke',
  sampleNotice:
    'Development sample catalog: Prices and packages shown are sample placeholders for testing. Configure your live supplier SKUs and Daraja credentials before production launch.',
  updatedAt: NOW,
};

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
