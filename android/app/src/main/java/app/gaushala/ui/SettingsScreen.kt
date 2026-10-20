package app.gaushala.ui

import android.app.Activity
import android.text.format.DateUtils
import android.widget.Toast
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
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
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import app.gaushala.Lang
import app.gaushala.R
import app.gaushala.SheetBackup
import app.gaushala.data.AppData
import app.gaushala.data.JsonCodec
import app.gaushala.data.Store
import kotlinx.coroutines.launch
import java.time.LocalDate

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(data: AppData, store: Store, backup: SheetBackup, modifier: Modifier) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    fun toast(res: Int) = Toast.makeText(context, res, Toast.LENGTH_LONG).show()
    val status by backup.status.collectAsState()
    var pendingSheet by remember { mutableStateOf<SheetBackup.Snapshot?>(null) }
    var pendingFile by remember { mutableStateOf<AppData?>(null) }
    var confirmOverwrite by remember { mutableStateOf(false) }

    // Storage Access Framework: the picker lists Google Drive too, with no sign-in inside this app.
    val saveFile = rememberLauncherForActivityResult(ActivityResultContracts.CreateDocument("application/json")) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        runCatching {
            context.contentResolver.openOutputStream(uri, "wt")!!.use { it.write(JsonCodec.encode(data).toByteArray()) }
        }.onSuccess { toast(R.string.file_saved) }.onFailure { toast(R.string.file_failed) }
    }
    val openFile = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@rememberLauncherForActivityResult
        runCatching {
            context.contentResolver.openInputStream(uri)!!.use { JsonCodec.decode(it.readBytes().decodeToString()) }
        }.onSuccess { pendingFile = it }.onFailure { toast(R.string.restore_bad_file) }
    }

    Scaffold(modifier, topBar = { TopAppBar(title = { Text(stringResource(R.string.tab_settings)) }) }) { pad ->
        Column(
            Modifier.fillMaxSize().padding(pad).imePadding().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Text(stringResource(R.string.language), style = MaterialTheme.typography.titleMedium)
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(Lang.EN to R.string.language_en, Lang.NE to R.string.language_ne).forEach { (tag, label) ->
                    FilterChip(
                        selected = Lang.get(context) == tag,
                        onClick = {
                            Lang.set(context, tag)
                            (context as? Activity)?.recreate()
                        },
                        label = { Text(stringResource(label)) },
                    )
                }
            }

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            SheetSection(status, backup, onRestore = {
                scope.launch {
                    val snap = backup.pull() ?: return@launch
                    if (snap.data == null) toast(R.string.sheet_empty) else pendingSheet = snap
                }
            }, onOverwrite = { confirmOverwrite = true })

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            BusinessSection(data, store)

            HorizontalDivider(Modifier.padding(vertical = 8.dp))
            Text(stringResource(R.string.file_backup), style = MaterialTheme.typography.titleMedium)
            Text(stringResource(R.string.file_backup_hint), style = MaterialTheme.typography.bodySmall)
            OutlinedButton(
                onClick = { saveFile.launch(context.getString(R.string.backup_file_name, LocalDate.now().toString())) },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.save_file)) }
            OutlinedButton(
                // Drive often labels JSON as octet-stream, so accept any file; decode() validates it.
                onClick = { openFile.launch(arrayOf("*/*")) },
                modifier = Modifier.fillMaxWidth(),
            ) { Text(stringResource(R.string.restore_file)) }
        }
    }

    pendingSheet?.let { snap ->
        ConfirmDialog(
            stringResource(R.string.restore_sheet),
            stringResource(R.string.restore_confirm, snap.data!!.customers.size, snap.data.payments.size),
            stringResource(R.string.restore),
            { backup.apply(snap); toast(R.string.restore_done) },
        ) { pendingSheet = null }
    }
    pendingFile?.let { incoming ->
        ConfirmDialog(
            stringResource(R.string.restore_file),
            stringResource(R.string.restore_confirm, incoming.customers.size, incoming.payments.size),
            stringResource(R.string.restore),
            { store.replace(incoming); toast(R.string.restore_done) },
        ) { pendingFile = null }
    }
    if (confirmOverwrite) {
        ConfirmDialog(
            stringResource(R.string.overwrite_sheet),
            stringResource(R.string.overwrite_confirm, data.customers.size),
            stringResource(R.string.overwrite_sheet),
            backup::overwrite,
        ) { confirmOverwrite = false }
    }
}

