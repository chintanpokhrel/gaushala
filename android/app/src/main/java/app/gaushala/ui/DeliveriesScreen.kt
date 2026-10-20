package app.gaushala.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.gaushala.Nav
import app.gaushala.R
import app.gaushala.Screen
import app.gaushala.SheetBackup
import app.gaushala.data.AppData
import app.gaushala.data.Customer
import app.gaushala.data.Shift
import app.gaushala.data.Store
import app.gaushala.data.ml
import app.gaushala.data.runFor
import app.gaushala.data.withQty
import java.time.LocalDate
import java.time.LocalTime

/** One tap of − / + changes a delivery by this much. Exact amounts: tap the quantity. */
private const val STEP_ML = 500

/** Afternoon onwards the app opens on the evening run. */
private val EVENING_FROM: LocalTime = LocalTime.of(14, 0)

/**
 * The daily screen: who gets milk on this run, and how much. Usual quantities come from each
 * customer's plan, so on a normal day nothing needs to be touched; only skips and extras are marked.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveriesScreen(data: AppData, store: Store, backup: SheetBackup, nav: Nav, modifier: Modifier) {
    var date by rememberSaveable { mutableStateOf(LocalDate.now()) }
    var shift by rememberSaveable { mutableStateOf(if (LocalTime.now().isBefore(EVENING_FROM)) Shift.MORNING else Shift.EVENING) }
    var editing by remember { mutableStateOf<Customer?>(null) }
    var pickingOther by remember { mutableStateOf(false) }
    val status by backup.status.collectAsState()

    val run = remember(data, date, shift) { data.runFor(date, shift) }
    val totals = remember(data, date) {
        Shift.entries.associateWith { s -> data.runFor(date, s).sumOf { data.ml(it, date, s) } }
    }

    fun set(c: Customer, ml: Int) = store.update { it.withQty(c, date, shift, ml) }

    Scaffold(modifier, topBar = { TopAppBar(title = { Text(stringResource(R.string.app_name)) }) }) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item { BackupBanner(status) { nav.tab(Screen.Settings) } }
            item { DateStepper(date, { date = it }, Modifier.fillMaxWidth()) }
            item {
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    Shift.entries.forEachIndexed { i, s ->
                        SegmentedButton(
                            selected = shift == s,
                            onClick = { shift = s },
                            shape = SegmentedButtonDefaults.itemShape(i, Shift.entries.size),
                        ) { Text(stringResource(R.string.shift_total, stringResource(shiftLabel(s)), litres(totals.getValue(s)))) }
                    }
                }
            }
            if (run.isEmpty()) {
                item {
                    Text(
                        stringResource(if (data.customers.isEmpty()) R.string.no_customers_yet else R.string.nobody_on_run),
                        Modifier.fillMaxWidth().padding(vertical = 24.dp),
                        textAlign = TextAlign.Center,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(run, key = { it.id }) { c ->
                DeliveryRow(
                    name = c.name,
                    ml = data.ml(c, date, shift),
                    usualMl = c.usualMl(date, shift),
                    onMinus = { set(c, (data.ml(c, date, shift) - STEP_ML).coerceAtLeast(0)) },
                    onPlus = { set(c, data.ml(c, date, shift) + STEP_ML) },
                    onEdit = { editing = c },
                    onOpen = { nav.go(Screen.Customer(c.id)) },
                )
            }
            if (data.customers.size > run.size) {
                item {
                    OutlinedButton(onClick = { pickingOther = true }, modifier = Modifier.fillMaxWidth()) {
                        Text(stringResource(R.string.extra_for_other))
                    }
                }
            }
        }
    }

    editing?.let { c ->
        QtyDialog(
            title = c.name,
            ml = data.ml(c, date, shift),
            usualMl = c.usualMl(date, shift),
            onSet = { set(c, it) },
            onDismiss = { editing = null },
        )
    }
    if (pickingOther) {
        val others = data.customers.filter { c -> run.none { it.id == c.id } }.sortedBy { it.name.lowercase() }
        AlertDialog(
            onDismissRequest = { pickingOther = false },
            title = { Text(stringResource(R.string.extra_for_other)) },
            text = {
                LazyColumn {
                    items(others, key = { it.id }) { c ->
                        Text(
                            c.name,
                            Modifier.fillMaxWidth().clickable { pickingOther = false; editing = c }.padding(vertical = 12.dp),
                            style = MaterialTheme.typography.bodyLarge,
                        )
                    }
                }
            },
            confirmButton = {},
            dismissButton = { TextButton(onClick = { pickingOther = false }) { Text(stringResource(R.string.cancel)) } },
        )
    }
}

fun shiftLabel(s: Shift): Int = if (s == Shift.MORNING) R.string.morning else R.string.evening

@Composable
private fun DeliveryRow(
    name: String,
    ml: Int,
    usualMl: Int,
    onMinus: () -> Unit,
    onPlus: () -> Unit,
    onEdit: () -> Unit,
    onOpen: () -> Unit,
) {
    val (container, note) = when {
        ml == 0 -> MaterialTheme.colorScheme.errorContainer to stringResource(R.string.skipped)
        ml > usualMl -> MaterialTheme.colorScheme.tertiaryContainer to stringResource(R.string.extra_of_usual, litres(usualMl))
        ml < usualMl -> MaterialTheme.colorScheme.secondaryContainer to stringResource(R.string.less_than_usual, litres(usualMl))
        else -> MaterialTheme.colorScheme.surfaceContainerLow to null
    }
    Card(colors = CardDefaults.cardColors(containerColor = container)) {
        Row(Modifier.padding(start = 16.dp, end = 8.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f).clickable(onClick = onOpen)) {
                Text(name, style = MaterialTheme.typography.titleMedium)
                note?.let { Text(it, style = MaterialTheme.typography.bodySmall) }
            }
            FilledTonalIconButton(onClick = onMinus, enabled = ml > 0) { Text("−", style = MaterialTheme.typography.titleLarge) }
            Text(
                if (ml == 0) stringResource(R.string.skip_short) else litres(ml),
                Modifier.widthIn(min = 72.dp).clickable(onClick = onEdit).padding(vertical = 12.dp),
                textAlign = TextAlign.Center,
                fontWeight = FontWeight.Bold,
                style = MaterialTheme.typography.titleMedium,
            )
            FilledTonalIconButton(onClick = onPlus) { Text("+", style = MaterialTheme.typography.titleLarge) }
        }
    }
}
