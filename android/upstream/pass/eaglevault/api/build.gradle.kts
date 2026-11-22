plugins {
    id("com.android.library")
    id("org.jetbrains.kotlin.android")
}

val bitwardenSdkDir = providers.gradleProperty("eagleVaultBitwardenSdkDir").orNull?.let { file(it) }

android {
    namespace = "proton.android.pass.eaglevault.api"
    compileSdk = libs.versions.compileSdk.get().toInt()

    bitwardenSdkDir?.let { sdk ->
        val kotlin = sdk.resolve("kotlin")
        val native = sdk.resolve("jniLibs")
        require(kotlin.isDirectory && native.isDirectory) { "Run prepare-bitwarden-sdk.sh first." }
        sourceSets.getByName("main") {
            java.srcDirs(kotlin, "src/bitwarden/kotlin")
            jniLibs.srcDir(native)
        }
    }

    defaultConfig {
        minSdk = libs.versions.minSdk.get().toInt()
    }
}

dependencies {
    if (bitwardenSdkDir != null) {
        implementation("net.java.dev.jna:jna:${libs.versions.jna.get()}@aar")
        implementation(libs.kotlinx.coroutines.core)
        implementation(libs.androidx.annotation)
    }
    api(libs.retrofit)
    api(libs.okhttp)
    testImplementation(libs.junit)
}
