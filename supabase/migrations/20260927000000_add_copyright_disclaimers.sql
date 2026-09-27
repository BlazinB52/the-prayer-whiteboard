-- Add centrally managed copyright disclaimers for the public page and emails.

create table if not exists public.copyright_disclaimers (
  id uuid primary key default gen_random_uuid(),
  disclaimer_key text unique not null,
  title text not null,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint copyright_disclaimers_key_check check (disclaimer_key in ('full_page', 'email_short')),
  constraint copyright_disclaimers_title_check check (length(trim(title)) > 0 and length(title) <= 160),
  constraint copyright_disclaimers_content_check check (length(trim(content)) > 0 and length(content) <= 5000)
);

drop trigger if exists copyright_disclaimers_set_updated_at on public.copyright_disclaimers;
create trigger copyright_disclaimers_set_updated_at
before update on public.copyright_disclaimers
for each row execute function public.set_updated_at();

alter table public.copyright_disclaimers enable row level security;

drop policy if exists "Admins manage copyright disclaimers" on public.copyright_disclaimers;
create policy "Admins manage copyright disclaimers"
on public.copyright_disclaimers
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Public reads copyright disclaimers" on public.copyright_disclaimers;
create policy "Public reads copyright disclaimers"
on public.copyright_disclaimers
for select
using (disclaimer_key in ('full_page', 'email_short'));

grant select, insert, update, delete on public.copyright_disclaimers to authenticated;
grant select on public.copyright_disclaimers to anon;

insert into public.copyright_disclaimers (disclaimer_key, title, content)
values
  (
    'full_page',
    'Copyright Disclaimer — Full Page',
    'Scripture quotations taken from The Holy Bible, New International Version®, NIV® Copyright © 1973, 1978, 1984, 2011 by Biblica, Inc.® Used by permission. All rights reserved worldwide.

Scripture quotations are from the ESV® Bible (The Holy Bible, English Standard Version®), copyright © 2001 by Crossway, a publishing ministry of Good News Publishers. Used by permission. All rights reserved.

Scripture quotations taken from the Amplified® Bible (AMP), Copyright © 2015 by The Lockman Foundation. Used by permission. https://www.lockman.org

Scripture quotations marked (AMPC) taken from the Amplified® Bible, Classic Edition, Copyright © 1954, 1958, 1962, 1964, 1965, 1987 by The Lockman Foundation. Used by permission. https://www.lockman.org

Scripture taken from the New King James Version®. Copyright © 1982 by Thomas Nelson. Used by permission. All rights reserved.

Scripture quotations marked (KJV) are taken from the King James Version, which is in the public domain in the United States.

Original commentary, organization, editorial content, and presentation © 2026 The Prayer Whiteboard. All rights reserved. Scripture quotations and any underlying third-party teaching material remain the property of their respective copyright holders.'
  ),
  (
    'email_short',
    'Copyright Disclaimer — Email Short Version',
    'Scripture quotations are from the NIV, ESV, NKJV, and AMP Bibles. Complete copyright acknowledgments and permissions can be viewed here.

Original Content © 2026 The Prayer Whiteboard. All rights reserved.'
  )
on conflict (disclaimer_key) do update
set
  title = excluded.title,
  content = excluded.content;
