import React from 'react';

/** Monograma geométrico naranja "A" en la parte superior del sidebar (fiel a la referencia). */
export const AdrianLogoA: React.FC<{ size?: number }> = ({ size = 30 }) => (
  <svg width={size} height={size} viewBox="0 0 36 36" fill="none" aria-hidden="true">
    <path
      d="M14.5 5H21.5L32 31H24.6L22.3 25H13.7L11.4 31H4L14.5 5ZM15.8 19.3H20.2L18 13.1L15.8 19.3Z"
      fill="#FF8733"
    />
  </svg>
);

/** Emblema geométrico entrelazado central de la pantalla de bienvenida (estilo Cognivo). */
export const AdrianCenterEmblem: React.FC<{ size?: number }> = ({ size = 46 }) => (
  <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <rect x="20" y="5" width="7" height="22" rx="1.2" fill="#FF8733" />
    <rect x="27" y="13" width="14" height="6.5" rx="1.2" fill="#FF8733" />
    <rect x="7" y="16" width="21" height="6.5" rx="1.2" fill="#FF8733" />
    <rect x="21" y="21" width="7" height="22" rx="1.2" fill="#FF8733" />
    <rect x="12" y="26" width="16" height="6.5" rx="1.2" fill="#FF8733" />
    <rect x="28" y="28" width="11" height="6.5" rx="1.2" fill="#FF8733" />
  </svg>
);

/** Ícono sutil de pulso para el pie de bienvenida. */
export const AdrianPulseIcon: React.FC<{ size?: number }> = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#FF8733" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="2 12 6 12 9 4 13 20 16 12 22 12" />
  </svg>
);
