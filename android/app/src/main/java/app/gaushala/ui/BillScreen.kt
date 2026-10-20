package app.gaushala.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import app.gaushala.BillImage
import app.gaushala.Fmt
import app.gaushala.Lang
import app.gaushala.Nav
import app.gaushala.R
import app.gaushala.Screen
import app.gaushala.data.AppData
import app.gaushala.data.Store
import app.gaushala.data.statement
import app.gaushala.data.withPayment
import app.gaushala.shareBill
import java.time.LocalDate
import java.time.YearMonth

/**
 * Bill for any period. What is previewed is the exact image that gets sent. "Next" moves to the
 * next customer with the same period, so month-end billing is: send, next, send, next.
 */
@Composable
fun BillScreen(data: AppData, store: Store, s: Screen.Bill, nav: Nav) {
    val c = data.customer(s.customerId)
    if (c == null) {
        LaunchedEffect(Unit) { nav.back() }
        return
    }
    val context = LocalContext.current
    val today = LocalDate.now()
    var lang by rememberSaveable { mutableStateOf(Lang.get(context)) }
    var paying by remember { mutableStateOf(false) }
    val billContext = remember(lang) { Lang.wrap(context, lang) }

    val statement = remember(data, s) { data.statement(c, s.from, s.to, today) }
    val image = remember(statement, lang, data.business) { BillImage.render(billContext, data.business, statement, lang == Lang.NE) }
    val ordered = data.customers.sortedBy { it.name.lowercase() }
    val next = ordered.getOrNull(ordered.indexOfFirst { it.id == c.id } + 1)

    fun period(from: LocalDate, to: LocalDate) = nav.replace(s.copy(from = from, to = to))

    Scaffold(
        topBar = {
            BackBar(c.name, nav::back) {
                if (next != null) {
                    IconButton(onClick = { nav.replace(s.copy(customerId = next.id)) }) {
                        Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.next_customer))
                    }
                }
            }
        },
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            val thisMonth = YearMonth.from(today)
            val lastMonth = thisMonth.minusMonths(1)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(
                    selected = s.from == thisMonth.atDay(1) && s.to == thisMonth.atEndOfMonth(),
                    onClick = { period(thisMonth.atDay(1), thisMonth.atEndOfMonth()) },
                    label = { Text(stringResource(R.string.this_month)) },
                )
                FilterChip(
                    selected = s.from == thisMonth.atDay(1) && s.to == today,
                    onClick = { period(thisMonth.atDay(1), today) },
                    label = { Text(stringResource(R.string.till_today)) },
                )
                FilterChip(
                    selected = s.from == lastMonth.atDay(1) && s.to == lastMonth.atEndOfMonth(),
                    onClick = { period(lastMonth.atDay(1), lastMonth.atEndOfMonth()) },
                    label = { Text(stringResource(R.string.last_month)) },
                )
            }
            DateField(stringResource(R.string.from_date), s.from, { period(it, maxOf(it, s.to)) })
            DateField(stringResource(R.string.to_date), s.to, { period(minOf(s.from, it), it) })
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.bill_language))
                FilterChip(selected = lang == Lang.EN, onClick = { lang = Lang.EN }, label = { Text(stringResource(R.string.language_en)) })
                FilterChip(selected = lang == Lang.NE, onClick = { lang = Lang.NE }, label = { Text(stringResource(R.string.language_ne)) })
            }

            Card(Modifier.fillMaxWidth()) {
                Image(image.asImageBitmap(), null, Modifier.fillMaxWidth(), contentScale = ContentScale.FillWidth)
            }

            Button(
                onClick = {
                    val caption = billContext.getString(
                        R.string.bill_caption, Fmt.range(billContext, s.from, s.to), Fmt.money(billContext, statement.duePaise.coerceAtLeast(0)),
                    )
                    shareBill(context, image, c.phone, data.business.countryCode, caption)
                },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(if (c.phone.isBlank()) R.string.share_bill else R.string.send_whatsapp)) }
            OutlinedButton(onClick = { paying = true }, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(R.string.payment_received))
            }
        }
    }

    if (paying) PaymentDialog(c.id, statement.duePaise, { p -> store.update { it.withPayment(p) } }) { paying = false }
}
