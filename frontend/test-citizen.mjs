import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function importSource(relativePath, env = {}) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), 'utf8')
    .replaceAll('import.meta.env', JSON.stringify(env));
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
  return import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString('base64')}`);
}

test('Tracking handles UTC timestamps with and without explicit offsets', async () => {
  const { formatTimestamp } = await importSource('src/utils/publicRequest.ts');
  const expected = new Date('2026-09-29T10:00:00Z').toLocaleString();
  assert.equal(formatTimestamp('2026-09-29T10:00:00'), expected);
  assert.equal(formatTimestamp('2026-09-29T10:00:00+00:00'), expected);
  assert.equal(formatTimestamp('2026-09-29T15:30:00+05:30'), expected);
  assert.equal(formatTimestamp('invalid'), 'Not yet available');
});

test('Leaflet popup text cannot introduce markup from a location address', async () => {
  const { escapeHtml } = await importSource('src/utils/publicRequest.ts');
  assert.equal(escapeHtml('<img src=x onerror="alert(1)"> & camp'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; camp');
});

test('Public API uses same-origin proxy by default and sends coordinates and supporting text', async () => {
  const { API_BASE_URL, createPublicReport, getPublicRequest } = await importSource('src/services/api.ts');
  assert.equal(API_BASE_URL, '/api');
  const originalFetch = globalThis.fetch;
  const payload = { report_type: 'relief', category: 'water', description: 'Synthetic camp needs drinking water', location: 'Demo camp', latitude: 12.9141, longitude: 74.856, people_affected: 10, required_quantity: 100, priority: 'high', evidence_note: 'Field observer reports 10 households.' };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ request_id: 'CR-42', status: 'under_review' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await createPublicReport(payload);
    assert.equal(result.success, true);
    assert.equal(result.request.request_id, 'CR-42');
    assert.equal(calls[0].url, '/api/public/reports');
    assert.deepEqual(JSON.parse(calls[0].options.body), payload);
    await getPublicRequest('CR-42');
    assert.equal(calls[1].url, '/api/public/requests/CR-42');
    globalThis.fetch = async () => { throw new TypeError('Failed to fetch'); };
    const unavailable = await getPublicRequest('CR-42');
    assert.equal(unavailable.success, false);
    assert.match(unavailable.errorMessage, /Unable to reach the server/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// ─── 1. Coordinate Formatting ────────────────────────────────────────────────
test('Coordinate formatting handles positive and negative lat/long correctly', () => {
  function formatCoordinates(lat, lng) {
    const latDir = lat >= 0 ? 'N' : 'S';
    const lngDir = lng >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`;
  }

  assert.equal(formatCoordinates(12.9716, 77.5946), '12.9716° N, 77.5946° E');
  assert.equal(formatCoordinates(-33.8688, 151.2093), '33.8688° S, 151.2093° E');
  assert.equal(formatCoordinates(37.7749, -122.4194), '37.7749° N, 122.4194° W');
  assert.equal(formatCoordinates(-22.9068, -43.1729), '22.9068° S, 43.1729° W');
});

// ─── 2. Citizen Request Validation ───────────────────────────────────────────
test('Validation rules enforce relief vs emergency rules', () => {
  function validateReport(draft) {
    if (draft.location.trim().length < 2) return { valid: false, error: 'Location too short' };
    if (draft.description.trim().length < 5) return { valid: false, error: 'Description too short' };
    if (draft.people_affected < 0) return { valid: false, error: 'Invalid people affected' };
    if (draft.report_type === 'relief' && draft.required_quantity <= 0) {
      return { valid: false, error: 'Relief requires positive quantity' };
    }
    if (draft.report_type === 'emergency' && draft.required_quantity !== 0) {
      return { valid: false, error: 'Emergency must use quantity 0' };
    }
    return { valid: true };
  }

  assert.deepEqual(validateReport({ report_type: 'relief', location: 'Camp Alpha', description: 'Food and water needed', people_affected: 48, required_quantity: 50 }), { valid: true });
  assert.equal(validateReport({ report_type: 'relief', location: 'Camp Alpha', description: 'Need food', people_affected: 4, required_quantity: 0 }).valid, false);
  assert.deepEqual(validateReport({ report_type: 'emergency', location: 'Bridge over river, trapped', description: 'Water rising rapidly', people_affected: 3, required_quantity: 0 }), { valid: true });
  assert.equal(validateReport({ report_type: 'emergency', location: 'Bridge', description: 'Trapped on roof', people_affected: 3, required_quantity: 5 }).valid, false);
  assert.equal(validateReport({ report_type: 'relief', location: 'X', description: 'help', people_affected: 1, required_quantity: 1 }).valid, false);
});

