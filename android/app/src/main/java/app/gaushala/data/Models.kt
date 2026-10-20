package app.gaushala.data

import java.time.LocalDate
import java.util.UUID

/**
 * Units, used everywhere:
 * - milk quantity: whole millilitres (Int); inputs allow at most 2 decimals of a litre, so always a multiple of 10
 * - rate: whole rupees per litre (Int)
 * - money: paise (Long), so ml × rate is exact and totals never drift by rounding
 */

enum class Shift { MORNING, EVENING }

/** What a customer normally gets, and at what rate, from [from] until the next plan. 0 ml in both shifts = stopped. */
data class Plan(val from: LocalDate, val morningMl: Int, val eveningMl: Int, val rate: Int) {
    fun ml(shift: Shift): Int = if (shift == Shift.MORNING) morningMl else eveningMl
    val stopped: Boolean get() = morningMl == 0 && eveningMl == 0
}

data class Customer(
    val id: String,
    val name: String,
    val phone: String = "",
    val address: String = "",
    /** Never empty, sorted by [Plan.from]. The first plan's date is when delivery started. */
    val plans: List<Plan>,
    /** Owed (positive) or paid ahead (negative) before the first delivery recorded here. */
    val openingPaise: Long = 0,
) {
    val start: LocalDate get() = plans.first().from

    /** Plan in force on [date]; null before the customer started. */
    fun planOn(date: LocalDate): Plan? = plans.lastOrNull { !it.from.isAfter(date) }

    /** Rate on [date]; an extra delivered before the start date is charged at the first rate. */
    fun rateOn(date: LocalDate): Int = (planOn(date) ?: plans.first()).rate

    fun usualMl(date: LocalDate, shift: Shift): Int = planOn(date)?.ml(shift) ?: 0

    fun currentPlan(today: LocalDate): Plan = planOn(today) ?: plans.first()
}

/** A day that differs from the plan: [ml] = 0 is a skipped delivery, more than usual is an extra. */
data class Adjustment(val customerId: String, val date: LocalDate, val shift: Shift, val ml: Int)

data class Payment(val id: String, val customerId: String, val date: LocalDate, val paise: Long, val note: String = "")

/** Shown on every bill. Names come in both bill languages because the bill can be sent in either. */
data class Business(
    val nameEn: String,
    val nameNe: String,
    val phone: String = "",
    val upiId: String = "",
    val upiName: String = "",
    /** Pre-filled for new customers; each customer keeps their own rate. */
    val defaultRate: Int,
    /** Added to 10-digit customer numbers when opening their WhatsApp chat. */
    val countryCode: String = "91",
    /** Sales before this app was used, added to turnover till date. 0 = count from the first delivery here. */
    val openingTurnoverPaise: Long = 0,
)

data class AppData(
    val business: Business,
    val customers: List<Customer> = emptyList(),
    val adjustments: List<Adjustment> = emptyList(),
    val payments: List<Payment> = emptyList(),
) {
    private val adjustmentIndex: Map<AdjustmentKey, Int> by lazy {
        HashMap<AdjustmentKey, Int>(adjustments.size * 2).apply {
            adjustments.forEach { put(AdjustmentKey(it.customerId, it.date, it.shift), it.ml) }
        }
    }

    /** Earliest adjustment per customer, so balances also count an extra given before the start date. */
    private val firstAdjustment: Map<String, LocalDate> by lazy {
        HashMap<String, LocalDate>().apply {
            adjustments.forEach { a -> merge(a.customerId, a.date) { x, y -> if (x.isBefore(y)) x else y } }
        }
    }

    private val paymentsByCustomer: Map<String, List<Payment>> by lazy {
        payments.groupBy { it.customerId }.mapValues { (_, list) -> list.sortedBy { it.date } }
    }

    fun customer(id: String): Customer? = customers.firstOrNull { it.id == id }

    fun adjustment(customerId: String, date: LocalDate, shift: Shift): Int? =
        adjustmentIndex[AdjustmentKey(customerId, date, shift)]

    /** First day anything can be charged to [c]. */
    fun origin(c: Customer): LocalDate =
        firstAdjustment[c.id]?.takeIf { it.isBefore(c.start) } ?: c.start

    fun paymentsOf(customerId: String): List<Payment> = paymentsByCustomer[customerId].orEmpty()

    private data class AdjustmentKey(val customerId: String, val date: LocalDate, val shift: Shift)
}

fun newId(): String = UUID.randomUUID().toString()
