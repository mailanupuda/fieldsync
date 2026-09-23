import { db } from './schema';
import type { Inspection, ChecklistItem, Asset, UserRecord, SlaPolicy } from '@/types/db';
import { v4 as uuidv4 } from 'uuid';

// ============================================================
// FieldSync — Generic Field Service Seed Data
// Roles: Customer -> Admin -> Supervisor -> Technician
// Categories: Network, IT Hardware, CCTV/Security, Electrical, IoT
// ============================================================

export const REAL_USER_IDS = {
  ADMIN: '00000000-0000-0000-0000-000000000001',
  SUPERVISOR: '00000000-0000-0000-0000-000000000002',
  TECHNICIAN: '00000000-0000-0000-0000-000000000003',
  CUSTOMER: '00000000-0000-0000-0000-000000000004',
  TECHNICIAN_2: '00000000-0000-0000-0000-000000000005',
};

export const DEFAULT_USERS: UserRecord[] = [
  {
    id: REAL_USER_IDS.ADMIN,
    email: 'tharun@gmail.com',
    fullName: 'Tharun',
    role: 'ADMIN',
    createdAt: '2025-01-15T08:00:00Z',
    updatedAt: '2025-01-15T08:00:00Z',
  },
  {
    id: REAL_USER_IDS.SUPERVISOR,
    email: 'abi@gmail.com',
    fullName: 'Abi Kumar',
    role: 'SUPERVISOR',
    createdAt: '2025-01-15T08:00:00Z',
    updatedAt: '2025-01-15T08:00:00Z',
  },
  {
    id: REAL_USER_IDS.TECHNICIAN,
    email: 'elakkiya@gmail.com',
    fullName: 'Elakkiya S',
    role: 'TECHNICIAN',
    createdAt: '2025-01-15T08:00:00Z',
    updatedAt: '2025-01-15T08:00:00Z',
  },
  {
    id: REAL_USER_IDS.CUSTOMER,
    email: 'customer@company.com',
    fullName: 'Bob Abd',
    role: 'CUSTOMER',
    createdAt: '2025-01-15T08:00:00Z',
    updatedAt: '2025-01-15T08:00:00Z',
  },
  {
    id: REAL_USER_IDS.TECHNICIAN_2,
    email: 'rajesh@fieldsync.io',
    fullName: 'Rajesh M',
    role: 'TECHNICIAN',
    createdAt: '2025-01-15T08:00:00Z',
    updatedAt: '2025-01-15T08:00:00Z',
  },
];

export async function deduplicateUsers(): Promise<void> {
  const allUsers = await db.users.toArray();
  const seenEmails = new Map<string, UserRecord>();
  const toDelete: string[] = [];

  for (const user of allUsers) {
    const emailKey = user.email.toLowerCase().trim();
    if (!seenEmails.has(emailKey)) {
      seenEmails.set(emailKey, user);
    } else {
      const existing = seenEmails.get(emailKey)!;
      if (user.fullName && !user.fullName.includes('(') && existing.fullName?.includes('(')) {
        toDelete.push(existing.id);
        seenEmails.set(emailKey, user);
      } else {
        toDelete.push(user.id);
      }
    }
  }

  for (const user of allUsers) {
    if (user.fullName?.includes('(') && !toDelete.includes(user.id)) {
      const emailKey = user.email.toLowerCase().trim();
      const realUser = allUsers.find(u => u.email.toLowerCase().trim() === emailKey && !u.fullName?.includes('('));
      if (realUser) {
        toDelete.push(user.id);
      }
    }
  }

  if (toDelete.length > 0) {
    await db.users.bulkDelete(toDelete);
    console.info(`[Seed] Deduplicated and removed ${toDelete.length} redundant user records.`);
  }
}

