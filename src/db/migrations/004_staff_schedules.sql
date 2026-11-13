-- Barber weekly hours (T13). One row per weekday that differs from the branch hours: a custom start and end (minutes after
-- midnight), or a day off (startMin = endMin = 0). No row for a weekday = the branch's opening hours (today's behaviour).
-- Only adds a table. Used only in branches that have the new booking system switched on (T11).
create table if not exists staff_schedules(staffId text not null, weekday integer not null, startMin integer not null, endMin integer not null, primary key(staffId, weekday));
