# Pack the File by Tag add-on.
# Usage: .\pack.ps1 1.2.0
# Sets "version" in manifest.json and writes dist\file-by-tag-<version>.xpi
#
# Uses System.IO.Compression directly instead of Compress-Archive, because
# Compress-Archive in Windows PowerShell 5.1 stores "icons\icon-16.png" with
# backslashes, which Thunderbird can't read.

param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^\d+(\.\d+){0,3}$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

# Update the version in manifest.json, saved as UTF-8 without BOM.
$manifestPath = Join-Path $PSScriptRoot 'manifest.json'
$json = [IO.File]::ReadAllText($manifestPath)
$new = [regex]::Replace($json, '("version"\s*:\s*")[^"]*"', "`${1}$Version`"")
if ($new -notmatch [regex]::Escape("""version"": ""$Version""")) {
    throw 'Could not set version in manifest.json'
}
[IO.File]::WriteAllText($manifestPath, $new, (New-Object System.Text.UTF8Encoding($false)))

# Files to include, as paths relative to this folder.
$files = @('manifest.json', 'background.js') +
    (Get-ChildItem -Path icons -File -Recurse | ForEach-Object {
        $_.FullName.Substring($PSScriptRoot.Length + 1)
    })

$dist = Join-Path $PSScriptRoot 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$out = Join-Path $dist "file-by-tag-$Version.xpi"
if (Test-Path $out) { Remove-Item $out }

$zip = [IO.Compression.ZipFile]::Open($out, [IO.Compression.ZipArchiveMode]::Create)
try {
    foreach ($f in $files) {
        $entry = $f -replace '\\', '/'
        [IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $zip, (Join-Path $PSScriptRoot $f), $entry,
            [IO.Compression.CompressionLevel]::Optimal) | Out-Null
    }
}
finally {
    $zip.Dispose()
}

Write-Host "Packed $out"
$files | ForEach-Object { Write-Host "  $($_ -replace '\\', '/')" }
