param(
    [string]$DumpFile = "db_dump.json",
    [switch]$Force
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host "==> Starting SQLite -> Postgres migration" -ForegroundColor Cyan

# Resolve paths
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackendDir = Resolve-Path (Join-Path $ScriptDir "..")
$DumpPath = Join-Path $BackendDir $DumpFile
$ManagePy = Join-Path $BackendDir "manage.py"

if (!(Test-Path $ManagePy)) {
    throw "manage.py not found in $BackendDir"
}

# Helper to run python manage.py
function Invoke-Django {
    param(
        [Parameter(Mandatory=$true)][string]$Args,
        [string]$Settings
    )
    $settingsArg = if ($Settings) { " --settings $Settings" } else { "" }
    $cmd = "python `"$ManagePy`" $Args$settingsArg"
    Write-Host "-> $cmd" -ForegroundColor DarkGray
    $p = Start-Process -FilePath powershell -ArgumentList "-NoProfile","-Command", $cmd -WorkingDirectory $BackendDir -NoNewWindow -PassThru -Wait
    if ($p.ExitCode -ne 0) {
        throw "Command failed with exit code $($p.ExitCode): $cmd"
    }
}

# 0) Patch SQLite schema to include any new columns needed for serialization
Write-Host "Step 0/3: Patching SQLite schema for dump compatibility" -ForegroundColor Yellow
$patchScript = Join-Path $BackendDir "scripts/patch_sqlite_missing_columns.py"
if (Test-Path $patchScript) {
    $cmd = "python `"$patchScript`""
    Write-Host "-> $cmd" -ForegroundColor DarkGray
    $p = Start-Process -FilePath powershell -ArgumentList "-NoProfile","-Command", $cmd -WorkingDirectory $BackendDir -NoNewWindow -PassThru -Wait
    if ($p.ExitCode -ne 0) {
        throw "Patch script failed with exit code $($p.ExitCode)"
    }
} else {
    Write-Host "Patch script not found at $patchScript; continuing without patch" -ForegroundColor DarkYellow
}

# 0b) Ensure ALL missing model columns exist in SQLite
$ensureScript = Join-Path $BackendDir "scripts/ensure_sqlite_columns_from_models.py"
if (Test-Path $ensureScript) {
    $cmd = "python `"$ensureScript`""
    Write-Host "-> $cmd" -ForegroundColor DarkGray
    $p = Start-Process -FilePath powershell -ArgumentList "-NoProfile","-Command", $cmd -WorkingDirectory $BackendDir -NoNewWindow -PassThru -Wait
    if ($p.ExitCode -ne 0) {
        throw "Ensure script failed with exit code $($p.ExitCode)"
    }
}

# 1) Dump data from SQLite using the override settings
Write-Host "Step 1/3: Dumping data from SQLite to $DumpPath" -ForegroundColor Yellow
if ((Test-Path $DumpPath) -and -not $Force) {
    throw "Dump file '$DumpPath' already exists. Re-run with -Force to overwrite."
}

# Remove old dump if forcing
if ((Test-Path $DumpPath) -and $Force) {
    Remove-Item $DumpPath -Force
}

# Use natural keys and exclude auto-generated tables that cause conflicts on load
Invoke-Django -Args "dumpdata --natural-foreign --natural-primary --exclude contenttypes --exclude auth.permission --exclude admin.logentry --indent 2 --output `"$DumpPath`"" -Settings "server.settings_sqlite"

# 2) Run migrations on Postgres (default settings use DATABASE_URL from .env)
Write-Host "Step 2/3: Applying migrations on Postgres" -ForegroundColor Yellow
try {
    # Ensure Postgres is running (start local Docker if needed)
    $starter = Join-Path $BackendDir "scripts/start_postgres_docker.ps1"
    if (Test-Path $starter) {
        Write-Host "Ensuring local Postgres is running on port 5433" -ForegroundColor DarkYellow
        $p = Start-Process -FilePath powershell -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File", $starter, "-HostPort", "5433", "-ContainerName", "togetha-postgres" -WorkingDirectory $BackendDir -NoNewWindow -PassThru -Wait
        if ($p.ExitCode -ne 0) {
            Write-Host "Warning: start_postgres_docker.ps1 exited with code $($p.ExitCode)" -ForegroundColor DarkYellow
        }
    }
} catch {}
Invoke-Django -Args "migrate"

# 3) Load data into Postgres
Write-Host "Step 3/3: Loading data into Postgres from $DumpPath" -ForegroundColor Yellow
Invoke-Django -Args "loaddata `"$DumpPath`""

Write-Host "==> Migration complete. Verify your data in Postgres and test the app." -ForegroundColor Green
