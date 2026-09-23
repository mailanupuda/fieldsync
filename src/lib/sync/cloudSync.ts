import { supabase } from '../auth/supabaseClient';
import { db } from '../db/schema';
import { seedLocalDatabase, ensureDefaultUsers } from '../db/seed';
import { yjsManager } from '../crdt/yjsManager';
import type {
  Inspection,
  Asset,
  ChecklistItem,
  AuditEvent,
  Invoice,
  InspectionResult,
  Note,
  DigitalSignature,
  WorkEvidence,
  AssetScanEvent,
  SlaPolicy,
} from '@/types/db';

// Cache missing Supabase tables to avoid repeated 404 network error spam in browser.
// Cleared every 5 minutes so newly-created tables get picked up without page reload.
const missingTables = new Set<string>();
let lastCacheClear = Date.now();
const CACHE_TTL_MS = 5 * 60 * 1000;

async function safeFetchRows<T = Record<string, any>>(
  tableName: string,
  fetcher: () => PromiseLike<{ data: any; error: any }>
): Promise<T[] | null> {
  // Clear stale cache so migration-created tables are retried
  if (Date.now() - lastCacheClear > CACHE_TTL_MS) {
    missingTables.clear();
    lastCacheClear = Date.now();
  }
  if (missingTables.has(tableName)) {
    return null;
  }

  try {
    const { data, error } = await fetcher();
    if (error) {
      if (
        error.code === 'PGRST205' ||
        error.code === '42P01' ||
        error.code === 'PGRST204' ||
        error.status === 404 ||
        error.message?.includes('does not exist')
      ) {
        missingTables.add(tableName);
        console.info(`[CloudSync] Remote table '${tableName}' is not in Supabase yet. Operating with local IndexedDB records.`);
        return null;
      }
      return null;
    }
    return data;
  } catch {
    missingTables.add(tableName);
    return null;
  }
}

