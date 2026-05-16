-- FreelanceOS Phase 4-7 + document automation tables.
-- Run this in Supabase SQL editor after checking existing table names.

create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  item_name text not null,
  quantity integer not null default 0,
  unit_cost numeric,
  low_stock_threshold integer not null default 5,
  category text,
  created_at timestamptz not null default now()
);

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  category text not null,
  amount numeric not null,
  gst_amount numeric,
  date date,
  description text,
  receipt_url text,
  created_at timestamptz not null default now()
);

create table if not exists team_members (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text,
  payout_rate numeric,
  payout_type text default 'fixed',
  status text default 'active',
  created_at timestamptz not null default now()
);

create table if not exists work_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  team_member_id uuid references team_members(id) on delete set null,
  task_id uuid references tasks(id) on delete cascade,
  project_id uuid references projects(id) on delete cascade,
  title text,
  status text default 'assigned',
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists payouts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  team_member_id uuid references team_members(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  amount numeric not null,
  status text default 'owed',
  due_date date,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists invoice_templates (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  name text not null default 'Default',
  accent_color text default '#7c3aed',
  logo_url text,
  payment_terms text,
  footer_note text,
  default_email_subject text,
  default_email_message text,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ai_documents (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  document_type text not null check (document_type in ('contract', 'legal_notice')),
  title text not null,
  status text not null default 'draft',
  question_answers jsonb not null default '{}'::jsonb,
  content text not null,
  recipient_email text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists payment_links (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  invoice_id uuid references invoices(id) on delete cascade,
  provider text not null default 'razorpay',
  provider_payment_link_id text,
  url text,
  amount numeric,
  status text default 'created',
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table inventory enable row level security;
alter table expenses enable row level security;
alter table team_members enable row level security;
alter table work_assignments enable row level security;
alter table payouts enable row level security;
alter table invoice_templates enable row level security;
alter table ai_documents enable row level security;
alter table payment_links enable row level security;

create policy "inventory owner access" on inventory for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "expenses owner access" on expenses for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "team owner access" on team_members for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "assignments owner access" on work_assignments for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "payouts owner access" on payouts for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "invoice templates owner access" on invoice_templates for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "ai documents owner access" on ai_documents for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);
create policy "payment links owner access" on payment_links for all using (auth.uid()::text = user_id) with check (auth.uid()::text = user_id);

create index if not exists inventory_user_idx on inventory(user_id);
create index if not exists expenses_user_date_idx on expenses(user_id, date);
create index if not exists team_members_user_idx on team_members(user_id);
create index if not exists payouts_user_status_idx on payouts(user_id, status);
create index if not exists invoice_templates_user_idx on invoice_templates(user_id);
create index if not exists ai_documents_user_type_idx on ai_documents(user_id, document_type);
create index if not exists payment_links_invoice_idx on payment_links(invoice_id);
