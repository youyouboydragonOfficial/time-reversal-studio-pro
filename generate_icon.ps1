Add-Type -AssemblyName System.Drawing

$assetsDir = "C:\Users\n1150\.gemini\antigravity\scratch\reverse-studio-pro\src\assets"
if (!(Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir -Force
}

$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

# Background dark gradient
$p1 = New-Object System.Drawing.Point 0, 0
$p2 = New-Object System.Drawing.Point 256, 256
$c1 = [System.Drawing.Color]::FromArgb(255, 11, 15, 25)
$c2 = [System.Drawing.Color]::FromArgb(255, 24, 32, 54)
$brushBg = New-Object System.Drawing.Drawing2D.LinearGradientBrush $p1, $p2, $c1, $c2
$g.FillRectangle($brushBg, 0, 0, 256, 256)

# Outer glowing ring
$penOuter = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(180, 6, 182, 212)), 6
$g.DrawEllipse($penOuter, 28, 28, 200, 200)

# Inner accent arc
$penArc = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 168, 85, 247)), 10
$g.DrawArc($penArc, 48, 48, 160, 160, 45, 270)

# Rewind double triangles
$brushTri = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 34, 211, 238))
$pt1_1 = New-Object System.Drawing.Point 134, 128
$pt1_2 = New-Object System.Drawing.Point 178, 96
$pt1_3 = New-Object System.Drawing.Point 178, 160
$tri1 = [System.Drawing.Point[]]@($pt1_1, $pt1_2, $pt1_3)

$pt2_1 = New-Object System.Drawing.Point 84, 128
$pt2_2 = New-Object System.Drawing.Point 128, 96
$pt2_3 = New-Object System.Drawing.Point 128, 160
$tri2 = [System.Drawing.Point[]]@($pt2_1, $pt2_2, $pt2_3)

$g.FillPolygon($brushTri, $tri1)
$g.FillPolygon($brushTri, $tri2)

$outPath = Join-Path $assetsDir "icon.png"
$bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
Write-Host "Icon saved at $outPath"