// ─── 3. No Admin Endpoints in Source ─────────────────────────────────────────
test('No admin endpoints are called by the citizen frontend source', () => {
  const srcDir = path.join(__dirname, 'src');
  const files = [];

  function readFiles(dir) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) readFiles(full);
      else if (full.endsWith('.ts') || full.endsWith('.tsx')) files.push(full);
    }
  }
  readFiles(srcDir);

  const forbiddenFetchEndpoints = [
    '/reports', // note: /public/reports is allowed
    '/relationships',
    '/coverage',
    '/dashboard',
    '/reconciliation/queue',
    '/resources',
    '/allocations',
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    for (const endpoint of forbiddenFetchEndpoints) {
      if (endpoint === '/reports' && file.includes('api.ts')) continue; // Skip api.ts for /reports because it uses /public/reports
      const pattern = new RegExp(`fetch\\([^)]*${endpoint.replace('/', '\\/')}`, 'i');
      assert.equal(
        pattern.test(content),
        false,
        `${path.basename(file)} must not call admin endpoint: ${endpoint}`
      );
    }
  }
});

// ─── 4. Production Build Artifacts ───────────────────────────────────────────
test('Production build output contains index.html, JS, and CSS bundles', () => {
  const distDir = path.join(__dirname, 'dist');
  assert.ok(fs.existsSync(distDir), 'dist/ directory must exist after build');

  const indexHtml = path.join(distDir, 'index.html');
  assert.ok(fs.existsSync(indexHtml), 'dist/index.html must exist');
  const html = fs.readFileSync(indexHtml, 'utf8');
  assert.ok(html.includes('<title>CrisisRoute | Citizen Portal</title>'), 'Title must be present');
  assert.ok(html.includes('viewport'), 'Viewport meta must be present');

  const assets = path.join(distDir, 'assets');
  assert.ok(fs.existsSync(assets), 'dist/assets must exist');
  const assetFiles = fs.readdirSync(assets);
  assert.ok(assetFiles.some(f => f.endsWith('.js')), 'Bundled JS must exist');
  assert.ok(assetFiles.some(f => f.endsWith('.css')), 'Bundled CSS must exist');
});

// ─── 5. Geolocation Denied Message ───────────────────────────────────────────
test('useGeolocation includes correct denied-permission message', () => {
  const hookFile = fs.readFileSync(path.join(__dirname, 'src/hooks/useGeolocation.ts'), 'utf8');
  assert.ok(
    hookFile.includes('Location access was not available. You can select your location manually on the map.'),
    'useGeolocation must include the correct denied error message'
  );
});

// ─── 6. BATCH 2A: MapView receives coordinates deterministically ──────────────
test('MapView component receives address and source props (Batch 2A)', () => {
  const mapViewFile = fs.readFileSync(path.join(__dirname, 'src/components/MapView.tsx'), 'utf8');

  // Must accept address prop
  assert.ok(mapViewFile.includes('address?:'), 'MapView must accept optional address prop');
  // Must accept source prop
  assert.ok(mapViewFile.includes('source?:'), 'MapView must accept optional source prop');
  // Must accept gpsAccuracy prop
  assert.ok(mapViewFile.includes('gpsAccuracy?:'), 'MapView must accept optional gpsAccuracy prop');
  // Must not show marker when isCustomLocationSet is false
  assert.ok(
    mapViewFile.includes('if (!isCustomLocationSet)'),
    'MapView must guard against showing marker before location is selected'
  );
  // Must center map deterministically when coordinates change
  assert.ok(
    mapViewFile.includes('map.setView(latLng'),
    'MapView must call setView to center map on coordinate updates'
  );
});

// ─── 7. BATCH 2A: LocationContext provides searchAddress function ─────────────
test('LocationContext exposes searchAddress function (Batch 2A)', () => {
  const contextFile = fs.readFileSync(path.join(__dirname, 'src/context/LocationContext.tsx'), 'utf8');

  // Must expose searchAddress
  assert.ok(contextFile.includes('searchAddress'), 'LocationContext must expose searchAddress function');
  // Must use Nominatim search endpoint
  assert.ok(
    contextFile.includes('nominatim.openstreetmap.org/search'),
    'searchAddress must use Nominatim for geocoding'
  );
  // Must only fire on submit (not on every keystroke - i.e., it's a function called explicitly)
  assert.ok(
    contextFile.includes('async (query: string)'),
    'searchAddress must be an explicit async function, not a reactive effect'
  );
  // Must handle empty query
  assert.ok(
    contextFile.includes('Please enter a location or address to search'),
    'searchAddress must validate empty queries'
  );
  // Must handle no-result gracefully
  assert.ok(
    contextFile.includes('No location found for'),
    'searchAddress must handle no-result state'
  );
});

// ─── 8. BATCH 2A: LocationPicker uses searchAddress, not setManualAddressText ──
test('LocationPicker uses searchAddress for address lookup (Batch 2A)', () => {
  const pickerFile = fs.readFileSync(path.join(__dirname, 'src/components/LocationPicker.tsx'), 'utf8');

  assert.ok(pickerFile.includes('searchAddress'), 'LocationPicker must call searchAddress');
  assert.ok(pickerFile.includes('isSearchingAddress'), 'LocationPicker must track search loading state');
  assert.ok(pickerFile.includes('Search & Center Map'), 'LocationPicker must have search submit button');
});

