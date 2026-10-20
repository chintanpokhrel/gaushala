package app.gaushala

import android.content.Context
import java.math.BigDecimal
import java.text.NumberFormat
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale

/**
 * The one place amounts, litres and dates become text (screens, bill image, sheet backup) and
 * typed text becomes amounts and litres. Dates follow the language of [Context]; digits stay
 * Latin with Indian grouping (1,00,000) in both languages, as on UPI apps.
 */
object Fmt {
    /** ₹ amount; paise shown only when there are some. */
    fun money(context: Context, paise: Long): String = context.getString(R.string.money, rupees(paise))

    fun rupees(paise: Long): String {
        // Built per call: NumberFormat is not thread-safe and the sheet backup formats off the main thread.
        val f = NumberFormat.getNumberInstance(Locale("en", "IN"))
        val decimals = if (paise % 100 == 0L) 0 else 2
        f.minimumFractionDigits = decimals
        f.maximumFractionDigits = decimals
        return f.format(BigDecimal.valueOf(paise, 2))
    }

    /** Plain number for UPI links and the sheet: 1250.5 */
    fun plainRupees(paise: Long): String = BigDecimal.valueOf(paise, 2).stripTrailingZeros().toPlainString()

    /** 1500 ml → "1.5". */
    fun litres(ml: Long): String = BigDecimal.valueOf(ml, 3).stripTrailingZeros().toPlainString()

    fun litres(ml: Int): String = litres(ml.toLong())

    /** "1.5 L" in the context's language. */
    fun litresUnit(context: Context, ml: Long): String = context.getString(R.string.litres, litres(ml))

    fun litresUnit(context: Context, ml: Int): String = litresUnit(context, ml.toLong())

    /** Typed litres ("1.5", "2") → ml. Null if not a number or more than 2 decimals. */
    fun parseLitres(text: String): Int? {
        val v = text.trim().replace(',', '.').toBigDecimalOrNull() ?: return null
        if (v.signum() < 0 || v.scale() > 2) return null
        return v.movePointRight(3).intValueExact()
    }

    /** Typed rupees ("1200", "1200.50") → paise. Negative allowed only when [allowNegative]. */
    fun parseRupees(text: String, allowNegative: Boolean = false): Long? {
        val v = text.trim().replace(",", "").toBigDecimalOrNull() ?: return null
        if ((!allowNegative && v.signum() < 0) || v.scale() > 2) return null
        return v.movePointRight(2).longValueExact()
    }

    fun locale(context: Context): Locale = context.resources.configuration.locales[0]

    private fun fmt(context: Context, p: String) = DateTimeFormatter.ofPattern(p, locale(context))

    fun date(context: Context, d: LocalDate): String = d.format(fmt(context, "d MMM yyyy"))
    fun dayMonth(context: Context, d: LocalDate): String = d.format(fmt(context, "d MMM"))
    fun weekdayDate(context: Context, d: LocalDate): String = d.format(fmt(context, "EEE, d MMM"))
    fun month(context: Context, m: YearMonth): String = m.format(fmt(context, "MMMM yyyy"))
    fun weekdayShort(context: Context, d: LocalDate): String = d.format(fmt(context, "EEEEE"))

    /** "1 – 31 Oct 2026", or the full dates when the range crosses months. */
    fun range(context: Context, from: LocalDate, to: LocalDate): String =
        if (YearMonth.from(from) == YearMonth.from(to)) context.getString(R.string.range, from.dayOfMonth.toString(), date(context, to))
        else context.getString(R.string.range, date(context, from), date(context, to))
}
