import React from 'react';
import EmployeeTable from './EmployeeTable';
import ChannelManagement from './ChannelManagement';

const ManagementHub = () => {
  return (
    <div className="page">
      <div className="hub-stack">
        <EmployeeTable
          heroTitle="User management"
        />
        <ChannelManagement
          heroTitle="Channel management"
        />
      </div>
    </div>
  );
};

export default ManagementHub;
