$ErrorActionPreference = 'Stop'

$containerName = 'fastlane-admin-product-summary-benchmark'
$sqlPath = Join-Path $PSScriptRoot 'benchmark-admin-product-summary.sql'

try { docker rm -f $containerName 2>$null | Out-Null } catch { }
docker run --name $containerName --detach --env POSTGRES_PASSWORD=benchmark --publish 55439:5432 postgres:16-alpine | Out-Null

try {
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    $ready = docker exec $containerName pg_isready -U postgres 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    Start-Sleep -Seconds 1
  }

  if ($LASTEXITCODE -ne 0) {
    throw 'PostgreSQL benchmark container did not become ready.'
  }

  Get-Content -Raw $sqlPath | docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1
  if ($LASTEXITCODE -ne 0) {
    throw 'PostgreSQL benchmark failed.'
  }
}
finally {
  try { docker rm -f $containerName 2>$null | Out-Null } catch { }
}
