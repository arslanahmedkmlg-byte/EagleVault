/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2026 EagleVault contributors
 */
package proton.android.pass.eaglevault.api

import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.DELETE
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path

/**
 * Thin wire interface for the Vaultwarden-compatible API.
 *
 * The caller supplies a current bearer token and already-encrypted JSON body.
 * This module deliberately does not implement login, token refresh, JSON
 * serialization, cipher crypto, persistence, or Proton Core networking.
 */
interface VaultwardenApi {
    @GET("sync")
    suspend fun sync(
        @Header("Authorization") authorization: String
    ): Response<ResponseBody>

    @POST("ciphers")
    suspend fun createCipher(
        @Header("Authorization") authorization: String,
        @Body encryptedCipher: RequestBody
    ): Response<ResponseBody>

    @PUT("ciphers/{id}")
    suspend fun updateCipher(
        @Header("Authorization") authorization: String,
        @Path("id") cipherId: String,
        @Body encryptedCipher: RequestBody
    ): Response<ResponseBody>

    @DELETE("ciphers/{id}")
    suspend fun deleteCipher(
        @Header("Authorization") authorization: String,
        @Path("id") cipherId: String
    ): Response<ResponseBody>

    @GET("folders")
    suspend fun listFolders(
        @Header("Authorization") authorization: String
    ): Response<ResponseBody>

    @POST("folders")
    suspend fun createFolder(
        @Header("Authorization") authorization: String,
        @Body encryptedFolder: RequestBody
    ): Response<ResponseBody>

    @PUT("folders/{id}")
    suspend fun updateFolder(
        @Header("Authorization") authorization: String,
        @Path("id") folderId: String,
        @Body encryptedFolder: RequestBody
    ): Response<ResponseBody>

    @DELETE("folders/{id}")
    suspend fun deleteFolder(
        @Header("Authorization") authorization: String,
        @Path("id") folderId: String
    ): Response<ResponseBody>
}
