# cantcodecad: Windows-Dateidialog (Oeffnen / Speichern unter) fuer den lokalen Server.
# Eingaben ueber Umgebungsvariablen: CC_MODE (open|save), CC_NAME (Vorschlag), CC_DIR (Startordner), CC_FILTER.
# Ausgabe: gewaehlter Pfad (UTF-8) oder nichts (abgebrochen). Muss im STA-Modus laufen (powershell -STA).
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$mode = $env:CC_MODE
$name = $env:CC_NAME
$dir = $env:CC_DIR
$filter = $env:CC_FILTER
if (-not $filter) { $filter = 'cantcodecad (*.cantcodecad)|*.cantcodecad|Alle Dateien (*.*)|*.*' }
if ($mode -eq 'save') {
  $d = New-Object System.Windows.Forms.SaveFileDialog
  $d.OverwritePrompt = $true
  $d.AddExtension = $true
} else {
  $d = New-Object System.Windows.Forms.OpenFileDialog
  $d.CheckFileExists = $true
}
$d.Filter = $filter
if ($name) { $d.FileName = $name }
if ($dir -and (Test-Path -LiteralPath $dir)) { $d.InitialDirectory = $dir }
# unsichtbares Fenster ganz vorn als Besitzer, damit der Dialog nicht hinter cantcodecad aufgeht
$owner = New-Object System.Windows.Forms.Form
$owner.TopMost = $true
$owner.ShowInTaskbar = $false
$owner.StartPosition = 'CenterScreen'
$owner.Size = New-Object System.Drawing.Size(1, 1)
$owner.Opacity = 0
$owner.Show()
$owner.Activate()
if ($d.ShowDialog($owner) -eq [System.Windows.Forms.DialogResult]::OK) { [Console]::Out.Write($d.FileName) }
$owner.Close()
