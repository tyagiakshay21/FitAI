$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

function Require-Command([string]$Name, [string]$InstallHint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $InstallHint"
    }
}

Require-Command 'node' 'Install Node.js 20 LTS, then reopen PowerShell.'
Require-Command 'npm' 'npm is installed with Node.js. Reinstall Node.js if it is missing.'
if ($env:FITAI_PYTHON -and (Test-Path $env:FITAI_PYTHON)) {
    $pythonExe = $env:FITAI_PYTHON
    $pythonArgs = @()
} elseif (Get-Command 'py' -ErrorAction SilentlyContinue) {
    $pythonExe = 'py'
    $pythonArgs = @('-3.11')
} else {
    Require-Command 'python' 'Install Python 3.11 and add it to PATH, or set FITAI_PYTHON to python.exe.'
    $pythonExe = 'python'
    $pythonArgs = @()
}

$pythonVersion = (& $pythonExe @pythonArgs --version 2>&1).ToString()
if ($pythonVersion -notmatch 'Python 3\.11\.') {
    throw "FitAI dependencies are pinned for Python 3.11. Detected: $pythonVersion. Install Python 3.11 and rerun this script."
}

Write-Host "Creating local environment files..." -ForegroundColor Cyan
if (-not (Test-Path (Join-Path $root 'backend\.env'))) {
    Copy-Item (Join-Path $root 'backend\.env.example') (Join-Path $root 'backend\.env')
    Write-Host 'Created backend\.env. Review its DATABASE_URL and JWT secrets.' -ForegroundColor Yellow
}
if (-not (Test-Path (Join-Path $root 'frontend\.env'))) {
    Copy-Item (Join-Path $root 'frontend\.env.example') (Join-Path $root 'frontend\.env')
}

Write-Host "Installing backend dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $root 'backend')
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Backend npm ci failed.' }
    npm run prisma:generate
    if ($LASTEXITCODE -ne 0) { throw 'Prisma client generation failed.' }
} finally {
    Pop-Location
}

Write-Host "Installing frontend dependencies..." -ForegroundColor Cyan
Push-Location (Join-Path $root 'frontend')
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Frontend npm ci failed.' }
} finally {
    Pop-Location
}

foreach ($service in @('ml-service', 'cv-service')) {
    $servicePath = Join-Path $root $service
    $venvPath = Join-Path $servicePath 'venv'
    $venvPythonExe = Join-Path $venvPath 'Scripts\python.exe'

    Write-Host "Setting up $service..." -ForegroundColor Cyan
    if (-not (Test-Path $venvPythonExe)) {
        & $pythonExe @pythonArgs -m venv $venvPath
        if ($LASTEXITCODE -ne 0) { throw "Could not create virtual environment for $service." }
    }
    if (-not (Test-Path $venvPythonExe)) { throw "Python virtual environment was not created for $service." }
    & $venvPythonExe -m pip install --upgrade pip
    if ($LASTEXITCODE -ne 0) { throw "Could not upgrade pip for $service." }
    if ($service -eq 'cv-service') {
        & $venvPythonExe -m pip install -c (Join-Path $servicePath 'constraints.txt') -r (Join-Path $servicePath 'requirements.txt')
    } else {
        & $venvPythonExe -m pip install -r (Join-Path $servicePath 'requirements.txt')
    }
    if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed for $service." }
}

Write-Host ''
Write-Host 'Local dependencies are installed.' -ForegroundColor Green
Write-Host 'Start backend + frontend together from the project root with:' -ForegroundColor Yellow
Write-Host '  npm run dev'
Write-Host 'To start the ML and computer-vision services too, run:' -ForegroundColor Yellow
Write-Host '  .\start-local.ps1'
