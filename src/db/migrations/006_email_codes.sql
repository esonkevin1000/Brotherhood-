-- Guest booking confirmed by an email code (T16, D-5, D-14). A guest booking in a branch on the new booking system starts as
-- "pending" with holdUntil (10 minutes); the time stays taken until then. The code itself is never stored, only a hash.
-- Only adds a column and a table.
alter table bookings add column holdUntil text;
create table if not exists email_codes(bookingId text primary key, holdKey text not null unique, codeHash text, tries integer not null default 0, sends integer not null default 1, lastSentAt text, email text, guest text, createdAt text);
create index if not exists email_codes_email on email_codes(email, createdAt);
