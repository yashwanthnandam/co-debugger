export type SupportedLanguage = 'go' | 'python' | 'javascript' | 'typescript' | 'java' | 'cpp' | 'csharp';

export interface TypeContext {
    scopeName?: string;
    parentType?: string;
    variableName: string;
}

export interface ParsedValue {
    displayValue: string;
    actualValue: any;
    isExpandable: boolean;
    isNil: boolean;
    isPointer: boolean;
    memoryAddress?: string;
    objectKeyCount?: number;
    arrayLength?: number;
}

export interface LanguagePatterns {
    applicationPatterns: string[];
    systemPatterns: string[];
    controlFlowPatterns: string[];
    primitiveTypes: string[];
    complexTypes: string[];
}

export interface LanguageHandler {
    readonly language: SupportedLanguage;
    readonly patterns: LanguagePatterns;
    
    // Type inference and parsing
    inferType(name: string, value: string, context: TypeContext): string;
    parseVariableValue(value: string, type: string): ParsedValue;
    extractFunctionName(rawName: string): string;
    
    // Variable classification
    isSystemVariable(name: string, value: string): boolean;
    isApplicationRelevant(name: string, value: string): boolean;
    isControlFlowVariable(name: string): boolean;
    isPrimitiveType(typeName: string): boolean;
    isCollectionType(value: string, typeName: string): boolean;
    isStructuredType(value: string, typeName: string): boolean;
    
    // Data structure parsing
    parseStructFields(rawValue: string): Record<string, string>;
    parseArrayElements(rawValue: string): string[];
    isNilValue(rawValue: string): boolean;
    
    // Language-specific formatting
    formatDisplayValue(value: string, type: string): string;
    calculateVariableImportance(name: string, value: string): number;
    
    // Configuration
    getDefaultConfig(): LanguageSpecificConfig;
}

export interface LanguageSpecificConfig {
    maxVariableDepth: number;
    maxVariableValueLength: number;
    maxParameterCount: number;
    enableTypeInference: boolean;
    enableDeepExpansion: boolean;
    memoryLimitMB: number;
    enableAsyncAnalysis?: boolean;
    analyzeClosures?: boolean;
    enablePrototypeChain?: boolean;
}