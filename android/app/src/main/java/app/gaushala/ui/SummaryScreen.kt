package app.gaushala.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Edit
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.gaushala.Fmt
import app.gaushala.R
import app.gaushala.data.AppData
import app.gaushala.data.MonthSummary
import app.gaushala.data.Store
import app.gaushala.data.balanceOn
import app.gaushala.data.monthly
import app.gaushala.data.turnover
import java.time.LocalDate
import java.time.YearMonth

/** Turnover till date, then month by month; tap a month to see each customer's share. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SummaryScreen(data: AppData, store: Store, modifier: Modifier) {
    val today = LocalDate.now()
    val months = remember(data) { data.monthly(today) }
    val toCollect = remember(data) { data.customers.sumOf { data.balanceOn(it, today).coerceAtLeast(0) } }
    var open by rememberSaveable { mutableStateOf<YearMonth?>(null) }
    var editingStart by remember { mutableStateOf(false) }
    val start = data.business.openingTurnoverPaise

    Scaffold(modifier, topBar = { TopAppBar(title = { Text(stringResource(R.string.tab_summary)) }) }) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                Card(Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)) {
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(stringResource(R.string.turnover_till_date), style = MaterialTheme.typography.titleSmall)
                            Text(money(data.turnover(months)), style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
                            Text(
                                if (start != 0L) stringResource(R.string.includes_starting, money(start))
                                else stringResource(R.string.no_starting_amount),
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        IconButton(onClick = { editingStart = true }) { Icon(Icons.Filled.Edit, stringResource(R.string.starting_amount)) }
                    }
                }
            }
            item {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Stat(stringResource(R.string.received_till_date), money(months.sumOf { it.receivedPaise }), Modifier.weight(1f))
                    Stat(stringResource(R.string.still_to_collect), money(toCollect), Modifier.weight(1f))
                }
            }
            item { Text(stringResource(R.string.by_month), style = MaterialTheme.typography.titleMedium, modifier = Modifier.padding(top = 8.dp)) }
            if (months.isEmpty()) {
                item { Text(stringResource(R.string.no_sales_yet), color = MaterialTheme.colorScheme.onSurfaceVariant) }
            }
            items(months, key = { it.month.toString() }) { m ->
                MonthCard(m, expanded = open == m.month) { open = if (open == m.month) null else m.month }
            }
        }
    }

    if (editingStart) StartDialog(start, { p -> store.update { it.copy(business = it.business.copy(openingTurnoverPaise = p)) } }) { editingStart = false }
}

@Composable
private fun Stat(label: String, value: String, modifier: Modifier) {
    Card(modifier) {
        Column(Modifier.padding(16.dp)) {
            Text(label, style = MaterialTheme.typography.bodySmall)
            Text(value, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun MonthCard(m: MonthSummary, expanded: Boolean, onClick: () -> Unit) {
    val context = LocalContext.current
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Row {
                Text(Fmt.month(context, m.month), Modifier.weight(1f), style = MaterialTheme.typography.titleMedium)
                Text(money(m.paise), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.Bold)
            }
            Text(
                stringResource(R.string.month_line, litres(m.ml), money(m.receivedPaise)),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
            if (expanded) {
                HorizontalDivider(Modifier.padding(vertical = 4.dp))
                m.customers.forEach { cm ->
                    Row {
                        Column(Modifier.weight(1f)) {
                            Text(cm.customer.name)
                            Text(
                                stringResource(R.string.month_line, litres(cm.ml), money(cm.receivedPaise)),
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                        Text(money(cm.paise))
                    }
                }
            }
        }
    }
}

/** Optional sales total from before the app; empty means start from zero. */
@Composable
private fun StartDialog(currentPaise: Long, onSave: (Long) -> Unit, onDismiss: () -> Unit) {
    var text by rememberSaveable { mutableStateOf(if (currentPaise != 0L) Fmt.plainRupees(currentPaise) else "") }
    val paise = if (text.isBlank()) 0L else Fmt.parseRupees(text)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.starting_amount)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField(stringResource(R.string.amount_rupees), text, { text = it })
                Text(stringResource(R.string.starting_amount_hint), style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(enabled = paise != null, onClick = { onSave(paise!!); onDismiss() }) { Text(stringResource(R.string.save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}
