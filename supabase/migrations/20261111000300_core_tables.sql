-- Core business tables (09 §2): products & stock, purchases, sales,
-- customers & credit, expenses & cash, daily closing, subscription, audit.
-- Composite foreign keys (child.x_id, child.business_id) -> parent(id, business_id)
-- make cross-business references impossible (09 §4.4).

-- ===========================================================================
-- Products, cost and stock
-- ===========================================================================
create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, business_id)
);
create unique index categories_name_uq on public.categories (business_id, lower(btrim(name))) where deleted_at is null;

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  name            text not null check (char_length(btrim(name)) between 1 and 100),
  category_id     uuid,
  unit            text check (unit is null or char_length(unit) <= 30),
  selling_price   bigint not null check (selling_price > 0 and selling_price <= 100000000),
  stock_qty       integer not null default 0,                 -- may be negative (approved rule)
  stock_value     bigint not null default 0,                  -- value pool, pesewas (05 C-20)
  cost_known      boolean not null default false,
  low_stock_level integer not null default 5 check (low_stock_level >= 0),
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  unique (id, business_id),
  foreign key (category_id, business_id) references public.categories (id, business_id)
);
create unique index products_name_uq on public.products (business_id, lower(btrim(name))) where deleted_at is null;

create table public.product_cost_history (       -- 05 C-22
  id                uuid primary key default gen_random_uuid(),
  business_id       uuid not null references public.businesses (id) on delete cascade,
  product_id        uuid not null,
  effective_at      timestamptz not null default now(),
  stock_qty_after   integer not null,
  stock_value_after bigint not null,
  avg_cost          numeric(18,4) check (avg_cost is null or avg_cost >= 0),
  cause             text not null check (cause in ('opening','restock','sale','void','adjustment',
                                                   'cost_adjustment','set_cost','purchase_correction','supplier_return')),
  movement_id       uuid,
  created_at        timestamptz not null default now(),
  foreign key (product_id, business_id) references public.products (id, business_id)
);
create index product_cost_history_lookup_idx on public.product_cost_history (product_id, effective_at);

-- ===========================================================================
-- Purchases and supplier credit (05 §12)
-- ===========================================================================
create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  product_id    uuid not null,
  movement_id   uuid,
  qty           integer not null check (qty > 0),
  purchase_cost bigint not null check (purchase_cost >= 0),            -- full acquisition cost
  paid_now      bigint not null default 0 check (paid_now >= 0),
  paid_now_from text check (paid_now_from in ('cash_drawer','momo','other')),
  supplier_name text check (supplier_name is null or char_length(supplier_name) <= 100),
  purchased_on  date not null,
  note          text check (note is null or char_length(note) <= 300),
  user_id       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (paid_now <= purchase_cost),                                   -- 09 §4.4
  check (paid_now = 0 or paid_now_from is not null),
  unique (id, business_id),
  foreign key (product_id, business_id) references public.products (id, business_id)
);

create table public.supplier_payments (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  purchase_id uuid not null,
  amount      bigint not null check (amount > 0),
  paid_from   text not null check (paid_from in ('cash_drawer','momo','other')),
  paid_on     date not null,
  note        text check (note is null or char_length(note) <= 300),
  user_id     uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  foreign key (purchase_id, business_id) references public.purchases (id, business_id)
);

create table public.purchase_corrections (
  id                    uuid primary key default gen_random_uuid(),
  business_id           uuid not null references public.businesses (id) on delete cascade,
  purchase_id           uuid not null,
  type                  text not null check (type in ('cost','quantity')),
  qty_change            integer not null default 0,
  cost_change           bigint not null default 0,
  reason                text not null check (char_length(btrim(reason)) between 1 and 300),
  allocation            jsonb,                     -- shares and pesewa amounts (05 C-116b)
  allocation_exact      boolean,                   -- false = approximate (flagged, owner condition)
  approximation_reasons text[],                    -- e.g. {late_upload, void, negative_stock}
  refund_amount         bigint not null default 0 check (refund_amount >= 0),
  refund_method         text check (refund_method in ('cash','momo')),
  user_id               uuid references auth.users (id) on delete set null,
  created_at            timestamptz not null default now(),
  check ((type = 'cost' and qty_change = 0 and cost_change <> 0)
      or (type = 'quantity' and cost_change = 0 and qty_change <> 0)),
  check (type <> 'cost' or (allocation is not null and allocation_exact is not null)),
  check (allocation_exact is distinct from false or coalesce(cardinality(approximation_reasons), 0) > 0),
  check (refund_amount = 0 or refund_method is not null),
  foreign key (purchase_id, business_id) references public.purchases (id, business_id)
);

