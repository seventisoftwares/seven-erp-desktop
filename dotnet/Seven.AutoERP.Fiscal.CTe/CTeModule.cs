namespace Seven.AutoERP.Fiscal.CTe;

public static class CTeModule
{
    public static object Capabilities => new
    {
        engine = "Zeus.Net.CTe",
        enabled = true,
        transmission = "available_after_company_and_certificate_configuration",
        note = "CT-e permanece isolado do editor livre de relatórios."
    };
}
