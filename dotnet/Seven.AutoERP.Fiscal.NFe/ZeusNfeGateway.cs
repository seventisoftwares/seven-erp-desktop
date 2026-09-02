using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using DFe.Classes.Entidades;
using DFe.Classes.Flags;
using global::NFe.Classes.Informacoes.Identificacao.Tipos;
using global::NFe.Classes.Servicos.Tipos;
using global::NFe.Servicos;
using global::NFe.Utils;
using global::NFe.Utils.NFe;
using global::NFe.Utils.Recepcao;
using Seven.AutoERP.Fiscal;
using ZeusNFeDocument = global::NFe.Classes.NFe;

namespace Seven.AutoERP.Fiscal.NFe;

public sealed class ZeusNfeGateway
{
    public object Capabilities => new
    {
        engine = "Zeus DFe.NET",
        package = "Zeus.Net.NFe.NFCe",
        models = new[] { "55", "65" },
        operations = new[] { "load_xml", "schema_validate", "sign_a1", "status_service", "authorize_sync" },
        a3 = "supported_when_os_certificate_store/provider_is_available",
        note = "O motor Node existente permanece disponível para eventos enquanto cada operação Zeus é validada em homologação real."
    };

    public FiscalOperationResult ValidateXml(string xml, NfeRuntimeConfiguration configuration)
    {
        try
        {
            var config = BuildConfiguration(configuration);
            var nfe = new ZeusNFeDocument().CarregarDeXmlString(xml);
            nfe.Valida(config);
            return new FiscalOperationResult
            {
                Success = true,
                Status = "valid",
                Message = "XML carregado e validado pelo schema/validador Zeus.",
                Xml = nfe.ObterXmlString(),
                AccessKey = nfe.infNFe?.Id?.Replace("NFe", "", StringComparison.OrdinalIgnoreCase)
            };
        }
        catch (Exception ex) { return Failure("schema_validation_failed", ex); }
    }

    public FiscalOperationResult SignAndValidateXml(string xml, NfeRuntimeConfiguration configuration)
    {
        try
        {
            using var cert = LoadA1(configuration.Certificate);
            var config = BuildConfiguration(configuration);
            var nfe = new ZeusNFeDocument().CarregarDeXmlString(xml);
            nfe.Assina(config, cert);
            nfe.Valida(config);
            var signedXml = nfe.ObterXmlString();
            return new FiscalOperationResult
            {
                Success = true,
                Status = "signed_and_valid",
                Message = "XML assinado com A1 e validado pelo Zeus.",
                Xml = signedXml,
                AccessKey = nfe.infNFe?.Id?.Replace("NFe", "", StringComparison.OrdinalIgnoreCase)
            };
        }
        catch (Exception ex) { return Failure("sign_or_validate_failed", ex); }
    }

    public FiscalOperationResult StatusService(NfeRuntimeConfiguration configuration)
    {
        try
        {
            using var cert = LoadA1(configuration.Certificate);
            var config = BuildConfiguration(configuration);
            using var service = new ServicosNFe(config, cert);
            var response = service.NfeStatusServico();
            var status = response.Retorno.cStat;
            return new FiscalOperationResult
            {
                Success = status == 107,
                Status = status == 107 ? "service_operational" : "service_unavailable",
                Code = status.ToString(),
                Message = response.Retorno.xMotivo,
                Raw = JsonSerializer.SerializeToElement(new { response.Retorno.cStat, response.Retorno.xMotivo, response.Retorno.tpAmb, response.Retorno.cUF, response.Retorno.dhRecbto })
            };
        }
        catch (Exception ex) { return Failure("status_service_failed", ex); }
    }

    public FiscalOperationResult AuthorizeSync(string xml, NfeRuntimeConfiguration configuration, int batchId)
    {
        try
        {
            if (batchId <= 0) throw new InvalidOperationException("Identificador de lote deve ser positivo.");
            using var cert = LoadA1(configuration.Certificate);
            var config = BuildConfiguration(configuration);
            var nfe = new ZeusNFeDocument().CarregarDeXmlString(xml);
            nfe.Assina(config, cert);
            nfe.Valida(config);
            using var service = new ServicosNFe(config, cert);
            var response = service.NFeAutorizacao(batchId, IndicadorSincronizacao.Sincrono, new List<ZeusNFeDocument> { nfe }, false);
            var ret = response.Retorno;
            var protocol = ret.protNFe?.infProt;
            var code = protocol?.cStat ?? ret.cStat;
            var motive = protocol?.xMotivo ?? ret.xMotivo;
            var accessKey = protocol?.chNFe ?? nfe.infNFe?.Id?.Replace("NFe", "", StringComparison.OrdinalIgnoreCase);
            var authorized = code == 100;
            return new FiscalOperationResult
            {
                Success = authorized,
                Status = authorized ? "authorized" : "rejected",
                Code = code.ToString(),
                Message = motive,
                Xml = ret.ObterXmlString(),
                Protocol = protocol?.nProt,
                AccessKey = accessKey,
                Raw = JsonSerializer.SerializeToElement(new { ret.cStat, ret.xMotivo, protocol = protocol is null ? null : new { protocol.cStat, protocol.xMotivo, protocol.nProt, protocol.chNFe, protocol.dhRecbto } })
            };
        }
        catch (Exception ex) { return Failure("authorization_failed", ex); }
    }

    private static ConfiguracaoServico BuildConfiguration(NfeRuntimeConfiguration input)
    {
        if (!Enum.TryParse<Estado>(input.Company.State, true, out var state)) throw new InvalidOperationException($"UF inválida: {input.Company.State}");
        return new ConfiguracaoServico
        {
            cUF = state,
            tpAmb = input.Environment == FiscalEnvironment.Production ? TipoAmbiente.Producao : TipoAmbiente.Homologacao,
            tpEmis = TipoEmissao.teNormal,
            ModeloDocumento = input.Model == "65" ? ModeloDocumento.NFCe : ModeloDocumento.NFe,
            VersaoLayout = VersaoServico.Versao400,
            TimeOut = Math.Clamp(input.TimeoutMilliseconds, 5000, 180000),
            DefineVersaoServicosAutomaticamente = true,
        };
    }

    private static X509Certificate2 LoadA1(FiscalCertificateInput? certificate)
    {
        if (certificate is null || string.IsNullOrWhiteSpace(certificate.PfxBase64)) throw new InvalidOperationException("Certificado A1 não informado.");
        byte[] bytes;
        try { bytes = Convert.FromBase64String(certificate.PfxBase64); }
        catch { throw new InvalidOperationException("Certificado A1 não está em Base64 válido."); }
        try
        {
#pragma warning disable SYSLIB0057
            var cert = new X509Certificate2(bytes, certificate.Passphrase ?? "", X509KeyStorageFlags.EphemeralKeySet | X509KeyStorageFlags.Exportable);
#pragma warning restore SYSLIB0057
            if (!cert.HasPrivateKey) { cert.Dispose(); throw new InvalidOperationException("Certificado não possui chave privada."); }
            if (DateTime.UtcNow < cert.NotBefore.ToUniversalTime() || DateTime.UtcNow > cert.NotAfter.ToUniversalTime()) { cert.Dispose(); throw new InvalidOperationException("Certificado está fora do período de validade."); }
            return cert;
        }
        finally { Array.Clear(bytes); }
    }

    private static FiscalOperationResult Failure(string code, Exception ex) => new() { Success = false, Status = "error", Code = code, Message = SecretRedaction.Redact(ex.Message) };
}
