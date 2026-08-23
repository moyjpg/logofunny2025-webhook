-- Credits v2: cover foreign-key columns used by ledger joins and cleanup.
-- This migration does not enable the v2 wallet or change any credit balance.

create index if not exists credit_included_benefits_action_key_idx
  on public.credit_included_benefits (action_key);

create index if not exists credit_included_benefits_project_id_idx
  on public.credit_included_benefits (project_id);

create index if not exists credit_transactions_action_key_idx
  on public.credit_transactions (action_key);

create index if not exists credit_transactions_charge_id_idx
  on public.credit_transactions (charge_id);

create index if not exists credit_transactions_grant_id_idx
  on public.credit_transactions (grant_id);

create index if not exists generation_charges_action_key_idx
  on public.generation_charges (action_key);

create index if not exists generation_charges_project_id_idx
  on public.generation_charges (project_id);
