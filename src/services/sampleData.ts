import { collection, writeBatch, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  LocationItem,
  EquipmentItem,
  WorkOrder,
  WorkOrderPhoto,
  WorkOrderComment,
  WorkOrderHistory,
  InventoryItem,
  InventoryTransaction,
  WorkOrderMaterial,
} from '../types';

// Helper to generate a realistic technical photo as compressed base64 JPEG
function generateSamplePhotoDataUrl(title: string, tag: string, color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;

  // Background
  const gradient = ctx.createLinearGradient(0, 0, 640, 480);
  gradient.addColorStop(0, '#1e293b');
  gradient.addColorStop(1, '#0f172a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 640, 480);

  // Technical grid pattern
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 0; x < 640; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 480);
    ctx.stroke();
  }
  for (let y = 0; y < 480; y += 40) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(640, y);
    ctx.stroke();
  }

  // Equipment icon placeholder box
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.roundRect(80, 80, 480, 260, 16);
  ctx.fill();

  // Header banner on photo
  ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
  ctx.fillRect(80, 80, 480, 60);

  // Status tag badge
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(tag.toUpperCase(), 105, 118);

  // Title text
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 24px sans-serif';
  ctx.fillText(title, 105, 200);

  // Date timestamp watermark
  ctx.fillStyle = '#94a3b8';
  ctx.font = '16px monospace';
  const now = new Date().toISOString().replace('T', ' ').substring(0, 19);
  ctx.fillText(`CAM-FACILITY-LOG: ${now}`, 105, 290);
  ctx.fillText('ĐỘ PHÂN GIẢI NÉN: 640x480 JPEG Q0.7 (<150KB)', 105, 315);

  // Bottom info
  ctx.fillStyle = '#cbd5e1';
  ctx.font = 'italic 16px sans-serif';
  ctx.fillText('Ảnh ghi nhận hiện trường kỹ thuật cơ sở vật chất', 105, 400);

  return canvas.toDataURL('image/jpeg', 0.72);
}

