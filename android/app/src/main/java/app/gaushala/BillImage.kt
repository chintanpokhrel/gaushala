package app.gaushala

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.net.Uri
import androidx.core.content.FileProvider
import app.gaushala.data.Business
import app.gaushala.data.Statement
import com.google.zxing.BarcodeFormat
import com.google.zxing.EncodeHintType
import com.google.zxing.qrcode.QRCodeWriter
import java.io.File
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.TemporalAdjusters

/**
 * Draws the bill as a PNG. Drawn directly (no screen capture), so it looks the same on every
 * phone; [context] decides the bill language, so a bill can go out in English or Nepali
 * whatever the app language is.
 */
object BillImage {
    private const val W = 1080
    private const val PAD = 56f
    private val INK = Color.rgb(0x1C, 0x24, 0x2E)
    private val MUTED = Color.rgb(0x5E, 0x6B, 0x78)
    private val BRAND = Color.rgb(0x2F, 0x5D, 0x8A)
    private val RULE = Color.rgb(0xDD, 0xE3, 0xEA)
    private val SKIP = Color.rgb(0xC6, 0x28, 0x28)
    private val SKIP_BG = Color.rgb(0xFD, 0xEC, 0xEC)
    private val EXTRA = Color.rgb(0x1B, 0x7A, 0x3D)
    private val EXTRA_BG = Color.rgb(0xE6, 0xF4, 0xEA)

    fun render(context: Context, business: Business, s: Statement, isNepali: Boolean): Bitmap {
        val name = if (isNepali) business.nameNe.ifBlank { business.nameEn } else business.nameEn.ifBlank { business.nameNe }
        val cell = (W - 2 * PAD) / 7f
        val cellH = 104f
        val weeks = weeksOf(s.from, s.to)
        val summary = summaryRows(context, s)
        val showQr = business.upiId.isNotBlank() && s.duePaise > 0
        val height = (230 + 150 + 56 + weeks.size * cellH + 70 + summary.size * 66 + 20 + 40 + (if (showQr) 340 else 90) + 90).toInt()

        val bmp = Bitmap.createBitmap(W, height, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(Color.WHITE)

        // Header band: business name, phone, bill title and period.
        c.drawRect(0f, 0f, W.toFloat(), 230f, fill(BRAND))
        c.drawText(name, PAD, 92f, text(60f, Color.WHITE, bold = true))
        if (business.phone.isNotBlank()) c.drawText(context.getString(R.string.bill_phone, business.phone), PAD, 146f, text(36f, Color.WHITE))
        c.drawText(
            context.getString(R.string.bill_title) + "  ·  " + Fmt.range(context, s.from, s.to),
            PAD, 200f, text(38f, Color.WHITE, bold = true),
        )

        var y = 230f + 70f
        c.drawText(s.customer.name, PAD, y, text(46f, INK, bold = true))
        if (s.customer.address.isNotBlank()) c.drawText(s.customer.address, PAD, y + 50f, text(34f, MUTED))
        y = 230f + 150f

        // Calendar: weeks start Sunday; days outside the period are left blank.
        val dayLabel = text(30f, MUTED, bold = true, center = true)
        var d = weeks.first()
        for (i in 0 until 7) {
            c.drawText(Fmt.weekdayShort(context, d.plusDays(i.toLong())), PAD + cell * i + cell / 2, y + 36f, dayLabel)
        }
        y += 56f
        val byDate = s.days.associateBy { it.date }
        val num = text(26f, MUTED)
        val qty = text(38f, INK, bold = true, center = true)
        for (week in weeks) {
            for (i in 0 until 7) {
                d = week.plusDays(i.toLong())
                val day = byDate[d] ?: continue
                val x = PAD + cell * i
                val box = RectF(x + 4, y + 4, x + cell - 4, y + cellH - 4)
                val (bg, fg) = when {
                    day.ml == 0 && day.usualMl > 0 -> SKIP_BG to SKIP
                    day.ml > day.usualMl -> EXTRA_BG to EXTRA
                    else -> Color.rgb(0xF5, 0xF7, 0xFA) to INK
                }
                c.drawRoundRect(box, 14f, 14f, fill(bg))
                c.drawText(d.dayOfMonth.toString(), box.left + 12, box.top + 30, num)
                qty.color = fg
                c.drawText(if (day.ml == 0) "–" else Fmt.litres(day.ml), box.centerX(), box.bottom - 18, qty)
            }
            y += cellH
        }
        c.drawText(context.getString(R.string.bill_legend), PAD, y + 44f, text(28f, MUTED))
        y += 70f

        // Totals.
        for (row in summary) {
            y += if (row.strong) 86f else 66f
            if (row.strong) c.drawLine(PAD, y - 58f, W - PAD, y - 58f, stroke(RULE))
            val p = text(if (row.strong) 44f else 36f, if (row.strong) INK else MUTED, bold = row.strong)
            c.drawText(row.label, PAD, y, p)
            p.textAlign = Paint.Align.RIGHT
            c.drawText(row.amount, W - PAD, y, p)
        }
        y += 40f

        if (showQr) {
            val size = 300
            c.drawBitmap(qr(upiLink(context, business, name, s), size), PAD - 14, y + 10, null)
            val x = PAD + size + 24
            c.drawText(context.getString(R.string.bill_scan_to_pay), x, y + 90f, text(38f, INK, bold = true))
            c.drawText(context.getString(R.string.bill_upi_id, business.upiId), x, y + 150f, text(34f, INK))
            c.drawText(Fmt.money(context, s.duePaise), x, y + 220f, text(52f, BRAND, bold = true))
            y += 340f
        } else {
            val msg = context.getString(if (s.duePaise < 0) R.string.bill_advance_note else R.string.bill_nothing_due)
            c.drawText(msg, PAD, y + 60f, text(38f, EXTRA, bold = true))
            y += 90f
        }
        c.drawText(context.getString(R.string.bill_thanks), W / 2f, y + 60f, text(34f, MUTED, center = true))
        return bmp
    }

    private data class Row(val label: String, val amount: String, val strong: Boolean = false)

    private fun summaryRows(context: Context, s: Statement): List<Row> = buildList {
        fun money(p: Long) = Fmt.money(context, p)
        for (line in s.usage.lines) {
            add(Row(context.getString(R.string.bill_milk_line, Fmt.litresUnit(context, line.ml), money(line.rate * 100L)), money(line.paise)))
        }
        if (s.usage.lines.isEmpty()) add(Row(context.getString(R.string.bill_no_milk), money(0)))
        if (s.openingPaise > 0) add(Row(context.getString(R.string.bill_previous_due), money(s.openingPaise)))
        if (s.openingPaise < 0) add(Row(context.getString(R.string.bill_previous_advance), "− " + money(-s.openingPaise)))
        for (p in s.payments) add(Row(context.getString(R.string.bill_received_on, Fmt.dayMonth(context, p.date)), "− " + money(p.paise)))
        add(
            if (s.duePaise >= 0) Row(context.getString(R.string.bill_total_due), money(s.duePaise), strong = true)
            else Row(context.getString(R.string.bill_advance), money(-s.duePaise), strong = true)
        )
    }

    /** Sundays starting each calendar row that contains a day of the period. */
    private fun weeksOf(from: LocalDate, to: LocalDate): List<LocalDate> =
        generateSequence(from.with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY))) { it.plusWeeks(1) }
            .takeWhile { !it.isAfter(to) }.toList()

    /** UPI deep link; any UPI app opens it with the amount filled in. */
    fun upiLink(context: Context, business: Business, payee: String, s: Statement): String {
        // Always English: some UPI apps reject a payment note in other scripts.
        val en = Lang.wrap(context, Lang.EN)
        val note = en.getString(R.string.upi_note, Fmt.range(en, s.from, s.to))
        return "upi://pay?pa=" + Uri.encode(business.upiId.trim()) +
            "&pn=" + Uri.encode(business.upiName.ifBlank { payee }) +
            "&am=" + Fmt.plainRupees(s.duePaise) +
            "&cu=INR&tn=" + Uri.encode(note)
    }

    private fun qr(content: String, size: Int): Bitmap {
        val m = QRCodeWriter().encode(content, BarcodeFormat.QR_CODE, size, size, mapOf(EncodeHintType.MARGIN to 1))
        val px = IntArray(size * size) { i -> if (m[i % size, i / size]) Color.BLACK else Color.WHITE }
        return Bitmap.createBitmap(px, size, size, Bitmap.Config.ARGB_8888)
    }

    private fun text(size: Float, color: Int, bold: Boolean = false, center: Boolean = false) = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = size
        this.color = color
        typeface = if (bold) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
        if (center) textAlign = Paint.Align.CENTER
    }

    private fun fill(color: Int) = Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = color }

    private fun stroke(color: Int) = Paint().apply { this.color = color; strokeWidth = 3f }
}

