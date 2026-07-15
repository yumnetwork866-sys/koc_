import React from 'react';
import LegalPage from '../../components/LegalPage';
import { PrivacyContent } from './legalContent';

const PrivacyPage = () => {
  return (
    <LegalPage title="Yumnetwork Privacy Policy" updatedAt="July 1, 2026">
      <PrivacyContent />
    </LegalPage>
  );
};

export default PrivacyPage;
