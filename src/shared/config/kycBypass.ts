/**
 * KYC pausado temporalmente en toda la app mientras se estabilizan los flujos.
 * Se mantiene el archivo para reactivarlo luego sin tocar todos los imports.
 */

/** Mientras KYC esté pausado, ningún usuario se bloquea por esta verificación. */
export function isKycDisabledGlobally(): boolean {
  return true;
}

export function shouldBypassKyc(_email: string | undefined | null): boolean {
  return true;
}
