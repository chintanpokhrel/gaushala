package app.gaushala.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.LocalDate

/** The on-device file, the backup file and the Google Sheet backup all use this one format. */
object JsonCodec {
    private const val VERSION = 1

    fun encode(d: AppData): String = JSONObject().apply {
        put("version", VERSION)
        put("business", d.business.let {
            JSONObject()
                .put("nameEn", it.nameEn)
                .put("nameNe", it.nameNe)
                .put("phone", it.phone)
                .put("upiId", it.upiId)
                .put("upiName", it.upiName)
                .put("defaultRate", it.defaultRate)
                .put("countryCode", it.countryCode)
                .put("openingTurnoverPaise", it.openingTurnoverPaise)
        })
        put("customers", array(d.customers) { c ->
            JSONObject()
                .put("id", c.id)
                .put("name", c.name)
                .put("phone", c.phone)
                .put("address", c.address)
                .put("openingPaise", c.openingPaise)
                .put("plans", array(c.plans) {
                    JSONObject().put("from", it.from.toString()).put("m", it.morningMl).put("e", it.eveningMl).put("rate", it.rate)
                })
        })
        // Short keys: this list grows by a few entries a day for years.
        put("adjustments", array(d.adjustments) {
            JSONObject().put("c", it.customerId).put("d", it.date.toString()).put("s", it.shift.code).put("ml", it.ml)
        })
        put("payments", array(d.payments) {
            JSONObject()
                .put("id", it.id)
                .put("c", it.customerId)
                .put("d", it.date.toString())
                .put("paise", it.paise)
                .put("note", it.note)
        })
    }.toString()

    /** Throws on malformed input, so a bad restore never replaces good data. */
    fun decode(text: String): AppData {
        val o = JSONObject(text)
        require(o.getInt("version") <= VERSION) { "Backup is from a newer app version" }
        val b = o.getJSONObject("business")
        val data = AppData(
            business = Business(
                nameEn = b.getString("nameEn"),
                nameNe = b.getString("nameNe"),
                phone = b.getString("phone"),
                upiId = b.getString("upiId"),
                upiName = b.getString("upiName"),
                defaultRate = b.getInt("defaultRate"),
                countryCode = b.getString("countryCode"),
                // Optional: backups made before this field existed start from zero.
                openingTurnoverPaise = b.optLong("openingTurnoverPaise", 0),
            ),
            customers = o.getJSONArray("customers").objects().map { c ->
                Customer(
                    id = c.getString("id"),
                    name = c.getString("name"),
                    phone = c.getString("phone"),
                    address = c.getString("address"),
                    openingPaise = c.getLong("openingPaise"),
                    plans = c.getJSONArray("plans").objects().map {
                        Plan(LocalDate.parse(it.getString("from")), it.getInt("m"), it.getInt("e"), it.getInt("rate"))
                    }.sortedBy { it.from }.also { require(it.isNotEmpty()) },
                )
            },
            adjustments = o.getJSONArray("adjustments").objects().map {
                Adjustment(it.getString("c"), LocalDate.parse(it.getString("d")), shiftOf(it.getString("s")), it.getInt("ml"))
            },
            payments = o.getJSONArray("payments").objects().map {
                Payment(it.getString("id"), it.getString("c"), LocalDate.parse(it.getString("d")), it.getLong("paise"), it.getString("note"))
            },
        )
        val ids = data.customers.map { it.id }.toSet()
        require(data.adjustments.all { it.customerId in ids } && data.payments.all { it.customerId in ids }) { "Orphan entries" }
        return data
    }

    private val Shift.code: String get() = if (this == Shift.MORNING) "M" else "E"

    private fun shiftOf(code: String): Shift = when (code) {
        "M" -> Shift.MORNING
        "E" -> Shift.EVENING
        else -> throw IllegalArgumentException("Unknown shift $code")
    }

    private fun <T> array(items: List<T>, map: (T) -> JSONObject) = JSONArray(items.map(map))

    private fun JSONArray.objects(): List<JSONObject> = (0 until length()).map { getJSONObject(it) }
}
