package proton.android.pass.eaglevault.api

import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import okhttp3.RequestBody
import okhttp3.ResponseBody
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Header
import retrofit2.http.POST
import retrofit2.http.PUT
import retrofit2.http.Path
import retrofit2.http.Query

interface EagleVaultApi {
    @GET("v1/auth/kdf")
    suspend fun kdf(): Response<ResponseBody>

    @POST("v1/auth/register")
    suspend fun register(@Body registration: RequestBody): Response<ResponseBody>

    @POST("v1/auth/login")
    suspend fun login(@Body proof: RequestBody): Response<ResponseBody>

    @POST("v1/auth/refresh")
    suspend fun refresh(@Body refreshToken: RequestBody): Response<ResponseBody>

    @POST("v1/auth/logout")
    suspend fun logout(@Body refreshToken: RequestBody): Response<ResponseBody>

    @GET("v1/vault/sync")
    suspend fun sync(
        @Header("Authorization") authorization: String,
        @Query("after") after: Long = 0,
        @Query("limit") limit: Int = 25,
    ): Response<ResponseBody>

    @PUT("v1/vault/records/{id}")
    suspend fun write(
        @Header("Authorization") authorization: String,
        @Path("id") id: String,
        @Body mutation: RequestBody,
    ): Response<ResponseBody>

    companion object {
        fun create(origin: String): EagleVaultApi {
            val parsed = requireNotNull(origin.toHttpUrlOrNull()) {
                "Enter a valid EagleVault API origin."
            }
            require(
                parsed.scheme == "https" && parsed.username.isEmpty() && parsed.password.isEmpty() &&
                    parsed.encodedPath == "/" && parsed.query == null && parsed.fragment == null
            ) { "EagleVault API requires an HTTPS origin." }
            return vaultRetrofit(parsed).create(EagleVaultApi::class.java)
        }
    }
}
