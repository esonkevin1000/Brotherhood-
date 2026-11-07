# Brotherhood vs SQUIRE: ano na ang meron, ano ang idinagdag, ano ang susunod

Batay sa mga public na pahina ng SQUIRE (getsquire.com/features/...). Hindi ko nakita ang loob ng private nilang app.

## 1. Meron na ang Brotherhood

| SQUIRE | Brotherhood |
|---|---|
| POS at bayad | POS na may cash, GCash, Maya; refund; sales readings (Z-reading) |
| Multi-location | 7 branch sa isang account; Shop tab; consolidated na ulat |
| Staff, oras ng pasok, payroll | Attendance na may litrato at oras ng device, payroll, commission, release pay, payslip, leave requests, mga role |
| Mga ulat | Sales, item ranking, commissions, tender, discounts, barber scorecard, cash accountability |
| Back office | Expenses na may resibo, daily remittance, problem reports, checklists, equipment, inbox, activity log (audit), backup |
| Client management | Customers (CRM) na may loyalty tiers (1 bayad na bisita = 1 puntos) at welcome email |
| Online booking | Booking ng shop at ng barber, calendar sa POS, walk-in queue |
| Discovery / marketplace | Discover, mapa, shop at barber pages, Pick a service, Style finder |
| Waitlist | Waitlist na may abiso kapag may bumukas na slot |
| Reviews | Verified reviews na may reply ng barber o owner |
| Portfolio | Portfolio na may style tags, cover at profile photo, seminars at certificates |
| Notifications | In-app na abiso para sa booking, rate your cut, waitlist, community |

## 2. Idinagdag sa batch na ito

| Feature | Saan makikita |
|---|---|
| **Branch Health Score** (0-100): sales trend, bumabalik na customer, oras ng pasok, ratings, remittance accuracy, checklists, open problems | Owner: Pro tools, Insights |
| **Win-back:** mga suki (2+ bisita) na matagal nang hindi bumabalik, may Call na button | Owner: Insights |
| **Barber retention:** kaninong mga client ang bumabalik | Owner: Insights |
| **Client notes ng barber:** tala, paboritong gupit, VIP, birthday, kasaysayan ng bisita (pribado sa barber at owner) | Barber: Dashboard, My clients |
| **Personal booking link** na pwedeng i-share sa Facebook, Instagram, TikTok (`/b/<id>`) | Barber: Profile |
| **Brotherhood Rewards:** puntos at tier (galing sa POS) na may progress | Customer: Home at Profile |
| **Smart rebooking:** abiso kapag oras na ulit ng gupit batay sa sariling gawi ng customer (o 21 araw) | Customer: Notifications |
| **Branding:** pangalan ng shop ang lumalabas sa header ng app ng partner shop | Partner instance (`SHOP_NAME`) |

Hindi pa kasama sa Health Score: kontrol sa gastos at kondisyon ng equipment.

## 2b. Idinagdag sa phase 2

| Feature | Saan makikita |
|---|---|
| **Email na paalala** ng booking (mga isang araw bago) at **hiling ng review** pagkatapos ng gupit | Awtomatiko kapag nakakonekta ang email (`RESEND_API_KEY`). Members: sa email ng account; ibang customer: kung pumayag silang makatanggap ng email |
| **No-show protection:** pansamantalang pagpapahinto ng online booking pagkatapos ng N na hindi pagsipot sa loob ng 90 araw (ang owner ang nagtatakda), listahan ng mga na-pause, "Allow booking" para payagan ulit | Owner: Insights, Booking rules at No-show watch |
| **Buffer sa pagitan ng mga gupit** (5 hanggang 30 minuto) | Owner: Insights, Booking rules |
| **Blocked time:** break, training, o day off na hindi pwedeng i-book (may babala kung may booking nang tumatama) | Barber: Dashboard, Time off & blocks |
| **Paulit-ulit na booking** (bawat 1 hanggang 6 na linggo, 2 hanggang 6 na gupit; ang mga linggong puno o nakablock ay nilalaktawan at ipinapakita) | Customer: booking page, Repeat |
| Tag na "⚠ no-show" sa appointment card ng barber | Barber: Dashboard |

## 2c. Idinagdag sa phase 3: promo codes

| Feature | Saan makikita |
|---|---|
| **Promo codes:** percent off o peso off, pang first-time customer lang (opsyonal), limitasyon ng kabuuang gamit, petsa ng pagtatapos, pause o delete | Owner: Insights, Promo codes |
| **Sa customer:** ilalagay ang code sa booking page at makikita agad ang bagong presyo | Customer: booking page |
| **Awtomatiko sa cashier:** kapag nag-arrive ang booking, ang ticket ay may discount na (gumagawa ang bawat code ng katumbas na discount sa POS, kaya lumalabas din sa Discounts report) | POS |
| Mga patakaran: isang gamit kada tao (ayon sa phone o email), hindi na mabibilang ang na-cancel o no-show, ang paulit-ulit na booking ay sa unang gupit lang | |

Paalala: ang promo ay nakakabit sa booking sa app. Ang walk-in ay patuloy na gumagamit ng mga discount na pinipili ng cashier (lalabas din doon ang "Promo CODE" bilang pwedeng piliin).

## 3. Susunod (inirerekomendang pagkakasunod-sunod)

1. **SMS na paalala** (kailangan ng SMS provider; ang email ay tapos na).
2. **Pagkuha ng reward:** voucher code na ibibigay ng cashier at itatala.
3. **Inventory:** bilang ng stock, awtomatikong bawas kapag nabenta, babala sa mababang stock. (Hinahawakan nito ang pagbebenta sa POS, kaya gagawin nang maingat at may test.)
4. **Prepayment at singil sa no-show** (kailangan ng payment gateway).
5. **Mga patakaran bawat client:** halimbawa prepay-only na flag.
6. **Brotherhood Academy:** mga kurso at certification.
7. **Multi-tenant (organization):** iisang marketplace para sa maraming shop. Malaking pagbabago sa seguridad ng data.
8. **Marketing campaign na may ROI** (kailangan muna ng promo codes at email o SMS).

## 4. Hindi pa kaya o kailangan ng ibang serbisyo

| Feature | Dahilan |
|---|---|
| AI Operator (sumasagot ng tawag at text), AI na gumagawa ng promo, AI na sumasagot ng tanong sa ulat | Kailangan ng AI provider at may gastos kada gamit |
| Auto payout, Rapid transfer, deposits, financing | Kailangan ng bangko o payment partner at mga lisensya |
| Prepayment, card on file, singil sa no-show | Kailangan ng payment gateway at pagsunod sa mga patakaran |
| Reserve with Google, Google Ads tracking, Google reviews booster | Mga programa ng Google na may aplikasyon |
| Kiosk check-in | Pwedeng gawin bilang web page sa tablet, pero kailangan pa ng disenyo at hardware |
| Import mula sa Instagram, QuickBooks sync | Kailangan ng approval o API ng ibang kumpanya |

## Mga paalala
- Ang puntos ng loyalty sa app ay galing sa record ng customer sa POS na naka-link sa account (ayon sa phone na ginamit sa booking). Wala pang OTP, kaya ang history ng mga lumang walk-in ay hindi pa ipinapakita sa app.
- Ang presyo ng mga package na inilalagay ng barber ay pang-display; ang POS ang naniningil.
