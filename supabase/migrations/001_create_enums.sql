-- Migration 001: Create Enum Types
-- Defines all enumerated types used across the database to enforce data integrity.

-- Product and Vehicle Classifications
CREATE TYPE public.product_type AS ENUM (
  'vehicle',
  'accessory'
);

CREATE TYPE public.vehicle_type AS ENUM (
  'car',
  'bike'
);

-- Order and Payment Workflows
CREATE TYPE public.order_status AS ENUM (
  'Created',
  'Paid',
  'Shipped',
  'Completed',
  'Cancelled'
);

CREATE TYPE public.payment_status AS ENUM (
  'Unpaid',
  'Paid',
  'Refunded'
);

-- Test Drive Bookings
CREATE TYPE public.booking_status AS ENUM (
  'Pending',
  'Confirmed',
  'Completed',
  'Cancelled'
);

-- Inventory Management
CREATE TYPE public.inventory_transaction_type AS ENUM (
  'Restock',
  'Sale',
  'Adjustment',
  'Return'
);

-- Customer and User State
CREATE TYPE public.customer_status AS ENUM (
  'Active',
  'Inactive'
);

CREATE TYPE public.user_role AS ENUM (
  'admin',
  'customer'
);

-- Promotions
CREATE TYPE public.promotion_type AS ENUM (
  'percentage',
  'fixed_amount'
);
