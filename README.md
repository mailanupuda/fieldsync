# FieldSync — Offline-First Collaborative Field Inspection PWA & TWA

[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8.x-646CFF.svg)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19.x-61DAFB.svg)](https://react.dev/)
[![IndexedDB](https://img.shields.io/badge/Dexie.js-v4-brightgreen.svg)](https://dexie.org/)
[![CRDT](https://img.shields.io/badge/Yjs-CRDT-orange.svg)](https://yjs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL%2015-3ECF8E.svg)](https://supabase.com/)
[![Cloudinary](https://img.shields.io/badge/Cloudinary-Resumable%20Media-blueviolet.svg)](https://cloudinary.com/)
[![Android TWA](https://img.shields.io/badge/Google%20Play-TWA%20Ready-3DDC84.svg)](https://developer.chrome.com/docs/android/trusted-web-activity/)
[![Testing](https://img.shields.io/badge/Vitest-Passed%20(37%2F37)-brightgreen.svg)](https://vitest.dev/)

> **FieldSync** is an enterprise-grade, offline-first Progressive Web Application (PWA) and Trusted Web Activity (TWA) engineered for mission-critical industrial, utility, and infrastructure inspections in environments with intermittent or zero cellular connectivity. It integrates a **4-role enterprise lifecycle (Customer → Admin → Supervisor → Technician)**, real-time bi-directional Supabase PostgreSQL synchronization, Cloudinary byte-range resumable media uploads, Yjs CRDT conflict convergence, cryptographic dual signatures, immutable append-only audit histories, and **strictly enforced live hardware camera capture with mandatory real-time GPS locking**.

---

## 🌐 Live Deployments & Repository

- **Vercel Production App**: **[https://fieldsyncerode.vercel.app](https://fieldsyncerode.vercel.app)** *(Full PWA offline caching, Service Worker, and responsive UI)*
- **Cloudflare Edge Tunnel**: **[https://wife-assuming-seem-questionnaire.trycloudflare.com](https://wife-assuming-seem-questionnaire.trycloudflare.com)** *(Instant public edge access with zero configuration)*
- **Primary GitHub Repository**: **[https://github.com/mailanupuda/fieldsync](https://github.com/mailanupuda/fieldsync)**
- **Secondary GitHub Remote**: **[https://github.com/Tharun4743/FORGEX-AI](https://github.com/Tharun4743/FORGEX-AI)**

---

## 🎯 Problem Statement (WA-1) & Enterprise Scope

**WA-1. Offline-First Collaborative Field Inspection App**
- **Problem**: Industrial technicians inspect critical high-voltage substations, manufacturing machinery, underground conduits, and offshore facilities where wireless cellular signals are physically blocked.
- **Core Requirement**: A PWA that functions 100% offline, converges concurrent multi-user edits using CRDTs without silent overwrites, exposes transparent conflict adjudication and immutable audit logs, handles resilient schema migrations, chunked media uploads, and strictly eliminates fraudulent inspection photo submission.
- **Enterprise Scope**: FieldSync models a closed-loop operational lifecycle: self-service customer issue reporting $\rightarrow$ admin command triage & priority dispatch $\rightarrow$ technician tactile diagnostics & telemetry capture $\rightarrow$ supervisor verification gate, digital sign-off, and resolution certification.

---

## 👥 4-Role Enterprise Workflow

FieldSync organizes field operations into four specialized, authenticated roles with distinct capabilities:

```mermaid
graph TD
    subgraph Customer ["1. Customer / Site Operator"]
        C1["Raise Service Complaint / Issue"] --> C2["Capture Photos & Voice Notes Offline"]
        C2 --> C3["Track Resolution Status & Certificate"]
    end

    subgraph Admin ["2. System Administrator"]
        A1["Admin Command Center"] --> A2["Triage Incoming Issues"]
        A2 --> A3["Prioritize (LOW / MED / HIGH / CRITICAL)"]
        A3 --> A4["Assign to Supervisor & Field Technicians"]
    end

    subgraph Technician ["3. Field Technician"]
        T1["Offline Package Download"] --> T2["Tactile Quick Inspection"]
        T2 --> T3["Record Checklist & Telemetry"]
        T3 --> T4["Enforce Live Camera & Live GPS Watermark"]
        T4 --> T5["Submit for Supervisor Verification"]
    end

    subgraph Supervisor ["4. Inspection Supervisor"]
        S1["Review Submission Queue"] --> S2{"Verification Gate"}
        S2 -- Approved --> S3["Counter-Sign & Issue Resolution Certificate"]
        S2 -- Deficiencies --> S4["Request Rework with Action Items"]
        S4 --> T2
    end

    Customer --> Admin --> Technician --> Supervisor
```

### Preconfigured Demonstration Credentials (Password: `123456`)
| Role | Name | Email | Primary Responsibilities |
|---|---|---|---|
| **ADMIN** | Tharun | `tharun@gmail.com` | System configuration, role assignment, ticket triage, audit inspection |
| **SUPERVISOR** | Abi Kumar | `abi@gmail.com` | Quality assurance, verification queue sign-off, rework assignment, dual signatures |
| **TECHNICIAN** | Elakkiya S | `elakkiya@gmail.com` | Offline field inspection, tactile checklists, measurements, evidence capture |
| **TECHNICIAN** | Rajesh M | `rajesh@fieldsync.io` | Secondary field technician for concurrent multi-user CRDT conflict testing |
| **CUSTOMER** | Bob Abd | `customer@company.com` | Self-service complaint portal, tracking tickets, reviewing signed certificates |

---

## 📸 Strict Anti-Fraud Camera & Live GPS Geolocation

To guarantee compliance, auditability, and tamper-proof evidence collection in regulated industrial sectors, FieldSync enforces strict evidentiary integrity rules:

1. **Gallery File Selection Forbidden**:
   - All standard `<input type="file">` file-picker elements have been completely removed across the application (`PhotosTab`, `BeforeAfterEvidenceTab`, `ChecklistTab`).
   - Technicians cannot upload pre-existing gallery photographs or spoofed media files.
2. **Direct Hardware Live Camera Viewfinder**:
   - Integrated hardware WebRTC `navigator.mediaDevices.getUserMedia` viewfinder modal.
   - Built with dual-tier fallback constraints (`facingMode: { ideal: 'environment' }` down to generic `{ video: true }`), ensuring seamless operation across smartphones, tablets, and rugged industrial laptops.
   - Live rear/front lens toggling and callback-ref video stream binding to eliminate null-reference lifecycle glitches.
3. **Mandatory Live GPS Coordinate Lock**:
   - The camera shutter button is physically locked and disabled until the device acquires a valid, live geolocation fix (`isGpsLocked`).
   - Utilizes a two-tier location provider: high-accuracy satellite GPS primary with automatic network/Wi-Fi fallback if satellite fixes time out.
4. **Permanent Pixel-Level Watermark HUD**:
   - Captured photographs are processed on an in-memory `<canvas>` that burns live telemetry directly into the pixels:
     - Exact ISO / UTC Timestamp
     - Live Latitude & Longitude (up to 5 decimal places)
     - Geolocation Accuracy Radius (meters)
     - Inspection Identifier & Evidence Type

---

## 🛠️ Complete 12 Inspection Workspaces & Subsystems

The inspection detail interface provides a comprehensive suite of 12 integrated functional modules:

1. **Overview**: Real-time inspection status, priority badges, assigned personnel, facility details, schedule milestones, and dynamic progress bar.
2. **Checklist**: Interactive inspection items with binary/ternary decision pills (`PASS`/`FAIL`, `GOOD`/`DAMAGED`), numeric bounds validation, audio note recording, direct live camera capture, and Text-to-Speech (TTS) read-aloud.
3. **Measurements**: Telemetry entries (temperature, pressure, voltage, vibration, resistance) with unit indicators, dynamic min/max threshold checks, timestamped histories, and trend analysis.
4. **Before / After**: Comparative visual evidence matching baseline pre-inspection photographs with post-repair photographs, featuring interactive split-view comparison and tamper-evident metadata.
5. **Signatures**: Dual cryptographic digital signatures (Technician and Customer / Supervisor) with role validation, timestamping, Base64 stroke encoding, and cloud/local persistence.
6. **Billing & Invoice**: Automated labor and parts line-item calculations, tax and discount computations, dynamic currency formatting, PDF export, and full invoice lifecycle tracking (`Draft` $\rightarrow$ `Issued` $\rightarrow$ `Paid`).
7. **Equipment History**: Complete asset lifecycle telemetry, historical maintenance records, previous inspection logs, component replacements, and failure frequency metrics.
8. **SLA Protocol**: Real-time SLA breach countdowns, response vs. resolution time tiers, severity matrix (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), and automated escalation protocols.
9. **Notes**: Collaborative markdown notes with author attribution, timestamps, and real-time synchronization.
10. **Voice Notes**: On-device HTML5 `MediaRecorder` audio capture stored as binary Blobs in IndexedDB, with interactive Web Audio waveform playback and transcription.
11. **Photos & Work Evidence**: Live-captured photo gallery with GPS geotagging, checklist item linkage, and direct Cloudinary CDN integration.
12. **Audit Log**: Immutable append-only audit trail logging all lifecycle events, status changes, user attribution, entity IDs, and before/after diffs from real PostgreSQL records.

---

## 🏛️ System Architecture

```mermaid
graph TD
    subgraph Client ["Client Engine (FieldSync PWA · Zero Network Dependency)"]
        UI["Tactile UI: 12 Inspection Tabs · Quick Inspection · Conflict Center · Audit History"]
        RoleRouter["Role-Based Guard (Admin / Supervisor / Technician / Customer)"]
        Lang["Offline i18n Engine (6 Languages: EN, TA, HI, TE, KN, ML)"]
        Speech["Offline Speech Synthesis (TTS Instruction Read-Aloud)"]
        CamHUD["Live Camera & Mandatory GPS Watermark Engine"]
        MediaRec["MediaRecorder (Photos & Voice Note Blobs)"]
        Search["Offline Search Indexer (Zero-Network Inverted Index)"]
        
        UI --> RoleRouter
        UI --> Lang
        UI --> Speech
        UI --> CamHUD
        UI --> MediaRec
        UI --> Search

        subgraph LocalStore ["IndexedDB (Dexie.js v4 · Schema Version 3)"]
            T1["inspections · checklistItems · inspectionResults"]
            T2["invoices · digitalSignatures · workEvidence"]
            T3["assetScanEvents · slaPolicies · equipmentHistory"]
            T4["photos · voiceNotes (IndexedDB Binary Blobs)"]
            T5["operations (Append-Only Replay Queue)"]
            T6["conflicts · auditEvents · offlinePackages"]
        end

        UI --> LocalStore
        CamHUD --> T4
        MediaRec --> T4
        LocalStore --> CRDT["Yjs CRDT Document Engine"]
    end

    subgraph SyncEngine ["Background Synchronization Controller"]
        Worker["Auto-Sync Engine (Online/Offline State Monitor & Periodic Poller)"]
        CloudSync["CloudSync Protocol (/src/lib/sync/cloudSync.ts)"]
        OpQueue["Idempotent Operations Queue (/src/lib/sync/syncService.ts)"]
        MediaUploader["Cloudinary Resumable Byte-Range Uploader"]
        
        CRDT --> Worker
        T5 --> OpQueue
        T4 --> MediaUploader
        Worker --> CloudSync
    end

    subgraph Cloud ["Cloud Infrastructure (Supabase & Cloudinary)"]
        SupabasePostgres["Supabase PostgreSQL 15 (Single Source of Truth)"]
        AuditTrail["Immutable Audit Table (public.audit_events)"]
        CloudinaryCDN["Cloudinary Storage (Direct Resumable Chunk Uploads)"]
        
        OpQueue -->|Direct Push / Operations Replay| SupabasePostgres
        CloudSync -->|Pull Latest Remote State| SupabasePostgres
        Worker --> AuditTrail
        MediaUploader --> CloudinaryCDN
    end
```

---

## 💡 How FieldSync Solves Core Offline-First Challenges

### 1. Robust Bi-Directional Cloud Synchronization
- **Online Execution**: Mutations are pushed immediately to Supabase PostgreSQL across active enterprise tables (`inspections`, `checklist_items`, `inspection_results`, `notes`, `invoices`, `digital_signatures`, `work_evidence`, `asset_scan_events`, `sla_policies`).
- **Offline Resilience**: When disconnected, changes write instantly to IndexedDB with optimistic UI updates and enqueue in `db.operations`.
- **Automatic Reconnection Replay**: Upon network restoration, `syncService.ts` replays pending operations idempotently against Supabase using monotonic logical clocks, guaranteeing zero data duplication.
- **Enterprise Row-Level Security (RLS) Compliance**: Writes to restricted audit trails are delegated to authenticated service-role pipelines, completely eliminating client-side 403 Forbidden errors.
- **Dynamic Table Recovery**: `cloudSync.ts` uses self-refreshing cache invalidation so newly created cloud tables are ingested immediately without requiring hard browser reloads.

### 2. Client-Side Non-Destructive Schema Evolution
- **Sequential Migration Pipeline**: Implemented in [`src/lib/db/schema.ts`](file:///c:/Users/tharu/Downloads/erodde/src/lib/db/schema.ts) via Dexie.js v4.
  - `Version 1`: Core relational tables (`users`, `devices`, `inspections`, `assets`, `checklistItems`, `inspectionResults`, `notes`, `media`, `operations`, `conflicts`, `auditEvents`, `syncState`, `appMetadata`).
  - `Version 2`: Adds priority grading, scheduled dates, checklist bounds/units, and retry counters with safe backfills.
  - `Version 3`: Adds `voiceNotes` audio Blobs, `inspectionProgress` state bookmarking, `offlinePackages`, and composite index `[inspectionId+checklistItemId]`.
- **Stale Client Safety**: Devices offline for extended periods execute intermediate migration transactions ($v_1 \rightarrow v_2 \rightarrow v_3$) sequentially on boot without resetting uncommitted evidence or local caches.

### 3. Resumable Chunked Media Ingestion
- **Byte-Range Pipeline ([`src/lib/media/resumableUpload.ts`](file:///c:/Users/tharu/Downloads/erodde/src/lib/media/resumableUpload.ts))**: Large photographs ($2\text{--}8$\,MB) are partitioned into 1\,MB chunks uploaded directly to Cloudinary using signed authentication.
- **Offset Persistence**: Confirmed byte positions are stored locally in IndexedDB after each chunk. If network drops mid-upload, transfers resume from the exact byte offset rather than restarting from zero.
- **Two-Tier Prioritization**: Lightweight telemetry and audio notes are synchronized ahead of heavy image payloads.

### 4. Transparent Conflict Resolution & Immutable Audit History
- **Conflict Center ([`src/pages/ConflictCenter.tsx`](file:///c:/Users/tharu/Downloads/erodde/src/pages/ConflictCenter.tsx))**: Detects multi-technician concurrent modifications on shared assets. Displays side-by-side visual diffs (*Local Value* vs. *Server Value*, conflicting technician, timestamp) with explicit adjudication options (`KEEP_MINE`, `KEEP_THEIR`, or manual merge).
- **Recent Activity & Audit Trail ([`src/pages/AuditHistory.tsx`](file:///c:/Users/tharu/Downloads/erodde/src/pages/AuditHistory.tsx))**: Append-only audit logging directly in PostgreSQL and IndexedDB. Displays exact user attribution, before/after values, entity IDs, and relative timestamps with zero synthetic mock data.

---

## 📱 Google Play Store Packaging (PWA & Android TWA)

FieldSync is fully configured for publication to the **Google Play Store** as an Android application via **Trusted Web Activity (TWA)** and Google Chrome's [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) tooling:

- **TWA Manifest**: Configured in [`twa-manifest.json`](file:///c:/Users/tharu/Downloads/erodde/twa-manifest.json) targeting Android SDK 34 (Android 14) with minimum SDK 24 (Android 7.0).
- **Web App Manifest**: Standalone display mode, high-res maskable adaptive icons ($192\times 192$, $512\times 512$), enterprise theme color `#1e40af`, and quick action shortcuts.
- **Service Worker Precaching**: Full offline asset precaching via `vite-plugin-pwa` and Workbox, supporting zero-network boot and background sync.

```bash
# Build Android APK / App Bundle (AAB) using Bubblewrap
npx @bubblewrap/cli init --manifest=https://fieldsyncerode.vercel.app/manifest.webmanifest
npx @bubblewrap/cli build
```

---

## 🧪 Automated Testing & Verification

FieldSync maintains **37 automated unit and integration tests across 8 comprehensive test suites**, all passing with 100% success rate:

```bash
# Run all automated test suites
npx vitest run

# Run TypeScript typecheck
npx tsc --noEmit

# Compile production bundle
npm run build
```

### Verified Test Suites (`src/tests/`):
1. **Permissions & Offline Diagnostics (`permissionsAndOffline.test.ts` - 6 tests)**: Validates camera and geolocation permission managers, offline state fallbacks, and retry policies.
2. **Billing & Invoices Flow (`billingFlow.test.ts` - 3 tests)**: Verifies automated parts and labor rate aggregation, tax calculations, and status transitions (`PENDING` $\rightarrow$ `PAID`).
3. **Enterprise Features (`enterpriseFeatures.test.ts` - 5 tests)**: Tests SLA tier escalations, role authorization guards, and dynamic multi-criteria search.
4. **Customer Workflow Suite (`customerWorkflow.test.ts` - 1 test)**: Validates end-to-end complaint logging, offline persistence, supervisor dispatch, and resolution verification.
5. **Offline Productivity Suite (`offlineProductivity.test.ts` - 8 tests)**: Confirms priority queue sorting, multilingual dictionary lookups, and local search queries.
6. **Local Database Suite (`localDatabase.test.ts` - 9 tests)**: Verifies Dexie.js v4 schema migrations, composite indexing, and CRUD operations on binary Blobs.
7. **Sync & Migration Suite (`syncAndMigration.test.ts` - 4 tests)**: Validates schema upgrades, pending operations serialization, and idempotent replay.
8. **Complete Business Workflow (`completeBusinessWorkflow.test.ts` - 1 test)**: End-to-end lifecycle verification spanning customer intake, triage, field inspection, dual signatures, and invoicing.

---

## 🚀 Local Development Setup

```bash
# Clone the repository
git clone https://github.com/mailanupuda/fieldsync.git
cd FieldSync

# Install dependencies
npm install

# Start local development server
npm run dev
```

Navigate to `http://localhost:5173` to test locally, or use the live production link: [https://fieldsyncerode.vercel.app](https://fieldsyncerode.vercel.app).
