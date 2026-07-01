import React from 'react';
import LegalPage from '../../components/LegalPage';
import { DataDeletionContent } from './legalContent';

const DataDeletionPage = () => {
  return (
    <LegalPage title="Data Deletion" updatedAt="July 1, 2026">
      <DataDeletionContent />
    </LegalPage>
  );
};

export default DataDeletionPage;
