-- Enable helpers
create extension if not exists pgcrypto;

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint unique,
  telegram_username text,
  first_name text,
  last_name text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists url_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  source text not null default 'telegram',
  telegram_chat_id bigint,
  telegram_message_id bigint,
  raw_url text not null,
  cleaned_url text,
  platform text,
  status text not null default 'queued',
  attempt integer not null default 1,
  detection_count integer,
  error_code text,
  error_message text,
  analysis_metadata jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists destination_detections (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references url_jobs(id) on delete cascade,
  destination text not null,
  landmark text,
  country text,
  confidence numeric(4,3) not null,
  evidence text,
  source_frame integer,
  created_at timestamptz not null default now()
);

create table if not exists itineraries (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null unique references url_jobs(id) on delete cascade,
  summary_text text not null,
  details_json jsonb not null,
  total_cost_min_usd numeric(10,2),
  total_cost_max_usd numeric(10,2),
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists bot_events (
  id bigserial primary key,
  job_id uuid references url_jobs(id) on delete set null,
  telegram_chat_id bigint,
  telegram_user_id bigint,
  event_type text not null,
  direction text not null,
  payload_json jsonb,
  created_at timestamptz not null default now()
);

create table if not exists admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  created_at timestamptz not null default now()
);

create index if not exists idx_url_jobs_status_created on url_jobs(status, created_at);
create index if not exists idx_url_jobs_user on url_jobs(user_id, created_at desc);
create index if not exists idx_detections_job on destination_detections(job_id);
create index if not exists idx_bot_events_job on bot_events(job_id, created_at);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
for each row execute function set_updated_at();

drop trigger if exists trg_url_jobs_updated_at on url_jobs;
create trigger trg_url_jobs_updated_at before update on url_jobs
for each row execute function set_updated_at();

drop trigger if exists trg_itineraries_updated_at on itineraries;
create trigger trg_itineraries_updated_at before update on itineraries
for each row execute function set_updated_at();
