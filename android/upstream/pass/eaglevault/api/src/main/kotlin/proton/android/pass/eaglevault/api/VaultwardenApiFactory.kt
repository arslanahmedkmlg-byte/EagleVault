/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 EagleVault contributors
 */
package proton.android.pass.eaglevault.api

import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient
import retrofit2.Retrofit

/**
 * Builds an isolated Vaultwarden API client. It does not reuse Proton's
 * authenticated Retrofit instance or its Proton host/interceptors.
 */
object VaultwardenApiFactory {
    fun create(serverUrl: String): VaultwardenApi {
        val base = serverUrl.trimEnd('/') + "/api/"
        val apiUrl = base.toHttpUrl()

        require(apiUrl.isHttps || apiUrl.host == "localhost" || apiUrl.host == "127.0.0.1") {
            "Vaultwarden server URL must use HTTPS (HTTP is allowed only for localhost testing)."
        }

        val httpClient = OkHttpClient.Builder()
            .followRedirects(false)
            .followSslRedirects(false)
            .build()

        return Retrofit.Builder()
            .baseUrl(apiUrl)
            .client(httpClient)
            .build()
            .create(VaultwardenApi::class.java)
    }
}
