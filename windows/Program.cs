using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace FlagPlays
{
    /// <summary>
    /// Rutas de la aplicación. Todo lo persistente vive en %LOCALAPPDATA%\FlagPlays
    /// y los ficheros del usuario van a su carpeta de Descargas.
    /// </summary>
    internal static class AppPaths
    {
        public static string LocalAppDirectory
        {
            get
            {
                return Path.Combine(
                    Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                    "FlagPlays");
            }
        }

        public static string WebViewDataDirectory
        {
            get { return Path.Combine(LocalAppDirectory, "WebView2"); }
        }

        public static string WindowStateFile
        {
            get { return Path.Combine(LocalAppDirectory, "window.json"); }
        }

        public static string LogFile
        {
            get { return Path.Combine(LocalAppDirectory, "app.log"); }
        }

        public static string DownloadsDirectory
        {
            get
            {
                string profile = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
                return Path.Combine(profile, "Downloads");
            }
        }

        /// <summary>assets/www copiados junto al .exe (sin servidor: se mapean como origen virtual).</summary>
        public static string WwwDirectory
        {
            get { return Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "www"); }
        }
    }

    /// <summary>Registro sencillo en %LOCALAPPDATA%\FlagPlays\app.log (diagnóstico y soporte).</summary>
    internal static class Log
    {
        private static readonly object Sync = new object();
        private const long MaxBytes = 2L * 1024L * 1024L;

        public static void Info(string message)
        {
            Write("INFO", message);
        }

        public static void Warn(string message)
        {
            Write("WARN", message);
        }

        public static void Error(string message)
        {
            Write("ERROR", message);
        }

        private static void Write(string level, string message)
        {
            try
            {
                lock (Sync)
                {
                    Directory.CreateDirectory(AppPaths.LocalAppDirectory);
                    string file = AppPaths.LogFile;
                    try
                    {
                        if (File.Exists(file) && new FileInfo(file).Length > MaxBytes)
                        {
                            File.Delete(file);
                        }
                    }
                    catch (Exception)
                    {
                    }
                    string line = DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff")
                        + " [" + level + "] " + message + Environment.NewLine;
                    File.AppendAllText(file, line, Encoding.UTF8);
                }
            }
            catch (Exception)
            {
                // El registro nunca debe tumbar la app.
            }
        }
    }

    internal static class Program
    {
        internal const string AppName = "FlagPlays";
        internal const string AppVersion = "1.0";

        [DllImport("user32.dll")]
        private static extern bool SetForegroundWindow(IntPtr hWnd);

        [DllImport("user32.dll")]
        private static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

        [DllImport("user32.dll", CharSet = CharSet.Unicode)]
        private static extern IntPtr FindWindow(string lpClassName, string lpWindowName);

        private const int SW_RESTORE = 9;

        [STAThread]
        private static void Main(string[] args)
        {
            bool dev = HasFlag(args, "--dev");

            Application.ThreadException += OnThreadException;
            AppDomain.CurrentDomain.UnhandledException += OnUnhandledException;

            bool createdNew;
            Mutex mutex = new Mutex(true, "Local\\FlagPlays.SingleInstance", out createdNew);
            if (!createdNew)
            {
                // Ya hay una instancia abierta: se activa y este proceso termina.
                Log.Info("segunda instancia detectada; activando la ventana existente");
                ActivateExistingWindow(AppName);
                return;
            }

            try
            {
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                Application.Run(new MainForm(dev));
            }
            finally
            {
                try
                {
                    mutex.ReleaseMutex();
                }
                catch (Exception)
                {
                }
                mutex.Dispose();
            }
        }

        private static bool HasFlag(string[] args, string flag)
        {
            if (args == null)
            {
                return false;
            }
            foreach (string arg in args)
            {
                if (string.Equals(arg, flag, StringComparison.OrdinalIgnoreCase))
                {
                    return true;
                }
            }
            return false;
        }

        private static void ActivateExistingWindow(string title)
        {
            for (int i = 0; i < 40; i++)
            {
                IntPtr handle = FindWindow(null, title);
                if (handle != IntPtr.Zero)
                {
                    ShowWindow(handle, SW_RESTORE);
                    SetForegroundWindow(handle);
                    return;
                }
                Thread.Sleep(100);
            }
            Log.Warn("no se encontró la ventana de la instancia existente");
        }

        private static void OnThreadException(object sender, ThreadExceptionEventArgs e)
        {
            Log.Error("excepción no controlada (UI): " + e.Exception);
        }

        private static void OnUnhandledException(object sender, UnhandledExceptionEventArgs e)
        {
            Log.Error("excepción no controlada: " + e.ExceptionObject);
        }
    }

    /// <summary>
    /// Ventana principal: WebView2 sirviendo la web empaquetada desde el origen virtual
    /// https://appassets.local (sin servidor local, sin red) + puente nativo.
    /// </summary>
    internal sealed class MainForm : Form
    {
        private const string VirtualHost = "appassets.local";
        private const string StartUrl = "https://appassets.local/index.html";
        private static readonly Color BackgroundColor = Color.FromArgb(255, 0x0B, 0x11, 0x16);

        [DllImport("user32.dll")]
        private static extern uint GetDpiForWindow(IntPtr hWnd);

        // Barra de título oscura (Windows 11 / Windows 10 1809+).
        [DllImport("dwmapi.dll")]
        private static extern int DwmSetWindowAttribute(IntPtr hwnd, int attribute, ref int value, int size);

        private const int DwmwaUseImmersiveDarkMode = 20;
        private const int DwmwaUseImmersiveDarkModeLegacy = 19;
        private const int DwmwaBorderColor = 34;
        private const int DwmwaCaptionColor = 35;
        private const int DwmwaTextColor = 36;

        private readonly bool _dev;
        private readonly JavaScriptSerializer _json;
        private readonly KeyMessageFilter _keyFilter;

        private WebView2 _web;
        private bool _initialized;
        private bool _fullscreen;
        private bool _hasSavedGeometry;
        private FormBorderStyle _savedBorderStyle;
        private FormWindowState _savedWindowState;
        private Rectangle _savedBounds;
        private bool _closing;

        public MainForm(bool dev)
        {
            _dev = dev;
            _json = new JavaScriptSerializer();
            _json.MaxJsonLength = int.MaxValue;
            _json.RecursionLimit = 200;

            Text = Program.AppName;
            BackColor = BackgroundColor;
            AutoScaleMode = AutoScaleMode.Dpi;
            StartPosition = FormStartPosition.CenterScreen;
            // 1440x900 y minimo 900x600 en pixeles logicos (se escalan por DPI en OnLoad).
            MinimumSize = new Size(900, 600);
            Size = new Size(1440, 900);
            Icon = LoadApplicationIcon();

            try
            {
                RestoreWindowState();
            }
            catch (Exception ex)
            {
                Log.Warn("no se pudo restaurar la geometría de la ventana: " + ex.Message);
            }

            _web = new WebView2();
            _web.Dock = DockStyle.Fill;
            _web.BackColor = BackgroundColor;
            try
            {
                // Evita el destello blanco mientras WebView2 arranca.
                _web.DefaultBackgroundColor = BackgroundColor;
            }
            catch (Exception ex)
            {
                Log.Warn("DefaultBackgroundColor (antes de iniciar): " + ex.Message);
            }
            Controls.Add(_web);

            _keyFilter = new KeyMessageFilter(this);
            Application.AddMessageFilter(_keyFilter);

            Shown += OnShown;
            FormClosing += OnFormClosing;
            Log.Info("FlagPlays " + Program.AppVersion + " iniciando (dev=" + _dev + ")");
        }

        // -----------------------------------------------------------------
        // Barra de título oscura
        // -----------------------------------------------------------------

        protected override void OnHandleCreated(EventArgs e)
        {
            base.OnHandleCreated(e);
            ApplyDarkTitleBar();
        }

        /// <summary>
        /// Pone la barra de título nativa en oscuro (#0B1116) para que no desentone
        /// con la app. En Windows 11 además fija caption/borde/color de texto.
        /// </summary>
        private void ApplyDarkTitleBar()
        {
            try
            {
                int dark = 1;
                int result = DwmSetWindowAttribute(
                    Handle, DwmwaUseImmersiveDarkMode, ref dark, sizeof(int));
                if (result != 0)
                {
                    DwmSetWindowAttribute(
                        Handle, DwmwaUseImmersiveDarkModeLegacy, ref dark, sizeof(int));
                }
                // COLORREF: 0x00BBGGRR
                int caption = 0x0016110B; // #0B1116
                DwmSetWindowAttribute(Handle, DwmwaCaptionColor, ref caption, sizeof(int));
                int border = 0x003A301F; // #1F303A
                DwmSetWindowAttribute(Handle, DwmwaBorderColor, ref border, sizeof(int));
                int text = 0x00F2F6EE; // #EEF6F2
                DwmSetWindowAttribute(Handle, DwmwaTextColor, ref text, sizeof(int));
                Log.Info("barra de título oscura aplicada");
            }
            catch (Exception ex)
            {
                Log.Warn("no se pudo aplicar la barra de título oscura: " + ex.Message);
            }
        }

        // -----------------------------------------------------------------
        // Tamano inicial y centrado con el DPI real del monitor
        // -----------------------------------------------------------------

        protected override void OnLoad(EventArgs e)
        {
            base.OnLoad(e);
            try
            {
                // WinForms trabaja en pixeles fisicos con DPI awareness PerMonitorV2:
                // el tamano "logico" pedido (1440x900) se escala por el DPI real de la ventana.
                float scale = 1f;
                uint dpi = 0;
                try
                {
                    dpi = GetDpiForWindow(Handle);
                }
                catch (Exception)
                {
                }
                if (dpi >= 96)
                {
                    scale = dpi / 96f;
                }
                else if (DeviceDpi >= 96)
                {
                    scale = DeviceDpi / 96f;
                }
                if (scale < 1f)
                {
                    scale = 1f;
                }

                MinimumSize = new Size(
                    (int)Math.Round(900 * scale),
                    (int)Math.Round(600 * scale));

                // Se abre en el monitor donde está el usuario (no en uno cualquiera).
                Rectangle workingArea = Screen.FromPoint(Cursor.Position).WorkingArea;
                if (_hasSavedGeometry)
                {
                    Log.Info("usando geometría guardada: " + Bounds);
                    return;
                }

                int width = (int)Math.Round(1440 * scale);
                int height = (int)Math.Round(900 * scale);
                // Si no cabe en el monitor, se deja margen para la barra de tareas.
                int maxWidth = (int)Math.Round(workingArea.Width * 0.95);
                int maxHeight = (int)Math.Round(workingArea.Height * 0.95);
                if (width > maxWidth)
                {
                    width = maxWidth;
                }
                if (height > maxHeight)
                {
                    height = maxHeight;
                }
                StartPosition = FormStartPosition.Manual;
                Size = new Size(width, height);
                Location = new Point(
                    workingArea.Left + (workingArea.Width - Width) / 2,
                    workingArea.Top + (workingArea.Height - Height) / 2);
                Log.Info("ventana inicial: " + Bounds + " (escala " + scale.ToString("0.00")
                    + ", dpi " + dpi + ", area " + workingArea + ")");
                ApplyDarkTitleBar();
            }
            catch (Exception ex)
            {
                Log.Warn("no se pudo ajustar el tamano inicial: " + ex.Message);
            }
        }

        // -----------------------------------------------------------------
        // Arranque de WebView2
        // -----------------------------------------------------------------

        private async void OnShown(object sender, EventArgs e)
        {
            try
            {
                await InitializeWebViewAsync();
            }
            catch (Exception ex)
            {
                ShowFatal(ex);
            }
        }

        private async Task InitializeWebViewAsync()
        {
            if (_initialized)
            {
                return;
            }
            _initialized = true;

            string www = AppPaths.WwwDirectory;
            if (!File.Exists(Path.Combine(www, "index.html")))
            {
                throw new InvalidOperationException(
                    "No se encuentra la carpeta 'www' junto a FlagPlays.exe.\r\n"
                    + "Ruta esperada: " + www
                    + "\r\n\r\nVuelve a generar la aplicación con tools\\build-win.ps1.");
            }

            Directory.CreateDirectory(AppPaths.LocalAppDirectory);
            Directory.CreateDirectory(AppPaths.WebViewDataDirectory);

            // La app es 100% local: se desactiva el networking de fondo del motor
            // (telemetría, actualizaciones de componentes, variaciones, DNS prefetch...).
            StringBuilder arguments = new StringBuilder();
            arguments.Append("--disable-background-networking");
            arguments.Append(" --disable-component-update");
            arguments.Append(" --disable-domain-reliability");
            arguments.Append(" --disable-client-side-phishing-detection");
            arguments.Append(" --disable-sync");
            arguments.Append(" --no-pings");
            arguments.Append(" --dns-prefetch-disable");
            // Cero red: cualquier nombre externo deja de resolverse. El host virtual de la
            // app (appassets.local) se resuelve antes del DNS, así que la app sigue cargando.
            arguments.Append(" --host-resolver-rules=\"MAP * ~NOTFOUND\"");
            arguments.Append(" --disable-features=msEdgeNetworkTelemetry,OptimizationHints,Translate");
            arguments.Append(" --disable-breakpad");
            if (_dev)
            {
                arguments.Append(" --remote-debugging-port=9222");
            }

            CoreWebView2EnvironmentOptions options = new CoreWebView2EnvironmentOptions();
            options.AdditionalBrowserArguments = arguments.ToString();
            try
            {
                // true = no se envían volcados de fallo al endpoint de Microsoft.
                options.IsCustomCrashReportingEnabled = true;
            }
            catch (Exception ex)
            {
                Log.Warn("IsCustomCrashReportingEnabled no disponible: " + ex.Message);
            }
            if (_dev)
            {
                Log.Info("modo dev: DevTools en http://127.0.0.1:9222");
            }
            Log.Info("argumentos del motor: " + arguments);

            CoreWebView2Environment environment;
            try
            {
                environment = await CoreWebView2Environment.CreateAsync(
                    null, AppPaths.WebViewDataDirectory, options);
            }
            catch (Exception ex)
            {
                throw new InvalidOperationException(
                    "No se pudo iniciar el motor WebView2 (Microsoft Edge WebView2 Runtime).\r\n"
                    + "Instala el runtime de WebView2 y vuelve a abrir FlagPlays.\r\n\r\n"
                    + ex.Message, ex);
            }

            await _web.EnsureCoreWebView2Async(environment);
            CoreWebView2 core = _web.CoreWebView2;
            if (core == null)
            {
                throw new InvalidOperationException("WebView2 no devolvió un CoreWebView2 válido.");
            }

            ConfigureSettings(core);

            try
            {
                _web.DefaultBackgroundColor = BackgroundColor;
            }
            catch (Exception ex)
            {
                Log.Warn("DefaultBackgroundColor no disponible: " + ex.Message);
            }
            try
            {
                // Tema oscuro también para barras de desplazamiento y controles nativos.
                core.Profile.PreferredColorScheme = CoreWebView2PreferredColorScheme.Dark;
            }
            catch (Exception ex)
            {
                Log.Warn("PreferredColorScheme no disponible: " + ex.Message);
            }

            // La web empaquetada se sirve como https://appassets.local sin ningún servidor.
            core.SetVirtualHostNameToFolderMapping(
                VirtualHost, www, CoreWebView2HostResourceAccessKind.DenyCors);

            core.NavigationStarting += OnNavigationStarting;
            core.NavigationCompleted += OnNavigationCompleted;
            core.NewWindowRequested += OnNewWindowRequested;
            core.WebMessageReceived += OnWebMessageReceived;
            core.DownloadStarting += OnDownloadStarting;
            core.ProcessFailed += OnProcessFailed;
            core.WebResourceRequested += OnWebResourceRequested;
            core.AddWebResourceRequestedFilter("*", CoreWebView2WebResourceContext.All);

            Log.Info("WebView2 listo; cargando " + StartUrl);
            _web.Source = new Uri(StartUrl);
        }

        private void ConfigureSettings(CoreWebView2 core)
        {
            CoreWebView2Settings settings = core.Settings;
            settings.AreDevToolsEnabled = _dev;
            settings.AreDefaultContextMenusEnabled = false;
            settings.IsStatusBarEnabled = false;
            settings.IsZoomControlEnabled = false;
            settings.AreBrowserAcceleratorKeysEnabled = _dev;
            settings.IsPasswordAutosaveEnabled = false;
            settings.IsGeneralAutofillEnabled = false;
            settings.IsSwipeNavigationEnabled = false;
            settings.IsBuiltInErrorPageEnabled = false;
            settings.IsWebMessageEnabled = true;
            try
            {
                // Sin SmartScreen: no se consultan reputaciones de URL (nada de red).
                settings.IsReputationCheckingRequired = false;
            }
            catch (Exception ex)
            {
                Log.Warn("IsReputationCheckingRequired no disponible: " + ex.Message);
            }
        }

        private void ShowFatal(Exception ex)
        {
            Log.Error("error de arranque: " + ex);
            if (_closing)
            {
                return;
            }
            MessageBox.Show(this,
                "No se pudo iniciar FlagPlays.\r\n\r\n" + ex.Message,
                Program.AppName, MessageBoxButtons.OK, MessageBoxIcon.Error);
            Close();
        }

        // -----------------------------------------------------------------
        // Sin red: solo se permite el origen virtual local
        // -----------------------------------------------------------------

        private static bool IsInternalUri(string uri)
        {
            if (string.IsNullOrEmpty(uri))
            {
                return false;
            }
            if (string.Equals(uri, "about:blank", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (uri.StartsWith("data:", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (uri.StartsWith("blob:", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (string.Equals(uri, "https://" + VirtualHost, StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            if (uri.StartsWith("https://" + VirtualHost + "/", StringComparison.OrdinalIgnoreCase))
            {
                return true;
            }
            return false;
        }

        private void OnNavigationStarting(object sender, CoreWebView2NavigationStartingEventArgs e)
        {
            if (IsInternalUri(e.Uri))
            {
                Log.Info("navegación: " + e.Uri);
                return;
            }
            // Cualquier navegación externa se cancela: la app no usa internet.
            e.Cancel = true;
            Log.Warn("navegación externa bloqueada: " + e.Uri);
        }

        private async void OnNavigationCompleted(object sender, CoreWebView2NavigationCompletedEventArgs e)
        {
            Log.Info("página cargada: ok=" + e.IsSuccess + " status=" + e.WebErrorStatus);
            if (!e.IsSuccess)
            {
                Log.Error("la interfaz no se pudo cargar (" + e.WebErrorStatus + ")");
                return;
            }
            try
            {
                string title = await _web.CoreWebView2.ExecuteScriptAsync("document.title");
                Log.Info("título del documento: " + title);
            }
            catch (Exception ex)
            {
                Log.Warn("no se pudo leer el título: " + ex.Message);
            }
        }

        private void OnWebResourceRequested(object sender, CoreWebView2WebResourceRequestedEventArgs e)
        {
            string uri = e.Request.Uri;
            if (IsInternalUri(uri))
            {
                return;
            }
            // Ningún recurso (CSS, imagen, fetch, fuente...) sale a la red.
            Log.Warn("recurso externo bloqueado: " + uri);
            try
            {
                e.Response = _web.CoreWebView2.Environment.CreateWebResourceResponse(
                    null, 403, "Blocked (sin red)", "Content-Type: text/plain");
            }
            catch (Exception ex)
            {
                Log.Error("no se pudo bloquear el recurso externo: " + ex.Message);
            }
        }

        private void OnNewWindowRequested(object sender, CoreWebView2NewWindowRequestedEventArgs e)
        {
            e.Handled = true;
            Log.Warn("ventana nueva bloqueada: " + e.Uri);
        }

        private void OnProcessFailed(object sender, CoreWebView2ProcessFailedEventArgs e)
        {
            Log.Error("proceso WebView2 falló: " + e.ProcessFailedKind);
        }

        // -----------------------------------------------------------------
        // Puente con la web (window.chrome.webview.postMessage)
        // -----------------------------------------------------------------

        private void OnWebMessageReceived(object sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            Dictionary<string, object> message;
            try
            {
                message = _json.Deserialize<Dictionary<string, object>>(e.WebMessageAsJson);
            }
            catch (Exception ex)
            {
                Log.Error("mensaje web no válido: " + ex.Message);
                return;
            }
            if (message == null || !message.ContainsKey("type"))
            {
                Log.Warn("mensaje web sin 'type'");
                return;
            }

            string type = Convert.ToString(message["type"]);
            Log.Info("mensaje web: " + type);
            try
            {
                if (type == "saveFile")
                {
                    HandleSaveFile(message);
                }
                else if (type == "print")
                {
                    HandlePrint();
                }
                else if (type == "copyText")
                {
                    HandleCopyText(message);
                }
                else
                {
                    Log.Warn("mensaje web desconocido: " + type);
                }
            }
            catch (Exception ex)
            {
                Log.Error("error procesando '" + type + "': " + ex);
                SendError("No se pudo completar la acción: " + ex.Message);
            }
        }

        private void HandleSaveFile(Dictionary<string, object> message)
        {
            string filename = GetString(message, "filename");
            string base64 = GetString(message, "base64");
            string mime = GetString(message, "mime");

            if (string.IsNullOrEmpty(base64))
            {
                SendError("No hay datos para guardar.");
                return;
            }

            byte[] data;
            try
            {
                data = Convert.FromBase64String(StripDataUrlPrefix(base64));
            }
            catch (Exception)
            {
                SendError("Los datos del fichero no son válidos (base64).");
                return;
            }

            string safeName = MakeSafeFileName(filename, mime);
            string directory = AppPaths.DownloadsDirectory;
            Directory.CreateDirectory(directory);
            string path = MakeUniquePath(directory, safeName);
            File.WriteAllBytes(path, data);
            Log.Info("fichero guardado: " + path + " (" + data.Length + " bytes)");
            SendSaved(path);
        }

        private void HandlePrint()
        {
            if (_web == null || _web.CoreWebView2 == null)
            {
                SendError("La vista web todavía no está lista.");
                return;
            }
            try
            {
                _web.CoreWebView2.ShowPrintUI(CoreWebView2PrintDialogKind.System);
                Log.Info("diálogo de impresión abierto");
            }
            catch (Exception ex)
            {
                Log.Error("print: " + ex.Message);
                SendError("No se pudo abrir la impresión: " + ex.Message);
            }
        }

        private void HandleCopyText(Dictionary<string, object> message)
        {
            string text = GetString(message, "text");
            Exception lastError = null;
            for (int attempt = 0; attempt < 6; attempt++)
            {
                try
                {
                    Clipboard.SetText(text);
                    Log.Info("texto copiado al portapapeles (" + text.Length + " caracteres)");
                    return;
                }
                catch (Exception ex)
                {
                    lastError = ex;
                    Thread.Sleep(70);
                }
            }
            Log.Error("copyText: " + (lastError == null ? "desconocido" : lastError.Message));
            SendError("No se pudo copiar al portapapeles.");
        }

        private void SendSaved(string path)
        {
            Dictionary<string, object> reply = new Dictionary<string, object>();
            reply["type"] = "saved";
            reply["path"] = path;
            PostToWeb(reply);
        }

        private void SendError(string message)
        {
            Dictionary<string, object> reply = new Dictionary<string, object>();
            reply["type"] = "error";
            reply["message"] = message;
            PostToWeb(reply);
        }

        private void SendShortcut(string action)
        {
            Dictionary<string, object> message = new Dictionary<string, object>();
            message["type"] = "shortcut";
            message["action"] = action;
            PostToWeb(message);
        }

        private void PostToWeb(Dictionary<string, object> message)
        {
            try
            {
                if (_web == null || _web.CoreWebView2 == null)
                {
                    return;
                }
                string json = _json.Serialize(message);
                _web.CoreWebView2.PostWebMessageAsJson(json);
            }
            catch (Exception ex)
            {
                Log.Error("PostWebMessageAsJson: " + ex.Message);
            }
        }

        // -----------------------------------------------------------------
        // Descargas de la web (<a download> / blob)
        // -----------------------------------------------------------------

        private void OnDownloadStarting(object sender, CoreWebView2DownloadStartingEventArgs e)
        {
            try
            {
                string suggested = Path.GetFileName(e.ResultFilePath);
                string safeName = MakeSafeFileName(suggested, null);
                string directory = AppPaths.DownloadsDirectory;
                Directory.CreateDirectory(directory);
                string path = MakeUniquePath(directory, safeName);

                e.ResultFilePath = path;
                e.Handled = true; // sin diálogo de descarga del navegador

                CoreWebView2DownloadOperation operation = e.DownloadOperation;
                if (operation != null)
                {
                    string finalPath = path;
                    operation.StateChanged += delegate
                    {
                        try
                        {
                            if (operation.State == CoreWebView2DownloadState.Completed)
                            {
                                Log.Info("descarga completada: " + finalPath);
                                SendSaved(finalPath);
                            }
                            else if (operation.State == CoreWebView2DownloadState.Interrupted)
                            {
                                Log.Error("descarga interrumpida: " + finalPath);
                                SendError("La descarga se interrumpió.");
                            }
                        }
                        catch (Exception ex)
                        {
                            Log.Error("estado de descarga: " + ex.Message);
                        }
                    };
                }
                Log.Info("descarga -> " + path);
            }
            catch (Exception ex)
            {
                Log.Error("DownloadStarting: " + ex.Message);
            }
        }

        // -----------------------------------------------------------------
        // Ventana: geometría, pantalla completa y atajos
        // -----------------------------------------------------------------

        private static Icon LoadApplicationIcon()
        {
            try
            {
                return Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch (Exception ex)
            {
                Log.Warn("no se pudo cargar el icono: " + ex.Message);
                return null;
            }
        }

        private void RestoreWindowState()
        {
            string file = AppPaths.WindowStateFile;
            if (!File.Exists(file))
            {
                return;
            }
            string raw = File.ReadAllText(file);
            if (string.IsNullOrEmpty(raw))
            {
                return;
            }
            Dictionary<string, object> state = _json.Deserialize<Dictionary<string, object>>(raw);
            if (state == null)
            {
                return;
            }
            int x = GetInt(state, "x");
            int y = GetInt(state, "y");
            int w = GetInt(state, "w");
            int h = GetInt(state, "h");
            bool maximized = GetBool(state, "maximized");

            bool applied = false;
            if (w >= MinimumSize.Width && h >= MinimumSize.Height)
            {
                Rectangle bounds = new Rectangle(x, y, w, h);
                if (IsOnAnyScreen(bounds))
                {
                    // Si la pantalla cambió (o el guardado venía de otro monitor), la
                    // ventana se recoloca dentro del área visible en vez de quedar fuera.
                    Screen host = Screen.FromRectangle(bounds);
                    Rectangle area = host.WorkingArea;
                    if (bounds.Width > area.Width) bounds.Width = area.Width;
                    if (bounds.Height > area.Height) bounds.Height = area.Height;
                    if (bounds.Right > area.Right) bounds.X = area.Right - bounds.Width;
                    if (bounds.Bottom > area.Bottom) bounds.Y = area.Bottom - bounds.Height;
                    if (bounds.X < area.Left) bounds.X = area.Left;
                    if (bounds.Y < area.Top) bounds.Y = area.Top;
                    StartPosition = FormStartPosition.Manual;
                    Bounds = bounds;
                    applied = true;
                }
            }
            if (maximized)
            {
                WindowState = FormWindowState.Maximized;
            }
            // Solo damos la geometría por aplicada si de verdad se ha colocado; si no,
            // el centrado inicial tiene que volver a calcular la posición.
            _hasSavedGeometry = applied;
            Log.Info("geometría restaurada: " + Bounds + " maximized=" + maximized);
        }

        private static bool IsOnAnyScreen(Rectangle bounds)
        {
            foreach (Screen screen in Screen.AllScreens)
            {
                Rectangle visible = screen.WorkingArea;
                Rectangle intersection = Rectangle.Intersect(visible, bounds);
                if (intersection.Width >= 120 && intersection.Height >= 120)
                {
                    return true;
                }
            }
            return false;
        }

        private void SaveWindowState()
        {
            try
            {
                Rectangle bounds;
                bool maximized;
                if (_fullscreen)
                {
                    bounds = _savedBounds;
                    maximized = _savedWindowState == FormWindowState.Maximized;
                }
                else if (WindowState == FormWindowState.Maximized)
                {
                    bounds = RestoreBounds;
                    maximized = true;
                }
                else
                {
                    bounds = Bounds;
                    maximized = false;
                }
                Dictionary<string, object> state = new Dictionary<string, object>();
                state["x"] = bounds.X;
                state["y"] = bounds.Y;
                state["w"] = bounds.Width;
                state["h"] = bounds.Height;
                state["maximized"] = maximized;
                Directory.CreateDirectory(AppPaths.LocalAppDirectory);
                File.WriteAllText(AppPaths.WindowStateFile, _json.Serialize(state));
                Log.Info("geometría guardada: " + bounds + " maximized=" + maximized);
            }
            catch (Exception ex)
            {
                Log.Error("no se pudo guardar la geometría: " + ex.Message);
            }
        }

        private void OnFormClosing(object sender, FormClosingEventArgs e)
        {
            _closing = true;
            SaveWindowState();
        }

        private void ToggleFullscreen()
        {
            if (!_fullscreen)
            {
                _savedBorderStyle = FormBorderStyle;
                _savedWindowState = WindowState;
                _savedBounds = WindowState == FormWindowState.Normal ? Bounds : RestoreBounds;
                FormBorderStyle = FormBorderStyle.None;
                WindowState = FormWindowState.Maximized;
                _fullscreen = true;
                Log.Info("pantalla completa activada");
            }
            else
            {
                FormBorderStyle = _savedBorderStyle;
                WindowState = _savedWindowState;
                Bounds = _savedBounds;
                _fullscreen = false;
                ApplyDarkTitleBar();
                Log.Info("pantalla completa desactivada");
            }
        }

        // Atajos que deben funcionar aunque el foco esté dentro del WebView2:
        // se interceptan con un filtro de mensajes de la ventana.
        internal bool HandleGlobalKey(int keyCode)
        {
            if (keyCode == 0x7A) // F11
            {
                ToggleFullscreen();
                return true;
            }
            if (keyCode == 0x1B && _fullscreen) // Esc
            {
                ToggleFullscreen();
                return true;
            }
            if (_dev && keyCode == 0x7B) // F12 (solo desarrollo)
            {
                if (_web != null && _web.CoreWebView2 != null)
                {
                    _web.CoreWebView2.OpenDevToolsWindow();
                }
                return true;
            }
            if (keyCode == 0x4E && (Control.ModifierKeys & Keys.Control) == Keys.Control) // Ctrl+N
            {
                SendShortcut("new-play");
                return true;
            }
            return false;
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                try
                {
                    Application.RemoveMessageFilter(_keyFilter);
                }
                catch (Exception)
                {
                }
                if (_web != null)
                {
                    try
                    {
                        _web.Dispose();
                    }
                    catch (Exception ex)
                    {
                        Log.Warn("al liberar WebView2: " + ex.Message);
                    }
                    _web = null;
                }
            }
            base.Dispose(disposing);
        }

        // -----------------------------------------------------------------
        // Utilidades
        // -----------------------------------------------------------------

        private static string GetString(Dictionary<string, object> message, string key)
        {
            if (message == null || !message.ContainsKey(key) || message[key] == null)
            {
                return "";
            }
            return Convert.ToString(message[key]);
        }

        private static int GetInt(Dictionary<string, object> message, string key)
        {
            if (message == null || !message.ContainsKey(key) || message[key] == null)
            {
                return 0;
            }
            try
            {
                return Convert.ToInt32(message[key]);
            }
            catch (Exception)
            {
                return 0;
            }
        }

        private static bool GetBool(Dictionary<string, object> message, string key)
        {
            if (message == null || !message.ContainsKey(key) || message[key] == null)
            {
                return false;
            }
            try
            {
                return Convert.ToBoolean(message[key]);
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static string StripDataUrlPrefix(string base64)
        {
            int comma = base64.IndexOf(',');
            if (comma > 0 && base64.Substring(0, comma).IndexOf("base64", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return base64.Substring(comma + 1);
            }
            return base64;
        }

        private static string ExtensionForMime(string mime)
        {
            string type = mime == null ? "" : mime.ToLowerInvariant();
            int semicolon = type.IndexOf(';');
            if (semicolon >= 0)
            {
                type = type.Substring(0, semicolon).Trim();
            }
            if (type == "application/pdf") return ".pdf";
            if (type == "image/png") return ".png";
            if (type == "image/jpeg") return ".jpg";
            if (type == "image/svg+xml") return ".svg";
            if (type == "application/json") return ".json";
            if (type == "text/plain") return ".txt";
            if (type == "application/zip") return ".zip";
            return null;
        }

        private static string MakeSafeFileName(string filename, string mime)
        {
            string name = filename == null ? "" : filename.Trim();
            int slash = Math.Max(name.LastIndexOf('/'), name.LastIndexOf('\\'));
            if (slash >= 0)
            {
                name = name.Substring(slash + 1);
            }
            StringBuilder builder = new StringBuilder();
            foreach (char c in name)
            {
                if (c < 32 || c == ':' || c == '*' || c == '?' || c == '"' || c == '<'
                    || c == '>' || c == '|' || c == '/' || c == '\\')
                {
                    builder.Append('_');
                }
                else
                {
                    builder.Append(c);
                }
            }
            string clean = builder.ToString().Trim();
            if (clean.Length == 0)
            {
                clean = "flagplays";
            }
            if (clean.Length > 120)
            {
                clean = clean.Substring(0, 120);
            }
            if (Path.GetExtension(clean).Length == 0)
            {
                string extension = ExtensionForMime(mime);
                if (extension != null)
                {
                    clean = clean + extension;
                }
            }
            return clean;
        }

        private static string MakeUniquePath(string directory, string fileName)
        {
            string path = Path.Combine(directory, fileName);
            if (!File.Exists(path))
            {
                return path;
            }
            string baseName = Path.GetFileNameWithoutExtension(fileName);
            string extension = Path.GetExtension(fileName);
            for (int i = 2; i < 10000; i++)
            {
                path = Path.Combine(directory, baseName + " (" + i + ")" + extension);
                if (!File.Exists(path))
                {
                    return path;
                }
            }
            return Path.Combine(directory, baseName + "-" + DateTime.Now.Ticks + extension);
        }

        // -----------------------------------------------------------------
        // Filtro de teclado (llega también cuando el foco está en WebView2)
        // -----------------------------------------------------------------

        private sealed class KeyMessageFilter : IMessageFilter
        {
            private const int WmKeyDown = 0x0100;
            private const int WmSysKeyDown = 0x0104;
            private readonly MainForm _form;

            public KeyMessageFilter(MainForm form)
            {
                _form = form;
            }

            public bool PreFilterMessage(ref Message m)
            {
                if (m.Msg != WmKeyDown && m.Msg != WmSysKeyDown)
                {
                    return false;
                }
                int keyCode = m.WParam.ToInt32();
                return _form.HandleGlobalKey(keyCode);
            }
        }
    }
}
