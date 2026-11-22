package proton.android.pass.eaglevault.api

import android.util.Base64
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import okhttp3.OkHttpClient
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import retrofit2.Retrofit
import java.security.KeyStore
import java.security.cert.CertificateFactory
import javax.net.ssl.SSLContext
import javax.net.ssl.TrustManagerFactory
import javax.net.ssl.X509TrustManager

@RunWith(AndroidJUnit4::class)
class CoreVaultInteropTest {
    @Test
    fun readsWebRecordAndWritesAndroidRecord() = runBlocking {
        val arguments = InstrumentationRegistry.getArguments()
        val certificate = Base64.decode(checkNotNull(arguments.getString("coreTestCertificate")), Base64.DEFAULT)
        val trusted = KeyStore.getInstance(KeyStore.getDefaultType()).apply {
            load(null)
            setCertificateEntry("synthetic-core", CertificateFactory.getInstance("X.509")
                .generateCertificate(certificate.inputStream()))
        }
        val trustManager = TrustManagerFactory.getInstance(TrustManagerFactory.getDefaultAlgorithm()).run {
            init(trusted)
            trustManagers.filterIsInstance<X509TrustManager>().single()
        }
        val tls = SSLContext.getInstance("TLS").apply { init(null, arrayOf(trustManager), null) }
        val api = Retrofit.Builder()
            .baseUrl("https://localhost:18443/")
            .client(OkHttpClient.Builder().sslSocketFactory(tls.socketFactory, trustManager).build())
            .build()
            .create(EagleVaultApi::class.java)
        val vault = CoreVaultSession(api)
        vault.unlock("interop@example.test", "Synthetic cross-client password", null)
        try {
            val seeded = vault.sync().single()
            assertEquals("From Web", seeded.name)
            assertEquals("Web fixture secret", seeded.password)
            vault.save(seeded.copy(name = "Edited by Android"))
            vault.save(CoreVaultSession.Record(kind = "note", name = "From Android", notes = "Android fixture secret"))
            assertEquals(setOf("Edited by Android", "From Android"), vault.sync().map { it.name }.toSet())
        } finally {
            vault.lock()
        }
    }
}
