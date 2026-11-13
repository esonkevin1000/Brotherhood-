-- Visit history (T22): one row per change of a visit's plan status (waiting, assigned, checked in, in service, completed,
-- left, cancelled), with who did it and why. Only adds a table.
create table if not exists order_events(id text primary key, orderId text not null, at text, actor text, fromStatus text, toStatus text, reason text);
create index if not exists order_events_order on order_events(orderId);
