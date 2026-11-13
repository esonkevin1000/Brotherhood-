-- Branch managers (T7, decision D-12): a manager works like an admin, but only for the branches listed here.
-- Only adds a table. Other roles keep using users.branchId (cashier, barber) or have no branch (owner, admin).
create table if not exists user_branches(userId text not null, branchId text not null, primary key(userId, branchId));
create index if not exists user_branches_branch on user_branches(branchId);
