package se.skaneby.diane;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Måste registreras före super.onCreate() så bron hittar plugin:et
        registerPlugin(RecordingPlugin.class);
        super.onCreate(savedInstanceState);

        // Följ telefonens textstorlek (Apple HIG / WCAG: text ska kunna skalas).
        // Webviewn gör det inte själv — textZoom står annars alltid på 100 %.
        // Begränsad till 85–200 % så layouten håller.
        float scale = getResources().getConfiguration().fontScale;
        int zoom = Math.round(Math.max(0.85f, Math.min(2.0f, scale)) * 100);
        getBridge().getWebView().getSettings().setTextZoom(zoom);
    }
}
