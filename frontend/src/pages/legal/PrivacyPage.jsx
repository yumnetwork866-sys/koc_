import React from 'react';
import LegalPage from '../../components/LegalPage';
import { PrivacyContent, PrivacyContentVi } from './legalContent';
import { useI18n } from '../../lib/language';

const PrivacyPage = () => {
  const { t, isVietnamese } = useI18n();
  return (
    <LegalPage title={t('legal.privacyTitle')} updatedAt={t('legal.updatedAt')}>
      {isVietnamese ? <PrivacyContentVi /> : <PrivacyContent />}
    </LegalPage>
  );
};

export default PrivacyPage;
