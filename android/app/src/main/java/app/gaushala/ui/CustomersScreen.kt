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
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Card
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExtendedFloatingActionButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import app.gaushala.Nav
import app.gaushala.R
import app.gaushala.Screen
import app.gaushala.data.AppData
import app.gaushala.data.Customer
import app.gaushala.data.Plan
import app.gaushala.data.balanceOn
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CustomersScreen(data: AppData, nav: Nav, modifier: Modifier) {
    var query by rememberSaveable { mutableStateOf("") }
    val today = LocalDate.now()
    // One pass over all deliveries per data change, not per row per frame.
    val balances = remember(data) { data.customers.associate { it.id to data.balanceOn(it, today) } }
    val shown = data.customers
        .filter { query.isBlank() || it.name.contains(query.trim(), ignoreCase = true) || it.phone.contains(query.trim()) }
        .sortedWith(compareBy<Customer> { it.currentPlan(today).stopped }.thenBy { it.name.lowercase() })
    val totalDue = balances.values.filter { it > 0 }.sum()

    Scaffold(
        modifier,
        topBar = { TopAppBar(title = { Text(stringResource(R.string.tab_customers)) }) },
        floatingActionButton = {
            ExtendedFloatingActionButton(
                onClick = { nav.go(Screen.EditCustomer(null)) },
                icon = { Icon(Icons.Filled.Add, null) },
                text = { Text(stringResource(R.string.add_customer)) },
            )
        },
    ) { pad ->
        LazyColumn(
            Modifier.fillMaxSize().padding(pad),
            contentPadding = PaddingValues(start = 16.dp, end = 16.dp, top = 8.dp, bottom = 96.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            item {
                OutlinedTextField(
                    query, { query = it }, Modifier.fillMaxWidth(),
                    placeholder = { Text(stringResource(R.string.search)) },
                    leadingIcon = { Icon(Icons.Filled.Search, null) },
                    singleLine = true,
                )
            }
            if (totalDue > 0) {
                item { Text(stringResource(R.string.total_to_collect, money(totalDue)), style = MaterialTheme.typography.titleSmall) }
            }
            items(shown, key = { it.id }) { c ->
                CustomerRow(c, c.currentPlan(today), balances.getValue(c.id)) { nav.go(Screen.Customer(c.id)) }
            }
        }
    }
}

@Composable
private fun CustomerRow(c: Customer, plan: Plan, balance: Long, onClick: () -> Unit) {
    Card(Modifier.fillMaxWidth().clickable(onClick = onClick).alpha(if (plan.stopped) 0.6f else 1f)) {
        Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) {
                Text(c.name, style = MaterialTheme.typography.titleMedium)
                Text(planSummary(plan), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            BalanceText(balance)
        }
    }
}

@Composable
fun planSummary(plan: Plan): String =
    if (plan.stopped) stringResource(R.string.stopped)
    else stringResource(R.string.plan_summary, litres(plan.morningMl), litres(plan.eveningMl), money(plan.rate * 100L))

@Composable
fun BalanceText(balance: Long) {
    when {
        balance > 0 -> Text(stringResource(R.string.due_amount, money(balance)), color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold)
        balance < 0 -> Text(stringResource(R.string.advance_amount, money(-balance)), color = Color(0xFF1B7A3D), fontWeight = FontWeight.Bold)
        else -> Text(stringResource(R.string.settled), color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
