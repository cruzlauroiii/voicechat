using System.Collections.Immutable;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using Microsoft.CodeAnalysis.Diagnostics;

namespace Voicechat.Analyzers;

[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class MagicNumberAnalyzer : DiagnosticAnalyzer
{
    public const string DiagnosticId = "VC001";
    private static readonly DiagnosticDescriptor Rule = new(
        DiagnosticId,
        "Avoid magic numbers",
        "Magic number '{0}' must be a named constant in domain constants",
        "Maintainability",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    public override void Initialize(AnalysisContext Context)
    {
        Context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        Context.EnableConcurrentExecution();
        Context.RegisterSyntaxNodeAction(Analyze, SyntaxKind.NumericLiteralExpression);
    }

    private static void Analyze(SyntaxNodeAnalysisContext Ctx)
    {
        var Literal = (LiteralExpressionSyntax)Ctx.Node;
        if (Literal.FirstAncestorOrSelf<FieldDeclarationSyntax>()?.Modifiers.Any(SyntaxKind.ConstKeyword) == true) return;
        if (Literal.FirstAncestorOrSelf<EnumMemberDeclarationSyntax>() != null) return;
        if (Literal.FirstAncestorOrSelf<AttributeSyntax>() != null) return;
        if (Literal.Token.Value is int V && (V == 0 || V == 1 || V == -1)) return;
        Ctx.ReportDiagnostic(Diagnostic.Create(Rule, Literal.GetLocation(), Literal.Token.ValueText));
    }
}

[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class MagicStringAnalyzer : DiagnosticAnalyzer
{
    public const string DiagnosticId = "VC002";
    private static readonly DiagnosticDescriptor Rule = new(
        DiagnosticId,
        "Avoid magic strings",
        "Magic string \"{0}\" must be a named constant in domain constants",
        "Maintainability",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    public override void Initialize(AnalysisContext Context)
    {
        Context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        Context.EnableConcurrentExecution();
        Context.RegisterSyntaxNodeAction(Analyze, SyntaxKind.StringLiteralExpression);
    }

    private static void Analyze(SyntaxNodeAnalysisContext Ctx)
    {
        var Literal = (LiteralExpressionSyntax)Ctx.Node;
        var Value = Literal.Token.ValueText;
        if (string.IsNullOrWhiteSpace(Value) || Value.Length < 2) return;
        if (Literal.FirstAncestorOrSelf<FieldDeclarationSyntax>()?.Modifiers.Any(SyntaxKind.ConstKeyword) == true) return;
        if (Literal.FirstAncestorOrSelf<AttributeSyntax>() != null) return;
        Ctx.ReportDiagnostic(Diagnostic.Create(Rule, Literal.GetLocation(), Value.Length > 30 ? Value.Substring(0, 30) + "..." : Value));
    }
}

[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class InterpolatedStringAnalyzer : DiagnosticAnalyzer
{
    public const string DiagnosticId = "VC003";
    private static readonly DiagnosticDescriptor Rule = new(
        DiagnosticId,
        "String interpolation must use domain constants",
        "Interpolated string contains hardcoded text '{0}' — use domain constants",
        "Maintainability",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    public override void Initialize(AnalysisContext Context)
    {
        Context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        Context.EnableConcurrentExecution();
        Context.RegisterSyntaxNodeAction(Analyze, SyntaxKind.InterpolatedStringExpression);
    }

    private static void Analyze(SyntaxNodeAnalysisContext Ctx)
    {
        var Interpolated = (InterpolatedStringExpressionSyntax)Ctx.Node;
        if (Interpolated.FirstAncestorOrSelf<FieldDeclarationSyntax>()?.Modifiers.Any(SyntaxKind.ConstKeyword) == true) return;
        foreach (var Content in Interpolated.Contents)
        {
            if (Content is InterpolatedStringTextSyntax Text && Text.TextToken.ValueText.Trim().Length >= 4)
            {
                Ctx.ReportDiagnostic(Diagnostic.Create(Rule, Text.GetLocation(), Text.TextToken.ValueText.Trim()));
                return;
            }
        }
    }
}

[DiagnosticAnalyzer(LanguageNames.CSharp)]
public sealed class PascalCaseAnalyzer : DiagnosticAnalyzer
{
    public const string DiagnosticId = "VC004";
    private static readonly DiagnosticDescriptor Rule = new(
        DiagnosticId,
        "Use PascalCase for all identifiers",
        "Identifier '{0}' must use PascalCase",
        "Naming",
        DiagnosticSeverity.Error,
        isEnabledByDefault: true);

    private static readonly Regex PascalPattern = new(@"^[A-Z_][A-Za-z0-9_]*$");

    public override ImmutableArray<DiagnosticDescriptor> SupportedDiagnostics => ImmutableArray.Create(Rule);

    public override void Initialize(AnalysisContext Context)
    {
        Context.ConfigureGeneratedCodeAnalysis(GeneratedCodeAnalysisFlags.None);
        Context.EnableConcurrentExecution();
        Context.RegisterSyntaxNodeAction(AnalyzeVariable, SyntaxKind.VariableDeclarator);
        Context.RegisterSyntaxNodeAction(AnalyzeParameter, SyntaxKind.Parameter);
        Context.RegisterSyntaxNodeAction(AnalyzeMethod, SyntaxKind.MethodDeclaration);
        Context.RegisterSyntaxNodeAction(AnalyzeMethod, SyntaxKind.LocalFunctionStatement);
        Context.RegisterSyntaxNodeAction(AnalyzeProperty, SyntaxKind.PropertyDeclaration);
    }

    private static void Check(SyntaxNodeAnalysisContext Ctx, SyntaxToken Token)
    {
        var Name = Token.ValueText;
        if (string.IsNullOrEmpty(Name) || Name.StartsWith("_") || Name.Length < 2) return;
        if (!PascalPattern.IsMatch(Name))
            Ctx.ReportDiagnostic(Diagnostic.Create(Rule, Token.GetLocation(), Name));
    }

    private static void AnalyzeVariable(SyntaxNodeAnalysisContext Ctx) =>
        Check(Ctx, ((VariableDeclaratorSyntax)Ctx.Node).Identifier);

    private static void AnalyzeParameter(SyntaxNodeAnalysisContext Ctx) =>
        Check(Ctx, ((ParameterSyntax)Ctx.Node).Identifier);

    private static void AnalyzeMethod(SyntaxNodeAnalysisContext Ctx)
    {
        if (Ctx.Node is MethodDeclarationSyntax M) Check(Ctx, M.Identifier);
        if (Ctx.Node is LocalFunctionStatementSyntax L) Check(Ctx, L.Identifier);
    }

    private static void AnalyzeProperty(SyntaxNodeAnalysisContext Ctx) =>
        Check(Ctx, ((PropertyDeclarationSyntax)Ctx.Node).Identifier);
}
