package app.gaushala.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
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
import app.gaushala.Nav
import app.gaushala.R
import app.gaushala.Screen
import app.gaushala.data.AppData
import app.gaushala.data.Customer
import app.gaushala.data.Plan
import app.gaushala.data.Store
import app.gaushala.data.newId
import app.gaushala.data.upsert
import app.gaushala.data.withPlan
import app.gaushala.data.withoutCustomer
import java.time.LocalDate

/**
 * New customer, or edit one. Changing litres or rate never rewrites the past: it adds a plan
 * from the chosen date, so earlier days keep the quantity and rate they were delivered at.
 */
@Composable
fun CustomerEditScreen(data: AppData, store: Store, id: String?, nav: Nav) {
    val context = LocalContext.current
    val existing = id?.let(data::customer)
    val today = LocalDate.now()
    val current = existing?.currentPlan(today)

    var name by rememberSaveable { mutableStateOf(existing?.name ?: "") }
    var phone by rememberSaveable { mutableStateOf(existing?.phone ?: "") }
    var address by rememberSaveable { mutableStateOf(existing?.address ?: "") }
    var morning by rememberSaveable { mutableStateOf(current?.let { Fmt.litres(it.morningMl) } ?: "1") }
    var evening by rememberSaveable { mutableStateOf(current?.let { Fmt.litres(it.eveningMl) } ?: "0") }
    var rate by rememberSaveable { mutableStateOf((current?.rate ?: data.business.defaultRate).toString()) }
    var from by rememberSaveable { mutableStateOf(today) }
    var opening by rememberSaveable { mutableStateOf(existing?.openingPaise?.takeIf { it != 0L }?.let(Fmt::plainRupees) ?: "") }
    var confirmDelete by remember { mutableStateOf(false) }

    val morningMl = Fmt.parseLitres(morning)
    val eveningMl = Fmt.parseLitres(evening)
    val rateN = rate.toIntOrNull()?.takeIf { it > 0 }
    val openingPaise = if (opening.isBlank()) 0L else Fmt.parseRupees(opening, allowNegative = true)
    val badLitres = stringResource(R.string.invalid_litres)
    val valid = name.isNotBlank() && morningMl != null && eveningMl != null && rateN != null && openingPaise != null
    val planChanged = current == null ||
        morningMl != current.morningMl || eveningMl != current.eveningMl || rateN != current.rate

    fun save() {
        val plan = Plan(from, morningMl!!, eveningMl!!, rateN!!)
        val base = existing ?: Customer(newId(), name, plans = listOf(plan))
        val c = base.copy(name = name.trim(), phone = phone.trim(), address = address.trim(), openingPaise = openingPaise!!)
            .let { if (planChanged) it.withPlan(plan) else it }
        store.update { it.upsert(c) }
        if (existing == null) nav.replace(Screen.Customer(c.id)) else nav.back()
    }

    Scaffold(
        topBar = {
            BackBar(stringResource(if (existing == null) R.string.add_customer else R.string.edit_customer), nav::back) {
                if (existing != null) {
                    IconButton(onClick = { confirmDelete = true }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete_customer)) }
                }
            }
        },
    ) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            OutlinedTextField(name, { name = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.customer_name)) }, singleLine = true)
            OutlinedTextField(
                phone, { phone = it }, Modifier.fillMaxWidth(),
                label = { Text(stringResource(R.string.phone_whatsapp)) }, singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
            )
            OutlinedTextField(address, { address = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.address)) }, singleLine = true)

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text(stringResource(R.string.usual_milk), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DecimalField(
                    stringResource(R.string.morning_litres), morning, { morning = it }, Modifier.weight(1f),
                    error = if (morningMl == null) badLitres else null,
                )
                DecimalField(
                    stringResource(R.string.evening_litres), evening, { evening = it }, Modifier.weight(1f),
                    error = if (eveningMl == null) badLitres else null,
                )
            }
            DecimalField(stringResource(R.string.rate_per_litre), rate, { rate = it.filter(Char::isDigit) })
            if (planChanged) {
                DateField(
                    stringResource(if (existing == null) R.string.delivery_starts else R.string.change_applies_from),
                    from, { from = it },
                )
                if (existing != null) {
                    Text(stringResource(R.string.past_days_unchanged), style = MaterialTheme.typography.bodySmall)
                }
            }

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            DecimalField(stringResource(R.string.opening_balance), opening, { opening = it }, allowNegative = true)
            Text(stringResource(R.string.opening_balance_hint), style = MaterialTheme.typography.bodySmall)

            Button(onClick = ::save, enabled = valid, modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
                Text(stringResource(R.string.save))
            }

            if (existing != null && existing.plans.size > 1) {
                HorizontalDivider(Modifier.padding(vertical = 8.dp))
                Text(stringResource(R.string.plan_history), style = MaterialTheme.typography.titleMedium)
                existing.plans.asReversed().forEach { p ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(stringResource(R.string.plan_from, Fmt.date(context, p.from), planSummary(p)), Modifier.weight(1f))
                        IconButton(onClick = {
                            store.update { d -> d.upsert(existing.copy(plans = existing.plans.filter { it != p })) }
                        }) { Icon(Icons.Filled.Delete, stringResource(R.string.delete)) }
                    }
                }
            }
        }
    }

    if (confirmDelete && existing != null) {
        ConfirmDialog(
            stringResource(R.string.delete_customer),
            stringResource(R.string.delete_customer_confirm, existing.name),
            stringResource(R.string.delete),
            {
                store.update { it.withoutCustomer(existing.id) }
                nav.tab(Screen.Customers)
            },
        ) { confirmDelete = false }
    }
}
