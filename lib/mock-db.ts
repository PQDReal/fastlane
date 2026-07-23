let seed = 123456789;
const seededRandom = () => {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}
const generateId = () => seededRandom().toString(36).substr(2, 9)

const randomDate = (start: Date, end: Date) => {
  return new Date(start.getTime() + seededRandom() * (end.getTime() - start.getTime())).toISOString()
}

// Internal mocks only for generating fake orders to keep the dashboard running
const _internalProducts = [
  { id: 'p1', sku: 'VF-9-PLUS', name: 'VinFast VF 9 Plus', category: 'Ô tô điện', price: 1685000000, status: 'Active', stock: 12, createdDate: '2025-10-01T08:00:00Z', image: '/images/vf9.png' },
  { id: 'p8', sku: 'VF-5-PLUS', name: 'VinFast VF 5 Plus', category: 'Ô tô điện', price: 468000000, status: 'Active', stock: 110, createdDate: '2025-11-11T08:00:00Z', image: '/images/vf8.png' },
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
  const product = _internalProducts[Math.floor(seededRandom() * _internalProducts.length)]
  
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
export const mockInventory = _internalProducts.map(p => {
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
