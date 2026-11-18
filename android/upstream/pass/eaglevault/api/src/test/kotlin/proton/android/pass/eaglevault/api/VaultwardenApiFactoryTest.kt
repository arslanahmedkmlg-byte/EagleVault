package proton.android.pass.eaglevault.api

import org.junit.Assert.assertThrows
import org.junit.Test

class VaultwardenApiFactoryTest {
    @Test
    fun `rejects non loopback plain http`() {
        assertThrows(IllegalArgumentException::class.java) {
            VaultwardenApiFactory.create("http://vault.example.com")
        }
    }

    @Test
    fun `rejects credentials embedded in url`() {
        assertThrows(IllegalArgumentException::class.java) {
            VaultwardenApiFactory.create("https://user:password@vault.example.com")
        }
    }

    @Test
    fun `rejects query string in base url`() {
        assertThrows(IllegalArgumentException::class.java) {
            VaultwardenApiFactory.create("https://vault.example.com/?token=secret")
        }
    }

    @Test
    fun `accepts loopback http for development`() {
        VaultwardenApiFactory.create("http://127.0.0.1:8080")
    }
}
