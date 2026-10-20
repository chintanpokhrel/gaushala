package app.gaushala

import android.app.Application
import app.gaushala.data.AppData
import app.gaushala.data.Business
import app.gaushala.data.Store
import java.io.File

class GaushalaApp : Application() {
    val store: Store by lazy {
        Store(File(filesDir, "gaushala.json")) {
            // Both names come from fixed resources, not the app language, so the seed is the same on every phone.
            val en = Lang.wrap(this, Lang.EN)
            val ne = Lang.wrap(this, Lang.NE)
            AppData(
                business = Business(
                    nameEn = en.getString(R.string.default_business_name),
                    nameNe = ne.getString(R.string.default_business_name),
                    defaultRate = DEFAULT_RATE,
                )
            )
        }
    }

    val backup: SheetBackup by lazy { SheetBackup(this, store) }

    override fun onCreate() {
        super.onCreate()
        backup // start watching for changes
    }

    private companion object {
        const val DEFAULT_RATE = 60
    }
}
