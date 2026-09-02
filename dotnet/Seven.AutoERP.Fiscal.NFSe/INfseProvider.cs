using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Seven.AutoERP.Fiscal;

namespace Seven.AutoERP.Fiscal.NFSe;

public sealed record NfseConfiguration
{
    public string Provider { get; init; } = "padrao_nacional";
    public FiscalEnvironment Environment { get; init; } = FiscalEnvironment.Homologation;
    public string BaseUrl { get; init; } = "";
    public string MunicipalityCode { get; init; } = "";
    public string TaxId { get; init; } = "";
    public string MunicipalRegistration { get; init; } = "";
    public string? BearerToken { get; init; }
    public string? AcbrLibPath { get; init; }
    public string? AcbrIniPath { get; init; }
    public Dictionary<string, string> Options { get; init; } = new(StringComparer.OrdinalIgnoreCase);
}

public sealed record NfseRequest
{
    public string ExternalId { get; init; } = Guid.NewGuid().ToString("N");
    public string ServiceCode { get; init; } = "";
    public string Cnae { get; init; } = "";
    public string Description { get; init; } = "";
    public decimal Amount { get; init; }
    public decimal IssRate { get; init; }
    public bool IssWithheld { get; init; }
    public string CustomerTaxId { get; init; } = "";
    public string CustomerName { get; init; } = "";
    public string CustomerEmail { get; init; } = "";
    public string CustomerCityCode { get; init; } = "";
    public string? RpsNumber { get; init; }
    public Dictionary<string, decimal> Withholdings { get; init; } = new();
    public JsonElement? AdditionalData { get; init; }
}

public interface INfseProvider
{
    string Name { get; }
    Task<FiscalOperationResult> IssueAsync(NfseConfiguration configuration, NfseRequest request, CancellationToken cancellationToken = default);
    Task<FiscalOperationResult> QueryAsync(NfseConfiguration configuration, string key, CancellationToken cancellationToken = default);
    Task<FiscalOperationResult> CancelAsync(NfseConfiguration configuration, string key, string justification, CancellationToken cancellationToken = default);
}

public sealed class NfseProviderFactory
{
    private readonly IReadOnlyDictionary<string, INfseProvider> _providers;
    public NfseProviderFactory(IEnumerable<INfseProvider> providers) => _providers = providers.ToDictionary(p => p.Name, StringComparer.OrdinalIgnoreCase);
    public INfseProvider Resolve(string name) => _providers.TryGetValue(name, out var provider) ? provider : throw new InvalidOperationException($"Provider NFS-e não instalado: {name}");
}

public sealed class PadraoNacionalProvider(HttpClient httpClient) : INfseProvider
{
    public string Name => "padrao_nacional";

    public Task<FiscalOperationResult> IssueAsync(NfseConfiguration configuration, NfseRequest request, CancellationToken cancellationToken = default)
        => SendAsync(configuration, HttpMethod.Post, "/nfse", request, cancellationToken);

    public Task<FiscalOperationResult> QueryAsync(NfseConfiguration configuration, string key, CancellationToken cancellationToken = default)
        => SendAsync(configuration, HttpMethod.Get, $"/nfse/{Uri.EscapeDataString(key)}", null, cancellationToken);

    public Task<FiscalOperationResult> CancelAsync(NfseConfiguration configuration, string key, string justification, CancellationToken cancellationToken = default)
        => SendAsync(configuration, HttpMethod.Post, $"/nfse/{Uri.EscapeDataString(key)}/cancelamento", new { justificativa = justification }, cancellationToken);

    private async Task<FiscalOperationResult> SendAsync(NfseConfiguration configuration, HttpMethod method, string relativePath, object? payload, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(configuration.BaseUrl, UriKind.Absolute, out var baseUri))
            return new FiscalOperationResult { Success = false, Status = "configuration_error", Message = "Configure a URL oficial do ambiente NFS-e Padrão Nacional antes de transmitir." };
        using var request = new HttpRequestMessage(method, new Uri(baseUri, relativePath));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        if (!string.IsNullOrWhiteSpace(configuration.BearerToken)) request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", configuration.BearerToken);
        if (payload is not null) request.Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json");
        using var response = await httpClient.SendAsync(request, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);
        JsonElement? raw = null; try { raw = JsonSerializer.Deserialize<JsonElement>(body); } catch { }
        return new FiscalOperationResult { Success = response.IsSuccessStatusCode, Status = response.IsSuccessStatusCode ? "accepted" : "rejected", Code = ((int)response.StatusCode).ToString(), Message = response.ReasonPhrase, Raw = raw };
    }
}

public sealed class MunicipalProvider : INfseProvider
{
    public string Name => "municipal";
    public Task<FiscalOperationResult> IssueAsync(NfseConfiguration configuration, NfseRequest request, CancellationToken cancellationToken = default) => Task.FromResult(NotConfigured(configuration));
    public Task<FiscalOperationResult> QueryAsync(NfseConfiguration configuration, string key, CancellationToken cancellationToken = default) => Task.FromResult(NotConfigured(configuration));
    public Task<FiscalOperationResult> CancelAsync(NfseConfiguration configuration, string key, string justification, CancellationToken cancellationToken = default) => Task.FromResult(NotConfigured(configuration));
    private static FiscalOperationResult NotConfigured(NfseConfiguration configuration) => new() { Success = false, Status = "provider_required", Message = $"Nenhum provider municipal foi configurado para o município {configuration.MunicipalityCode}. Regras municipais ficam dentro do provider, não na interface do ERP." };
}

public sealed class AcbrProvider : INfseProvider
{
    public string Name => "acbr";
    public Task<FiscalOperationResult> IssueAsync(NfseConfiguration configuration, NfseRequest request, CancellationToken cancellationToken = default) => ExecuteGuard(configuration);
    public Task<FiscalOperationResult> QueryAsync(NfseConfiguration configuration, string key, CancellationToken cancellationToken = default) => ExecuteGuard(configuration);
    public Task<FiscalOperationResult> CancelAsync(NfseConfiguration configuration, string key, string justification, CancellationToken cancellationToken = default) => ExecuteGuard(configuration);

    private static Task<FiscalOperationResult> ExecuteGuard(NfseConfiguration configuration)
    {
        if (string.IsNullOrWhiteSpace(configuration.AcbrLibPath) || !File.Exists(configuration.AcbrLibPath))
            return Task.FromResult(new FiscalOperationResult { Success = false, Status = "acbrlib_not_configured", Message = "ACBrLib não encontrada. Compile-a dos fontes open source e configure o caminho da biblioteca." });
        return Task.FromResult(new FiscalOperationResult { Success = false, Status = "acbrlib_adapter_pending_runtime_binding", Message = "ACBrLib localizada, porém o binding nativo deve ser validado para a versão compilada antes da primeira transmissão. O ERP falha fechado e não simula emissão." });
    }
}
