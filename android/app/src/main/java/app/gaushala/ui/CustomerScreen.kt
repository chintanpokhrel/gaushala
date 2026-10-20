package app.gaushala.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.gaushala.Fmt
import app.gaushala.Nav
import app.gaushala.R
import app.gaushala.Screen
import app.gaushala.data.AppData
import app.gaushala.data.Customer
import app.gaushala.data.Shift
import app.gaushala.data.Store
import app.gaushala.data.balanceOn
import app.gaushala.data.dayMl
import app.gaushala.data.defaultBillPeriod
import app.gaushala.data.ml
import app.gaushala.data.usage
import app.gaushala.data.withPayment
import app.gaushala.data.withQty
import app.gaushala.data.withRange
import app.gaushala.data.withoutPayment
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.TemporalAdjusters

@Composable
fun CustomerScreen(data: AppData, store: Store, id: String, nav: Nav) {
    val c = data.customer(id)
    if (c == null) {
        LaunchedEffect(Unit) { nav.back() }
        return
    }
    val context = LocalContext.current
    val today = LocalDate.now()
    var month by rememberSaveable { mutableStateOf(YearMonth.now()) }
    var dayOpen by remember { mutableStateOf<LocalDate?>(null) }
    var paying by remember { mutableStateOf(false) }
    var skipping by remember { mutableStateOf(false) }
    var deletingPayment by remember { mutableStateOf<String?>(null) }
    val balance = remember(data, id) { data.balanceOn(c, today) }

    Scaffold(
        topBar = {
            BackBar(c.name, nav::back) {
                IconButton(onClick = { nav.go(Screen.EditCustomer(c.id)) }) { Icon(Icons.Filled.Edit, stringResource(R.string.edit)) }
            }
        },
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (c.phone.isNotBlank() || c.address.isNotBlank()) {
                Text(listOf(c.phone, c.address).filter { it.isNotBlank() }.joinToString(" · "), color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(planSummary(c.currentPlan(today)))
            Card(Modifier.fillMaxWidth()) {
                Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                    Text(stringResource(R.string.balance_today), Modifier.weight(1f))
                    BalanceText(balance)
                }
            }
            Button(
                onClick = { defaultBillPeriod(today).let { (f, t) -> nav.go(Screen.Bill(c.id, f, t)) } },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.make_bill)) }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { paying = true }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.payment_received)) }
                OutlinedButton(onClick = { skipping = true }, modifier = Modifier.weight(1f)) { Text(stringResource(R.string.skip_days)) }
            }

            HorizontalDivider()
            Row(verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { month = month.minusMonths(1) }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.previous_month))
                }
                Text(Fmt.month(context, month), Modifier.weight(1f), textAlign = TextAlign.Center, style = MaterialTheme.typography.titleMedium)
                IconButton(onClick = { month = month.plusMonths(1) }) {
                    Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.next_month))
                }
            }
            MonthGrid(data, c, month) { dayOpen = it }
            val u = remember(data, id, month) { data.usage(c, month.atDay(1), month.atEndOfMonth()) }
            Text(stringResource(R.string.month_usage, litres(u.ml), money(u.paise)), style = MaterialTheme.typography.bodyMedium)

            HorizontalDivider()
            Text(stringResource(R.string.payments), style = MaterialTheme.typography.titleMedium)
            val payments = data.paymentsOf(c.id).asReversed()
            if (payments.isEmpty()) Text(stringResource(R.string.no_payments), color = MaterialTheme.colorScheme.onSurfaceVariant)
            payments.forEach { p ->
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Column(Modifier.weight(1f)) {
                        Text(money(p.paise), fontWeight = FontWeight.Bold)
                        Text(
                            listOf(Fmt.date(context, p.date), p.note).filter { it.isNotBlank() }.joinToString(" · "),
                            style = MaterialTheme.typography.bodySmall,
                        )
                    }
                    IconButton(onClick = { deletingPayment = p.id }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete)) }
                }
            }
        }
    }

    dayOpen?.let { d -> DayDialog(data, store, c, d) { dayOpen = null } }
    if (paying) PaymentDialog(c.id, balance, { p -> store.update { it.withPayment(p) } }) { paying = false }
    if (skipping) SkipDialog(store, c) { skipping = false }
    deletingPayment?.let { pid ->
        ConfirmDialog(
            stringResource(R.string.delete_payment), stringResource(R.string.delete_payment_confirm), stringResource(R.string.delete),
            { store.update { it.withoutPayment(pid) } },
        ) { deletingPayment = null }
    }
}

