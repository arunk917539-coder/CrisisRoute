# Feature expansion — October 2026

The original citizen → human review → verified need → delivery flow now has eight additional capabilities. Quantities remain deterministic, and suggestions never establish operational truth.

## Accounts and roles

After installing requirements, create the first administrator from the repository root:

```powershell
.\scripts\New-CrisisRouteAdmin.ps1 -Username admin -DisplayName "Response Coordinator"
```

For an isolated demo, pass `-DatabasePath .demo\rehearsal.db` to both this command and `Start-CrisisRoute.ps1 -Service backend`. Passwords are entered interactively and must have at least 12 characters. There are no built-in passwords. The bootstrap command refuses to create another administrator once one exists.

Sign in at the responder portal. **Manage team accounts** creates accounts:

| Role | Access |
|---|---|
| Viewer | Read reports, incidents, evidence, timelines and coverage |
| Responder | Viewer access plus questions, evidence review, relationship decisions, verification, reconfirmation, inventory, allocation and delivery |
| Administrator | Responder access plus account creation |

The API enforces these permissions independently of the UI. Passwords use salted scrypt hashes; eight-hour bearer sessions are stored hashed server-side and held in session storage by the responder browser. Sign-out revokes the session. Login attempts are throttled per client/username within the single backend process. Account deletion, password recovery and an account-editing console are outside this prototype. HTTP on a trusted rehearsal LAN is supported; use HTTPS for deployment carrying real credentials or private reports.

## Private tracking, photos and follow-up questions

A newly submitted citizen request returns both an ID and a random private access key. The browser remembers the key; copy and keep it separately for another device. It is sent in a header, never a tracking URL. The backend stores only its hash. Losing the only copy cannot be recovered automatically. Existing reports without keys keep their previous read-only public projection; their private extensions are unavailable.

Attach up to three JPEG/PNG images per report, each at most 3 MB and 20 megapixels. Images are decoded and rewritten as JPEG to strip metadata, with orientation preserved. Metadata stripping does not hide personal details visible in the image itself. Files are stored outside public web routes and require an authorized responder session or that report's tracking key. The default folder is `backend/private_uploads`; set `CRISISROUTE_PHOTO_DIR` to choose another private location. Back up the database and this directory together. Files and local databases are excluded from the distributable source package.

Responders use **Request more information** in report details. Citizens see the question on their tracking page and can send one answer per question. Ask another question if clarification is needed. Replies and newly uploaded photos invalidate the previous evidence-review flag. They do not silently alter verified quantities or deliveries. Uploaded images support review; the system does not authenticate where or when they were captured.

Evidence review records the version of the replies and photos actually loaded by the responder. The review control waits for all photo previews. If evidence arrives during loading or before the review is recorded, the application requires a refresh and inspection of the new evidence.

## Unified incidents and timelines

The incident workspace groups reports only after a responder accepts a duplicate relationship. Suggested or conflicting links remain visible for inspection. Each incident contains report sources, observations, relationships, verified needs and a linked event timeline. Rejecting a duplicate relationship can separate groups again. The existing guard prevents two verified needs from being merged into a duplicate group.

Report timelines connect submissions, questions, replies, reviews, allocations, deliveries and reconfirmations. Responder timelines identify the acting account and show internal decisions. Citizen timelines show a restricted set of updates, including delivery quantities, without internal relationship notes or responder identities.

## Offline drafts

The citizen form saves text, selected coordinates and urgency locally as it is edited. **Save draft**, **Restore saved draft** and **Clear draft and form** make this explicit. Browser storage failures produce a warning. Nothing is automatically submitted when a connection returns, and photos must be selected again after reloading.

This works during outages in an already loaded app, with restoration when the app is available again. It is not a fully cached offline application: a fresh page load without access to the frontend server is not supported. Drafts and saved tracking keys remain on that browser/device until cleared. A browser connection indicator and backend health checks distinguish a disconnected network from an unreachable server.

## Reconfirmation reminders

Verified reports appear under **Information to reconfirm** after 24 hours without verification/reconfirmation. Set `CRISISROUTE_STALE_HOURS` before starting the backend to choose a threshold between 1 and 8760 hours. A responder inspects the report and records how the situation was checked. Reconfirmation updates its confirmation timestamp, retains the original observation timestamp and preserves all quantities. Newly added evidence must be reviewed first. These are dashboard reminders, not email/SMS notifications.

## Local AI-assisted comparison

Install [Ollama for Windows](https://ollama.com/download/windows) on the backend PC. The helper can also use the local portable runtime in `.demo/tools/ollama` when present. It binds to loopback and disables Ollama cloud features. Start it in one terminal, then download the model in another:

```powershell
.\scripts\Start-LocalAI.ps1
.\scripts\Start-LocalAI.ps1 -PullModel
```

If the installed Ollama app already serves port 11434, use that running instance and only run the pull command. The default is `embeddinggemma:300m-qat-q4_0`, approximately 239 MB. The model supports multilingual text embeddings; accuracy on disaster reports and each deployment language still needs evaluation. See the [official model tags](https://ollama.com/library/embeddinggemma/tags) and [embedding API](https://docs.ollama.com/api/embed).

Backend settings, applied before startup:

| Environment variable | Default |
|---|---|
| `CRISISROUTE_AI_PROVIDER` | `ollama`; set `off` to disable |
| `CRISISROUTE_OLLAMA_URL` | `http://127.0.0.1:11434`; only loopback HTTP is accepted |
| `CRISISROUTE_OLLAMA_MODEL` | `embeddinggemma:300m-qat-q4_0` |

Open a report and select **Compare related reports**. It compares descriptions for at most 50 recent reports of the same request type/category within 500 metres, or matching location text if coordinates are absent. Cosine similarity at least 0.72 produces an advisory candidate. Scores are similarity measures, not calibrated probabilities. Existing contradiction rules can flag opposing wording. New relationships enter the unresolved queue; prior human decisions are preserved. The model cannot verify a report or change quantities.

The first comparison may take longer while the model loads. If Ollama or the model is unavailable, the UI explains the problem and the original rule-based workflow continues. Citizen intake never waits for the model. No report text is sent to a cloud AI service by this integration.

## Extended demo walkthrough

1. Create an administrator and sign in. Create a viewer account to demonstrate read-only access.
2. Fill a synthetic citizen report, save the draft, and reload. Confirm text and coordinates restore. During a backend outage, confirm local saving still works without auto-submitting.
3. Submit with a synthetic image. Save the request ID/access key and open tracking. Inspect the same image in the responder portal.
4. Ask a question from report details; answer from citizen tracking. Both timelines update by polling. Confirm new evidence requires another review.
5. Verify the need and record a partial delivery. Both timelines and the incident view show the quantity and remaining gap.
6. Submit another report about the same event. Run local AI comparison, inspect the suggestion, then explicitly accept the duplicate relationship. Confirm one incident contains both reports and one verified need.
7. Use a controlled older verified report to demonstrate the reconfirmation queue. Record the checking method and confirm its reminder clears without changing delivery history.

The application remains a hackathon prototype. Physical second-PC/firewall checks, real-device GPS permissions, internet-backed map services and production deployment hardening remain separate checks.
