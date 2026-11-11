$url = "https://github.com/FFmpeg-Builds/FFmpeg-Builds/releases/download/latest/ffmpeg-master-latest-win64-gpl.zip"
$zipPath = "C:\Users\n1150\.gemini\antigravity\scratch\reverse-studio-pro\bin\ffmpeg.zip"
$targetDir = "C:\Users\n1150\.gemini\antigravity\scratch\reverse-studio-pro\bin"

Write-Host "Downloading via curl.exe..."
& curl.exe -L -o $zipPath $url

if (Test-Path $zipPath) {
    $size = (Get-Item $zipPath).Length
    Write-Host "Downloaded size: $size bytes. Extracting..."
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
    foreach ($entry in $zip.Entries) {
        if ($entry.Name -eq "ffmpeg.exe" -or $entry.Name -eq "ffprobe.exe") {
            $destPath = Join-Path $targetDir $entry.Name
            Write-Host "Extracting $($entry.Name)..."
            [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destPath, $true)
        }
    }
    $zip.Dispose()
    Remove-Item $zipPath -Force
    Write-Host "FFmpeg & FFprobe installed successfully!"
} else {
    Write-Error "Download failed!"
}
