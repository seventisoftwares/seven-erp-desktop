namespace Seven.AutoERP.Fiscal.MDFe;

public static class MDFeModule
{
    public static object Capabilities => new
    {
        engine = "Zeus.Net.MDFe",
        enabled = true,
        transmission = "available_after_company_and_certificate_configuration",
        note = "MDF-e é fiscal e não utiliza o designer livre de documentos."
    };
}
