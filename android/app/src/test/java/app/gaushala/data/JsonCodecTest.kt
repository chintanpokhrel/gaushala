package app.gaushala.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.time.LocalDate

class JsonCodecTest {
    private val day = LocalDate.of(2026, 10, 1)
    private val data = AppData(
        business = Business("Giriraj Gaushala", "गिरिराज गौशाला", "98000 00000", "giriraj@okaxis", "Giriraj", 60, "91"),
        customers = listOf(
            Customer("a", "राम \"Ram\"", "9800000001", "Ward 3", listOf(Plan(day, 1000, 500, 60), Plan(day.plusDays(10), 1500, 0, 65)), -200_50),
        ),
        adjustments = listOf(Adjustment("a", day.plusDays(2), Shift.EVENING, 0), Adjustment("a", day.plusDays(3), Shift.MORNING, 2000)),
        payments = listOf(Payment("p", "a", day.plusDays(5), 1234_56, "UPI")),
    )

    @Test fun roundTripKeepsEverything() {
        assertEquals(data, JsonCodec.decode(JsonCodec.encode(data)))
    }

    @Test fun startingTurnoverRoundTripsAndDefaultsToZeroInOlderBackups() {
        val withStart = data.copy(business = data.business.copy(openingTurnoverPaise = 50_000_00))
        assertEquals(withStart, JsonCodec.decode(JsonCodec.encode(withStart)))
        val older = org.json.JSONObject(JsonCodec.encode(data))
            .apply { getJSONObject("business").remove("openingTurnoverPaise") }.toString()
        assertEquals(0L, JsonCodec.decode(older).business.openingTurnoverPaise)
    }

    @Test fun rejectsEntriesForUnknownCustomers() {
        val broken = data.copy(payments = data.payments + Payment("x", "ghost", day, 100))
        assertThrows(IllegalArgumentException::class.java) { JsonCodec.decode(JsonCodec.encode(broken)) }
    }

    @Test fun rejectsNewerVersions() {
        val newer = JsonCodec.encode(data).replace("\"version\":1", "\"version\":99")
        assertThrows(IllegalArgumentException::class.java) { JsonCodec.decode(newer) }
    }
}
