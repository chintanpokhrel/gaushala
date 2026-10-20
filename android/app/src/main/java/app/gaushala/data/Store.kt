package app.gaushala.data

import android.util.AtomicFile
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File
import java.io.FileNotFoundException
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicReference

/**
 * All data lives in one JSON file. The screen updates at once; the file is written on a background
 * thread so a tap never waits on disk. Bursts of taps collapse into one write of the latest data.
 * AtomicFile keeps a crash mid-write from corrupting the file.
 */
class Store(file: File, seed: () -> AppData) {
    private val atomic = AtomicFile(file)
    private val writer = Executors.newSingleThreadExecutor()
    private val pending = AtomicReference<AppData?>(null)
    private val _data = MutableStateFlow(load() ?: seed().also(::write))
    val data: StateFlow<AppData> = _data

    @Synchronized
    fun update(transform: (AppData) -> AppData) {
        val next = transform(_data.value)
        if (next == _data.value) return
        _data.value = next
        if (pending.getAndSet(next) == null) {
            writer.execute { pending.getAndSet(null)?.let(::write) }
        }
    }

    fun replace(d: AppData) = update { d }

    private fun load(): AppData? = try {
        JsonCodec.decode(atomic.readFully().decodeToString())
    } catch (e: FileNotFoundException) {
        null
    }

    private fun write(d: AppData) {
        val out = atomic.startWrite()
        try {
            out.write(JsonCodec.encode(d).toByteArray())
            atomic.finishWrite(out)
        } catch (e: Exception) {
            atomic.failWrite(out)
            throw e
        }
    }
}
