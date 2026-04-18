#:sdk Microsoft.NET.Sdk.Web
#:property LangVersion=preview

using System.IO.Compression;
using System.Net.WebSockets;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;

var Http = new HttpClient { Timeout = TimeSpan.FromSeconds(C.HttpTimeoutSeconds) };
var Command = args.Length > 0 ? args[0] : "";

if (Command == C.CmdBuild) await Build();
else if (Command == C.CmdServe) await Serve(args);
else
{
    Console.WriteLine("Usage: dotnet run voicechat.cs [build|serve]");
    Console.WriteLine($"  {C.CmdBuild}   Generate fingerprinted static files");
    Console.WriteLine($"  {C.CmdServe}   Start local WSS server");
}

async Task Build()
{
    var SrcDir = Path.GetFullPath(C.SrcDir);
    var OutDir = Path.GetFullPath(C.OutDir);

    if (!Directory.Exists(SrcDir)) { Console.Error.WriteLine($"ERROR: {C.SrcDir}/ not found at {SrcDir}"); return; }

    if (Directory.Exists(OutDir))
    {
        foreach (var F in Directory.GetFiles(OutDir))
            if (!Path.GetFileName(F).StartsWith(".")) File.Delete(F);
    }
    else Directory.CreateDirectory(OutDir);

    var CssContent = await File.ReadAllTextAsync(Path.Combine(SrcDir, C.CssFile));
    var JsContent = await File.ReadAllTextAsync(Path.Combine(SrcDir, C.JsFile));
    var WorkerContent = await File.ReadAllTextAsync(Path.Combine(SrcDir, C.WorkerFile));
    var HtmlTemplate = await File.ReadAllTextAsync(Path.Combine(SrcDir, C.IndexFile));

    var MinCss = MinifyCss(CssContent);
    var MinJs = MinifyJs(JsContent);
    var MinWorker = WorkerContent;

    var CssHash = ContentHash(MinCss);
    var WorkerHash = ContentHash(MinWorker);
    var WorkerFile = $"tts-worker.{WorkerHash}.js";

    MinJs = MinJs.Replace(C.WorkerRefOld, $"'tts-worker.{WorkerHash}.js'");
    var JsHash = ContentHash(MinJs);

    var CssFile = $"app.{CssHash}.css";
    var JsFile = $"app.{JsHash}.js";

    await File.WriteAllTextAsync(Path.Combine(OutDir, CssFile), MinCss);
    await File.WriteAllTextAsync(Path.Combine(OutDir, JsFile), MinJs);
    await File.WriteAllTextAsync(Path.Combine(OutDir, WorkerFile), MinWorker);

    var Html = HtmlTemplate
        .Replace(C.CssRefAttr, CssFile)
        .Replace(C.JsRefAttr, $"\"{JsFile}\"");

    await File.WriteAllTextAsync(Path.Combine(OutDir, C.IndexFile), MinifyHtml(Html));

    foreach (var FilePath in Directory.GetFiles(OutDir))
    {
        var Bytes = await File.ReadAllBytesAsync(FilePath);
        var BrPath = FilePath + ".br";
        using (var Fs = File.Create(BrPath))
        using (var Br = new BrotliStream(Fs, CompressionLevel.Optimal))
        {
            Br.Write(Bytes, 0, Bytes.Length);
        }
        Console.WriteLine($"  {Path.GetFileName(FilePath)} ({Bytes.Length:N0} → {new FileInfo(BrPath).Length:N0} br)");
    }

    var Headers = new StringBuilder();
    Headers.AppendLine(C.HeadersComment);
    foreach (var F in new[] { CssFile, JsFile, WorkerFile })
    {
        Headers.AppendLine($"/{F}");
        Headers.AppendLine(C.CacheImmutable);
    }
    Headers.AppendLine($"/{C.IndexFile}");
    Headers.AppendLine(C.CacheNoCache);
    await File.WriteAllTextAsync(Path.Combine(OutDir, C.HeadersFile), Headers.ToString());

    Console.WriteLine($"\nBUILD COMPLETE → {OutDir}");
    Console.WriteLine($"  {CssFile}\n  {JsFile}\n  {WorkerFile}\n  {C.IndexFile}\n  {C.HeadersFile}");
}

