using System.Text.Json;
using Seven.AutoERP.Contracts;
using Seven.AutoERP.Fiscal;
using Seven.AutoERP.Fiscal.CTe;
using Seven.AutoERP.Fiscal.Danfe;
using Seven.AutoERP.Fiscal.MDFe;
using Seven.AutoERP.Fiscal.NFe;
using Seven.AutoERP.Fiscal.NFCe;
using Seven.AutoERP.Fiscal.NFSe;
using Seven.AutoERP.Reporting;

Console.InputEncoding = System.Text.Encoding.UTF8;
Console.OutputEncoding = System.Text.Encoding.UTF8;

var reporting = new ReportingEngine();
var nfe = new ZeusNfeGateway();
var nfce = new NfceGateway();
var danfe = new ZeusDanfeGenerator();
using var nfseHttp = new HttpClient { Timeout = TimeSpan.FromSeconds(90) };
var nfseFactory = new NfseProviderFactory([new PadraoNacionalProvider(nfseHttp), new AcbrProvider(), new MunicipalProvider()]);

string? line;
while ((line = await Console.In.ReadLineAsync()) is not null)
{
    SidecarRequest? request = null;
    try
    {
        request = JsonSerializer.Deserialize<SidecarRequest>(line, JsonDefaults.Options);
        if (request is null || string.IsNullOrWhiteSpace(request.Command)) throw new InvalidOperationException("Requisição do sidecar inválida.");
        var result = await ExecuteAsync(request);
        await WriteAsync(SidecarResponse.Success(request.Id, result));
    }
    catch (Exception ex)
    {
        await WriteAsync(SidecarResponse.Failure(request?.Id ?? "", "sidecar_error", SecretRedaction.Redact(ex.Message)));
    }
}

async Task<object?> ExecuteAsync(SidecarRequest request)
{
    switch (request.Command)
    {
        case "status":
            return new
            {
                ok = true,
                runtime = Environment.Version.ToString(),
                platform = Environment.OSVersion.Platform.ToString(),
                reporting = "Majorsilence.Reporting",
                nfe = nfe.Capabilities,
                nfce = nfce.Capabilities,
                cte = CTeModule.Capabilities,
                mdfe = MDFeModule.Capabilities,
                nfseProviders = new[] { "padrao_nacional", "acbr", "municipal" },
                danfe = "Zeus.Net.NFe.Danfe.Html",
            };

        case "report.render":
        {
            var payload = request.Payload.Deserialize<RenderDocumentRequest>(JsonDefaults.Options) ?? throw new InvalidOperationException("Payload de relatório inválido.");
            return await reporting.RenderPdfAsync(payload);
        }
        case "nfe.capabilities": return nfe.Capabilities;
        case "nfe.validate":
        {
            var payload = ParseNfePayload(request.Payload, false);
            return nfe.ValidateXml(payload.Xml, payload.Configuration);
        }
        case "nfe.sign_validate":
        {
            var payload = ParseNfePayload(request.Payload, true);
            return nfe.SignAndValidateXml(payload.Xml, payload.Configuration);
        }
        case "nfe.status":
        {
            var configuration = request.Payload.Deserialize<NfeRuntimeConfiguration>(JsonDefaults.Options) ?? throw new InvalidOperationException("Configuração NF-e inválida.");
            return nfe.StatusService(configuration);
        }
        case "nfe.authorize_sync":
        {
            var payload = ParseNfePayload(request.Payload, true);
            var batchId = request.Payload.TryGetProperty("batchId", out var batch) && batch.TryGetInt32(out var value) ? value : 1;
            return nfe.AuthorizeSync(payload.Xml, payload.Configuration, batchId);
        }
        case "nfce.capabilities": return nfce.Capabilities;
        case "nfce.validate":
        {
            var payload = ParseNfePayload(request.Payload, false);
            return nfce.ValidateXml(payload.Xml, payload.Configuration);
        }
        case "nfce.sign_validate":
        {
            var payload = ParseNfePayload(request.Payload, true);
            return nfce.SignAndValidateXml(payload.Xml, payload.Configuration);
        }
        case "nfce.status":
        {
            var configuration = request.Payload.Deserialize<NfeRuntimeConfiguration>(JsonDefaults.Options) ?? throw new InvalidOperationException("Configuração NFC-e inválida.");
            return nfce.StatusService(configuration);
        }
        case "nfce.authorize_sync":
        {
            var payload = ParseNfePayload(request.Payload, true);
            var batchId = request.Payload.TryGetProperty("batchId", out var batch) && batch.TryGetInt32(out var value) ? value : 1;
            return nfce.AuthorizeSync(payload.Xml, payload.Configuration, batchId);
        }
        case "danfe.generate_html":
        {
            var xml = request.Payload.GetProperty("nfeProcXml").GetString() ?? "";
            var logo = request.Payload.TryGetProperty("logoDataUrl", out var logoNode) ? logoNode.GetString() : null;
            return new { html = await danfe.GenerateHtmlAsync(xml, logo), engine = "Zeus.Net.NFe.Danfe.Html" };
        }
        case "nfse.issue": return await ExecuteNfseAsync(request.Payload, "issue");
        case "nfse.query": return await ExecuteNfseAsync(request.Payload, "query");
        case "nfse.cancel": return await ExecuteNfseAsync(request.Payload, "cancel");
        default: throw new InvalidOperationException($"Comando do sidecar não suportado: {request.Command}");
    }
}

async Task<object> ExecuteNfseAsync(JsonElement payload, string operation)
{
    var configuration = payload.GetProperty("configuration").Deserialize<NfseConfiguration>(JsonDefaults.Options) ?? throw new InvalidOperationException("Configuração NFS-e inválida.");
    var provider = nfseFactory.Resolve(configuration.Provider);
    return operation switch
    {
        "issue" => await provider.IssueAsync(configuration, payload.GetProperty("request").Deserialize<NfseRequest>(JsonDefaults.Options) ?? throw new InvalidOperationException("Dados NFS-e inválidos.")),
        "query" => await provider.QueryAsync(configuration, payload.GetProperty("key").GetString() ?? ""),
        "cancel" => await provider.CancelAsync(configuration, payload.GetProperty("key").GetString() ?? "", payload.GetProperty("justification").GetString() ?? ""),
        _ => throw new InvalidOperationException("Operação NFS-e inválida."),
    };
}

static (string Xml, NfeRuntimeConfiguration Configuration) ParseNfePayload(JsonElement payload, bool requireCertificate)
{
    var xml = payload.GetProperty("xml").GetString() ?? "";
    if (string.IsNullOrWhiteSpace(xml)) throw new InvalidOperationException("XML fiscal obrigatório.");
    var configuration = payload.GetProperty("configuration").Deserialize<NfeRuntimeConfiguration>(JsonDefaults.Options) ?? throw new InvalidOperationException("Configuração fiscal inválida.");
    if (requireCertificate && string.IsNullOrWhiteSpace(configuration.Certificate?.PfxBase64)) throw new InvalidOperationException("Certificado A1 obrigatório para esta operação.");
    return (xml, configuration);
}

static async Task WriteAsync(SidecarResponse response)
{
    var json = JsonSerializer.Serialize(response, JsonDefaults.Options);
    await Console.Out.WriteLineAsync(json);
    await Console.Out.FlushAsync();
}
