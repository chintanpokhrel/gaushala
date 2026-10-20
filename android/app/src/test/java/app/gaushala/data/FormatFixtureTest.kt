package app.gaushala.data

import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File
import java.time.LocalDate

/** The web app reads and writes the same backup format; these files in /fixtures are the shared samples. */
class FormatFixtureTest {
    private val fixtures = File("../../fixtures")
    private val day = LocalDate.of(2026, 10, 1)
    private val data = AppData(
        business = Business("Giriraj Gaushala", "गिरिराज गौशाला", "98000 00000", "giriraj@okaxis", "Giriraj", 60, "91", 50_000_00),
        customers = listOf(
            Customer("a", "राम \"Ram\"", "9800000001", "Ward 3", listOf(Plan(day, 1000, 500, 60), Plan(day.plusDays(10), 1500, 0, 65)), -200_50),
        ),
        adjustments = listOf(Adjustment("a", day.plusDays(2), Shift.EVENING, 0), Adjustment("a", day.plusDays(3), Shift.MORNING, 2000)),
        payments = listOf(Payment("p", "a", day.plusDays(5), 1234_56, "UPI")),
    )

    private fun read(name: String) = File(fixtures, name).readText()

    @Test fun readsWebAppBackup() {
        assertEquals(data, JsonCodec.decode(read("backup-v1-web.json")))
    }

    @Test fun readsOwnBackupSample() {
        assertEquals(data, JsonCodec.decode(read("backup-v1-android.json")))
    }
}
