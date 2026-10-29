# Verknuepfungen fuer cantcodecad.exe im Startmenue und auf dem Desktop anlegen
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$exe = Join-Path $root 'cantcodecad.exe'
if (-not (Test-Path -LiteralPath $exe)) { exit 0 }
$sh = New-Object -ComObject WScript.Shell
foreach ($dir in @([Environment]::GetFolderPath('Programs'), [Environment]::GetFolderPath('Desktop'))) {
  $lnk = $sh.CreateShortcut((Join-Path $dir 'cantcodecad.lnk'))
  $lnk.TargetPath = $exe
  $lnk.WorkingDirectory = $root
  $lnk.IconLocation = $exe + ',0'
  $lnk.Description = 'cantcodecad - parametrisches CAD'
  $lnk.Save()
}
Write-Host 'Verknuepfungen im Startmenue und auf dem Desktop angelegt.'
