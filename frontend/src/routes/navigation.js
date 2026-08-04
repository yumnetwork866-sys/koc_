export const topNavItems = [
  { to: '/manage/shop-analytics', label: 'TikTok' },
  { to: '/manage/users', label: 'Admin', adminOnly: true },
];

export const sidebarSections = [
  {
    title: 'TikTok',
    items: [
      {
        id: 'tiktok-shop',
        labelKey: 'navigation.tiktokShop',
        icon: 'shop',
        children: [
          { to: '/manage/shop-analytics', labelKey: 'navigation.shopAnalytics' },
           { to: '/manage/video-analytics', labelKey: 'navigation.videoAnalytics' },
           { to: '/manage/affiliate', labelKey: 'navigation.affiliate' },
           { to: '/manage/creator-chat', labelKey: 'navigation.creatorChat' },
           { to: '/bookings', labelKey: 'navigation.bookings' },
         ],
      },
      {
        id: 'tiktok-channel',
        labelKey: 'navigation.tiktokChannel',
        icon: 'channels',
        children: [
          { to: '/dashboard', labelKey: 'navigation.channelOverview' },
          { to: '/channel-reports', labelKey: 'navigation.reports' },
          { to: '/manage/channels', labelKey: 'navigation.channels' },
        ],
      },
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
    title: 'WhatsApp',
    items: [
      { to: '/whatsapp/dashboard', labelKey: 'navigation.dashboard' },
      { to: '/whatsapp/chat', labelKey: 'navigation.chat' },
      { to: '/whatsapp/orders', labelKey: 'navigation.orders' },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/manage/users', labelKey: 'navigation.users', adminOnly: true },
      { to: '/manage/shops', labelKey: 'navigation.manageShops', adminOnly: true },
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
    path: '/channel-reports',
    component: 'ChannelReport',
    props: {},
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
    path: '/manage/shops',
    component: 'ShopAnalytics',
    adminOnly: true,
    props: { managementOnly: true },
  },
  {
    path: '/manage/affiliate',
    component: 'SellerAffiliatePanel',
    props: {},
  },
  {
    path: '/manage/creator-chat',
    component: 'CreatorChatPage',
    props: {},
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
    path: '/manage/video-analytics',
    component: 'ShopAnalytics',
    props: { videoOnly: true },
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
    path: '/chatbot/dashboard',
    component: 'ChatbotManagement',
    props: {
      heroTitle: 'Facebook',
      heroSubtitle: '',
    },
  },
  {
    path: '/whatsapp/dashboard',
    component: 'WhatsAppManagement',
    props: {},
  },
  {
    path: '/whatsapp/chat',
    component: 'WhatsAppManagement',
    props: {},
  },
  {
    path: '/whatsapp/orders',
    component: 'WhatsAppManagement',
    props: {},
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
  { path: '/videos', to: '/dashboard#videos' },
  { path: '/chatbot', to: '/chatbot/dashboard' },
  { path: '/whatsapp', to: '/whatsapp/dashboard' },
  { path: '/chatbot/rag', to: '/chatbot/chat-setting' },
];
