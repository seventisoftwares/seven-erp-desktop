using System.Text.Json;
using System.Text.Json.Serialization;

namespace Seven.AutoERP.Contracts;

public sealed record DocumentTemplateDefinition
{
    public int SchemaVersion { get; init; } = 1;
    public string PagePreset { get; init; } = "A4";
    public string Orientation { get; init; } = "portrait";
    public decimal PageWidthMm { get; init; } = 210m;
    public decimal PageHeightMm { get; init; } = 297m;
    public decimal MarginTopMm { get; init; } = 8m;
    public decimal MarginRightMm { get; init; } = 8m;
    public decimal MarginBottomMm { get; init; } = 8m;
    public decimal MarginLeftMm { get; init; } = 8m;
    public decimal GridMm { get; init; } = 2m;
    public IReadOnlyList<DocumentTemplateElement> Elements { get; init; } = Array.Empty<DocumentTemplateElement>();
}

public sealed record DocumentTemplateElement
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Kind { get; init; } = "text";
    public decimal XMm { get; init; }
    public decimal YMm { get; init; }
    public decimal WidthMm { get; init; } = 30m;
    public decimal HeightMm { get; init; } = 8m;
    public string? Text { get; init; }
    public string? Field { get; init; }
    public string? Source { get; init; }
    public decimal FontSizePt { get; init; } = 9m;
    public string FontWeight { get; init; } = "normal";
    public string Align { get; init; } = "left";
    public string? Color { get; init; } = "#111111";
    public string? Background { get; init; } = "transparent";
    public decimal BorderWidthMm { get; init; }
    public string? BorderColor { get; init; } = "#111111";
    public decimal PaddingMm { get; init; } = 1.5m;
    public string Section { get; init; } = "body";
    public bool RepeatOnEveryPage { get; init; }
    public string? TableSource { get; init; }
    public IReadOnlyList<TableColumn> Columns { get; init; } = Array.Empty<TableColumn>();
    public decimal RowHeightMm { get; init; } = 7m;
    public int? MaxRows { get; init; }
    public string? BarcodeFormat { get; init; }
    public FieldCondition? Condition { get; init; }
}

public sealed record TableColumn
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Label { get; init; } = "Campo";
    public string Field { get; init; } = "";
    public decimal WidthMm { get; init; } = 30m;
    public string Align { get; init; } = "left";
    public string Format { get; init; } = "text";
}

public sealed record FieldCondition
{
    public string Field { get; init; } = "";
    public string Operator { get; init; } = "eq";
    public JsonElement? Value { get; init; }
}

public sealed record RenderDocumentRequest
{
    public string TemplateName { get; init; } = "Documento";
    public DocumentTemplateDefinition Definition { get; init; } = new();
    public JsonElement Data { get; init; }
    public string OutputPath { get; init; } = "";
}

public sealed record RenderDocumentResult(bool Success, string OutputPath, long Bytes, int Pages, string Engine, string? Error = null);

public sealed record SidecarRequest
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string Command { get; init; } = "status";
    public JsonElement Payload { get; init; }
}

public sealed record SidecarResponse
{
    public string Id { get; init; } = "";
    public bool Ok { get; init; }
    public object? Result { get; init; }
    public SidecarError? Error { get; init; }
    public static SidecarResponse Success(string id, object? result) => new() { Id = id, Ok = true, Result = result };
    public static SidecarResponse Failure(string id, string code, string message) => new() { Id = id, Ok = false, Error = new SidecarError(code, message) };
}

public sealed record SidecarError(string Code, string Message);

public static class JsonDefaults
{
    public static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingNull,
    };
}
