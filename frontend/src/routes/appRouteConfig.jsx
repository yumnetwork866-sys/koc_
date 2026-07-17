import React, { lazy } from 'react';
import { Navigate } from 'react-router-dom';
import { LoginRoute, RequireAdmin } from './guards';
import { protectedRouteCards, redirectRoutes } from './navigation';

const ChannelManagement = lazy(() => import('../components/ChannelManagement'));
const ChatbotManagement = lazy(() => import('../components/ChatbotManagement'));
const BookingManagement = lazy(() => import('../components/BookingManagement'));
const Dashboard = lazy(() => import('../components/Dashboard'));
const EmployeeTable = lazy(() => import('../components/EmployeeTable'));
const KOCPerformance = lazy(() => import('../components/KOCPerformance'));
const ShopAnalytics = lazy(() => import('../components/ShopAnalytics'));
const ScheduleManagement = lazy(() => import('../components/ScheduleManagement'));
const HomePage = lazy(() => import('../components/HomePage'));
const Login = lazy(() => import('../components/Login'));
const ReportFilter = lazy(() => import('../components/ReportFilter'));
const VideoTable = lazy(() => import('../components/VideoTable'));
const TermsPage = lazy(() => import('../pages/legal/TermsPage'));
const PrivacyPage = lazy(() => import('../pages/legal/PrivacyPage'));
const DataDeletionPage = lazy(() => import('../pages/legal/DataDeletionPage'));

const componentMap = {
  Dashboard,
  EmployeeTable,
  KOCPerformance,
  ShopAnalytics,
  ScheduleManagement,
  BookingManagement,
  ChannelManagement,
  VideoTable,
  ReportFilter,
  ChatbotManagement,
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
