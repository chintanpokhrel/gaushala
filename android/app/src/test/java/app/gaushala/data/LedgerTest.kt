package app.gaushala.data

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.time.LocalDate

class LedgerTest {
    private fun d(day: Int, month: Int = 10) = LocalDate.of(2026, month, day)

    /** 1 L morning, 0.5 L evening at ₹60 from 1 Oct. */
    private val ram = Customer("r", "Ram", plans = listOf(Plan(d(1), 1000, 500, 60)))
    private val base = AppData(Business("G", "ग", defaultRate = 60), customers = listOf(ram))

    @Test fun fullMonthOnPlanIsLitresTimesRate() {
        val u = base.usage(ram, d(1), d(31))
        assertEquals(31 * 1500L, u.ml)
        assertEquals(31 * 1500L * 60 / 10, u.paise) // 46.5 L × ₹60 = ₹2,790
        assertEquals(279_000L, u.paise)
    }

    @Test fun skipAndExtraChangeOnlyThatDelivery() {
        val data = base.withQty(ram, d(5), Shift.MORNING, 0).withQty(ram, d(6), Shift.EVENING, 1500)
        assertEquals(500, data.dayMl(ram, d(5)))
        assertEquals(2500, data.dayMl(ram, d(6)))
        assertEquals((31 * 1500L - 1000 + 1000) * 6, data.usage(ram, d(1), d(31)).paise)
    }

    @Test fun settingBackToUsualRemovesTheAdjustment() {
        val data = base.withQty(ram, d(5), Shift.MORNING, 0).withQty(ram, d(5), Shift.MORNING, 1000)
        assertEquals(emptyList<Adjustment>(), data.adjustments)
        assertNull(data.adjustment("r", d(5), Shift.MORNING))
    }

    @Test fun rangeSkipCoversOnlyChosenShiftsAndCanBeUndone() {
        val skipped = base.withRange(ram, d(10), d(12), setOf(Shift.EVENING), skip = true)
        assertEquals(3, skipped.adjustments.size)
        assertEquals(1000, skipped.dayMl(ram, d(11)))
        val undone = skipped.withRange(ram, d(10), d(12), setOf(Shift.EVENING), skip = false)
        assertEquals(1500, undone.dayMl(ram, d(11)))
    }

    @Test fun rateChangeAppliesFromItsDateOnly() {
        val raised = ram.withPlan(Plan(d(16), 1000, 500, 70))
        val data = base.upsert(raised)
        val u = data.usage(raised, d(1), d(31))
        assertEquals(listOf(60, 70), u.lines.map { it.rate })
        assertEquals(15 * 1500L, u.lines[0].ml)
        assertEquals(16 * 1500L, u.lines[1].ml)
        assertEquals(15 * 1500L * 6 + 16 * 1500L * 7, u.paise)
    }

    @Test fun nothingIsChargedBeforeStartUnlessAnExtraWasGiven() {
        assertEquals(0L, base.usage(ram, d(1, 9), d(30, 9)).ml)
        val early = base.withQty(ram, d(28, 9), Shift.MORNING, 1000)
        assertEquals(1000L, early.usage(ram, d(1, 9), d(30, 9)).ml)
        assertEquals(60_00L, early.balanceOn(ram, d(30, 9)))
    }

    @Test fun quarterLitresAtOddRateStayExact() {
        val c = Customer("q", "Q", plans = listOf(Plan(d(1), 250, 0, 65)))
        val data = base.upsert(c)
        assertEquals(31 * 1625L, data.usage(c, d(1), d(31)).paise) // ₹16.25 a day
    }

    @Test fun statementCarriesBalanceAndCountsPaymentsUpToBillDay() {
        val data = base.upsert(ram.copy(openingPaise = 500_00))
            .withPayment(Payment("p1", "r", d(31, 10), 2000_00))
            .withPayment(Payment("p2", "r", d(3, 11), 1000_00))
        val c = data.customer("r")!!
        val nov = data.statement(c, d(1, 11), d(30, 11), today = d(4, 11))
        // Opening ₹500 + October ₹2,790 − ₹2,000 paid on 31 Oct.
        assertEquals(1290_00L, nov.openingPaise)
        assertEquals(listOf("p2"), nov.payments.map { it.id })
        assertEquals(1290_00L + 30 * 90_00L - 1000_00L, nov.duePaise)

        // October's bill made on 4 Nov also shows the 3 Nov payment.
        val oct = data.statement(c, d(1), d(31), today = d(4, 11))
        assertEquals(500_00L, oct.openingPaise)
        assertEquals(listOf("p1", "p2"), oct.payments.map { it.id })
    }

    @Test fun advanceShowsAsNegativeDue() {
        val data = base.withPayment(Payment("p", "r", d(1), 3000_00))
        assertEquals(279_000L - 300_000L, data.statement(ram, d(1), d(31), d(31)).duePaise)
    }

    @Test fun runListsPlannedAndAdjustedCustomersOnly() {
        val sita = Customer("s", "Sita", plans = listOf(Plan(d(1), 0, 1000, 60)))
        val data = base.upsert(sita)
        assertEquals(listOf("Ram"), data.runFor(d(5), Shift.MORNING).map { it.name })
        val extra = data.withQty(sita, d(5), Shift.MORNING, 500)
        assertEquals(listOf("Ram", "Sita"), extra.runFor(d(5), Shift.MORNING).map { it.name })
    }

    @Test fun monthlyCountsOnlyUpToTodayAndSplitsByCustomer() {
        val sita = Customer("s", "Sita", plans = listOf(Plan(d(1), 0, 1000, 60)))
        val data = base.upsert(sita).withPayment(Payment("p", "r", d(2), 500_00))
            .withPayment(Payment("future", "r", d(20), 100_00))
        val months = data.monthly(today = d(10))
        assertEquals(listOf(d(1).let { java.time.YearMonth.from(it) }), months.map { it.month })
        val oct = months.single()
        assertEquals(10 * 1500L + 10 * 1000L, oct.ml)
        assertEquals(10 * 90_00L + 10 * 60_00L, oct.paise)
        assertEquals(500_00L, oct.receivedPaise)
        assertEquals(listOf("Ram", "Sita"), oct.customers.map { it.customer.name })
        assertEquals(oct.paise, data.turnover(months))
        val withStart = data.copy(business = data.business.copy(openingTurnoverPaise = 10_000_00))
        assertEquals(oct.paise + 10_000_00, withStart.turnover(months))
    }

    @Test fun defaultPeriodIsLastMonthEarlyInMonthElseThisMonth() {
        assertEquals(d(1, 9) to d(30, 9), defaultBillPeriod(d(3)))
        assertEquals(d(1) to d(31), defaultBillPeriod(d(20)))
    }
}
