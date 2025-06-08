import * as os from 'os';

export class DebugConfig {
    private static _instance: DebugConfig;
    
    static getInstance(): DebugConfig {
        if (!DebugConfig._instance) {
            DebugConfig._instance = new DebugConfig();
        }
        return DebugConfig._instance;
    }

    getCurrentUser(): string {
        return os.userInfo().username || 'unknown-user';
    }

    getCurrentTimestamp(): string {
        return new Date().toISOString().slice(0, 19).replace('T', ' ');
    }

    getFormattedTime(): string {
        return new Date().toISOString();
    }
}

// Export convenience functions
export const getCurrentUser = () => DebugConfig.getInstance().getCurrentUser();
export const getCurrentTimestamp = () => DebugConfig.getInstance().getCurrentTimestamp();
export const getFormattedTime = () => DebugConfig.getInstance().getFormattedTime();