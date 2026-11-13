-- Service records (T28, D-15, D-9): where a completed visit came from (appointment or walk-in) and its payment status: 'reported'
-- when the front desk records it, 'verified' when the owner, an admin or the branch manager confirms it. Adds columns and fills them
-- for visits already paid.
alter table orders add column source text;
alter table orders add column payStatus text;
alter table orders add column verifiedBy text;
alter table orders add column verifiedAt text;
update orders set source = case when exists (select 1 from bookings b where b.orderId = orders.id) then 'appointment' else 'walkin' end where status='paid' and source is null;
update orders set payStatus = 'reported' where status='paid' and payStatus is null;
