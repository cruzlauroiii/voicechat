using Android.App;
using Android.Content.PM;
using Android.OS;
using Android.Views;
using AndroidX.Core.View;

namespace Voicechat;

[Activity(Theme = "@style/Maui.SplashTheme", MainLauncher = true, ConfigurationChanges = ConfigChanges.ScreenSize | ConfigChanges.Orientation | ConfigChanges.UiMode | ConfigChanges.ScreenLayout | ConfigChanges.SmallestScreenSize | ConfigChanges.Density)]
public class MainActivity : MauiAppCompatActivity
{
    protected override void OnCreate(Bundle? SavedInstanceState)
    {
        base.OnCreate(SavedInstanceState);
        WindowCompat.SetDecorFitsSystemWindows(Window!, false);
        Window!.SetStatusBarColor(Android.Graphics.Color.Transparent);
    }
}
