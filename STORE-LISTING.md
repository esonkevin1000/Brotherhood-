# Brotherhood: gabay para sa Play Store (at App Store)

## Mga link na kailangan ng store
Palitan ang domain kung iba ang gamit mo (para sa customer app, ang site host).

| Hinihingi | Ilagay |
|---|---|
| Privacy policy URL | `https://getbrotherhoodapp.com/privacy` |
| Terms (customers) | `https://getbrotherhoodapp.com/terms` |
| Terms for shops | `https://getbrotherhoodapp.com/shop-terms` |
| Sign-up ng bagong shop | `https://getbrotherhoodapp.com/signup` |
| Account deletion URL (Play Console, Data safety) | `https://getbrotherhoodapp.com/delete-account` |
| Delete sa loob ng app | Profile, Account, Delete my account |
| Contact email na lalabas sa mga pahina | Itakda ang `CONTACT_EMAIL` sa hosting variables (kung wala, "any Brotherhood branch" ang lalabas) |

## Text ng listing (English, para sa store)
**App name:** Brotherhood: Barber Booking (hanggang 30 characters sa Play)

Isang app lang para sa lahat: customers, barbers, chair renters, studios, student barbers at shop owners. Wala nang hiwalay na POS app.

**Short description (80 chars):**
Book your barber. Run your chair or your shop. One app for the barbershop.

**Full description:**
Brotherhood is the barbershop app for people who care about a fresh cut.

BOOK IN SECONDS
Pick a branch and a barber, choose your service, and grab a time that is actually free. Repeat your cut every few weeks in one go, and join the waitlist if your barber is full.

FIND THE RIGHT BARBER
See each barber's portfolio, ratings, specialties and next free slot. Browse styles, read verified reviews from real paid visits, and follow your favorites.

JOIN THE COMMUNITY
Share your cuts, follow barbers, save looks you love, and see what is trending.

EARN REWARDS
Every paid visit earns points. Redeem them for vouchers, free items and discounts, and use promo codes when you book.

STAY ON TOP
Get reminders before your appointment and a nudge when it is time for your next cut.

FOR BARBERS AND SHOP OWNERS
Run your shop from the same app: walk-ins and the line, bookings, finished services and earnings, time in with selfie, expenses, end-of-day cash, team chat, and a web back office for reports, commission and payroll. Chair renters, studios and student barbers get their own booking link and earnings. Start free at getbrotherhoodapp.com/signup.

Brotherhood is for bookings and tracking. It does not issue receipts or take payments.

Free for customers. You pay at the shop.

**Category:** Beauty (o Business). **Tags:** barber, booking, haircut, barbershop management.

## Mga screenshot at graphics (nasa folder na `store-assets/`)
- **Feature graphic 1024x500:** `store-assets/feature-graphic.jpg` (galing sa `feature-graphic.html`).
- **Phone screenshots 1080x1920 (6):** `phone-1-home.jpg`, `phone-2-discover.jpg`, `phone-3-shop.jpg`, `phone-4-barber.jpg`, `phone-5-style-finder.jpg`, `phone-6-map.jpg`. Kinuha mula sa totoong live app (public na pages). Kailangan ng Play ng 2 hanggang 8.
- **App icon 512x512:** `bh-icon-512.png` sa root ng project.
- Mas maganda kung papalitan mo ng mga screenshot mula sa sarili mong phone pagdating ng public release, lalo na kapag marami nang review at barber na may rating.

## Play Console: mga sagot na tugma sa app
- **Data safety:** kinokolekta ang Name, Email, Phone number, Photos (kung mag-upload), User content (posts, reviews), App activity (bookings). Para sa staff: Photos (attendance selfie, resibo ng expenses, ID para sa discount) at Approximate location (kung i-on lang ng shop ang location sa attendance). Hindi ibinebenta. Naka-encrypt in transit. May paraan ng pag-delete (URL sa taas). Walang ads, walang analytics.
- **Content rating:** may user-generated content (community). Sagutin na may report at block na features.
- **Target audience:** 13 pataas.
- **App access:** kailangan ng login para mag-book at para sa Pro tools. Gumawa ng demo shop sa /signup (hal. shop code `demo-shop`) at ilagay sa App access ang customer login at ang staff login (shop code, username, password). Huwag gamitin ang owner password ng Brotherhood.
- **Ads:** wala.

## Hakbang (Android)
1. Gumawa ng Google Play developer account ($25, may ID verification).
2. Gumawa ng bagong TWA package para sa customer app. Halimbawa package name: `com.brotherhood.app`, start URL `https://getbrotherhoodapp.com/member` (ang `/brotherhood` ay gumagana pa rin bilang kapalit na link). Ang lumang POS app (`com.brotherhood.pos`) ay tinanggal na: kung naka-install pa sa mga phone ng branch, bubukas na ito sa Pro tools ng app. Huwag na itong i-publish.
3. I-build ang signed AAB (PWABuilder o Bubblewrap).
4. Sa Play Console, i-on ang Play App Signing. Kunin ang SHA-256 ng app signing key at idagdag sa `assetlinks.json` sa ilalim ng bagong package. (Ako na ang magdadagdag sa file kapag ibinigay mo ang fingerprint.)
5. Punan ang listing, Data safety, content rating, at App access.
6. Closed testing: kung bago ang personal account, kailangan ng mga 12 tester sa loob ng 14 na araw bago mag-production. Tingnan ang kasalukuyang patakaran sa Play Console.
7. Isumite para sa review.

## App Store (iPhone): mamaya
- $99 kada taon at kailangan ng Mac na may Xcode (o cloud Mac).
- Hindi tinatanggap ang website lang na ibinalot. Kailangan ng Capacitor at native na gamit tulad ng push notifications.
- Kailangan na ng: delete account sa loob ng app (meron), report at block (meron), terms na tinatanggap sa signup (meron), at privacy policy link (meron).
