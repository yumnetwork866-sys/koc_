import React from 'react';
import LegalPage from '../../components/LegalPage';
import { PrivacyContent } from './legalContent';

const PrivacyPage = () => {
  return (
    <LegalPage title="Privacy Policy" updatedAt="June 26, 2026">
      <PrivacyContent />
    </LegalPage>
  );
};

export default PrivacyPage;

