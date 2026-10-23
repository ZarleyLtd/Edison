param(
  [Parameter(Mandatory = $true)]
  [string]$Repo,
  [Parameter(Mandatory = $true)]
  [int]$Number,
  [string]$Page = 'index.html'
)

$ErrorActionPreference = 'Stop'

if ($Repo -notmatch '^[A-Za-z0-9_.-]{1,100}$') {
  Write-Error 'Repository name must use letters, numbers, dots, underscores, or hyphens.'
  exit 1
}

$root = 'C:\CursorSites'
$clone = Join-Path $root $Repo
$appsPath = Join-Path $PSScriptRoot '..\apps.json'
if (Test-Path $appsPath) {
  $apps = Get-Content $appsPath -Raw | ConvertFrom-Json
  foreach ($app in $apps) {
    if ($app.repo -eq $Repo -and $app.localPath) {
      $clone = $app.localPath
      break
    }
  }
}

if (-not (Test-Path (Join-Path $clone '.git'))) {
  Write-Error "No git clone at $clone. Clone the app onto this PC first."
  exit 1
}

$pr = gh pr view $Number --repo "ZarleyLtd/$Repo" --json headRefName,state | ConvertFrom-Json
if ($pr.state -ne 'OPEN') {
  Write-Error "Pull request #$Number is $($pr.state)."
  exit 1
}

$branch = $pr.headRefName
git -C $clone fetch origin $branch
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$previewRoot = Join-Path $root '_pr-previews'
$preview = Join-Path $previewRoot "$Repo-$Number"
if (Test-Path $preview) {
  git -C $preview reset --hard "origin/$branch"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
  New-Item -ItemType Directory -Force -Path $previewRoot | Out-Null
  git -C $clone worktree add --detach $preview "origin/$branch"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$pagePath = Join-Path $preview ($Page.Replace('/', '\'))
if (-not (Test-Path $pagePath)) {
  Write-Error "No $Page in $preview"
  exit 1
}

Start-Process msedge $pagePath
Write-Output "Opened $pagePath"
