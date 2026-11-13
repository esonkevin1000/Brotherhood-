-- Commission entries linked to service records (T33, E1, D-10). One 'earn' row when a visit is finished, with the rule used (the
-- barber's % at that time, plus product commission) and the source record. A later correction, barber change or void adds an 'adjust'
-- row with the difference; no row is ever updated or deleted. `date` is the day the entry was made, `orderDate` the visit's day.
create table if not exists commission_entries(id text primary key, orderId text not null, staffId text not null, branchId text, date text, orderDate text, kind text not null, base real, pct real, productComm real, amount real not null, rule text, reason text, adjustmentId text, createdAt text);
create unique index if not exists commission_entries_earn on commission_entries(orderId) where kind = 'earn';
create index if not exists commission_entries_staff on commission_entries(staffId, date);
create index if not exists commission_entries_order on commission_entries(orderId);
