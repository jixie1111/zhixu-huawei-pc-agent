param(
    [ValidateSet('Configure', 'Inspect', 'Check', 'Start')]
    [string]$Mode = 'Start',
    [Security.SecureString]$ApiKey,
    [string]$BaseUrl = 'http://localhost:55460/v1',
    [string]$Model = 'gpt-6.1-sol',
    [ValidateRange(1024, 65535)]
    [int]$Port = 3000,
    [string]$ProfilePath,
    [switch]$Replace
)

# This Windows-only launcher never changes User/Machine environment variables.
# The private profile contains a current-user DPAPI ciphertext, never a raw key.
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $ProfilePath) { $ProfilePath = Join-Path $projectRoot 'private/local-recording.json' }
$profileFile = [IO.Path]::GetFullPath($ProfilePath)

function Assert-Endpoint([string]$Value) {
    if ($Value -notmatch '^http://(localhost|127\.0\.0\.1):([1-9][0-9]{0,4})/v1/?$') {
        throw 'Recording mode requires an explicit loopback /v1 model endpoint.'
    }
    $endpoint = [Uri]$Value
    if ($endpoint.Port -gt 65535 -or $endpoint.Port -lt 1) { throw 'Invalid model port.' }
}

function Assert-Model([string]$Value) {
    if ($Value -notmatch '^[a-zA-Z0-9._:/-]{1,120}$') { throw 'Invalid model identifier.' }
}

try {
    # npm can inherit PowerShell 7's module search path while launching Windows
    # PowerShell 5. Load matching built-ins from this host, not that search path.
    foreach ($moduleName in @('Microsoft.PowerShell.Security', 'Microsoft.PowerShell.Utility', 'Microsoft.PowerShell.Management')) {
        Import-Module (Join-Path $PSHOME ('Modules/' + $moduleName + '/' + $moduleName + '.psd1')) -ErrorAction Stop
    }
    if ($Mode -eq 'Configure') {
        Assert-Endpoint $BaseUrl
        Assert-Model $Model
        if (-not $ApiKey -or $ApiKey.Length -eq 0) { throw 'Supply ApiKey as a SecureString.' }
        if ((Test-Path -LiteralPath $profileFile) -and -not $Replace) {
            throw 'A recording profile already exists. Use -Replace only to intentionally replace it.'
        }
        $profileDirectory = [IO.Path]::GetDirectoryName($profileFile)
        [void][IO.Directory]::CreateDirectory($profileDirectory)
        $profile = [ordered]@{
            schemaVersion = 1
            baseUrl = $BaseUrl.TrimEnd('/')
            model = $Model
            reasoningEffort = 'low'
            protectedApiKey = (ConvertFrom-SecureString -SecureString $ApiKey)
        }
        [IO.File]::WriteAllText($profileFile, ($profile | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
        Write-Output 'WUYAN recording profile saved with current-user Windows encryption.'
        exit 0
    }

    if (-not (Test-Path -LiteralPath $profileFile)) {
        throw 'Recording profile missing. Run Configure once with a SecureString API key.'
    }
    if ((Get-Item -LiteralPath $profileFile).Length -gt 32768) { throw 'Recording profile is too large.' }
    $profile = Get-Content -LiteralPath $profileFile -Raw -Encoding UTF8 | ConvertFrom-Json
    $expectedFields = @('schemaVersion', 'baseUrl', 'model', 'reasoningEffort', 'protectedApiKey')
    if (@($profile.PSObject.Properties.Name).Count -ne $expectedFields.Count -or
        @($profile.PSObject.Properties.Name | Where-Object { $_ -notin $expectedFields }).Count -gt 0 -or
        $profile.schemaVersion -ne 1 -or $profile.reasoningEffort -cne 'low') {
        throw 'Invalid recording profile. Reconfigure it rather than silently changing settings.'
    }
    Assert-Endpoint $profile.baseUrl
    Assert-Model $profile.model
    try {
        $secureKey = ConvertTo-SecureString -String $profile.protectedApiKey
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
        try { $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        if ([string]::IsNullOrWhiteSpace($plainKey)) { throw 'empty' }
    } catch { throw 'Cannot decrypt this profile for the current Windows user. Configure it again.' }

    $publicState = [ordered]@{
        brand = 'WUYAN'
        model = $profile.model
        baseUrl = $profile.baseUrl
        reasoningEffort = $profile.reasoningEffort
        keyConfigured = $true
        credentialsProtectedForCurrentUser = $true
    }
    if ($Mode -eq 'Inspect') { $publicState | ConvertTo-Json -Compress; exit 0 }
    if ($Mode -eq 'Check') {
        try {
            $catalog = Invoke-RestMethod -Uri ($profile.baseUrl + '/models') -Headers @{Authorization = ('Bearer ' + $plainKey)} -TimeoutSec 15
            if (-not (@($catalog.data | ForEach-Object { $_.id }) -ccontains $profile.model)) { throw 'model unavailable' }
        } catch { throw 'Model connection check failed. Confirm the local service, model and API key.' }
        $publicState['modelCatalogVerified'] = $true
        $publicState | ConvertTo-Json -Compress
        exit 0
    }

    if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'dist/index.html'))) {
        throw 'Production build missing. Run npm run build before start:local.'
    }
    $variables = @{
        HOST = '127.0.0.1'; PORT = [string]$Port; NODE_ENV = 'production'; PUBLIC_DEPLOYMENT = 'false'
        PUBLIC_ORIGIN = ''; FRAME_ANCESTORS = ''
        LLM_BASE_URL = $profile.baseUrl; LOCAL_LLM_BASE_URL = $profile.baseUrl
        LLM_MODEL = $profile.model; LLM_REASONING_EFFORT = 'low'; LLM_API_KEY = $plainKey
    }
    $previousEnvironment = @{}
    foreach ($name in $variables.Keys) {
        $previousEnvironment[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $variables[$name], 'Process')
    }
    Push-Location -LiteralPath $projectRoot
    try {
        Write-Output ('WUYAN local production - ' + $profile.model + ' / low - http://127.0.0.1:' + $Port)
        & (Join-Path $projectRoot 'node_modules/.bin/tsx.cmd') (Join-Path $projectRoot 'server/index.ts') --production
        $serverExit = $LASTEXITCODE
    } finally {
        Pop-Location
        foreach ($name in $variables.Keys) { [Environment]::SetEnvironmentVariable($name, $previousEnvironment[$name], 'Process') }
        $plainKey = $null
    }
    exit $serverExit
} catch {
    # Do not print raw upstream responses, ciphertext, keys, or exception traces.
    [Console]::Error.WriteLine('WUYAN: ' + $_.Exception.Message)
    exit 1
}
