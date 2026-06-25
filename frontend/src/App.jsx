import React from 'react';
import { BrowserRouter as Router, Navigate, Routes, Route, useLocation } from 'react-router-dom';
import HomePage from './components/HomePage';
import Dashboard from './components/Dashboard';
import VideoTable from './components/VideoTable';
import ReportFilter from './components/ReportFilter';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import AssignmentManagement from './components/AssignmentManagement';
import TeamManagement from './components/TeamManagement';
import EmployeeTable from './components/EmployeeTable';
import ChannelManagement from './components/ChannelManagement';
import Login from './components/Login';
import LegalPage from './components/LegalPage';
import './App.css';

function AppLayout() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isHomePage = location.pathname === '/';

  return (
    <div className={`app-shell${isLoginPage ? ' app-shell--auth' : ''}`}>
      <Header />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <main className="app-shell__content app-shell__content--home">
              <HomePage />
            </main>
          }
        />
        <Route
          path="/*"
          element={
            <div className="app-shell__layout">
              <Sidebar />
              <main className="app-shell__content">
                <Routes>
                  <Route
                    path="/dashboard"
                    element={
                      <Dashboard
                        heroTitle="Content performance dashboard"
                        heroSubtitle="Theo dõi KPI theo team, user, sản phẩm và nền tảng từ dữ liệu OAuth, import hoặc crawler."
                      />
                    }
                  />
                  <Route path="/manage" element={<Navigate to="/manage/teams" replace />} />
                  <Route
                    path="/manage/teams"
                    element={
                      <TeamManagement
                        heroTitle="Team management"
                        heroSubtitle="Tạo và kiểm soát các team Content MKT, Content AI, Tin tức để dashboard tính KPI đúng ownership."
                      />
                    }
                  />
                  <Route
                    path="/manage/users"
                    element={
                      <EmployeeTable
                        heroTitle="User management"
                        heroSubtitle="Quản lý admin, leader và member trước khi leader gắn video cho từng người."
                      />
                    }
                  />
                  <Route
                    path="/manage/channels"
                    element={
                      <ChannelManagement
                        heroTitle="Channel management"
                        heroSubtitle="Thêm kênh bằng OAuth, import file hoặc crawler public theo username."
                      />
                    }
                  />
                  <Route
                    path="/videos"
                    element={
                      <VideoTable
                        heroTitle="Video library"
                        heroSubtitle="Kiểm tra toàn bộ video, metric nền tảng, sản phẩm, campaign và content type."
                      />
                    }
                  />
                  <Route
                    path="/assignments"
                    element={
                      <AssignmentManagement
                        heroTitle="Assign video ownership"
                        heroSubtitle="Leader gắn video cho script, editor, uploader, actor hoặc AI creator để tính KPI theo user/team."
                      />
                    }
                  />
                  <Route
                    path="/reports"
                    element={
                      <ReportFilter
                        heroTitle="AI weekly report"
                        heroSubtitle="Sinh báo cáo tuần từ video trong khoảng ngày, lưu vào weekly_reports để leader/admin xem lại."
                      />
                    }
                  />
                  <Route
                    path="/terms"
                    element={
                      <LegalPage title="Terms of Service" updatedAt="June 25, 2026">
                        <p>
                          This project is an internal reporting workspace for managing teams, users, channels, videos,
                          assignments, and weekly reports.
                        </p>
                        <p>
                          Access is restricted to authorized users only. You are responsible for keeping your account
                          credentials secure and using the system in accordance with company policy.
                        </p>
                        <p>
                          Platform data, including content metadata and performance metrics, may be processed to support
                          reporting and operational workflows.
                        </p>
                      </LegalPage>
                    }
                  />
                  <Route
                    path="/privacy"
                    element={
                      <LegalPage title="Privacy Policy" updatedAt="June 25, 2026">
                        <p>
                          This application stores operational data such as user profiles, team assignments, channel
                          metadata, and performance analytics required for reporting.
                        </p>
                        <p>
                          OAuth-based channel connections, if enabled, are handled server-side. Tokens and credentials
                          should be stored securely on the backend only.
                        </p>
                        <p>
                          Data is used solely to power dashboards, assignments, import workflows, and weekly reporting
                          inside this project.
                        </p>
                      </LegalPage>
                    }
                  />
                </Routes>
              </main>
            </div>
          }
        />
      </Routes>
    </div>
  );
}

function App() {
  return (
    <Router>
      <AppLayout />
    </Router>
  );
}

export default App;
