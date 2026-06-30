import React from 'react';
import LegalPage from '../../components/LegalPage';
import { TermsContent } from './legalContent';

const TermsPage = () => {
  return (
    <LegalPage title="Terms of Service" updatedAt="June 26, 2026">
      <TermsContent />
    </LegalPage>
  );
};

export default TermsPage;

