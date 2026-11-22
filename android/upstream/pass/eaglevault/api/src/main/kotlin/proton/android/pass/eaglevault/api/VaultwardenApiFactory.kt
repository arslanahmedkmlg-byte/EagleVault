package proton.android.pass.eaglevault.api

import okhttp3.OkHttpClient
import okhttp3.HttpUrl
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import retrofit2.Retrofit
import java.util.concurrent.TimeUnit

/**
 * Creates a Vaultwarden-only Retrofit client.
 *
 * HTTPS is mandatory except for loopback development hosts. Redirects are disabled
 * so an Authorization header cannot be forwarded to a different origin.
 */
object VaultwardenApiFactory {
    fun create(baseUrl: String): VaultwardenApi {
        val normalized = baseUrl.trim().let {
            if (it.endsWith("/")) it else "$it/"
        }
        val parsed = normalized.toHttpUrlOrNull()
            ?: throw IllegalArgumentException("Enter a valid Vaultwarden server URL.")

        require(parsed.username.isEmpty() && parsed.password.isEmpty()) {
            "Credentials must not be embedded in the server URL."
        }
        require(parsed.query == null && parsed.fragment == null) {
            "The server URL must not contain a query or fragment."
        }
        require(parsed.scheme == "https" || parsed.isLoopbackDevelopmentHost()) {
            "HTTPS is required except for localhost development."
        }

        return vaultRetrofit(parsed).create(VaultwardenApi::class.java)
    }

    private fun HttpUrl.isLoopbackDevelopmentHost(): Boolean =
        scheme == "http" && (host == "localhost" || host == "127.0.0.1" || host == "::1")
}

internal fun vaultRetrofit(origin: HttpUrl): Retrofit {
    val client = OkHttpClient.Builder()
        .followRedirects(false)
        .followSslRedirects(false)
        .connectTimeout(15, TimeUnit.SECONDS)
        .readTimeout(30, TimeUnit.SECONDS)
        .writeTimeout(30, TimeUnit.SECONDS)
        .build()

    return Retrofit.Builder()
        .baseUrl(origin)
        .client(client)
        .build()
}
