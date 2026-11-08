# Brotherhood: checklist bago ibenta sa ibang shops

Nakahanda na sa system: sign-up ng bagong shop (/signup) na may 30-day free trial, plans at bayad (Settings, Partner shops, "Plan & payments"), Terms for shops (/shop-terms), Privacy Policy na may partner shops, at email marketing sa Gmail.

Ito naman ang mga gagawin mo sa labas ng system. Hindi ito legal advice: ipa-review sa abogado o CPA.

## 1. Ang sarili mong negosyo (ikaw ang nagbebenta ng software)
- [ ] I-register ang negosyo: DTI (kung sole proprietor) o SEC (kung corporation o OPC).
- [ ] Mayor's permit / business permit sa city o munisipyo mo.
- [ ] BIR: Form 1901 (sole proprietor) o 1903 (corporation), kunin ang COR (Form 2303). Line of business: software / IT services (subscription).
- [ ] Mag-avail ng BIR invoices (printed booklet o CAS) para sa bayad ng shops sa iyo. Bawat bayad na i-record mo sa "Plan & payments", isulat ang invoice no. mo.
- [ ] Bank account o GCash for business para sa bayad ng shops.

## 2. Written confirmation na hindi ito POS / CAS
- [ ] Sumulat sa RDO mo (o ipagawa sa CPA o tax lawyer): ilarawan na ang Brotherhood ay booking at management tool, hindi naglalabas ng resibo o invoice, walang X/Z reading, walang hawak na pera ng customer, at ang shop ang naglalabas ng sarili nilang BIR invoice.
- [ ] Itago ang sagot nila. Ipakita sa mga shop na nagtatanong.

## 3. Data Privacy (NPC)
- [ ] Mag-appoint ng Data Protection Officer (puwedeng ikaw muna).
- [ ] I-register sa NPC (npc.gov.ph) kapag pasok sa requirement (hal. 250+ empleyado, o may sensitive personal information ng 1,000+ tao, o madaming data na pinoproseso). Dahil may ID photos at selfies, malamang pasok ka habang lumalaki: mas mabuting mag-register.
- [ ] Data Processing Agreement: nasa Terms for shops na ang pangunahing laman. Ipa-review sa abogado.
- [ ] Breach plan: kung may data leak, sabihan ang NPC at ang mga shop sa loob ng 72 oras.

## 4. Gmail para sa emails (welcome, promos, "we miss you")
1. Gumawa ng Gmail para lang sa negosyo (hal. getbrotherhoodapp@gmail.com).
2. Sa Google Account nito: Security, i-on ang **2-Step Verification**.
3. Security, **App passwords**: gumawa ng isa, pangalan "Brotherhood". Kopyahin ang 16 letters.
4. Railway, ang service mo, **Variables**: idagdag
   - `GMAIL_USER` = ang Gmail address
   - `GMAIL_APP_PASSWORD` = ang 16 letters
   - `CONTACT_EMAIL` = email na makikita ng shops at customers (puwedeng parehong Gmail)
5. Kusang magre-restart ang Railway. Subukan sa back office: Marketing, Email Marketing, "Send test".

Limit ng Gmail: mga 500 email kada araw. Ang system ay hanggang 450 lang kada araw (lahat ng shops). Kapag mas marami, kusa itong itutuloy kinabukasan. Kapag lumaki na, lumipat sa sariling domain email (Resend o Google Workspace): ilagay ang `RESEND_API_KEY` at alisin ang Gmail variables.

## 5. Presyo at bayad
- [ ] Settings, Partner shops, "Plans, prices and how shops pay you": ilagay ang tamang presyo (default: Solo ₱299, Shop ₱999, Multi-branch ₱2,499 kada buwan) at ang GCash o bank details mo.
- [ ] Kapag nagbayad ang shop: "Plan & payments", "Record a payment". Kusang uusog ang "paid until" at may email sa shop.
- [ ] Kapag hindi nagbayad pagkatapos ng trial: view-only ang shop (nakikita at na-e-export pa ang data, pero hindi makakadagdag ng booking o serbisyo).

## 6. Play Store
Tingnan ang `STORE-LISTING.md`.
