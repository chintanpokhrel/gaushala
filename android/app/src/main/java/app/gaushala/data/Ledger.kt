package app.gaushala.data

import java.time.LocalDate
import java.time.YearMonth

/** Milk actually delivered: the day's adjustment if there is one, else the plan. */
fun AppData.ml(c: Customer, date: LocalDate, shift: Shift): Int =
    adjustment(c.id, date, shift) ?: c.usualMl(date, shift)

fun AppData.dayMl(c: Customer, date: LocalDate): Int = ml(c, date, Shift.MORNING) + ml(c, date, Shift.EVENING)

/** Litres sold at one rate within a period. */
data class RateLine(val rate: Int, val ml: Long, val paise: Long)

data class Usage(val ml: Long, val paise: Long, val lines: List<RateLine>)

/** ml × ₹/L ÷ 1000 × 100 paise. Exact because quantities are multiples of 10 ml. */
fun milkPaise(ml: Long, rate: Int): Long = ml * rate / 10

/** Milk delivered to [c] on [from]..[to] (inclusive), grouped by rate in the order rates first appear. */
fun AppData.usage(c: Customer, from: LocalDate, to: LocalDate): Usage {
    val byRate = LinkedHashMap<Int, Long>()
    var d = maxOf(from, origin(c))
    while (!d.isAfter(to)) {
        val ml = dayMl(c, d)
        if (ml > 0) byRate.merge(c.rateOn(d), ml.toLong(), Long::plus)
        d = d.plusDays(1)
    }
    val lines = byRate.map { (rate, ml) -> RateLine(rate, ml, milkPaise(ml, rate)) }
    return Usage(lines.sumOf { it.ml }, lines.sumOf { it.paise }, lines)
}

/** Owed (positive) or paid ahead (negative) after everything delivered and paid up to and including [date]. */
fun AppData.balanceOn(c: Customer, date: LocalDate): Long =
    c.openingPaise + usage(c, origin(c), date).paise - paymentsOf(c.id).filter { !it.date.isAfter(date) }.sumOf { it.paise }

data class DayQty(val date: LocalDate, val ml: Int, val usualMl: Int)

/** Everything a bill shows. The bill screen, the bill image and the tests all read this one definition. */
data class Statement(
    val customer: Customer,
    val from: LocalDate,
    val to: LocalDate,
    val days: List<DayQty>,
    val usage: Usage,
    /** Carried in from before [from]: positive = previous due, negative = advance. */
    val openingPaise: Long,
    /** Received from [from] up to the later of [to] and the day the bill is made. */
    val payments: List<Payment>,
) {
    val duePaise: Long get() = openingPaise + usage.paise - payments.sumOf { it.paise }
}

fun AppData.statement(c: Customer, from: LocalDate, to: LocalDate, today: LocalDate): Statement {
    val days = generateSequence(from) { it.plusDays(1) }.takeWhile { !it.isAfter(to) }
        .map { DayQty(it, dayMl(c, it), c.usualMl(it, Shift.MORNING) + c.usualMl(it, Shift.EVENING)) }
        .toList()
    val paidUntil = maxOf(to, today)
    return Statement(
        customer = c,
        from = from,
        to = to,
        days = days,
        usage = usage(c, from, to),
        openingPaise = balanceOn(c, from.minusDays(1)),
        payments = paymentsOf(c.id).filter { !it.date.isBefore(from) && !it.date.isAfter(paidUntil) },
    )
}

data class CustomerMonth(val customer: Customer, val ml: Long, val paise: Long, val receivedPaise: Long)

data class MonthSummary(val month: YearMonth, val ml: Long, val paise: Long, val receivedPaise: Long, val customers: List<CustomerMonth>)

/**
 * Milk sold and money received per month, newest first, counting only up to [today]
 * (planned deliveries later this month are not sales yet). Uses the same [usage] as bills.
 */