export async function syncFromSupabase(): Promise<boolean> {
  try {
    // 1. Fetch remote inspections
    const { data: remoteInspections, error: inspErr } = await supabase
      .from('inspections')
      .select('*');

    if (inspErr || !remoteInspections || remoteInspections.length === 0) {
      console.info('[CloudSync] No remote inspections found in Supabase. Ensuring local seed data...');
      await ensureLocalSeedIfEmpty();
      return false;
    }

    const localInspections: Inspection[] = remoteInspections.map((row) => ({
      id: row.id,
      title: row.title,
      siteName: row.site_name,
      assetId: row.asset_id ?? '',
      category: row.category ?? 'GENERAL',
      status: row.status ?? 'PENDING',
      issueStatus: row.issue_status ?? 'NEW',
      priority: row.priority ?? 'MEDIUM',
      workflowStage: row.workflow_stage ?? 'RAISED',
      assignedTo: row.assigned_to ? [row.assigned_to] : [],
      assignedAt: row.assigned_at ?? row.created_at,
      supervisorId: row.supervisor_id ?? undefined,
      supervisorName: row.supervisor_name ?? undefined,
      supervisorNotes: row.supervisor_notes ?? undefined,
      supervisedAt: row.supervised_at ?? undefined,
      reportedBy: row.reported_by ?? undefined,
      customerId: row.customer_id ?? undefined,
      customerEmail: row.customer_email ?? undefined,
      customerPhone: row.customer_phone ?? undefined,
      customerNotes: row.customer_notes ?? undefined,
      technicianCompletedAt: row.technician_completed_at ?? undefined,
      reworkReason: row.rework_reason ?? undefined,
      verifiedBy: row.verified_by ?? undefined,
      verifiedByName: row.verified_by_name ?? undefined,
      verifiedAt: row.verified_at ?? undefined,
      resolutionSummary: row.resolution_summary ?? undefined,
      assetVerifiedAt: row.asset_verified_at ?? undefined,
      assetVerifiedCode: row.asset_verified_code ?? undefined,
      resolutionDeadline: row.resolution_deadline ?? undefined,
      escalationLevel: row.escalation_level ?? 0,
      scheduledDate: row.scheduled_date ?? undefined,
      version: row.version ?? 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      serverVersion: row.version ?? 1,
      localVersion: row.version ?? 1,
      syncStatus: 'SYNCED',
    }));

    await db.inspections.bulkPut(localInspections);
    console.info(`[CloudSync] Synced ${localInspections.length} inspections from Supabase.`);

    // 2. Fetch remote assets
    const { data: remoteAssets } = await supabase.from('assets').select('*');
    if (remoteAssets && remoteAssets.length > 0) {
      const localAssets: Asset[] = remoteAssets.map((row) => ({
        id: row.id,
        name: row.name,
        assetCode: row.asset_code,
        location: row.location,
        type: row.type,
        manufacturer: row.manufacturer ?? undefined,
        model: row.model ?? undefined,
        installDate: row.install_date ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
      await db.assets.bulkPut(localAssets);
    }

    // 3. Fetch remote checklist items
    const { data: remoteItems } = await supabase.from('checklist_items').select('*');
    if (remoteItems && remoteItems.length > 0) {
      const localItems: ChecklistItem[] = remoteItems.map((row) => ({
        id: row.id,
        inspectionId: row.inspection_id,
        question: row.question,
        type: row.type,
        required: row.required ?? true,
        order: row.sort_order ?? 0,
        unit: row.unit ?? undefined,
        minValue: row.min_value ?? undefined,
        maxValue: row.max_value ?? undefined,
        options: row.options ?? undefined,
        createdAt: row.created_at,
      }));
      await db.checklistItems.bulkPut(localItems);
    }

    // 4. Fetch remote audit events directly from Supabase database (safe against RLS 403)
    const remoteAuditEvents = await safeFetchRows('audit_events', () =>
      supabase.from('audit_events').select('*').order('created_at', { ascending: false }).limit(50)
    );

    if (remoteAuditEvents && remoteAuditEvents.length > 0) {
      const localAuditEvents: AuditEvent[] = remoteAuditEvents.map((row) => ({
        id: row.id,
        operationId: row.operation_id ?? undefined,
        userId: row.user_id ?? '',
        userName: row.user_name || 'Staff Member',
        deviceId: row.device_id ?? 'device-cloud',
        entityType: row.entity_type ?? 'INSPECTION',
        entityId: row.entity_id ?? row.id,
        inspectionId: row.inspection_id ?? row.entity_id ?? '',
        action: (row.action ?? 'UPDATED') as import('@/types/db').AuditAction,
        field: row.field ?? undefined,
        beforeValue: row.before_value ?? undefined,
        afterValue: row.after_value ?? undefined,
        createdAt: row.created_at,
      }));
      await db.auditEvents.bulkPut(localAuditEvents);
      console.info(`[CloudSync] Synced ${localAuditEvents.length} audit events directly from Supabase.`);
    }

    // 5. Fetch remote invoices from Supabase (safe against missing table 404)
    const remoteInvoices = await safeFetchRows('invoices', () =>
      supabase.from('invoices').select('*').order('created_at', { ascending: false })
    );

    if (remoteInvoices && remoteInvoices.length > 0) {
      const localInvoices: Invoice[] = remoteInvoices.map((row) => ({
        id: row.id,
        invoiceNumber: row.invoice_number,
        inspectionId: row.inspection_id,
        inspectionTitle: row.inspection_title || '',
        customerId: row.customer_id ?? undefined,
        customerName: row.customer_name || 'Valued Client',
        customerEmail: row.customer_email ?? undefined,
        customerPhone: row.customer_phone ?? undefined,
        technicianId: row.technician_id ?? '',
        technicianName: row.technician_name || 'Field Technician',
        labourCharges: Number(row.labour_charges || 0),
        partsCharges: Number(row.parts_charges || 0),
        travelCharges: Number(row.travel_charges || 0),
        otherCharges: Number(row.other_charges || 0),
        discount: Number(row.discount || 0),
        taxPercent: Number(row.tax_percent || 18),
        taxAmount: Number(row.tax_amount || 0),
        subtotal: Number(row.subtotal || 0),
        grandTotal: Number(row.grand_total || 0),
        status: row.status as import('@/types/db').InvoiceStatus,
        paymentMethod: row.payment_method ?? undefined,
        paymentReference: row.payment_reference ?? undefined,
        paidAt: row.paid_at ?? undefined,
        qrPayload: row.qr_payload,
        notes: row.notes ?? undefined,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        syncStatus: 'SYNCED',
      }));
      await db.invoices.bulkPut(localInvoices);
      console.info(`[CloudSync] Synced ${localInvoices.length} invoices from Supabase.`);
    }

    // 6. Fetch remote inspection results & sync with Yjs
    const { data: remoteResults } = await supabase.from('inspection_results').select('*');
    if (remoteResults && remoteResults.length > 0) {
      const localResults: InspectionResult[] = remoteResults.map((row) => ({
        id: row.id,
        inspectionId: row.inspection_id,
        checklistItemId: row.checklist_item_id,
        value: typeof row.value === 'string' ? row.value : JSON.stringify(row.value),
        valueType: row.value_type || 'string',
        updatedBy: row.updated_by ?? '',
        updatedAt: row.updated_at,
        version: row.version ?? 1,
        localVersion: row.version ?? 1,
        syncStatus: 'SYNCED',
      }));
      await db.inspectionResults.bulkPut(localResults);
      for (const res of localResults) {
        try {
          yjsManager.setResult(res.inspectionId, res.checklistItemId, res.value);
        } catch {
          // ignore doc not initialized
        }
      }
    }

    // 7. Fetch remote notes
    const { data: remoteNotes } = await supabase.from('notes').select('*');
    if (remoteNotes && remoteNotes.length > 0) {
      const localNotes: Note[] = remoteNotes.map((row) => ({
        id: row.id,
        inspectionId: row.inspection_id,
        authorId: row.author_id ?? '',
        authorName: row.author_name || 'Staff Member',
        content: row.content || row.text || '',
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        syncStatus: 'SYNCED',
      }));
      await db.notes.bulkPut(localNotes);
    }

    // 8. Fetch remote digital signatures (safe against missing table 404)
    const remoteSigs = await safeFetchRows('digital_signatures', () =>
      supabase.from('digital_signatures').select('*')
    );
    if (remoteSigs && remoteSigs.length > 0) {
      const localSigs: DigitalSignature[] = remoteSigs.map((row) => ({
        id: row.id,
        inspectionId: row.inspection_id,
        signerId: row.signer_id ?? '',
        signerName: row.signer_name || 'Authorized Signatory',
        signerRole: row.signer_role,
        signatureDataUrl: row.signature_data_url,
        signedAt: row.signed_at,
        declarationText: row.declaration_text || 'Compliance verification certified.',
        checksum: row.checksum ?? undefined,
        syncStatus: 'SYNCED',
      }));
      await db.digitalSignatures.bulkPut(localSigs);
    }

    // 9. Fetch remote work evidence (safe against missing table 404)
    const remoteEvidence = await safeFetchRows('work_evidence', () =>
      supabase.from('work_evidence').select('*')
    );
    if (remoteEvidence && remoteEvidence.length > 0) {
      const localEvidence: WorkEvidence[] = remoteEvidence.map((row) => ({
        id: row.id,
        inspectionId: row.inspection_id,
        stage: row.stage,
        title: row.title || 'Work Evidence',
        description: row.description ?? undefined,
        photoUrl: row.photo_url ?? undefined,
        capturedBy: row.captured_by ?? '',
        capturedByName: row.captured_by_name || 'Technician',
        capturedAt: row.captured_at,
        gpsLatitude: row.gps_latitude ? Number(row.gps_latitude) : undefined,
        gpsLongitude: row.gps_longitude ? Number(row.gps_longitude) : undefined,
        syncStatus: 'SYNCED',
      }));
      await db.workEvidence.bulkPut(localEvidence);
    }

    // 10. Fetch remote asset scan events (safe against missing table 404)
    const remoteScans = await safeFetchRows('asset_scan_events', () =>
      supabase.from('asset_scan_events').select('*')
    );
    if (remoteScans && remoteScans.length > 0) {
      const localScans: AssetScanEvent[] = remoteScans.map((row) => ({
        id: row.id,
        assetId: row.asset_id,
        inspectionId: row.inspection_id,
        scannedCode: row.scanned_code,
        expectedCode: row.expected_code,
        isMatch: row.is_match ?? true,
        scannedBy: row.scanned_by ?? '',
        scannerName: row.scanner_name || 'Staff Member',
        deviceId: row.device_id || 'cloud-sync',
        scannedAt: row.scanned_at,
        syncStatus: 'SYNCED',
      }));
      await db.assetScanEvents.bulkPut(localScans);
    }

    // 11. Fetch remote SLA policies (safe against missing table 404)
    const remoteSla = await safeFetchRows('sla_policies', () =>
      supabase.from('sla_policies').select('*')
    );
    if (remoteSla && remoteSla.length > 0) {
      const localSla: SlaPolicy[] = remoteSla.map((row) => ({
        id: row.id,
        priority: row.priority,
        category: row.category || 'ALL',
        responseMinutes: Number(row.response_minutes),
        resolutionMinutes: Number(row.resolution_minutes),
        escalation1Minutes: Number(row.escalation_1_minutes),
        escalation2Minutes: Number(row.escalation_2_minutes),
      }));
      await db.slaPolicies.bulkPut(localSla);
    }

    // Note: audit_events are securely pushed server-side via syncManager /api/sync/push
    // to comply with Supabase Row-Level-Security (RLS). Voice notes remain stored in local IndexedDB.

    return true;
  } catch (err) {
    console.warn('[CloudSync] Failed to sync from Supabase, falling back to local database:', err);
    await ensureLocalSeedIfEmpty();
    return false;
  }
}

export async function ensureLocalSeedIfEmpty(): Promise<void> {
  await ensureDefaultUsers();
  const count = await db.inspections.count();
  const auditCount = await db.auditEvents.count();
  if (count === 0 || auditCount === 0) {
    console.info('[CloudSync] Ensuring local database records are seeded...');
    await seedLocalDatabase(undefined, undefined, false);
  }
}

