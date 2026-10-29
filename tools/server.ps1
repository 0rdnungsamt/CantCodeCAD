# cantcodecad - kleiner lokaler Webserver fuer den Projektordner.
# Laeuft nur auf diesem Rechner (localhost). Fenster offen lassen, solange cantcodecad benutzt wird.
param([int]$Port = 8765, [switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $root.EndsWith('\')) { $root = $root + '\' }
# Teile und Baugruppen liegen im Ordner Projekte neben dem Programm
$proj = Join-Path $root 'Projekte\'
if (-not (Test-Path -LiteralPath $proj)) { New-Item -ItemType Directory -Path $proj | Out-Null }
# Kurzlebige Ergebnisse der lokalen Headless-Prüfstände, Schlüssel = zufälliger
# Token aus der Test-URL. Sie werden beim Abruf wieder entfernt.
$testResults = @{}

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.mjs'  = 'text/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.wasm' = 'application/wasm'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.ico'  = 'image/x-icon'
  '.md'   = 'text/plain; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
  '.cantcodecad' = 'application/json; charset=utf-8'
}

# Nesting: Ordner des Blechnestings (app.py) - tools\nester.json { "dir": "..." } oder der neueste unter Desktop\Nester
function Find-Nester {
  $cfg = Join-Path $root 'tools\nester.json'
  if (Test-Path -LiteralPath $cfg) {
    try { $d = (Get-Content -LiteralPath $cfg -Raw | ConvertFrom-Json).dir; if ($d -and (Test-Path -LiteralPath (Join-Path $d 'app.py'))) { return $d } } catch { }
  }
  $base = Join-Path $env:USERPROFILE 'Desktop\Nester'
  if (Test-Path -LiteralPath $base) {
    $hit = Get-ChildItem -LiteralPath $base -Filter 'app.py' -Recurse -File -Depth 3 -ErrorAction SilentlyContinue | Where-Object { $_.FullName -notlike '*\.venv\*' } | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($hit) { return $hit.DirectoryName }
  }
  return $null
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try {
  $listener.Start()
} catch {
  Write-Host ""
  Write-Host "Port $Port ist schon belegt. Laeuft cantcodecad vielleicht bereits in einem anderen Fenster?" -ForegroundColor Yellow
  Write-Host "Dann einfach im Browser http://localhost:$Port/ oeffnen."
  exit 1
}

$url = "http://localhost:$Port/"
Write-Host ""
Write-Host "  cantcodecad laeuft auf $url" -ForegroundColor Cyan
Write-Host "  Dieses Fenster offen lassen. Beenden mit Strg+C oder Fenster schliessen."
Write-Host ""
if (-not $NoBrowser) { Start-Process $url }

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path -eq '/__testresult') {
      $token = [string]$req.QueryString['token']
      if (-not ($token -match '^[a-zA-Z0-9-]{16,80}$')) { $res.StatusCode = 400; $res.OutputStream.Close(); continue }
      if ($req.HttpMethod -eq 'POST') {
        $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
        $body = $reader.ReadToEnd(); $reader.Close()
        if ($body.Length -gt 1048576) { $res.StatusCode = 413 } else { $testResults[$token] = $body; $res.StatusCode = 204 }
      } elseif ($req.HttpMethod -eq 'GET') {
        if ($testResults.ContainsKey($token)) {
          $bytes = [Text.Encoding]::UTF8.GetBytes([string]$testResults[$token]); $testResults.Remove($token)
          $res.StatusCode = 200; $res.ContentType = 'application/json; charset=utf-8'; $res.OutputStream.Write($bytes, 0, $bytes.Length)
        } else { $res.StatusCode = 204 }
      } else { $res.StatusCode = 405 }
      $res.Headers.Add('Cache-Control', 'no-store'); $res.OutputStream.Close(); continue
    }
    if ($req.HttpMethod -eq 'POST' -and $path -eq '/__diag') {
      # Diagnose aus dem Browser in tools\diagnose.log schreiben (max. 256 KB)
      $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $reader.Close()
      if ($body.Length -gt 65536) { $body = $body.Substring(0, 65536) }
      $logFile = Join-Path $root 'tools\diagnose.log'
      if ((Test-Path -LiteralPath $logFile) -and ((Get-Item -LiteralPath $logFile).Length -gt 262144)) { Remove-Item -LiteralPath $logFile }
      [IO.File]::AppendAllText($logFile, $body + "`r`n", (New-Object Text.UTF8Encoding($false)))
      $res.StatusCode = 204
      $res.OutputStream.Close()
      continue
    }
    if ($path -eq '/__nester') {
      # Nester finden und auf Wunsch (?start=1) ohne Fenster starten: tools\nester_bridge.py mit dem Python des Nesters
      $dir = Find-Nester
      $py = $null
      if ($dir) { $py = Join-Path $dir '.venv\Scripts\pythonw.exe'; if (-not (Test-Path -LiteralPath $py)) { $py = Join-Path $dir '.venv\Scripts\python.exe' } }
      $ok = [bool]($py -and (Test-Path -LiteralPath $py))
      $started = $false
      if ($ok -and $req.QueryString['start'] -eq '1') {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = $py
        $psi.Arguments = '"' + (Join-Path $root 'tools\nester_bridge.py') + '"'
        $psi.WorkingDirectory = $dir
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.EnvironmentVariables['NESTER_DIR'] = $dir
        $psi.EnvironmentVariables['PORT'] = '5057'
        [void][System.Diagnostics.Process]::Start($psi)
        $started = $true
      }
      $json = ConvertTo-Json -Compress -InputObject @{ dir = $dir; ok = $ok; started = $started; port = 5057 }
      $bytes = [Text.Encoding]::UTF8.GetBytes($json)
      $res.ContentType = 'application/json; charset=utf-8'
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.OutputStream.Close()
      continue
    }
    # Windows-Dateidialoge und Dateien mit vollem Pfad (Oeffnen/Speichern ausserhalb des Projektordners).
    # Nur mit Kopfzeile X-cantcodecad: fremde Webseiten koennen die ohne Rueckfrage (CORS-Vorabanfrage) nicht setzen.
    if ($path -like '/__*' -and @('/__caps', '/__dialog', '/__fread', '/__fwrite') -contains $path) {
      $out = $null; $status = 200; $type = 'application/json; charset=utf-8'
      if ($path -ne '/__caps' -and $req.Headers['X-cantcodecad'] -ne '1') { $status = 403 }
      elseif ($path -eq '/__caps') { $out = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Compress -InputObject @{ dialogs = $true; projects = $proj })) }
      elseif ($path -eq '/__dialog') {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = 'powershell.exe'
        $psi.Arguments = '-NoProfile -STA -NonInteractive -ExecutionPolicy Bypass -File "' + (Join-Path $root 'tools\dialog.ps1') + '"'
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true
        $psi.RedirectStandardOutput = $true
        $psi.StandardOutputEncoding = [Text.Encoding]::UTF8
        $psi.EnvironmentVariables['CC_MODE'] = [string]$req.QueryString['mode']
        $psi.EnvironmentVariables['CC_NAME'] = [string]$req.QueryString['name']
        $psi.EnvironmentVariables['CC_DIR'] = [string]$req.QueryString['dir']
        $psi.EnvironmentVariables['CC_FILTER'] = [string]$req.QueryString['filter']
        $p = [System.Diagnostics.Process]::Start($psi)
        $chosen = $p.StandardOutput.ReadToEnd().Trim()
        $p.WaitForExit()
        if ($chosen) { $out = [Text.Encoding]::UTF8.GetBytes((ConvertTo-Json -Compress -InputObject @{ path = $chosen })) } else { $out = [Text.Encoding]::UTF8.GetBytes('{"path":null}') }
      }
      else {
        $fp = [string]$req.QueryString['path']
        $okPath = $fp -and [IO.Path]::IsPathRooted($fp) -and ($fp -match '\.(cantcodecad|step|stp|stl|3mf|dxf|svg|pdf|zip|csv|webm|png)$')
        if (-not $okPath) { $status = 400 }
        elseif ($path -eq '/__fread') {
          if (Test-Path -LiteralPath $fp -PathType Leaf) { $out = [IO.File]::ReadAllBytes($fp); $type = 'application/octet-stream' } else { $status = 404 }
        }
        elseif ($req.HttpMethod -eq 'POST') {
          $ms = New-Object IO.MemoryStream
          $req.InputStream.CopyTo($ms)
          $fdir = [IO.Path]::GetDirectoryName($fp)
          if (-not (Test-Path -LiteralPath $fdir)) { New-Item -ItemType Directory -Path $fdir | Out-Null }
          [IO.File]::WriteAllBytes($fp, $ms.ToArray())
          $status = 204
        } else { $status = 405 }
      }
      $res.StatusCode = $status
      $res.Headers.Add('Cache-Control', 'no-store')
      if ($out) { $res.ContentType = $type; $res.OutputStream.Write($out, 0, $out.Length) }
      $res.OutputStream.Close()
      continue
    }
    if ($path -eq '/__files') {
      # Liste aller Teile/Baugruppen im Ordner Projekte (rekursiv)
      if (-not (Test-Path -LiteralPath $proj)) { New-Item -ItemType Directory -Path $proj | Out-Null }
      $epoch = [DateTime]::new(1970, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
      $list = @(Get-ChildItem -LiteralPath $proj -Filter '*.cantcodecad' -Recurse -File | Where-Object { $_.FullName -notlike '*\.backup\*' } | ForEach-Object {
        [pscustomobject]@{ path = $_.FullName.Substring($proj.Length).Replace('\', '/'); size = $_.Length; mtime = [long]($_.LastWriteTimeUtc - $epoch).TotalMilliseconds }
      })
      $json = ConvertTo-Json -InputObject $list -Compress
      if (-not $json) { $json = '[]' }
      $bytes = [Text.Encoding]::UTF8.GetBytes($json)
      $res.ContentType = 'application/json; charset=utf-8'
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.OutputStream.Close()
      continue
    }
    if ($req.HttpMethod -eq 'POST' -and $path -eq '/__save') {
      # Datei in den Ordner Projekte schreiben; die alte Fassung wandert nach Projekte\.backup
      $relp = [string]$req.QueryString['path']
      $target = [IO.Path]::GetFullPath((Join-Path $proj $relp.Replace('/', '\')))
      if (-not $target.StartsWith($proj, [StringComparison]::OrdinalIgnoreCase) -or -not $target.EndsWith('.cantcodecad', [StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 400
        $res.OutputStream.Close()
        continue
      }
      $reader = New-Object IO.StreamReader($req.InputStream, [Text.Encoding]::UTF8)
      $body = $reader.ReadToEnd()
      $reader.Close()
      $dir = [IO.Path]::GetDirectoryName($target)
      if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir | Out-Null }
      if (Test-Path -LiteralPath $target) {
        $bdir = Join-Path $proj '.backup'
        if (-not (Test-Path -LiteralPath $bdir)) { New-Item -ItemType Directory -Path $bdir | Out-Null }
        $stamp = (Get-Date).ToString('yyyyMMdd-HHmmss')
        Copy-Item -LiteralPath $target -Destination (Join-Path $bdir ([IO.Path]::GetFileNameWithoutExtension($target) + '-' + $stamp + '.cantcodecad'))
      }
      [IO.File]::WriteAllText($target, $body, (New-Object Text.UTF8Encoding($false)))
      $res.StatusCode = 204
      $res.OutputStream.Close()
      continue
    }
    # Bibliotheken ausschließlich aus dem mitgelieferten vendor\-Ordner laden.
    # Es gibt bewusst keinen Netz-Fallback: cantcodecad bleibt auch beim allerersten
    # Start offline und meldet fehlende Build-Artefakte klar als 404.
    $raw = $req.Url.AbsolutePath
    $key = $null; $kind = 'cdn'
    if ($raw.StartsWith('/cdn/')) { $key = 'jsdelivr/' + $raw.Substring(5) }
    elseif ($raw.StartsWith('/npm/')) { $key = 'jsdelivr' + $raw }
    elseif ($raw.StartsWith('/gfonts/')) {
      $q = $req.Url.Query
      $h = [BitConverter]::ToString((New-Object Security.Cryptography.SHA1Managed).ComputeHash([Text.Encoding]::UTF8.GetBytes($q))).Replace('-', '').Substring(0, 16).ToLower()
      $key = 'gfonts/' + $raw.Substring(8) + '__' + $h + '.css'; $kind = 'css'
    }
    elseif ($raw.StartsWith('/gstatic/')) { $key = 'gstatic/' + $raw.Substring(9); $kind = 'font' }
    if ($key) {
      $vend = Join-Path $root 'vendor\'
      $file = [IO.Path]::GetFullPath((Join-Path $vend ([Uri]::UnescapeDataString($key).Replace('/', '\'))))
      if (-not $file.StartsWith($vend, [StringComparison]::OrdinalIgnoreCase)) { $res.StatusCode = 400; $res.OutputStream.Close(); continue }
      try {
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { $res.StatusCode = 404; $res.OutputStream.Close(); continue }
        $bytes = [IO.File]::ReadAllBytes($file)
        $ext = [IO.Path]::GetExtension($file).ToLowerInvariant()
        if ($kind -eq 'css') { $ct = 'text/css; charset=utf-8' }
        elseif ($ext -eq '.wasm') { $ct = 'application/wasm' }
        elseif ($ext -eq '.ttf') { $ct = 'font/ttf' }
        elseif ($ext -eq '.woff2') { $ct = 'font/woff2' }
        else { $ct = 'text/javascript; charset=utf-8' }
        $res.ContentType = $ct
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
      } catch {
        $res.StatusCode = 502
      }
      $res.OutputStream.Close()
      continue
    }
    if ($path -eq '/' -or $path -eq '') { $path = '/index.html' }
    $rel = $path.TrimStart('/').Replace('/', '\')
    $full = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($full.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $full -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($full)
      $ext = [IO.Path]::GetExtension($full).ToLowerInvariant()
      if ($mime.ContainsKey($ext)) { $res.ContentType = $mime[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $res.Headers.Add('Cache-Control', 'no-store')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $msg = [Text.Encoding]::UTF8.GetBytes('Nicht gefunden')
      $res.OutputStream.Write($msg, 0, $msg.Length)
    }
    $res.OutputStream.Close()
  } catch {
    # Verbindung vom Browser abgebrochen - weitermachen
  }
}
