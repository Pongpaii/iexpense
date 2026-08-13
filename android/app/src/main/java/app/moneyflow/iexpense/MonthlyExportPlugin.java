package app.moneyflow.iexpense;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.UUID;

@CapacitorPlugin(name = "MonthlyExport")
public class MonthlyExportPlugin extends Plugin {
    @PluginMethod
    public void shareCsv(PluginCall call) {
        String filename = call.getString("filename");
        String content = call.getString("content");
        String title = call.getString("title", "ส่งออกรายงาน Money Flow");

        if (filename == null || content == null || !filename.matches("[A-Za-z0-9._-]+\\.csv")) {
            call.reject("ข้อมูลไฟล์สำหรับส่งออกไม่ถูกต้อง");
            return;
        }

        try {
            File exportsRoot = new File(getContext().getCacheDir(), "exports");
            deleteChildren(exportsRoot);

            File exportDirectory = new File(exportsRoot, UUID.randomUUID().toString());
            if (!exportDirectory.mkdirs()) {
                call.reject("ไม่สามารถสร้างโฟลเดอร์ส่งออกได้");
                return;
            }

            File exportFile = new File(exportDirectory, filename);
            try (FileOutputStream output = new FileOutputStream(exportFile, false)) {
                output.write(content.getBytes(StandardCharsets.UTF_8));
            }

            Uri uri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                exportFile
            );

            Intent shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("text/csv");
            shareIntent.putExtra(Intent.EXTRA_STREAM, uri);
            shareIntent.putExtra(Intent.EXTRA_SUBJECT, title);
            shareIntent.setClipData(ClipData.newRawUri(filename, uri));
            shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

            Intent chooser = Intent.createChooser(shareIntent, title);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(chooser);
            call.resolve(new JSObject());
        } catch (Exception error) {
            call.reject("ไม่สามารถแชร์ไฟล์ได้", error);
        }
    }

    private void deleteChildren(File directory) {
        File[] children = directory.listFiles();
        if (children == null) return;

        for (File child : children) {
            if (child.isDirectory()) deleteChildren(child);
            // ไฟล์ cache อาจถูกระบบหรือแอปปลายทางใช้งานอยู่ จึงไม่ถือว่าลบไม่สำเร็จเป็นข้อผิดพลาด
            child.delete();
        }
    }
}
