# Upload Days 15-30 audio to Supabase Storage bucket lesson-audio.
# Source files are flat in the Grant 015-030 folder; destination uses lesson_XX/ subfolders.
# lesson_21_seg_02 does not exist — Day 21 only has seg_01.

$ErrorActionPreference = "Stop"
$src = "C:\Users\rkuma\Downloads\RELENTLESS\CONTENT\Grant 015-030"
$bucket = "lesson-audio"

# Map: local filename (case-as-on-disk) -> storage path
$uploads = @(
    @{ local = "lesson_15_seg_01.MP3"; remote = "lesson_15/lesson_15_seg_01.mp3" },
    @{ local = "lesson_15_seg_02.MP3"; remote = "lesson_15/lesson_15_seg_02.mp3" },
    @{ local = "lesson_16_seg_01.MP3"; remote = "lesson_16/lesson_16_seg_01.mp3" },
    @{ local = "lesson_16_seg_02.MP3"; remote = "lesson_16/lesson_16_seg_02.mp3" },
    @{ local = "lesson_17_seg_01.MP3"; remote = "lesson_17/lesson_17_seg_01.mp3" },
    @{ local = "lesson_17_seg_02.MP3"; remote = "lesson_17/lesson_17_seg_02.mp3" },
    @{ local = "lesson_18_seg_01.MP3"; remote = "lesson_18/lesson_18_seg_01.mp3" },
    @{ local = "lesson_18_seg_02.MP3"; remote = "lesson_18/lesson_18_seg_02.mp3" },
    @{ local = "lesson_19_seg_01.MP3"; remote = "lesson_19/lesson_19_seg_01.mp3" },
    @{ local = "lesson_19_seg_02.MP3"; remote = "lesson_19/lesson_19_seg_02.mp3" },
    @{ local = "lesson_20_seg_01.MP3"; remote = "lesson_20/lesson_20_seg_01.mp3" },
    @{ local = "lesson_20_seg_02.MP3"; remote = "lesson_20/lesson_20_seg_02.mp3" },
    @{ local = "lesson_21_seg_01.MP3"; remote = "lesson_21/lesson_21_seg_01.mp3" },
    # lesson_21_seg_02 intentionally omitted — file not present
    @{ local = "lesson_22_seg_01.MP3"; remote = "lesson_22/lesson_22_seg_01.mp3" },
    @{ local = "lesson_22_seg_02.MP3"; remote = "lesson_22/lesson_22_seg_02.mp3" },
    @{ local = "lesson_23_seg_01.MP3"; remote = "lesson_23/lesson_23_seg_01.mp3" },
    @{ local = "lesson_23_seg_02.MP3"; remote = "lesson_23/lesson_23_seg_02.mp3" },
    @{ local = "lesson_24_seg_01.MP3"; remote = "lesson_24/lesson_24_seg_01.mp3" },
    @{ local = "lesson_24_seg_02.MP3"; remote = "lesson_24/lesson_24_seg_02.mp3" },
    @{ local = "lesson_25_seg_01.mp3"; remote = "lesson_25/lesson_25_seg_01.mp3" },
    @{ local = "lesson_25_seg_02.mp3"; remote = "lesson_25/lesson_25_seg_02.mp3" },
    @{ local = "lesson_26_seg_01.mp3"; remote = "lesson_26/lesson_26_seg_01.mp3" },
    @{ local = "lesson_26_seg_02.mp3"; remote = "lesson_26/lesson_26_seg_02.mp3" },
    @{ local = "lesson_27_seg_01.mp3"; remote = "lesson_27/lesson_27_seg_01.mp3" },
    @{ local = "lesson_27_seg_02.mp3"; remote = "lesson_27/lesson_27_seg_02.mp3" },
    @{ local = "lesson_28_seg_01.mp3"; remote = "lesson_28/lesson_28_seg_01.mp3" },
    @{ local = "lesson_28_seg_02.mp3"; remote = "lesson_28/lesson_28_seg_02.mp3" },
    @{ local = "lesson_29_seg_01.mp3"; remote = "lesson_29/lesson_29_seg_01.mp3" },
    @{ local = "lesson_29_seg_02.mp3"; remote = "lesson_29/lesson_29_seg_02.mp3" },
    @{ local = "lesson_30_seg_01.mp3"; remote = "lesson_30/lesson_30_seg_01.mp3" },
    @{ local = "lesson_30_seg_02.mp3"; remote = "lesson_30/lesson_30_seg_02.mp3" }
)

$total = $uploads.Count
$i = 0
foreach ($u in $uploads) {
    $i++
    $localFull = Join-Path $src $u.local
    $remoteFull = "ss:///$bucket/$($u.remote)"
    Write-Host "[$i/$total] $($u.remote)"
    npx supabase storage cp "$localFull" "$remoteFull" --experimental --yes 2>&1
}
Write-Host "Done. $total files uploaded."
