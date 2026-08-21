# Build a proper multi-size .ico from the 600x600 logo PNG.
#
# A Windows shortcut wants an .ico, and it wants several sizes inside it: the
# desktop draws 48px, the taskbar 32, Alt-Tab 256. Handing it one big image and
# letting Windows downscale gives the soft, muddy icon that marks a program out
# as homemade.
#
# The entries are stored as PNG rather than as classic DIB+mask, which Windows
# has supported since Vista and which keeps the alpha channel intact without
# hand-rolling an AND mask.

Add-Type -AssemblyName System.Drawing

$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$source = Join-Path $here '..\public\core-fitness-logo.png'
$out    = Join-Path $here 'core-fitness-admin.ico'

if (-not (Test-Path $source)) { throw "Logo not found: $source" }

$src = [System.Drawing.Image]::FromFile((Resolve-Path $source))
$sizes = @(16, 32, 48, 64, 128, 256)
$frames = @()

foreach ($s in $sizes) {
  $bmp = New-Object System.Drawing.Bitmap($s, $s)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $g.DrawImage($src, (New-Object System.Drawing.Rectangle(0, 0, $s, $s)))
  $g.Dispose()

  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $frames += , @{ Size = $s; Bytes = $ms.ToArray() }
  $ms.Dispose(); $bmp.Dispose()
}
$src.Dispose()

$fs = [System.IO.File]::Create($out)
$bw = New-Object System.IO.BinaryWriter($fs)

# ICONDIR
$bw.Write([UInt16]0)                 # reserved
$bw.Write([UInt16]1)                 # 1 = icon
$bw.Write([UInt16]$frames.Count)

# Each ICONDIRENTRY is 16 bytes and they all sit before the image data.
$offset = 6 + (16 * $frames.Count)
foreach ($f in $frames) {
  # 256 is stored as 0 — the field is a single byte.
  $dim = if ($f.Size -ge 256) { 0 } else { $f.Size }
  $bw.Write([Byte]$dim)              # width
  $bw.Write([Byte]$dim)              # height
  $bw.Write([Byte]0)                 # palette size (0 = truecolour)
  $bw.Write([Byte]0)                 # reserved
  $bw.Write([UInt16]1)               # colour planes
  $bw.Write([UInt16]32)              # bits per pixel
  $bw.Write([UInt32]$f.Bytes.Length)
  $bw.Write([UInt32]$offset)
  $offset += $f.Bytes.Length
}
foreach ($f in $frames) { $bw.Write($f.Bytes) }

$bw.Flush(); $bw.Close(); $fs.Close()

$info = Get-Item $out
Write-Output ("icon: {0} ({1:N1} KB, {2} sizes: {3})" -f $info.Name, ($info.Length / 1KB), $frames.Count, ($sizes -join '/'))
