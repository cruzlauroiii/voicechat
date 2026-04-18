namespace Voicechat;

public partial class App : Application
{
    public App()
    {
        InitializeComponent();
        AppDomain.CurrentDomain.UnhandledException += (S, E) =>
            System.Diagnostics.Debug.WriteLine(K.LogUnhandled + E.ExceptionObject);
    }

    protected override Window CreateWindow(IActivationState? ActivationState)
    {
        return new Window(new MainPage()) { Title = K.AppTitle };
    }
}
