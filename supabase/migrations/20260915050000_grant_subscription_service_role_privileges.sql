grant usage on schema public to service_role;

grant select, insert, update on public.email_subscribers to service_role;
grant select, insert, update on public.email_subscription_preferences to service_role;
grant select, insert on public.email_consent_events to service_role;
grant select, insert, update on public.email_access_tokens to service_role;
grant select, insert, update on public.email_delivery_events to service_role;
