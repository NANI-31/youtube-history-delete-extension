Add-Type -AssemblyName System.Drawing
$source = "D:\Data\GitHub\youtube-history-helper\extension_icon.png"

if (Test-Path $source) {
    $img = [System.Drawing.Image]::FromFile($source)
    
    function Resize-Icon($size, $name) {
        $bmp = New-Object System.Drawing.Bitmap($size, $size)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($img, 0, 0, $size, $size)
        $g.Dispose()
        $destPath = Join-Path "D:\Data\GitHub\youtube-history-helper" $name
        $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Host "Generated $name ($size x $size)"
    }
    
    Resize-Icon 16 "icon16.png"
    Resize-Icon 32 "icon32.png"
    Resize-Icon 48 "icon48.png"
    Resize-Icon 128 "icon128.png"
    
    $img.Dispose()
    Write-Host "All icons generated successfully!"
} else {
    Write-Error "Source icon not found at $source"
}
