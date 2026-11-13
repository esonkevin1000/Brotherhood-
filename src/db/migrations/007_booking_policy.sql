-- Booking policy stored with each booking (T17): the slot interval, buffer, no-show grace and cancel cutoff in force when it
-- was made, so a later change of the branch policy never alters it. Only adds a column.
alter table bookings add column policy text;
