param([string]$hash = 'qd', [string]$out = 'shot.png', [int]$w = 1600, [int]$h = 900)
$e = "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
$o = Join-Path (Get-Location) $out
if (Test-Path $o) { Remove-Item $o }
$p = Start-Process $e -ArgumentList "--headless", "--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--hide-scrollbars", "--window-size=$w,$h", "--virtual-time-budget=9000", "--user-data-dir=$env:TEMP\edge-tl", "--screenshot=$o", "http://localhost:5193/#$hash" -Wait -PassThru
Write-Output "exit $($p.ExitCode) $(Test-Path $o)"
