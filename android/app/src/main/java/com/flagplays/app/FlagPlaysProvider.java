package com.flagplays.app;

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
import java.io.FileOutputStream;
import java.io.IOException;

/**
 * FileProvider mínimo (sin AndroidX): expone por content:// los ficheros que la app
 * escribe en su caché para poder compartirlos con otras aplicaciones.
 *
 * Authority: com.flagplays.app.files
 * URI:       content://com.flagplays.app.files/shared/<nombre>
 *
 * Solo permite leer ficheros de cacheDir/shared y nunca sale de ese directorio
 * (se descarta cualquier intento de path traversal).
 */
public class FlagPlaysProvider extends ContentProvider {

    public static final String AUTHORITY = "com.flagplays.app.files";
    private static final String SEGMENT = "shared";

    @Override
    public boolean onCreate() {
        return true;
    }

    /** Directorio (privado) donde se dejan los ficheros compartibles. */
    public static File sharedDir(Context context) {
        File dir = new File(context.getCacheDir(), SEGMENT);
        if (!dir.exists()) {
            //noinspection ResultOfMethodCallIgnored
            dir.mkdirs();
        }
        return dir;
    }

    /** Escribe un fichero compartible y devuelve el File resultante. */
    public static File writeShared(Context context, String filename, byte[] data) throws IOException {
        File dir = sharedDir(context);
        File out = new File(dir, safeName(filename));
        FileOutputStream fos = null;
        try {
            fos = new FileOutputStream(out);
            fos.write(data);
            fos.flush();
        } finally {
            if (fos != null) {
                try {
                    fos.close();
                } catch (IOException ignored) {
                }
            }
        }
        return out;
    }

    /** URI content:// para un fichero ya escrito con {@link #writeShared}. */
    public static Uri uriFor(String filename) {
        return new Uri.Builder()
                .scheme("content")
                .authority(AUTHORITY)
                .appendPath(SEGMENT)
                .appendPath(safeName(filename))
                .build();
    }

    private static String safeName(String filename) {
        String name = filename == null ? "" : filename.trim();
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) {
            name = name.substring(slash + 1);
        }
        StringBuilder sb = new StringBuilder(name.length());
        for (int i = 0; i < name.length() && sb.length() < 120; i++) {
            char c = name.charAt(i);
            boolean ok = Character.isLetterOrDigit(c) || c == '.' || c == '-' || c == '_'
                    || c == ' ' || c == '(' || c == ')' || c == '+' || c == ',';
            sb.append(ok ? c : '_');
        }
        String clean = sb.toString().trim();
        return clean.isEmpty() ? "flagplays.bin" : clean;
    }

    /** Resuelve el file:// pedido y garantiza que está dentro de cacheDir/shared. */
    private File fileFor(Uri uri) {
        if (uri == null) {
            return null;
        }
        String name = null;
        if (uri.getPathSegments().size() >= 2) {
            name = uri.getPathSegments().get(1);
        }
        if (name == null || name.isEmpty() || name.contains("..") || name.contains("/")) {
            return null;
        }
        File base = sharedDir(getContext());
        File file = new File(base, name);
        try {
            String basePath = base.getCanonicalPath();
            String filePath = file.getCanonicalPath();
            if (!filePath.startsWith(basePath + File.separator)) {
                return null;
            }
        } catch (IOException e) {
            return null;
        }
        return file;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        File file = fileFor(uri);
        if (file == null || !file.exists()) {
            return null;
        }
        String[] columns = projection != null ? projection
                : new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE};
        MatrixCursor cursor = new MatrixCursor(columns, 1);
        Object[] row = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            String col = columns[i];
            if (OpenableColumns.DISPLAY_NAME.equals(col)) {
                row[i] = file.getName();
            } else if (OpenableColumns.SIZE.equals(col)) {
                row[i] = file.length();
            } else if ("_data".equals(col)) {
                row[i] = file.getAbsolutePath();
            } else {
                row[i] = null;
            }
        }
        cursor.addRow(row);
        return cursor;
    }

    @Override
    public String getType(Uri uri) {
        File file = fileFor(uri);
        if (file == null) {
            return null;
        }
        String name = file.getName();
        int dot = name.lastIndexOf('.');
        String ext = dot >= 0 ? name.substring(dot + 1) : "";
        String mime = android.webkit.MimeTypeMap.getSingleton()
                .getMimeTypeFromExtension(ext.toLowerCase(java.util.Locale.ROOT));
        return mime != null ? mime : "application/octet-stream";
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        throw new UnsupportedOperationException("FlagPlaysProvider es de solo lectura");
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("FlagPlaysProvider es de solo lectura");
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        throw new UnsupportedOperationException("FlagPlaysProvider es de solo lectura");
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        File file = fileFor(uri);
        if (file == null || !file.exists()) {
            throw new FileNotFoundException("Fichero no disponible: " + uri);
        }
        if (mode != null && (mode.contains("w") || mode.contains("r+") || mode.contains("w+"))) {
            throw new FileNotFoundException("FlagPlaysProvider es de solo lectura");
        }
        return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY);
    }
}