create table public.supplier_returns (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  product_id    uuid not null,
  movement_id   uuid,
  qty           integer not null check (qty > 0),
  value_removed bigint not null,
  credit_amount bigint not null check (credit_amount >= 0),
  credit_type   text not null check (credit_type in ('refund_cash','refund_momo','reduce_unpaid')),
  purchase_id   uuid,
  reason        text not null check (char_length(btrim(reason)) between 1 and 300),
  user_id       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (credit_type <> 'reduce_unpaid' or purchase_id is not null),
  foreign key (product_id, business_id) references public.products (id, business_id),
  foreign key (purchase_id, business_id) references public.purchases (id, business_id)
);

-- ===========================================================================
-- Customers and credit (05 §7)
-- ===========================================================================
create table public.customers (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  name         text not null check (char_length(btrim(name)) between 1 and 100),
  phone        text check (phone is null or phone ~ '^(\+233|0)[0-9]{9}$'),
  credit_limit bigint check (credit_limit is null or credit_limit >= 0),
  note         text check (note is null or char_length(note) <= 300),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  unique (id, business_id)
);

-- ===========================================================================
-- Sales (09 §2 "Sales")
-- ===========================================================================
create table public.sales (
  id                 uuid primary key,                     -- generated on the phone; duplicate prevention
  business_id        uuid not null references public.businesses (id) on delete cascade,
  device_id          uuid not null,
  receipt_no         text not null check (receipt_no ~ '^[A-Z]{1,3}-[0-9]{6,}$'),
  status             text not null default 'recorded' check (status in ('recorded','voided','cancelled_unsent')),
  subtotal           bigint not null check (subtotal >= 0),
  discount           bigint not null default 0 check (discount >= 0),
  total              bigint not null check (total >= 0),
  payment_method     text not null check (payment_method in ('cash','momo','credit')),
  momo_reference     varchar(30),
  customer_id        uuid,
  paid_now_amount    bigint not null default 0 check (paid_now_amount >= 0),
  paid_now_method    text check (paid_now_method in ('cash','momo')),
  created_offline    boolean not null default false,
  mode               text not null check (mode in ('online','offline')),
  occurred_at_device timestamptz not null,
  occurred_at        timestamptz not null,                 -- best estimate (05 §3.6)
  device_elapsed_ms  bigint check (device_elapsed_ms is null or device_elapsed_ms >= 0),
  boot_id            text check (boot_id is null or char_length(boot_id) <= 64),
  sequence_no        bigint check (sequence_no is null or sequence_no > 0),
  anchor_id          uuid,
  time_lower_bound   timestamptz,
  time_upper_bound   timestamptz,
  time_confidence    text not null check (time_confidence in ('high','medium','low')),
  time_check         jsonb,
  received_at        timestamptz not null default now(),
  cost_basis         text not null check (cost_basis in ('occurred_at','received_at')),
  payload_version    integer not null check (payload_version >= 1),
  voided_at          timestamptz,
  void_reason        text check (void_reason is null or char_length(void_reason) <= 300),
  cancelled_at       timestamptz,
  cancel_reason      text check (cancel_reason is null or char_length(cancel_reason) <= 100),
  cancel_note        text check (cancel_note is null or char_length(cancel_note) <= 300),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  check (discount <= subtotal),
  check (total = subtotal - discount),
  check (payment_method <> 'credit' or customer_id is not null),
  check (paid_now_amount = 0 or (payment_method = 'credit' and paid_now_method is not null and paid_now_amount < total)),
  check (status <> 'voided' or (voided_at is not null and void_reason is not null)),
  check (status <> 'cancelled_unsent' or (cancelled_at is not null and cancel_reason is not null)),
  check (time_lower_bound is null or time_upper_bound is null or time_lower_bound <= time_upper_bound),
  check (time_confidence <> 'low' or cost_basis = 'received_at'),           -- 05 C-96
  unique (business_id, receipt_no),                                         -- 09 §4.4
  unique (id, business_id),
  foreign key (device_id, business_id) references public.devices (id, business_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  foreign key (anchor_id, business_id) references public.device_anchors (id, business_id)
);
create unique index sales_device_sequence_uq on public.sales (device_id, sequence_no) where sequence_no is not null;
create index sales_business_occurred_idx on public.sales (business_id, occurred_at);

create table public.sale_items (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  sale_id             uuid not null,
  product_id          uuid not null,
  qty                 integer not null check (qty > 0),
  unit_price          bigint not null check (unit_price >= 0),
  line_total          bigint not null,
  unit_cost           numeric(18,4) not null check (unit_cost >= 0),
  device_unit_cost    numeric(18,4) check (device_unit_cost is null or device_unit_cost >= 0),
  avg_at_upload       numeric(18,4),
  line_cost           bigint not null check (line_cost >= 0),
  cost_missing        boolean not null default false,
  cost_basis_adjusted boolean not null default false,
  created_at          timestamptz not null default now(),
  check (line_total = qty * unit_price),
  check (not cost_missing or (unit_cost = 0 and line_cost = 0)),
  foreign key (sale_id, business_id) references public.sales (id, business_id) on delete cascade,
  foreign key (product_id, business_id) references public.products (id, business_id)
);
create index sale_items_sale_idx on public.sale_items (sale_id);

create table public.customer_ledger (             -- 05 §7.1
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  customer_id     uuid not null,
  type            text not null check (type in ('credit_sale','repayment','adjustment','write_off','write_off_undo','void_reversal')),
  amount          bigint not null check (amount <> 0),
  method          text check (method in ('cash','momo')),
  momo_reference  varchar(30),
  sale_id         uuid,
  undoes_entry_id uuid,
  reason          text check (reason is null or char_length(reason) <= 300),
  user_id         uuid references auth.users (id) on delete set null,
  occurred_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  check (type not in ('credit_sale','write_off_undo') or amount > 0),
  check (type not in ('repayment','write_off','void_reversal') or amount < 0),
  check (type <> 'repayment' or method is not null),
  check (type not in ('credit_sale','void_reversal') or sale_id is not null),
  check (type <> 'write_off_undo' or undoes_entry_id is not null),
  check (type not in ('adjustment','write_off','write_off_undo') or reason is not null),
  unique (id, business_id),
  foreign key (customer_id, business_id) references public.customers (id, business_id),
  foreign key (sale_id, business_id) references public.sales (id, business_id),
  foreign key (undoes_entry_id, business_id) references public.customer_ledger (id, business_id)
);
create index customer_ledger_customer_idx on public.customer_ledger (customer_id);

create table public.debt_recoveries (              -- 05 C-77
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  customer_id    uuid not null,
  amount         bigint not null check (amount > 0),
  method         text not null check (method in ('cash','momo')),
  momo_reference varchar(30),
  note           text check (note is null or char_length(note) <= 300),
  user_id        uuid references auth.users (id) on delete set null,
  occurred_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  foreign key (customer_id, business_id) references public.customers (id, business_id)
);

-- ===========================================================================
-- Stock movements and discrepancies (after purchases and sales exist)
-- ===========================================================================
create table public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  product_id  uuid not null,
  type        text not null check (type in ('opening','restock','purchase_correction','supplier_return','sale',
                                            'void','adjustment','cost_adjustment','value_correction')),
  qty_change  integer not null,
  value       bigint not null,                -- exact signed change to products.stock_value (05 C-21)
  unit_cost   numeric(18,4),
  reason      text,
  purchase_id uuid,
  sale_id     uuid,
  note        text check (note is null or char_length(note) <= 300),
  user_id     uuid references auth.users (id) on delete set null,
  occurred_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  check (type <> 'adjustment' or reason in ('damaged','expired','missing','own_use','count_correction','other')),
  check (type <> 'cost_adjustment' or reason in ('negative_stock_revaluation','zero_stock_residue','negative_value_correction',
                                                  'supplier_return_difference','purchase_correction_after_sale')),
  check (type not in ('adjustment','cost_adjustment') or reason is not null),
  check (type in ('adjustment','cost_adjustment') or reason is null),
  check (type not in ('cost_adjustment','value_correction') or qty_change = 0),
  check (type not in ('restock','opening') or qty_change > 0),
  check (type <> 'sale' or (qty_change < 0 and sale_id is not null)),
  check (type <> 'void' or (qty_change > 0 and sale_id is not null)),
  check (type <> 'restock' or purchase_id is not null),
  unique (id, business_id),
  foreign key (product_id, business_id) references public.products (id, business_id),
  foreign key (purchase_id, business_id) references public.purchases (id, business_id),
  foreign key (sale_id, business_id) references public.sales (id, business_id)
);
create index stock_movements_product_idx on public.stock_movements (product_id, created_at);