async Task Serve(string[] Args)
{
    var Port = C.DefaultPort;
    for (int i = 1; i < Args.Length; i++)
    {
        if (Args[i] == C.PortArg && i + 1 < Args.Length) Port = int.Parse(Args[i + 1]);
    }

    var Builder = WebApplication.CreateBuilder();
    Builder.WebHost.UseUrls($"http://0.0.0.0:{Port}");
    var App = Builder.Build();
    App.UseWebSockets();

    App.MapGet(C.HealthPath, () => Results.Ok("ok"));

    App.Map(C.WssPath, async (HttpContext Context) =>
    {
        if (!Context.WebSockets.IsWebSocketRequest)
        {
            Context.Response.StatusCode = C.UpgradeRequired;
            await Context.Response.WriteAsync("WebSocket upgrade required");
            return;
        }

        var Ws = await Context.WebSockets.AcceptWebSocketAsync();
        Console.WriteLine($"{C.LogWss} Client connected from {Context.Connection.RemoteIpAddress}");

        var Buffer = new byte[C.WsBufferSize];
        try
        {
            while (Ws.State == WebSocketState.Open)
            {
                var Result = await Ws.ReceiveAsync(Buffer, CancellationToken.None);
                if (Result.MessageType == WebSocketMessageType.Close) break;

                var Message = Encoding.UTF8.GetString(Buffer, 0, Result.Count);
                Console.WriteLine($"{C.LogWss} ← {Message}");

                try
                {
                    var Parsed = JsonSerializer.Deserialize<JsonElement>(Message);
                    var Type = Parsed.GetProperty(C.PropType).GetString();

                    if (Type == C.MsgTypeChat)
                    {
                        var Content = Parsed.GetProperty(C.PropContent).GetString() ?? "";
                        var Reply = await CallClaudeCode(Content);
                        var Response = JsonSerializer.Serialize(new { type = C.MsgTypeChat, content = Reply });
                        Console.WriteLine($"{C.LogWss} → {Response}");
                        await Ws.SendAsync(Encoding.UTF8.GetBytes(Response), WebSocketMessageType.Text, true, CancellationToken.None);
                    }
                }
                catch (Exception Ex)
                {
                    var ErrResponse = JsonSerializer.Serialize(new { type = C.MsgTypeError, content = Ex.Message });
                    await Ws.SendAsync(Encoding.UTF8.GetBytes(ErrResponse), WebSocketMessageType.Text, true, CancellationToken.None);
                }
            }
        }
        catch (WebSocketException) { }
        finally
        {
            Console.WriteLine($"{C.LogWss} Client disconnected");
            if (Ws.State == WebSocketState.Open) await Ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "", CancellationToken.None);
        }
    });

    Console.WriteLine($"WSS listening on ws://0.0.0.0:{Port}{C.WssPath}");
    Console.WriteLine($"Expose via: cloudflared tunnel --url http://localhost:{Port}");
    await App.RunAsync();
}

async Task<string> CallClaudeCode(string UserMessage)
{
    try
    {
        var Body = JsonSerializer.Serialize(new
        {
            model = C.ClaudeModel,
            messages = new[] { new { role = C.RoleUser, content = UserMessage } },
            stream = false
        });

        var Req = new HttpRequestMessage(HttpMethod.Post, C.BridgeEndpoint);
        Req.Content = new StringContent(Body, Encoding.UTF8, "application/json");
        var Res = await Http.SendAsync(Req);
        var Json = await Res.Content.ReadAsStringAsync();
        var Doc = JsonSerializer.Deserialize<JsonElement>(Json);

        if (Doc.TryGetProperty(C.PropChoices, out var Choices) && Choices.GetArrayLength() > 0)
            return Choices[0].GetProperty(C.PropMessage).GetProperty(C.PropContent).GetString() ?? "";
        if (Doc.TryGetProperty(C.PropError, out var Error))
            return $"API error: {Error.GetProperty(C.PropMessage).GetString()}";
    }
    catch (Exception Ex)
    {
        Console.WriteLine($"{C.LogBridge} {C.BridgeEndpoint} failed: {Ex.Message}");
    }
    return "Could not reach API bridge.";
}

