-- =============================================================================
-- SafBundle — Complete Supabase / PostgreSQL Schema
-- Includes tables, constraints, indexes, triggers, and Row Level Security (RLS)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ADMINISTRATORS
CREATE TABLE IF NOT EXISTS public.administrators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. CUSTOMERS
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_msisdn TEXT NOT NULL UNIQUE CHECK (phone_msisdn ~ '^254[17][0-9]{8}$'),
  total_orders INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
  total_spent_kes NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (total_spent_kes >= 0),
  last_order_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone_msisdn ON public.customers (phone_msisdn);

-- 3. PRODUCTS (Bundles & Airtime)
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('daily', 'weekly', 'monthly', 'special', 'airtime')),
  data_allocation TEXT,
  validity_label TEXT,
  description TEXT,
  price_kes NUMERIC(10, 2) NOT NULL CHECK (price_kes >= 1 AND price_kes <= 100000),
  supplier_sku TEXT NOT NULL UNIQUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_featured BOOLEAN NOT NULL DEFAULT FALSE,
  is_sample BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_products_category_active ON public.products (category, is_active, sort_order);

-- 4. ORDERS
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_ref TEXT NOT NULL UNIQUE,
  tracking_token TEXT NOT NULL UNIQUE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE RESTRICT,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  product_name_snapshot TEXT NOT NULL,
  category_snapshot TEXT NOT NULL CHECK (category_snapshot IN ('daily', 'weekly', 'monthly', 'special', 'airtime')),
  supplier_sku_snapshot TEXT NOT NULL,
  recipient_phone TEXT NOT NULL CHECK (recipient_phone ~ '^254[17][0-9]{8}$'),
  mpesa_phone TEXT CHECK (mpesa_phone IS NULL OR mpesa_phone ~ '^254[17][0-9]{8}$'),
  amount_kes NUMERIC(10, 2) NOT NULL CHECK (amount_kes >= 1),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('stk_push', 'till_paybill')),
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN ('pending', 'initiated', 'paid', 'failed', 'cancelled')),
  delivery_status TEXT NOT NULL DEFAULT 'awaiting_payment' CHECK (delivery_status IN ('awaiting_payment', 'pending', 'processing', 'delivered', 'failed')),
  mpesa_receipt_number TEXT UNIQUE,
  checkout_request_id TEXT UNIQUE,
  customer_submitted_ref TEXT,
  failure_reason TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_orders_order_ref ON public.orders (order_ref);
CREATE INDEX IF NOT EXISTS idx_orders_recipient_phone ON public.orders (recipient_phone);
CREATE INDEX IF NOT EXISTS idx_orders_status ON public.orders (payment_status, delivery_status, created_at DESC);

-- 5. PAYMENTS
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  method TEXT NOT NULL CHECK (method IN ('stk_push', 'till_paybill')),
  payer_phone TEXT,
  amount_kes NUMERIC(10, 2) NOT NULL CHECK (amount_kes >= 1),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'initiated', 'paid', 'failed', 'cancelled')),
  merchant_request_id TEXT,
  checkout_request_id TEXT UNIQUE,
  mpesa_receipt_number TEXT UNIQUE,
  customer_submitted_ref TEXT,
  result_code TEXT,
  result_desc TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments (order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments (status, created_at DESC);

-- 6. SUPPLIER TRANSACTIONS
CREATE TABLE IF NOT EXISTS public.supplier_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL CHECK (recipient_phone ~ '^254[17][0-9]{8}$'),
  supplier_sku TEXT NOT NULL,
  amount_kes NUMERIC(10, 2) NOT NULL CHECK (amount_kes >= 1),
  status TEXT NOT NULL CHECK (status IN ('pending_configuration', 'processing', 'delivered', 'failed')),
  supplier_reference TEXT UNIQUE,
  response_message TEXT,
  attempt_number INTEGER NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate active/delivered supplier fulfillments per order
CREATE UNIQUE INDEX IF NOT EXISTS idx_supplier_tx_unique_active_order
  ON public.supplier_transactions (order_id)
  WHERE status IN ('processing', 'delivered');

-- 7. PAYMENT CALLBACK RECORDS (Idempotency & Audit Ledger)
CREATE TABLE IF NOT EXISTS public.payment_callback_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  callback_type TEXT NOT NULL CHECK (callback_type IN ('stk_callback', 'c2b_validation', 'c2b_confirmation')),
  idempotency_key TEXT NOT NULL UNIQUE,
  checkout_request_id TEXT,
  trans_id TEXT,
  amount_kes NUMERIC(10, 2),
  result_code TEXT,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT FALSE,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_callbacks_received_at ON public.payment_callback_records (received_at DESC);

-- 8. BUSINESS SETTINGS
CREATE TABLE IF NOT EXISTS public.business_settings (
  id TEXT PRIMARY KEY DEFAULT 'paymentConfig',
  business_name TEXT NOT NULL DEFAULT 'SafBundle Kenya',
  payment_mode TEXT NOT NULL DEFAULT 'till' CHECK (payment_mode IN ('till', 'paybill')),
  till_number TEXT,
  paybill_number TEXT,
  account_prefix TEXT DEFAULT 'SB',
  stk_push_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  till_paybill_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  support_phone TEXT,
  support_whatsapp TEXT,
  support_email TEXT NOT NULL,
  sample_notice TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

ALTER TABLE public.administrators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_callback_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_settings ENABLE ROW LEVEL SECURITY;

-- Helper function checking active admin membership
CREATE OR REPLACE FUNCTION public.is_active_admin()
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.administrators
    WHERE auth_user_id = auth.uid() AND is_active = TRUE
  );
$$;

-- Public can view active products & non-secret business payment instructions
CREATE POLICY "Public can read active products"
  ON public.products FOR SELECT
  USING (is_active = TRUE OR public.is_active_admin());

CREATE POLICY "Admins manage products"
  ON public.products FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

CREATE POLICY "Public can read business payment settings"
  ON public.business_settings FOR SELECT
  USING (TRUE);

CREATE POLICY "Admins manage business settings"
  ON public.business_settings FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());

-- Strict zero-public-access for PII & financial tables (Server Service Role bypasses RLS)
CREATE POLICY "Admins read orders"
  ON public.orders FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "Admins read customers"
  ON public.customers FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "Admins read payments"
  ON public.payments FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "Admins read supplier transactions"
  ON public.supplier_transactions FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "Admins read callback records"
  ON public.payment_callback_records FOR SELECT
  USING (public.is_active_admin());

CREATE POLICY "Admins read administrators"
  ON public.administrators FOR SELECT
  USING (public.is_active_admin());

-- 9. CONTACT MESSAGES (Customer Support Inquiries)
CREATE TABLE IF NOT EXISTS public.contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_ref TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  topic TEXT NOT NULL CHECK (topic IN ('order_issue', 'mpesa_payment', 'bundle_delivery', 'partnership', 'general')),
  order_ref TEXT,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON public.contact_messages (status, created_at DESC);

ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage contact messages"
  ON public.contact_messages FOR ALL
  USING (public.is_active_admin())
  WITH CHECK (public.is_active_admin());
