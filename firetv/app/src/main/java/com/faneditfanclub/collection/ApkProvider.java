package com.faneditfanclub.collection;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;

import java.io.File;
import java.io.FileNotFoundException;
import java.io.IOException;

/**
 * Minimal FileProvider for the downloaded update APK (the framework has no android.content.FileProvider and the project has no
 * androidx dependency). Serves read-only, and ONLY files directly inside <external files dir>/updates, via
 * content://<package>.apkprovider/update/<name>. The installer gets a temporary read grant (FLAG_GRANT_READ_URI_PERMISSION).
 */
public class ApkProvider extends ContentProvider {
    static String authority(Context c) { return c.getPackageName() + ".apkprovider"; }

    static File dir(Context c) {
        File base = c.getExternalFilesDir(null);
        if (base == null) base = c.getFilesDir();
        return new File(base, "updates");
    }

    static Uri uriFor(Context c, File f) {
        return new Uri.Builder().scheme("content").authority(authority(c)).appendPath("update").appendPath(f.getName()).build();
    }

    private File resolve(Uri uri) throws FileNotFoundException {
        java.util.List<String> seg = uri.getPathSegments();
        if (seg.size() != 2 || !"update".equals(seg.get(0))) throw new FileNotFoundException("bad uri");
        try {
            File d = dir(getContext()).getCanonicalFile();
            File f = new File(d, seg.get(1)).getCanonicalFile();
            if (!d.equals(f.getParentFile()) || !f.isFile()) throw new FileNotFoundException("not found");
            return f;
        } catch (IOException e) {
            throw new FileNotFoundException("bad path");
        }
    }

    @Override public boolean onCreate() { return true; }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode)) throw new SecurityException("read only");
        return ParcelFileDescriptor.open(resolve(uri), ParcelFileDescriptor.MODE_READ_ONLY);
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String sel, String[] args, String sort) {
        try {
            File f = resolve(uri);
            String[] cols = projection != null ? projection : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
            MatrixCursor mc = new MatrixCursor(cols);
            Object[] row = new Object[cols.length];
            for (int i = 0; i < cols.length; i++)
                row[i] = OpenableColumns.DISPLAY_NAME.equals(cols[i]) ? f.getName() : OpenableColumns.SIZE.equals(cols[i]) ? (Object) f.length() : null;
            mc.addRow(row);
            return mc;
        } catch (FileNotFoundException e) {
            return null;
        }
    }

    @Override public String getType(Uri uri) { return "application/vnd.android.package-archive"; }
    @Override public Uri insert(Uri uri, ContentValues v) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String s, String[] a) { return 0; }
    @Override public int update(Uri uri, ContentValues v, String s, String[] a) { return 0; }
}
