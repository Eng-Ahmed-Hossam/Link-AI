# إعداد هاتف المعلّم للتجربة · Teacher phone setup

> مسودة — راجعها قبل الاستخدام. · Draft — review before use.

**لقطات الشاشة:** لم تُلتقط بعد — لم يكن لدينا هاتف أندرويد أو آيفون أثناء الإعداد. نضيفها أثناء إعداد أول هاتف في المركز (الخطوات مكتوبة بالتفصيل حتى ذلك الحين).
**Screenshots:** not taken yet — no Android or iPhone was available while building this. Add them while setting up the first phone at the centre; the steps below are complete without them.

---

## بالعربية

لماذا؟ المتصفح لا يسمح باستخدام الميكروفون إلا على اتصال آمن (HTTPS). لابتوب المركز يستخدم شهادة محلية، فنثبّت «شهادة Link التجريبية» على الهاتف مرة واحدة. لا تُرسَل أي بيانات خارج شبكة المركز.

**قبل البدء:** الهاتف متصل بواي فاي المركز نفسه. احصل من الفريق على ملف `link-pilot-ca.crt` (عبر كابل USB أو بلوتوث أو بفتحه من اللابتوب) وعلى عنوان التطبيق، مثل `https://192.168.1.15:8444`.

### أندرويد (كروم)
1. انقل الملف `link-pilot-ca.crt` إلى الهاتف (مجلد التنزيلات).
2. الإعدادات ← الأمان والخصوصية ← المزيد من إعدادات الأمان ← التشفير وبيانات الاعتماد ← **تثبيت شهادة** ← **شهادة CA**. (تختلف الأسماء قليلًا حسب الشركة المصنّعة؛ ابحث في الإعدادات عن «شهادة CA».)
3. اقرأ التحذير ثم اضغط «التثبيت على أي حال»، واختر الملف. قد يُطلب منك رمز قفل الشاشة.
4. افتح كروم واكتب العنوان `https://<عنوان اللابتوب>:8444`. يجب أن تفتح الصفحة **بدون** تحذير أمان.
5. قائمة كروم (⋮) ← **إضافة إلى الشاشة الرئيسية** ← «Link».
6. افتح التطبيق من الشاشة الرئيسية، اختر اسمك وأدخل الرمز المكوّن من ٦ أرقام الذي سلّمه لك المالك.

### آيفون (سفاري)
1. افتح ملف `link-pilot-ca.crt` على الآيفون (من AirDrop أو البريد) ← «تم تنزيل ملف التعريف».
2. الإعدادات ← **تم تنزيل ملف التعريف** ← تثبيت ← أدخل رمز الهاتف ← تثبيت.
3. الإعدادات ← عام ← حول ← **إعدادات الثقة في الشهادات** ← فعّل «Link Pilot CA (local)».
4. افتح سفاري واكتب `https://<عنوان اللابتوب>:8444` — تفتح الصفحة بدون تحذير.
5. زر المشاركة ← **إضافة إلى الشاشة الرئيسية**.
6. افتح التطبيق، اختر اسمك وأدخل الرمز.

### إذا لم ينجح
- يظهر تحذير أمان: الشهادة غير مثبّتة أو غير موثوقة (الخطوة ٣ في الآيفون)، أو تغيّر عنوان اللابتوب — اسأل الفريق.
- لا تفتح الصفحة: تأكد أن الهاتف على واي فاي المركز نفسه.
- **البديل:** سجّل الحصة على لابتوب المركز مباشرة بعد انتهائها (الفريق يفتح لك التطبيق هناك).

### في نهاية التجربة
احذف التطبيق من الشاشة الرئيسية، وامسح بيانات الموقع من إعدادات المتصفح، واحذف «Link Pilot CA» من الإعدادات (أندرويد: بيانات الاعتماد الموثوقة ← المستخدم؛ آيفون: الإعدادات ← عام ← الشبكة الافتراضية وإدارة الأجهزة ← ملف التعريف ← إزالة).

---

## In English

Why: browsers allow the microphone only over a secure connection (HTTPS). The centre laptop uses a local certificate, so each phone trusts the "Link Pilot CA" once. No data leaves the centre network.

**Before you start:** the phone is on the centre Wi-Fi. Get `link-pilot-ca.crt` from the team (USB, Bluetooth, or opened from the laptop) and the app address, e.g. `https://192.168.1.15:8444`.

### Android (Chrome)
1. Copy `link-pilot-ca.crt` to the phone (Downloads).
2. Settings → Security & privacy → More security settings → Encryption & credentials → **Install a certificate** → **CA certificate** (names vary by maker; search Settings for "CA certificate").
3. Read the warning, tap "Install anyway", pick the file. The phone may ask for the screen-lock code.
4. In Chrome open `https://<laptop address>:8444` — it must open **without** a security warning.
5. Chrome menu (⋮) → **Add to Home screen** → "Link".
6. Open it from the home screen, pick your name, type the 6-digit PIN the owner gave you.

### iPhone (Safari)
1. Open `link-pilot-ca.crt` on the iPhone (AirDrop or mail) → "Profile Downloaded".
2. Settings → **Profile Downloaded** → Install → phone passcode → Install.
3. Settings → General → About → **Certificate Trust Settings** → turn on "Link Pilot CA (local)".
4. In Safari open `https://<laptop address>:8444` — no warning.
5. Share → **Add to Home Screen**.
6. Open it, pick your name, type your PIN.

### If it does not work
- A security warning: the CA is not installed or not trusted (iPhone step 3), or the laptop's address changed — ask the team.
- The page does not open: is the phone on the same centre Wi-Fi?
- **Fallback:** record the session on the centre laptop right after it ends (the team opens the app for you there).

### At the end of the pilot
Remove the home-screen app, clear the site data in the browser settings, and remove "Link Pilot CA" (Android: Trusted credentials → User; iPhone: Settings → General → VPN & Device Management → the profile → Remove).

**Tested:** the certificate chain and HTTPS on the LAN address were verified from the laptop (TLS 1.3, trusted only with the pilot CA). **Not yet tested on a real Android phone or iPhone.**
