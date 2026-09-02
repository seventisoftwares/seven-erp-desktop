using DFe.Classes.Flags;
using global::NFe.Classes;
using global::NFe.Danfe.Html;
using global::NFe.Danfe.Html.CrossCutting;
using global::NFe.Danfe.Html.Dominio;
using global::NFe.Danfe.Html.Interfaces;
using global::NFe.Utils.NFe;

namespace Seven.AutoERP.Fiscal.Danfe;

public sealed class ZeusDanfeGenerator
{
    public async Task<string> GenerateHtmlAsync(string authorizedNfeProcXml, string? logoDataUrl = null, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(authorizedNfeProcXml) || !authorizedNfeProcXml.Contains("<nfeProc", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("DANFE exige XML nfeProc autorizado; o PDF nunca substitui o XML fiscal.");
        var proc = new nfeProc().CarregarDeXmlString(authorizedNfeProcXml);
        if (proc.NFe?.infNFe?.ide?.mod != ModeloDocumento.NFe) throw new InvalidOperationException("O XML informado não é NF-e modelo 55.");
        var protocol = proc.protNFe?.infProt;
        if (protocol is null || protocol.cStat != 100 || string.IsNullOrWhiteSpace(protocol.nProt))
            throw new InvalidOperationException("DANFE só pode ser gerado para NF-e autorizada (cStat 100).");
        cancellationToken.ThrowIfCancellationRequested();
        var danfe = new DanfeNFe(proc.NFe, Status.Autorizada, protocol.nProt, "Seven ERP", null, logoDataUrl ?? "");
        IDanfeHtml2 renderer = new DanfeNfeHtml2(danfe);
        var document = await renderer.ObterDocHtmlAsync();
        if (string.IsNullOrWhiteSpace(document.Html)) throw new InvalidOperationException("O gerador Zeus retornou DANFE vazio.");
        return document.Html;
    }
}
