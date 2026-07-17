import React from 'react';
import LegalPage from '../../components/LegalPage';
import { TermsContent, TermsContentVi } from './legalContent';
import { useI18n } from '../../lib/language';

const TermsPage = () => {
  const { t, isVietnamese } = useI18n();
  return (
    <LegalPage title={t('legal.termsTitle')} updatedAt={t('legal.updatedAt')}>
      {isVietnamese ? <TermsContentVi /> : <TermsContent />}
    </LegalPage>
  );
};

export default TermsPage;
