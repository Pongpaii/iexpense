package app.moneyflow.iexpense;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MonthlyExportPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
