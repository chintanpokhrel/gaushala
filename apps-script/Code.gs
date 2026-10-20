/**
 * Giriraj Gaushala – Google Sheet backup.
 *
 * Paste into the sheet's Extensions → Apps Script, change KEY, then Deploy → New deployment →
 * Web app, "Execute as: Me", "Who has access: Anyone". Full steps: README.md.
 *
 * The app sends everything on every backup:
 *  - `_backup` tab: the app's full data (used to restore). Do not edit it.
 *  - Customers / Monthly / Deliveries / Payments tabs: readable copies, rewritten each time.
 *    Editing them changes nothing in the app.
 *
 * Each backup increases a revision number. A phone may only replace the revision it last saw, so a
 * new or reset phone cannot overwrite a good backup by accident.
 */

// Change this to your own secret (any long word); type the same in the app's Settings.
var KEY = 'change-me';

var BACKUP_TAB = '_backup';
// A cell holds at most 50,000 characters.
var CHUNK = 40000;

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return reply({ ok: false, error: 'bad-request' });
  }
  if (KEY === 'change-me' || req.key !== KEY) return reply({ ok: false, error: 'key' });

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var props = PropertiesService.getScriptProperties();
    var rev = Number(props.getProperty('rev') || 0);
    var book = SpreadsheetApp.getActiveSpreadsheet();

    if (req.action === 'pull') {
      return reply({ ok: true, rev: rev, json: readBackup(book) });
    }
    if (req.action === 'push') {
      // An empty sheet (rev 0) has nothing to lose, so any phone may fill it.
      // lastPush lets a phone recognise its own earlier push whose answer it never got (the web
      // app can be suspended mid-request); the Android app sends no pushId.
      if (!req.force && rev !== 0 && req.baseRev !== rev) {
        return reply({ ok: false, conflict: true, rev: rev, lastPush: props.getProperty('lastPush') || '' });
      }
      writeBackup(book, req.json);
      Object.keys(req.tabs || {}).forEach(function (name) {
        writeTab(book, name, req.tabs[name]);
      });
      rev += 1;
      props.setProperty('rev', String(rev));
      props.setProperty('lastPush', String(req.pushId || ''));
      return reply({ ok: true, rev: rev });
    }
    return reply({ ok: false, error: 'bad-request' });
  } finally {
    lock.releaseLock();
  }
}

/** Opening the link in a browser shows this, which helps check the deployment works. */
function doGet() {
  return ContentService.createTextOutput('Giriraj Gaushala backup is running.');
}

function reply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Stored in column A as plain text. Each chunk gets a leading "J" so the sheet never reads a chunk
 * as a formula ("=...") or a number ("0012"), which would change the data.
 */
function writeBackup(book, json) {
  if (typeof json !== 'string' || json.charAt(0) !== '{') throw new Error('Backup is not JSON');
  var sheet = book.getSheetByName(BACKUP_TAB) || book.insertSheet(BACKUP_TAB);
  var rows = [];
  for (var i = 0; i < json.length; i += CHUNK) rows.push(['J' + json.substring(i, i + CHUNK)]);
  sheet.clearContents();
  var range = sheet.getRange(1, 1, rows.length, 1);
  range.setNumberFormat('@');
  range.setValues(rows);
}

function readBackup(book) {
  var sheet = book.getSheetByName(BACKUP_TAB);
  if (!sheet || sheet.getLastRow() === 0) return '';
  return sheet.getRange(1, 1, sheet.getLastRow(), 1).getValues()
    .map(function (r) { return String(r[0]).substring(1); })
    .join('');
}

function writeTab(book, name, rows) {
  if (name === BACKUP_TAB || !rows || rows.length === 0) return;
  var sheet = book.getSheetByName(name) || book.insertSheet(name);
  var width = rows.reduce(function (w, r) { return Math.max(w, r.length); }, 0);
  var values = rows.map(function (r) {
    var out = r.map(safe);
    while (out.length < width) out.push('');
    return out;
  });
  sheet.clearContents();
  sheet.getRange(1, 1, values.length, width).setValues(values);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, width).setFontWeight('bold');
}

/** Text that the sheet would turn into a formula or number (names, phone numbers) is kept as text. */
function safe(v) {
  if (v === null || v === undefined) return '';
  if (typeof v !== 'string') return v;
  return /^[=+\-@]/.test(v) || /^\d{6,}$/.test(v) ? "'" + v : v;
}
