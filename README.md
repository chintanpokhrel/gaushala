# Giriraj Gaushala – milk delivery and billing

An app for daily milk deliveries. It records skips, extras and payments, and sends each customer
a bill picture on WhatsApp with a UPI QR code. The app works in English and Nepali. All data is
kept on the phone and also backed up to a Google Sheet.

There are two versions of the same app. They have the same screens, rules and backup format, so
either one can restore the other's backup:

| Folder | What | For |
| --- | --- | --- |
| `android/` | Native Android app (Kotlin, Jetpack Compose) | Android phones |
| `web/` | Web app that installs to the home screen (Preact, TypeScript) | iPhone (also works on Android) |
| `apps-script/` | Google Sheet backup script | both |
| `fixtures/` | One backup file written by each app | both apps' tests |

The two apps do not share code. `fixtures/` keeps their backup format the same: each app's tests
read the file that the other app writes.

## How it works

- **Customer plan:** each customer has a usual morning and evening quantity and a rate per litre.
  When you change the quantity or rate, you pick the date it starts. Earlier days keep their old
  quantity and rate.
- **Deliveries tab:** shows the delivery list for a date and shift. On a normal day you change
  nothing. Use − / + for a skip or an extra (0.5 L per tap). Tap the quantity to type an exact
  amount. Dates in the future work too, so you can mark a skip as soon as the customer tells you.
- **Skip days** (customer page): skip a range of days for morning, evening or both.
- **Payments:** record any amount. If a customer pays more than the bill, the extra shows as
  advance on the next bill.
- **Bill:** covers any period. In the first 5 days of a month it starts as last month; after that,
  as this month up to the month end. A bill shows:
  - a calendar of litres per day (red = skipped, green = extra)
  - one line per rate
  - the balance carried from before the period
  - payments received from the period start up to the day the bill is made
  - a UPI QR code with the amount filled in

  **Send on WhatsApp** opens the customer's chat with the bill attached. The **›** button goes to
  the next customer for the same period.

- **Summary tab:** shows turnover till date, which is all milk sold up to today. Deliveries
  planned for later this month are not counted yet. It also shows the amount received till date
  and the amount still to collect. Below that is a month-by-month list of litres, sales and money
  received; tap a month to see each customer's share. You can set an optional **starting amount**
  (sales from before the app, with the pencil icon) that is added to the turnover. If you leave
  it empty, the total starts from 0. Customers' old unpaid balances are not counted as turnover.

Money is stored in paise and milk in millilitres, so totals are exact (for example, 0.25 L at
₹65 = ₹16.25).

## Android app: build and install

You need Android Studio's SDK and JDK 17 (both already on this machine). From `android/`:

```
.\gradlew.bat assembleDebug testDebugUnitTest > build.log
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

The APK file is `android/app/build/outputs/apk/debug/app-debug.apk`. You can also send this file
to the phone and open it there (allow "install unknown apps" when the phone asks).

Updates must be built on this same PC. The debug signing key is stored in
`~/.android/debug.keystore`, and Android only accepts an update signed with the same key. Back up
that file.

## Web app (iPhone): publish and install

The web app is a static site on GitHub Pages. It sends nothing to GitHub: the data stays on the
phone and in the Google Sheet. A push to `main` that changes `web/` runs the tests and publishes
the site (`.github/workflows/web.yml`).

One-time setup on GitHub: **Settings → Pages → Source: GitHub Actions**. The site address is
`https://<user>.github.io/<repo>/`. On a free GitHub plan, the repo must be public for Pages to
work.

On the iPhone (Safari only, iOS 15.4 or newer):

1. Open the site address in **Safari**.
2. Tap **Share → Add to Home Screen**.
3. From then on, always open the app from the home screen icon. iOS can clear the data of a site
   that is used only in Safari. An app on the home screen keeps its own data, and the app shows a
   reminder until it is opened that way.
4. Set up the Google Sheet backup (next section). On iPhone, this backup is the real safety net.

**Updates:** after a new version is published, the app picks it up in the background. The new
version shows the next time the app is opened. It also works without internet, after the first
open.

Run it on the computer from `web/`:

```
npm install
npm run dev        # http://localhost:5173, changes show at once
npm run build      # production files in web/dist
npm run preview    # serves web/dist at http://localhost:4173 (with offline support)
```

## One-time setup: Google Sheet backup (about 5 minutes, on a computer)

1. In the Google account that will own the backup, create a new Google Sheet, for example
   "Gaushala backup".
