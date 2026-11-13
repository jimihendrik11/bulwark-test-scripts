param([string]$Report = "CR-1029")

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not $env:RPC_URL) {
  Write-Error "RPC_URL is not set. Point it at an Ethereum archive endpoint."
}

$config = Get-Content "reports/$Report/config.json" -Raw | ConvertFrom-Json
$forkBlock = $config.forkBlock

Write-Host "report $Report | fork block $forkBlock"
New-Item -ItemType Directory -Force -Path out | Out-Null
forge test --fork-url $env:RPC_URL --fork-block-number $forkBlock -vv
node script/report.mjs --report $Report --compare