alter table public.product_cost_history
  add foreign key (movement_id, business_id) references public.stock_movements (id, business_id);
alter table public.purchases
  add foreign key (movement_id, business_id) references public.stock_movements (id, business_id);
alter table public.supplier_returns
  add foreign key (movement_id, business_id) references public.stock_movements (id, business_id);

create table public.stock_discrepancies (
  id                      uuid primary key default gen_random_uuid(),
  business_id             uuid not null references public.businesses (id) on delete cascade,
  product_id              uuid not null,
  sale_id                 uuid not null,
  shortfall_qty           integer not null check (shortfall_qty > 0),
  status                  text not null default 'open' check (status in ('open','resolved')),
  resolution              text check (resolution in ('adjustment','sale_voided')),
  resolved_by_movement_id uuid,
  resolved_at             timestamptz,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (status <> 'resolved' or (resolution is not null and resolved_at is not null)),
  foreign key (product_id, business_id) references public.products (id, business_id),
  foreign key (sale_id, business_id) references public.sales (id, business_id),
  foreign key (resolved_by_movement_id, business_id) references public.stock_movements (id, business_id)
);

create table public.attention_items (                -- 05 C-120 – C-126
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references public.businesses (id) on delete cascade,
  type            text not null check (type in ('negative_stock','cost_adjustment','cost_check','cost_missing',
                                                'time_uncertain','closed_day_changed','stock_discrepancy',
                                                'purchase_correction')),
  entity          text not null check (char_length(entity) <= 40),
  entity_id       uuid,
  message_data    jsonb not null,
  status          text not null default 'open' check (status in ('open','acknowledged','resolved')),
  acknowledged_by uuid references auth.users (id) on delete set null,
  acknowledged_at timestamptz,
  resolved_ref    uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (status <> 'acknowledged' or (acknowledged_by is not null and acknowledged_at is not null))
);
create index attention_items_open_idx on public.attention_items (business_id) where status = 'open';