@Composable
private fun SheetSection(status: SheetBackup.Status, backup: SheetBackup, onRestore: () -> Unit, onOverwrite: () -> Unit) {
    var url by rememberSaveable { mutableStateOf(backup.url) }
    var key by rememberSaveable { mutableStateOf(backup.key) }
    Text(stringResource(R.string.sheet_backup), style = MaterialTheme.typography.titleMedium)
    Text(statusText(status), color = if (status is SheetBackup.Status.Failed || status == SheetBackup.Status.Conflict) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurface)
    if (status == SheetBackup.Status.Conflict) {
        Text(stringResource(R.string.conflict_help), style = MaterialTheme.typography.bodySmall)
    }
    OutlinedTextField(url, { url = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.sheet_link)) }, singleLine = true)
    OutlinedTextField(
        key, { key = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.sheet_key)) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
    )
    val ready = url.isNotBlank() && key.isNotBlank()
    Button(
        enabled = ready && status != SheetBackup.Status.Working,
        onClick = { backup.setLink(url, key); backup.flush(force = true) },
        modifier = Modifier.fillMaxWidth(),
    ) { Text(stringResource(R.string.backup_now)) }
    OutlinedButton(
        enabled = ready && status != SheetBackup.Status.Working,
        onClick = { backup.setLink(url, key); onRestore() },
        modifier = Modifier.fillMaxWidth(),
    ) { Text(stringResource(R.string.restore_sheet)) }
    if (status == SheetBackup.Status.Conflict) {
        OutlinedButton(onClick = onOverwrite, modifier = Modifier.fillMaxWidth()) { Text(stringResource(R.string.overwrite_sheet)) }
    }
}

@Composable
private fun statusText(status: SheetBackup.Status): String {
    fun ago(t: Long?) = t?.let { DateUtils.getRelativeTimeSpanString(it).toString() }
    return when (status) {
        SheetBackup.Status.NotSetUp -> stringResource(R.string.sheet_not_set_up)
        SheetBackup.Status.Working -> stringResource(R.string.sheet_working)
        SheetBackup.Status.Conflict -> stringResource(R.string.sheet_conflict)
        is SheetBackup.Status.Idle -> when {
            status.lastOkAt == null -> stringResource(R.string.sheet_never)
            status.pending -> stringResource(R.string.sheet_pending, ago(status.lastOkAt)!!)
            else -> stringResource(R.string.sheet_ok, ago(status.lastOkAt)!!)
        }
        is SheetBackup.Status.Failed -> stringResource(
            when (status.reason) {
                SheetBackup.Reason.OFFLINE -> R.string.sheet_offline
                SheetBackup.Reason.BAD_LINK -> R.string.sheet_bad_link
                SheetBackup.Reason.WRONG_KEY -> R.string.sheet_wrong_key
            }
        )
    }
}

@Composable
private fun BusinessSection(data: AppData, store: Store) {
    val b = data.business
    var nameEn by rememberSaveable { mutableStateOf(b.nameEn) }
    var nameNe by rememberSaveable { mutableStateOf(b.nameNe) }
    var phone by rememberSaveable { mutableStateOf(b.phone) }
    var upiId by rememberSaveable { mutableStateOf(b.upiId) }
    var upiName by rememberSaveable { mutableStateOf(b.upiName) }
    var rate by rememberSaveable { mutableStateOf(b.defaultRate.toString()) }
    var cc by rememberSaveable { mutableStateOf(b.countryCode) }
    val rateN = rate.toIntOrNull()?.takeIf { it > 0 }
    val upiValid = upiId.isBlank() || UPI_ID.matches(upiId.trim())
    val next = b.copy(
        nameEn = nameEn.trim(), nameNe = nameNe.trim(), phone = phone.trim(), upiId = upiId.trim(),
        upiName = upiName.trim(), defaultRate = rateN ?: b.defaultRate, countryCode = cc.filter(Char::isDigit),
    )

    Text(stringResource(R.string.on_the_bill), style = MaterialTheme.typography.titleMedium)
    OutlinedTextField(nameEn, { nameEn = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.business_name_en)) }, singleLine = true)
    OutlinedTextField(nameNe, { nameNe = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.business_name_ne)) }, singleLine = true)
    OutlinedTextField(
        phone, { phone = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.business_phone)) }, singleLine = true,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Phone),
    )
    OutlinedTextField(
        upiId, { upiId = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.upi_id)) }, singleLine = true,
        isError = !upiValid, supportingText = { Text(stringResource(if (upiValid) R.string.upi_id_hint else R.string.upi_id_invalid)) },
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
    )
    OutlinedTextField(upiName, { upiName = it }, Modifier.fillMaxWidth(), label = { Text(stringResource(R.string.upi_name)) }, singleLine = true)
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        DecimalField(stringResource(R.string.default_rate), rate, { rate = it.filter(Char::isDigit) }, Modifier.weight(1f))
        DecimalField(stringResource(R.string.country_code), cc, { cc = it.filter(Char::isDigit) }, Modifier.weight(1f))
    }
    Button(
        enabled = rateN != null && upiValid && nameEn.isNotBlank() && next != b,
        onClick = { store.update { it.copy(business = next) } },
        modifier = Modifier.fillMaxWidth(),
    ) { Text(stringResource(R.string.save)) }
}

/** name@bank, as every UPI app shows it. */
private val UPI_ID = Regex("^[A-Za-z0-9._-]{2,}@[A-Za-z][A-Za-z0-9.-]{1,}$")
