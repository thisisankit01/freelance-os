-- Clear test/demo clients for one user after you finish testing imports.
-- Replace the Clerk user id below before running in Supabase SQL editor.
-- This removes dependent demo data first where needed, then deletes clients.

begin;

-- 1. Set this to the user whose demo clients you want to clear.
-- Example: select 'user_abc123' as target_user_id;
with target as (
  select 'REPLACE_WITH_CLERK_USER_ID'::text as user_id
),
target_clients as (
  select id
  from clients
  where user_id = (select user_id from target)
),
target_invoices as (
  select id
  from invoices
  where user_id = (select user_id from target)
     or client_id in (select id from target_clients)
)
delete from payment_links
where invoice_id in (select id from target_invoices);

with target as (
  select 'REPLACE_WITH_CLERK_USER_ID'::text as user_id
),
target_clients as (
  select id
  from clients
  where user_id = (select user_id from target)
),
target_invoices as (
  select id
  from invoices
  where user_id = (select user_id from target)
     or client_id in (select id from target_clients)
)
delete from invoice_items
where invoice_id in (select id from target_invoices);

with target as (
  select 'REPLACE_WITH_CLERK_USER_ID'::text as user_id
),
target_clients as (
  select id
  from clients
  where user_id = (select user_id from target)
)
delete from ai_documents
where user_id = (select user_id from target)
   or client_id in (select id from target_clients);

with target as (
  select 'REPLACE_WITH_CLERK_USER_ID'::text as user_id
),
target_clients as (
  select id
  from clients
  where user_id = (select user_id from target)
)
delete from appointments
where user_id = (select user_id from target)
   or client_id in (select id from target_clients);

with target as (
  select 'REPLACE_WITH_CLERK_USER_ID'::text as user_id
),
target_clients as (
  select id
  from clients
  where user_id = (select user_id from target)
)
delete from invoices
where user_id = (select user_id from target)
   or client_id in (select id from target_clients);

with target as (
  select 'REPLACE_WITH_CLERK_USER_ID'::text as user_id
),
target_clients as (
  select id
  from clients
  where user_id = (select user_id from target)
)
update projects
set client_id = null
where user_id = (select user_id from target)
  and client_id in (select id from target_clients);

with target as (
  select 'REPLACE_WITH_CLERK_USER_ID'::text as user_id
)
delete from clients
where user_id = (select user_id from target);

commit;
