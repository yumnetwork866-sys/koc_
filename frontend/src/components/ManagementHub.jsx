import React from 'react';
import EmployeeTable from './EmployeeTable';
import ChannelManagement from './ChannelManagement';

const ManagementHub = () => {
  return (
    <div className="page">
      <div className="hub-stack">
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
