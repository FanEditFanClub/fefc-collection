package com.fefc.kodi;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.net.Uri;
import android.os.Bundle;
import android.text.InputType;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.view.inputmethod.EditorInfo;
import android.view.inputmethod.InputMethodManager;
import android.widget.EditText;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;

/**
 * fefcinput://input?tok=&h=&d=&num=  — text entry with the Android / Fire TV system keyboard (Gboard voice typing etc.)
 * instead of Kodi's on-screen keyboard. Writes fefc-input-<tok>.txt ("OK\n<text>" or "CANCEL") in getExternalFilesDir;
 * a "fefc-input-<tok>.ack" file is written as soon as the activity opens so Python knows not to fall back.
 */
public class FefcInputActivity extends Activity {
    private String tok = "x";
    private boolean done = false;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        Uri u = getIntent() != null ? getIntent().getData() : null;
        String h = "Search", d = "";
        boolean num = false;
        if (u != null) {
            String t = u.getQueryParameter("tok"); if (t != null) tok = t.replaceAll("[^A-Za-z0-9]", "");
            String hh = u.getQueryParameter("h"); if (hh != null) h = hh;
            String dd = u.getQueryParameter("d"); if (dd != null) d = dd;
            num = "1".equals(u.getQueryParameter("num"));
        }
        write("ack", "1");
        final EditText et = new EditText(this);
        et.setSingleLine(true);
        et.setText(d);
        et.setSelection(d.length());
        et.setImeOptions(EditorInfo.IME_ACTION_GO | EditorInfo.IME_FLAG_NO_EXTRACT_UI);
        et.setInputType(num ? InputType.TYPE_CLASS_NUMBER : (InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS));
        et.setOnEditorActionListener(new TextView.OnEditorActionListener() {
            public boolean onEditorAction(TextView v, int id, KeyEvent ev) {
                if (id == EditorInfo.IME_ACTION_GO || id == EditorInfo.IME_ACTION_DONE || id == EditorInfo.IME_ACTION_SEARCH
                        || (ev != null && ev.getKeyCode() == KeyEvent.KEYCODE_ENTER && ev.getAction() == KeyEvent.ACTION_UP)) {
                    finishWith("OK\n" + et.getText().toString());
                    return true;
                }
                return false;
            }
        });
        AlertDialog dlg = new AlertDialog.Builder(this, android.R.style.Theme_DeviceDefault_Dialog_Alert)
                .setTitle(h).setView(et)
                .setPositiveButton("OK", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface di, int w) { finishWith("OK\n" + et.getText().toString()); }
                })
                .setNegativeButton("Cancel", new DialogInterface.OnClickListener() {
                    public void onClick(DialogInterface di, int w) { finishWith("CANCEL"); }
                })
                .setOnCancelListener(new DialogInterface.OnCancelListener() {
                    public void onCancel(DialogInterface di) { finishWith("CANCEL"); }
                }).create();
        dlg.getWindow().setSoftInputMode(WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
        dlg.show();
        et.requestFocus();
        et.postDelayed(new Runnable() {
            public void run() {
                InputMethodManager im = (InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                if (im != null) im.showSoftInput(et, InputMethodManager.SHOW_IMPLICIT);
            }
        }, 150);
    }

    private void write(String ext, String body) {
        File dir = getExternalFilesDir(null);
        if (dir == null) dir = getFilesDir();
        if (dir == null) return;
        try {
            File tmp = new File(dir, "fefc-input-" + tok + "." + ext + ".tmp");
            FileOutputStream out = new FileOutputStream(tmp);
            out.write(body.getBytes(StandardCharsets.UTF_8));
            out.close();
            tmp.renameTo(new File(dir, "fefc-input-" + tok + "." + ext));
        } catch (Exception e) {
        }
    }

    private void finishWith(String r) {
        if (done) return;
        done = true;
        write("txt", r);
        finish();
    }

    @Override
    protected void onDestroy() {
        finishWith("CANCEL");
        super.onDestroy();
    }
}
