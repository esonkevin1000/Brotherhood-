-- Corrections to completed records (T29, D-9): a record is never edited in place. Each correction (amount, payment method, barber,
-- or void) keeps the values before and after, the reason, who asked, and who approved or rejected it. Only adds a table.
create table if not exists record_adjustments(id text primary key, orderId text not null, branchId text, kind text, before text, after text, reason text, status text, requestedById text, requestedBy text, createdAt text, decidedBy text, decidedAt text, note text);
create index if not exists record_adjustments_order on record_adjustments(orderId);
create index if not exists record_adjustments_status on record_adjustments(status, branchId);
