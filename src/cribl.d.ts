// Globals the Cribl shell sets on `window` when the app runs inside Cribl.
// They are read-only and absent in a plain browser tab: never define them here.
export {};

declare global {
  interface Window {
    /** Base URL for Cribl API calls, e.g. `https://…/api/v1`. */
    readonly CRIBL_API_URL?: string;
    /** Where the app is mounted, e.g. `/app-ui/pixel-open`. */
    readonly CRIBL_BASE_PATH?: string;
    /** The signed-in Cribl user (memoized by the platform). */
    readonly getCriblUser?: () => Promise<{
      id: string;
      username: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      initials?: string;
    }>;
  }
}
