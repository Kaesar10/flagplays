package com.flagplays.app;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.CancellationSignal;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.print.PageRange;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.JavascriptInterface;
import android.webkit.JsPromptResult;
import android.webkit.JsResult;
import android.webkit.MimeTypeMap;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * FlagPlays: contenedor nativo de la web app.
 *
 * La web (HTML+CSS+módulos ES) se empaqueta en assets/www y se sirve desde el origen
 * virtual https://appassets.local interceptando las peticiones en
 * {@link WebViewClient#shouldInterceptRequest}. Los módulos ES no cargan desde file://,
 * de ahí el origen https interceptado.
 */
public class MainActivity extends Activity {

    private static final String TAG = "FlagPlays";
    private static final String HOST = "appassets.local";
    private static final String ORIGIN = "https://" + HOST;
    private static final String START_URL = ORIGIN + "/index.html";
    private static final int BG_COLOR = 0xFF0B1116;
    private static final long DOUBLE_BACK_MS = 2000L;
    private static final int REQ_WRITE_STORAGE = 4101;
    private static final int MAX_VIBRATION_MS = 2000;

    private FrameLayout root;
    private WebView web;
    private final Handler ui = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private long lastBackAt = 0L;

    /** Guardado pendiente de permiso de almacenamiento (API 24-28). */
    private String pendingName;
    private byte[] pendingData;
    private String pendingMime;

    // ---------------------------------------------------------------------
    // Ciclo de vida
    // ---------------------------------------------------------------------

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Cambia del tema splash al tema normal antes de crear la ventana.
        setTheme(R.style.Theme_FlagPlays);
        super.onCreate(savedInstanceState);
        configureWindow();

        root = new FrameLayout(this);
        root.setBackgroundColor(BG_COLOR);
        setContentView(root, new ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        applyDarkSystemBarAppearance();
        applySystemBarInsets();

        WebView.setWebContentsDebuggingEnabled(true);
        web = createWebView();
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        web.loadUrl(START_URL);
        Log.i(TAG, "MainActivity lista, cargando " + START_URL);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) {
            web.onResume();
        }
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onDestroy() {
        if (root != null) {
            for (int i = root.getChildCount() - 1; i >= 0; i--) {
                View child = root.getChildAt(i);
                if (child instanceof WebView) {
                    WebView candidate = (WebView) child;
                    if (candidate != web) {
                        destroyWebView(candidate);
                    }
                }
            }
            root.removeAllViews();
        }
        if (web != null) {
            destroyWebView(web);
            web = null;
        }
        io.shutdownNow();
        super.onDestroy();
    }

    private void destroyWebView(WebView view) {
        try {
            view.stopLoading();
            view.loadUrl("about:blank");
            view.removeAllViews();
            view.destroy();
        } catch (Exception e) {
            Log.w(TAG, "destroyWebView", e);
        }
    }

    // ---------------------------------------------------------------------
    // Ventana: tema oscuro + edge-to-edge + WindowInsets
    // ---------------------------------------------------------------------

    private void configureWindow() {
        Window window = getWindow();
        window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        window.setStatusBarColor(BG_COLOR);
        window.setNavigationBarColor(BG_COLOR);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            window.setNavigationBarDividerColor(BG_COLOR);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // En Android 11+ dibujamos de borde a borde y aplicamos los insets como padding.
            window.setDecorFitsSystemWindows(false);
        } else {
            // API 24-29: se deja que el contenido quede dentro de las barras (comportamiento clásico).
            window.getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        }
    }

    /** Iconos de barras en claro sobre fondo oscuro (se llama cuando el decor ya existe). */
    private void applyDarkSystemBarAppearance() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }
        try {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.setSystemBarsAppearance(0,
                        WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                                | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS);
            }
        } catch (Exception e) {
            Log.w(TAG, "applyDarkSystemBarAppearance", e);
        }
    }

    private void applySystemBarInsets() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            return;
        }
        root.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
            @Override
            public WindowInsets onApplyWindowInsets(View view, WindowInsets insets) {
                android.graphics.Insets bars = insets.getInsets(
                        WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout());
                android.graphics.Insets ime = insets.getInsets(WindowInsets.Type.ime());
                int left = bars.left;
                int top = bars.top;
                int right = bars.right;
                int bottom = Math.max(bars.bottom, ime.bottom);
                if (view.getPaddingLeft() != left || view.getPaddingTop() != top
                        || view.getPaddingRight() != right || view.getPaddingBottom() != bottom) {
                    view.setPadding(left, top, right, bottom);
                }
                return insets;
            }
        });
    }

    // ---------------------------------------------------------------------
    // WebView
    // ---------------------------------------------------------------------

    private WebView createWebView() {
        WebView view = new WebView(this);
        view.setBackgroundColor(BG_COLOR);
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setScrollBarStyle(View.SCROLLBARS_INSIDE_OVERLAY);

        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(false);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowFileAccessFromFileURLs(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setSupportMultipleWindows(false);
        settings.setLoadsImagesAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setDefaultTextEncodingName("UTF-8");
        // Los assets se leen siempre de los assets locales: sin caché obsoleta tras actualizar.
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        view.addJavascriptInterface(new Bridge(), "AndroidBridge");
        view.setWebViewClient(new AppWebViewClient());
        view.setWebChromeClient(new AppChromeClient());
        return view;
    }

    private final class AppWebViewClient extends WebViewClient {

        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            try {
                Uri url = request.getUrl();
                if (url == null || !HOST.equals(url.getHost())) {
                    return null;
                }
                return serveAsset(url.getPath());
            } catch (Exception e) {
                Log.e(TAG, "shouldInterceptRequest", e);
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri uri = request.getUrl();
            if (uri == null) {
                return true;
            }
            if (HOST.equals(uri.getHost())) {
                return false;
            }
            return openExternal(uri);
        }

        @Override
        public void onPageFinished(WebView view, String url) {
            super.onPageFinished(view, url);
            Log.i(TAG, "onPageFinished " + url);
            // Diagnóstico: deja en logcat el estado del arranque de la web.
            view.evaluateJavascript(
                    "(function(){try{return JSON.stringify({title:document.title,"
                            + "errors:window.__errors||[],"
                            + "fieldNodes:document.querySelectorAll('#fieldSvg *').length,"
                            + "textLength:(document.body?document.body.innerText.length:0)});}"
                            + "catch(e){return 'diag-error:'+e.message;}})()",
                    value -> Log.i(TAG, "boot-diag " + value));
        }
    }

    private final class AppChromeClient extends WebChromeClient {

        @Override
        public boolean onConsoleMessage(ConsoleMessage message) {
            if (message != null) {
                Log.d(TAG, "[web] " + message.message()
                        + " (" + message.sourceId() + ":" + message.lineNumber() + ")");
            }
            return true;
        }

        @Override
        public boolean onJsAlert(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsConfirm(WebView view, String url, String message, final JsResult result) {
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setPositiveButton(android.R.string.ok, (dialog, which) -> result.confirm())
                    .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
            return true;
        }

        @Override
        public boolean onJsPrompt(WebView view, String url, String message, String defaultValue,
                                  final JsPromptResult result) {
            final EditText input = new EditText(MainActivity.this);
            input.setText(defaultValue == null ? "" : defaultValue);
            new AlertDialog.Builder(MainActivity.this)
                    .setMessage(message)
                    .setView(input)
                    .setPositiveButton(android.R.string.ok,
                            (dialog, which) -> result.confirm(input.getText().toString()))
                    .setNegativeButton(android.R.string.cancel, (dialog, which) -> result.cancel())
                    .setOnCancelListener(dialog -> result.cancel())
                    .show();
            return true;
        }
    }

    // ---------------------------------------------------------------------
    // Servidor de assets (https://appassets.local -> assets/www)
    // ---------------------------------------------------------------------

    private WebResourceResponse serveAsset(String path) {
        try {
            String relative = path == null ? "" : path;
            if (relative.contains("..")) {
                return notFound();
            }
            while (relative.startsWith("/")) {
                relative = relative.substring(1);
            }
            if (relative.isEmpty() || relative.endsWith("/")) {
                relative += "index.html";
            }
            InputStream stream = getAssets().open("www/" + relative);
            String mime = mimeFor(relative);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            headers.put("X-Content-Type-Options", "nosniff");
            return new WebResourceResponse(mime, isTextMime(mime) ? "UTF-8" : null,
                    200, "OK", headers, stream);
        } catch (Exception e) {
            Log.w(TAG, "asset no encontrado: " + path + " (" + e.getMessage() + ")");
            return notFound();
        }
    }

    private WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "text/plain; charset=utf-8");
        headers.put("Cache-Control", "no-cache");
        byte[] body = "404 - no encontrado".getBytes();
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                headers, new ByteArrayInputStream(body));
    }

    private static String mimeFor(String path) {
        int dot = path.lastIndexOf('.');
        String ext = dot >= 0 ? path.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
        switch (ext) {
            case "html":
            case "htm":
                return "text/html";
            case "js":
            case "mjs":
                return "application/javascript";
            case "css":
                return "text/css";
            case "json":
                return "application/json";
            case "webmanifest":
            case "manifest":
                return "application/manifest+json";
            case "svg":
                return "image/svg+xml";
            case "png":
                return "image/png";
            case "jpg":
            case "jpeg":
                return "image/jpeg";
            case "webp":
                return "image/webp";
            case "gif":
                return "image/gif";
            case "ico":
                return "image/x-icon";
            case "txt":
                return "text/plain";
            case "pdf":
                return "application/pdf";
            case "woff2":
                return "font/woff2";
            case "woff":
                return "font/woff";
            case "ttf":
                return "font/ttf";
            case "otf":
                return "font/otf";
            case "mp3":
                return "audio/mpeg";
            case "wav":
                return "audio/wav";
            case "ogg":
                return "audio/ogg";
            case "mp4":
                return "video/mp4";
            default:
                return "application/octet-stream";
        }
    }

    private static boolean isTextMime(String mime) {
        return mime.startsWith("text/")
                || mime.contains("javascript")
                || mime.contains("json")
                || mime.contains("svg")
                || mime.contains("manifest");
    }

    private boolean openExternal(Uri uri) {
        try {
            String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
            boolean allowed = "http".equals(scheme) || "https".equals(scheme)
                    || "mailto".equals(scheme) || "tel".equals(scheme) || "sms".equals(scheme);
            if (!allowed) {
                Log.w(TAG, "esquema bloqueado: " + uri);
                return true;
            }
            Intent intent = new Intent(Intent.ACTION_VIEW, uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(intent);
        } catch (Exception e) {
            Log.w(TAG, "openExternal", e);
            toastOnUi(getString(R.string.no_link_handler));
        }
        return true;
    }

    // ---------------------------------------------------------------------
    // Botón atrás
    // ---------------------------------------------------------------------

    @Override
    public void onBackPressed() {
        final WebView current = web;
        if (current == null) {
            super.onBackPressed();
            return;
        }
        current.evaluateJavascript(
                "(window.__androidBack && window.__androidBack()) ? '1' : '0'",
                value -> {
                    boolean handled = value != null && value.contains("1");
                    if (handled) {
                        lastBackAt = 0L;
                        Log.d(TAG, "atrás consumido por la web");
                        return;
                    }
                    long now = SystemClock.uptimeMillis();
                    if (now - lastBackAt <= DOUBLE_BACK_MS) {
                        lastBackAt = 0L;
                        finish();
                        return;
                    }
                    lastBackAt = now;
                    Toast.makeText(MainActivity.this, R.string.back_exit, Toast.LENGTH_SHORT).show();
                });
    }

    // ---------------------------------------------------------------------
    // Impresión nativa (printHtml)
    // ---------------------------------------------------------------------

    private void startPrint(final String html) {
        try {
            final WebView printView = new WebView(this);
            printView.setBackgroundColor(Color.WHITE);
            WebSettings settings = printView.getSettings();
            settings.setJavaScriptEnabled(false);
            settings.setAllowFileAccess(false);
            settings.setAllowContentAccess(false);
            settings.setSupportZoom(false);
            settings.setBuiltInZoomControls(false);

            printView.setWebViewClient(new WebViewClient() {
                private boolean printed = false;

                @Override
                public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                    Uri url = request.getUrl();
                    if (url != null && HOST.equals(url.getHost())) {
                        return serveAsset(url.getPath());
                    }
                    return null;
                }

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (printed) {
                        return;
                    }
                    printed = true;
                    try {
                        PrintManager manager = (PrintManager) getSystemService(Context.PRINT_SERVICE);
                        if (manager == null) {
                            throw new IllegalStateException("PrintManager no disponible");
                        }
                        String jobName = "FlagPlays";
                        PrintAttributes attributes = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .setColorMode(PrintAttributes.COLOR_MODE_COLOR)
                                .build();
                        PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                        manager.print(jobName, new CleanupAdapter(adapter, view), attributes);
                        Log.i(TAG, "diálogo de impresión abierto");
                    } catch (Exception e) {
                        Log.e(TAG, "print", e);
                        cleanupPrintView(view);
                        toastOnUi(getString(R.string.print_unavailable));
                    }
                }
            });

            // Se añade detrás del WebView principal (opaco), así se maqueta sin verse.
            root.addView(printView, 0, new FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
            printView.loadDataWithBaseURL(ORIGIN + "/", html, "text/html", "UTF-8", null);
        } catch (Exception e) {
            Log.e(TAG, "startPrint", e);
            toastOnUi(getString(R.string.print_unavailable));
        }
    }

    /** Envuelve el adaptador del WebView para liberarlo cuando el trabajo termina. */
    private final class CleanupAdapter extends PrintDocumentAdapter {

        private final PrintDocumentAdapter inner;
        private final WebView view;

        CleanupAdapter(PrintDocumentAdapter inner, WebView view) {
            this.inner = inner;
            this.view = view;
        }

        @Override
        public void onStart() {
            inner.onStart();
        }

        @Override
        public void onLayout(PrintAttributes oldAttributes, PrintAttributes newAttributes,
                             CancellationSignal cancellationSignal,
                             PrintDocumentAdapter.LayoutResultCallback callback,
                             Bundle extras) {
            inner.onLayout(oldAttributes, newAttributes, cancellationSignal, callback, extras);
        }

        @Override
        public void onWrite(PageRange[] pages, ParcelFileDescriptor destination,
                            CancellationSignal cancellationSignal,
                            PrintDocumentAdapter.WriteResultCallback callback) {
            inner.onWrite(pages, destination, cancellationSignal, callback);
        }

        @Override
        public void onFinish() {
            inner.onFinish();
            ui.postDelayed(() -> cleanupPrintView(view), 3000L);
        }
    }

    private void cleanupPrintView(final WebView view) {
        try {
            if (view.getParent() instanceof ViewGroup) {
                ((ViewGroup) view.getParent()).removeView(view);
            }
            destroyWebView(view);
        } catch (Exception e) {
            Log.w(TAG, "cleanupPrintView", e);
        }
    }

    // ---------------------------------------------------------------------
    // Guardar ficheros (Descargas)
    // ---------------------------------------------------------------------

    /** API 29+: MediaStore.Downloads (no requiere permisos). */
    private void saveToDownloads(String name, byte[] data, String mime) {
        Uri uri = null;
        ContentResolver resolver = getContentResolver();
        try {
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
            if (uri == null) {
                throw new IOException("MediaStore rechazó el fichero");
            }
            OutputStream out = resolver.openOutputStream(uri);
            if (out == null) {
                throw new IOException("No se pudo abrir el destino en MediaStore");
            }
            try {
                out.write(data);
                out.flush();
            } finally {
                try {
                    out.close();
                } catch (IOException ignored) {
                }
            }
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(uri, done, null, null);
            Log.i(TAG, "saveFile -> " + uri + " (" + data.length + " bytes)");
            toastOnUi(getString(R.string.save_ok, name));
        } catch (Exception e) {
            Log.e(TAG, "saveToDownloads", e);
            if (uri != null) {
                try {
                    resolver.delete(uri, null, null);
                } catch (Exception ignored) {
                }
            }
            fallbackSave(name, data);
        }
    }

    /** API 24-28: fichero en Descargas + escaneo de medios (requiere WRITE_EXTERNAL_STORAGE). */
    private void saveLegacy(String name, byte[] data, String mime) {
        try {
            File dir = Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS);
            if (dir != null && !dir.exists()) {
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
            }
            if (dir == null || !dir.isDirectory()) {
                throw new IOException("Descargas no disponible");
            }
            File target = uniqueFile(dir, name);
            FileOutputStream out = new FileOutputStream(target);
            try {
                out.write(data);
                out.flush();
            } finally {
                try {
                    out.close();
                } catch (IOException ignored) {
                }
            }
            MediaScannerConnection.scanFile(this,
                    new String[]{target.getAbsolutePath()}, new String[]{mime}, null);
            Log.i(TAG, "saveLegacy -> " + target.getAbsolutePath());
            toastOnUi(getString(R.string.save_ok, target.getName()));
        } catch (Exception e) {
            Log.e(TAG, "saveLegacy", e);
            fallbackSave(name, data);
        }
    }

    /** Último recurso sin permisos: carpeta privada de la app (siempre escribible). */
    private void fallbackSave(String name, byte[] data) {
        try {
            File base = getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS);
            if (base == null) {
                base = new File(getFilesDir(), "downloads");
            }
            if (!base.exists()) {
                //noinspection ResultOfMethodCallIgnored
                base.mkdirs();
            }
            File target = uniqueFile(base, name);
            FileOutputStream out = new FileOutputStream(target);
            try {
                out.write(data);
                out.flush();
            } finally {
                try {
                    out.close();
                } catch (IOException ignored) {
                }
            }
            Log.w(TAG, "fallbackSave -> " + target.getAbsolutePath());
            toastOnUi(getString(R.string.save_private, target.getAbsolutePath()));
        } catch (Exception e) {
            Log.e(TAG, "fallbackSave", e);
            toastOnUi(getString(R.string.save_failed));
        }
    }

    private boolean hasLegacyWritePermission() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return true;
        }
        return checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        if (requestCode != REQ_WRITE_STORAGE) {
            super.onRequestPermissionsResult(requestCode, permissions, grantResults);
            return;
        }
        final String name = pendingName;
        final byte[] data = pendingData;
        final String mime = pendingMime;
        pendingName = null;
        pendingData = null;
        pendingMime = null;
        boolean granted = grantResults.length > 0
                && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (name == null || data == null) {
            return;
        }
        if (granted) {
            io.execute(() -> saveLegacy(name, data, mime));
        } else {
            io.execute(() -> fallbackSave(name, data));
        }
    }

    private static File uniqueFile(File dir, String name) {
        File candidate = new File(dir, name);
        if (!candidate.exists()) {
            return candidate;
        }
        String base = name;
        String ext = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            base = name.substring(0, dot);
            ext = name.substring(dot);
        }
        for (int i = 1; i < 1000; i++) {
            candidate = new File(dir, base + " (" + i + ")" + ext);
            if (!candidate.exists()) {
                return candidate;
            }
        }
        return new File(dir, base + "-" + System.currentTimeMillis() + ext);
    }

    // ---------------------------------------------------------------------
    // Utilidades
    // ---------------------------------------------------------------------

    private void toastOnUi(final String message) {
        ui.post(() -> {
            try {
                Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
            } catch (Exception e) {
                Log.w(TAG, "toast", e);
            }
        });
    }

    private static String safeFileName(String filename) {
        String name = filename == null ? "" : filename.trim();
        int slash = Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\'));
        if (slash >= 0) {
            name = name.substring(slash + 1);
        }
        StringBuilder sb = new StringBuilder(name.length());
        for (int i = 0; i < name.length() && sb.length() < 120; i++) {
            char c = name.charAt(i);
            boolean ok = Character.isLetterOrDigit(c) || c == '.' || c == '-' || c == '_'
                    || c == ' ' || c == '(' || c == ')' || c == '+';
            sb.append(ok ? c : '_');
        }
        String clean = sb.toString().trim();
        return clean.isEmpty() ? "flagplays" : clean;
    }

    private static String normalizeMime(String mime, String filename) {
        String type = mime == null ? "" : mime.trim();
        int semicolon = type.indexOf(';');
        if (semicolon >= 0) {
            type = type.substring(0, semicolon).trim();
        }
        if (type.isEmpty() || !type.contains("/")) {
            int dot = filename.lastIndexOf('.');
            String ext = dot >= 0 ? filename.substring(dot + 1).toLowerCase(Locale.ROOT) : "";
            type = MimeTypeMap.getSingleton().getMimeTypeFromExtension(ext);
        }
        if (type == null || type.isEmpty() || !type.contains("/")) {
            type = "application/octet-stream";
        }
        return type;
    }

    private static byte[] decodeBase64(String base64) {
        String data = base64 == null ? "" : base64;
        int comma = data.indexOf(',');
        if (comma >= 0) {
            // Admite data URLs completas (data:image/png;base64,....).
            data = data.substring(comma + 1);
        }
        return Base64.decode(data, Base64.DEFAULT);
    }

    // ---------------------------------------------------------------------
    // Puente JavaScript
    // ---------------------------------------------------------------------

    private final class Bridge {

        /** Guarda un fichero en Descargas. filename, base64 y mime vienen de la web. */
        @JavascriptInterface
        public String saveFile(String filename, String base64, String mime) {
            try {
                if (base64 == null || base64.isEmpty()) {
                    toastOnUi(getString(R.string.save_no_data));
                    return "error:sin-datos";
                }
                final String name = safeFileName(filename);
                final byte[] data = decodeBase64(base64);
                final String type = normalizeMime(mime, name);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    io.execute(() -> saveToDownloads(name, data, type));
                } else if (hasLegacyWritePermission()) {
                    io.execute(() -> saveLegacy(name, data, type));
                } else {
                    pendingName = name;
                    pendingData = data;
                    pendingMime = type;
                    runOnUiThread(() -> {
                        try {
                            requestPermissions(
                                    new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE},
                                    REQ_WRITE_STORAGE);
                        } catch (Exception e) {
                            Log.e(TAG, "requestPermissions", e);
                            io.execute(() -> fallbackSave(name, data));
                        }
                    });
                }
                return "ok";
            } catch (Exception e) {
                Log.e(TAG, "saveFile", e);
                toastOnUi(getString(R.string.save_failed));
                return "error";
            }
        }

        /** Comparte un texto plano con el selector del sistema. */
        @JavascriptInterface
        public boolean shareText(final String text) {
            try {
                final String payload = text == null ? "" : text;
                runOnUiThread(() -> {
                    try {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType("text/plain");
                        send.putExtra(Intent.EXTRA_SUBJECT, "FlagPlays");
                        send.putExtra(Intent.EXTRA_TEXT, payload);
                        startActivity(Intent.createChooser(send, getString(R.string.share_chooser)));
                    } catch (Exception e) {
                        Log.e(TAG, "shareText", e);
                    }
                });
                return true;
            } catch (Exception e) {
                Log.e(TAG, "shareText", e);
                return false;
            }
        }

        /**
         * Extra (no imprescindible para la web actual): comparte un fichero generado
         * (PDF/PNG/JSON) usando el FileProvider propio.
         */
        @JavascriptInterface
        public String shareFile(String filename, String base64, String mime) {
            try {
                if (base64 == null || base64.isEmpty()) {
                    return "error:sin-datos";
                }
                final String name = safeFileName(filename);
                final byte[] data = decodeBase64(base64);
                final String type = normalizeMime(mime, name);
                File file = FlagPlaysProvider.writeShared(MainActivity.this, name, data);
                final Uri uri = FlagPlaysProvider.uriFor(file.getName());
                runOnUiThread(() -> {
                    try {
                        Intent send = new Intent(Intent.ACTION_SEND);
                        send.setType(type);
                        send.putExtra(Intent.EXTRA_STREAM, uri);
                        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                        startActivity(Intent.createChooser(send, getString(R.string.share_file_chooser)));
                    } catch (Exception e) {
                        Log.e(TAG, "shareFile", e);
                    }
                });
                return "ok";
            } catch (Exception e) {
                Log.e(TAG, "shareFile", e);
                return "error";
            }
        }

        /** Imprime un documento HTML con el diálogo del sistema (permite Guardar como PDF). */
        @JavascriptInterface
        public void printHtml(final String html) {
            try {
                if (html == null || html.trim().isEmpty()) {
                    toastOnUi(getString(R.string.print_empty));
                    return;
                }
                runOnUiThread(() -> startPrint(html));
            } catch (Exception e) {
                Log.e(TAG, "printHtml", e);
                toastOnUi(getString(R.string.print_unavailable));
            }
        }

        /** Vibración corta (ms). */
        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                int duration = Math.max(1, Math.min(ms <= 0 ? 12 : ms, MAX_VIBRATION_MS));
                Vibrator vibrator = null;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    Object service = getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                    if (service instanceof VibratorManager) {
                        vibrator = ((VibratorManager) service).getDefaultVibrator();
                    }
                } else {
                    Object service = getSystemService(Context.VIBRATOR_SERVICE);
                    if (service instanceof Vibrator) {
                        vibrator = (Vibrator) service;
                    }
                }
                if (vibrator == null || !vibrator.hasVibrator()) {
                    return;
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(duration,
                            VibrationEffect.DEFAULT_AMPLITUDE));
                } else {
                    vibrator.vibrate(duration);
                }
            } catch (Exception e) {
                Log.w(TAG, "vibrate", e);
            }
        }

        /** versión de la app ("1.0"). */
        @JavascriptInterface
        public String getVersion() {
            try {
                PackageInfo info = getPackageManager().getPackageInfo(getPackageName(), 0);
                return info.versionName == null ? "1.0" : info.versionName;
            } catch (Exception e) {
                return "1.0";
            }
        }
    }
}
