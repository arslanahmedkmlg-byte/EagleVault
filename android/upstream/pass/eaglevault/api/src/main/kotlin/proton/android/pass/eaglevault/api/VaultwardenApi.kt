/*
 * EagleVault Android adapter.
 * This transport is intentionally independent of Proton authentication and API clients.
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
 * Raw encrypted Bitwarden-compatible API surface.
 *
 * The caller owns authentication and must pass the access token explicitly.
 * Cipher payloads remain opaque here; decryption belongs to the Bitwarden SDK layer.
 */
interface VaultwardenApi {
    @GET("api/sync")
    suspend fun sync(
        @Header("Authorization") authorization: String,
    ): Response<ResponseBody>

    @POST("api/ciphers")
    suspend fun createCipher(
        @Header("Authorization") authorization: String,
        @Body encryptedCipher: RequestBody,
    ): Response<ResponseBody>

    @PUT("api/ciphers/{id}")
    suspend fun updateCipher(
        @Header("Authorization") authorization: String,
        @Path("id") cipherId: String,
        @Body encryptedCipher: RequestBody,
    ): Response<ResponseBody>

    @DELETE("api/ciphers/{id}")
    suspend fun deleteCipher(
        @Header("Authorization") authorization: String,
        @Path("id") cipherId: String,
    ): Response<ResponseBody>

    @GET("api/folders")
    suspend fun folders(
        @Header("Authorization") authorization: String,
    ): Response<ResponseBody>

    @POST("api/folders")
    suspend fun createFolder(
        @Header("Authorization") authorization: String,
        @Body encryptedFolder: RequestBody,
    ): Response<ResponseBody>

    @PUT("api/folders/{id}")
    suspend fun updateFolder(
        @Header("Authorization") authorization: String,
        @Path("id") folderId: String,
        @Body encryptedFolder: RequestBody,
    ): Response<ResponseBody>

    @DELETE("api/folders/{id}")
    suspend fun deleteFolder(
        @Header("Authorization") authorization: String,
        @Path("id") folderId: String,
    ): Response<ResponseBody>
}
