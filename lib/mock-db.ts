let seed = 123456789;
const seededRandom = () => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}
const generateId = () => seededRandom().toString(36).substr(2, 9)

const randomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + seededRandom() * (end.getTime() - start.getTime())).toISOString()
}

// 1. Products
export const mockProducts = [
  { id: 'p1', sku: 'VF-9-PLUS', name: 'VinFast VF 9 Plus', category: 'Ô tô điện', price: 1685000000, status: 'Active', stock: 12, createdDate: '2025-10-01T08:00:00Z', image: '/images/vf9.png' },
  { id: 'p2', sku: 'VF-9-ECO', name: 'VinFast VF 9 Eco', category: 'Ô tô điện', price: 1491000000, status: 'Active', stock: 5, createdDate: '2025-10-01T08:00:00Z', image: '/images/vf9.png' },
  { id: 'p3', sku: 'VF-8-PLUS', name: 'VinFast VF 8 Plus', category: 'Ô tô điện', price: 1270000000, status: 'Active', stock: 8, createdDate: '2025-05-15T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p4', sku: 'VF-8-ECO', name: 'VinFast VF 8 Eco', category: 'Ô tô điện', price: 1090000000, status: 'Active', stock: 15, createdDate: '2025-05-15T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p5', sku: 'VF-7-PLUS', name: 'VinFast VF 7 Plus', category: 'Ô tô điện', price: 999000000, status: 'Active', stock: 20, createdDate: '2026-01-10T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p6', sku: 'VF-7-ECO', name: 'VinFast VF 7 Eco', category: 'Ô tô điện', price: 850000000, status: 'Active', stock: 32, createdDate: '2026-01-10T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p7', sku: 'VF-6-PLUS', name: 'VinFast VF 6 Plus', category: 'Ô tô điện', price: 765000000, status: 'Active', stock: 45, createdDate: '2026-02-20T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p8', sku: 'VF-5-PLUS', name: 'VinFast VF 5 Plus', category: 'Ô tô điện', price: 468000000, status: 'Active', stock: 110, createdDate: '2025-11-11T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p9', sku: 'VF-3', name: 'VinFast VF 3', category: 'Ô tô điện', price: 235000000, status: 'Active', stock: 250, createdDate: '2026-06-01T08:00:00Z', image: '/images/vf8.png' },
  
  { id: 'p10', sku: 'VENTO-S', name: 'Vento S', category: 'Xe máy điện', price: 50000000, status: 'Active', stock: 45, createdDate: '2025-08-10T08:00:00Z', image: '/images/vento.png' },
  { id: 'p11', sku: 'FELIZ-S', name: 'Feliz S', category: 'Xe máy điện', price: 27000000, status: 'Active', stock: 85, createdDate: '2025-08-10T08:00:00Z', image: '/images/vento.png' },
  { id: 'p12', sku: 'EVO-200', name: 'Evo200', category: 'Xe máy điện', price: 18000000, status: 'Active', stock: 150, createdDate: '2025-08-10T08:00:00Z', image: '/images/vento.png' },
  { id: 'p13', sku: 'KLARA-S', name: 'Klara S', category: 'Xe máy điện', price: 35000000, status: 'Draft', stock: 0, createdDate: '2026-07-01T08:00:00Z', image: '/images/vento.png' },
  
  { id: 'p14', sku: 'ACC-CHG-7KW', name: 'Sạc treo tường 7.4kW', category: 'Phụ kiện', price: 12000000, status: 'Active', stock: 30, createdDate: '2025-12-01T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p15', sku: 'ACC-MAT-VF8', name: 'Thảm lót sàn VF8', category: 'Phụ kiện', price: 21000000, status: 'Active', stock: 120, createdDate: '2025-12-01T08:00:00Z', image: '/images/vf9.png' },
  { id: 'p16', sku: 'ACC-CAM-4K', name: 'Camera hành trình 4K', category: 'Phụ kiện', price: 38000000, status: 'Active', stock: 50, createdDate: '2025-12-01T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p17', sku: 'ACC-COVER-VF9', name: 'Bạt phủ xe VF9', category: 'Phụ kiện', price: 1500000, status: 'Active', stock: 2, createdDate: '2026-01-01T08:00:00Z', image: '/images/vento.png' },
  { id: 'p18', sku: 'ACC-STEER-WRAP', name: 'Bọc vô lăng da lộn', category: 'Phụ kiện', price: 850000, status: 'Active', stock: 8, createdDate: '2026-01-01T08:00:00Z', image: '/images/vf9.png' },
  { id: 'p19', sku: 'ACC-CHG-PORT', name: 'Sạc di động 2.2kW', category: 'Phụ kiện', price: 4500000, status: 'Active', stock: 4, createdDate: '2026-02-01T08:00:00Z', image: '/images/vf8.png' },
  { id: 'p20', sku: 'ACC-TRAY-VF8', name: 'Khay để đồ cốp VF8', category: 'Phụ kiện', price: 1200000, status: 'Draft', stock: 0, createdDate: '2026-07-20T08:00:00Z', image: '/images/vf9.png' }
]

