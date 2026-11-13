-- Booking messages (T20): each email gets a key, so a repeated request or a retry never sends it twice.
-- Only adds a column and a unique index (empty keys are allowed many times).
alter table email_log add column ref text;
create unique index if not exists email_log_ref on email_log(ref);
