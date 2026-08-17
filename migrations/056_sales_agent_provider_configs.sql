-- Sales Agent provider registry.
-- The application stores only provider metadata and an environment-variable
-- reference. API keys remain server-side secrets and are never persisted here.

create table if not exists public.sales_agent_provider_configs (
  id uuid primary key default gen_random_uuid(),
  provider varchar(40) not null unique,
  display_name varchar(80) not null,
  model varchar(160) not null,
  base_url varchar(500) not null,
  api_key_env varchar(128) not null,
  enabled boolean not null default false,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_agent_provider_configs_provider_check
    check (provider in ('openai', 'anthropic', 'gemini', 'deepseek', 'openai-compatible')),
  constraint sales_agent_provider_configs_api_key_env_check
    check (api_key_env ~ '^[A-Z][A-Z0-9_]{1,127}$'),
  constraint sales_agent_provider_configs_base_url_check
    check (base_url ~ '^https://|^http://localhost|^http://127\.0\.0\.1|^http://\[::1\]'),
  constraint sales_agent_provider_configs_default_enabled_check
    check (not is_default or enabled)
);

create unique index if not exists sales_agent_provider_configs_one_default_idx
  on public.sales_agent_provider_configs (is_default)
  where is_default;

insert into public.sales_agent_provider_configs
  (provider, display_name, model, base_url, api_key_env, enabled, is_default)
values
  ('openai', 'OpenAI', 'gpt-5.6-luna', 'https://api.openai.com/v1', 'OPENAI_API_KEY', true, true),
  ('anthropic', 'Anthropic', 'claude-sonnet-4-5', 'https://api.anthropic.com/v1', 'ANTHROPIC_API_KEY', false, false),
  ('gemini', 'Google Gemini', 'gemini-2.5-flash', 'https://generativelanguage.googleapis.com/v1beta', 'GEMINI_API_KEY', false, false),
  ('deepseek', 'DeepSeek', 'deepseek-chat', 'https://api.deepseek.com/v1', 'DEEPSEEK_API_KEY', false, false),
  ('openai-compatible', 'OpenAI Compatible', 'local-model', 'http://localhost:11434/v1', 'OPENAI_COMPATIBLE_API_KEY', false, false)
on conflict (provider) do nothing;

alter table public.sales_agent_provider_configs enable row level security;
revoke all on table public.sales_agent_provider_configs from public, anon, authenticated;
grant select, insert, update on table public.sales_agent_provider_configs to service_role;

comment on table public.sales_agent_provider_configs is
  'Sales Agent provider metadata. API keys are environment secrets; api_key_env stores only their names.';
