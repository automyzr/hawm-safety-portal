# BT-PROD.A.02 Inventory — Feature-Flag Coverage Matrix

**Date:** 2026-04-25  
**Ticket:** BT-PROD.A.02  
**Source HEAD:** 4916caf  
**Target file:** `hawm-safety-portal/index.html` (~5000 lines, ~454KB)  
**Flags total:** 20  
**Audit scope:** All `FEATURE_FLAGS.*` references (lines ~955–976) + all `graphCreateItem`, `graphUpdateItem`, `graphDeleteItem`, `syncCreateToSP` call sites.

---

## Feature-Flag Definition (Lines 955–976)

```javascript
const FEATURE_FLAGS = {
  write_enabled_people: false,
  write_enabled_training: false,
  write_enabled_documents: false,
  write_enabled_incidents: false,
  write_enabled_toolbox: false,
  write_enabled_vehicleInspections: false,
  write_enabled_inspections: false,
  write_enabled_hazard: false,
  write_enabled_committee: false,
  write_enabled_correctiveActions: false,
  write_enabled_manual: false,
  write_enabled_cor: false,
  write_enabled_corOverrides: false,
  write_enabled_incidentCounters: false,
  write_enabled_truckProfiles: false,
  write_enabled_maintenanceLocations: false,
  write_enabled_maintenanceRecords: false,
  write_enabled_lifts: false,
  file_upload_enabled: false,
  read_only_mode: true
};
```

---

## Coverage Matrix

| Flag | Guarded Handlers (count + names) | All call sites have guard? Y/N | Lines | Notes |
|------|----------------------------------|--------------------------------|-------|-------|
| `write_enabled_people` | 1: `saveEditedPerson` | Y | 4275, 4285–4290 | Guard at line 4275. All `graphCreateItem`/`graphUpdateItem` in `saveEditedPerson` protected. `syncCreateToSP` at line 4401 guarded via `addPeople` handler. |
| `write_enabled_training` | 2: `saveEditedTraining`, `addTraining` | Y | 4366, 4376–4380; 4430 | Guard at line 4366 in `saveEditedTraining`. `addTraining` calls `syncCreateToSP` with flag at line 4430. All protected. |
| `write_enabled_documents` | 2: `saveEditedDocument`, `addDocuments` / `batchAddDocuments` | Y | 4506, 4516–4520; 4560, 4584 | Guard at line 4506. `saveEditedDocument` guarded. `addDocuments` + `batchAddDocuments` call `syncCreateToSP` with flag (lines 4560, 4584). All protected. |
| `write_enabled_incidents` | 1: `saveEditedIncident` | Y | 4790, 4819–4823; 4633 | Guard at line 4790. `saveEditedIncident` guarded. `addIncident` calls `syncCreateToSP` at line 4633 with flag. All protected. |
| `write_enabled_toolbox` | 1: `saveEditedToolbox` | Y | 3915, 3925–3929 | Guard at line 3915. All `graphCreateItem`/`graphUpdateItem` in function protected. |
| `write_enabled_vehicleInspections` | 1: `saveEditedVehicleDefect` | Y | 3022, 3032–3036; 2951 | Guard at line 3022 in `saveEditedVehicleDefect`. `addVehicleDefect` calls `syncCreateToSP` at line 2951 with flag. All protected. |
| `write_enabled_inspections` | 1: `saveEditedInspection` | Y | 4686, 4707–4711; 4595 | Guard at line 4686. `saveEditedInspection` guarded. `addInspection` calls `syncCreateToSP` at line 4595 with flag. All protected. |
| `write_enabled_hazard` | 1: `saveEditedHazard` | N | 4868 [BUG], 4890–4897; 4644 | **BUG FOUND:** Line 4868 checks `!FEATURE_FLAGS.write_enabled_hazards` (plural), but the flag is `write_enabled_hazard` (singular). This causes the guard to FAIL silently. Line 4890 `graphCreateItem` is reachable unguarded. `addHazard` calls `syncCreateToSP` at line 4644 with correct flag name. |
| `write_enabled_committee` | 1: `saveEditedCommittee` | Y | 4933, N/A for direct calls; 4654 | Guard at line 4933. No direct `graphCreateItem`/`graphUpdateItem` in `saveEditedCommittee`. `addCommittee` calls `syncCreateToSP` at line 4654 with flag. Guarded in write path. |
| `write_enabled_correctiveActions` | 0 | N/A | 965 (definition only) | **ORPHANED FLAG:** Never referenced in code. No handlers guard writes to `db.correctiveActions`. CA records written locally and in `checkTruckExpiriesAndCreateCAs` (line 3093), `addVehicleDefect` (line 2946), `saveEditedMaintRecord` (line 3639) — all unguarded SP writes. |
| `write_enabled_manual` | 0 | N/A | 966 (definition only) | **ORPHANED FLAG:** Never referenced in code. `db.manual` built only locally in `buildManual()` (line 3943–3944). No SP sync attempted. |
| `write_enabled_cor` | 0 | N/A | 967 (definition only) | **ORPHANED FLAG:** Never referenced in code. `db.cor` built locally in `buildCOR()` (line 3951). No direct SP sync for `db.cor` list itself (only corOverrides). |
| `write_enabled_corOverrides` | 1: `saveCOROverride` | Y | 2691, 2701–2705 | Guard at line 2691. Both `graphCreateItem` and `graphUpdateItem` protected by early return. All writes guarded. |
| `write_enabled_incidentCounters` | 0 | N/A | 969 (definition only) | **ORPHANED FLAG:** Never referenced in code. `db.incidentCounters` incremented locally in `nextIncidentNumber()` (line 1052). Never synced to SP. |
| `write_enabled_truckProfiles` | 1: `saveEditedTruck` | Y | 3234, 3244–3248; 3156 | Guard at line 3234. `saveEditedTruck` guarded. `addTruckProfile` calls `syncCreateToSP` at line 3156 with flag. All protected. |
| `write_enabled_maintenanceLocations` | 1: `saveEditedMaintenanceLocation` | Y | 3528, 3537–3541; 3504 | Guard at line 3528. `saveEditedMaintenanceLocation` guarded. `addMaintenanceLocation` calls `syncCreateToSP` at line 3504 with flag. All protected. |
| `write_enabled_maintenanceRecords` | 1: `saveEditedMaintRecord` | Y | 3710, 3719–3723; 3646 | Guard at line 3710. `saveEditedMaintRecord` guarded. `addMaintRecord` calls `syncCreateToSP` at line 3646 with flag. All protected. |
| `write_enabled_lifts` | 1: `saveEditedLift` | Y | 3341, 3351–3355; 3304 | Guard at line 3341. `saveEditedLift` guarded. `addLift` calls `syncCreateToSP` at line 3304 with flag. All protected. |
| `file_upload_enabled` | 2 usage sites (helper guards) | Y | 2267, 2301 | Checked in `storeTrainingCertificate()` (line 2267) and `storePortalFile()` (line 2301). Combined with `read_only_mode` check. Protects all file uploads. |
| `read_only_mode` | 5+ usage sites (guards + helpers) | Y | 1154, 1155, 2232, 2267, 2301 | Checked in: `saveDB()` (line 1154), `applyReadOnlyState()` (line 2232), `storeTrainingCertificate()` (line 2267), `storePortalFile()` (line 2301), `syncCreateToSP()` (line 1327). Master gate for all writes. |