export async function ensureDefaultUsers(): Promise<void> {
  await deduplicateUsers();

  for (const u of DEFAULT_USERS) {
    const existing = await db.users.where('email').equalsIgnoreCase(u.email.trim()).first();
    if (!existing) {
      await db.users.put(u);
    } else if (existing.fullName !== u.fullName || existing.role !== u.role) {
      await db.users.update(existing.id, { fullName: u.fullName, role: u.role });
    }
  }

  // Migrate any previous 'Alex Morgan' records to 'Bob Abd' in local IndexedDB (use in-memory filter since fullName/reportedBy are not indexed)
  const currentUsers = await db.users.toArray();
  const previousAlex = currentUsers.filter(u => u.fullName && u.fullName.toLowerCase() === 'alex morgan');
  for (const u of previousAlex) {
    await db.users.update(u.id, { fullName: 'Bob Abd' });
  }

  const currentInspections = await db.inspections.toArray();
  const alexInspections = currentInspections.filter(i => i.reportedBy && i.reportedBy.toLowerCase() === 'alex morgan');
  for (const insp of alexInspections) {
    await db.inspections.update(insp.id, { reportedBy: 'Bob Abd' });
  }
}

export async function seedLocalDatabase(
  _userId?: string,
  _userName?: string,
  force = false
): Promise<void> {
  await ensureDefaultUsers();

  const existingInspections = await db.inspections.count();
  if (existingInspections > 0 && !force) {
    console.info('[Seed] Local database already seeded, skipping.');
    return;
  }

  if (force) {
    await db.inspections.clear();
    await db.checklistItems.clear();
    console.info('[Seed] Resetting service issues and checklist items for fresh generic seed...');
  }

  console.info('[Seed] Seeding local database with generic field service tickets...');

  // ── Generic Assets (Network, IT, Security, Electrical, IoT) ─────────────────
  const assets: Asset[] = [
    {
      id: 'a1000000-0000-0000-0000-000000000001',
      name: 'Wireless AP-204',
      assetCode: 'NET-AP204',
      location: 'Second Floor — Laboratory 2',
      type: 'OTHER',
      manufacturer: 'UniFi',
      model: 'U6-Enterprise',
      createdAt: '2025-01-15T08:00:00Z',
      updatedAt: '2025-01-15T08:00:00Z',
    },
    {
      id: 'a1000000-0000-0000-0000-000000000002',
      name: 'PTZ Security Camera CAM-04',
      assetCode: 'SEC-CAM04',
      location: 'North Perimeter — East Parking Entry',
      type: 'OTHER',
      manufacturer: 'Axis Communications',
      model: 'Q6135-LE',
      createdAt: '2025-01-15T08:00:00Z',
      updatedAt: '2025-01-15T08:00:00Z',
    },
    {
      id: 'a1000000-0000-0000-0000-000000000003',
      name: 'Modular UPS Unit 3000VA',
      assetCode: 'PWR-UPS01',
      location: 'Main Facility — Server Room B',
      type: 'OTHER',
      manufacturer: 'APC Schneider',
      model: 'Smart-UPS RT 3000',
      createdAt: '2025-01-15T08:00:00Z',
      updatedAt: '2025-01-15T08:00:00Z',
    },
    {
      id: 'a1000000-0000-0000-0000-000000000004',
      name: 'RFID Badge Reader R-12',
      assetCode: 'ACC-R12',
      location: 'Administration Wing A — Main Portal',
      type: 'OTHER',
      manufacturer: 'HID Global',
      model: 'Signo 40',
      createdAt: '2025-01-15T08:00:00Z',
      updatedAt: '2025-01-15T08:00:00Z',
    },
    {
      id: 'a1000000-0000-0000-0000-000000000005',
      name: 'Environmental IoT Telemetry Gateway',
      assetCode: 'IOT-GW01',
      location: 'Logistics Facility — Cold Storage 3',
      type: 'OTHER',
      manufacturer: 'Advantech',
      model: 'WISE-4012',
      createdAt: '2025-01-15T08:00:00Z',
      updatedAt: '2025-01-15T08:00:00Z',
    },
  ];

  await db.assets.bulkPut(assets);

  // ── Customer Service Issues Across the 6 Stages ───────────────────────────
  const now = new Date().toISOString();
  const pastHour = new Date(Date.now() - 3600 * 1000).toISOString();
  const past2Hours = new Date(Date.now() - 7200 * 1000).toISOString();

  const seedIssues: Inspection[] = [
    {
      id: 'b1000000-0000-0000-0000-000000000001',
      title: 'Wi-Fi connection unavailable in second-floor laboratory',
      siteName: 'Second Floor — Laboratory 2',
      assetId: 'a1000000-0000-0000-0000-000000000001',
      category: 'NETWORK',
      status: 'IN_PROGRESS',
      issueStatus: 'IN_PROGRESS',
      priority: 'HIGH',
      workflowStage: 'FIELD_WORK',
      reportedBy: 'Bob Abd',
      customerId: REAL_USER_IDS.CUSTOMER,
      customerEmail: 'customer@company.com',
      customerPhone: '+1 (555) 234-8901',
      customerNotes: 'The laboratory Wi-Fi connection has stopped working. Research workstations cannot authenticate to the laboratory subnet.',
      supervisorId: REAL_USER_IDS.SUPERVISOR,
      supervisorName: 'Abi Kumar',
      supervisorNotes: 'Check PoE switch port 14 output first. Measure downlink RSSI after power cycle and ensure VLAN 20 is tagged.',
      supervisedAt: pastHour,
      assignedTo: [REAL_USER_IDS.TECHNICIAN],
      assignedAt: past2Hours,
      createdAt: past2Hours,
      updatedAt: now,
      serverVersion: 1,
      localVersion: 1,
      syncStatus: 'SYNCED',
    },
    {
      id: 'b1000000-0000-0000-0000-000000000002',
      title: 'Security camera offline at East Parking Entry',
      siteName: 'North Perimeter — East Parking Entry',
      assetId: 'a1000000-0000-0000-0000-000000000002',
      category: 'CCTV_SECURITY',
      status: 'IN_PROGRESS',
      issueStatus: 'PENDING_VERIFICATION',
      priority: 'CRITICAL',
      workflowStage: 'AWAITING_VERIFICATION',
      reportedBy: 'Security Operations Desk',
      customerEmail: 'security@facility.org',
      customerPhone: '+1 (555) 901-4432',
      customerNotes: 'Video feed disconnected at 06:30. NVR shows RTSP handshake timeout on Channel 4.',
      supervisorId: REAL_USER_IDS.SUPERVISOR,
      supervisorName: 'Abi Kumar',
      supervisorNotes: 'Inspect exterior waterproof RJ45 coupling and test with inline PoE tester.',
      supervisedAt: past2Hours,
      assignedTo: [REAL_USER_IDS.TECHNICIAN],
      technicianCompletedAt: now,
      assignedAt: past2Hours,
      createdAt: past2Hours,
      updatedAt: now,
      serverVersion: 1,
      localVersion: 1,
      syncStatus: 'SYNCED',
    },
    {
      id: 'b1000000-0000-0000-0000-000000000003',
      title: 'UPS backup battery audible alarm in Server Room B',
      siteName: 'Main Facility — Server Room B',
      assetId: 'a1000000-0000-0000-0000-000000000003',
      category: 'ELECTRICAL',
      status: 'PENDING',
      issueStatus: 'NEW',
      priority: 'HIGH',
      workflowStage: 'RAISED',
      reportedBy: 'DevOps Infrastructure Lead',
      customerEmail: 'devops@company.com',
      customerPhone: '+1 (555) 782-1199',
      customerNotes: 'Beeping error code LED #3 indicating internal battery pack impedance fault.',
      assignedTo: [],
      assignedAt: now,
      createdAt: now,
      updatedAt: now,
      serverVersion: 1,
      localVersion: 1,
      syncStatus: 'SYNCED',
    },
    {
      id: 'b1000000-0000-0000-0000-000000000004',
      title: 'Card reader not unlocking main portal entrance',
      siteName: 'Administration Wing A — Main Portal',
      assetId: 'a1000000-0000-0000-0000-000000000004',
      category: 'IT_HARDWARE',
      status: 'PENDING',
      issueStatus: 'ASSIGNED',
      priority: 'MEDIUM',
      workflowStage: 'ASSIGNED',
      reportedBy: 'Human Resources Front Office',
      customerEmail: 'hr@company.com',
      customerNotes: 'Staff badges trigger red blink with no relay activation on the magnetic lock.',
      supervisorId: REAL_USER_IDS.SUPERVISOR,
      supervisorName: 'Abi Kumar',
      assignedTo: [REAL_USER_IDS.TECHNICIAN],
      assignedAt: now,
      createdAt: pastHour,
      updatedAt: now,
      serverVersion: 1,
      localVersion: 1,
      syncStatus: 'SYNCED',
    },
    {
      id: 'b1000000-0000-0000-0000-000000000005',
      title: 'Telemetry gateway offline in Cold Storage facility',
      siteName: 'Logistics Facility — Cold Storage 3',
      assetId: 'a1000000-0000-0000-0000-000000000005',
      category: 'IOT_SYSTEMS',
      status: 'COMPLETED',
      issueStatus: 'RESOLVED',
      priority: 'MEDIUM',
      workflowStage: 'RESOLVED',
      reportedBy: 'Cold Chain Compliance Officer',
      customerEmail: 'compliance@logistics.com',
      customerNotes: 'Loss of MQTT heartbeat packets since yesterday afternoon.',
      supervisorId: REAL_USER_IDS.SUPERVISOR,
      supervisorName: 'Abi Kumar',
      supervisorNotes: 'Replace 24V DC auxiliary power adapter and reboot gateway.',
      assignedTo: [REAL_USER_IDS.TECHNICIAN],
      technicianCompletedAt: pastHour,
      verifiedBy: REAL_USER_IDS.SUPERVISOR,
      verifiedByName: 'Abi Kumar',
      verifiedAt: now,
      resolutionSummary: 'Defective 24V DIN-rail power supply replaced. Gateway reconnected to MQTT broker, packet transmission verified with 100% telemetry uptime.',
      assignedAt: past2Hours,
      createdAt: past2Hours,
      updatedAt: now,
      serverVersion: 1,
      localVersion: 1,
      syncStatus: 'SYNCED',
    },
  ];

  for (const issue of seedIssues) {
    await db.inspections.put(issue);
  }

  // ── Generic Service Diagnostic Checklist Items ───────────────────────────
  const genericChecklistQuestions: Omit<ChecklistItem, 'id'>[] = [
    { inspectionId: '', question: 'Visual condition of device, mountings, and enclosures', type: 'GOOD_DAMAGED', required: true, order: 1, createdAt: now },
    { inspectionId: '', question: 'Power supply voltage & LED indicator status verified', type: 'PASS_FAIL', required: true, order: 2, createdAt: now },
    { inspectionId: '', question: 'Physical cabling and connector integrity secure', type: 'PASS_FAIL', required: true, order: 3, createdAt: now },
    { inspectionId: '', question: 'Key signal / operating measurement recorded', type: 'NUMERIC', required: false, order: 4, unit: 'dBm / V', minValue: -120, maxValue: 500, createdAt: now },
    { inspectionId: '', question: 'Communication / network handshake confirmed operational', type: 'PASS_FAIL', required: true, order: 5, createdAt: now },
    { inspectionId: '', question: 'Corrective maintenance / component replacement completed', type: 'PASS_FAIL', required: true, order: 6, createdAt: now },
    { inspectionId: '', question: 'Field technician observations & findings', type: 'TEXT', required: false, order: 7, createdAt: now },
  ];

  for (const issue of seedIssues) {
    for (const q of genericChecklistQuestions) {
      await db.checklistItems.put({
        ...q,
        id: uuidv4(),
        inspectionId: issue.id,
      });
    }
  }

  // ── Authentic Initial Audit Events across All Roles ────────────────────────
  const initialAuditEvents = [
    {
      id: uuidv4(),
      userId: REAL_USER_IDS.SUPERVISOR,
      userName: 'Abi Kumar',
      deviceId: 'device-supervisor',
      entityType: 'INSPECTION',
      entityId: 'b1000000-0000-0000-0000-000000000005',
      inspectionId: 'b1000000-0000-0000-0000-000000000005',
      action: 'INSPECTION_COMPLETED' as const,
      field: 'resolutionSummary',
      afterValue: 'Defective 24V DIN-rail power supply replaced. Gateway verified operational.',
      createdAt: now,
    },
    {
      id: uuidv4(),
      userId: REAL_USER_IDS.TECHNICIAN,
      userName: 'Elakkiya S',
      deviceId: 'device-tech',
      entityType: 'INSPECTION',
      entityId: 'b1000000-0000-0000-0000-000000000002',
      inspectionId: 'b1000000-0000-0000-0000-000000000002',
      action: 'UPDATED' as const,
      field: 'workflowStage',
      afterValue: 'Awaiting verification after inline PoE testing',
      createdAt: pastHour,
    },
    {
      id: uuidv4(),
      userId: REAL_USER_IDS.TECHNICIAN,
      userName: 'Elakkiya S',
      deviceId: 'device-tech',
      entityType: 'INSPECTION',
      entityId: 'b1000000-0000-0000-0000-000000000001',
      inspectionId: 'b1000000-0000-0000-0000-000000000001',
      action: 'UPDATED' as const,
      field: 'status',
      afterValue: 'Started field diagnostics on second-floor lab Wi-Fi',
      createdAt: pastHour,
    },
    {
      id: uuidv4(),
      userId: REAL_USER_IDS.SUPERVISOR,
      userName: 'Abi Kumar',
      deviceId: 'device-supervisor',
      entityType: 'INSPECTION',
      entityId: 'b1000000-0000-0000-0000-000000000004',
      inspectionId: 'b1000000-0000-0000-0000-000000000004',
      action: 'CREATED' as const,
      field: 'assignedTo',
      afterValue: 'Assigned portal card reader dispatch to Elakkiya S',
      createdAt: past2Hours,
    },
    {
      id: uuidv4(),
      userId: REAL_USER_IDS.CUSTOMER,
      userName: 'Bob Abd',
      deviceId: 'device-customer',
      entityType: 'INSPECTION',
      entityId: 'b1000000-0000-0000-0000-000000000003',
      inspectionId: 'b1000000-0000-0000-0000-000000000003',
      action: 'CREATED' as const,
      field: 'title',
      afterValue: 'Reported UPS battery audible alarm in Server Room B',
      createdAt: past2Hours,
    },
    {
      id: uuidv4(),
      userId: REAL_USER_IDS.ADMIN,
      userName: 'Tharun',
      deviceId: 'device-admin',
      entityType: 'SYNC',
      entityId: 'b1000000-0000-0000-0000-000000000001',
      inspectionId: 'b1000000-0000-0000-0000-000000000001',
      action: 'SYNCED' as const,
      afterValue: 'Cloud synchronization with Supabase completed successfully',
      createdAt: past2Hours,
    },
  ];

  for (const event of initialAuditEvents) {
    await db.auditEvents.put(event);
  }

  // ── Database-Driven SLA Policies ──────────────────────────────────────────
  const existingSla = await db.slaPolicies.count();
  if (existingSla === 0) {
    await db.slaPolicies.bulkPut(DEFAULT_SLA_POLICIES);
  }

  console.info(`[Seed] Seeded ${seedIssues.length} generic field service issues, checklist items, and audit activities.`);
}

export const DEFAULT_SLA_POLICIES: SlaPolicy[] = [
  { id: 's1000000-0000-0000-0000-000000000001', priority: 'CRITICAL', category: 'ALL', responseMinutes: 15, resolutionMinutes: 240, escalation1Minutes: 60, escalation2Minutes: 120 },
  { id: 's1000000-0000-0000-0000-000000000002', priority: 'HIGH', category: 'ALL', responseMinutes: 60, resolutionMinutes: 480, escalation1Minutes: 120, escalation2Minutes: 240 },
  { id: 's1000000-0000-0000-0000-000000000003', priority: 'MEDIUM', category: 'ALL', responseMinutes: 240, resolutionMinutes: 1440, escalation1Minutes: 360, escalation2Minutes: 720 },
  { id: 's1000000-0000-0000-0000-000000000004', priority: 'LOW', category: 'ALL', responseMinutes: 480, resolutionMinutes: 2880, escalation1Minutes: 720, escalation2Minutes: 1440 },
];

export const seedDatabase = seedLocalDatabase;
