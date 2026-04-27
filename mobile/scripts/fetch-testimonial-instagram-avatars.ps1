# Re-download bundled testimonial avatars from Instagram's public profile_info API.
# Handles must match each athlete's Instagram username (see lsusports / opendorse).
#
# Svenya Stoyanoff is intentionally omitted: use the official LSU TF roster photo
# (jersey) — e.g. download
#   https://storage.googleapis.com/lsusports-com/2025/08/f45e0929-svenya_stoyanoff_2025.jpg
# to assets/images/testimonials/svenya-stoyanoff.jpg
$ErrorActionPreference = 'Stop'
$dest = Join-Path $PSScriptRoot '..\assets\images\testimonials'
$hdr = @{ 'User-Agent' = 'Instagram 219.0.0.12.117 Android' }
$rows = @(
  @{ user = 'swanson_49'; file = 'mats-swanson.jpg' },
  @{ user = 'nikoschultzzz'; file = 'niko-schultz.jpg' },
  @{ user = 'bkelly5192'; file = 'brock-kelly.jpg' },
  @{ user = 'deaubomingue'; file = 'beau-domingue.jpg' }
)
foreach ($row in $rows) {
  $j = Invoke-RestMethod -Uri "https://i.instagram.com/api/v1/users/web_profile_info/?username=$($row.user)" -Headers $hdr -TimeoutSec 30
  $url = $j.data.user.profile_pic_url_hd
  if (-not $url) { $url = $j.data.user.profile_pic_url }
  $out = Join-Path $dest $row.file
  Invoke-WebRequest -Uri $url -OutFile $out -Headers $hdr -TimeoutSec 35
  Write-Host "Wrote $out ($((Get-Item $out).Length) bytes)"
  Start-Sleep -Milliseconds 800
}
