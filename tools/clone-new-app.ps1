param(
  [Parameter(Mandatory = $true)]
  [string]$Name
)

if ($Name -notmatch '^[A-Za-z0-9_.-]{1,100}$') {
  Write-Error "Repository name must use letters, numbers, dots, underscores, or hyphens."
  exit 1
}

$dest = Join-Path 'C:\CursorSites' $Name
if (Test-Path $dest) {
  Write-Error "Already exists: $dest"
  exit 1
}

git clone "https://github.com/ZarleyLtd/$Name.git" $dest
