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
import ChatbotManagement from './components/ChatbotManagement';
import Login from './components/Login';
import LegalPage from './components/LegalPage';
import { hasValidSession } from './lib/session';
import './App.css';

const privacyContactEmail = import.meta.env.VITE_PRIVACY_CONTACT_EMAIL || 'privacy@yumnetwork.vn';

function RequireSession({ children }) {
  const location = useLocation();

  if (!hasValidSession()) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}

function LoginRoute() {
  const location = useLocation();
  const destination = location.state?.from?.pathname || '/dashboard';

  if (hasValidSession()) {
    return <Navigate to={destination} replace />;
  }

  return <Login />;
}

function AppLayout() {
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isLegalPage = location.pathname === '/terms' || location.pathname === '/privacy';

  return (
    <div className={`app-shell${isLoginPage ? ' app-shell--auth' : ''}`}>
      <Header />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
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
                              These Terms govern access to Content Performance Report, including its public website and
                              authorized reporting workspace. By using the service, you agree to these Terms, our Privacy
                              Policy, and the applicable terms of any third-party platforms you choose to connect.
                            </p>
                            <p>
                              The service helps authorized teams connect supported platforms, organize content operations,
                              and review channel, messaging, and performance data. When you choose to connect a platform,
                              that provider presents its own consent flow and you may deny or revoke access at any time.
                            </p>
                            <p>
                              You may use the service only for lawful business purposes, with authority to connect each
                              account, and in accordance with applicable law and the policies of each platform you connect.
                              The private workspace is available only to users authorized by the service administrator.
                            </p>
                            <p>Your responsibilities:</p>
                            <ul>
                              <li>Keep account credentials confidential and use only your assigned access.</li>
                              <li>Connect only platforms and accounts for which you have permission to grant access.</li>
                              <li>Do not bypass security controls, permissions, or platform rate limits.</li>
                              <li>Do not use the service to publish harmful, deceptive, or unauthorized content.</li>
                            </ul>
                            <p>
                              You can disconnect a platform connection from the management area. Disconnecting revokes the
                              stored authorization; deleting a connection may also remove its associated local records.
                              Requests for account or data deletion can also be sent to{' '}
                              <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
                            </p>
                            <p>
                              The service is provided on an "as is" and "as available" basis to the extent permitted by law.
                              We may suspend or terminate access for security, policy, or operational reasons, and may update
                              these Terms by publishing a revised version on this page.
                            </p>
                            <p>
                              Questions about these Terms can be sent to{' '}
                              <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
                            </p>
                          </LegalPage>
                    }
                  />
                      <Route
                        path="/privacy"
                        element={
                          <LegalPage title="Privacy Policy" updatedAt="June 26, 2026">
                            <p>
                              This Privacy Policy explains how Content Performance Report collects, uses, retains, and deletes
                              information when you use our website, private workspace, and any supported platform connection.
                            </p>
                            <h2>Information we collect</h2>
                            <p>
                              We collect the information needed to operate the service: workspace account details (name, email,
                              role and team), support messages, and operational records such as assignments and reports.
                              If you choose to connect a platform, we collect the data approved through that platform's consent
                              flow, which may include account identifiers, profile details, public metrics, messages, and media
                              metadata depending on the platform and scopes granted.
                            </p>
                        <h2>How we use platform data</h2>
                            <p>
                              We use this data only to connect the authorized platform, synchronize approved content or messaging
                              data, display dashboards, assign ownership, and generate internal reports. We do not sell personal
                              information or use platform data for advertising or to build unrelated user profiles.
                            </p>
                        <h2>Sharing and security</h2>
                            <ul>
                              <li>Access and refresh tokens are processed server-side, encrypted at rest, and never displayed in the workspace.</li>
                              <li>Access is limited to authorized workspace users and service providers that host or secure the service.</li>
                              <li>We do not share platform data with third parties except as needed to operate the service, comply with law, or with your direction.</li>
                            </ul>
                            <p>
                              We use reasonable administrative and technical safeguards. No system can guarantee absolute
                              security, so you should protect your workspace credentials and promptly report suspected misuse.
                            </p>
                        <h2>Retention and deletion</h2>
                            <p>
                              We retain platform connection data and synchronized reporting data while the connected workspace
                              is active. Disconnecting a platform revokes its authorization and deletes stored tokens. Deleting
                              a connection may remove its local channel, message, order, or reporting records depending on the
                              platform. We retain limited backup and security logs for up to 90 days, unless a longer period is
                              required by law or needed to resolve a security incident.
                            </p>
                        <h2>Your choices and rights</h2>
                            <p>
                              Depending on applicable law, you may request access to, correction of, export of, restriction of,
                              or deletion of your personal information. You may also revoke platform access in that platform's
                              settings or from the management area. To make a request, email{' '}
                              <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a> from the account concerned.
                              We may verify your identity and respond within 30 days, subject to applicable law.
                            </p>
                            <p>
                              This policy may change as the service evolves. The latest version is published here. For privacy
                              questions or a deletion request, contact{' '}
                              <a href={`mailto:${privacyContactEmail}`}>{privacyContactEmail}</a>.
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
              <RequireSession>
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
                        path="/chatbot"
                        element={<Navigate to="/chatbot/dashboard" replace />}
                      />
                      <Route
                        path="/chatbot/dashboard"
                        element={
                          <ChatbotManagement
                            heroTitle="Facebook page chatbot"
                            heroSubtitle=""
                          />
                        }
                      />
                      <Route
                        path="/chatbot/chat"
                        element={
                          <ChatbotManagement
                            heroTitle="Chat"
                            heroSubtitle=""
                          />
                        }
                      />
                      <Route
                        path="/chatbot/rag"
                        element={<Navigate to="/chatbot/chat-setting" replace />}
                      />
                      <Route
                        path="/chatbot/chat-setting"
                        element={
                          <ChatbotManagement
                            heroTitle="Chat setting"
                            heroSubtitle=""
                          />
                        }
                      />
                      <Route
                        path="/chatbot/orders"
                        element={
                          <ChatbotManagement
                            heroTitle="Orders"
                            heroSubtitle=""
                          />
                        }
                      />
                      <Route path="/terms" element={<Navigate to="/" replace />} />
                      <Route path="/privacy" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                </div>
              </RequireSession>
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
