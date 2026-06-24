import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Dashboard from './components/Dashboard';
import EmployeeTable from './components/EmployeeTable';
import VideoTable from './components/VideoTable';
import ReportFilter from './components/ReportFilter';
import Header from './components/Header';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-shell">
        <Header />
        <main className="app-shell__content">
          <Routes>
            <Route
              path="/"
              element={
                <Dashboard
                  heroTitle="Operational dashboard for the content team"
                  heroSubtitle="Track employee capacity, video performance, and team reporting from a single surface designed for fast scanning."
                />
              }
            />
            <Route
              path="/employees"
              element={
                <EmployeeTable
                  heroTitle="Employee directory"
                  heroSubtitle="Review team assignment, role, and contact information in a cleaner, more readable table layout."
                />
              }
            />
            <Route
              path="/videos"
              element={
                <VideoTable
                  heroTitle="Video library"
                  heroSubtitle="Inspect content performance with clearer hierarchy, stronger spacing, and compact metrics."
                />
              }
            />
            <Route
              path="/reports"
              element={
                <ReportFilter
                  heroTitle="Performance reports"
                  heroSubtitle="Filter by team and date range, then scan the summary cards and detailed report blocks with less visual noise."
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
