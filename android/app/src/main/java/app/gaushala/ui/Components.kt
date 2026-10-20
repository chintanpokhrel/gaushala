package app.gaushala.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.rememberDatePickerState
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
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.gaushala.Fmt
import app.gaushala.R
import app.gaushala.SheetBackup
import app.gaushala.data.Payment
import app.gaushala.data.newId
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BackBar(title: String, onBack: () -> Unit, actions: @Composable () -> Unit = {}) {
    TopAppBar(
        title = { Text(title) },
        navigationIcon = {
            IconButton(onClick = onBack) {
                Icon(Icons.AutoMirrored.Filled.ArrowBack, stringResource(R.string.back))
            }
        },
        actions = { actions() },
    )
}

@Composable
fun money(paise: Long): String = Fmt.money(LocalContext.current, paise)

@Composable
fun litres(ml: Int): String = Fmt.litresUnit(LocalContext.current, ml)

@Composable
fun litres(ml: Long): String = Fmt.litresUnit(LocalContext.current, ml)

/** Decimal field (litres or rupees); the caller keeps the raw text so a half-typed value is not lost. */
@Composable
fun DecimalField(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    modifier: Modifier = Modifier,
    error: String? = null,
    allowNegative: Boolean = false,
) {
    OutlinedTextField(
        value = value,
        onValueChange = { v ->
            val kept = v.filter { it.isDigit() || it == '.' }
            onChange(if (allowNegative && v.startsWith("-")) "-$kept" else kept)
        },
        label = { Text(label) },
        singleLine = true,
        isError = error != null,
        supportingText = error?.let { { Text(it) } },
        // Number pads often lack a minus key; signed fields get the full-symbol phone pad.
        keyboardOptions = KeyboardOptions(keyboardType = if (allowNegative) KeyboardType.Phone else KeyboardType.Decimal),
        modifier = modifier.fillMaxWidth(),
    )
}

/** ◀ date ▶ with the date itself opening a picker. */
@Composable
fun DateStepper(date: LocalDate, onChange: (LocalDate) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    val context = LocalContext.current
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.Center) {
        IconButton(onClick = { onChange(date.minusDays(1)) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.previous_day))
        }
        TextButton(onClick = { open = true }) {
            Text(
                if (date == LocalDate.now()) stringResource(R.string.today_date, Fmt.weekdayDate(context, date))
                else Fmt.weekdayDate(context, date),
                style = MaterialTheme.typography.titleMedium,
            )
        }
        IconButton(onClick = { onChange(date.plusDays(1)) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.next_day))
        }
    }
    if (open) DatePick(date, { onChange(it); open = false }, { open = false })
}

/** A labelled row showing a date; tapping it opens the date picker. */
@Composable
fun DateField(label: String, date: LocalDate, onChange: (LocalDate) -> Unit, modifier: Modifier = Modifier) {
    var open by remember { mutableStateOf(false) }
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f))
        TextButton(onClick = { open = true }) { Text(Fmt.date(LocalContext.current, date)) }
    }
    if (open) DatePick(date, { onChange(it); open = false }, { open = false })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DatePick(date: LocalDate, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
    // DatePicker works in UTC millis; convert at the boundary only.
    val state = rememberDatePickerState(initialSelectedDateMillis = date.atStartOfDay().toInstant(ZoneOffset.UTC).toEpochMilli())
    DatePickerDialog(
        onDismissRequest = onDismiss,
        confirmButton = {
            TextButton(onClick = {
                state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) } ?: onDismiss()
            }) { Text(stringResource(R.string.ok)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    ) { DatePicker(state) }
}

@Composable
fun ConfirmDialog(title: String, text: String, confirm: String, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(text) },
        confirmButton = { TextButton(onClick = { onConfirm(); onDismiss() }) { Text(confirm) } },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}

/** Type an exact quantity for one delivery, or go back to the usual one. */
@Composable
fun QtyDialog(title: String, ml: Int, usualMl: Int, onSet: (Int) -> Unit, onDismiss: () -> Unit) {
    var text by rememberSaveable { mutableStateOf(Fmt.litres(ml)) }
    val parsed = Fmt.parseLitres(text)
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField(
                    stringResource(R.string.litres_label), text, { text = it },
                    error = if (parsed == null && text.isNotEmpty()) stringResource(R.string.invalid_litres) else null,
                )
                Text(stringResource(R.string.usual_qty, litres(usualMl)), style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(enabled = parsed != null, onClick = { onSet(parsed!!); onDismiss() }) { Text(stringResource(R.string.save)) }
        },
        dismissButton = {
            Row {
                TextButton(onClick = { onSet(0); onDismiss() }) { Text(stringResource(R.string.skip)) }
                TextButton(onClick = { onSet(usualMl); onDismiss() }) { Text(stringResource(R.string.usual)) }
            }
        },
    )
}

/** Record money received. [suggestedPaise] pre-fills the amount (e.g. the bill total). */
@Composable
fun PaymentDialog(customerId: String, suggestedPaise: Long, onSave: (Payment) -> Unit, onDismiss: () -> Unit) {
    var amount by rememberSaveable { mutableStateOf(if (suggestedPaise > 0) Fmt.plainRupees(suggestedPaise) else "") }
    var date by rememberSaveable { mutableStateOf(LocalDate.now()) }
    var note by rememberSaveable { mutableStateOf("") }
    val paise = Fmt.parseRupees(amount)?.takeIf { it > 0 }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(stringResource(R.string.payment_received)) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField(stringResource(R.string.amount_rupees), amount, { amount = it })
                DateField(stringResource(R.string.received_on), date, { date = it })
                OutlinedTextField(
                    note, { note = it }, Modifier.fillMaxWidth(),
                    label = { Text(stringResource(R.string.payment_note)) }, singleLine = true,
                )
                Text(stringResource(R.string.advance_hint), style = MaterialTheme.typography.bodySmall)
            }
        },
        confirmButton = {
            TextButton(enabled = paise != null, onClick = {
                onSave(Payment(newId(), customerId, date, paise!!, note.trim()))
                onDismiss()
            }) { Text(stringResource(R.string.save)) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    )
}

/** Shown on the main screen while the sheet backup needs attention. */
@Composable
fun BackupBanner(status: SheetBackup.Status, onClick: () -> Unit) {
    val text = when (status) {
        SheetBackup.Status.NotSetUp -> stringResource(R.string.banner_not_set_up)
        SheetBackup.Status.Conflict -> stringResource(R.string.banner_conflict)
        is SheetBackup.Status.Failed -> {
            val stale = status.lastOkAt == null || System.currentTimeMillis() - status.lastOkAt > STALE_MS
            if (!stale) return
            stringResource(R.string.banner_failed)
        }
        else -> return
    }
    Card(
        Modifier.fillMaxWidth().clickable(onClick = onClick),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer),
    ) { Text(text, Modifier.padding(16.dp)) }
}

/** A failed backup is only worth interrupting for once the last good one is this old. */
private const val STALE_MS = 24L * 60 * 60 * 1000
