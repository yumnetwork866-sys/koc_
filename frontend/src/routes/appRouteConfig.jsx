import React from 'react';
import { Navigate } from 'react-router-dom';
import { LoginRoute, RequireAdmin } from './guards';
import {
  BookingManagement,
  ChannelManagement,
  ChatbotManagement,
  Dashboard,
  DataDeletionPage,
  EmployeeTable,
  HomePage,
  KOCPerformance,
  Login,
  PrivacyPage,
  PublicReport,
  ReportFilter,
  ScheduleManagement,
  SellerAffiliatePanel,
  ShopAnalytics,
  TermsPage,
  VideoTable,
  WhatsAppManagement,
} from './lazyRouteComponents';
import { protectedRouteCards, redirectRoutes } from './navigation';

const componentMap = {
  Dashboard,
  EmployeeTable,
  KOCPerformance,
  SellerAffiliatePanel,
  ShopAnalytics,
  ScheduleManagement,
  BookingManagement,
  ChannelManagement,
  VideoTable,
  ReportFilter,
  ChatbotManagement,
  WhatsAppManagement,
};

export const publicRouteConfig = [
  { path: '/', element: <HomePage /> },
  {
    path: '/login',
    element: (
      <LoginRoute>
        <Login />
      </LoginRoute>
    ),
  },
  { path: '/terms', element: <TermsPage /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/data-deletion', element: <DataDeletionPage /> },
  { path: '/shared/reports/:token', element: <PublicReport /> },
];

export const protectedRouteConfig = protectedRouteCards.map(({ path, component, props, adminOnly }) => ({
  path,
  element: adminOnly
    ? (
      <RequireAdmin>
        {React.createElement(componentMap[component], props)}
      </RequireAdmin>
    )
    : React.createElement(componentMap[component], props),
}));

export const protectedRedirectConfig = redirectRoutes.map(({ path, to }) => ({
  path,
  element: <Navigate to={to} replace />,
}));