fun AppData.monthly(today: LocalDate): List<MonthSummary> {
    val cells = HashMap<YearMonth, MutableList<CustomerMonth>>()
    for (c in customers) {
        val received = paymentsOf(c.id).filter { !it.date.isAfter(today) }.groupBy { YearMonth.from(it.date) }
            .mapValues { (_, list) -> list.sumOf { it.paise } }
        var m = YearMonth.from(minOf(origin(c), received.keys.minOrNull()?.atDay(1) ?: origin(c)))
        while (!m.isAfter(YearMonth.from(today))) {
            val u = usage(c, m.atDay(1), minOf(m.atEndOfMonth(), today))
            val r = received[m] ?: 0
            if (u.ml > 0 || r != 0L) cells.getOrPut(m) { mutableListOf() } += CustomerMonth(c, u.ml, u.paise, r)
            m = m.plusMonths(1)
        }
    }
    return cells.map { (m, list) ->
        MonthSummary(m, list.sumOf { it.ml }, list.sumOf { it.paise }, list.sumOf { it.receivedPaise }, list.sortedByDescending { it.paise })
    }.sortedByDescending { it.month }
}

/** Starting amount plus all milk sold up to [today]. */
fun AppData.turnover(months: List<MonthSummary>): Long = business.openingTurnoverPaise + months.sumOf { it.paise }

/** Early in a month the bill is usually for last month; otherwise for this month up to its end. */
fun defaultBillPeriod(today: LocalDate): Pair<LocalDate, LocalDate> {
    val month = if (today.dayOfMonth <= LAST_MONTH_BILLING_DAYS) YearMonth.from(today).minusMonths(1) else YearMonth.from(today)
    return month.atDay(1) to month.atEndOfMonth()
}

private const val LAST_MONTH_BILLING_DAYS = 5

/** Customers expected or adjusted on [date] in [shift], i.e. the delivery list for that run. */
fun AppData.runFor(date: LocalDate, shift: Shift): List<Customer> =
    customers.filter { c -> c.usualMl(date, shift) > 0 || adjustment(c.id, date, shift) != null }
        .sortedBy { it.name.lowercase() }

// ---- Changes. Each returns new data; Store.update applies it. ----

/** Sets the quantity for one delivery; going back to the usual quantity removes the adjustment. */
fun AppData.withQty(c: Customer, date: LocalDate, shift: Shift, ml: Int): AppData {
    val rest = adjustments.filterNot { it.customerId == c.id && it.date == date && it.shift == shift }
    val changed = if (ml == c.usualMl(date, shift)) rest else rest + Adjustment(c.id, date, shift, ml.coerceAtLeast(0))
    return copy(adjustments = changed)
}

/** Skips (or, with [skip] = false, returns to usual) every delivery in the range for the given shifts. */
fun AppData.withRange(c: Customer, from: LocalDate, to: LocalDate, shifts: Set<Shift>, skip: Boolean): AppData {
    fun inRange(a: Adjustment) = a.customerId == c.id && a.shift in shifts && !a.date.isBefore(from) && !a.date.isAfter(to)
    val rest = adjustments.filterNot(::inRange)
    if (!skip) return copy(adjustments = rest)
    val skips = generateSequence(from) { it.plusDays(1) }.takeWhile { !it.isAfter(to) }
        .flatMap { d -> shifts.filter { c.usualMl(d, it) > 0 }.map { Adjustment(c.id, d, it, 0) } }
    return copy(adjustments = rest + skips)
}

/** Adds a plan or replaces the one starting the same day, keeping the list sorted. */
fun Customer.withPlan(plan: Plan): Customer = copy(plans = (plans.filter { it.from != plan.from } + plan).sortedBy { it.from })

fun AppData.upsert(c: Customer): AppData =
    copy(customers = if (customers.any { it.id == c.id }) customers.map { if (it.id == c.id) c else it } else customers + c)

fun AppData.withoutCustomer(id: String): AppData = copy(
    customers = customers.filter { it.id != id },
    adjustments = adjustments.filter { it.customerId != id },
    payments = payments.filter { it.customerId != id },
)

fun AppData.withPayment(p: Payment): AppData = copy(payments = payments.filter { it.id != p.id } + p)

fun AppData.withoutPayment(id: String): AppData = copy(payments = payments.filter { it.id != id })
