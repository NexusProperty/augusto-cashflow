create type document_status as enum (
  'uploaded', 'parsing', 'extracting', 'ready_for_review', 'confirmed', 'failed'
);

create type document_type as enum (
  'aged_receivables', 'aged_payables', 'bank_statement', 'invoice',
  'loan_agreement', 'payroll_summary', 'contract', 'board_paper', 'other'
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  mime_type text not null,
  file_size integer not null,
  storage_path text not null,
  status document_status not null default 'uploaded',
  doc_type document_type,
  error_message text,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table document_extractions (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents(id) on delete cascade,
  entity_name text,
  category_name text,
  counterparty text,
  amount numeric,
  expected_date date,
  payment_terms text,
  invoice_number text,
  confidence numeric default 0.5 check (confidence >= 0 and confidence <= 1),
  raw_text text,
  is_confirmed boolean default false,
  is_dismissed boolean default false,
  forecast_line_id uuid references forecast_lines(id) on delete set null,
  created_at timestamptz default now()
);

alter table forecast_lines
  add constraint fk_forecast_lines_document
  foreign key (source_document_id) references documents(id) on delete set null;

create index idx_documents_status on documents(status);
create index idx_document_extractions_doc on document_extractions(document_id);
create index idx_document_extractions_confirmed on document_extractions(is_confirmed)
  where is_confirmed = false and is_dismissed = false;

create table category_mappings (
  id uuid primary key default gen_random_uuid(),
  counterparty_pattern text not null,
  category_id uuid not null references categories(id) on delete cascade,
  entity_id uuid references entities(id) on delete cascade,
  use_count integer default 1,
  created_at timestamptz default now(),
  unique(counterparty_pattern, entity_id)
);
