# Paano mag-setup ng Brotherhood para sa ibang barbershop (pilot)

Ang bawat shop ay may **sariling kopya (instance)** ng system: sariling database, sariling owner, sariling link.
Hindi nagkakahalo ang data nila at ng Brotherhood mo. (Ang iisang marketplace para sa maraming shop ay hindi pa gawa. Tingnan ang dulo.)

## 1. Gumawa ng bagong service sa hosting

1. Sa hosting dashboard (Railway o katulad), gumawa ng **bagong service** mula sa GitHub repo na `esonkevin1000/Brotherhood-` (branch `main`, o `release` kung gagawa ka nito).
2. Maglagay ng **Volume** na naka-mount sa `/data`. **Kapag walang volume, mabubura ang data tuwing magre-redeploy.**
3. Ilagay ang mga **Variables** sa ibaba.
4. Hintayin ang deploy, tapos buksan ang link na ibinigay ng hosting.

## 2. Variables

| Variable | Halaga | Paalala |
|---|---|---|
| `ADMIN_PASSWORD` | mahaba at natatanging password | **Huwag gamitin ang password mo.** Ito ang owner password. |
| `SESSION_SECRET` | mahabang random na teksto | Iba sa lahat ng ibang instance. |
| `OWNER_USERNAME_FORCE` | username ng owner nila (halimbawa `shopname`) | Ito ang gagamitin sa pag-login. |
| `SHOP_NAME` | pangalan ng shop nila | Lumalabas sa mga email at ulat. |
| `FRESH_INSTALL` | `1` | **Walang laman** na simula (walang branch, upuan, menu ng Brotherhood). |
| `ROOT_REDIRECT` | `/brotherhood` | Ang home page ng link nila ay ang app, hindi ang promo page ng Brotherhood. |

Nakalagay na sa Dockerfile ang `PORT=8080`, `DB_FILE=/data/barber.db`, at `TZ=Asia/Manila`.

Opsyonal: `RESEND_API_KEY` at `EMAIL_FROM` (para sa mga email), `SITE_HOST` at `APP_HOST` (kung may dalawang domain sila).

## 3. Unang setup ng owner nila

Sa `https://link-nila/backend`, mag-login gamit ang `OWNER_USERNAME_FORCE` at `ADMIN_PASSWORD`.

1. **Users:** gumawa ng sariling **admin** na account (role: admin, username, password). Doon na sila mag-login araw-araw. Ang admin ay kayang gawin ang lahat **maliban sa pag-download ng backup at sa mga owner setting**; para sa mga iyon, ang owner login (`OWNER_USERNAME_FORCE` at `ADMIN_PASSWORD`) ang kailangan.
2. **Branches:** pangalan, oras ng bukas at sara, address, phone, Google Maps link.
3. **Chairs:** mga upuan ng bawat branch.
4. **Services at presyo:** ang mga gupit nila. Pang-online booking ang mga naka-"bookable".
5. **Staff:** mga barber, na may porsyento ng commission.
6. **Users para sa mga barber:** role: barber, branch, username, **6-digit PIN**, at **i-link ang staff record**.
7. Sa app (`/brotherhood#/pro`), owner login → **Shop** tab → **Map pins**: lagyan ng pin ang bawat branch.

Ang bawat barber, gamit ang PIN sa `/brotherhood#/pro`: profile, cover at profile photo, portfolio na may style tag, seminars, at **Services I offer** (na may sariling presyo).

## 4. Subukan bago ang totoong araw (checklist)

1. Mag-book ang customer sa isang partikular na barber.
2. May walk-in habang naka-book ang barber.
3. Mag-cancel ang customer; tingnan kung nag-abiso ang waitlist.
4. Matapos ang gupit at mabayaran, lumabas ang "Rate your cut" sa customer.
5. Nakita ng owner ang benta bawat branch sa **Shop** tab.
6. Tama ang commission ng barber sa POS at sa dashboard niya.
7. Walang double booking.
8. Kumpleto at tama ang oras ng lahat ng booking sa POS.

## 5. Ibigay sa owner nila (sa ligtas na paraan, hindi sa group chat)

> Hi! Ito ang sarili ninyong Brotherhood: `https://link-nila`
> Back office: `https://link-nila/backend` · Username: `...` · Password: `...`
> Gumawa po kayo agad ng sarili ninyong admin account sa **Users**.
> Para sa mga barber: `https://link-nila/brotherhood#/pro`, gamit ang 6-digit PIN nila.
> Mag-download po kayo ng **backup** kada linggo sa Back office, gamit ang **owner login** (hindi ang admin account).

## 6. Mga dapat tandaan

- **Sino ang may hawak ng hosting, siya ang may hawak ng owner password.** Sabihin ito sa kanila nang tapat. Kung ayaw nila nito, sila ang gumawa ng hosting account nila at doon mag-deploy.
- **Backup:** may sariling volume ang bawat instance. Turuan silang mag-download ng backup bawat linggo.
- **Mga update:** kapag nag-push ka sa branch na sinusundan ng instance, magre-redeploy ito. Para sa mga partner, mas ligtas ang hiwalay na branch (`release`) na ina-update mo lang kapag subok na.
- **Privacy:** magkakaroon ng customer data ng ibang negosyo sa sistema mo. Kailangan ng simpleng kasunduan at payo ng abogado (Data Privacy Act).
- **Singil:** manual muna ang subscription nila. May buwanang gastos sa hosting kada instance.
- **Hindi pa gawa:** iisang app na may maraming shop (multi-tenant): bawat shop ay may sariling Discover sa ngayon. Ang presyo ng package na inilalagay ng barber ay pang-display; ang POS pa rin ang naniningil.
