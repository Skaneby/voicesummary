package se.skaneby.diane;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Bro mellan webbappens inspelning och förgrundstjänsten.
 *
 * Anropas från index.html när inspelningen startar och stoppar. Misslyckas
 * något här får det aldrig stoppa själva inspelningen — därför sväljs fel
 * och rapporteras som resolve, inte reject.
 */
@CapacitorPlugin(name = "Recording")
public class RecordingPlugin extends Plugin {

    @PluginMethod
    public void start(PluginCall call) {
        try {
            RecordingService.start(getContext());
        } catch (Exception e) {
            // Notisen är en bekvämlighet — inspelningen ska fungera ändå
        }
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        try {
            RecordingService.stop(getContext());
        } catch (Exception e) {
            /* redan stoppad */
        }
        call.resolve();
    }
}