2. **Extensions → Apps Script.** Delete the sample code. Paste all of `apps-script/Code.gs`.
3. On the line `var KEY = 'change-me';`, change `change-me` to your own secret word. Save.
4. **Deploy → New deployment.** Type: **Web app**. Execute as: **Me**. Who has access:
   **Anyone**. Click **Deploy** and allow access when Google asks ("unsafe app" warning →
   Advanced → Go to project; it is your own script).
5. Copy the **Web app URL** (it ends in `/exec`). Send it to the phone, for example by WhatsApp to
   yourself.
6. In the app, go to **Settings → Google Sheet backup**. Paste the link, type the secret word, and
   tap **Save link and back up now**. The status changes to "All changes backed up".

After that, the app backs up by itself about 15 seconds after each change, and again when you
leave the app. If the phone is offline, it tries again later. If backup has not worked, a red
banner on the Deliveries screen tells you. (iPhone: a web app cannot run in the background, so a
backup that is still waiting goes out the next time the app is opened, or when the internet comes
back while it is open.)

The sheet has these tabs:

- **Customers, Monthly, Deliveries (last 12 months), Payments:** easy to read. The app rewrites
  them on every backup, so changes made to them by hand are lost.
- **_backup:** the full data, used to restore. Do not edit it.

If you change `Code.gs` later, use **Deploy → Manage deployments → Edit → New version**. This
keeps the same link.

## New phone

1. Install the app.
2. Go to **Settings → Google Sheet backup**. Paste the same link and secret word.
3. Tap **Restore from Google Sheet**.

Safety: the sheet keeps a revision number. A phone can only replace the revision it last saw, so
a new or reset phone cannot overwrite a good backup by mistake. Instead, the app stops and asks
you to restore. **Replace sheet with this phone** forces an overwrite; use it only if this
phone's data is the correct one.

The web app can lose the answer to a backup when iOS suspends it mid-request. The sheet then has
the data, but the phone does not know the new revision. To keep this from being reported as
"another phone", each backup from the web app carries an id, and the sheet reports which id made
its newest revision. If that id is one of this phone's own, the phone carries on.

There is also a **backup file** option in Settings. It saves one file (Android: for example to
Google Drive; iPhone: through the share sheet, for example "Save to Files") and can restore
without internet. On Android, Auto Backup also copies the app data to the Google account.

## Tests

```
android\gradlew.bat -p android testDebugUnitTest   # billing math, JSON format, both fixture files
cd web && npm test                                  # same billing cases, JSON format, both fixture files
node --test apps-script/Code.test.js                # sheet script: round trip, revision guard, key check
```

If the backup format changes, change both apps and both files in `fixtures/` in the same commit.

## Known limits and deliberate choices

- **One phone at a time.** Two phones that both record entries will conflict. The revision guard
  stops the second phone from overwriting the first, but it does not merge their data.
- **Opening WhatsApp on the customer's chat** (Android) uses an undocumented WhatsApp intent extra
  (`jid`). If WhatsApp drops it, the bill still opens in WhatsApp, and you pick the contact. The
  country code for 10-digit numbers is set in Settings (default 91).
- **iPhone: you pick the WhatsApp contact every time.** A web app can only hand the bill image to
  the share sheet; it cannot open one chat with an image attached.
- **Nepali text was written by machine.** A native speaker should check it
  (`android/app/src/main/res/values-ne/strings.xml`, `web/src/i18n/ne.ts`).
- **The two apps have separate string files.** `web/src/i18n/*.ts` was converted once from the
  Android `strings.xml` files and uses the same keys. A text change must be made in both places.
- **Rates are whole rupees per litre.** Quantities can have up to 2 decimals of a litre.
- **The UPI payment note is always in English**, because some UPI apps reject other scripts.
- **No charges other than milk** (for example ghee or curd). This was not in the requirements.
  To add them, use a one-off charge entry next to payments.

## Web app: not yet checked on an iPhone

The web app was tested on a Windows computer: unit tests, and a click-through in desktop Chrome
(screens, bill image in both languages, totals, offline cache and update, backup error messages).
These items need a real iPhone before the app is relied on:

- [ ] Backup and restore with a real Apps Script deployment, from Safari on the iPhone.
- [ ] **Send on WhatsApp:** the share sheet shows WhatsApp, the image arrives, and whether the
      caption text arrives too.
- [ ] Date picker, number keypad and the layout around the notch and home bar, in the home screen
      app.
- [ ] Data is still there after the phone is restarted and after a week of normal use.
- [ ] "Last backup 5 minutes ago" is in Nepali on the iPhone. This one text uses the browser's
      own Nepali data, which desktop Chrome does not have. All other dates use the app's own month
      and day names.
- [ ] Backup file: "Save to Files", and restore from that file.
