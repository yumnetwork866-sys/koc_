import React from 'react';
import LegalPage from '../../components/LegalPage';
import { TermsContent } from './legalContent';

const TermsPage = () => {
  return (
    <LegalPage title="Yumnetwork Terms of Service" updatedAt="July 1, 2026">
      <TermsContent />
    </LegalPage>
  );
};

export default TermsPage;
