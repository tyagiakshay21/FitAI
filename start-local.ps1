$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$required = @(
    'backend\.env',
    'frontend\.env',
    'backend\node_modules',
    'frontend\node_modules',
    'ml-service\venv\Scripts\python.exe',
    'cv-service\venv\Scripts\python.exe'
)
foreach ($item in $required) {
    if (-not (Test-Path (Join-Path $root $item))) {
        throw "Missing $item. Run .\setup-local.ps1 first."
    }
}

# Load the backend environment so the CV service receives the same JWT secret.
Get-Content (Join-Path $root 'backend\.env') | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#')) {
        $separator = $line.IndexOf('=')
        if ($separator -gt 0) {
            $key = $line.Substring(0, $separator).Trim()
            $value = $line.Substring($separator + 1).Trim().Trim('"').Trim("'")
            [Environment]::SetEnvironmentVariable($key, $value, 'Process')
        }
    }
}

function Open-ServiceTerminal([string]$Title, [string]$Directory, [string]$Command) {
    $scriptText = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$Directory'; $Command"
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($scriptText))
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoExit', '-EncodedCommand', $encoded)
}

Open-ServiceTerminal 'FitAI Backend' (Join-Path $root 'backend') 'npm run dev'
Open-ServiceTerminal 'FitAI ML Service' (Join-Path $root 'ml-service') "& '.\venv\Scripts\python.exe' -m uvicorn app.main:app --reload --port 8002"
Open-ServiceTerminal 'FitAI Computer Vision' (Join-Path $root 'cv-service') "`$env:JWT_ACCESS_SECRET = '$env:JWT_ACCESS_SECRET'; `$env:CLIENT_URL = '$env:CLIENT_URL'; `$env:CV_REQUIRE_AUTH = 'true'; & '.\venv\Scripts\python.exe' -m uvicorn app.main:app --reload --port 8001"
Open-ServiceTerminal 'FitAI Frontend' (Join-Path $root 'frontend') 'npm run dev'

Write-Host 'Started the FitAI services in separate PowerShell windows.' -ForegroundColor Green
Write-Host 'Open http://localhost:5173 in your browser.' -ForegroundColor Cyan