/** Calendar of one month: litres per day, red = skipped, green = extra. Tap a day to change it. */
@Composable
private fun MonthGrid(data: AppData, c: Customer, month: YearMonth, onDay: (LocalDate) -> Unit) {
    val context = LocalContext.current
    val first = month.atDay(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.SUNDAY))
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row {
            for (i in 0 until 7) {
                Text(
                    Fmt.weekdayShort(context, first.plusDays(i.toLong())), Modifier.weight(1f),
                    textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall,
                )
            }
        }
        var week = first
        while (!week.isAfter(month.atEndOfMonth())) {
            Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                for (i in 0 until 7) {
                    val d = week.plusDays(i.toLong())
                    Box(Modifier.weight(1f).aspectRatio(1f)) {
                        if (YearMonth.from(d) == month) {
                            val ml = data.dayMl(c, d)
                            val usual = c.usualMl(d, Shift.MORNING) + c.usualMl(d, Shift.EVENING)
                            val bg = when {
                                ml == 0 && usual > 0 -> MaterialTheme.colorScheme.errorContainer
                                ml > usual -> Color(0xFFD7F0DE)
                                ml < usual -> MaterialTheme.colorScheme.secondaryContainer
                                else -> MaterialTheme.colorScheme.surfaceContainerHigh
                            }
                            Column(
                                Modifier.fillMaxSize().background(bg, RoundedCornerShape(8.dp)).clickable { onDay(d) }.padding(4.dp),
                                horizontalAlignment = Alignment.CenterHorizontally,
                            ) {
                                Text(d.dayOfMonth.toString(), style = MaterialTheme.typography.labelSmall)
                                Text(
                                    if (ml == 0) "–" else Fmt.litres(ml),
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Bold,
                                    color = if (d == LocalDate.now()) MaterialTheme.colorScheme.primary else Color.Unspecified,
                                )
                            }
                        }
                    }
                }
            }
            week = week.plusWeeks(1)
        }
    }
}

/** Both shifts of one day. */
@Composable
private fun DayDialog(data: AppData, store: Store, c: Customer, date: LocalDate, onDismiss: () -> Unit) {
    val context = LocalContext.current
    var editing by remember { mutableStateOf<Shift?>(null) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(Fmt.weekdayDate(context, date)) },
        text = {
            Column {
                Shift.entries.forEach { s ->
                    Row(Modifier.fillMaxWidth().clickable { editing = s }.padding(vertical = 12.dp)) {
                        Text(stringResource(shiftLabel(s)), Modifier.weight(1f))
                        val ml = data.ml(c, date, s)
                        Text(if (ml == 0) stringResource(R.string.skip_short) else litres(ml), fontWeight = FontWeight.Bold)
                    }
                }
            }
        },
        confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.ok)) } },
    )
    editing?.let { s ->
        QtyDialog(
            title = stringResource(shiftLabel(s)),
            ml = data.ml(c, date, s),
            usualMl = c.usualMl(date, s),
            onSet = { ml -> store.update { it.withQty(c, date, s, ml) } },
            onDismiss = { editing = null },
        )
    }
}

/** Skip a run of days (customer away), or put them back to usual. */
@Composable
private fun SkipDialog(store: Store, c: Customer, onDismiss: () -> Unit) {
    var from by rememberSaveable { mutableStateOf(LocalDate.now()) }
    var to by rememberSaveable { mutableStateOf(LocalDate.now()) }
    var morning by rememberSaveable { mutableStateOf(true) }
    var evening by rememberSaveable { mutableStateOf(true) }
    val shifts = buildSet { if (morning) add(Shift.MORNING); if (evening) add(Shift.EVENING) }
    val valid = shifts.isNotEmpty() && !to.isBefore(from)
    fun apply(skip: Boolean) {
        store.update { it.withRange(c, from, to, shifts, skip) }
        onDismiss()
    }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.skip_days)) },
        text = {
            Column {
                DateField(stringResource(R.string.from_date), from, { from = it; if (to.isBefore(it)) to = it })
                DateField(stringResource(R.string.to_date), to, { to = it })
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(morning, { morning = it })
                    Text(stringResource(R.string.morning))
                    Checkbox(evening, { evening = it })
                    Text(stringResource(R.string.evening))
                }
            }
        },
        confirmButton = { TextButton(enabled = valid, onClick = { apply(skip = true) }) { Text(stringResource(R.string.skip)) } },
        dismissButton = {
            Row {
                TextButton(enabled = valid, onClick = { apply(skip = false) }) { Text(stringResource(R.string.back_to_usual)) }
                TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) }
            }
        },
    )
}
