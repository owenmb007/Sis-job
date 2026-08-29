-- Outreach email sending: deals need a recipient email address on file
-- (Google Places doesn't return business emails, so this is entered manually
-- per deal before the first outreach send).

alter table deals add column email text;
