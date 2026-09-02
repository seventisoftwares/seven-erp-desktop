using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace Seven.AutoERP.Fiscal;

public enum FiscalEnvironment { Homologation = 2, Production = 1 }
public enum FiscalDocumentStatus { Draft, Validating, Rejected, Authorized, Cancelled, Denied, Contingency, Error }

public sealed record FiscalCertificateInput
{
    public string PfxBase64 { get; init; } = "";
    public string Passphrase { get; init; } = "";
    public string? VaultReference { get; init; }
}

public sealed record FiscalCompanyConfiguration
{
    public string TaxId { get; init; } = "";
    public string StateRegistration { get; init; } = "";
    public string State { get; init; } = "RS";
    public string CityCode { get; init; } = "";
    public string TaxRegime { get; init; } = "simples_nacional";
}

public sealed record NfeRuntimeConfiguration
{
    public FiscalEnvironment Environment { get; init; } = FiscalEnvironment.Homologation;
    public string Model { get; init; } = "55";
    public int Series { get; init; } = 1;
    public int TimeoutMilliseconds { get; init; } = 60000;
    public FiscalCompanyConfiguration Company { get; init; } = new();
    public FiscalCertificateInput? Certificate { get; init; }
    public string? Csc { get; init; }
    public string? CscId { get; init; }
}

public sealed record FiscalOperationResult
{
    public bool Success { get; init; }
    public string Status { get; init; } = "error";
    public string? Code { get; init; }
    public string? Message { get; init; }
    public string? Xml { get; init; }
    public string? Protocol { get; init; }
    public string? AccessKey { get; init; }
    public JsonElement? Raw { get; init; }
}

public sealed record FiscalAuditEntry
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string EventType { get; init; } = "";
    public string FiscalDocumentId { get; init; } = "";
    public string? AccessKey { get; init; }
    public string? Protocol { get; init; }
    public string Status { get; init; } = "";
    public string? UserReference { get; init; }
    public string PayloadHash { get; init; } = "";
    public DateTimeOffset CreatedAt { get; init; } = DateTimeOffset.UtcNow;
}

public static class FiscalIntegrity
{
    public static string Sha256(string text) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text ?? ""))).ToLowerInvariant();

    public static void RequireAuthorizedXmlImmutable(string? existingSha256, string xml)
    {
        if (string.IsNullOrWhiteSpace(existingSha256)) return;
        var next = Sha256(xml);
        if (!string.Equals(existingSha256, next, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("O XML autorizado é imutável e não pode ser sobrescrito por conteúdo diferente.");
    }
}

public static class SecretRedaction
{
    private static readonly string[] SecretNames = ["passphrase", "password", "senha", "pfxBase64", "csc", "token", "secret"];
    public static string Redact(string input)
    {
        if (string.IsNullOrWhiteSpace(input)) return input;
        var output = input;
        foreach (var name in SecretNames)
            output = System.Text.RegularExpressions.Regex.Replace(output, $"(\\\"?{name}\\\"?\\s*[:=]\\s*\\\"?)([^\\\",}}\\s]+)", "$1***", System.Text.RegularExpressions.RegexOptions.IgnoreCase);
        return output;
    }
}
