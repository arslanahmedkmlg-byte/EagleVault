package proton.android.pass.eaglevault.api

import com.bitwarden.core.ClientManagedTokens
import com.bitwarden.core.InitUserCryptoMethod
import com.bitwarden.core.InitUserCryptoRequest
import com.bitwarden.core.MasterPasswordUnlockData
import com.bitwarden.core.WrappedAccountCryptographicState
import com.bitwarden.crypto.HashPurpose
import com.bitwarden.crypto.Kdf
import com.bitwarden.sdk.Client
import com.bitwarden.sdk.ManagedSettingsBindingClient
import com.bitwarden.vault.Folder
import com.bitwarden.vault.FolderView
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.ResponseBody
import org.json.JSONObject
import retrofit2.Response
import java.time.Instant
import java.util.Locale
import java.util.UUID

class CoreVaultSession internal constructor(private val api: EagleVaultApi) {
    constructor(origin: String) : this(EagleVaultApi.create(origin))
    private var client: Client? = null
    private var tokens: Tokens? = null

    data class Record(
        val id: String = UUID.randomUUID().toString(),
        val revision: Long = 0,
        val kind: String = "login",
        val name: String = "",
        val username: String = "",
        val password: String = "",
        val url: String = "",
        val notes: String = "",
        val folderId: String = "",
    )

    private class Tokens(val access: String, val refresh: String, val expires: Long)
    class RequestFailed(val status: Int) : Exception("Vault request returned HTTP $status.")

    suspend fun unlock(email: String, password: String, invite: String?) {
        check(client == null)
        val profile = api.kdf().objectBody()
        require(profile.getString("type") == "argon2id" && profile.getInt("iterations") == 3 &&
            profile.getInt("memory") == 64 && profile.getInt("parallelism") == 4)
        val kdf = Kdf.Argon2id(3u, 64u, 4u)
        val account = email.trim().lowercase(Locale.ROOT)
        val sdk = ManagedSettingsBindingClient().use { settings ->
            Client(object : ClientManagedTokens {
                override suspend fun getAccessToken(): String? = null
            }, null, settings)
        }
        try {
            val (proof, privateKey) = sdk.auth().use { auth ->
                if (invite == null) {
                    auth.hashPassword(account, password, kdf, HashPurpose.SERVER_AUTHORIZATION) to null
                } else {
                    val registration = auth.makeRegisterKeys(account, password, kdf)
                    api.register(body("email" to account, "proof" to registration.masterPasswordHash,
                        "wrappedKey" to registration.encryptedUserKey, "registrationCode" to invite)).objectBody()
                    registration.masterPasswordHash to registration.keys.`private`
                }
            }
            val login = api.login(body("email" to account, "proof" to proof)).objectBody()
            tokens = login.tokens()
            val wrapped = login.getString("wrappedKey")
            // Core accounts have no asymmetric sharing state. The SDK supports legacy V1 vaults
            // with an unreadable private-key field and still initializes their symmetric user key.
            sdk.crypto().use { crypto ->
                crypto.initializeUserCrypto(InitUserCryptoRequest(
                    // The SDK requires an ID for its in-memory local-data key. Core does
                    // not expose account identifiers, and this SDK instance has no disk state.
                    userId = UUID.randomUUID().toString(),
                    kdfParams = kdf,
                    email = account,
                    accountCryptographicState = WrappedAccountCryptographicState.V1(privateKey ?: wrapped),
                    method = InitUserCryptoMethod.MasterPasswordUnlock(password, MasterPasswordUnlockData(kdf, wrapped, account)),
                    upgradeToken = null,
                ))
            }
            client = sdk
        } finally {
            if (client !== sdk) {
                sdk.close()
                withContext(NonCancellable) { runCatching { lock() } }
            }
        }
    }

    suspend fun sync(): List<Record> {
        val records = linkedMapOf<String, Record>()
        var cursor = 0L
        do {
            val page = api.sync(authorization(), cursor).objectBody()
            val items = page.getJSONArray("records")
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val id = item.getString("id")
                if (item.isNull("ciphertext")) {
                    records.remove(id)
                    continue
                }
                val decoded = JSONObject(transform(item.getString("ciphertext"), encrypt = false))
                require(decoded.getInt("version") == 1 && decoded.getString("id") == id)
                val kind = decoded.getString("kind")
                require(kind in setOf("login", "note", "folder"))
                records[id] = Record(id, item.getLong("revision"), kind, decoded.getString("name"),
                    decoded.getString("username"), decoded.getString("password"), decoded.getString("url"),
                    decoded.getString("notes"), decoded.getString("folderId"))
            }
            if (!page.getBoolean("hasMore")) return records.values.toList()
            val next = page.getLong("cursor")
            require(next > cursor)
            cursor = next
        } while (true)
    }

    suspend fun save(record: Record) {
        val value = JSONObject(mapOf(
            "version" to 1, "id" to record.id, "kind" to record.kind, "name" to record.name,
            "username" to record.username, "password" to record.password, "url" to record.url,
            "notes" to record.notes, "folderId" to record.folderId,
        )).toString()
        api.write(authorization(), record.id, body(
            "expectedRevision" to record.revision, "ciphertext" to transform(value, encrypt = true),
        )).objectBody()
    }

    suspend fun delete(record: Record) {
        api.write(authorization(), record.id, body(
            "expectedRevision" to record.revision, "ciphertext" to JSONObject.NULL,
        )).objectBody()
    }

    suspend fun lock() {
        client?.close()
        client = null
        val current = tokens
        tokens = null
        if (current != null) api.logout(body("refreshToken" to current.refresh)).objectBody()
    }

    private fun transform(value: String, encrypt: Boolean): String {
        // Folder names use the same SDK EncString encryption under the symmetric user key
        // as the Web record envelope. No folder metadata is sent to EagleVault Core.
        return checkNotNull(client).vault().use { vault ->
            vault.folders().use { crypto ->
                if (encrypt) crypto.encrypt(FolderView(null, value, Instant.EPOCH)).name
                else crypto.decrypt(Folder(null, value, Instant.EPOCH)).name
            }
        }
    }

    private suspend fun authorization(): String {
        val current = checkNotNull(tokens)
        val active = if (current.expires - System.currentTimeMillis() <= 30_000) {
            api.refresh(body("refreshToken" to current.refresh)).objectBody().tokens().also { tokens = it }
        } else current
        return "Bearer ${active.access}"
    }

    private fun JSONObject.tokens() = Tokens(getString("accessToken"), getString("refreshToken"), getLong("expiresAt"))

    private fun body(vararg fields: Pair<String, Any>) =
        JSONObject(fields.toMap()).toString().toRequestBody("application/json".toMediaType())

    private fun Response<ResponseBody>.objectBody(): JSONObject {
        if (!isSuccessful) {
            errorBody()?.close()
            throw RequestFailed(code())
        }
        return JSONObject(checkNotNull(body()).use { it.string() })
    }
}
