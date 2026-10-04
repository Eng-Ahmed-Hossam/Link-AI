# Synthetic bench audio with the local Windows voice (ar-EG "Hoda", OneCore): nothing leaves the
# machine. Writes bench/audio/<id>.wav for every note in bench/sentences.json. Bench only — the gold
# set (evals/gold, Codex track) is recorded by people.
#   powershell -ExecutionPolicy Bypass -File scripts/make_bench_audio.ps1
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$null = [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime]
$null = [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime]
$asTask = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
    $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
  })[0]
function Await($op, [Type]$t) { $task = $asTask.MakeGenericMethod($t).Invoke($null, @($op)); $task.Wait(-1) | Out-Null; $task.Result }

$root = Split-Path -Parent $PSScriptRoot
$json = Get-Content -Raw -Encoding UTF8 (Join-Path $root 'bench\sentences.json') | ConvertFrom-Json
$out = Join-Path $root 'bench\audio'
New-Item -ItemType Directory -Force $out | Out-Null
$synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
$voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices | Where-Object { $_.Language -eq 'ar-EG' } | Select-Object -First 1
if (-not $voice) { throw 'No ar-EG voice installed (Settings > Time & language > Speech > Add voices > Arabic (Egypt)).' }
$synth.Voice = $voice
foreach ($n in $json.notes) {
  $file = Join-Path $out "$($n.id).wav"
  if (Test-Path $file) { continue }
  $stream = Await ($synth.SynthesizeTextToStreamAsync($n.text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $reader = New-Object Windows.Storage.Streams.DataReader($stream.GetInputStreamAt(0))
  $size = [uint32]$stream.Size
  Await ($reader.LoadAsync($size)) ([uint32]) | Out-Null
  $bytes = New-Object byte[] $size
  $reader.ReadBytes($bytes)
  [System.IO.File]::WriteAllBytes($file, $bytes)
  Write-Output "$($n.id).wav $([math]::Round($size / 1KB)) KB"
}
