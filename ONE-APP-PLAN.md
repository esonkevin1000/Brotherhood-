# Brotherhood: one app, no POS

Goal: one Brotherhood app for everyone (customers, barbers, shop owners), built around booking, that can still track services and earnings, without breaking BIR rules. The back office (/backend) stays.

The full system with the POS was saved before any change:
- git tag `pos-archive-2026-11-08`
- zip: `C:\Users\user\Brotherhood-with-POS-2026-11-08.zip` (whole system: server, back office, POS)

## The 5 kinds of users (same as SQUIRE)

| User | What they need from the app |
|---|---|
| I run a shop with barbers | Branches, team, bookings and walk-ins, finished services and earnings, commission and payroll, attendance, reports, clients, reviews, promos and rewards. Back office on the web. |
| I rent a chair in a shop | My own booking link and calendar, my clients, my earnings, my chair rent (due and paid). The shop owner sees renters and rent status. |
| I'm in my own suite / studio | A one-person shop: services and prices, hours, booking page, clients, earnings, promos. |
| I'm a student barber | Profile and portfolio, practice log (cuts and hours), "model" bookings at a student price, school or mentor, certificates. |
| I'm looking for a barber | Discover, book, my bookings, rewards, reviews, community (most of this already exists). |

## BIR-safe rules for everything we build

1. The app never issues receipts or invoices, and nothing looks like one: no SI or OR numbers, no "Sales invoice", no printing.
2. No X-reading or Z-reading, no shift closing that looks like a BIR reading, no running grand totals.
3. Words we use: completed services, earnings, service log, estimated revenue. Every money screen says: "Not an official receipt. Issue your BIR invoice separately."
4. Optional field "BIR invoice no." on a finished service, so the shop can note the invoice it issued from its own booklet or system.
5. No online payments until we use a licensed payment gateway (it issues its own receipts and holds the money, not us).
6. Data privacy: privacy policy, consent, and registration with the National Privacy Commission when we go commercial.
7. Our own company: business registration, TIN, BIR invoices for the subscription fees shops pay us, contracts that say the shop handles its own BIR registration and invoices.
8. Before going commercial, get a written answer from BIR (RDO) or a tax lawyer / CPA that the app as designed is a management and booking tool, not a POS or CAS that needs registration.

## Step by step (each step keeps the shops working)

Done so far: steps 1 to 3, step 5 and the email part of step 6. /pos now opens the Brotherhood app (Pro tools). The POS files were removed from the project (kept in the archive above).

1. ✅ **Walk-ins and finished services in the app.** Barbers and the front desk add walk-ins, start and finish a service, and note the amount and how the customer paid, for tracking only. Commission, payroll, loyalty points and reports read from finished services instead of POS sales.
2. ✅ **Move the other POS tools into the app.** Time in and out with selfie, expenses with receipts, daily cash count (instead of remittance and Z-reading), checklists, problem reports, leave, release pay, inbox.
3. ✅ **Turn off the POS.** Remove /pos, rename BIR-like words in the back office (Sales readings, Tender, Cash management), clean up the old data screens. Existing sales stay in reports as history.
4. **"Tell us about you" onboarding** for the 5 user types, with the screens each one needs (chair rent, studio, student).
5. ✅ **Commercial setup.** (/signup with a free trial, plans and payments in Settings → Partner shops, /shop-terms, privacy update, STORE-LISTING.md. The real-world tasks are in COMMERCIAL-CHECKLIST.md.) Self sign-up for new shops, plans and billing, Play Store listing, privacy policy, terms, NPC and BIR confirmation.
6. **Growth features from SQUIRE.** ✅ Email marketing through Gmail (campaigns to customers who said yes, automatic "we miss you" email, 450 a day). Later: SMS reminders and waitlist texts, gift cards and memberships, inventory, Reserve with Google, payments through a licensed gateway.
