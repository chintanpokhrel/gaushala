package app.gaushala

import android.content.Context
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.snapshots.SnapshotStateList
import androidx.compose.runtime.toMutableStateList
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import app.gaushala.data.Store
import app.gaushala.ui.BillScreen
import app.gaushala.ui.CustomerEditScreen
import app.gaushala.ui.CustomerScreen
import app.gaushala.ui.CustomersScreen
import app.gaushala.ui.DeliveriesScreen
import app.gaushala.ui.SettingsScreen
import app.gaushala.ui.SummaryScreen
import java.io.Serializable
import java.time.LocalDate
import java.util.Locale

class MainActivity : ComponentActivity() {
    override fun attachBaseContext(newBase: Context) {
        val tag = Lang.get(newBase)
        Locale.setDefault(Locale.forLanguageTag(tag)) // date picker and other system-formatted text
        super.attachBaseContext(Lang.wrap(newBase, tag))
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        val app = application as GaushalaApp
        setContent { GaushalaTheme { GaushalaNav(app.store, app.backup) } }
    }

    override fun onStop() {
        super.onStop()
        (application as GaushalaApp).backup.flush()
    }
}

/** Serializable so the back stack survives rotation and process death. */
sealed interface Screen : Serializable {
    data object Deliveries : Screen
    data object Customers : Screen
    data object Summary : Screen
    data object Settings : Screen
    data class Customer(val id: String) : Screen
    data class EditCustomer(val id: String?) : Screen
    data class Bill(val customerId: String, val from: LocalDate, val to: LocalDate) : Screen
}

class Nav(private val stack: SnapshotStateList<Screen>) {
    fun go(s: Screen) { stack.add(s) }
    fun back() { if (stack.size > 1) stack.removeAt(stack.lastIndex) }
    fun replace(s: Screen) { stack[stack.lastIndex] = s }
    fun tab(s: Screen) { stack.clear(); stack.add(s) }
}

private data class Tab(val screen: Screen, val label: Int, val icon: ImageVector)

private val tabs = listOf(
    Tab(Screen.Deliveries, R.string.tab_deliveries, Icons.Filled.DateRange),
    Tab(Screen.Customers, R.string.tab_customers, Icons.Filled.Person),
    Tab(Screen.Summary, R.string.tab_summary, Icons.AutoMirrored.Filled.List),
    Tab(Screen.Settings, R.string.tab_settings, Icons.Filled.Settings),
)

@Composable
fun GaushalaNav(store: Store, backup: SheetBackup) {
    val stack = rememberSaveable(
        saver = listSaver<SnapshotStateList<Screen>, Screen>(save = { it.toList() }, restore = { it.toMutableStateList() })
    ) { mutableListOf<Screen>(Screen.Deliveries).toMutableStateList() }
    val nav = Nav(stack)
    val data by store.data.collectAsState()

    BackHandler(enabled = stack.size > 1) { nav.back() }

    val root = stack.first()
    Scaffold(
        bottomBar = {
            if (stack.size == 1) {
                NavigationBar {
                    tabs.forEach { t ->
                        NavigationBarItem(
                            selected = root == t.screen,
                            onClick = { nav.tab(t.screen) },
                            icon = { Icon(t.icon, null) },
                            label = { Text(stringResource(t.label)) },
                        )
                    }
                }
            }
        },
    ) { pad ->
        // Tab screens draw their own top bar; only the bottom bar's space is taken here.
        val bottom = PaddingValues(bottom = pad.calculateBottomPadding())
        val m = Modifier.padding(bottom).consumeWindowInsets(bottom)
        when (val s = stack.last()) {
            Screen.Deliveries -> DeliveriesScreen(data, store, backup, nav, m)
            Screen.Customers -> CustomersScreen(data, nav, m)
            Screen.Summary -> SummaryScreen(data, store, m)
            Screen.Settings -> SettingsScreen(data, store, backup, m)
            is Screen.Customer -> CustomerScreen(data, store, s.id, nav)
            is Screen.EditCustomer -> CustomerEditScreen(data, store, s.id, nav)
            is Screen.Bill -> BillScreen(data, store, s, nav)
        }
    }
}

@Composable
fun GaushalaTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val context = LocalContext.current
    val scheme = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S -> if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> darkColorScheme(primary = Color(0xFF9CC3EA))
        else -> lightColorScheme(primary = Color(0xFF2F5D8A))
    }
    MaterialTheme(colorScheme = scheme, content = content)
}
