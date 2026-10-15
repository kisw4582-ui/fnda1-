<#
  CSV -> data.js 변환 스크립트
  사용법: PowerShell에서 web 폴더 기준으로 실행
    powershell -ExecutionPolicy Bypass -File .\build-data.ps1
  입력 : ..\수퍼마켓_8개매장_추출 (2).csv
  출력 : .\data.js  (window.STORES 배열)
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }
$csv = Get-ChildItem -LiteralPath (Split-Path -Parent $PSCommandPath | Split-Path -Parent) -Filter '수퍼마켓_8개매장_추출*.csv' | Select-Object -First 1
if (-not $csv) { throw 'CSV 파일을 찾을 수 없습니다.' }

$rows = Import-Csv -LiteralPath $csv.FullName -Encoding UTF8
$list = New-Object System.Collections.Generic.List[object]
$skipped = 0
foreach ($r in $rows) {
    $lng = 0.0; $lat = 0.0
    $okLng = [double]::TryParse($r.'경도', [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lng)
    $okLat = [double]::TryParse($r.'위도', [Globalization.NumberStyles]::Float, [Globalization.CultureInfo]::InvariantCulture, [ref]$lat)
    if (-not ($okLng -and $okLat)) { $skipped++; continue }
    $list.Add([ordered]@{
        id     = $r.'상가업소번호'
        name   = $r.'상호명'
        branch = $r.'지점명'
        gu     = $r.'시군구명'
        dong   = $r.'행정동명'
        road   = $r.'도로명주소'
        jibun  = $r.'지번주소'
        zip    = $r.'신우편번호'
        kind   = $r.'상권업종소분류명'
        std    = $r.'표준산업분류명'
        bldg   = $r.'건물명'
        floor  = $r.'층정보'
        lng    = $lng
        lat    = $lat
    })
}

$json = ConvertTo-Json -InputObject $list.ToArray() -Compress -Depth 4
$out = "// 자동 생성 파일 (build-data.ps1). 원본: $($csv.Name)`n" +
       "window.STORES = $json;`n" +
       "window.STORES_SKIPPED = $skipped;`n"
$dest = Join-Path $PSScriptRoot 'data.js'
[System.IO.File]::WriteAllText($dest, $out, (New-Object System.Text.UTF8Encoding($false)))
Write-Output "OK: $($list.Count)건 변환, 좌표 누락 제외 $($skipped)건 -> $dest"
