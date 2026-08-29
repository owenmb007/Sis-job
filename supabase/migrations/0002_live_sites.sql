-- Live site hosting: lets a closed deal be deliberately published to a public
-- URL served by the dealflow-site-server Cloudflare Worker.

alter table deals add column slug text unique;
alter table deals add column live boolean not null default false;

create index if not exists deals_slug_idx on deals(slug) where slug is not null;

-- Narrow public view for the site-server Worker to read from (anon key).
-- Deliberately NOT a table-level RLS policy: this view runs with the owning
-- role's privileges and applies its own "live = true" filter, so it exposes
-- only slug/business_name/site_html for published deals -- never price,
-- phone, address, or any other column -- regardless of what the caller asks
-- PostgREST to select. The base `deals` table keeps its existing owner-only
-- RLS policy; anon still has zero direct access to it.
create view public.live_sites as
  select slug, business_name, site_html
  from deals
  where live = true and slug is not null;

grant select on public.live_sites to anon;
