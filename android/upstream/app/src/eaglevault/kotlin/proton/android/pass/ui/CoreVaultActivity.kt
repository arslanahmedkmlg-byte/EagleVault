package proton.android.pass.ui

import android.os.Bundle
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.Button
import androidx.compose.material.MaterialTheme
import androidx.compose.material.OutlinedTextField
import androidx.compose.material.Text
import androidx.compose.material.TextButton
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import proton.android.pass.eaglevault.api.CoreVaultSession
import proton.android.pass.eaglevault.api.CoreVaultSession.Record
import java.security.SecureRandom

class CoreVaultActivity : ComponentActivity() {
    private var session: CoreVaultSession? = null
    private var operation: Job? = null
    private var origin by mutableStateOf("")
    private var email by mutableStateOf("")
    private var password by mutableStateOf("")
    private var invite by mutableStateOf("")
    private var registering by mutableStateOf(false)
    private var unlocked by mutableStateOf(false)
    private var busy by mutableStateOf(false)
    private var error by mutableStateOf("")
    private var search by mutableStateOf("")
    private var items by mutableStateOf(emptyList<Record>())
    private var draft by mutableStateOf<Record?>(null)
    private var reveal by mutableStateOf(false)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        setContent {
            MaterialTheme {
                Column(
                    modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Text("EagleVault", style = MaterialTheme.typography.h5)
                    if (error.isNotEmpty()) Text(error, color = MaterialTheme.colors.error)
                    if (!unlocked) {
                        field("API origin", origin, { origin = it })
                        field("Email address", email, { email = it })
                        field("Master password", password, { password = it }, secret = true)
                        if (registering) field("Registration code", invite, { invite = it }, secret = true)
                        Button(
                            enabled = !busy && origin.isNotBlank() && email.isNotBlank() &&
                                password.isNotEmpty() && (!registering || invite.isNotBlank()),
                            onClick = ::unlock,
                        ) { Text(if (registering) "Create account" else "Unlock") }
                        TextButton(enabled = !busy, onClick = { registering = !registering }) {
                            Text(if (registering) "Use existing account" else "Create account")
                        }
                    } else {
                        Button(onClick = ::lock) { Text("Lock and sign out") }
                        TextButton(enabled = !busy, onClick = { refresh() }) { Text("Sync") }
                        field("Search", search, { search = it })
                        TextButton(enabled = !busy, onClick = { edit(Record()) }) { Text("New item") }
                        items.filter { it.name.contains(search.trim(), ignoreCase = true) }.forEach { item ->
                            TextButton(enabled = !busy, onClick = { edit(item) }) { Text(item.name) }
                        }
                        draft?.let { item ->
                            if (item.revision == 0L) {
                                listOf("login", "note", "folder").forEach { kind ->
                                    TextButton(enabled = !busy && item.kind != kind, onClick = {
                                        draft = item.copy(kind = kind, username = "", password = "", url = "", notes = "", folderId = "")
                                    }) { Text("Use " + kind) }
                                }
                            }
                            Text("Editing ${item.kind}", style = MaterialTheme.typography.subtitle1)
                            field("Name", item.name, { draft = item.copy(name = it) })
                            if (item.kind == "login") {
                                field("Username", item.username, { draft = item.copy(username = it) })
                                field("Password", item.password, { draft = item.copy(password = it) }, secret = true, visible = reveal)
                                TextButton(enabled = !busy, onClick = { reveal = !reveal }) {
                                    Text(if (reveal) "Hide password" else "Reveal password")
                                }
                                TextButton(enabled = !busy, onClick = {
                                    val random = SecureRandom()
                                    val alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
                                    draft = item.copy(password = (1..24).map { alphabet[random.nextInt(alphabet.length)] }.joinToString(""))
                                }) { Text("Generate password") }
                                field("Website", item.url, { draft = item.copy(url = it) })
                            }
                            if (item.kind != "folder") {
                                field("Notes", item.notes, { draft = item.copy(notes = it) })
                                val folderName = items.firstOrNull { it.id == item.folderId }?.name ?: "None"
                                Text("Folder: $folderName")
                                TextButton(enabled = !busy && item.folderId.isNotEmpty(), onClick = {
                                    draft = item.copy(folderId = "")
                                }) { Text("Remove from folder") }
                                items.filter { it.kind == "folder" && it.id != item.folderId }.forEach { folder ->
                                    TextButton(enabled = !busy, onClick = {
                                        draft = item.copy(folderId = folder.id)
                                    }) { Text("Move to ${folder.name}") }
                                }
                            }
                            Button(enabled = !busy && item.name.isNotBlank(), onClick = {
                                refresh { save(item) }
                            }) { Text("Save") }
                            TextButton(enabled = !busy, onClick = { draft = null; reveal = false }) { Text("Cancel") }
                            if (item.revision > 0) {
                                TextButton(enabled = !busy, onClick = {
                                    android.app.AlertDialog.Builder(this@CoreVaultActivity)
                                        .setMessage("Delete this item?")
                                        .setNegativeButton("Cancel", null)
                                        .setPositiveButton("Delete") { _, _ -> refresh { delete(item) } }
                                        .show()
                                }) { Text("Delete") }
                            }
                        }
                    }
                    if (busy) Text("Working…")
                }
            }
        }
    }

    @androidx.compose.runtime.Composable
    private fun field(label: String, value: String, update: (String) -> Unit, secret: Boolean = false, visible: Boolean = false) {
        OutlinedTextField(
            value = value,
            onValueChange = update,
            enabled = !busy,
            label = { Text(label) },
            singleLine = label != "Notes",
            keyboardOptions = if (secret) KeyboardOptions(keyboardType = KeyboardType.Password, autoCorrectEnabled = false) else KeyboardOptions.Default,
            visualTransformation = if (secret && !visible) PasswordVisualTransformation() else VisualTransformation.None,
            modifier = Modifier.fillMaxWidth(),
        )
    }

    private fun unlock() {
        val active = try {
            CoreVaultSession(origin.trim())
        } catch (_: IllegalArgumentException) {
            error = "Enter a valid HTTPS EagleVault API origin."
            return
        }
        session = active
        val account = email
        val secret = password
        val code = invite.takeIf { registering }
        password = ""
        invite = ""
        launchOperation {
            try {
                val loaded = withContext(Dispatchers.IO) {
                    active.unlock(account, secret, code)
                    active.sync()
                }
                if (session === active) {
                    items = loaded
                    unlocked = true
                }
            } finally {
                if (!unlocked && session === active) {
                    session = null
                    withContext(NonCancellable + Dispatchers.IO) { runCatching { active.lock() } }
                }
            }
        }
    }

    private fun edit(record: Record) {
        draft = record
        reveal = false
    }

    private fun refresh(change: (suspend CoreVaultSession.() -> Unit)? = null) {
        val active = session ?: return
        launchOperation {
            val loaded = withContext(Dispatchers.IO) {
                change?.invoke(active)
                active.sync()
            }
            if (session === active) {
                if (change != null) draft = null
                reveal = false
                items = loaded
            }
        }
    }

    private fun launchOperation(block: suspend () -> Unit) {
        if (busy) return
        busy = true
        error = ""
        operation = lifecycleScope.launch {
            try {
                block()
            } catch (cancelled: CancellationException) {
                throw cancelled
            } catch (failure: CoreVaultSession.RequestFailed) {
                if (failure.status == 401 && unlocked) lock()
                error = when (failure.status) {
                    401 -> "Credentials or session rejected."
                    409 -> "The record or account already changed. Sync and try again."
                    else -> "The vault server returned HTTP ${failure.status}."
                }
            } catch (_: Exception) {
                error = "The vault operation failed. Check the API origin and try again."
            } finally {
                busy = false
            }
        }
    }

    private fun lock() {
        val active = session
        val pending = operation
        session = null
        pending?.cancel()
        unlocked = false
        draft = null
        reveal = false
        items = emptyList()
        search = ""
        password = ""
        invite = ""
        error = ""
        if (active != null) {
            lifecycleScope.launch(NonCancellable) {
                pending?.join()
                withContext(Dispatchers.IO) { runCatching { active.lock() } }
            }
        }
    }

    override fun onStop() {
        lock()
        super.onStop()
    }
}
