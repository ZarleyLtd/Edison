<#
.SYNOPSIS
  Sets the CLAUDE_CODE_OAUTH_TOKEN Actions secret on Edison's app repos.

.DESCRIPTION
  Get the token first with `claude setup-token`. This script asks for it
  without echoing, then pipes it to `gh secret set` for each repo, so it
  never appears on screen, in history or in a file. ZarleyLtd is a user
  account, so there are no org-wide secrets; each repo needs its own copy.
  Re-run it whenever the token is renewed.

.EXAMPLE
  .\tools\set-claude-secret.ps1
  .\tools\set-claude-secret.ps1 -Repos HelloWorldCursor
#>
param(
  [string[]]$Repos,
  [string]$Owner = 'ZarleyLtd'
)

$ErrorActionPreference = 'Stop'
$legacy = @('4NextDart', '4NextTram', '4NextLocalTrain')

if (-not $Repos) {
  $apps = Get-Content -Raw -Path (Join-Path $PSScriptRoot '..\apps.json') | ConvertFrom-Json
  $Repos = $apps | Where-Object { $_.repo -and ($legacy -notcontains $_.repo) } | ForEach-Object { $_.repo }
}

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'Install the GitHub CLI (gh) and run gh auth login first.' }

$secure = Read-Host -AsSecureString -Prompt 'Paste the token from claude setup-token'
$plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if (-not $plain -or $plain.Trim().Length -lt 20) { throw 'That does not look like a token.' }
$plain = $plain.Trim()

$failed = @()
foreach ($repo in $Repos) {
  $plain | gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo "$Owner/$repo" | Out-Null
  if ($LASTEXITCODE -eq 0) { Write-Host "  set  $repo" -ForegroundColor Green }
  else { Write-Host "  FAIL $repo" -ForegroundColor Red; $failed += $repo }
}
$plain = $null

if ($failed.Count) { Write-Host "Failed: $($failed -join ', ')" -ForegroundColor Red; exit 1 }
Write-Host "Done. $($Repos.Count) repos have CLAUDE_CODE_OAUTH_TOKEN."
