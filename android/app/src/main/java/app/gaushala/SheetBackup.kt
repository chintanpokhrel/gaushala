package app.gaushala

import android.content.Context
import app.gaushala.data.AppData
import app.gaushala.data.JsonCodec
import app.gaushala.data.Shift
import app.gaushala.data.Store
import app.gaushala.data.balanceOn
import app.gaushala.data.ml
import app.gaushala.data.usage
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.time.LocalDate
import java.time.YearMonth

/**
 * Keeps a copy of everything in the owner's Google Sheet, through the Apps Script in /apps-script.
 *
 * - Every change is sent ~15 s after the last tap, and again when the app goes to the background.
 * - The sheet holds the full data (for restore) plus readable tabs (for people).
 * - The sheet counts revisions. A phone may only overwrite the revision it last saw, so a new or
 *   reset phone cannot wipe a good backup by accident: it gets [Status.Conflict] and must restore
 *   or explicitly overwrite.
 */
class SheetBackup(private val app: Context, private val store: Store) {
    sealed interface Status {
        data object NotSetUp : Status
        data object Working : Status
        /** [lastOkAt] epoch ms of the last successful backup; [pending] = changes not yet in the sheet. */
        data class Idle(val lastOkAt: Long?, val pending: Boolean) : Status
        data class Failed(val reason: Reason, val lastOkAt: Long?) : Status
        data object Conflict : Status
    }

    enum class Reason { OFFLINE, BAD_LINK, WRONG_KEY }

    /** [data] is null when the sheet has no backup yet. */
    class Snapshot(val data: AppData?, val rev: Long)

    private val prefs = app.getSharedPreferences("sheet", Context.MODE_PRIVATE)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val mutex = Mutex()
    private var scheduled: Job? = null

    /** Data known to equal the sheet; its echo through [Store.data] is not a change. */
    @Volatile private var clean: AppData? = null

    private val _status = MutableStateFlow(idleStatus())
    val status: StateFlow<Status> = _status

    val url: String get() = prefs.getString(URL, "").orEmpty()
    val key: String get() = prefs.getString(KEY, "").orEmpty()
    private val configured get() = url.isNotBlank() && key.isNotBlank()
    private var rev: Long
        get() = prefs.getLong(REV, 0)
        set(v) = prefs.edit().putLong(REV, v).apply()
    private var dirty: Boolean
        get() = prefs.getBoolean(DIRTY, false)
        set(v) = prefs.edit().putBoolean(DIRTY, v).apply()
    private val lastOkAt: Long? get() = prefs.getLong(LAST_OK, 0).takeIf { it > 0 }

    init {
        clean = store.data.value
        scope.launch {
            store.data.collect { d ->
                if (d === clean) return@collect
                clean = null
                dirty = true
                if (_status.value is Status.Idle) _status.value = idleStatus()
                schedule(DEBOUNCE_MS)
            }
        }
        if (dirty) schedule(STARTUP_DELAY_MS)
    }

    fun setLink(url: String, key: String) {
        prefs.edit().putString(URL, url.trim()).putString(KEY, key.trim()).apply()
        _status.value = idleStatus()
    }

    /** Sends pending changes now (app going to the background, or the user asked). */
    fun flush(force: Boolean = false) {
        if (force || dirty) schedule(0)
    }

    /** Replaces the sheet with this phone's data even if another phone saved since. Asked for explicitly. */
    fun overwrite() {
        scheduled?.cancel()
        scope.launch { push(force = true) }
    }

    /**
     * Only the wait is cancellable. A push already sent must finish and record the new revision,
     * or the next push would be refused as a conflict.
     */
    private fun schedule(delayMs: Long) {
        if (!configured || _status.value == Status.Conflict) return
        scheduled?.cancel()
        scheduled = scope.launch {
            delay(delayMs)
            scope.launch { push(force = false) }
        }
    }

    private suspend fun push(force: Boolean) = mutex.withLock {
        if (!configured) return@withLock
        val d = store.data.value
        _status.value = Status.Working
        val res = call(
            JSONObject()
                .put("action", "push")
                .put("baseRev", rev)
                .put("force", force)
                .put("json", JsonCodec.encode(d))
                .put("tabs", SheetTabs.build(Lang.wrap(app, Lang.get(app)), d, LocalDate.now()))
        ) ?: return@withLock
        when {
            res.optBoolean("ok") -> {
                rev = res.getLong("rev")
                prefs.edit().putLong(LAST_OK, System.currentTimeMillis()).apply()
                if (store.data.value === d) {
                    clean = d
                    dirty = false
                }
                _status.value = idleStatus()
            }
            res.optBoolean("conflict") -> _status.value = Status.Conflict
            else -> _status.value = Status.Failed(Reason.BAD_LINK, lastOkAt)
        }
    }

    /** Reads the backup; the caller confirms with the user, then calls [apply]. */
    suspend fun pull(): Snapshot? = mutex.withLock {
        _status.value = Status.Working
        val res = call(JSONObject().put("action", "pull")) ?: return@withLock null
        val json = res.optString("json")
        val snapshot = try {
            Snapshot(if (json.isEmpty()) null else JsonCodec.decode(json), res.getLong("rev"))
        } catch (e: Exception) {
            null
        }
        _status.value = if (snapshot == null) Status.Failed(Reason.BAD_LINK, lastOkAt) else idleStatus()
        snapshot
    }

    fun apply(s: Snapshot) {
        val d = requireNotNull(s.data)
        scheduled?.cancel()
        clean = d
        rev = s.rev
        dirty = false
        store.replace(d)
        _status.value = idleStatus()
    }

