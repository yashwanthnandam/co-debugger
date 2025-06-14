import { DataStructureHandler, SimplificationOptions, SimplifiedValue } from './dataStructureHandler';
import { LanguageHandler } from '../languages/languageHandler';

export class CoDataStructureHandler extends DataStructureHandler {
    private languageHandler: LanguageHandler;

    constructor(languageHandler: LanguageHandler) {
        super();
        this.languageHandler = languageHandler;
        console.log(`🌍 Co Data Structure Handler initialized for ${languageHandler.language} at 2025-06-13 04:11:03`);
    }

    simplifyValue(
        rawValue: string, 
        typeName: string, 
        options: Partial<SimplificationOptions> = {}
    ): SimplifiedValue {
        // Use language-specific defaults
        const languageDefaults = this.getLanguageSpecificDefaults();
        const mergedOptions = { ...languageDefaults, ...options };
        
        console.log(`🔍 Simplifying ${this.languageHandler.language} value: ${typeName} at 2025-06-13 04:11:03`);
        
        // Use parent implementation with language-aware options
        return super.simplifyValue(rawValue, typeName, mergedOptions);
    }

    private getLanguageSpecificDefaults(): Partial<SimplificationOptions> {
        const config = this.languageHandler.getDefaultConfig();
        
        return {
            maxDepth: config.maxVariableDepth,
            maxStringLength: config.maxVariableValueLength,
            maxArrayLength: this.getLanguageSpecificArrayLength(),
            maxObjectKeys: this.getLanguageSpecificObjectKeys(),
            expandKnownTypes: this.getLanguageSpecificKnownTypes(),
            preserveBusinessFields: this.languageHandler.patterns.applicationPatterns,
            showPointerAddresses: this.languageHandler.language === 'go', // Only Go shows pointers
            enableLazyExpansion: true,
            memoryLimit: config.memoryLimitMB,
            truncateThreshold: this.getLanguageSpecificTruncateThreshold()
        };
    }

    private getLanguageSpecificArrayLength(): number {
        switch (this.languageHandler.language) {
            case 'go': return 50;
            case 'python': return 30;
            case 'javascript':
            case 'typescript': return 25;
            default: return 20;
        }
    }

    private getLanguageSpecificObjectKeys(): number {
        switch (this.languageHandler.language) {
            case 'go': return 50;
            case 'python': return 40;
            case 'javascript':
            case 'typescript': return 35;
            default: return 30;
        }
    }

    private getLanguageSpecificKnownTypes(): string[] {
        return this.languageHandler.patterns.complexTypes;
    }

    private getLanguageSpecificTruncateThreshold(): number {
        switch (this.languageHandler.language) {
            case 'go': return 2000;
            case 'python': return 2500;
            case 'javascript':
            case 'typescript': return 3000;
            default: return 2000;
        }
    }

    // Override key methods to use language handler
    protected isPrimitiveType(typeName: string): boolean {
        return this.languageHandler.isPrimitiveType(typeName);
    }

    protected isCollectionType(value: string, typeName: string): boolean {
        return this.languageHandler.isCollectionType(value, typeName);
    }

    protected isStructuredType(value: string, typeName: string): boolean {
        return this.languageHandler.isStructuredType(value, typeName);
    }

    protected isNilValue(rawValue: string): boolean {
        return this.languageHandler.isNilValue(rawValue);
    }

    protected parseStructFields(rawValue: string): Record<string, string> {
        return this.languageHandler.parseStructFields(rawValue);
    }

    protected parseArrayElements(rawValue: string): string[] {
        return this.languageHandler.parseArrayElements(rawValue);
    }

    protected calculateVariableImportance(name: string, value: string): number {
        return this.languageHandler.calculateVariableImportance(name, value);
    }

    protected formatDisplayValue(value: string, type: string): string {
        return this.languageHandler.formatDisplayValue(value, type);
    }

    protected inferFieldType(fieldName: string, value: string): string {
        return this.languageHandler.inferType(fieldName, value, { variableName: fieldName });
    }

    protected inferElementType(element: string, containerType: string): string {
        // Language-specific element type inference
        if (this.languageHandler.language === 'go') {
            const match = containerType.match(/\[\](.+)/);
            if (match) return match[1];
        } else if (this.languageHandler.language === 'python') {
            if (containerType === 'list' || containerType === 'tuple') {
                return this.languageHandler.inferType('element', element, { variableName: 'element' });
            }
        } else if (this.languageHandler.language === 'javascript' || this.languageHandler.language === 'typescript') {
            if (containerType === 'Array') {
                return this.languageHandler.inferType('element', element, { variableName: 'element' });
            }
        }
        
        return this.languageHandler.inferType('element', element, { variableName: 'element' });
    }

    getLanguageHandler(): LanguageHandler {
        return this.languageHandler;
    }

    getLanguageSpecificConfig(): any {
        return {
            language: this.languageHandler.language,
            patterns: this.languageHandler.patterns,
            config: this.languageHandler.getDefaultConfig(),
            defaults: this.getLanguageSpecificDefaults()
        };
    }
}