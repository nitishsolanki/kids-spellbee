$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $root -ErrorAction Stop
# Trust only this checkout for this process, including Git spawned by gh.
$configIndex = 0
if ($env:GIT_CONFIG_COUNT) { $configIndex = [int]$env:GIT_CONFIG_COUNT }
Set-Item -LiteralPath "Env:GIT_CONFIG_KEY_$configIndex" -Value 'safe.directory'
Set-Item -LiteralPath "Env:GIT_CONFIG_VALUE_$configIndex" -Value $root
$env:GIT_CONFIG_COUNT = [string]($configIndex + 1)
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'Run gh auth login --hostname github.com, then run this script again.' }
$owner = & gh api user --jq .login
if ($LASTEXITCODE -ne 0) { throw 'Could not read your GitHub account.' }
$repo = "$owner/kids-spellbee"
& git rev-parse --git-dir 2>$null
if ($LASTEXITCODE -ne 0) { & git init -b main; if ($LASTEXITCODE -ne 0) { throw 'Git initialization failed.' } }
& git add .
if ($LASTEXITCODE -ne 0) { throw 'Could not stage app files.' }
& git diff --cached --quiet
if ($LASTEXITCODE -eq 1) { & git commit -m 'Build Little Bee Python spelling practice app'; if ($LASTEXITCODE -ne 0) { throw 'Git commit failed. Configure your Git name and email, then retry.' } }
& gh repo view $repo --json name 2>$null
if ($LASTEXITCODE -ne 0) {
  & gh repo create $repo --public --source . --remote origin --push --description 'Little Bee: Python-powered spelling practice and mini contests for kids'
  if ($LASTEXITCODE -ne 0) { throw 'Repository creation failed.' }
} else {
  $origin = & git remote get-url origin 2>$null
  if ($LASTEXITCODE -ne 0 -or $origin -notmatch ('github.com[:/]' + [regex]::Escape($repo) + '(\.git)?$')) { throw "Repository already exists. Verify it and configure origin to https://github.com/$repo.git before retrying." }
  & git push -u origin main
  if ($LASTEXITCODE -ne 0) { throw 'Push failed.' }
}
& gh api "repos/$repo/pages" --silent 2>$null
if ($LASTEXITCODE -ne 0) {
  '{"source":{"branch":"main","path":"/docs"}}' | & gh api "repos/$repo/pages" --method POST --input -
  if ($LASTEXITCODE -ne 0) { throw 'Could not enable GitHub Pages. In repository Settings > Pages, select main and /docs.' }
}
Write-Output "Repository: https://github.com/$repo"
Write-Output "Pages address (allow time for the first build): https://$owner.github.io/kids-spellbee/"
