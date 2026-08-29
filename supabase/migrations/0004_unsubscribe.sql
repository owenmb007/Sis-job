-- CAN-SPAM compliance: honor opt-outs. Once a contact unsubscribes,
-- send-outreach must refuse to send to them again.

alter table deals add column unsubscribed boolean not null default false;
