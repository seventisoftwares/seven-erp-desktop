using Seven.AutoERP.Fiscal.NFe;

namespace Seven.AutoERP.Fiscal.NFCe;

public sealed class NfceGateway
{
    private readonly ZeusNfeGateway _zeus = new();
    public object Capabilities => new { model = 65, thermalWidthsMm = new[] { 80 }, qrCodeFiscal = true, csc = true, idToken = true, offlineContingency = "requires_UF_legal_configuration", payments = new[] { "pix", "cash", "card", "change" } };

    public FiscalOperationResult ValidateXml(string xml, NfeRuntimeConfiguration configuration) => _zeus.ValidateXml(xml, configuration with { Model = "65" });
    public FiscalOperationResult SignAndValidateXml(string xml, NfeRuntimeConfiguration configuration) => _zeus.SignAndValidateXml(xml, configuration with { Model = "65" });
    public FiscalOperationResult StatusService(NfeRuntimeConfiguration configuration) => _zeus.StatusService(configuration with { Model = "65" });
    public FiscalOperationResult AuthorizeSync(string xml, NfeRuntimeConfiguration configuration, int batchId) => _zeus.AuthorizeSync(xml, configuration with { Model = "65" }, batchId);
}
