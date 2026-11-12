-- Phones and tablets an owner or admin set up for a branch (decision D-21: staff pick their name, then type their PIN).
-- Only adds a table. A device can be switched off (active = 0) when a phone is lost.
create table if not exists devices(id text primary key, branchId text, name text, createdBy text, createdAt text, active integer, lastUsedAt text);
create index if not exists devices_branch on devices(branchId);
