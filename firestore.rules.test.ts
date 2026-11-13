/**
 * SafBundle Security Rules Verification Suite (Dirty Dozen Adversarial Payloads)
 * Documents and validates the 12 security invariants enforced by firestore.rules.
 */

export interface SecurityTestCase {
  id: number;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expectedOutcome: 'PERMISSION_DENIED';
  rationale: string;
}

export const DIRTY_DOZEN_TESTS: SecurityTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Order List Scrape',
    collection: '/orders',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Orders contain customer phone numbers (PII) and are restricted to verified admins.',
  },
  {
    id: 2,
    name: 'Non-Admin Customer PII Read',
    collection: '/customers/254712345678',
    operation: 'get',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Customer records require isAdmin().',
  },
  {
    id: 3,
    name: 'Client-Side Order Forgery',
    collection: '/orders/fake_order',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'All order writes are blocked on client SDK (allow write: if false) and handled by server Admin SDK.',
  },
  {
    id: 4,
    name: 'Client-Side Payment Status Escalation',
    collection: '/orders/ord_1',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Clients cannot mark orders as paid or delivered.',
  },
  {
    id: 5,
    name: 'Self-Admin Privilege Escalation',
    collection: '/admins/attacker_uid',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: '/admins allows no client-side writes.',
  },
  {
    id: 6,
    name: 'Unverified Email Admin Spoof',
    collection: '/orders',
    operation: 'list',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isSignedIn() strictly enforces request.auth.token.email_verified == true.',
  },
  {
    id: 7,
    name: 'Shadow Field Injection on Product',
    collection: '/products/prod_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isValidProduct() enforces keys().hasOnly(...) to block unknown fields.',
  },
  {
    id: 8,
    name: 'ID Poisoning (1.5KB Document ID)',
    collection: '/products/' + 'a'.repeat(1500),
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isValidId() enforces id.size() <= 128 and regex ^[a-zA-Z0-9_\\-]+$.',
  },
  {
    id: 9,
    name: 'Resource Exhaustion Product Description',
    collection: '/products/prod_2',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'isValidProduct() enforces description.size() <= 400.',
  },
  {
    id: 10,
    name: 'Client Payment Callback Forgery',
    collection: '/paymentCallbackRecords/cb_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Callback records are server-only.',
  },
  {
    id: 11,
    name: 'Public Till Number Tampering',
    collection: '/settings/paymentConfig',
    operation: 'update',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Only verified admins can update business payment settings.',
  },
  {
    id: 12,
    name: 'Supplier Transaction Forgery',
    collection: '/supplierTransactions/tx_1',
    operation: 'create',
    expectedOutcome: 'PERMISSION_DENIED',
    rationale: 'Supplier fulfillment records are server-only.',
  },
];
