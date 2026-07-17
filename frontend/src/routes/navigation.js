export const topNavItems = [
  { to: '/dashboard', label: 'TikTok' },
  { to: '/chatbot', label: 'Facebook' },
  { to: '/manage/users', label: 'Admin', adminOnly: true },
];

export const sidebarSections = [
  {
    title: 'TikTok',
    items: [
      { to: '/dashboard', label: 'Dashboard' },
      { to: '/manage/koc-performance', label: 'KOC performance' },
      { to: '/manage/shop-analytics', label: 'Shop analytics' },
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
      { to: '/chatbot/orders', label: 'Đơn hàng' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/manage/users', label: 'Users', adminOnly: true },
      { to: '/manage/schedules', label: 'Schedule', adminOnly: true },
      { to: '/chatbot/chat-setting', label: 'Chat setting', adminOnly: true },
    ],
  },
];

export const protectedRouteCards = [
  {
    path: '/dashboard',
    component: 'Dashboard',
    props: {
      heroTitle: 'Content performance dashboard',
      heroSubtitle: '',
    },
  },
  {
    path: '/manage/users',
    component: 'EmployeeTable',
    adminOnly: true,
    props: {
      heroTitle: 'User management',
      heroSubtitle: '',
    },
  },
  {
    path: '/manage/schedules',
    component: 'ScheduleManagement',
    adminOnly: true,
    props: {
      heroTitle: 'Schedule management',
      heroSubtitle: 'Manage automated data synchronization jobs.',
    },
  },
  {
    path: '/manage/koc-performance',
    component: 'KOCPerformance',
    props: {
      heroTitle: 'KOC performance',
      heroSubtitle: '',
    },
  },
  {
    path: '/manage/shop-analytics',
    component: 'ShopAnalytics',
    props: { heroTitle: 'Shop analytics' },
  },
  {
    path: '/bookings',
    component: 'BookingManagement',
    props: {
      heroTitle: 'Booking management',
      heroSubtitle: '',
    },
  },
  {
    path: '/manage/channels',
    component: 'ChannelManagement',
    props: {
      heroTitle: 'Channel management',
      heroSubtitle: '',
    },
  },
  {
    path: '/videos',
    component: 'VideoTable',
    props: {
      heroTitle: 'Video library',
      heroSubtitle: '',
    },
  },
  {
    path: '/reports',
    component: 'ReportFilter',
    props: {
      heroTitle: 'AI weekly report',
      heroSubtitle: '',
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
