using System.Text.Json;
using Seven.AutoERP.Contracts;
using Seven.AutoERP.Fiscal;
using Seven.AutoERP.Fiscal.NFe;
using Seven.AutoERP.Fiscal.NFSe;
using Seven.AutoERP.Reporting;

namespace Seven.AutoERP.Tests;

public sealed class ReportingFiscalTests
{
    [Fact]
    public async Task Majorsilence_generates_real_pdf_from_bound_fields_and_table()
    {
        var output = Path.Combine(Path.GetTempPath(), $"seven-report-{Guid.NewGuid():N}.pdf");
        try
        {
            using var json = JsonDocument.Parse("""{"Empresa":{"NomeFantasia":"Seven Teste"},"Documento":{"Numero":"123"},"Itens":[{"Codigo":"P1","Descricao":"Produto","Quantidade":2,"ValorUnitario":10,"Total":20}],"Totais":{"Total":20}}""");
            var definition = new DocumentTemplateDefinition
            {
                Elements = new DocumentTemplateElement[]
                {
                    new() { Id="title", Kind="field", Field="Empresa.NomeFantasia", XMm=10, YMm=10, WidthMm=100, HeightMm=8, FontSizePt=14, FontWeight="700" },
                    new() { Id="number", Kind="field", Field="Documento.Numero", XMm=150, YMm=10, WidthMm=40, HeightMm=8, Align="right" },
                    new() { Id="table", Kind="table", TableSource="Itens", XMm=10, YMm=30, WidthMm=180, HeightMm=80, RowHeightMm=7, MaxRows=10,
                        Columns = new TableColumn[] { new(){Id="c",Label="Código",Field="Item.Codigo",WidthMm=30}, new(){Id="d",Label="Descrição",Field="Item.Descricao",WidthMm=90}, new(){Id="t",Label="Total",Field="Item.Total",WidthMm=40,Align="right",Format="money"} } },
                    new() { Id="total", Kind="field", Field="Totais.Total", XMm=150, YMm=120, WidthMm=40, HeightMm=8, Align="right", FontWeight="700" },
                }
            };
            var result = await new ReportingEngine().RenderPdfAsync(new RenderDocumentRequest { TemplateName="Teste", Definition=definition, Data=json.RootElement.Clone(), OutputPath=output });
            Assert.True(result.Success);
            Assert.True(result.Bytes > 1000);
            Assert.Equal("%PDF", System.Text.Encoding.ASCII.GetString(await File.ReadAllBytesAsync(output), 0, 4));
        }
        finally { try { File.Delete(output); } catch { } }
    }

    [Fact]
    public void Authorized_xml_hash_cannot_be_silently_overwritten()
    {
        var original = "<nfeProc>authorized</nfeProc>";
        var hash = FiscalIntegrity.Sha256(original);
        FiscalIntegrity.RequireAuthorizedXmlImmutable(hash, original);
        Assert.Throws<InvalidOperationException>(() => FiscalIntegrity.RequireAuthorizedXmlImmutable(hash, "<nfeProc>changed</nfeProc>"));
    }

    [Fact]
    public void Secret_redaction_hides_certificate_password_and_csc()
    {
        var redacted = SecretRedaction.Redact("passphrase=segredo csc=abcdef token=xyz");
        Assert.DoesNotContain("segredo", redacted);
        Assert.DoesNotContain("abcdef", redacted);
        Assert.DoesNotContain("xyz", redacted);
    }

    [Fact]
    public void Zeus_rejects_invalid_xml_instead_of_bypassing_validation()
    {
        var result = new ZeusNfeGateway().ValidateXml("<NFe><invalido/></NFe>", new NfeRuntimeConfiguration { Company = new FiscalCompanyConfiguration { State = "RS" } });
        Assert.False(result.Success);
        Assert.Equal("schema_validation_failed", result.Code);
    }

    [Fact]
    public async Task National_nfse_provider_fails_closed_without_official_endpoint_configuration()
    {
        using var http = new HttpClient();
        var provider = new PadraoNacionalProvider(http);
        var result = await provider.IssueAsync(new NfseConfiguration { BaseUrl = "" }, new NfseRequest { ServiceCode="0107", Amount=100m });
        Assert.False(result.Success);
        Assert.Equal("configuration_error", result.Status);
    }

    [Fact]
    public async Task Acbr_provider_does_not_simulate_emission_when_library_is_missing()
    {
        var provider = new AcbrProvider();
        var result = await provider.IssueAsync(new NfseConfiguration { AcbrLibPath = Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N")) }, new NfseRequest());
        Assert.False(result.Success);
        Assert.Equal("acbrlib_not_configured", result.Status);
    }
}
