$url = "https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
$zipPath = "C:\Users\n1150\.gemini\antigravity\scratch\reverse-studio-pro\bin\ffmpeg.zip"
$targetDir = "C:\Users\n1150\.gemini\antigravity\scratch\reverse-studio-pro\bin"

Write-Host "Downloading FFmpeg from $url..."
Invoke-WebRequest -Uri $url -OutFile $zipPath -UserAgent "PowerShell"
Write-Host "Download complete. Extracting ffmpeg.exe and ffprobe.exe..."

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
foreach ($entry in $zip.Entries) {
    if ($entry.Name -eq "ffmpeg.exe" -or $entry.Name -eq "ffprobe.exe") {
        $destPath = Join-Path $targetDir $entry.Name
        Write-Host "Extracting $($entry.Name) to $destPath"
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
    }
}
$zip.Dispose()
Remove-Item $zipPath -Force
Write-Host "Done! Extracted FFmpeg binaries."
