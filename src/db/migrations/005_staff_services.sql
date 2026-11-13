-- Which barber can do which service (T14). A barber with no rows does every service (today's behaviour).
-- Only adds a table. Used only in branches that have the new booking system switched on (T11).
create table if not exists staff_services(staffId text not null, itemId text not null, primary key(staffId, itemId));
