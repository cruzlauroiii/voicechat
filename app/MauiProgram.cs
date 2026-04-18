namespace Voicechat;

public static class MauiProgram
{
    public static MauiApp CreateMauiApp()
    {
        var Builder = MauiApp.CreateBuilder();
        Builder.UseMauiApp<App>().ConfigureFonts(Fonts =>
        {
            Fonts.AddFont(K.FontFile, K.FontAlias);
        });
        return Builder.Build();
    }
}