-- ===========================================================================
-- Expenses, cash counts, daily closing (05 §8, §11)
-- ===========================================================================
create table public.expense_categories (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  deleted_at  timestamptz,
  unique (id, business_id)
);
create unique index expense_categories_name_uq on public.expense_categories (business_id, lower(btrim(name))) where deleted_at is null;

create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references public.businesses (id) on delete cascade,
  category_id  uuid not null,
  amount       bigint not null check (amount > 0 and amount <= 100000000),
  paid_from    text not null check (paid_from in ('cash_drawer','momo','other')),
  expense_date date not null,
  note         text check (note is null or char_length(note) <= 300),
  user_id      uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  foreign key (category_id, business_id) references public.expense_categories (id, business_id)
);

create table public.cash_counts (                  -- the original count only; recounts are day adjustments
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references public.businesses (id) on delete cascade,
  count_date    date not null,
  opening_cash  bigint not null check (opening_cash >= 0),
  expected_cash bigint not null,
  counted_cash  bigint not null check (counted_cash >= 0),
  difference    bigint not null,
  note          text check (note is null or char_length(note) <= 300),
  user_id       uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  check (difference = counted_cash - expected_cash),
  unique (business_id, count_date)                 -- 09 §4.4
);

create table public.day_closings (                 -- original closing, immutable (05 C-100)
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  day                 date not null,
  closed_at           timestamptz not null default now(),
  closed_by           uuid references auth.users (id) on delete set null,
  figures             jsonb not null,
  included_record_ids jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  unique (business_id, day),                       -- 09 §4.4
  unique (id, business_id)
);

create table public.day_adjustments (              -- 05 C-101, C-102
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references public.businesses (id) on delete cascade,
  closing_id     uuid not null,
  type           text not null check (type in ('late_sale','void','cancellation','backdated_expense',
                                               'backdated_payment','backdated_supplier_payment','cash_recount')),
  source_ref     uuid,
  figure_changes jsonb not null,
  occurred_at    timestamptz not null,
  recorded_at    timestamptz not null default now(),
  user_id        uuid references auth.users (id) on delete set null,
  foreign key (closing_id, business_id) references public.day_closings (id, business_id)
);

-- ===========================================================================
-- Subscription, audit, idempotency
-- ===========================================================================
create table public.subscriptions (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null unique references public.businesses (id) on delete cascade,
  plan        text not null check (plan in ('starter','standard','plus','pilot')),
  status      text not null check (status in ('pilot','trial','active','overdue')),
  paid_until  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.subscription_payments (
  id                  uuid primary key default gen_random_uuid(),
  business_id         uuid not null references public.businesses (id) on delete cascade,
  amount              bigint not null check (amount > 0),
  momo_transaction_id text not null unique,          -- 09 §4.4
  payer_number        text,
  confirmed_by        text not null,                 -- admin identity (SEC-16)
  paid_at             timestamptz not null,
  created_at          timestamptz not null default now()
);

create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid references public.businesses (id) on delete cascade,
  user_id     uuid references auth.users (id) on delete set null,
  device_id   uuid,
  action      text not null check (char_length(action) <= 60),
  entity      text not null check (char_length(entity) <= 40),
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  reason      text check (reason is null or char_length(reason) <= 300),
  created_at  timestamptz not null default now()
);
create index audit_log_business_idx on public.audit_log (business_id, created_at);

-- Idempotency (09 §4.3). Implementation note: request_id is unique on its own
-- (stricter than the (business_id, request_id) pair in 09 §4.4, so requests that
-- create a business, before any business_id exists, are covered too). A stored
-- result is returned only to the same user and function.
create table public.request_log (
  id            uuid primary key default gen_random_uuid(),
  request_id    uuid not null unique,
  business_id   uuid references public.businesses (id) on delete cascade,
  user_id       uuid not null references auth.users (id) on delete cascade,
  function_name text not null,
  result        jsonb,
  created_at    timestamptz not null default now()
);