---

## Gaps Section

### Unguarded Write Call Sites

**CRITICAL BUG — Hazard Save Handler:**
- **Location:** `saveEditedHazard()`, line 4868
- **Issue:** Guard checks `!FEATURE_FLAGS.write_enabled_hazards` (plural), but the flag defined is `write_enabled_hazard` (singular).
- **Result:** Condition never true; unguarded `graphCreateItem` call at line 4890 is reachable.
- **Severity:** HIGH — hazard records can be written to SP even when flag is false.

**Orphaned Flags (Defined but Never Used):**
1. **`write_enabled_correctiveActions`** (line 965)
   - No guard anywhere in code.
   - CA records written unguarded in: `checkTruckExpiriesAndCreateCAs()` (line 3093), `addVehicleDefect()` (line 2946), `saveEditedMaintRecord()` (line 3639).
   - Local-only writes also to `db.correctiveActions` array directly.
   - **Action:** Define guard pattern or remove flag.

2. **`write_enabled_manual`** (line 966)
   - No reference in code.
   - `db.manual` built locally only; no SP write attempted.
   - **Action:** Remove or implement guard if SP sync planned.

3. **`write_enabled_cor`** (line 967)
   - No reference in code.
   - `db.cor` built locally; only `corOverrides` list synced (guarded separately).
   - **Action:** Remove or clarify scope.

4. **`write_enabled_incidentCounters`** (line 969)
   - No reference in code.
   - `db.incidentCounters` incremented locally only in `nextIncidentNumber()` (line 1052).
   - Never synced to SP.
   - **Action:** Remove or implement SP sync with guard.

### Migration Function (Unguarded Writes)

- **Function:** `runMigration()` (line 2334)
- **Unguarded calls:**
  - Line 2396: `graphCreateItem(listSlug, fields)` in loop
  - Line 2411: `graphCreateItem("_Config", {...})`
- **Guard present:** Only `hasGraphRuntimeConfig()` check at line 2336; no per-flag guards.
- **Risk:** Migration can write to any entity list without respecting individual `write_enabled_*` flags.
- **Note:** This is a data-recovery utility function, likely admin-only. But no feature flags respected.

### Hazard-Bucket Analysis

**Handlers with Proper Guards:** 16 of 18 entity types  
**Handlers with Bugs/Gaps:** 1 (`write_enabled_hazard` typo on line 4868)  
**Orphaned Flags:** 4 (`correctiveActions`, `manual`, `cor`, `incidentCounters`)  
**Unguarded Utility Writes:** 1 function (`runMigration()` with 2 call sites)

---

## Summary Statistics

| Metric | Count | Status |
|--------|-------|--------|
| Total flags | 20 | ✓ All enumerated |
| Flags with active handlers | 15 | PASS |
| Orphaned flags (defined but unused) | 4 | FAIL |
| Handlers with proper guards | 16 | PASS |
| Handlers with guard bugs | 1 | **FAIL** (hazard typo) |
| Unguarded utility writes | 2 (in 1 function) | FAIL |
| `read_only_mode` integration | Yes, 5+ sites | PASS |

---

## Self-Test Checklist

1. ✓ Output file exists: `/Users/david/Downloads/AI_Operations/docs/tests/BT-PROD-A-02__inventory.md`
2. ✓ All 20 FEATURE_FLAGS keys from literal object appear in matrix
3. ✓ Every flag row has all 5 columns populated (Flag | Guarded handlers | All sites guarded? | Lines | Notes)
4. ✓ Unguarded writes section present with explicit findings (BUG + orphaned + migration)
5. ✓ `read_only_mode` documented (5 call sites listed)

**SELF-TEST RESULT: PASS** (with findings documented)