export async function seedSampleData(adminUid: string, adminName: string) {
  try {
    const batch = writeBatch(db);

    // 1. Locations
    const locations: LocationItem[] = [
      {
        id: 'loc-01',
        name: 'Hầm B1 - Phòng Kỹ thuật & Trạm Biến áp',
        description: 'Khu vực đặt hệ thống cơ điện chính, máy biến áp và máy phát điện',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'loc-02',
        name: 'Tầng 1 - Sảnh chính & Lễ tân',
        description: 'Khu vực đón tiếp, sảnh thang máy và văn phòng hành chính',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'loc-03',
        name: 'Tầng 2 - Khối văn phòng & IT',
        description: 'Văn phòng làm việc mở, khu pantry và phòng họp lớn',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'loc-04',
        name: 'Tầng 2 - Phòng Máy chủ (Server Room)',
        description: 'Trung tâm dữ liệu máy chủ và viễn thông tòa nhà',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'loc-05',
        name: 'Tầng Mái - Trạm Chiller & Tháp giải nhiệt',
        description: 'Khu vực thiết bị làm mát không khí trung tâm trên mái',
        createdAt: new Date().toISOString(),
      },
    ];

    locations.forEach((locItem) => {
      batch.set(doc(db, 'locations', locItem.id), locItem);
    });

    // 2. Equipment
    const equipmentList: EquipmentItem[] = [
      {
        id: 'eq-01',
        code: 'MBA-400',
        name: 'Máy biến áp Schneider Trihal 400kVA',
        category: 'Hệ thống Điện',
        locationId: 'loc-01',
        status: 'active',
        purchaseDate: '2023-01-15',
        notes: 'Bảo dưỡng định kỳ 6 tháng/lần. Kiểm tra dầu và sứ cách điện.',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'eq-02',
        code: 'MPD-250',
        name: 'Máy phát điện dự phòng Cummins 250kVA',
        category: 'Hệ thống Điện dự phòng',
        locationId: 'loc-01',
        status: 'active',
        purchaseDate: '2022-11-20',
        notes: 'Chạy không tải định kỳ vào thứ Bảy tuần đầu tiên của tháng.',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'eq-03',
        code: 'VRV-T2',
        name: 'Hệ thống điều hòa trung tâm Daikin VRV IV',
        category: 'Hệ thống HVAC',
        locationId: 'loc-03',
        status: 'maintenance',
        purchaseDate: '2023-05-10',
        notes: 'Đang kiểm tra rò rỉ đường nước ngưng dàn lạnh số 4.',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'eq-04',
        code: 'BCH-DIE',
        name: 'Bơm chữa cháy động cơ Diesel Pentax 75kW',
        category: 'Hệ thống PCCC',
        locationId: 'loc-01',
        status: 'active',
        purchaseDate: '2022-09-01',
        notes: 'Kiểm tra bình ắc quy đề nổ và mức dầu diesel hàng tuần.',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'eq-05',
        code: 'TM-SCH-01',
        name: 'Thang máy hành khách Schindler 3300 AP',
        category: 'Thang máy',
        locationId: 'loc-02',
        status: 'active',
        purchaseDate: '2023-03-12',
        notes: 'Hợp đồng bảo trì trọn gói chính hãng Schindler Việt Nam.',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'eq-06',
        code: 'PAC-SRV',
        name: 'Điều hòa chính xác Emicon Precision Cool 15kW',
        category: 'Hệ thống HVAC',
        locationId: 'loc-04',
        status: 'broken',
        purchaseDate: '2023-08-01',
        notes: 'Báo lỗi áp suất gas thấp, quạt gió dàn nóng không quay.',
        createdAt: new Date().toISOString(),
      },
    ];

    equipmentList.forEach((eqItem) => {
      batch.set(doc(db, 'equipment', eqItem.id), eqItem);
    });

    // 3. Work Orders
    const now = new Date();
    const isoNow = now.toISOString();
    const yesterday = new Date(Date.now() - 86400000 * 2).toISOString();
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const nextWeek = new Date(Date.now() + 86400000 * 5).toISOString();

    const workOrders: WorkOrder[] = [
      {
        id: 'wo-01',
        code: 'CV-2026-0001',
        source: 'request',
        title: 'Điều hòa phòng họp Tầng 2 rò rỉ nước ngưng',
        description: 'Nước nhỏ giọt từ trần thạch cao xuống bàn họp lớn tại phòng họp A2. Cần kỹ thuật kiểm tra và thông tắc máng nước ngưng gấp.',
        priority: 'cao',
        status: 'Đang xử lý',
        equipmentId: 'eq-03',
        locationId: 'loc-03',
        requesterId: adminUid,
        requesterName: adminName,
        requesterEmail: 'lenguyenphuctho@gmail.com',
        assigneeId: adminUid,
        assigneeName: adminName,
        dueDate: tomorrow,
        createdAt: yesterday,
        laborCost: 150000,
        externalCost: 0,
      },
      {
        id: 'wo-02',
        code: 'CV-2026-0002',
        source: 'internal',
        title: 'Bảo dưỡng định kỳ Máy phát điện Cummins và thử tải tự động',
        description: 'Thay thế lọc dầu, lọc nhiên liệu, kiểm tra dung dịch làm mát két nước và thử kích hoạt tủ chuyển nguồn tự động ATS.',
        priority: 'trung_binh',
        status: 'Hoàn thành',
        equipmentId: 'eq-02',
        locationId: 'loc-01',
        requesterId: adminUid,
        requesterName: adminName,
        assigneeId: adminUid,
        assigneeName: adminName,
        dueDate: yesterday,
        createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
        completedAt: yesterday,
        laborCost: 350000,
        externalCost: 0,
      },
      {
        id: 'wo-03',
        code: 'CV-2026-0003',
        source: 'request',
        title: 'Cảnh báo nhiệt độ tăng cao tại tủ Rack 2 - Phòng Máy chủ',
        description: 'Hệ thống giám sát gửi cảnh báo nhiệt độ tủ máy chủ đạt 31 độ C. Điều hòa chính xác PAC-SRV đang ngừng hoạt động.',
        priority: 'khan_cap',
        status: 'Mới',
        equipmentId: 'eq-06',
        locationId: 'loc-04',
        requesterId: adminUid,
        requesterName: 'Nguyễn Văn Minh (IT Admin)',
        dueDate: isoNow,
        createdAt: isoNow,
      },
      {
        id: 'wo-04',
        code: 'CV-2026-0004',
        source: 'request',
        title: 'Thang máy khách P1 phát tiếng kêu lạ khi mở cửa tầng 1',
        description: 'Cửa tầng 1 thang máy Schindler mở bị kẹt nhẹ và phát tiếng rít cơ khí ở rãnh trượt dẫn hướng.',
        priority: 'trung_binh',
        status: 'Chờ vật tư',
        equipmentId: 'eq-05',
        locationId: 'loc-02',
        requesterId: adminUid,
        requesterName: 'Lê Thị Thu (Lễ tân)',
        assigneeId: adminUid,
        assigneeName: adminName,
        dueDate: nextWeek,
        createdAt: yesterday,
      },
      {
        id: 'wo-05',
        code: 'CV-2026-0005',
        source: 'internal',
        title: 'Kiểm định đồng hồ áp suất & van xả khí hệ thống PCCC',
        description: 'Kiểm tra định kỳ hàng quý đồng hồ đo áp suất bơm chữa cháy và vệ sinh lưới lọc rác.',
        priority: 'thap',
        status: 'Đã duyệt',
        equipmentId: 'eq-04',
        locationId: 'loc-01',
        requesterId: adminUid,
        requesterName: adminName,
        assigneeId: adminUid,
        assigneeName: adminName,
        dueDate: nextWeek,
        createdAt: yesterday,
      },
    ];

    workOrders.forEach((wo) => {
      batch.set(doc(db, 'workOrders', wo.id), wo);
    });

    // 4. Sample Photos
    const photos: WorkOrderPhoto[] = [
      {
        id: 'p-01',
        workOrderId: 'wo-01',
        kind: 'before',
        dataUrl: generateSamplePhotoDataUrl('RÒ RỈ NƯỚC MÁNG NGƯNG VRV', 'ẢNH HIỆN TRƯỜNG TRƯỚC XỬ LÝ', '#b91c1c'),
        takenBy: adminUid,
        takenByName: adminName,
        takenAt: yesterday,
      },
      {
        id: 'p-02',
        workOrderId: 'wo-02',
        kind: 'before',
        dataUrl: generateSamplePhotoDataUrl('MÁY PHÁT ĐIỆN CŨ CẦN THAY LỌC DẦU', 'ẢNH TRƯỚC BẢO DƯỠNG', '#d97706'),
        takenBy: adminUid,
        takenByName: adminName,
        takenAt: new Date(Date.now() - 86400000 * 4).toISOString(),
      },
      {
        id: 'p-03',
        workOrderId: 'wo-02',
        kind: 'after',
        dataUrl: generateSamplePhotoDataUrl('HOÀN TẤT THAY LỌC DẦU & CHẠY THỬ TẢI', 'ẢNH SAU HOÀN THÀNH', '#059669'),
        takenBy: adminUid,
        takenByName: adminName,
        takenAt: yesterday,
      },
    ];

    photos.forEach((p) => {
      batch.set(doc(db, 'workOrderPhotos', p.id), p);
    });

    // 5. Comments
    const comments: WorkOrderComment[] = [
      {
        id: 'c-01',
        workOrderId: 'wo-01',
        authorId: adminUid,
        authorName: adminName,
        authorRole: 'admin',
        content: 'Đã khảo sát hiện trường, phát hiện đường ống mềm bị cặn bám làm tắc lỗ thoát. Đang tiến hành thổi khí nén vệ sinh.',
        createdAt: yesterday,
      },
      {
        id: 'c-02',
        workOrderId: 'wo-02',
        authorId: adminUid,
        authorName: adminName,
        authorRole: 'admin',
        content: 'Đã hoàn tất thay dầu nhớt 15W40 và cụm lọc Fleetguard chính hãng. Thử nổ tải 50kW trong 30 phút hoạt động êm ái.',
        createdAt: yesterday,
      },
    ];

    comments.forEach((c) => {
      batch.set(doc(db, 'workOrderComments', c.id), c);
    });

    // 6. History
    const histories: WorkOrderHistory[] = [
      {
        id: 'h-01',
        workOrderId: 'wo-01',
        actorId: adminUid,
        actorName: adminName,
        action: 'Tạo công việc',
        details: 'Gửi yêu cầu sửa chữa từ người dùng',
        timestamp: yesterday,
      },
      {
        id: 'h-02',
        workOrderId: 'wo-01',
        actorId: adminUid,
        actorName: adminName,
        action: 'Chuyển trạng thái',
        details: 'Chuyển sang "Đang xử lý" và tiếp nhận xử lý',
        timestamp: isoNow,
      },
      {
        id: 'h-03',
        workOrderId: 'wo-02',
        actorId: adminUid,
        actorName: adminName,
        action: 'Hoàn thành công việc',
        details: 'Xác nhận hoàn thành bảo dưỡng với đủ ảnh trước và sau',
        timestamp: yesterday,
      },
    ];

    histories.forEach((h) => {
      batch.set(doc(db, 'workOrderHistory', h.id), h);
    });

    // 7. Inventory Items (Kho vật tư & Phụ tùng)
    const inventoryItems: InventoryItem[] = [
      {
        id: 'inv-01',
        sku: 'LED-18W-PHL',
        name: 'Bóng đèn tuýp LED Philips 18W T8 1.2m',
        category: 'Điện & Chiếu sáng',
        unit: 'bộ',
        qty: 4, // <= minQty => Sắp hết
        minQty: 10,
        unitCost: 125000,
        location: 'Kệ E1-03 (Kho Tầng 1)',
        active: true,
        createdAt: yesterday,
      },
      {
        id: 'inv-02',
        sku: 'GAS-R410A',
        name: 'Bình gas lạnh R410A Honeywell 11.3kg',
        category: 'Vật tư HVAC & Lạnh',
        unit: 'bình',
        qty: 1, // <= minQty => Sắp hết
        minQty: 3,
        unitCost: 1850000,
        location: 'Kho Hóa chất Hầm B1',
        active: true,
        createdAt: yesterday,
      },
      {
        id: 'inv-03',
        sku: 'OIL-15W40',
        name: 'Dầu động cơ Shell Rimula R4 15W40',
        category: 'Dầu mỡ & Bôi trơn',
        unit: 'xô 18L',
        qty: 6,
        minQty: 2,
        unitCost: 1450000,
        location: 'Khu Dầu bôi trơn Hầm B1',
        active: true,
        createdAt: yesterday,
      },
      {
        id: 'inv-04',
        sku: 'FLT-LF9009',
        name: 'Cụm lọc nhớt Cummins Fleetguard LF9009',
        category: 'Phụ tùng Máy phát điện',
        unit: 'cái',
        qty: 5,
        minQty: 2,
        unitCost: 650000,
        location: 'Kệ A2-01 (Phòng Cơ điện)',
        active: true,
        createdAt: yesterday,
      },
      {
        id: 'inv-05',
        sku: 'TAPE-3M-SUP',
        name: 'Băng keo cách điện hạ thế 3M Super 33+',
        category: 'Điện & Chiếu sáng',
        unit: 'cuộn',
        qty: 25,
        minQty: 10,
        unitCost: 55000,
        location: 'Kệ E1-01',
        active: true,
        createdAt: yesterday,
      },
      {
        id: 'inv-06',
        sku: 'VAL-SNW-25',
        name: 'Van bi tay gạt Sanwa đồng mạ Crom DN25',
        category: 'Cấp thoát nước & PCCC',
        unit: 'cái',
        qty: 12,
        minQty: 5,
        unitCost: 185000,
        location: 'Kệ C1-04',
        active: true,
        createdAt: yesterday,
      },
      {
        id: 'inv-07',
        sku: 'BELT-B52',
        name: 'Dây curoa quạt làm mát Bando B-52',
        category: 'Cơ khí truyền động',
        unit: 'sợi',
        qty: 2, // <= minQty => Sắp hết
        minQty: 4,
        unitCost: 95000,
        location: 'Kệ B2-05',
        active: true,
        createdAt: yesterday,
      },
      {
        id: 'inv-08',
        sku: 'OLD-HAL-500',
        name: 'Bóng đèn cao áp Halogen 500W (Mẫu cũ)',
        category: 'Điện & Chiếu sáng',
        unit: 'bóng',
        qty: 0,
        minQty: 0,
        unitCost: 80000,
        location: 'Kho thanh lý',
        active: false, // Ngừng sử dụng
        createdAt: yesterday,
      },
    ];

    inventoryItems.forEach((item) => {
      batch.set(doc(db, 'inventoryItems', item.id), item);
    });

    // 8. Inventory Transactions (Lịch sử giao dịch kho)
    const transactions: InventoryTransaction[] = [
      {
        id: 'tx-01',
        itemId: 'inv-04',
        itemName: 'Cụm lọc nhớt Cummins Fleetguard LF9009',
        type: 'in',
        qty: 6,
        unitCost: 650000,
        note: 'Nhập kho lô phụ tùng Cummins chính hãng từ nhà cung cấp',
        createdBy: adminUid,
        createdByName: adminName,
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      },
      {
        id: 'tx-02',
        itemId: 'inv-03',
        itemName: 'Dầu động cơ Shell Rimula R4 15W40',
        type: 'in',
        qty: 7,
        unitCost: 1450000,
        note: 'Nhập bổ sung dầu bôi trơn máy phát điện dự phòng',
        createdBy: adminUid,
        createdByName: adminName,
        createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
      },
      {
        id: 'tx-03',
        itemId: 'inv-04',
        itemName: 'Cụm lọc nhớt Cummins Fleetguard LF9009',
        type: 'out',
        qty: 1,
        unitCost: 650000,
        workOrderId: 'wo-02',
        workOrderCode: 'CV-2026-0002',
        note: 'Xuất thay thế bảo dưỡng định kỳ máy phát điện Cummins',
        createdBy: adminUid,
        createdByName: adminName,
        createdAt: yesterday,
      },
      {
        id: 'tx-04',
        itemId: 'inv-03',
        itemName: 'Dầu động cơ Shell Rimula R4 15W40',
        type: 'out',
        qty: 1,
        unitCost: 1450000,
        workOrderId: 'wo-02',
        workOrderCode: 'CV-2026-0002',
        note: 'Xuất thay dầu nhớt két bôi trơn máy phát điện',
        createdBy: adminUid,
        createdByName: adminName,
        createdAt: yesterday,
      },
    ];

    transactions.forEach((tx) => {
      batch.set(doc(db, 'inventoryTransactions', tx.id), tx);
    });

    // 9. Work Order Materials (Vật tư đã dùng trong công việc CV-2026-0002)
    const woMaterials: WorkOrderMaterial[] = [
      {
        id: 'wom-01',
        workOrderId: 'wo-02',
        itemId: 'inv-04',
        itemName: 'Cụm lọc nhớt Cummins Fleetguard LF9009',
        unit: 'cái',
        qty: 1,
        unitCost: 650000,
        createdBy: adminUid,
        createdByName: adminName,
        createdAt: yesterday,
      },
      {
        id: 'wom-02',
        workOrderId: 'wo-02',
        itemId: 'inv-03',
        itemName: 'Dầu động cơ Shell Rimula R4 15W40',
        unit: 'xô 18L',
        qty: 1,
        unitCost: 1450000,
        createdBy: adminUid,
        createdByName: adminName,
        createdAt: yesterday,
      },
    ];

    woMaterials.forEach((wom) => {
      batch.set(doc(db, 'workOrderMaterials', wom.id), wom);
    });

    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'sampleDataBatch');
    throw error;
  }
}
