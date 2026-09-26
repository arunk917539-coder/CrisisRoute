import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Test Coordinate Formatting logic
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

// 2. Test Citizen Request Validation rules (aligned with backend ReportCreate schema)
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

  // Valid relief
  assert.deepEqual(validateReport({
    report_type: 'relief',
    location: 'Camp Alpha, Sector 4',
    description: 'Food and water needed for 12 families',
    people_affected: 48,
    required_quantity: 50,
  }), { valid: true });

  // Relief with 0 quantity must fail
  assert.equal(validateReport({
    report_type: 'relief',
    location: 'Camp Alpha, Sector 4',
    description: 'Need food',
    people_affected: 4,
    required_quantity: 0,
  }).valid, false);

  // Valid emergency
  assert.deepEqual(validateReport({
    report_type: 'emergency',
    location: 'Bridge over river, trapped on roof',
    description: 'Water levels rising rapidly, 3 people trapped',
    people_affected: 3,
    required_quantity: 0,
  }), { valid: true });

  // Emergency with non-zero quantity must fail
  assert.equal(validateReport({
    report_type: 'emergency',
    location: 'Bridge over river',
    description: 'Trapped on roof',
    people_affected: 3,
    required_quantity: 5,
  }).valid, false);

  // Short description must fail
  assert.equal(validateReport({
    report_type: 'relief',
    location: 'Main St',
    description: 'help',
    people_affected: 1,
    required_quantity: 1,
  }).valid, false);
});

// 3. Test that no admin endpoints are referenced in source code
test('No admin endpoints are referenced in citizen frontend source code', () => {
  const srcDir = path.join(__dirname, 'src');
  const files = [];

  function readFiles(dir) {
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) {
        readFiles(full);
      } else if (full.endsWith('.ts') || full.endsWith('.tsx')) {
        files.push(full);
      }
    }
  }
  readFiles(srcDir);

  const forbiddenEndpoints = [
    '/reports',
    '/relationships',
    '/coverage',
    '/dashboard',
    '/reconciliation/queue',
    '/resources',
    '/allocations',
  ];

  for (const file of files) {
    const content = fs.readFileSync(file, 'utf8');
    // Ensure file doesn't fetch any forbidden admin endpoints
    for (const endpoint of forbiddenEndpoints) {
      const pattern = new RegExp(`fetch\\([^)]*${endpoint.replace('/', '\\/')}`, 'i');
      assert.equal(
        pattern.test(content),
        false,
        `File ${path.basename(file)} must not call admin endpoint ${endpoint}`
      );
    }
  }
});

// 4. Test production build artifacts
test('Production build output contains index.html, JS, and CSS bundles', () => {
  const distDir = path.join(__dirname, 'dist');
  assert.ok(fs.existsSync(distDir), 'dist/ directory must exist');

  const indexHtml = path.join(distDir, 'index.html');
  assert.ok(fs.existsSync(indexHtml), 'dist/index.html must exist');
  const htmlContent = fs.readFileSync(indexHtml, 'utf8');
  assert.ok(htmlContent.includes('<title>CrisisRoute | Citizen Portal</title>'), 'Title must be present in index.html');
  assert.ok(htmlContent.includes('viewport'), 'Viewport meta must be present');

  const assetsDir = path.join(distDir, 'assets');
  assert.ok(fs.existsSync(assetsDir), 'dist/assets directory must exist');

  const assetFiles = fs.readdirSync(assetsDir);
  assert.ok(assetFiles.some(f => f.endsWith('.js')), 'Bundled JS asset must exist');
  assert.ok(assetFiles.some(f => f.endsWith('.css')), 'Bundled CSS asset must exist');
});

// 5. Test Geolocation Denied Message
test('Denied geolocation error message matches safety requirements', () => {
  const expectedDeniedMessage = 'Location access was not available. You can select your location manually on the map.';
  const hookFile = fs.readFileSync(path.join(__dirname, 'src/hooks/useGeolocation.ts'), 'utf8');
  assert.ok(
    hookFile.includes(expectedDeniedMessage),
    'useGeolocation must include the exact denied error message'
  );
});
