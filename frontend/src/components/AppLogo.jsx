import React from 'react';

const AppLogo = ({ className = '', size = 'md', alt = 'YUM Network' }) => {
  const classes = ['app-logo', `app-logo--${size}`, className].filter(Boolean).join(' ');

  return <img src="/favicon.png" alt={alt} className={classes} />;
};

export default AppLogo;
