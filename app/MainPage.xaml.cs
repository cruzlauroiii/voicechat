namespace Voicechat;

public partial class MainPage : ContentPage
{
    public MainPage()
    {
        InitializeComponent();

#if ANDROID
        Loaded += (S, E) =>
        {
            var Handler = webView.Handler?.PlatformView as Android.Webkit.WebView;
            if (Handler == null) return;

            Handler.Settings.JavaScriptEnabled = true;
            Handler.SetWebViewClient(new SafeAreaWebViewClient(Handler));
            AndroidX.Core.View.ViewCompat.SetOnApplyWindowInsetsListener(Handler, new SafeAreaListener(Handler));
            Handler.RequestApplyInsets();
        };
#endif
    }
}

#if ANDROID
class SafeAreaWebViewClient : Android.Webkit.WebViewClient
{
    private readonly Android.Webkit.WebView WebView;

    public SafeAreaWebViewClient(Android.Webkit.WebView Wv) => WebView = Wv;

    public override void OnPageFinished(Android.Webkit.WebView? View, string? Url)
    {
        base.OnPageFinished(View, Url);
        InjectSafeArea();
    }

    private void InjectSafeArea()
    {
        var Activity = Microsoft.Maui.ApplicationModel.Platform.CurrentActivity;
        if (Activity?.Window == null) return;
        var RootView = Activity.Window.DecorView.RootView;
        if (RootView == null) return;
        var Insets = AndroidX.Core.View.ViewCompat.GetRootWindowInsets(RootView);
        if (Insets == null) return;
        var Bars = Insets.GetInsets(AndroidX.Core.View.WindowInsetsCompat.Type.SystemBars() | AndroidX.Core.View.WindowInsetsCompat.Type.DisplayCutout());
        var Density = WebView.Context!.Resources!.DisplayMetrics!.Density;
        var Top = Bars.Top / Density;
        var Bottom = Bars.Bottom / Density;
        var Js = string.Format(K.JsSafeAreaTemplate, Top, Bottom);
        WebView.EvaluateJavascript(Js, null);
    }
}

class SafeAreaListener : Java.Lang.Object, AndroidX.Core.View.IOnApplyWindowInsetsListener
{
    private readonly Android.Webkit.WebView WebView;

    public SafeAreaListener(Android.Webkit.WebView Wv) => WebView = Wv;

    public AndroidX.Core.View.WindowInsetsCompat OnApplyWindowInsets(Android.Views.View V, AndroidX.Core.View.WindowInsetsCompat Insets)
    {
        var Bars = Insets.GetInsets(AndroidX.Core.View.WindowInsetsCompat.Type.SystemBars() | AndroidX.Core.View.WindowInsetsCompat.Type.DisplayCutout());
        var Density = WebView.Context!.Resources!.DisplayMetrics!.Density;
        var Top = Bars.Top / Density;
        var Bottom = Bars.Bottom / Density;

        var Js = string.Format(K.JsSafeAreaTemplate, Top, Bottom);
        WebView.EvaluateJavascript(Js, null);

        return Insets;
    }
}
#endif
