param(
	[int]$HostPort = 5433,
	[string]$ContainerName = "togetha-postgres",
	[string]$Image = "pgvector/pgvector:pg17",
	[string]$DbName = "Togetha",
	[string]$DbUser = "Togetha",
	[string]$DbPassword = "lol",
	[string]$VolumeName = "togetha-postgres-data"
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

Write-Host "==> Ensuring Postgres container '$ContainerName' is running on port $HostPort" -ForegroundColor Cyan

function Test-Command($name) {
	return Get-Command $name -ErrorAction SilentlyContinue
}

if (-not (Test-Command docker)) {
	throw "Docker is not installed or not on PATH. Please install Docker Desktop and retry."
}

# Create a named volume for data persistence if not exists
$volumeExists = (docker volume ls --format '{{.Name}}' | Where-Object { $_ -eq $VolumeName })
if (-not $volumeExists) {
	Write-Host "Creating Docker volume $VolumeName" -ForegroundColor Yellow
	docker volume create $VolumeName | Out-Null
}

# Check if container exists
$exists = docker ps -a --format '{{.Names}}' | Where-Object { $_ -eq $ContainerName }
if (-not $exists) {
	Write-Host "Creating and starting new container $ContainerName" -ForegroundColor Yellow
	docker run -d --name $ContainerName `
		-e POSTGRES_USER=$DbUser `
		-e POSTGRES_PASSWORD=$DbPassword `
		-e POSTGRES_DB=$DbName `
		-p ${HostPort}:5432 `
		-v ${VolumeName}:/var/lib/postgresql/data `
		$Image | Out-Null
} else {
	# If exists but not running, start it
	$status = docker inspect -f '{{.State.Running}}' $ContainerName 2>$null
	if ($status -ne 'true') {
		Write-Host "Starting existing container $ContainerName" -ForegroundColor Yellow
		docker start $ContainerName | Out-Null
	}
}

# Wait until container is accepting connections on the mapped port
Write-Host "Waiting for Postgres to be ready on localhost:$HostPort ..." -ForegroundColor Yellow
$maxTries = 20
for ($i = 0; $i -lt $maxTries; $i++) {
	try {
		$client = New-Object System.Net.Sockets.TcpClient
		$iar = $client.BeginConnect('127.0.0.1', $HostPort, $null, $null)
		$success = $iar.AsyncWaitHandle.WaitOne(1000)
		$client.Close()
		if ($success) { break }
	} catch {}
}
if ($i -ge $maxTries) {
	throw "Postgres did not become ready on port $HostPort. Check 'docker logs $ContainerName'."
}

Write-Host "Postgres is ready at localhost:$HostPort (container: $ContainerName)" -ForegroundColor Green
