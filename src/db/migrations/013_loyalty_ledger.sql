-- Loyalty points ledger (T35–T38, D-3, D-19). Rows are never updated or deleted; a customer's balance is the sum of `delta`.
-- kind: earn (+1 per finished visit), reverse (−1 when that visit is voided), redeem (−cost of a reward), carry_over (past paid visits,
-- once per customer), adjust (owner only, with a reason). `requestKey` makes a redemption count once even if the button is tapped twice.
create table if not exists loyalty_ledger(id text primary key, customerId text not null, kind text not null, delta integer not null, orderId text, reward text, branchId text, byId text, byName text, reason text, requestKey text, warn integer default 0, createdAt text);
create unique index if not exists loyalty_earn_once on loyalty_ledger(orderId) where kind = 'earn';
create unique index if not exists loyalty_reverse_once on loyalty_ledger(orderId) where kind = 'reverse';
create unique index if not exists loyalty_carry_once on loyalty_ledger(customerId) where kind = 'carry_over';
create unique index if not exists loyalty_request_once on loyalty_ledger(requestKey) where requestKey is not null;
create index if not exists loyalty_customer on loyalty_ledger(customerId, createdAt);
create table if not exists loyalty_status(customerId text primary key, vipSince text);
