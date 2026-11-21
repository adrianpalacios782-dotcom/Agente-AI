import type { MemoryItem } from '../memory/types.js';

export type ComplianceVerdict = 'LISTO' | 'CORREGIR' | 'NO PUBLICAR';

export interface ComplianceFinding {
  severity: 'NO PUBLICAR' | 'CORREGIR';
  code: string;
  message: string;
}

export interface ComplianceInput {
  draftText: string;
  entityKey?: string;
  usesRealProductPhoto?: boolean;
  hasImageAndLogoPermissions?: boolean;
  commercialLicenseVerified?: boolean;
  musicLicenseVerified?: boolean;
  syntheticContentDisclosed?: boolean;
  checkedOnMobile?: boolean;
}

export interface ComplianceReport {
  verdict: ComplianceVerdict;
  findings: ComplianceFinding[];
  manualChecksRequired: string[];
  summary: string;
}

const PRICE_OR_PROMO_REGEX = /(?:Bs\.?\s*\d+|\$\s*\d+|USD\s*\d+|\d+\s*%|\b(?:gratis|descuento|oferta|promoción|2x1|50%|garantizado|certificado|100%)\b)/gi;
const BIG_CAP_REGEX = /\bbig\s*cap\b/i;
const PRIVATE_TOKEN_REGEX = /(?:AIza[0-9A-Za-z_-]{20,}|sk-[0-9A-Za-z]{20,}|eyJ[0-9A-Za-z_-]{20,}\.)/;
const PLACEHOLDER_REGEX = /\[(?:DATO FALTANTE|PRODUCTO|PRECIO|CONTACTO|NEGOCIO)[^\]]*\]/i;

/**
 * Semáforo de Calidad automatizado (Creative AI Business + reglas de BIMCAT S.R.L.).
 * Cruza un borrador publicitario contra los recuerdos CONFIRMADOS de la entidad.
 */
export function evaluateBrandCompliance(
  input: ComplianceInput,
  confirmedMemories: MemoryItem[],
): ComplianceReport {
  const findings: ComplianceFinding[] = [];
  const manualChecksRequired: string[] = [];
  const entity = (input.entityKey || 'bimcat_srl').toLowerCase();
  const text = input.draftText;

  const confirmedCorpus = confirmedMemories
    .filter((m) => m.state === 'confirmed' && (m.entityKey.toLowerCase() === entity || m.namespace === 'company'))
    .map((m) => `${m.title} ${m.content}`)
    .join('\n')
    .toLowerCase();

  // 1. Error crítico de identidad (BIG CAP residual)
  if (BIG_CAP_REGEX.test(text)) {
    findings.push({
      severity: 'NO PUBLICAR',
      code: 'WRONG_ENTITY_NAME',
      message: 'El texto menciona "BIG CAP". La única entidad confirmada es BIMCAT S.R.L.',
    });
  }

  // 2. Exposición accidental de credenciales o tokens
  if (PRIVATE_TOKEN_REGEX.test(text)) {
    findings.push({
      severity: 'NO PUBLICAR',
      code: 'CONFIDENTIAL_TOKEN_LEAK',
      message: 'El borrador parece contener una clave API o token confidencial.',
    });
  }

  // 3. Marcadores sin completar
  if (PLACEHOLDER_REGEX.test(text)) {
    findings.push({
      severity: 'NO PUBLICAR',
      code: 'UNRESOLVED_PLACEHOLDER',
      message: 'Quedan marcadores sin rellenar (p. ej. [DATO FALTANTE A CONFIRMAR]).',
    });
  }

  // 4. Precios, descuentos o promesas absolutas no confirmadas en memoria
  const promoMatches = [...new Set(text.match(PRICE_OR_PROMO_REGEX) ?? [])];
  for (const match of promoMatches) {
    if (!confirmedCorpus.includes(match.toLowerCase())) {
      findings.push({
        severity: 'NO PUBLICAR',
        code: 'UNVERIFIED_COMMERCIAL_CLAIM',
        message: `Mención comercial "${match}" no consta en la memoria CONFIRMADA de ${entity}. Verifícala con Adrián antes de usarla.`,
      });
    }
  }

  // 5. Permisos, licencias y calidad operativa (Creative AI Business checklist)
  if (input.hasImageAndLogoPermissions === false) {
    findings.push({
      severity: 'NO PUBLICAR',
      code: 'MISSING_MEDIA_PERMISSIONS',
      message: 'No existen permisos confirmados para las imágenes o logotipos incluidos.',
    });
  } else if (input.hasImageAndLogoPermissions === undefined) {
    manualChecksRequired.push('Confirmar permisos de uso para todas las imágenes y logotipos.');
  }

  if (input.commercialLicenseVerified === false) {
    findings.push({
      severity: 'CORREGIR',
      code: 'UNVERIFIED_TOOL_LICENSE',
      message: 'Falta comprobar que el plan/herramienta de IA permite uso comercial de la pieza.',
    });
  } else if (input.commercialLicenseVerified === undefined) {
    manualChecksRequired.push('Comprobar términos vigentes de uso comercial de la herramienta de IA utilizada.');
  }

  if (input.musicLicenseVerified === false) {
    findings.push({
      severity: 'CORREGIR',
      code: 'UNVERIFIED_MUSIC_LICENSE',
      message: 'La música del video/reel no tiene licencia comercial verificada.',
    });
  }

  if (input.usesRealProductPhoto === false) {
    findings.push({
      severity: 'CORREGIR',
      code: 'SYNTHETIC_PRODUCT_FIDELITY',
      message: 'Si se anuncia un producto físico real, usa una fotografía auténtica o aclara que la imagen es referencial.',
    });
  }

  if (input.syntheticContentDisclosed === false) {
    findings.push({
      severity: 'CORREGIR',
      code: 'SYNTHETIC_DISCLOSURE',
      message: 'Identifica el contenido sintético cuando pueda inducir a confusión al cliente.',
    });
  }

  if (input.checkedOnMobile !== true) {
    manualChecksRequired.push('Revisar legibilidad, recortes y zonas seguras en pantalla de teléfono móvil.');
  }

  manualChecksRequired.push('Verificar personalmente que el producto, contacto y vigencia correspondan a la oferta real.');

  const hasBlock = findings.some((f) => f.severity === 'NO PUBLICAR');
  const hasWarn = findings.some((f) => f.severity === 'CORREGIR');
  const verdict: ComplianceVerdict = hasBlock ? 'NO PUBLICAR' : hasWarn ? 'CORREGIR' : 'LISTO';

  const summary =
    verdict === 'LISTO'
      ? '🟢 LISTO: sin hallazgos bloqueantes contra la memoria confirmada; completa las comprobaciones manuales antes de publicar.'
      : verdict === 'CORREGIR'
        ? `🟡 CORREGIR: se detectaron ${findings.length} ajuste(s) necesarios antes de aprobar la pieza.`
        : `🔴 NO PUBLICAR: se detectaron ${findings.filter((f) => f.severity === 'NO PUBLICAR').length} bloqueo(s) críticos.`;

  return { verdict, findings, manualChecksRequired, summary };
}
