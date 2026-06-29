// src/utils/logger.ts

/**
 * Sentinel Logger - System "Auto-Nadzoru"
 * Zapewnia rygorystyczne logowanie działań (działa/nie działa/błąd) z pominięciem "cichych" pochłaniaczy błędów.
 */
export class SentinelLogger {
  /**
   * Rejestruje rozpoczęcie operacji
   */
  static start(moduleName: string, action: string, details?: any) {
    console.log(`⏳ [RUNNING] [${moduleName}] ${action}`, details ? JSON.stringify(details) : '');
  }

  /**
   * Rejestruje sukces operacji
   */
  static success(moduleName: string, action: string, details?: any) {
    console.log(`✅ [SUCCESS] [${moduleName}] ${action}`, details ? JSON.stringify(details) : '');
  }

  /**
   * Rejestruje błąd i zachowuje stack trace (Red Line Protection)
   */
  static error(moduleName: string, action: string, error: unknown) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`🚨 [ERROR] [${moduleName}] ${action}:`, errorMsg, error);
  }
}
