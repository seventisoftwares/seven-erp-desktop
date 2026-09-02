using System.Globalization;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using Seven.AutoERP.Fiscal;

namespace Seven.AutoERP.Fiscal.NFSe;

internal sealed class AcbrNativeAdapter : IDisposable
{
    private readonly IntPtr _library;
    private IntPtr _handle;
    private bool _initialized;

    [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)]
    private delegate int InitializeDelegate(ref IntPtr handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string config, [MarshalAs(UnmanagedType.LPUTF8Str)] string cryptKey);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int FinalizeDelegate(IntPtr handle);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)] private delegate int StringOutDelegate(IntPtr handle, IntPtr buffer, ref int bufferSize);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)] private delegate int ConfigSetDelegate(IntPtr handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string section, [MarshalAs(UnmanagedType.LPUTF8Str)] string key, [MarshalAs(UnmanagedType.LPUTF8Str)] string value);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)] private delegate int LoadIniDelegate(IntPtr handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string iniOrPath);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl)] private delegate int ClearDelegate(IntPtr handle);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)] private delegate int EmitDelegate(IntPtr handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string batch, int mode, [MarshalAs(UnmanagedType.I1)] bool print, IntPtr buffer, ref int bufferSize);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)] private delegate int QueryKeyDelegate(IntPtr handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string key, IntPtr buffer, ref int bufferSize);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)] private delegate int QueryNumberDelegate(IntPtr handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string number, int page, IntPtr buffer, ref int bufferSize);
    [UnmanagedFunctionPointer(CallingConvention.Cdecl, CharSet = CharSet.Ansi)] private delegate int CancelDelegate(IntPtr handle, [MarshalAs(UnmanagedType.LPUTF8Str)] string cancellationInfo, IntPtr buffer, ref int bufferSize);

    private readonly InitializeDelegate _initialize;
    private readonly FinalizeDelegate _finalize;
    private readonly StringOutDelegate _lastReturn;
    private readonly StringOutDelegate? _version;
    private readonly ConfigSetDelegate _configSet;
    private readonly LoadIniDelegate _loadIni;
    private readonly ClearDelegate _clear;
    private readonly EmitDelegate _emit;
    private readonly QueryKeyDelegate? _queryByKey;
    private readonly QueryNumberDelegate? _queryByNumber;
    private readonly CancelDelegate _cancel;

    public AcbrNativeAdapter(string libraryPath)
    {
        if (string.IsNullOrWhiteSpace(libraryPath) || !File.Exists(libraryPath)) throw new FileNotFoundException("ACBrLibNFSe não encontrada.", libraryPath);
        _library = NativeLibrary.Load(Path.GetFullPath(libraryPath));
        _initialize = Get<InitializeDelegate>("NFSE_Inicializar");
        _finalize = Get<FinalizeDelegate>("NFSE_Finalizar");
        _lastReturn = Get<StringOutDelegate>("NFSE_UltimoRetorno");
        _version = TryGet<StringOutDelegate>("NFSE_Versao");
        _configSet = Get<ConfigSetDelegate>("NFSE_ConfigGravarValor");
        _loadIni = Get<LoadIniDelegate>("NFSE_CarregarINI");
        _clear = Get<ClearDelegate>("NFSE_LimparLista");
        _emit = Get<EmitDelegate>("NFSE_Emitir");
        _queryByKey = TryGet<QueryKeyDelegate>("NFSE_ConsultarNFSePorChave");
        _queryByNumber = TryGet<QueryNumberDelegate>("NFSE_ConsultarNFSePorNumero");
        _cancel = Get<CancelDelegate>("NFSE_Cancelar");
    }

    public string Version => _version is null || !_initialized ? "ACBrLibNFSe" : InvokeString(_version);

    public void Initialize(NfseConfiguration configuration)
    {
        if (_initialized) return;
        var configPath = configuration.AcbrIniPath ?? "";
        var code = _initialize(ref _handle, configPath, "");
        if (code != 0) throw AcbrException("NFSE_Inicializar", code);
        if (_handle == IntPtr.Zero) throw new InvalidOperationException("A ACBrLibNFSe inicializou sem retornar um handle válido.");
        _initialized = true;
        Configure(configuration);
    }

    private void Configure(NfseConfiguration configuration)
    {
        Set("NFSe", "CodigoMunicipio", configuration.MunicipalityCode);
        Set("NFSe", "Ambiente", configuration.Environment == FiscalEnvironment.Production ? "0" : "1");
        if (configuration.Options.TryGetValue("PathSchemas", out var schemas)) Set("NFSe", "PathSchemas", schemas);
        if (configuration.Options.TryGetValue("IniServicos", out var servicesIni)) Set("NFSe", "IniServicos", servicesIni);
        if (configuration.Options.TryGetValue("PathSalvar", out var savePath)) Set("NFSe", "PathSalvar", savePath);
        foreach (var option in configuration.Options)
        {
            var parts = option.Key.Split('.', 2);
            if (parts.Length == 2 && !new[] { "PathSchemas", "IniServicos", "PathSalvar" }.Contains(option.Key, StringComparer.OrdinalIgnoreCase)) Set(parts[0], parts[1], option.Value);
        }
    }

    private void Set(string section, string key, string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return;
        var code = _configSet(_handle, section, key, value);
        if (code != 0) throw AcbrException($"Config {section}.{key}", code);
    }

    public FiscalOperationResult Issue(NfseConfiguration configuration, NfseRequest request)
    {
        EnsureInitialized();
        Check(_clear(_handle), "NFSE_LimparLista");
        var ini = ExtractCustomIni(request) ?? BuildGenericIni(configuration, request);
        Check(_loadIni(_handle, ini), "NFSE_CarregarINI");
        var batch = string.IsNullOrWhiteSpace(request.ExternalId) ? DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture) : DigitsOrHash(request.ExternalId);
        var response = InvokeString((IntPtr buffer, ref int size) => _emit(_handle, batch, 0, false, buffer, ref size));
        return ResultFromResponse("issued", response, Version);
    }

    public FiscalOperationResult Query(string key)
    {
        EnsureInitialized();
        if (string.IsNullOrWhiteSpace(key)) throw new InvalidOperationException("Informe a chave ou número da NFS-e para consulta.");
        string response;
        if (_queryByKey is not null) response = InvokeString((IntPtr buffer, ref int size) => _queryByKey(_handle, key, buffer, ref size));
        else if (_queryByNumber is not null) response = InvokeString((IntPtr buffer, ref int size) => _queryByNumber(_handle, key, 1, buffer, ref size));
        else throw new MissingMethodException("A ACBrLibNFSe compilada não exporta consulta por chave/número.");
        return ResultFromResponse("queried", response, Version);
    }

    public FiscalOperationResult Cancel(string key, string justification)
    {
        EnsureInitialized();
        if (string.IsNullOrWhiteSpace(key)) throw new InvalidOperationException("Informe o número/chave da NFS-e para cancelamento.");
        if (string.IsNullOrWhiteSpace(justification) || justification.Trim().Length < 5) throw new InvalidOperationException("Informe justificativa de cancelamento.");
        var info = $"[Cancelamento]\nNumeroNFSe={Ini(key)}\nMotivoCancelamento={Ini(justification)}\n";
        var response = InvokeString((IntPtr buffer, ref int size) => _cancel(_handle, info, buffer, ref size));
        return ResultFromResponse("cancelled", response, Version);
    }

    private static string? ExtractCustomIni(NfseRequest request)
    {
        if (request.AdditionalData is not { } additional || additional.ValueKind != JsonValueKind.Object) return null;
        if (!additional.TryGetProperty("acbrIni", out var node) || node.ValueKind != JsonValueKind.String) return null;
        var value = node.GetString(); return string.IsNullOrWhiteSpace(value) ? null : value;
    }

    private static string BuildGenericIni(NfseConfiguration config, NfseRequest request)
    {
        if (request.Amount <= 0) throw new InvalidOperationException("Valor do serviço deve ser maior que zero.");
        if (string.IsNullOrWhiteSpace(request.ServiceCode)) throw new InvalidOperationException("Código do serviço é obrigatório.");
        if (string.IsNullOrWhiteSpace(config.TaxId) || string.IsNullOrWhiteSpace(config.MunicipalityCode)) throw new InvalidOperationException("CNPJ e código do município do prestador são obrigatórios.");

        var rps = string.IsNullOrWhiteSpace(request.RpsNumber) ? DateTimeOffset.UtcNow.ToUnixTimeSeconds().ToString(CultureInfo.InvariantCulture) : request.RpsNumber;
        var now = DateTimeOffset.Now;
        var withheld = request.IssWithheld ? "1" : "2";
        var sb = new StringBuilder();
        sb.AppendLine("[IdentificacaoRps]"); sb.AppendLine($"Numero={Ini(rps)}"); sb.AppendLine("Serie=1"); sb.AppendLine("Tipo=1");
        sb.AppendLine($"DataEmissao={now:yyyy-MM-dd HH:mm:ss}"); sb.AppendLine($"Competencia={now:yyyy-MM-dd}");
        sb.AppendLine("[Prestador]"); sb.AppendLine($"Cnpj={Ini(config.TaxId)}"); sb.AppendLine($"InscricaoMunicipal={Ini(config.MunicipalRegistration)}"); sb.AppendLine($"CodigoMunicipio={Ini(config.MunicipalityCode)}");
        sb.AppendLine("[Tomador]"); sb.AppendLine($"CpfCnpj={Ini(request.CustomerTaxId)}"); sb.AppendLine($"RazaoSocial={Ini(request.CustomerName)}"); sb.AppendLine($"Email={Ini(request.CustomerEmail)}"); sb.AppendLine($"CodigoMunicipio={Ini(request.CustomerCityCode)}");
        sb.AppendLine("[Servico]"); sb.AppendLine($"ItemListaServico={Ini(request.ServiceCode)}"); sb.AppendLine($"CodigoCnae={Ini(request.Cnae)}"); sb.AppendLine($"Discriminacao={Ini(request.Description)}");
        sb.AppendLine($"ValorServicos={request.Amount.ToString("0.00", CultureInfo.InvariantCulture)}"); sb.AppendLine($"Aliquota={request.IssRate.ToString("0.####", CultureInfo.InvariantCulture)}"); sb.AppendLine($"IssRetido={withheld}");
        foreach (var withholding in request.Withholdings) sb.AppendLine($"{Ini(withholding.Key)}={withholding.Value.ToString("0.00", CultureInfo.InvariantCulture)}");
        return sb.ToString();
    }

    private static string Ini(string? value) => (value ?? "").Replace("\r", " ").Replace("\n", " ").Replace("=", "-").Trim();
    private static string DigitsOrHash(string value)
    {
        var digits = new string(value.Where(char.IsDigit).Take(14).ToArray());
        if (digits.Length > 0) return digits;
        var hash = unchecked((uint)StringComparer.Ordinal.GetHashCode(value));
        return hash.ToString(CultureInfo.InvariantCulture);
    }

    private FiscalOperationResult ResultFromResponse(string successStatus, string response, string engine)
    {
        JsonElement raw;
        try { raw = JsonSerializer.Deserialize<JsonElement>(response); }
        catch { raw = JsonSerializer.SerializeToElement(new { response }); }
        var looksError = response.Contains("Erro", StringComparison.OrdinalIgnoreCase) || response.Contains("Rejei", StringComparison.OrdinalIgnoreCase) || response.Contains("Exception", StringComparison.OrdinalIgnoreCase);
        return new FiscalOperationResult { Success = !looksError, Status = looksError ? "rejected" : successStatus, Message = looksError ? SecretRedaction.Redact(response[..Math.Min(response.Length, 1000)]) : $"Operação executada pela {engine}.", Raw = raw };
    }

    private delegate int BufferCall(IntPtr buffer, ref int size);
    private string InvokeString(StringOutDelegate function) => InvokeString((IntPtr buffer, ref int size) => function(_handle, buffer, ref size));
    private string InvokeString(BufferCall call)
    {
        var size = 8192;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            var buffer = Marshal.AllocHGlobal(size);
            try
            {
                Marshal.Copy(new byte[size], 0, buffer, size);
                var requested = size;
                var code = call(buffer, ref requested);
                if (code == 0)
                {
                    var actual = Math.Clamp(requested, 0, size - 1);
                    if (actual == 0) return string.Empty;
                    var bytes = new byte[actual];
                    Marshal.Copy(buffer, bytes, 0, actual);
                    return Encoding.UTF8.GetString(bytes).TrimEnd('\0', '\r', '\n');
                }
                if (requested > size && requested < 16 * 1024 * 1024) { size = requested + 1; continue; }
                throw AcbrException("ACBrLib", code);
            }
            finally { Marshal.FreeHGlobal(buffer); }
        }
        throw new InvalidOperationException("Resposta ACBrLib excedeu o limite de buffer.");
    }

    private Exception AcbrException(string operation, int code)
    {
        string detail = "";
        if (_initialized)
        {
            try { detail = InvokeString(_lastReturn); } catch { }
        }
        return new InvalidOperationException($"{operation} falhou na ACBrLib (código {code}). {SecretRedaction.Redact(detail)}".Trim());
    }

    private void Check(int code, string operation) { if (code != 0) throw AcbrException(operation, code); }
    private void EnsureInitialized() { if (!_initialized || _handle == IntPtr.Zero) throw new InvalidOperationException("ACBrLibNFSe não inicializada."); }
    private T Get<T>(string export) where T : Delegate => Marshal.GetDelegateForFunctionPointer<T>(NativeLibrary.GetExport(_library, export));
    private T? TryGet<T>(string export) where T : Delegate => NativeLibrary.TryGetExport(_library, export, out var ptr) ? Marshal.GetDelegateForFunctionPointer<T>(ptr) : null;

    public void Dispose()
    {
        if (_initialized && _handle != IntPtr.Zero) { try { _finalize(_handle); } catch { } _handle = IntPtr.Zero; _initialized = false; }
        if (_library != IntPtr.Zero) { try { NativeLibrary.Free(_library); } catch { } }
    }
}