    /** Null when failed; [status] then says why. */
    private suspend fun call(body: JSONObject): JSONObject? = withContext(Dispatchers.IO) {
        try {
            val res = JSONObject(post(url, body.put("key", key).toString()))
            if (res.optString("error") == "key") {
                _status.value = Status.Failed(Reason.WRONG_KEY, lastOkAt)
                null
            } else res
        } catch (e: IOException) {
            _status.value = Status.Failed(Reason.OFFLINE, lastOkAt)
            null
        } catch (e: JSONException) {
            // Google answers a wrong or undeployed script link with an HTML page.
            _status.value = Status.Failed(Reason.BAD_LINK, lastOkAt)
            null
        } catch (e: IllegalArgumentException) {
            _status.value = Status.Failed(Reason.BAD_LINK, lastOkAt)
            null
        }
    }

    private fun idleStatus(): Status = if (!configured) Status.NotSetUp else Status.Idle(lastOkAt, dirty)

    private companion object {
        const val URL = "url"
        const val KEY = "key"
        const val REV = "rev"
        const val DIRTY = "dirty"
        const val LAST_OK = "lastOk"
        const val DEBOUNCE_MS = 15_000L
        const val STARTUP_DELAY_MS = 3_000L
    }
}

/**
 * Apps Script answers a POST with a redirect to the result, which must be fetched with GET.
 * Redirects are followed by hand so that happens the same way on every Android version.
 */
private fun post(url: String, body: String): String {
    var conn = open(url).apply {
        requestMethod = "POST"
        doOutput = true
        setRequestProperty("Content-Type", "text/plain; charset=utf-8")
    }
    conn.outputStream.use { it.write(body.toByteArray()) }
    var hops = 0
    while (conn.responseCode in 300..399 && hops++ < 5) {
        val next = conn.getHeaderField("Location") ?: break
        conn.disconnect()
        conn = open(next)
    }
    // Reached Google but the link is wrong (404 etc.): a link problem, not a network one.
    require(conn.responseCode == HttpURLConnection.HTTP_OK) { "HTTP ${conn.responseCode}" }
    return conn.inputStream.bufferedReader().use { it.readText() }.also { conn.disconnect() }
}

private fun open(url: String) = (URL(url).openConnection() as HttpURLConnection).apply {
    instanceFollowRedirects = false
    connectTimeout = 20_000
    readTimeout = 90_000
}

/** Readable tabs written next to the full backup. Rebuilt from scratch on every backup. */
object SheetTabs {
    /** Deliveries tab covers this many months back; the full history is always in the backup itself. */
    private const val DELIVERY_MONTHS = 12L

    fun build(context: Context, d: AppData, today: LocalDate): JSONObject {
        fun header(res: Int) = JSONArray(context.resources.getStringArray(res).toList())
        fun litres(ml: Long) = ml / 1000.0
        fun rupees(paise: Long) = paise / 100.0
        val names = d.customers.sortedBy { it.name.lowercase() }

        val customers = JSONArray().put(header(R.array.sheet_customer_headers))
        for (c in names) {
            val p = c.currentPlan(today)
            customers.put(
                JSONArray()
                    .put(c.name).put(c.phone).put(c.address)
                    .put(litres(p.morningMl.toLong())).put(litres(p.eveningMl.toLong())).put(p.rate)
                    .put(c.start.toString()).put(rupees(d.balanceOn(c, today)))
            )
        }

        val monthly = JSONArray().put(header(R.array.sheet_monthly_headers))
        val thisMonth = YearMonth.from(today)
        for (c in names) {
            var m = YearMonth.from(d.origin(c))
            val payments = d.paymentsOf(c.id)
            while (!m.isAfter(thisMonth)) {
                val u = d.usage(c, m.atDay(1), minOf(m.atEndOfMonth(), today))
                val paid = payments.filter { YearMonth.from(it.date) == m }.sumOf { it.paise }
                monthly.put(JSONArray().put(m.toString()).put(c.name).put(litres(u.ml)).put(rupees(u.paise)).put(rupees(paid)))
                m = m.plusMonths(1)
            }
        }

        val deliveries = JSONArray().put(header(R.array.sheet_delivery_headers))
        val skip = context.getString(R.string.sheet_skip)
        val extra = context.getString(R.string.sheet_extra)
        var day = thisMonth.minusMonths(DELIVERY_MONTHS).atDay(1)
        while (!day.isAfter(today)) {
            for (c in names) {
                val m = d.ml(c, day, Shift.MORNING)
                val e = d.ml(c, day, Shift.EVENING)
                val usual = c.usualMl(day, Shift.MORNING) + c.usualMl(day, Shift.EVENING)
                if (m + e == 0 && usual == 0) continue
                val changed = d.adjustment(c.id, day, Shift.MORNING) != null || d.adjustment(c.id, day, Shift.EVENING) != null
                val note = when {
                    !changed -> ""
                    m + e < usual -> skip
                    else -> extra
                }
                deliveries.put(JSONArray().put(day.toString()).put(c.name).put(litres(m.toLong())).put(litres(e.toLong())).put(note))
            }
            day = day.plusDays(1)
        }

        val payments = JSONArray().put(header(R.array.sheet_payment_headers))
        val nameOf = d.customers.associate { it.id to it.name }
        for (p in d.payments.sortedBy { it.date }) {
            payments.put(JSONArray().put(p.date.toString()).put(nameOf[p.customerId]).put(rupees(p.paise)).put(p.note))
        }

        // Tab names are fixed (not translated) so switching language does not leave stale tabs behind.
        return JSONObject()
            .put("Customers", customers)
            .put("Monthly", monthly)
            .put("Deliveries", deliveries)
            .put("Payments", payments)
    }
}
