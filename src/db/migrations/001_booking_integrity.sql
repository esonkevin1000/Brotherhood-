-- Booking integrity (Slice 1): price snapshot, protection against double submits, and a history of every status change.
-- Only adds things. Existing bookings stay as they are.

-- what was agreed when the booking was made: services with their name, price and minutes, the total, branch and barber
alter table bookings add column snapshot text;
-- a key the customer's phone or browser sends with the booking, so a repeated tap returns the same booking instead of making a second one
alter table bookings add column idemKey text;
create unique index if not exists bookings_idem on bookings(idemKey) where idemKey is not null and idemKey <> '';

-- one row per status change, never edited or deleted
create table if not exists booking_events(id text primary key, bookingId text, at text, actor text, fromStatus text, toStatus text, reason text);
create index if not exists booking_events_booking on booking_events(bookingId, at);

-- upcoming bookings made before this change keep the prices that are in force today
update bookings set snapshot = json_object(
    'items', json((select json_group_array(json_object('id', i.id, 'name', i.name, 'price', i.price, 'mins', i.mins)) from json_each(bookings.itemIds) j join items i on i.id = j.value)),
    'total', (select coalesce(sum(i.price), 0) from json_each(bookings.itemIds) j join items i on i.id = j.value),
    'mins', bookings.mins,
    'branchName', (select name from branches where id = bookings.branchId),
    'staffName', (select name from staff where id = bookings.staffId),
    'takenAt', strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
    'backfilled', 1)
  where snapshot is null and status = 'booked' and date >= date('now', '-1 day') and json_valid(itemIds);
