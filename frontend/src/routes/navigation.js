export const topNavItems = [
  { to: '/dashboard', label: 'TikTok' },
  { to: '/chatbot', label: 'Facebook' },
];

export const sidebarSections = [
  {
    title: 'TikTok',
    items: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/manage/users', label: 'Users' },
      { to: '/manage/koc-performance', label: 'KOC performance' },
      { to: '/bookings', label: 'Bookings' },
      { to: '/manage/channels', label: 'Channels' },
      { to: '/videos', label: 'Videos' },
      { to: '/reports', label: 'Reports' },
    ],
  },
  {
    title: 'Facebook',
    items: [
      { to: '/chatbot/dashboard', label: 'Dashboard' },
      { to: '/chatbot/chat', label: 'Chat' },
      { to: '/chatbot/chat-setting', label: 'Chat setting' },
      { to: '/chatbot/orders', label: 'Đơn hàng' },
    ],
  },
];

export const protectedRouteCards = [
  {
    path: '/dashboard',
    component: 'Dashboard',
    props: {
      heroTitle: 'Content performance dashboard',
      heroSubtitle: 'Theo dõi KPI theo user, KOC, sản phẩm và nền tảng từ dữ liệu OAuth, import hoặc crawler.',
    },
  },
  {
    path: '/manage/users',
    component: 'EmployeeTable',
    props: {
      heroTitle: 'User management',
      heroSubtitle: 'Quản lý admin, leader và member trước khi leader gắn video cho từng người.',
    },
  },
  {
    path: '/manage/koc-performance',
    component: 'KOCPerformance',
    props: {
      heroTitle: 'KOC performance',
      heroSubtitle: 'Đo hiệu quả từng KOC theo video count, total views, average views/video và top video.',
    },
  },
  {
    path: '/bookings',
    component: 'BookingManagement',
    props: {
      heroTitle: 'Booking management',
      heroSubtitle: 'Tạo booking cho KOC, gắn chi phí, deadline và trạng thái video trong một luồng.',
    },
  },
  {
    path: '/manage/channels',
    component: 'ChannelManagement',
    props: {
      heroTitle: 'Channel management',
      heroSubtitle: 'Thêm kênh bằng OAuth, import file hoặc crawler public theo username.',
    },
  },
  {
    path: '/videos',
    component: 'VideoTable',
    props: {
      heroTitle: 'Video library',
      heroSubtitle: 'Kiểm tra toàn bộ video, metric nền tảng, sản phẩm, campaign và content type.',
    },
  },
  {
    path: '/reports',
    component: 'ReportFilter',
    props: {
      heroTitle: 'AI weekly report',
      heroSubtitle: 'Sinh báo cáo tuần từ video.',
    },
  },
  {
    path: '/chatbot/dashboard',
    component: 'ChatbotManagement',
    props: {
      heroTitle: 'Facebook',
      heroSubtitle: '',
    },
  },
  {
    path: '/chatbot/chat',
    component: 'ChatbotManagement',
    props: {
      heroTitle: 'Chat',
      heroSubtitle: '',
    },
  },
  {
    path: '/chatbot/chat-setting',
    component: 'ChatbotManagement',
    props: {
      heroTitle: 'Chat setting',
      heroSubtitle: '',
    },
  },
  {
    path: '/chatbot/orders',
    component: 'ChatbotManagement',
    props: {
      heroTitle: 'Orders',
      heroSubtitle: '',
    },
  },
];

export const redirectRoutes = [
  { path: '/manage', to: '/manage/users' },
  { path: '/manage/koc', to: '/manage/koc-performance' },
  { path: '/chatbot', to: '/chatbot/dashboard' },
  { path: '/chatbot/rag', to: '/chatbot/chat-setting' },
];