static string ContentHash(string Content)
{
    var Hash = SHA256.HashData(Encoding.UTF8.GetBytes(Content));
    return Convert.ToHexString(Hash)[..C.HashLength].ToLowerInvariant();
}

static string MinifyCss(string Css)
{
    Css = Regex.Replace(Css, C.RxCssComment, "");
    Css = Regex.Replace(Css, C.RxWhitespace, " ");
    Css = Regex.Replace(Css, C.RxCssPunctuation, "$1");
    Css = Regex.Replace(Css, C.RxCssTrailingSemicolon, "}");
    return Css.Trim();
}

static string MinifyJs(string Js)
{
    Js = Regex.Replace(Js, C.RxJsSingleComment, "");
    Js = Regex.Replace(Js, C.RxJsMultiComment, "");
    Js = Regex.Replace(Js, C.RxJsSpaces, " ");
    Js = Regex.Replace(Js, C.RxJsOperators, "$1");
    Js = Regex.Replace(Js, C.RxJsBlankLines, "\n");
    return Js.Trim();
}

static string MinifyHtml(string Html)
{
    Html = Regex.Replace(Html, C.RxHtmlTagGap, "><");
    Html = Regex.Replace(Html, C.RxHtmlMultiSpace, " ");
    return Html.Trim();
}

static class C
{
    public const string SrcDir = "src";
    public const string OutDir = "output";
    public const string CssFile = "app.css";
    public const string JsFile = "app.js";
    public const string WorkerFile = "tts-worker.js";
    public const string IndexFile = "index.html";
    public const string HeadersFile = "_headers";
    public const int HashLength = 10;
    public const string WorkerRefOld = "'tts-worker.js'";
    public const string CssRefAttr = "app.css";
    public const string JsRefAttr = "\"app.js\"";
    public const string CacheImmutable = "  Cache-Control: public, max-age=31536000, immutable";
    public const string CacheNoCache = "  Cache-Control: no-cache";
    public const string HeadersComment = "# Cloudflare Pages _headers file";
    public const int DefaultPort = 8443;
    public const string PortArg = "--port";
    public const string HealthPath = "/health";
    public const string WssPath = "/ws";
    public const int WsBufferSize = 8192;
    public const int HttpTimeoutSeconds = 120;
    public const int UpgradeRequired = 426;
    public const string BridgeEndpoint = "http://localhost:3456/v1/chat/completions";
    public const string ClaudeModel = "claude-code";
    public const string RoleUser = "user";
    public const string MsgTypeChat = "chat";
    public const string MsgTypeError = "error";
    public const string PropType = "type";
    public const string PropContent = "content";
    public const string PropChoices = "choices";
    public const string PropMessage = "message";
    public const string PropError = "error";
    public const string CmdBuild = "build";
    public const string CmdServe = "serve";
    public const string LogWss = "[WSS]";
    public const string LogBridge = "[Bridge]";
    public const string RxCssComment = @"/\*[\s\S]*?\*/";
    public const string RxWhitespace = @"\s+";
    public const string RxCssPunctuation = @"\s*([{}:;,>~+])\s*";
    public const string RxCssTrailingSemicolon = @";}";
    public const string RxJsSingleComment = @"(?<![:'""\\])//[^\n]*";
    public const string RxJsMultiComment = @"/\*[\s\S]*?\*/";
    public const string RxJsSpaces = @"[ \t]+";
    public const string RxJsOperators = @" *([{}();,]) *";
    public const string RxJsBlankLines = @"\n{2,}";
    public const string RxHtmlTagGap = @">\s+<";
    public const string RxHtmlMultiSpace = @"\s{2,}";
}