// 2. Customers
const lastNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng', 'Bùi']
const middleNames = ['Văn', 'Thị', 'Hữu', 'Đức', 'Thanh', 'Minh', 'Ngọc', 'Xuân', 'Hoài', 'Quang']
const firstNames = ['An', 'Bình', 'Cường', 'Dũng', 'Hải', 'Hùng', 'Khoa', 'Linh', 'Mai', 'Nam', 'Oanh', 'Phương', 'Quân', 'Thành', 'Trang', 'Tuấn', 'Yến']

export const mockCustomers = Array.from({ length: 50 }).map((_, i) => {
  const name = `${lastNames[Math.floor(seededRandom() * lastNames.length)]} ${middleNames[Math.floor(seededRandom() * middleNames.length)]} ${firstNames[Math.floor(seededRandom() * firstNames.length)]}`
  return {
    id: `c${i+1}`,
    name,
    email: `customer${i+1}@example.com`,
    phone: `09${Math.floor(seededRandom() * 90000000 + 10000000)}`,
    address: `${Math.floor(seededRandom() * 900 + 1)} Nguyễn Trãi, Thanh Xuân, Hà Nội`,
    totalSpending: Math.floor(seededRandom() * 2000000000),
    lastPurchase: randomDate(new Date(2025, 0, 1), new Date(2026, 6, 22)),
    status: seededRandom() > 0.1 ? 'Active' : 'Inactive',
    createdAt: randomDate(new Date(2024, 0, 1), new Date(2025, 11, 31))
  }
})

// 3. Orders
const statuses = ['Pending', 'Confirmed', 'Preparing', 'Ready', 'Completed', 'Cancelled']
export const mockOrders = Array.from({ length: 100 }).map((_, i) => {
  const customer = mockCustomers[Math.floor(seededRandom() * mockCustomers.length)]
  const product = mockProducts[Math.floor(seededRandom() * mockProducts.length)]
  
  // Weights for statuses to make the dashboard look realistic
  const r = seededRandom()
  let status = 'Completed'
  if (r < 0.1) status = 'Pending'
  else if (r < 0.2) status = 'Confirmed'
  else if (r < 0.3) status = 'Preparing'
  else if (r < 0.4) status = 'Ready'
  else if (r > 0.95) status = 'Cancelled'

  return {
    id: `ORD-${20260000 + i}`,
    orderNumber: `FLE-202607${Math.floor(seededRandom()*30+1).toString().padStart(2, '0')}-${(1000+i).toString().padStart(4, '0')}`,
    customerId: customer.id,
    customerName: customer.name,
    vehicle: product.name,
    amount: product.price + (Math.floor(seededRandom() * 5) * 1000000),
    status,
    payment: status === 'Pending' || status === 'Cancelled' ? 'Unpaid' : 'Paid',
    createdAt: randomDate(new Date(2026, 6, 1), new Date(2026, 6, 22))
  }
}).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

// 4. Inventory (Single Showroom)
export const mockInventory = mockProducts.map(p => {
  const minStock = p.category === 'Phụ kiện' ? 10 : 3
  const available = p.stock
  const reserved = Math.floor(seededRandom() * 5)
  const current = available + reserved
  return {
    sku: p.sku,
    product: p.name,
    category: p.category,
    current,
    reserved,
    available,
    minStock,
    status: available === 0 ? 'Out of Stock' : (available <= minStock ? 'Low Stock' : 'In Stock')
  }
})
