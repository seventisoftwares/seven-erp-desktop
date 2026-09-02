using System.Globalization;
using System.Text.Json;
using Majorsilence.Reporting.Rdl;
using Majorsilence.Reporting.RdlCreator;
using QRCoder;
using Seven.AutoERP.Contracts;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;
using ZXing;
using ZXing.Common;

namespace Seven.AutoERP.Reporting;

public sealed class ReportingEngine
{
    private static int _initialized;

    public ReportingEngine()
    {
        if (Interlocked.Exchange(ref _initialized, 1) == 0) RdlEngineConfig.RdlEngineConfigInit();
    }

    public async Task<RenderDocumentResult> RenderPdfAsync(RenderDocumentRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Definition.SchemaVersion != 1) throw new InvalidOperationException("Versão do modelo não suportada.");
        if (string.IsNullOrWhiteSpace(request.OutputPath)) throw new ArgumentException("Caminho de saída obrigatório.");

        var output = Path.GetFullPath(request.OutputPath);
        Directory.CreateDirectory(Path.GetDirectoryName(output)!);
        var tempDir = Path.Combine(Path.GetTempPath(), "seven-erp-reporting", Guid.NewGuid().ToString("N"));
        Directory.CreateDirectory(tempDir);

        try
        {
            var pages = BuildPages(request.Definition, request.Data);
            var document = new Document
            {
                Name = request.TemplateName,
                Description = $"Seven ERP · {request.TemplateName}",
                Author = "Seven ERP",
                PageHeight = Mm(request.Definition.PageHeightMm),
                PageWidth = Mm(request.Definition.PageWidthMm),
                TopMargin = Mm(request.Definition.MarginTopMm),
                RightMargin = Mm(request.Definition.MarginRightMm),
                BottomMargin = Mm(request.Definition.MarginBottomMm),
                LeftMargin = Mm(request.Definition.MarginLeftMm),
            };

            for (var pageIndex = 0; pageIndex < pages.Count; pageIndex++)
            {
                cancellationToken.ThrowIfCancellationRequested();
                var pageNumber = pageIndex + 1;
                var pageData = pages[pageIndex];
                document.WithPage(page =>
                {
                    page.WithHeight(Mm(request.Definition.PageHeightMm - request.Definition.MarginTopMm - request.Definition.MarginBottomMm))
                        .WithWidth(Mm(request.Definition.PageWidthMm - request.Definition.MarginLeftMm - request.Definition.MarginRightMm));

                    foreach (var element in request.Definition.Elements.Where(e => IsVisible(request.Data, e.Condition)))
                    {
                        if (element.Kind == "table")
                        {
                            RenderTable(page, element, pageData.Rows, pageData.RowOffset);
                            continue;
                        }
                        RenderElement(page, element, request.Data, pageNumber, pages.Count, tempDir);
                    }
                });
            }

            await using var stream = new FileStream(output, FileMode.Create, FileAccess.Write, FileShare.None);
            await document.Create(stream);
            await stream.FlushAsync(cancellationToken);
            var info = new FileInfo(output);
            return new RenderDocumentResult(true, output, info.Length, pages.Count, "Majorsilence.Reporting.RdlCreator.SkiaSharp");
        }
        finally
        {
            try { Directory.Delete(tempDir, true); } catch { }
        }
    }

    private sealed record PageSlice(IReadOnlyList<JsonElement> Rows, int RowOffset);

    private static List<PageSlice> BuildPages(DocumentTemplateDefinition definition, JsonElement data)
    {
        var table = definition.Elements.FirstOrDefault(e => e.Kind == "table" && string.Equals(e.TableSource, "Itens", StringComparison.OrdinalIgnoreCase));
        if (table is null || !TryGetPath(data, "Itens", out var itemsNode) || itemsNode.ValueKind != JsonValueKind.Array)
            return [new PageSlice(Array.Empty<JsonElement>(), 0)];

        var rows = itemsNode.EnumerateArray().ToList();
        var capacity = Math.Max(1, table.MaxRows ?? EstimateRows(definition, table));
        if (rows.Count == 0) return [new PageSlice(Array.Empty<JsonElement>(), 0)];
        var pages = new List<PageSlice>();
        for (var i = 0; i < rows.Count; i += capacity) pages.Add(new PageSlice(rows.Skip(i).Take(capacity).ToList(), i));
        return pages;
    }

    private static int EstimateRows(DocumentTemplateDefinition definition, DocumentTemplateElement table)
    {
        var usableBottom = definition.PageHeightMm - definition.MarginBottomMm - 12m;
        var rowHeight = Math.Max(4m, table.RowHeightMm);
        return Math.Max(1, (int)Math.Floor((usableBottom - table.YMm - rowHeight) / rowHeight));
    }

    private static void RenderTable(Page page, DocumentTemplateElement element, IReadOnlyList<JsonElement> rows, int offset)
    {
        var rowHeight = Math.Max(4m, element.RowHeightMm);
        var y = element.YMm;
        decimal x = element.XMm;
        foreach (var column in element.Columns)
        {
            page.WithText(MakeText($"tbl_head_{element.Id}_{column.Id}", column.Label, x, y, column.WidthMm, rowHeight, 7m, "Bold", column.Align, "#f0f0f0", 0.2m, "#444444"));
            x += column.WidthMm;
        }
        y += rowHeight;
        for (var rowIndex = 0; rowIndex < rows.Count; rowIndex++)
        {
            x = element.XMm;
            foreach (var column in element.Columns)
            {
                var fieldName = column.Field.StartsWith("Item.", StringComparison.OrdinalIgnoreCase) ? column.Field[5..] : column.Field;
                var value = TryGetPath(rows[rowIndex], fieldName, out var node) ? FormatNode(node, column.Format) : "";
                page.WithText(MakeText($"tbl_{element.Id}_{offset + rowIndex}_{column.Id}", value, x, y, column.WidthMm, rowHeight, 7m, "Normal", column.Align, null, 0.15m, "#777777"));
                x += column.WidthMm;
            }
            y += rowHeight;
        }
    }

    private static void RenderElement(Page page, DocumentTemplateElement element, JsonElement data, int pageNumber, int totalPages, string tempDir)
    {
        var kind = element.Kind.ToLowerInvariant();
        var value = element.Text ?? "";
        if (!string.IsNullOrWhiteSpace(element.Field) && TryGetPath(data, element.Field!, out var fieldNode)) value = FormatNode(fieldNode, GuessFormat(element.Field!));
        if (kind == "page_number") value = value.Replace("{page}", pageNumber.ToString(CultureInfo.InvariantCulture)).Replace("{pages}", totalPages.ToString(CultureInfo.InvariantCulture));

        if (kind is "text" or "field" or "signature" or "page_number" or "rectangle" or "line")
        {
            if (kind == "signature" && string.IsNullOrWhiteSpace(value)) value = "\n\n________________________________\nAssinatura";
            var border = kind is "rectangle" or "signature" ? Math.Max(0.15m, element.BorderWidthMm) : element.BorderWidthMm;
            if (kind == "line") { value = ""; border = Math.Max(0.2m, element.BorderWidthMm); }
            page.WithText(MakeText($"el_{Sanitize(element.Id)}_{pageNumber}", value, element.XMm, element.YMm, element.WidthMm, Math.Max(0.5m, element.HeightMm), element.FontSizePt, element.FontWeight, element.Align, NormalizeColor(element.Background), border, NormalizeColor(element.BorderColor)));
            return;
        }

        if (kind is "image" or "qrcode" or "barcode")
        {
            var imagePath = kind switch
            {
                "qrcode" => CreateQr(tempDir, value, element.Id, pageNumber),
                "barcode" => CreateBarcode(tempDir, value, element.Id, pageNumber, element.BarcodeFormat),
                _ => MaterializeImage(tempDir, element.Source ?? value, element.Id, pageNumber),
            };
            if (string.IsNullOrWhiteSpace(imagePath)) return;
            page.WithImage(new ReportItemImage
            {
                Name = $"img_{Sanitize(element.Id)}_{pageNumber}",
                Top = Mm(element.YMm), Left = Mm(element.XMm), Width = Mm(element.WidthMm), Height = Mm(element.HeightMm),
                Value = imagePath, Source = "External", Sizing = "Fit",
            });
        }
    }

    private static Text MakeText(string name, string value, decimal x, decimal y, decimal width, decimal height, decimal fontSize, string? weight, string? align, string? background, decimal borderWidth, string? borderColor)
    {
        var style = new Style
        {
            FontSize = Pt(Math.Max(5m, fontSize)),
            FontWeight = string.Equals(weight, "700", StringComparison.OrdinalIgnoreCase) || string.Equals(weight, "600", StringComparison.OrdinalIgnoreCase) ? "Bold" : "Normal",
            TextAlign = align switch { "center" => "Center", "right" => "Right", _ => "Left" },
            BackgroundColor = string.IsNullOrWhiteSpace(background) || background == "transparent" ? null : background,
        };
        if (borderWidth > 0)
        {
            var color = string.IsNullOrWhiteSpace(borderColor) ? "#333333" : borderColor;
            style.BorderStyle = new BorderStyle { Default = BorderStyleType.Solid };
            style.BorderColor = new BorderColor { Top = color, Bottom = color, Left = color, Right = color };
            var widthValue = Mm(borderWidth);
            style.BorderWidth = new BorderWidth { Top = widthValue, Bottom = widthValue, Left = widthValue, Right = widthValue };
        }
        return new Text { Name = name, Top = Mm(y), Left = Mm(x), Width = Mm(width), Height = Mm(height), Value = new Value { Text = value }, Style = style };
    }

    private static bool IsVisible(JsonElement data, FieldCondition? condition)
    {
        if (condition is null || string.IsNullOrWhiteSpace(condition.Field)) return true;
        var found = TryGetPath(data, condition.Field, out var actual);
        var actualText = found ? NodeText(actual) : "";
        var expected = condition.Value.HasValue ? NodeText(condition.Value.Value) : "";
        return condition.Operator switch
        {
            "eq" => string.Equals(actualText, expected, StringComparison.OrdinalIgnoreCase),
            "neq" => !string.Equals(actualText, expected, StringComparison.OrdinalIgnoreCase),
            "contains" => actualText.Contains(expected, StringComparison.OrdinalIgnoreCase),
            "not_empty" => !string.IsNullOrWhiteSpace(actualText),
            "empty" => string.IsNullOrWhiteSpace(actualText),
            "gt" => Decimal(actualText) > Decimal(expected),
            "gte" => Decimal(actualText) >= Decimal(expected),
            "lt" => Decimal(actualText) < Decimal(expected),
            "lte" => Decimal(actualText) <= Decimal(expected),
            _ => true,
        };
    }

    private static bool TryGetPath(JsonElement root, string path, out JsonElement result)
    {
        result = root;
        foreach (var part in path.Split('.', StringSplitOptions.RemoveEmptyEntries))
        {
            if (result.ValueKind != JsonValueKind.Object || !TryProperty(result, part, out result)) return false;
        }
        return true;
    }

    private static bool TryProperty(JsonElement value, string name, out JsonElement result)
    {
        if (value.TryGetProperty(name, out result)) return true;
        foreach (var property in value.EnumerateObject()) if (string.Equals(property.Name, name, StringComparison.OrdinalIgnoreCase)) { result = property.Value; return true; }
        result = default; return false;
    }

    private static string FormatNode(JsonElement node, string? format)
    {
        if (format == "money" && TryNumber(node, out var money)) return money.ToString("C2", CultureInfo.GetCultureInfo("pt-BR"));
        if (format == "number" && TryNumber(node, out var number)) return number.ToString("N3", CultureInfo.GetCultureInfo("pt-BR")).TrimEnd('0').TrimEnd(',');
        if (format == "date" && DateTimeOffset.TryParse(NodeText(node), out var date)) return date.ToString("dd/MM/yyyy");
        return NodeText(node);
    }

    private static string GuessFormat(string field) => field.StartsWith("Totais.", StringComparison.OrdinalIgnoreCase) || field.Contains("Valor", StringComparison.OrdinalIgnoreCase) || field.Contains("Desconto", StringComparison.OrdinalIgnoreCase) || field.Contains("Frete", StringComparison.OrdinalIgnoreCase) ? "money" : field.Contains("Data", StringComparison.OrdinalIgnoreCase) || field.Contains("Validade", StringComparison.OrdinalIgnoreCase) || field.Contains("Previsao", StringComparison.OrdinalIgnoreCase) ? "date" : field.EndsWith(".Km", StringComparison.OrdinalIgnoreCase) || field.Contains("KmEntrada", StringComparison.OrdinalIgnoreCase) || field.Contains("KmSaida", StringComparison.OrdinalIgnoreCase) ? "number" : "text";
    private static string NodeText(JsonElement node) => node.ValueKind switch { JsonValueKind.String => node.GetString() ?? "", JsonValueKind.Number => node.GetRawText(), JsonValueKind.True => "Sim", JsonValueKind.False => "Não", JsonValueKind.Null or JsonValueKind.Undefined => "", _ => node.GetRawText() };
    private static bool TryNumber(JsonElement node, out decimal value) { if (node.ValueKind == JsonValueKind.Number && node.TryGetDecimal(out value)) return true; return decimal.TryParse(NodeText(node), NumberStyles.Any, CultureInfo.InvariantCulture, out value) || decimal.TryParse(NodeText(node), NumberStyles.Any, CultureInfo.GetCultureInfo("pt-BR"), out value); }
    private static decimal Decimal(string value) => decimal.TryParse(value, NumberStyles.Any, CultureInfo.InvariantCulture, out var number) || decimal.TryParse(value, NumberStyles.Any, CultureInfo.GetCultureInfo("pt-BR"), out number) ? number : 0m;

    private static string CreateQr(string tempDir, string value, string id, int page)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        using var generator = new QRCodeGenerator();
        using var qrData = generator.CreateQrCode(value, QRCodeGenerator.ECCLevel.M);
        var qr = new PngByteQRCode(qrData);
        var bytes = qr.GetGraphic(8);
        var file = Path.Combine(tempDir, $"qr-{Sanitize(id)}-{page}.png");
        File.WriteAllBytes(file, bytes); return file;
    }

    private static string CreateBarcode(string tempDir, string value, string id, int page, string? requestedFormat)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        var format = requestedFormat?.ToUpperInvariant() switch { "EAN13" => BarcodeFormat.EAN_13, "CODE39" => BarcodeFormat.CODE_39, _ => BarcodeFormat.CODE_128 };
        var writer = new BarcodeWriterPixelData { Format = format, Options = new EncodingOptions { Width = 900, Height = 190, Margin = 4, PureBarcode = true } };
        var pixels = writer.Write(value);
        using var image = Image.LoadPixelData<Bgra32>(pixels.Pixels, pixels.Width, pixels.Height);
        var file = Path.Combine(tempDir, $"barcode-{Sanitize(id)}-{page}.png");
        image.SaveAsPng(file); return file;
    }

    private static string MaterializeImage(string tempDir, string source, string id, int page)
    {
        if (string.IsNullOrWhiteSpace(source)) return "";
        if (File.Exists(source)) return Path.GetFullPath(source);
        if (!source.StartsWith("data:image/", StringComparison.OrdinalIgnoreCase)) return "";
        var comma = source.IndexOf(','); if (comma < 0) return "";
        var header = source[..comma]; var payload = source[(comma + 1)..];
        var bytes = header.Contains(";base64", StringComparison.OrdinalIgnoreCase) ? Convert.FromBase64String(payload) : System.Text.Encoding.UTF8.GetBytes(Uri.UnescapeDataString(payload));
        var extension = header.Contains("jpeg", StringComparison.OrdinalIgnoreCase) ? ".jpg" : ".png";
        var file = Path.Combine(tempDir, $"image-{Sanitize(id)}-{page}{extension}");
        File.WriteAllBytes(file, bytes); return file;
    }

    private static string NormalizeColor(string? value) => string.IsNullOrWhiteSpace(value) || value == "transparent" ? "transparent" : value;
    private static string Sanitize(string value) => new(value.Where(char.IsLetterOrDigit).Take(48).ToArray());
    private static string Mm(decimal value) => $"{value.ToString("0.###", CultureInfo.InvariantCulture)}mm";
    private static string Pt(decimal value) => $"{value.ToString("0.###", CultureInfo.InvariantCulture)}pt";
}
