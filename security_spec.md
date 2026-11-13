# SafBundle Security Specification (Payload-First TDD)

## 1. Data Invariants

1. **Zero Public PII Exposure**: Collections containing Kenyan phone numbers (`customers`, `orders`, `payments`, `supplierTransactions`, `paymentCallbackRecords`) MUST NEVER be readable or listable from unauthenticated or non-admin client SDK calls. Customer order tracking is mediated exclusively via server-side `/api/orders/track` requiring both `orderRef` and matching `recipientPhone` or cryptographic `trackingToken`.
2. **Server-Side Payment Authority**: No client can write directly to `orders`, `payments`, `supplierTransactions`, or `paymentCallbackRecords`. Orders are marked `paid` exclusively by server-side Daraja webhook verification (`stk-callback` or `c2b-confirmation`).
3. **No Self-Assigned Admin Privileges**: Users cannot create or modify `/admins/{uid}` documents via the client SDK. Admin identity is verified via `request.auth.token.email_verified == true` against bootstrapped admin email (`joehennry33@gmail.com`) or existing `/admins/{uid}` documents.
4. **Catalog & Config Integrity**: Only verified admins can mutate `/products/{productId}` or `/settings/paymentConfig`. Every string field has strict `.size()` bounds and document IDs match `^[a-zA-Z0-9_\-]+$`.
5. **No M-Pesa PIN Storage**: M-Pesa PINs are never requested, transmitted, or stored in any entity.

## 2. The "Dirty Dozen" Attack Payloads

1. **Unauthenticated Order List Scrape**: `list /orders` without auth -> `PERMISSION_DENIED`.
2. **Authenticated Non-Admin Customer Scrape**: `get /customers/254712345678` as a signed-in non-admin user -> `PERMISSION_DENIED`.
3. **Client-Side Order Forgery**: `create /orders/fake_order` with `paymentStatus: 'paid'` -> `PERMISSION_DENIED`.
4. **Client-Side Status Escalation**: `update /orders/ord_1` changing `paymentStatus` from `'pending'` to `'paid'` -> `PERMISSION_DENIED`.
5. **Self-Admin Privilege Escalation**: `create /admins/attacker_uid` with `role: 'super_admin'` -> `PERMISSION_DENIED`.
6. **Email Spoofing Admin Bypass**: Read `/orders` with `email: 'joehennry33@gmail.com'` and `email_verified: false` -> `PERMISSION_DENIED`.
7. **Shadow Field Injection on Product**: Admin `create /products/prod_1` with extra ghost field `secretDiscount: true` -> `PERMISSION_DENIED`.
8. **ID Poisoning Attack**: `create /products/<1.5KB_junk_id>` -> `PERMISSION_DENIED`.
9. **Resource Exhaustion Description**: `create /products/prod_2` with 10KB `description` string -> `PERMISSION_DENIED`.
10. **Fake Payment Callback Injection**: `create /paymentCallbackRecords/cb_1` from client SDK -> `PERMISSION_DENIED`.
11. **Public Settings Tampering**: Unauthenticated or non-admin `update /settings/paymentConfig` changing `tillNumber` to attacker Till -> `PERMISSION_DENIED`.
12. **Supplier Transaction Forgery**: `create /supplierTransactions/tx_1` from client SDK -> `PERMISSION_DENIED`.