/** Saves the bill and opens WhatsApp on the customer's chat; falls back to the share sheet. */
fun shareBill(context: Context, bmp: Bitmap, phone: String, countryCode: String, caption: String) {
    val dir = File(context.cacheDir, "bills").apply { mkdirs() }
    val file = File(dir, "bill.png")
    file.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
    val uri = FileProvider.getUriForFile(context, context.packageName + ".files", file)
    fun send() = Intent(Intent.ACTION_SEND).apply {
        type = "image/png"
        putExtra(Intent.EXTRA_STREAM, uri)
        putExtra(Intent.EXTRA_TEXT, caption)
        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
    }

    val jid = whatsAppNumber(phone, countryCode)?.let { "$it@s.whatsapp.net" }
    if (jid != null) {
        for (pkg in listOf("com.whatsapp", "com.whatsapp.w4b")) {
            try {
                // "jid" opens that chat directly. Not a documented WhatsApp API: if it stops working,
                // WhatsApp still opens with the bill attached and asks for the contact.
                context.startActivity(send().setPackage(pkg).putExtra("jid", jid))
                return
            } catch (_: ActivityNotFoundException) {
            }
        }
    }
    context.startActivity(Intent.createChooser(send(), context.getString(R.string.share_bill)))
}

/** Digits only, with the country code added to a 10-digit local number. */
fun whatsAppNumber(phone: String, countryCode: String): String? {
    val digits = phone.filter(Char::isDigit).trimStart('0')
    return when {
        digits.length == 10 -> countryCode.filter(Char::isDigit) + digits
        digits.length > 10 -> digits
        else -> null
    }
}