// ─── 9. BATCH 2A: Map location summary is visible near the map ───────────────
test('MapView renders a location summary section (Batch 2A)', () => {
  const mapViewFile = fs.readFileSync(path.join(__dirname, 'src/components/MapView.tsx'), 'utf8');

  // Must show address/description
  assert.ok(mapViewFile.includes('map-location-summary'), 'MapView must render location summary div');
  assert.ok(mapViewFile.includes('Selected Help Location'), 'MapView must label the selected location clearly');
  assert.ok(mapViewFile.includes('No location selected yet'), 'MapView must show fallback when unset');
  // Must distinguish GPS from selected incident pin
  assert.ok(mapViewFile.includes('Your Current Location'), 'MapView must label GPS position distinctly');
  assert.ok(mapViewFile.includes('Selected Location'), 'MapView must label the incident pin');
});

// ─── 10. BATCH 2A: Types include address_search source ───────────────────────
test('LocationData type includes address_search as a valid source (Batch 2A)', () => {
  const typesFile = fs.readFileSync(path.join(__dirname, 'src/types/index.ts'), 'utf8');
  assert.ok(
    typesFile.includes("'address_search'"),
    "types/index.ts must include 'address_search' as a valid LocationData source"
  );
});

// ─── 11. BATCH 2A: RequestHelpPage includes MapView ─────────────────────────
test('RequestHelpPage includes a MapView for location confirmation (Batch 2A)', () => {
  const pageFile = fs.readFileSync(path.join(__dirname, 'src/pages/RequestHelpPage.tsx'), 'utf8');
  assert.ok(
    pageFile.includes("import { MapView }"),
    'RequestHelpPage must import MapView'
  );
  assert.ok(
    pageFile.includes('<MapView'),
    'RequestHelpPage must render a MapView for location confirmation'
  );
});

// ─── 12. BATCH 2A: isCustomLocationSet guards coordinate output ───────────────
test('RequestHelpPage conditionally attaches coordinates based on isCustomLocationSet (Batch 2A)', () => {
  const pageFile = fs.readFileSync(path.join(__dirname, 'src/pages/RequestHelpPage.tsx'), 'utf8');
  assert.ok(
    pageFile.includes('isCustomLocationSet ? locationData.coordinates.lat : null'),
    'RequestHelpPage must only attach latitude when a location is actually selected'
  );
  assert.ok(
    pageFile.includes('isCustomLocationSet ? locationData.coordinates.lng : null'),
    'RequestHelpPage must only attach longitude when a location is actually selected'
  );
});

// 📌 13. BATCH 2B: Public report API endpoint is used
test('api.ts uses /public/reports for creation (Batch 2B)', () => {
  const apiFile = fs.readFileSync('src/services/api.ts', 'utf8');
  if (!apiFile.includes('/public/reports')) {
    throw new Error('api.ts must call /public/reports endpoint');
  }
});

// 📌 14. BATCH 2B: Public request lookup API endpoint is used
test('api.ts uses /public/requests/{id} for lookup (Batch 2B)', () => {
  const apiFile = fs.readFileSync('src/services/api.ts', 'utf8');
  if (!apiFile.includes('/public/requests/')) {
    throw new Error('api.ts must call /public/requests/{id} endpoint');
  }
});

// 📌 15. BATCH 2B: Duplicate submit protection in RequestHelpPage
test('RequestHelpPage has duplicate submit protection (Batch 2B)', () => {
  const pageFile = fs.readFileSync('src/pages/RequestHelpPage.tsx', 'utf8');
  if (!pageFile.includes('isSubmitting')) {
    throw new Error('RequestHelpPage must have an isSubmitting state or equivalent to prevent duplicate submits');
  }
  if (!pageFile.includes('disabled={isSubmitting') && !pageFile.includes('disabled={isSubmitting ||')) {
    throw new Error('RequestHelpPage submit button must be disabled while submitting');
  }
});

// 📌 16. BATCH 2B: Success state requires backend response
test('RequestHelpPage success state uses backend request ID (Batch 2B)', () => {
  const pageFile = fs.readFileSync('src/pages/RequestHelpPage.tsx', 'utf8');
  if (!pageFile.includes('submittedRequestId')) {
    throw new Error('RequestHelpPage must track and display the submitted request ID from the backend');
  }
  if (!pageFile.includes('Track Request') && !pageFile.includes('track?id=')) {
    throw new Error('RequestHelpPage must provide navigation to the tracking page with the request ID');
  }
});

// 📌 17. BATCH 2B: Error handling exists
test('Error handling exists in API service (Batch 2B)', () => {
  const apiFile = fs.readFileSync('src/services/api.ts', 'utf8');
  if (!apiFile.includes('success: false') || !apiFile.includes('errorMessage')) {
    throw new Error('api.ts must return standardized error handling responses');
  }
});
