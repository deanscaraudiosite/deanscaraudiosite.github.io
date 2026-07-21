-- Dean's Car Audio Step 4 commerce foundation.
-- This migration is not active until it is applied to a configured Supabase project.
-- Never expose the service-role key in browser code.

create extension if not exists pgcrypto;

create table if not exists public.commerce_catalog_releases (
  id text primary key,
  classification text not null check (classification in ('official-source-curated', 'licensed-feed', 'demo')),
  source_manifest jsonb not null default '{}'::jsonb,
  published_at timestamptz not null,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists commerce_one_active_catalog_release
  on public.commerce_catalog_releases (active)
  where active = true;

create table if not exists public.commerce_products (
  release_id text not null references public.commerce_catalog_releases(id) on delete cascade,
  id text not null,
  slug text not null,
  brand text not null,
  name text not null,
  category text not null,
  fitment_policy text not null check (fitment_policy in ('required', 'advisory')),
  public_data jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (release_id, id),
  unique (release_id, slug)
);

create table if not exists public.commerce_variants (
  release_id text not null,
  id text not null,
  product_id text not null,
  sku text not null,
  name text not null,
  price_amount_minor integer check (price_amount_minor is null or price_amount_minor >= 0),
  compare_at_amount_minor integer check (compare_at_amount_minor is null or compare_at_amount_minor >= 0),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  price_kind text not null check (price_kind in ('manufacturer_reference', 'msrp', 'dealer', 'quote')),
  stock_status text not null default 'unknown' check (stock_status in ('in_stock', 'low_stock', 'out_of_stock', 'unknown')),
  source_checked_at date,
  public_data jsonb not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (release_id, id),
  unique (release_id, sku),
  foreign key (release_id, product_id)
    references public.commerce_products(release_id, id) on delete cascade
);

create table if not exists public.commerce_fitment_sources (
  id text primary key,
  name text not null,
  authority text not null,
  coverage text not null check (coverage in ('partial', 'exhaustive')),
  license_metadata jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.commerce_fitment_releases (
  id text primary key,
  catalog_release_id text not null references public.commerce_catalog_releases(id),
  coverage text not null check (coverage in ('partial', 'exhaustive')),
  absence_policy text not null default 'unknown' check (absence_policy = 'unknown'),
  source_manifest jsonb not null default '{}'::jsonb,
  published_at timestamptz not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  unique (id, catalog_release_id)
);

create unique index if not exists commerce_one_active_fitment_release
  on public.commerce_fitment_releases (active)
  where active = true;

create table if not exists public.commerce_fitment_rules (
  release_id text not null,
  id text not null,
  catalog_release_id text not null,
  variant_id text not null,
  source_id text not null references public.commerce_fitment_sources(id),
  decision text not null check (decision in ('compatible', 'conditional', 'incompatible')),
  priority integer not null default 100,
  vehicle_application jsonb not null,
  conditions jsonb not null default '[]'::jsonb,
  customer_note text not null,
  evidence jsonb not null,
  reviewed_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (release_id, id),
  foreign key (release_id, catalog_release_id)
    references public.commerce_fitment_releases(id, catalog_release_id) on delete cascade,
  foreign key (catalog_release_id, variant_id)
    references public.commerce_variants(release_id, id) on delete cascade
);

create index if not exists commerce_fitment_rules_variant_idx
  on public.commerce_fitment_rules (catalog_release_id, variant_id, active, priority desc);

create table if not exists public.commerce_carts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'converted', 'abandoned')),
  currency char(3) not null default 'USD' check (currency = 'USD'),
  version bigint not null default 0 check (version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists commerce_one_active_cart_per_user
  on public.commerce_carts (user_id)
  where status = 'active';

create table if not exists public.commerce_cart_lines (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.commerce_carts(id) on delete cascade,
  catalog_release_id text not null,
  variant_id text not null,
  quantity integer not null check (quantity between 1 and 25),
  vehicle_key text,
  selected_vehicle jsonb,
  configuration jsonb not null default '{}'::jsonb,
  configuration_hash text not null,
  display_snapshot jsonb not null default '{}'::jsonb,
  fitment_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (catalog_release_id, variant_id)
    references public.commerce_variants(release_id, id)
);

create index if not exists commerce_cart_lines_cart_idx
  on public.commerce_cart_lines (cart_id, updated_at desc);

create unique index if not exists commerce_unique_cart_configuration
  on public.commerce_cart_lines (
    cart_id,
    catalog_release_id,
    variant_id,
    coalesce(vehicle_key, ''),
    configuration_hash
  );

create or replace function public.commerce_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists commerce_products_updated_at on public.commerce_products;
create trigger commerce_products_updated_at
before update on public.commerce_products
for each row execute function public.commerce_set_updated_at();

drop trigger if exists commerce_variants_updated_at on public.commerce_variants;
create trigger commerce_variants_updated_at
before update on public.commerce_variants
for each row execute function public.commerce_set_updated_at();

drop trigger if exists commerce_carts_updated_at on public.commerce_carts;
create trigger commerce_carts_updated_at
before update on public.commerce_carts
for each row execute function public.commerce_set_updated_at();

drop trigger if exists commerce_cart_lines_updated_at on public.commerce_cart_lines;
create trigger commerce_cart_lines_updated_at
before update on public.commerce_cart_lines
for each row execute function public.commerce_set_updated_at();

alter table public.commerce_catalog_releases enable row level security;
alter table public.commerce_products enable row level security;
alter table public.commerce_variants enable row level security;
alter table public.commerce_fitment_sources enable row level security;
alter table public.commerce_fitment_releases enable row level security;
alter table public.commerce_fitment_rules enable row level security;
alter table public.commerce_carts enable row level security;
alter table public.commerce_cart_lines enable row level security;

drop policy if exists "Public reads active catalog releases" on public.commerce_catalog_releases;
create policy "Public reads active catalog releases"
  on public.commerce_catalog_releases for select
  using (active = true and classification <> 'demo');

drop policy if exists "Public reads active products" on public.commerce_products;
create policy "Public reads active products"
  on public.commerce_products for select
  using (
    active = true
    and exists (
      select 1 from public.commerce_catalog_releases catalog_release
      where catalog_release.id = commerce_products.release_id
        and catalog_release.active = true
        and catalog_release.classification <> 'demo'
    )
  );

drop policy if exists "Public reads active variants" on public.commerce_variants;
create policy "Public reads active variants"
  on public.commerce_variants for select
  using (
    active = true
    and exists (
      select 1 from public.commerce_products product
      join public.commerce_catalog_releases catalog_release
        on catalog_release.id = product.release_id
      where product.release_id = commerce_variants.release_id
        and product.id = commerce_variants.product_id
        and product.active = true
        and catalog_release.active = true
        and catalog_release.classification <> 'demo'
    )
  );

drop policy if exists "Public reads active fitment sources" on public.commerce_fitment_sources;
create policy "Public reads active fitment sources"
  on public.commerce_fitment_sources for select
  using (active = true);

drop policy if exists "Public reads active fitment releases" on public.commerce_fitment_releases;
create policy "Public reads active fitment releases"
  on public.commerce_fitment_releases for select
  using (
    active = true
    and absence_policy = 'unknown'
    and exists (
      select 1 from public.commerce_catalog_releases catalog_release
      where catalog_release.id = commerce_fitment_releases.catalog_release_id
        and catalog_release.active = true
        and catalog_release.classification <> 'demo'
    )
  );

drop policy if exists "Public reads active fitment rules" on public.commerce_fitment_rules;
create policy "Public reads active fitment rules"
  on public.commerce_fitment_rules for select
  using (
    active = true
    and exists (
      select 1
      from public.commerce_fitment_releases fitment_release
      join public.commerce_catalog_releases catalog_release
        on catalog_release.id = fitment_release.catalog_release_id
      where fitment_release.id = commerce_fitment_rules.release_id
        and fitment_release.catalog_release_id = commerce_fitment_rules.catalog_release_id
        and fitment_release.active = true
        and fitment_release.absence_policy = 'unknown'
        and catalog_release.active = true
        and catalog_release.classification <> 'demo'
    )
    and exists (
      select 1 from public.commerce_fitment_sources fitment_source
      where fitment_source.id = commerce_fitment_rules.source_id
        and fitment_source.active = true
    )
    and exists (
      select 1
      from public.commerce_variants variant
      join public.commerce_products product
        on product.release_id = variant.release_id
        and product.id = variant.product_id
      where variant.release_id = commerce_fitment_rules.catalog_release_id
        and variant.id = commerce_fitment_rules.variant_id
        and variant.active = true
        and product.active = true
    )
  );

drop policy if exists "Users read own carts" on public.commerce_carts;
create policy "Users read own carts"
  on public.commerce_carts for select
  using (auth.uid() = user_id);

drop policy if exists "Users create own carts" on public.commerce_carts;
drop policy if exists "Users update own carts" on public.commerce_carts;
drop policy if exists "Users delete own carts" on public.commerce_carts;

drop policy if exists "Users read own cart lines" on public.commerce_cart_lines;
create policy "Users read own cart lines"
  on public.commerce_cart_lines for select
  using (
    exists (
      select 1 from public.commerce_carts cart
      where cart.id = cart_id and cart.user_id = auth.uid()
    )
  );

drop policy if exists "Users create own cart lines" on public.commerce_cart_lines;
drop policy if exists "Users update own cart lines" on public.commerce_cart_lines;
drop policy if exists "Users delete own cart lines" on public.commerce_cart_lines;

revoke insert, update, delete, truncate, references, trigger
on public.commerce_catalog_releases,
  public.commerce_products,
  public.commerce_variants,
  public.commerce_fitment_sources,
  public.commerce_fitment_releases,
  public.commerce_fitment_rules
from anon, authenticated;

grant select on public.commerce_catalog_releases,
  public.commerce_products,
  public.commerce_variants,
  public.commerce_fitment_sources,
  public.commerce_fitment_releases,
  public.commerce_fitment_rules
to anon, authenticated;

revoke all privileges on public.commerce_carts,
  public.commerce_cart_lines
from anon;

revoke insert, update, delete, truncate, references, trigger
on public.commerce_carts,
  public.commerce_cart_lines
from authenticated;

grant select on public.commerce_carts,
  public.commerce_cart_lines
to authenticated;

-- Catalog/fitment writes are intentionally not granted to browser roles.
-- They belong to a protected server import job after validation and approval.
-- Cart writes also belong to the authenticated server API. That API must compute
-- configuration hashes, enforce cart state/line caps, reprice, and apply
-- optimistic locking and idempotency before using its service-role connection.
