param(
  [string]$InstallerPath = (Join-Path (Get-Location) "release\LyraMD-Setup-1.1.3-x64.exe"),
  [string]$InstallDir = (Join-Path $env:TEMP ("LyraMD-Windows-Smoke-" + (Get-Date -Format "yyyyMMdd-HHmmss"))),
  [string]$ReportPath = (Join-Path (Get-Location) "windows-release-smoke-report.md"),
  [switch]$SkipInstall,
  [string]$AppPath = ""
)

$ErrorActionPreference = "Stop"
$results = New-Object System.Collections.Generic.List[string]

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Notes = ""
  )

  $safeName = $Name.Replace("|", "\|")
  $safeNotes = $Notes.Replace("|", "\|").Replace("`r", " ").Replace("`n", " ")
  $line = "| $safeName | $Status | $safeNotes |"
  $script:results.Add($line) | Out-Null
}

function Ask-ManualResult {
  param([string]$Name)

  while ($true) {
    $answer = Read-Host "$Name [p]ass/[f]ail/[s]kip"
    switch ($answer.ToLowerInvariant()) {
      "p" {
        $notes = Read-Host "Notes for $Name"
        Add-Result $Name "PASS" $notes
        return
      }
      "f" {
        $notes = Read-Host "Failure details for $Name"
        Add-Result $Name "FAIL" $notes
        return
      }
      "s" {
        $notes = Read-Host "Skip reason for $Name"
        Add-Result $Name "SKIP" $notes
        return
      }
      default {
        Write-Host "Please enter p, f, or s."
      }
    }
  }
}

function Resolve-SmokePath {
  param([string]$Path)

  if ([System.IO.Path]::IsPathRooted($Path)) {
    return $Path
  }

  return (Join-Path (Get-Location) $Path)
}

$InstallerPath = Resolve-SmokePath $InstallerPath
$ReportPath = Resolve-SmokePath $ReportPath

Write-Host "LyraMD Windows release smoke"
Write-Host "Installer: $InstallerPath"
Write-Host "Install dir: $InstallDir"
Write-Host "Report: $ReportPath"

if (-not $SkipInstall) {
  if (-not (Test-Path $InstallerPath)) {
    throw "Installer not found: $InstallerPath"
  }

  Write-Host "Installing LyraMD silently..."
  $installArgs = @("/S", "/D=$InstallDir")
  $install = Start-Process -FilePath $InstallerPath -ArgumentList $installArgs -Wait -PassThru
  if ($install.ExitCode -ne 0) {
    throw "Installer exited with code $($install.ExitCode)"
  }

  $AppPath = Join-Path $InstallDir "LyraMD.exe"
  if (Test-Path $AppPath) {
    Add-Result "silent install creates LyraMD.exe" "PASS" $AppPath
  } else {
    Add-Result "silent install creates LyraMD.exe" "FAIL" "Expected $AppPath"
  }
} elseif ($AppPath -eq "") {
  $candidates = @(
    (Join-Path $env:LOCALAPPDATA "Programs\LyraMD\LyraMD.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\lyramd\LyraMD.exe"),
    (Join-Path $env:ProgramFiles "LyraMD\LyraMD.exe")
  )
  $AppPath = ($candidates | Where-Object { Test-Path $_ } | Select-Object -First 1)
  if ($null -eq $AppPath -or $AppPath -eq "") {
    throw "Could not find LyraMD.exe. Pass -AppPath or omit -SkipInstall."
  }
}

if (-not (Test-Path $AppPath)) {
  throw "LyraMD.exe not found: $AppPath"
}

$smokeDir = Join-Path $env:TEMP ("LyraMD-Smoke-Docs-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $smokeDir -Force | Out-Null
$firstFile = Join-Path $smokeDir "first.md"
$secondFile = Join-Path $smokeDir "second.md"
$exportDir = Join-Path $smokeDir "exports"
New-Item -ItemType Directory -Path $exportDir -Force | Out-Null

Set-Content -Path $firstFile -Value "# First smoke file`n`nInitial content." -Encoding UTF8
Set-Content -Path $secondFile -Value "# Second smoke file`n`nOpened through a second launch." -Encoding UTF8

Write-Host ""
Write-Host "Smoke files:"
Write-Host "  $firstFile"
Write-Host "  $secondFile"
Write-Host "  $exportDir"
Write-Host ""

Write-Host "Launching empty app..."
Start-Process -FilePath $AppPath | Out-Null
Start-Sleep -Seconds 4
Add-Result "direct launch starts LyraMD" "PASS" "Started $AppPath; confirm window manually below."
Ask-ManualResult "direct launch shows a blank document"

Write-Host "Launching first markdown file through argv..."
Start-Process -FilePath $AppPath -ArgumentList @($firstFile) | Out-Null
Start-Sleep -Seconds 4
Ask-ManualResult "argv launch opens first.md in LyraMD"

Write-Host "Writing an external update to first.md..."
Add-Content -Path $firstFile -Value "`n`nExternal update at $(Get-Date -Format o)." -Encoding UTF8
Ask-ManualResult "external file edit hot-refreshes the current document"

Write-Host "Launching second markdown file through a second app invocation..."
Start-Process -FilePath $AppPath -ArgumentList @($secondFile) | Out-Null
Start-Sleep -Seconds 4
Ask-ManualResult "second-instance launch reuses or focuses the existing LyraMD session"

Write-Host "Testing shell file association with Invoke-Item..."
Invoke-Item $firstFile
Start-Sleep -Seconds 4
Ask-ManualResult "double-click or shell open for .md routes to LyraMD"

Ask-ManualResult "Open menu can open a markdown file"
Ask-ManualResult "Save updates the current markdown file"
Ask-ManualResult "Save As writes to a new markdown path"
Ask-ManualResult "Export PDF writes a PDF file"
Ask-ManualResult "Export HTML writes an HTML file"
Ask-ManualResult "Start Menu or desktop shortcut launches LyraMD"

$processCount = (Get-Process -Name "LyraMD" -ErrorAction SilentlyContinue | Measure-Object).Count
Add-Result "LyraMD process observed" $(if ($processCount -gt 0) { "PASS" } else { "FAIL" }) "Process count: $processCount"

$report = @(
  "# LyraMD Windows Release Smoke Report",
  "",
  "- Date: $(Get-Date -Format o)",
  "- Windows: $([System.Environment]::OSVersion.VersionString)",
  "- Installer: $InstallerPath",
  "- InstallDir: $InstallDir",
  "- AppPath: $AppPath",
  "- SmokeDir: $smokeDir",
  "",
  "| Check | Status | Notes |",
  "| --- | --- | --- |"
) + $results

Set-Content -Path $ReportPath -Value $report -Encoding UTF8
Write-Host ""
Write-Host "Smoke report written to $ReportPath"
