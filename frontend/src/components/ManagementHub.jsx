import React from 'react';
import TeamManagement from './TeamManagement';
import EmployeeTable from './EmployeeTable';
import ChannelManagement from './ChannelManagement';

const ManagementHub = () => {
  return (
    <div className="page">
      <div className="hub-stack">
        <TeamManagement
          heroTitle="Team management"
          heroSubtitle="Tạo và kiểm soát các team Content MKT, Content AI, Tin tức để dashboard tính KPI đúng ownership."
        />
        <EmployeeTable
          heroTitle="User management"
          heroSubtitle="Quản lý admin, leader và member trước khi leader gắn video cho từng người."
        />
        <ChannelManagement
          heroTitle="Channel management"
          heroSubtitle="Thêm kênh bằng OAuth, import file hoặc crawler public theo username."
        />
      </div>
    </div>
  );
};

export default ManagementHub;
