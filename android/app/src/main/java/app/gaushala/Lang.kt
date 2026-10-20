package app.gaushala

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

/**
 * App language, kept in this app's own preferences so it works on every Android version
 * (the system per-app language setting needs Android 13). Also used to draw a bill in the
 * other language without switching the app.
 */
object Lang {
    const val EN = "en"
    const val NE = "ne"
    private const val PREFS = "lang"
    private const val KEY = "tag"

    fun get(context: Context): String =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null)
            ?: if (Locale.getDefault().language == NE) NE else EN

    fun set(context: Context, tag: String) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, tag).apply()
    }

    fun wrap(base: Context, tag: String): Context {
        val config = Configuration(base.resources.configuration)
        config.setLocale(Locale.forLanguageTag(tag))
        return base.createConfigurationContext(config)
    }
}
