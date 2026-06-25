import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import EmployeeTable from './components/EmployeeTable';
import VideoTable from './components/VideoTable';
import ReportFilter from './components/ReportFilter';
import Header from './components/Header';
import TeamManagement from './components/TeamManagement';
import ChannelManagement from './components/ChannelManagement';
import AssignmentManagement from './components/AssignmentManagement';
import PlatformImport from './components/PlatformImport';
import Login from './components/Login';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-shell">
        <Header />
        <main className="app-shell__content">
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route
              path="/"
              element={
                <Dashboard
                  heroTitle="Content performance dashboard"
                  heroSubtitle="Theo dõi KPI theo team, user, sản phẩm và nền tảng từ dữ liệu OAuth, import hoặc crawler."
                />
              }
            />
            <Route
              path="/teams"
              element={
                <TeamManagement
                  heroTitle="Team management"
                  heroSubtitle="Tạo và kiểm soát các team Content MKT, Content AI, Tin tức để dashboard tính KPI đúng ownership."
                />
              }
            />
            <Route
              path="/users"
              element={
                <EmployeeTable
                  heroTitle="User management"
                  heroSubtitle="Quản lý admin, leader và member trước khi leader gắn video cho từng người."
                />
              }
            />
            <Route
              path="/channels"
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
              path="/import"
              element={
                <PlatformImport
                  heroTitle="Import data"
                  heroSubtitle="Nhập dữ liệu đã parse từ Excel/CSV để đồng bộ channel, video và product vào database."
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
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
