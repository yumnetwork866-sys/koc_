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
  const isLegalPage = location.pathname === '/terms' || location.pathname === '/privacy';

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
        {isLegalPage ? (
          <Route
            path="*"
            element={
              <main className="app-shell__content app-shell__content--legal">
                <Routes>
                  <Route
                    path="/terms"
                    element={
                      <LegalPage title="Terms of Service" updatedAt="June 26, 2026">
                        <p>
                          These Terms govern access to the Content Performance Report website and the associated private
                          workspace. By visiting the site or using the application, you agree to follow these Terms and
                          any posted policies that apply to the service.
                        </p>
                        <p>
                          The public website is provided to explain the product, publish policy information, and direct
                          users to the correct support and sign-in flows. The private application is available only to
                          authorized users.
                        </p>
                        <p>
                          You may use the service only for lawful business purposes and in accordance with company
                          policies, applicable law, and any restrictions imposed by third-party platforms.
                        </p>
                        <p>Key obligations:</p>
                        <ul>
                          <li>Keep account credentials confidential and use only your assigned access.</li>
                          <li>Do not attempt to bypass security controls, data permissions, or rate limits.</li>
                          <li>Do not misuse the service to publish harmful, deceptive, or unauthorized content.</li>
                          <li>Do not scrape, reverse engineer, or disrupt the platform or connected services.</li>
                        </ul>
                        <p>
                          Content, reports, and operational metadata may be processed to support dashboards, assignments,
                          audits, and weekly reporting. Third-party integrations remain subject to their own terms and
                          policies.
                        </p>
                        <p>
                          The service is provided on an "as is" and "as available" basis. To the fullest extent allowed
                          by law, the provider disclaims warranties for uninterrupted availability, accuracy, and fitness
                          for a particular purpose.
                        </p>
                        <p>
                          The provider may suspend or terminate access for policy violations, security concerns, or
                          operational necessity. We may update these Terms from time to time by posting a revised version
                          on this site.
                        </p>
                        <p>
                          Questions about these Terms can be sent through the contact details shown on the public website.
                        </p>
                      </LegalPage>
                    }
                  />
                  <Route
                    path="/privacy"
                    element={
                      <LegalPage title="Privacy Policy" updatedAt="June 26, 2026">
                        <p>
                          This Privacy Policy explains how the provider collects, uses, shares, and protects information
                          when you use the Content Performance Report website and application.
                        </p>
                        <p>
                          Information we may collect includes account details, team and role assignments, channel
                          metadata, video and report data, OAuth connection metadata, and support communications.
                        </p>
                        <p>
                          We use this information to operate the service, generate dashboards and reports, administer
                          accounts, enforce policy, maintain security, and improve the reliability of the platform.
                        </p>
                        <p>How data may be handled:</p>
                        <ul>
                          <li>OAuth tokens and credentials are processed on the backend and should not be exposed publicly.</li>
                          <li>Operational data may be stored to support reporting, auditing, and assignment workflows.</li>
                          <li>Access is limited to authorized users and service providers who need the information.</li>
                          <li>We may retain logs and records as needed for security, compliance, and business operations.</li>
                        </ul>
                        <p>
                          We do not sell personal information. We may share information with infrastructure, analytics,
                          or integration providers that help operate the service, subject to appropriate safeguards and
                          contractual restrictions where applicable.
                        </p>
                        <p>
                          You may have rights to access, correct, or delete certain information, subject to the limits of
                          applicable law and the needs of the service.
                        </p>
                        <p>
                          The provider may update this Privacy Policy as the service evolves. The most recent version
                          will be posted on this public website.
                        </p>
                        <p>
                          If you have questions about privacy or data handling, use the contact information shown on the
                          public website.
                        </p>
                      </LegalPage>
                    }
                  />
                </Routes>
              </main>
            }
          />
        ) : (
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
                    <Route path="/terms" element={<Navigate to="/" replace />} />
                    <Route path="/privacy" element={<Navigate to="/" replace />} />
                  </Routes>
                </main>
              </div>
            }
          />
        )}
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
