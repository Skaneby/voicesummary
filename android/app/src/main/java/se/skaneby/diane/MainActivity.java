package se.skaneby.diane;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Måste registreras före super.onCreate() så bron hittar plugin:et
        registerPlugin(RecordingPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
