import React from 'react';
import { Navigate } from 'react-router-dom';
import AssignmentManagement from '../components/AssignmentManagement';
import ChannelManagement from '../components/ChannelManagement';
import ChatbotManagement from '../components/ChatbotManagement';
import Dashboard from '../components/Dashboard';
import EmployeeTable from '../components/EmployeeTable';
import HomePage from '../components/HomePage';
import Login from '../components/Login';
import ReportFilter from '../components/ReportFilter';
import TeamManagement from '../components/TeamManagement';
import VideoTable from '../components/VideoTable';
import TermsPage from '../pages/legal/TermsPage';
import PrivacyPage from '../pages/legal/PrivacyPage';
import { LoginRoute } from './guards';
import { protectedRouteCards, redirectRoutes } from './navigation';

const componentMap = {
  Dashboard,
  TeamManagement,
  EmployeeTable,
  ChannelManagement,
  VideoTable,
  AssignmentManagement,
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
];

export const protectedRouteConfig = protectedRouteCards.map(({ path, component, props }) => ({
  path,
  element: React.createElement(componentMap[component], props),
}));

export const protectedRedirectConfig = redirectRoutes.map(({ path, to }) => ({
  path,
  element: <Navigate to={to} replace />,
}));

