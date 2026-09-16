# ProGuard / R8 Rules for SendKeep

# --- Gson & Reflection ---
-keepattributes Signature
-keepattributes *Annotation*
-dontwarn sun.misc.**
-keep class com.google.gson.** { *; }

# Keep network DTOs and models intact for JSON serialization/deserialization with Desktop
-keep class com.sendkeep.app.network.** { *; }
-keepclassmembers class com.sendkeep.app.network.** { *; }

# Keep media & data transfer entities
-keep class com.sendkeep.app.data.** { *; }
-keepclassmembers class com.sendkeep.app.data.** { *; }

# --- OkHttp & Okio ---
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# --- Kotlin Coroutines ---
-dontwarn kotlinx.coroutines.**

# --- Jetpack Compose ---
-keepclassmembers class * {
    @androidx.compose.runtime.Composable *;
    void <init>(androidx.compose.runtime.Composer, int);
}
