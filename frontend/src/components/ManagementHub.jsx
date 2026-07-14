import React from 'react';
import EmployeeTable from './EmployeeTable';
import ChannelManagement from './ChannelManagement';

const ManagementHub = () => {
  return (
    <div className="hub-stack">
      <EmployeeTable
        heroTitle="Quản lý người dùng"
      />
      <ChannelManagement
        heroTitle="Channel management"
      />
    </div>
  );
};

export default ManagementHub;
