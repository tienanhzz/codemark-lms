$ErrorActionPreference='Stop'
$projectRoot=[System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$zipPath=Join-Path $projectRoot 'out/CodeMark-LMS-rank.zip'
New-Item -ItemType Directory -Force (Join-Path $projectRoot 'out') | Out-Null
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression
$zipStream=[System.IO.File]::Open($zipPath,[System.IO.FileMode]::Create,[System.IO.FileAccess]::Write)
$archive=[System.IO.Compression.ZipArchive]::new($zipStream,[System.IO.Compression.ZipArchiveMode]::Create)
try {
  $roots=@('backend/src','backend/sandbox','frontend/app','frontend/components','frontend/lib','frontend/public','scripts','docs','.github')
  $files=@()
  foreach($relative in $roots) { $files+=Get-ChildItem -LiteralPath (Join-Path $projectRoot $relative) -Recurse -File }
  foreach($relative in @('README.md','SPECIFICATION.md','package.json','package-lock.json','.gitignore','.env.example','backend/pom.xml','frontend/package.json','frontend/tsconfig.json','frontend/next-env.d.ts','frontend/next.config.mjs','frontend/tailwind.config.ts','frontend/postcss.config.js')) {
    $files+=Get-Item -LiteralPath (Join-Path $projectRoot $relative)
  }
  foreach($file in $files) {
    $entryName=$file.FullName.Substring($projectRoot.Length+1).Replace('\','/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$file.FullName,$entryName,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
} finally { $archive.Dispose() }
$check=[System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  if($check.Entries.FullName -contains '.env' -or @($check.Entries | Where-Object { $_.FullName -match '(^|/)(node_modules|instance|\.git)/|\.mv\.db$' }).Count -gt 0) { throw 'ZIP chứa dữ liệu không nên phát hành' }
  Write-Output "Đã đóng gói $($check.Entries.Count) file nguồn: $zipPath"
} finally { $check.Dispose() }
