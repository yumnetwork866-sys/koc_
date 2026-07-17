import React from 'react';
import LegalPage from '../../components/LegalPage';
import { DataDeletionContent, DataDeletionContentVi } from './legalContent';
import { useI18n } from '../../lib/language';

const DataDeletionPage = () => {
  const { t, isVietnamese } = useI18n();
  return (
    <LegalPage title={t('legal.deletionTitle')} updatedAt={t('legal.updatedAt')}>
      {isVietnamese ? <DataDeletionContentVi /> : <DataDeletionContent />}
    </LegalPage>
  );
};

export default DataDeletionPage;
