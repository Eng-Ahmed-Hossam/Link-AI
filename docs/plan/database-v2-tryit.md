# Try the database v2 API yourself (local, sample data only)

Everything below runs on this PC against the local Docker Postgres, on the branch `db/local-v2`. Nothing touches Railway or Vercel. The commands are for **Windows PowerShell**; the sample values are fixed by the seed (`apps/core-api/seeds/demo-students.ts`) and are not secrets.

## 0. Start the local API with the sample world

```powershell
git switch db/local-v2
pnpm dev:infra                 # Postgres, Redis, sms-sink… (Docker)
pnpm db:migrate                # takes a backup into backups\ first, then applies 0020–0030
pnpm seed:demo --reset         # the demo world, with Mariam's student account
pnpm dev                       # core-api on http://localhost:4000 (and the apps)
```

To undo a migration: `pnpm db:rollback`. To go back to a backup: `pnpm db:restore backups\<file>.dump --yes`.

Helpers for the steps below:

```powershell
$api = 'http://localhost:4000'
function Call($method, $path, $token, $body) {
  $h = @{ 'accept-language' = 'en' }
  if ($token) { $h.authorization = "Bearer $token" }
  if ($method -ne 'GET') { $h['idempotency-key'] = [guid]::NewGuid().ToString() }
  $json = if ($body) { $body | ConvertTo-Json -Depth 10 } else { $null }
  Invoke-RestMethod -Method $method -Uri "$api$path" -Headers $h -ContentType 'application/json' -Body $json
}
$mariam = 'b311fda4-9186-46a4-9c0c-4c79605264c7'   # Mariam Hassan (Sec 2, National)
```

## 1. Sign in as the sample student (device + PIN)

Mariam's phone is already bound (seeded): device ID, its secret, PIN `2468`.

```powershell
$s = Call POST '/v1/auth/student/sign-in' $null @{
  deviceId = 'c3f9ba7b-88fc-40c8-ad46-3fad2d4e5640'
  deviceSecret = 'sample-device-secret-mariam-phone-0001'
  pin = '2468'
}
$st = $s.accessToken
$s.student | ConvertTo-Json -Depth 5        # her name, curriculum, school year, groups
```

Try a wrong PIN: `Call POST '/v1/auth/student/sign-in' $null @{ deviceId='c3f9ba7b-88fc-40c8-ad46-3fad2d4e5640'; deviceSecret='sample-device-secret-mariam-phone-0001'; pin='0000' }` answers `401 wrong_pin` with `triesLeft`; the 5th wrong one locks the account (`423 student_locked`) until the parent makes a new code (step 4).

## 2. What she missed, her homework, her topic scores

```powershell
(Call GET '/v1/me/missed' $st).items | ConvertTo-Json -Depth 6
# the session she was absent from: what was covered, the homework set, the topic, her make-up request

(Call GET '/v1/me/homework' $st).items | Select-Object title, status, dueAt
# handed_in, late, and two still "set" (shown as "Not marked yet", never "missing")

(Call GET '/v1/me/topics' $st).subjects | ForEach-Object {
  "Level $($_.level) · $($_.stars) stars"
  $_.topics | Select-Object name, quizCount, score, band, stars, @{n='lastMonth';e={$_.lastMonth.band}}
}
# Functions 86 mastered (3 stars) · Exponents 64 improving (2) · Logarithms 42 needs practice (1)
# Trig identities: 1 quiz → no score, 0 stars · Solving triangles: taught, not scored yet · the rest not taught yet

Call GET '/v1/me/schedule-changes' $st | ConvertTo-Json -Depth 5   # a moved session and a hall change
Call GET '/v1/me/student-notes' $st | ConvertTo-Json -Depth 5      # only the note the centre approved
Call GET '/v1/me/focus-plans' $st | ConvertTo-Json -Depth 5        # this week's checklist, one item ticked
Call GET '/v1/me/notifications' $st | ConvertTo-Json -Depth 5
```

## 3. Sign in as the parent (phone code from sms-sink)

```powershell
Call POST '/v1/auth/otp/request' $null @{ phone = '01000000001' }
# open http://localhost:8093 and copy the 6-digit code
$p = (Call POST '/v1/auth/otp/verify' $null @{ phone = '01000000001'; code = '<the code>' }).accessToken

(Call GET "/v1/children/$mariam/topics" $p).subjects.topics | Select-Object name, score, band
# exactly what Mariam sees (one score for every role, CF-58)
(Call GET "/v1/children/$mariam/student-account" $p).account | ConvertTo-Json -Depth 5
# status, failed PIN count, her devices (name, last used)
```

## 4. As the parent: remove a device, make a code, pause the account

```powershell
# Remove her phone: her open session stops on its next request.
$dev = (Call GET "/v1/children/$mariam/student-account" $p).account.devices[0].id
Call DELETE "/v1/children/$mariam/student-account/devices/$dev" $p
Call GET '/v1/me/student' $st        # → 401 student_device_removed

# A one-time code (10 minutes) for a new device, then the PIN on that device.
$code = (Call POST "/v1/children/$mariam/student-account/access-codes" $p).code
$r = Call POST '/v1/auth/student/redeem' $null @{ code = $code; platform = 'web' }
$s2 = Call POST '/v1/auth/student/pin' $null @{ pinSetupToken = $r.pinSetupToken; pin = '1357' }
$st = $s2.accessToken                # keep $r.deviceId and $r.deviceSecret to sign in again

# Pause: every session stops on its next request; resume lets the same device in again.
Call POST "/v1/children/$mariam/student-account/pause" $p
Call GET '/v1/me/student' $st        # → 401
Call POST "/v1/children/$mariam/student-account/resume" $p
Call POST '/v1/auth/student/sign-in' $null @{ deviceId = $r.deviceId; deviceSecret = $r.deviceSecret; pin = '1357' }

# Or end everything: every session and every device (a new code is needed).
# Call POST "/v1/children/$mariam/student-account/sign-out-everywhere" $p
```

A third device is refused with `409 student_device_limit` ("ask your parent to remove a device"). To start over: `pnpm seed:demo --reset`.

## 5. The teacher and centre sides (optional)

- Mr Karim (Mariam's teacher, sample phone `01000000101`): `GET /v1/groups/e1f6738e-3010-4ed8-aaa3-42c6f43e6bec/topic-scores` (the same scores), `/student-notes`, `/focus-plans`; `PATCH /v1/sessions/{id}` to move a coming session.
- Al Nour's owner (`01000000003`): `GET /v1/centres/{id}/makeup-requests`, `POST /v1/makeup-requests/{id}/accept` with a coming Sec 2 Maths session (one seat there, no payment), `POST /v1/student-notes/{id}/approve`.

The full list is in [docs/07](../07-api.md) §2e.
