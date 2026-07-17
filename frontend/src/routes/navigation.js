export const topNavItems = [
  { to: '/manage/koc-performance', label: 'TikTok Shop' },
  { to: '/dashboard', label: 'TikTok' },
  { to: '/chatbot', label: 'Facebook' },
  { to: '/manage/users', label: 'Admin', adminOnly: true },
];

export const sidebarSections = [
  {
    title: 'TikTok',
    items: [
      { to: '/dashboard', labelKey: 'navigation.dashboard' },
      { to: '/manage/channels', labelKey: 'navigation.channels' },
      { to: '/videos', labelKey: 'navigation.videos' },
    ],
  },
  {
    title: 'TikTok Shop',
    items: [
      { to: '/manage/koc-performance', labelKey: 'navigation.kocPerformance' },
      { to: '/manage/shop-analytics', labelKey: 'navigation.shopAnalytics' },
      { to: '/bookings', labelKey: 'navigation.bookings' },
      { to: '/reports', labelKey: 'navigation.reports' },
    ],
  },
  {
    title: 'Facebook',
    items: [
      { to: '/chatbot/dashboard', labelKey: 'navigation.dashboard' },
      { to: '/chatbot/chat', labelKey: 'navigation.chat' },
      { to: '/chatbot/orders', labelKey: 'navigation.orders' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/manage/users', labelKey: 'navigation.users', adminOnly: true },
      { to: '/manage/schedules', labelKey: 'navigation.schedule', adminOnly: true },
      { to: '/chatbot/chat-setting', labelKey: 'navigation.chatSettings', adminOnly: true },
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
